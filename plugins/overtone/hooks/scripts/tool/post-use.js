#!/usr/bin/env node
'use strict';
/**
 * post-use.js — PostToolUse Hook
 *
 * 觀察工具使用結果，偵測 pattern 並記錄到 Instinct 系統。
 *
 * 薄殼：業務邏輯已移至 scripts/lib/post-use-handler.js
 */

const { safeReadStdin, safeRun } = require('../../../scripts/lib/hook-utils');

// ── 主流程（同步）──

if (require.main === module) safeRun(() => {
  const input = safeReadStdin();
  const handler = require('../../../scripts/lib/post-use-handler');
  const { output } = handler.handlePostUse(input);
  process.stdout.write(JSON.stringify(output));
  process.exit(0);
}, { result: '' });

// 供測試使用（從 handler 重新匯出）
const { detectWordingMismatch, WORDING_RULES, extractCommandTag, observeBashError } = require('../../../scripts/lib/post-use-handler');
module.exports = { detectWordingMismatch, WORDING_RULES, extractCommandTag, observeBashError };
