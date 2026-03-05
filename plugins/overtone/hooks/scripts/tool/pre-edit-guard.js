#!/usr/bin/env node
'use strict';
// PreToolUse(Write|Edit) guard — 保護元件檔案 + MEMORY.md 行數守衛
//
// 觸發：每次 Claude 使用 Write 或 Edit 工具時
// 職責：
//   1. 阻擋直接編輯受保護的元件檔案
//   2. MEMORY.md 行數守衛（超過上限時阻擋）
//
// 受保護檔案：
//   agents/<name>.md           — Agent 定義
//   hooks/hooks.json           — Hook 設定
//   skills/<name>/SKILL.md     — Skill 定義
//   scripts/lib/registry-data.json — Registry 資料
//   .claude-plugin/plugin.json     — Plugin manifest
//
// 不攔截：
//   Node.js 腳本的 fs 操作（config-api 正常運作）
//   plugin 目錄外的檔案（MEMORY.md 除外）
//   非受保護的 plugin 檔案（commands、references 等）

const { resolve, relative } = require('path');
const { readFileSync, existsSync } = require('fs');
const { safeReadStdin, safeRun, getSessionId } = require('../../../scripts/lib/hook-utils');

// MEMORY.md 行數上限
const MEMORY_LINE_LIMIT = 200;

// Plugin 根目錄（此腳本位於 hooks/scripts/tool/，上三層）
const PLUGIN_ROOT = resolve(__dirname, '..', '..', '..');

// 受保護的檔案模式（相對於 plugin root）— deny，必須走 manage-component.js
const PROTECTED_PATTERNS = [
  {
    pattern: /^agents\/[^/]+\.md$/,
    label: 'Agent 定義',
    api: 'createAgent / updateAgent',
  },
  {
    pattern: /^hooks\/hooks\.json$/,
    label: 'Hook 設定',
    api: 'createHook / updateHook',
  },
  {
    pattern: /^skills\/[^/]+\/SKILL\.md$/,
    label: 'Skill 定義',
    api: 'createSkill / updateSkill',
  },
  {
    pattern: /^scripts\/lib\/registry-data\.json$/,
    label: 'Registry 資料',
    api: 'createAgent / updateAgent（自動同步）',
  },
  {
    pattern: /^scripts\/lib\/registry\.js$/,
    label: 'Registry SoT（核心映射）',
    api: '直接編輯（需極度謹慎，影響全系統）',
  },
  {
    pattern: /^\.claude-plugin\/plugin\.json$/,
    label: 'Plugin manifest',
    api: 'createAgent（自動同步）',
  },
];

// 閉環提示模式（不阻擋，但注入 systemMessage 提醒檢查依賴鏈）
const CLOSEDLOOP_PATTERNS = [
  {
    pattern: /^hooks\/scripts\/.*\.js$/,
    label: 'Hook 腳本',
    hint: 'CLAUDE.md Hook 架構表、對應的 handler 模組（scripts/lib/*-handler.js）',
  },
  {
    pattern: /^commands\/.*\.md$/,
    label: 'Command 定義',
    hint: '引用的 workflow 模板（registry.js）、agent 名稱、CLAUDE.md 指令列表',
  },
  {
    pattern: /^skills\/[^/]+\/references\/.*\.md$/,
    label: 'Skill Reference',
    hint: '對應的 SKILL.md 索引描述、消費此 reference 的 agent prompt',
  },
  {
    pattern: /^skills\/[^/]+\/examples\/.*\.md$/,
    label: 'Skill Example',
    hint: '對應的 SKILL.md 索引描述',
  },
];

