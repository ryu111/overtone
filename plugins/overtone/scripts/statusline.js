#!/usr/bin/env node
'use strict';
/**
 * statusline.js — CLI 底部 Status Line
 *
 * 由 Claude Code settings.json 的 statusLine 設定呼叫。
 * 讀取 stdin JSON → 格式化兩行輸出。
 *
 * 輸出格式（有 workflow）：
 *   Line 1:  quick  │  💻 DEV : developer
 *   Line 2:  ctx 45%  │  5h 42%  │  7d 18%  │  245k  │  ♻️ 0a 0m
 *
 * 輸出格式（無 workflow）：
 *   Line 1:  ctx 12%  │  5h 42%  │  7d 18%  │  45k
 *
 * 效能要求：< 100ms（大部分時間讀 cache，OAuth 呼叫在背景）
 */

const { readFileSync, writeFileSync, existsSync } = require('fs');
const { execSync } = require('child_process');
const { join } = require('path');
const { homedir } = require('os');

// ── 路徑常數 ──

const OVERTONE_HOME = join(homedir(), '.overtone');
const SESSIONS_DIR = join(OVERTONE_HOME, 'sessions');
const USAGE_CACHE_PATH = '/tmp/overtone-usage-cache.json';
const REGISTRY_DATA_PATH = join(__dirname, 'lib', 'registry-data.json');

// OAuth 快取 TTL（30 秒）
const USAGE_CACHE_TTL_MS = 30 * 1000;

// ── ANSI 色碼 ──

const ANSI = {
  reset:  '\x1b[0m',
  green:  '\x1b[2m\x1b[32m',  // 暗綠（dim green）
  yellow: '\x1b[33m',
  red:    '\x1b[91m',          // 亮紅
};

// ── 數字格式化 ──

/**
 * 格式化 token 計數為 45k / 1.2M 格式
 * @param {number} n
 * @returns {string}
 */
function formatTokens(n) {
  if (typeof n !== 'number' || isNaN(n)) return '--';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${Math.round(n / 1_000)}k`;
  return String(n);
}

/**
 * 格式化百分比數值，加入顏色
 * @param {number|null} pct  - 百分比（0-100），null 顯示 --
 * @param {number} warnAt    - 黃色閾值（含）
 * @param {number} dangerAt  - 紅色閾值（含）
 * @returns {string}
 */
function colorPct(pct, warnAt, dangerAt) {
  if (pct === null || pct === undefined || isNaN(pct)) return `${ANSI.green}--${ANSI.reset}`;
  const str = `${Math.round(pct)}%`;
  if (pct >= dangerAt)  return `${ANSI.red}${str}${ANSI.reset}`;
  if (pct >= warnAt)    return `${ANSI.yellow}${str}${ANSI.reset}`;
  return `${ANSI.green}${str}${ANSI.reset}`;
}

// ── OAuth usage 讀取 ──

/**
 * 從 macOS Keychain 取得 Claude Code access token
 * @returns {string|null}
 */
function getAccessToken() {
  try {
    const raw = execSync(
      'security find-generic-password -s "Claude Code-credentials" -w',
      { timeout: 3000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    const creds = JSON.parse(raw);
    return creds.access_token || null;
  } catch {
    return null;
  }
}

/**
 * 呼叫 OAuth usage API
 * @param {string} token
 * @returns {{ fiveHour: number|null, sevenDay: number|null }}
 */
function fetchUsage(token) {
  try {
    const response = execSync(
      `curl -s -H "Authorization: Bearer ${token}" https://api.anthropic.com/api/oauth/usage`,
      { timeout: 5000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const data = JSON.parse(response);
    const fiveHour = typeof data?.five_hour?.utilization === 'number'
      ? data.five_hour.utilization * 100
      : null;
    const sevenDay = typeof data?.seven_day?.utilization === 'number'
      ? data.seven_day.utilization * 100
      : null;
    return { fiveHour, sevenDay };
  } catch {
    return { fiveHour: null, sevenDay: null };
  }
}

/**
 * 讀取 OAuth usage（含 30s 快取）
 * @returns {{ fiveHour: number|null, sevenDay: number|null }}
 */
function getUsage() {
  // 先嘗試讀快取
  try {
    if (existsSync(USAGE_CACHE_PATH)) {
      const raw = readFileSync(USAGE_CACHE_PATH, 'utf8');
      const cache = JSON.parse(raw);
      if (Date.now() - cache.timestamp < USAGE_CACHE_TTL_MS) {
        return { fiveHour: cache.fiveHour, sevenDay: cache.sevenDay };
      }
    }
  } catch {
    // 快取損壞，繼續往下
  }

  // 快取過期或不存在，呼叫 API
  const token = getAccessToken();
  if (!token) return { fiveHour: null, sevenDay: null };

  const usage = fetchUsage(token);

  // 寫入快取（失敗時靜默）
  try {
    writeFileSync(USAGE_CACHE_PATH, JSON.stringify({
      timestamp: Date.now(),
      fiveHour: usage.fiveHour,
      sevenDay: usage.sevenDay,
    }));
  } catch {
    // 靜默
  }

  return usage;
}

// ── Workflow 狀態讀取 ──

/**
 * 讀取 workflow.json
 * @param {string} sessionId
 * @returns {object|null}
 */
