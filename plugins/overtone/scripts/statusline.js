#!/usr/bin/env node
'use strict';
/**
 * statusline.js — CLI 底部 Status Line
 *
 * 由 Claude Code settings.json 的 statusLine 設定呼叫。
 * 讀取 stdin JSON → 格式化輸出。
 *
 * 輸出格式（有 active subagent）：
 *   Line 1:  💻 developer  │  快速
 *   Line 2:  ctx 45%  │  12.3MB  │  ♻️ 2a 1m
 *
 * 輸出格式（workflow 全部完成或無 workflow）：
 *   Line 1:  ctx 45%  │  12.3MB
 *
 * 效能要求：< 100ms（純本地讀取，無網路呼叫）
 */

const { readFileSync, statSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const { formatSize } = require('./lib/utils');

// ── 路徑常數 ──

const OVERTONE_HOME = join(homedir(), '.overtone');
const SESSIONS_DIR = join(OVERTONE_HOME, 'sessions');
const REGISTRY_DATA_PATH = join(__dirname, 'lib', 'registry-data.json');

// ── ANSI 色碼（適配亮/暗色終端）──

const ANSI = {
  reset:  '\x1b[0m',
  dim:    '\x1b[2m',           // 分隔符用
  cyan:   '\x1b[36m',          // 標籤用（ctx, ♻️）
  yellow: '\x1b[33m',          // 警告（65%+）
  red:    '\x1b[91m',          // 危險（80%+）
};

// ── Workflow 模式中文標籤 ──

const WORKFLOW_LABELS = {
  'single':        '單步',
  'quick':         '快速',
  'standard':      '標準',
  'full':          '完整',
  'secure':        '安全',
  'tdd':           '測試驅動',
  'debug':         '除錯',
  'refactor':      '重構',
  'review-only':   '審查',
  'security-only': '安全掃描',
  'build-fix':     '修構建',
  'e2e-only':      'E2E',
  'diagnose':      '診斷',
  'clean':         '清理',
  'db-review':     'DB審查',
  'product':       '產品',
  'product-full':  '產品完整',
  'discovery':     '探索',
};

// ── 格式化工具 ──

/**
 * 格式化百分比，超過閾值加色
 * @param {number|null} pct  - 百分比（0-100）
 * @param {number} warnAt    - 黃色閾值（含）
 * @param {number} dangerAt  - 紅色閾值（含）
 * @returns {string}
 */
function colorPct(pct, warnAt, dangerAt) {
  if (pct === null || pct === undefined || isNaN(pct)) return '--';
  const str = `${Math.round(pct)}%`;
  if (pct >= dangerAt) return `${ANSI.red}${str}${ANSI.reset}`;
  if (pct >= warnAt)   return `${ANSI.yellow}${str}${ANSI.reset}`;
  return str;
}

// ── 資料讀取 ──

/**
 * 讀取 workflow.json
 * @param {string} sessionId
 * @returns {object|null}
 */
function readWorkflow(sessionId) {
  try {
    const p = join(SESSIONS_DIR, sessionId, 'workflow.json');
    return JSON.parse(readFileSync(p, 'utf8'));
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
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return { auto: 0, manual: 0 };
  }
}

/**
 * 取得 transcript 檔案大小
 * @param {string|undefined} transcriptPath - stdin 提供的 transcript_path
 * @returns {number|null}
 */
function getTranscriptSize(transcriptPath) {
  try {
    if (!transcriptPath) return null;
    return statSync(transcriptPath).size;
  } catch {
    return null;
  }
}

/**
 * 讀取 registry-data.json 的 stages 定義
 * @returns {object}
 */
function loadRegistryStages() {
  try {
    return JSON.parse(readFileSync(REGISTRY_DATA_PATH, 'utf8')).stages || {};
  } catch {
    return {};
  }
}

// ── Agent 顯示邏輯 ──

/**
 * 從 workflow.json 的 stages.status 解析 agent 顯示字串
 *
 * 信號源：workflow.json 的 stages.status==='active'
 *
 * 無 active agent 時回傳 null（隱藏 Line 1）。
 *
 * @param {object|null} workflow     - workflow.json 內容
 * @param {object} registryStages
 * @returns {string|null}
 */
function buildAgentDisplay(workflow, registryStages) {
  if (!workflow) return null;

  const stages = workflow.stages || {};

  const activeEntries = Object.entries(stages).filter(([, s]) => s.status === 'active');

  if (activeEntries.length === 1) {
    const [key] = activeEntries[0];
    const base = key.split(':')[0];
    const def = registryStages[base] || {};
    return `${def.emoji || ''} ${def.agent || base}`;
  }

  if (activeEntries.length > 1) {
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
      parts.push(count > 1 ? `${emoji} ${agent} × ${count}` : `${emoji} ${agent}`);
    }
    return parts.join(' + ');
  }

  return null;
}

// ── 主函式 ──

function main() {
  // 讀取 stdin
  let input = {};
  try {
    const raw = readFileSync('/dev/stdin', 'utf8');
    if (raw.trim()) input = JSON.parse(raw);
  } catch {
    // stdin 讀取失敗，用空物件繼續
  }

  const sessionId = (input.session_id || '').trim();

  // ── 從 stdin 取得資料 ──

  const ctxUsed = typeof input?.context_window?.used_percentage === 'number'
    ? input.context_window.used_percentage
    : null;

  const transcriptSize = getTranscriptSize(input.transcript_path);

  // ── 讀取 workflow 狀態 ──

  const workflow = sessionId ? readWorkflow(sessionId) : null;
  const compactCount = sessionId ? readCompactCount(sessionId) : { auto: 0, manual: 0 };
  const registryStages = loadRegistryStages();

  // ── 分隔符 ──

  const SEP = `${ANSI.dim}  │  ${ANSI.reset}`;

  // ── Metrics 元素 ──

  const ctxStr  = `${ANSI.cyan}ctx${ANSI.reset} ${colorPct(ctxUsed, 65, 80)}`;
  const sizeStr = formatSize(transcriptSize);

  // ── 判斷是否有 active agent ──

  const agentDisplay = buildAgentDisplay(workflow, registryStages);

  if (agentDisplay) {
    // 有 active subagent → 雙行
    const workflowType = workflow?.workflowType || '';
    const modeLabel = WORKFLOW_LABELS[workflowType] || workflowType;

    // Line 1: agent 放前面，模式放後面
    const line1Parts = [agentDisplay];
    if (modeLabel) line1Parts.push(modeLabel);
    const line1 = `  ${line1Parts.join(SEP)}`;

    // Line 2: ctx + size + compact
    const compactStr = `${ANSI.cyan}♻️${ANSI.reset} ${compactCount.auto || 0}a ${compactCount.manual || 0}m`;
    const line2 = `  ${[ctxStr, sizeStr, compactStr].join(SEP)}`;

    process.stdout.write(line1 + '\n' + line2 + '\n');
  } else if (workflow) {
    // 有 workflow 但 main agent 在工作 → 單行 metrics + compact
    const compactStr = `${ANSI.cyan}♻️${ANSI.reset} ${compactCount.auto || 0}a ${compactCount.manual || 0}m`;
    const line = `  ${[ctxStr, sizeStr, compactStr].join(SEP)}`;
    process.stdout.write(line + '\n');
  } else {
    // 無 workflow → 單行 metrics
    const line = `  ${[ctxStr, sizeStr].join(SEP)}`;
    process.stdout.write(line + '\n');
  }
}

// ── 執行（安靜退出，不顯示錯誤在 status line）──

try {
  main();
} catch {
  // 任何失敗都安靜退出
  process.exit(0);
}
