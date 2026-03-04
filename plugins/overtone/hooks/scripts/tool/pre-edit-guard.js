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
const { safeReadStdin, safeRun } = require('../../../scripts/lib/hook-utils');

// MEMORY.md 行數上限
const MEMORY_LINE_LIMIT = 200;

// Plugin 根目錄（此腳本位於 hooks/scripts/tool/，上三層）
const PLUGIN_ROOT = resolve(__dirname, '..', '..', '..');

// 受保護的檔案模式（相對於 plugin root）
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
    pattern: /^\.claude-plugin\/plugin\.json$/,
    label: 'Plugin manifest',
    api: 'createAgent（自動同步）',
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

// ── 純函數匯出 ──
module.exports = { checkProtected, checkMemoryLineLimit };
