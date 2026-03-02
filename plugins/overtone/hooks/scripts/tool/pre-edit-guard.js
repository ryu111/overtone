#!/usr/bin/env node
'use strict';
// PreToolUse(Write|Edit) guard — 保護元件檔案
//
// 觸發：每次 Claude 使用 Write 或 Edit 工具時
// 職責：阻擋直接編輯受保護的元件檔案
// 目的：強制使用 config-api 腳本建立/更新元件，確保驗證和一致性
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
//   plugin 目錄外的檔案
//   非受保護的 plugin 檔案（commands、references 等）

const { resolve, relative } = require('path');
const { safeReadStdin, safeRun } = require('../../../scripts/lib/hook-utils');

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

  // 路徑不在 plugin root 內（以 .. 開頭或絕對路徑）→ 放行
  if (relPath.startsWith('..') || relPath.startsWith('/')) {
    process.stdout.write(JSON.stringify({ result: '' }));
    process.exit(0);
  }

  // 檢查是否匹配受保護模式
  for (const { pattern, label, api } of PROTECTED_PATTERNS) {
    if (pattern.test(relPath)) {
      const message = [
        `⛔ 不可直接編輯${label}檔案！`,
        ``,
        `檔案：${relPath}`,
        `原因：直接編輯會繞過驗證，可能造成元件不一致。`,
        ``,
        `正確做法：透過 Bash 工具呼叫 manage-component.js 腳本：`,
        `  bun plugins/overtone/scripts/manage-component.js <create|update> <agent|hook|skill> [name] '<json>'`,
        ``,
        `對應 API：${api}`,
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
  }

  // 不在受保護範圍 → 放行
  process.stdout.write(JSON.stringify({ result: '' }));
  process.exit(0);
}, { result: '' });
