#!/usr/bin/env node
'use strict';
/**
 * PostToolUseFailure hook — 工具失敗監控
 *
 * 觸發：工具在平台層級失敗時（工具無法執行，非應用層級錯誤）
 *
 * 薄殼：業務邏輯已移至 scripts/lib/post-use-failure-handler.js
 */

const { safeReadStdin, safeRun } = require('../../../scripts/lib/hook-utils');

if (require.main === module) safeRun(() => {
  const input = safeReadStdin();
  const handler = require('../../../scripts/lib/post-use-failure-handler');
  const { output } = handler.handlePostUseFailure(input);
  process.stdout.write(JSON.stringify(output));
  process.exit(0);
}, { result: '' });

module.exports = {};
