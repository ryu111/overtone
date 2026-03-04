#!/usr/bin/env node
'use strict';
/**
 * post-use.js — PostToolUse Hook
 *
 * 觀察工具使用結果，偵測 pattern 並記錄到 Instinct 系統。
 *
 * V1 偵測範圍：
 *   error_resolutions  — Bash 非零 exit code（指令失敗）
 *   tool_preferences   — Bash 中使用 grep/find/rg（反面糾正）
 *   wording_mismatch   — .md 文件 emoji-關鍵詞強度不匹配
 *
 * V2 預留：
 *   user_corrections   — 使用者糾正後的行為改變
 *   repeated_workflows — 重複工作流序列
 *
 * Hook 不阻擋工具執行（觀察模式，靜默處理錯誤）。
 */

const instinct = require('../../../scripts/lib/instinct');
const { safeReadStdin, safeRun, getSessionId } = require('../../../scripts/lib/hook-utils');
const { WORDING_RULES, detectWordingMismatch } = require('../../../scripts/lib/wording');

// ── 主流程（同步）──

if (require.main === module) safeRun(() => {
  const input = safeReadStdin();
  const startTime = Date.now();

  const sessionId = getSessionId(input);
  if (!sessionId) {
    process.stdout.write(JSON.stringify({ result: '' }));
    process.exit(0);
  }

  const toolName = input.tool_name || '';
  const toolInput = input.tool_input || {};
  const toolResponse = input.tool_response || {};

  // 輔助：emit hook:timing（失敗不影響 hook 功能）
  const emitPostUseTiming = (extra = {}) => {
    try {
      const timeline = require('../../../scripts/lib/timeline');
      timeline.emit(sessionId, 'hook:timing', {
        hook: 'post-use',
        event: 'PostToolUse',
        durationMs: Date.now() - startTime,
        toolName,
        ...extra,
      });
    } catch { /* 計時 emit 失敗不影響 hook 功能 */ }
  };

  try {
    // V1 Pattern 1：error_resolutions — Bash 非零 exit code
    if (toolName === 'Bash') {
      const errorGuard = observeBashError(sessionId, toolInput, toolResponse);
      if (errorGuard) {
        // 重大 Bash 錯誤 → 注入自我修復指令給 Main Agent
        emitPostUseTiming({ errorGuard: true });
        process.stdout.write(JSON.stringify({ result: errorGuard }));
        process.exit(0);
      }
    }
  } catch {
    // 觀察失敗靜默處理，不影響工具執行
  }

  // V1 Pattern 2：tool_preferences — 搜尋工具反面糾正（Bash 中使用 grep/find/rg）
  // 獨立於 observeBashError，exit_code=0 的 Bash grep 也記錄（不良工具選擇不以成敗區分）
  if (toolName === 'Bash') {
    const command = (toolInput.command || '').trim();
    if (command && /\b(grep|find|rg)\b/.test(command)) {
      try {
        instinct.emit(
          sessionId,
          'tool_preferences',
          `Bash 中使用 grep/find：${command.slice(0, 80)}`,
          '建議改用 Grep/Glob 工具（而非 Bash grep/find）',
          'search-tools'
        );
      } catch {
        // 觀察失敗靜默處理
      }
    }
  }

  // V1 Pattern 3：wording_mismatch — .md 文件 emoji-關鍵詞不匹配偵測
  if (toolName === 'Edit' || toolName === 'Write') {
    const filePath = toolInput.file_path;
    const wordingWarnings = detectWordingMismatch(filePath);
    if (wordingWarnings.length > 0) {
      try {
        // 記錄到 Instinct 系統
        instinct.emit(
          sessionId,
          'wording_mismatch',
          `措詞不匹配（${wordingWarnings.length} 處，${filePath}）`,
          '偵測到 emoji-關鍵詞不匹配',
          'emoji-keyword'
        );
      } catch {
        // Instinct emit 失敗靜默處理
      }
      // 輸出 systemMessage 警告
      const output = {
        result: `[Overtone 措詞檢查] 偵測到 emoji-關鍵詞不匹配（${filePath}）：\n${wordingWarnings.join('\n')}\n參考：${process.env.CLAUDE_PLUGIN_ROOT ?? 'plugins/overtone'}/skills/wording/references/wording-guide.md`,
      };
      emitPostUseTiming({ wordingMismatch: true });
      process.stdout.write(JSON.stringify(output));
      process.exit(0);
    }
  }

  emitPostUseTiming();
  process.stdout.write(JSON.stringify({ result: '' }));
  process.exit(0);
}, { result: '' });

// ── Pattern 偵測 ──

/**
 * 觀察 Bash 失敗（error_resolutions）
 * @param {string} sessionId
 * @param {object} toolInput - { command: string }
 * @param {object} toolResponse - { stdout, stderr, exit_code, ... }
 * @returns {string|null} 重大錯誤時回傳自我修復指令，否則 null
 */
function observeBashError(sessionId, toolInput, toolResponse) {
  // 取得 exit code（Claude Code 的 Bash 結果格式）
  const exitCode = toolResponse.exit_code
    ?? toolResponse.exitCode
    ?? toolResponse.returncode;

  // 非零 exit code 表示指令失敗
  if (exitCode === null || exitCode === undefined || exitCode === 0) return null;

  const command = (toolInput.command || '').trim();
  if (!command) return null;

  // 提取主要指令名稱作為 tag
  const tag = extractCommandTag(command);

  // 提取錯誤摘要（前 150 字）
  const stderr = (toolResponse.stderr || '').trim().slice(0, 150);
  const trigger = stderr
    ? `${command.slice(0, 80)}（exit ${exitCode}）: ${stderr}`
    : `${command.slice(0, 80)}（exit ${exitCode}）`;

  const action = `偵測到 ${tag} 指令失敗（exit code ${exitCode}）`;

  instinct.emit(sessionId, 'error_resolutions', trigger, action, `cmd-${tag}`);

  // 判斷是否為重大錯誤（需要自我修復介入）
  // 條件：(1) 重要工具指令 (2) 有實質 stderr (3) 非預期的輕微失敗
  const isSignificantTool = ['node', 'bun', 'npm', 'yarn', 'git', 'python', 'tsc', 'eslint', 'jest'].includes(tag);
  const hasSubstantialError = stderr.length > 20;

  if (isSignificantTool && hasSubstantialError) {
    return [
      `[Overtone 錯誤守衛] 偵測到重大 Bash 錯誤（${tag} exit ${exitCode}）`,
      `錯誤：${stderr.slice(0, 120)}`,
      '',
      '⛔ MUST NOT 用 workaround 繞過此錯誤（如硬編碼、跳過、重試相同指令）',
      '📋 MUST 立即在同一訊息並行委派：',
      `  1. debugger — 診斷根因（為什麼 ${tag} 失敗？）`,
      '  2. developer — 取得診斷結果後修復根本原因',
      '治本後才繼續主流程。',
    ].join('\n');
  }

  return null;
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

// 供測試使用
module.exports = { detectWordingMismatch, WORDING_RULES, extractCommandTag, observeBashError };
