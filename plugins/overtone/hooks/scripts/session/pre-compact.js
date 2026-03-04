#!/usr/bin/env node
'use strict';
/**
 * PreCompact hook — 在 context 壓縮前注入工作流狀態恢復訊息
 *
 * 觸發：Claude Code 即將壓縮 context window 時
 *
 * 薄殼：業務邏輯已移至 scripts/lib/pre-compact-handler.js
 */

const { safeReadStdin, safeRun } = require('../../../scripts/lib/hook-utils');

// ── 入口守衛 ──
if (require.main === module) {
safeRun(() => {
  const input = safeReadStdin();
  const handler = require('../../../scripts/lib/pre-compact-handler');
  const { output } = handler.handlePreCompact(input);
  process.stdout.write(JSON.stringify(output));
  process.exit(0);
}, { result: '' });
}

// 供測試使用（從 handler 重新匯出）
const { buildCompactMessage } = require('../../../scripts/lib/pre-compact-handler');
module.exports = { buildCompactMessage };