// ── 入口守衛 ──
if (require.main === module) {
safeRun(() => {
  const input = safeReadStdin();
  const toolInput = input.tool_input || {};
  const filePath = toolInput.file_path || '';

  if (!filePath) {
    // 無檔案路徑 → 放行
    process.stdout.write(JSON.stringify({ result: '' }));
    process.exit(0);
  }

  // 將檔案路徑轉為相對於 plugin root 的路徑
  const absPath = resolve(filePath);
  const relPath = relative(PLUGIN_ROOT, absPath);

  // ── MEMORY.md 行數守衛 ──
  // 不論是否在 plugin root 內，只要是 MEMORY.md 就檢查行數
  if (absPath.endsWith('/memory/MEMORY.md') && absPath.includes('/.claude/projects/')) {
    const toolName = input.tool_name || '';
    const limitResult = checkMemoryLineLimit(filePath, toolName, toolInput, MEMORY_LINE_LIMIT);

    if (limitResult.exceeded) {
      const message = [
        `⛔ MEMORY.md 超過 ${MEMORY_LINE_LIMIT} 行上限！（預估 ${limitResult.estimatedLines} 行）`,
        ``,
        `MEMORY.md 定位：導航索引 + 活躍決策 + 地雷避免`,
        ``,
        `✅ 可記：當前進度、架構決策、Bug patterns、用戶偏好`,
        `❌ 禁記：API 文檔、檔案清單、歷史 changelog、完整架構說明、已完成功能明細`,
        ``,
        `請先刪除低價值內容，再添加新內容。`,
        `詳細資料應查閱原始檔案（docs/、status.md、source code）。`,
      ].join('\n');

      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: message,
        },
      }));
      process.exit(0);
    }

    // 行數在限制內 → 放行
    process.stdout.write(JSON.stringify({ result: '' }));
    process.exit(0);
  }

  // 路徑不在 plugin root 內（以 .. 開頭或絕對路徑）→ 放行
  if (relPath.startsWith('..') || relPath.startsWith('/')) {
    process.stdout.write(JSON.stringify({ result: '' }));
    process.exit(0);
  }

  // 檢查是否匹配受保護模式
  const protectedInfo = checkProtected(relPath, PLUGIN_ROOT);
  if (protectedInfo) {
    const message = [
      `⛔ 不可直接編輯${protectedInfo.label}檔案！`,
      ``,
      `檔案：${relPath}`,
      `原因：直接編輯會繞過驗證，可能造成元件不一致。`,
      ``,
      `正確做法：透過 Bash 工具呼叫 manage-component.js 腳本：`,
      `  bun plugins/overtone/scripts/manage-component.js <create|update> <agent|hook|skill> [name] '<json>'`,
      ``,
      `對應 API：${protectedInfo.api}`,
      `詳見：plugins/overtone/scripts/manage-component.js --help`,
      ``,
      `📋 閉環檢查（改完後 MUST 思考）：`,
      `  1. 此元件的消費者（哪些 agent/skill 引用它）是否需要同步？`,
      `  2. 相關的 reference 索引（SKILL.md）描述是否仍然正確？`,
      `  3. docs/ 下的對應文件是否需要更新？`,
      `  4. 依賴鏈：Agent prompt ↔ Skill SKILL.md ↔ Skill reference ↔ docs/`,
    ].join('\n');

    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: message,
      },
    }));
    process.exit(0);
  }

  // ── 閉環提示（不阻擋，注入 systemMessage）──
  const closedLoopHint = checkClosedLoop(relPath, PLUGIN_ROOT);

  // ── Workflow 編碼守衛 ──
  // DEV stage 是 pending 且無 activeAgents → Main Agent 在自己寫碼（應委派 developer）
  const codeWarning = checkMainAgentCoding(input);

  // 合併提示訊息（閉環 + 編碼守衛）
  const combinedWarning = [closedLoopHint, codeWarning].filter(Boolean).join('\n\n');
  if (combinedWarning) {
    process.stdout.write(JSON.stringify({ result: combinedWarning }));
    process.exit(0);
  }

  // 不在受保護範圍 → 放行
  process.stdout.write(JSON.stringify({ result: '' }));
  process.exit(0);
}, { result: '' });
}

/**
 * 檢查檔案路徑是否為受保護的元件檔案
 * 注意：filePath 應為相對於 pluginRoot 的路徑（已做 relative 轉換）
 * @param {string} relPath - 相對於 plugin root 的路徑
 * @param {string} _pluginRoot - plugin root 路徑（保留相容性，目前未使用）
 * @returns {{ label: string, api: string }|null} 受保護時回傳物件，否則回傳 null
 */
function checkProtected(relPath, _pluginRoot) {
  if (!relPath) return null;
  for (const { pattern, label, api } of PROTECTED_PATTERNS) {
    if (pattern.test(relPath)) {
      return { label, api };
    }
  }
  return null;
}

/**
 * 檢查 MEMORY.md 寫入後的預估行數是否超出限制
 * @param {string} filePath - 檔案絕對路徑（用於判斷是否為 MEMORY.md）
 * @param {string} toolName - 工具名稱（"Write" 或 "Edit"）
 * @param {object} toolInput - 工具輸入參數
 * @param {number} limit - 行數上限
 * @returns {{ exceeded: boolean, estimatedLines: number }}
 */
function checkMemoryLineLimit(filePath, toolName, toolInput, limit) {
  const absPath = resolve(filePath);
  // 只檢查 MEMORY.md
  if (!absPath.endsWith('/memory/MEMORY.md') || !absPath.includes('/.claude/projects/')) {
    return { exceeded: false, estimatedLines: 0 };
  }

  let estimatedLines = 0;
  if (toolName === 'Write') {
    const content = (toolInput && toolInput.content) || '';
    estimatedLines = content.split('\n').length;
  } else if (toolName === 'Edit') {
    const oldStr = (toolInput && toolInput.old_string) || '';
    const newStr = (toolInput && toolInput.new_string) || '';
    let currentLines = 0;
    if (existsSync(absPath)) {
      try {
        currentLines = readFileSync(absPath, 'utf8').split('\n').length;
      } catch { currentLines = 0; }
    }
    const oldLines = oldStr.split('\n').length;
    const newLines = newStr.split('\n').length;
    estimatedLines = currentLines - oldLines + newLines;
  }

  return { exceeded: estimatedLines > limit, estimatedLines };
}

