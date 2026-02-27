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
 *   wording_mismatch   — .md 文件 emoji-關鍵詞強度不匹配
 *
 * V2 預留：
 *   user_corrections   — 使用者糾正後的行為改變
 *   repeated_workflows — 重複工作流序列
 *
 * Hook 不阻擋工具執行（觀察模式，靜默處理錯誤）。
 */

const instinct = require('../../../scripts/lib/instinct');
const fs = require('fs');

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

  const sessionId = input.session_id || process.env.CLAUDE_SESSION_ID;
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
        result: `[Overtone 措詞檢查] 偵測到 emoji-關鍵詞不匹配（${filePath}）：\n${wordingWarnings.join('\n')}\n參考：docs/reference/wording-guide.md`,
      };
      process.stdout.write(JSON.stringify(output));
      process.exit(0);
    }
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

// ── Pattern 3：措詞不匹配偵測 ──

/**
 * 三個 emoji-關鍵詞不匹配規則
 * - 💡（軟引導）不應搭配強制關鍵字（MUST/ALWAYS/NEVER）
 * - 📋（強規則）不應搭配建議關鍵字（consider/may/could）
 * - ⛔（硬阻擋）不應搭配軟語氣關鍵字（should/consider/may/prefer/could）
 */
const WORDING_RULES = [
  {
    pattern: /💡\s*(MUST|ALWAYS|NEVER|MUST\s*NOT)\b/,
    emoji: '💡', level: '軟引導', matchLevel: '強規則/硬阻擋',
    suggestion: '💡 應搭配 should/prefer，強制規則請改用 📋 或 ⛔',
  },
  {
    pattern: /📋\s*(consider|may\s|could\s)/i,
    emoji: '📋', level: '強規則', matchLevel: '建議用詞',
    suggestion: '📋 應搭配 MUST/ALWAYS，建議請改用 🔧',
  },
  {
    pattern: /⛔\s*(should|consider|may\s|prefer|could\s)/i,
    emoji: '⛔', level: '硬阻擋', matchLevel: '軟引導/建議',
    suggestion: '⛔ 應搭配 NEVER/MUST NOT，軟引導請改用 💡',
  },
];

/**
 * 掃描 .md 檔案，偵測 emoji-關鍵詞不匹配的行
 * @param {string|undefined} filePath - 目標檔案路徑
 * @returns {string[]} 警告訊息陣列（空陣列表示無問題）
 */
function detectWordingMismatch(filePath) {
  // 只偵測 .md 檔案
  if (!filePath?.endsWith('.md')) return [];

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }

  const warnings = [];
  const lines = content.split('\n').slice(0, 1000); // 上限 1000 行

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 排除 Markdown 表格行（以 | 開頭），避免說明用的對照表產生誤報
    if (line.trimStart().startsWith('|')) continue;

    for (const rule of WORDING_RULES) {
      const match = line.match(rule.pattern);
      if (match) {
        warnings.push(
          `  第 ${i + 1} 行：${line.trim()}\n` +
          `  → ${rule.emoji}（${rule.level}）不應搭配「${match[1]}」（${rule.matchLevel}）。${rule.suggestion}`
        );
        break; // 每行只報告第一個問題
      }
    }
  }

  return warnings;
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

if (require.main === module) {
  main().catch(() => process.exit(0));
}

// 供測試使用
module.exports = { detectWordingMismatch, WORDING_RULES };
