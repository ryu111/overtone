#!/usr/bin/env node
'use strict';
/**
 * PreToolUse(Task) hook — 擋跳過必要階段
 *
 * 觸發：每次 Main Agent 呼叫 Task 工具時
 * 職責：
 *   ✅ 檢查是否跳過了 workflow 中必要的前置階段
 *   ❌ 不擋順序調整（Main Agent 可能有好理由）
 *   ❌ 不擋 Main Agent 自己寫碼（由 Skill 引導）
 *
 * 薄殼：業務邏輯已移至 scripts/lib/pre-task-handler.js
 */

const { safeReadStdin, safeRun } = require('../../../scripts/lib/hook-utils');

// ── 入口守衛 ──
if (require.main === module) {
safeRun(() => {
  const input = safeReadStdin();
  const handler = require('../../../scripts/lib/pre-task-handler');
  const { output } = handler.handlePreTask(input);
  process.stdout.write(JSON.stringify(output));
  process.exit(0);
}, { result: '' });
}

// 供測試使用（從 handler 重新匯出）
const { checkSkippedStages } = require('../../../scripts/lib/pre-task-handler');
module.exports = { checkSkippedStages };