/**
 * 偵測 Main Agent 在有 active workflow 時直接編輯程式碼（入口 — 讀取 state）
 * @param {object} input - hook stdin
 * @returns {string|null} 警告 systemMessage 或 null
 */
function checkMainAgentCoding(input) {
  try {
    const sessionId = getSessionId(input);
    if (!sessionId) return null;

    const { readState } = require('../../../scripts/lib/state');
    const currentState = readState(sessionId);
    return shouldWarnMainAgentCoding(currentState);
  } catch {
    return null; // 靜默降級
  }
}

/**
 * 純判斷邏輯：workflow 有 DEV stage + DEV 未完成 + 無 activeAgents
 * → Main Agent 還沒委派 developer 就自己寫碼了
 * @param {object|null} state - workflow state
 * @returns {string|null} 警告訊息或 null
 */
function shouldWarnMainAgentCoding(state) {
  if (!state || !state.stages) return null;

  // 沒有 DEV stage → 不適用（可能是 discovery 等不含 DEV 的 workflow）
  if (!state.stages.DEV) return null;

  // DEV 已完成 → 不干預
  if (state.stages.DEV.status === 'completed') return null;

  // 有 activeAgents → 代表是 subagent（developer 等）在寫碼，放行
  const activeCount = Object.keys(state.activeAgents || {}).length;
  if (activeCount > 0) return null;

  // DEV pending/active + 無 activeAgents → Main Agent 自己寫碼
  return [
    '⚠️ 偵測到 Main Agent 直接編輯程式碼，但 DEV stage 尚未委派 developer agent。',
    '⛔ MUST 委派 `ot:developer` agent 處理程式碼變更，不要自己寫碼。',
    '💡 如果只是修改文件（docs/、README 等），可忽略此警告。',
  ].join('\n');
}

/**
 * 建立具體的閉環提示訊息，整合 dependency-graph 的受影響元件列表
 * 如果依賴圖掃描失敗，fallback 到 hint 通用文字
 * @param {string} relPath - 相對於 plugin root 的路徑
 * @param {string} pluginRoot - plugin 根目錄絕對路徑
 * @param {string} label - 元件類型標籤（如「Hook 腳本」）
 * @param {string} hint - fallback 通用提示文字
 * @returns {string} 閉環提示訊息
 */
function buildClosedLoopMessage(relPath, pluginRoot, label, hint) {
  const header = `📋 閉環提示：你正在編輯${label}（${relPath}）`;
  const footer = `   依賴鏈：Agent prompt ↔ Skill SKILL.md ↔ Skill reference ↔ docs/`;

  // 嘗試從依賴圖取得具體受影響元件
  try {
    const { buildGraph } = require('../../../scripts/lib/dependency-graph');
    const graph = buildGraph(pluginRoot);
    const { impacted } = graph.getImpacted(relPath);

    if (impacted.length > 0) {
      // 將自身也加入列表（[type] path 格式）
      const selfType = require('../../../scripts/lib/dependency-graph').inferType
        ? require('../../../scripts/lib/dependency-graph').inferType(relPath)
        : 'file';
      const lines = [
        header,
        `   改完後 MUST 檢查以下受影響元件：`,
        `   → [${selfType}] ${relPath}`,
        ...impacted.map(({ path: p, type, reason }) => `   → [${type}]  ${p}（${reason}）`),
        footer,
      ];
      return lines.join('\n');
    }
  } catch (_) {
    // 依賴圖掃描失敗，靜默降級到通用提示
  }

  // Fallback：通用文字提示
  return [
    header,
    `   改完後 MUST 檢查以下是否需要同步：`,
    `   → ${hint}`,
    footer,
  ].join('\n');
}

/**
 * 檢查檔案是否匹配閉環提示模式
 * @param {string} relPath - 相對於 plugin root 的路徑
 * @param {string} [pluginRoot] - plugin 根目錄絕對路徑（可選，傳入時啟用依賴圖整合）
 * @returns {string|null} 閉環提示 systemMessage 或 null
 */
function checkClosedLoop(relPath, pluginRoot) {
  if (!relPath) return null;
  for (const { pattern, label, hint } of CLOSEDLOOP_PATTERNS) {
    if (pattern.test(relPath)) {
      const root = pluginRoot || PLUGIN_ROOT;
      return buildClosedLoopMessage(relPath, root, label, hint);
    }
  }
  return null;
}

// ── 純函數匯出 ──
module.exports = { checkProtected, checkClosedLoop, buildClosedLoopMessage, checkMemoryLineLimit, checkMainAgentCoding, shouldWarnMainAgentCoding };