function readWorkflow(sessionId) {
  try {
    const p = join(SESSIONS_DIR, sessionId, 'workflow.json');
    const raw = readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * 讀取 compact-count.json
 * @param {string} sessionId
 * @returns {{ auto: number, manual: number }}
 */
function readCompactCount(sessionId) {
  try {
    const p = join(SESSIONS_DIR, sessionId, 'compact-count.json');
    const raw = readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { auto: 0, manual: 0 };
  }
}

// ── Agent 顯示邏輯 ──

/**
 * 讀取 registry-data.json 的 stages 定義
 * @returns {object}
 */
function loadRegistryStages() {
  try {
    const raw = readFileSync(REGISTRY_DATA_PATH, 'utf8');
    return JSON.parse(raw).stages || {};
  } catch {
    return {};
  }
}

/**
 * 從 workflow.json 解析 agent 顯示字串
 *
 * 規則：
 *   - 無 active stage → 🤖 main
 *   - 單一 active → {emoji} {STAGE} : {agent}  如 💻 DEV : developer
 *   - 多個 active（並行）：
 *     - 不同 stage → {emoji} {agent} + {emoji} {agent}
 *     - 同 stage × n → {emoji} {agent} × n
 *
 * @param {object} workflow
 * @param {object} registryStages
 * @returns {string}
 */
function buildAgentDisplay(workflow, registryStages) {
  const stages = workflow.stages || {};

  // 找所有 status: "active" 的 stage
  const activeEntries = Object.entries(stages).filter(([, s]) => s.status === 'active');

  if (activeEntries.length === 0) {
    return '🤖 main';
  }

  if (activeEntries.length === 1) {
    const [key] = activeEntries[0];
    const base = key.split(':')[0];
    const def = registryStages[base] || {};
    const emoji = def.emoji || '';
    const agent = def.agent || base;
    return `${emoji} ${base} : ${agent}`;
  }

  // 多個 active（並行）
  // 按 base stage 分組
  const groups = {};
  for (const [key] of activeEntries) {
    const base = key.split(':')[0];
    groups[base] = (groups[base] || 0) + 1;
  }

  const parts = [];
  for (const [base, count] of Object.entries(groups)) {
    const def = registryStages[base] || {};
    const emoji = def.emoji || '';
    const agent = def.agent || base;
    if (count > 1) {
      parts.push(`${emoji} ${agent} × ${count}`);
    } else {
      parts.push(`${emoji} ${agent}`);
    }
  }

  return parts.join(' + ');
}

// ── 主函式 ──

function main() {
  // 讀取 stdin
  let input = {};
  try {
    const raw = readFileSync('/dev/stdin', 'utf8');
    if (raw.trim()) {
      input = JSON.parse(raw);
    }
  } catch {
    // stdin 讀取失敗，用空物件繼續
  }

  const sessionId = (input.session_id || '').trim();

  // 從 stdin 取得資料
  const ctxUsed = typeof input?.context_window?.used_percentage === 'number'
    ? input.context_window.used_percentage
    : null;
  const totalTokens = (() => {
    const inp = input?.cost?.total_input_tokens;
    const out = input?.cost?.total_output_tokens;
    if (typeof inp === 'number' && typeof out === 'number') return inp + out;
    return null;
  })();

  // 讀取 OAuth usage（快取優先）
  const usage = getUsage();

  // 讀取 workflow 狀態（若有 sessionId）
  const workflow = sessionId ? readWorkflow(sessionId) : null;
  const compactCount = sessionId ? readCompactCount(sessionId) : { auto: 0, manual: 0 };

  // 讀取 registry stages
  const registryStages = loadRegistryStages();

  // ── 組裝 Line 2（metrics 行）──

  const ctxStr   = colorPct(ctxUsed, 65, 80);
  const fiveStr  = colorPct(usage.fiveHour, 50, 80);
  const sevenStr = colorPct(usage.sevenDay, 50, 80);
  const tokStr   = totalTokens !== null
    ? `${ANSI.green}${formatTokens(totalTokens)}${ANSI.reset}`
    : `${ANSI.green}--${ANSI.reset}`;

  const SEP = `${ANSI.green}  │  ${ANSI.reset}`;

  let line2;
  if (workflow) {
    const autoCount   = compactCount.auto || 0;
    const manualCount = compactCount.manual || 0;
    const compactStr  = `${ANSI.green}♻️ ${autoCount}a ${manualCount}m${ANSI.reset}`;
    line2 = [
      `${ANSI.green}ctx ${ctxStr}`,
      `5h ${fiveStr}`,
      `7d ${sevenStr}`,
      tokStr,
      compactStr,
    ].join(SEP);
  } else {
    // 無 workflow：單行，隱藏 compact 計數
    line2 = [
      `${ANSI.green}ctx ${ctxStr}`,
      `5h ${fiveStr}`,
      `7d ${sevenStr}`,
      tokStr,
    ].join(SEP);
  }

  // ── 組裝 Line 1（workflow 行）──

  if (workflow) {
    const workflowType = workflow.workflowType || '?';
    const agentDisplay = buildAgentDisplay(workflow, registryStages);
    const line1 = `${ANSI.green}  ${workflowType}  │  ${agentDisplay}${ANSI.reset}`;
    process.stdout.write(line1 + '\n' + '  ' + line2 + '\n');
  } else {
    // 無 workflow：只輸出 metrics 單行
    process.stdout.write('  ' + line2 + '\n');
  }
}

// ── 執行（安靜退出，不顯示錯誤在 status line）──

try {
  main();
} catch {
  // 任何失敗都安靜退出
  process.exit(0);
}
