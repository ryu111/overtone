'use strict';
/**
 * hook-timing.js — 共享 timing emit 模組
 *
 * 統一 8 個 hook 的 hook:timing timeline emit 模式。
 *
 * 使用方式：
 *   const { createHookTimer } = require('./hook-timing');
 *   const timer = createHookTimer();          // 記錄開始時間
 *   // ... hook 邏輯 ...
 *   timer.emit(sessionId, 'on-start', 'SessionStart');
 *   timer.emit(sessionId, 'pre-task', 'PreToolUse', { agent: targetAgent });
 */

const timeline = require('./timeline');

/**
 * 建立 hook timer 實例。
 * startTime 預設為 Date.now()，可傳入既有時間戳（供需在外部記錄開始時間的 hook 使用）。
 *
 * @param {number} [startTime] - 開始時間戳（毫秒），不傳則自動取當前時間
 * @returns {{ emit: function }}
 */
function createHookTimer(startTime) {
  const t0 = startTime !== undefined ? startTime : Date.now();

  /**
   * 發送 hook:timing 事件至 timeline。
   * - 若 sessionId 為 falsy，靜默跳過
   * - timeline.emit 失敗時靜默處理，不影響 hook 主流程
   *
   * @param {string|undefined} sessionId - 目前 session ID
   * @param {string} hookName - hook 識別名稱（e.g. 'on-start'）
   * @param {string} eventName - 對應 hook 事件名稱（e.g. 'SessionStart'）
   * @param {object} [extra] - 額外欄位（e.g. { agent, verdict, toolName }）
   */
  function emit(sessionId, hookName, eventName, extra) {
    if (!sessionId) return;
    try {
      timeline.emit(sessionId, 'hook:timing', {
        hook: hookName,
        event: eventName,
        durationMs: Date.now() - t0,
        ...(extra || {}),
      });
    } catch { /* 計時 emit 失敗不影響 hook 功能 */ }
  }

  return { emit };
}

module.exports = { createHookTimer };
