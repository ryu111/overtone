#!/usr/bin/env node
'use strict';
/**
 * SessionStart hook — 薄殼入口
 *
 * 觸發：session 開始時
 * 職責：
 *   ✅ stdin 解析（safeReadStdin）
 *   ✅ 呼叫 session-start-handler 執行所有業務邏輯
 *   ✅ 寫 stdout + exit
 *
 * 業務邏輯已移至：plugins/overtone/scripts/lib/session-start-handler.js
 */

const { safeReadStdin, safeRun, getSessionId } = require('../../../scripts/lib/hook-utils');
const { createHookTimer } = require('../../../scripts/lib/hook-timing');

// ── 入口守衛 ──
if (require.main === module) {
  // session ID 優先從 hook stdin JSON 讀取，環境變數作為 fallback
  const input = safeReadStdin();
  const sessionId = getSessionId(input);
  const hookTimer = createHookTimer();

  safeRun(() => {
    const handler = require('../../../scripts/lib/session-start-handler');
    const result = handler.handleSessionStart(input, sessionId, hookTimer);
    process.stdout.write(JSON.stringify(result));
    process.exit(0);
  }, { result: '' });
}

// ── 純函數重新匯出（保持既有 require 相容性）──
// session-start.test.js 透過 require(on-start.js) 取得 buildBanner / buildStartOutput
const { buildBanner, buildStartOutput } = require('../../../scripts/lib/session-start-handler');
module.exports = { buildBanner, buildStartOutput };
