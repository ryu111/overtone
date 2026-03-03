'use strict';
/**
 * notification.js — macOS 通知能力
 *
 * 使用 osascript 發送 macOS 系統通知，支援 title、message、subtitle、sound。
 * 僅支援 macOS（darwin），其他平台回傳 UNSUPPORTED_PLATFORM。
 * 不 throw — 所有錯誤以 { ok: false, error, message } 回傳。
 *
 * 依賴注入：第二個參數 _deps = { execSync } 供測試替換。
 */

const { execSync: defaultExecSync } = require('child_process');

// 統一 response 建構工具
function ok(fields) {
  return { ok: true, ...fields };
}

function fail(error, message) {
  return { ok: false, error, message };
}

/**
 * 跳脫 osascript 字串中的特殊字元
 * osascript 用單引號包裹 -e 參數，內部字串用雙引號：
 *   osascript -e 'display notification "msg" with title "title"'
 * 需要跳脫：
 *   - `\` → `\\`（先處理，避免後續替換被二次跳脫）
 *   - `"` → `\"`（雙引號）
 * 單引號由 shell 層處理，此函式不需要跳脫。
 *
 * @param {string} str
 * @returns {string}
 */
function sanitize(str) {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * 發送 macOS 系統通知
 *
 * @param {object} opts
 * @param {string} opts.title - 通知標題（必填）
 * @param {string} opts.message - 通知內文（必填）
 * @param {string} [opts.subtitle] - 副標題（選填）
 * @param {boolean} [opts.sound] - 是否播放音效（預設 false）
 * @param {object} [_deps]
 * @param {Function} [_deps.execSync]
 * @returns {{ ok: true }|{ ok: false, error: string, message: string }}
 */
function sendNotification(opts = {}, _deps = {}) {
  if (process.platform !== 'darwin') {
    return fail('UNSUPPORTED_PLATFORM', '此功能僅支援 macOS');
  }

  // 驗證必填欄位
  if (!opts.title || typeof opts.title !== 'string') {
    return fail('INVALID_ARGUMENT', 'title 必填且必須為 string');
  }
  if (!opts.message || typeof opts.message !== 'string') {
    return fail('INVALID_ARGUMENT', 'message 必填且必須為 string');
  }

  const execSync = _deps.execSync || defaultExecSync;

  // 建構 osascript 指令
  let script = `display notification "${sanitize(opts.message)}" with title "${sanitize(opts.title)}"`;

  if (opts.subtitle && typeof opts.subtitle === 'string') {
    script += ` subtitle "${sanitize(opts.subtitle)}"`;
  }

  if (opts.sound === true) {
    script += ` sound name "Default"`;
  }

  try {
    execSync(`osascript -e '${script}'`);
    return ok({});
  } catch (err) {
    return fail('COMMAND_FAILED', `osascript 失敗：${err.message}`);
  }
}

module.exports = {
  sendNotification,
};
