#!/usr/bin/env node
'use strict';
/**
 * SessionEnd hook — Session 結束清理
 *
 * 觸發：session 結束時（clear、logout、prompt_input_exit、other）
 * 職責：
 *   ✅ 若 Stop hook 尚未處理（loop.json stopped=false），emit session:end timeline 事件
 *   ✅ 重置 loop.json 為 stopped: true
 *   ✅ 清理 ~/.overtone/.current-session-id
 *
 * 注意：若 Stop hook 已處理正常退出（stopped=true），跳過 session:end emit，避免重複。
 *
 * 薄殼模式：業務邏輯全在 session-end-handler.js
 */

const { safeReadStdin, safeRun, getSessionId } = require('../../../scripts/lib/hook-utils');

// ── 入口守衛 ──
if (require.main === module) {
  safeRun(() => {
    const input = safeReadStdin();
    const sessionId = getSessionId(input);
    const handler = require('../../../scripts/lib/session-end-handler');
    const result = handler.handleSessionEnd(input, sessionId);
    process.stdout.write(JSON.stringify(result.output));
    process.exit(0);
  }, { result: '' });
}

module.exports = {};
