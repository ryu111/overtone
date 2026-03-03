'use strict';
/**
 * clipboard.js — macOS 剪貼簿讀寫能力
 *
 * 提供剪貼簿讀取（pbpaste）和寫入（pbcopy）兩個功能。
 * 僅支援 macOS（darwin），其他平台回傳 UNSUPPORTED_PLATFORM。
 * 不 throw — 所有錯誤以 { ok: false, error, message } 回傳。
 *
 * 依賴注入：最後一個參數 _deps = { execSync } 供測試替換。
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
 * 讀取剪貼簿內容
 * @param {object} [_deps]
 * @param {Function} [_deps.execSync]
 * @returns {{ ok: true, content: string }
 *           |{ ok: false, error: string, message: string }}
 */
function readClipboard(_deps = {}) {
  if (process.platform !== 'darwin') {
    return fail('UNSUPPORTED_PLATFORM', '此功能僅支援 macOS');
  }

  const execSync = _deps.execSync || defaultExecSync;

  try {
    const content = execSync('pbpaste', { encoding: 'utf-8' });
    return ok({ content: content || '' });
  } catch (err) {
    return fail('COMMAND_FAILED', `pbpaste 失敗：${err.message}`);
  }
}

/**
 * 寫入文字到剪貼簿
 * @param {string} text - 要寫入的文字
 * @param {object} [_deps]
 * @param {Function} [_deps.execSync]
 * @returns {{ ok: true }
 *           |{ ok: false, error: string, message: string }}
 */
function writeClipboard(text, _deps = {}) {
  if (process.platform !== 'darwin') {
    return fail('UNSUPPORTED_PLATFORM', '此功能僅支援 macOS');
  }

  if (typeof text !== 'string') {
    return fail('INVALID_ARGUMENT', 'text 必須是 string 型別');
  }

  const execSync = _deps.execSync || defaultExecSync;

  try {
    execSync('pbcopy', { input: text });
    return ok({});
  } catch (err) {
    return fail('COMMAND_FAILED', `pbcopy 失敗：${err.message}`);
  }
}

module.exports = {
  readClipboard,
  writeClipboard,
};
