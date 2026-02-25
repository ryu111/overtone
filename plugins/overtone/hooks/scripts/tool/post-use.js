#!/usr/bin/env node
'use strict';
/**
 * post-use.js — PostToolUse Hook
 *
 * 觀察工具使用結果，偵測 pattern 並記錄到 Instinct 系統。
 *
 * V1 偵測範圍：
 *   error_resolutions  — Bash 非零 exit code（指令失敗）
 *   tool_preferences   — Grep/Glob 工具使用偏好
 *
 * V2 預留：
 *   user_corrections   — 使用者糾正後的行為改變
 *   repeated_workflows — 重複工作流序列
 *
 * Hook 不阻擋工具執行（觀察模式，靜默處理錯誤）。
 */

const instinct = require('../../../scripts/lib/instinct');

// ── 主流程 ──

async function main() {
  let input;
  try {
    const raw = await readStdin();
    if (!raw.trim()) process.exit(0);
    input = JSON.parse(raw);
  } catch {
    process.exit(0); // JSON 解析失敗，靜默退出
  }

  const sessionId = input.session_id;
  if (!sessionId) process.exit(0);

  const toolName = input.tool_name || '';
  const toolInput = input.tool_input || {};
  const toolResponse = input.tool_response || {};

  try {
    // V1 Pattern 1：error_resolutions — Bash 非零 exit code
    if (toolName === 'Bash') {
      observeBashError(sessionId, toolInput, toolResponse);
    }

    // V1 Pattern 2：tool_preferences — 搜尋工具選擇偏好
    if (toolName === 'Grep' || toolName === 'Glob') {
      observeSearchToolPreference(sessionId, toolName);
    }
  } catch {
    // 觀察失敗靜默處理，不影響工具執行
  }

  process.exit(0);
}

// ── Pattern 偵測 ──

/**
 * 觀察 Bash 失敗（error_resolutions）
 * @param {string} sessionId
 * @param {object} toolInput - { command: string }
 * @param {object} toolResponse - { stdout, stderr, exit_code, ... }
 */
function observeBashError(sessionId, toolInput, toolResponse) {
  // 取得 exit code（Claude Code 的 Bash 結果格式）
  const exitCode = toolResponse.exit_code
    ?? toolResponse.exitCode
    ?? toolResponse.returncode;

  // 非零 exit code 表示指令失敗
  if (exitCode === null || exitCode === undefined || exitCode === 0) return;

  const command = (toolInput.command || '').trim();
  if (!command) return;

  // 提取主要指令名稱作為 tag
  const tag = extractCommandTag(command);

  // 提取錯誤摘要（前 150 字）
  const stderr = (toolResponse.stderr || '').trim().slice(0, 150);
  const trigger = stderr
    ? `${command.slice(0, 80)}（exit ${exitCode}）: ${stderr}`
    : `${command.slice(0, 80)}（exit ${exitCode}）`;

  const action = `偵測到 ${tag} 指令失敗（exit code ${exitCode}）`;

  instinct.emit(sessionId, 'error_resolutions', trigger, action, `cmd-${tag}`);
}

/**
 * 觀察搜尋工具偏好（tool_preferences）
 * 當使用 Grep/Glob 工具時記錄偏好（相對於 Bash grep/find）
 * @param {string} sessionId
 * @param {string} toolName - 'Grep' | 'Glob'
 */
function observeSearchToolPreference(sessionId, toolName) {
  instinct.emit(
    sessionId,
    'tool_preferences',
    '搜尋/查找操作',
    `偏好使用 ${toolName} 工具（而非 Bash grep/find）`,
    'search-tools'
  );
}

// ── 輔助函式 ──

/**
 * 從指令字串提取主要工具名稱（作為 tag）
 * @param {string} command
 * @returns {string}
 */
function extractCommandTag(command) {
  // 取第一個 token（主程式名稱）
  const firstToken = command.split(/\s+/)[0].toLowerCase();

  // 規範化常見工具名稱
  const KNOWN_TOOLS = {
    npm: 'npm', npx: 'npm',
    bun: 'bun', bunx: 'bun',
    node: 'node',
    deno: 'deno',
    git: 'git',
    python: 'python', python3: 'python', pip: 'python',
    yarn: 'yarn',
    pnpm: 'pnpm',
    cargo: 'cargo', rustc: 'rust',
    go: 'go',
    docker: 'docker',
    kubectl: 'kubectl',
    brew: 'brew',
    make: 'make',
    tsc: 'typescript',
    eslint: 'eslint',
    jest: 'jest', vitest: 'jest',
  };

  return KNOWN_TOOLS[firstToken] || firstToken.replace(/[^a-z0-9-]/g, '').slice(0, 20) || 'shell';
}

/**
 * 讀取 stdin（支援管道輸入）
 * @returns {Promise<string>}
 */
function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

main().catch(() => process.exit(0));
