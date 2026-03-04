#!/usr/bin/env node
'use strict';
/**
 * Stop hook — Loop 迴圈 + 完成度檢查 + Dashboard 通知
 *
 * 觸發：Claude 要結束回覆時
 * 職責：
 *   ✅ 檢查 workflow 完成度
 *   ✅ Loop 模式：未完成時 block + 重注入 prompt
 *   ✅ 退出條件：checkbox 全完成 / /ot:stop / max iterations / 連續錯誤
 *   ✅ emit timeline 事件
 *   ✅ Dashboard 通知（透過 timeline emit → SSE file watcher 推送）
 *
 * 薄殼模式：業務邏輯全在 session-stop-handler.js
 */

const { safeReadStdin, safeRun, getSessionId } = require('../../../scripts/lib/hook-utils');

// ── 入口守衛 ──
if (require.main === module) {
  safeRun(() => {
    const input = safeReadStdin();
    const sessionId = getSessionId(input);
    const handler = require('../../../scripts/lib/session-stop-handler');
    const result = handler.handleSessionStop(input, sessionId);
    process.stdout.write(JSON.stringify(result.output));
    process.exit(0);
  }, { result: '' });
}

// ── 純函數重新匯出（保持向後相容） ──
// hook-pure-fns.test.js 等測試直接 require 此檔案取得這些函數
const { buildCompletionSummary, calcDuration, buildContinueMessage } = require('../../../scripts/lib/session-stop-handler');
module.exports = { buildCompletionSummary, calcDuration, buildContinueMessage };
