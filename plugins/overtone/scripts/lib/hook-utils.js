'use strict';
/**
 * hook-utils.js — Hook 共用工具
 *
 * 提供三個函式，統一所有 hook 的錯誤處理方式：
 *   safeReadStdin  — 同步讀取 stdin + JSON.parse，失敗回傳 {}
 *   safeRun        — 頂層 try/catch 包裹，crash 時輸出 defaultOutput + exit 0
 *   hookError      — 統一 stderr 錯誤記錄（帶 [overtone/{hookName}] 前綴）
 */

const { readFileSync } = require('fs');

/**
 * 同步讀取 /dev/stdin 並解析 JSON。
 * 失敗（空輸入、畸形 JSON、讀取錯誤）時回傳 {}。
 * @returns {object}
 */
function safeReadStdin() {
  try {
    const raw = readFileSync('/dev/stdin', 'utf8');
    if (!raw.trim()) {
      hookError('safeReadStdin', 'stdin 為空');
      return {};
    }
    return JSON.parse(raw);
  } catch (err) {
    hookError('safeReadStdin', `stdin 讀取或解析失敗：${err.message || String(err)}`);
    return {};
  }
}

/**
 * 頂層 try/catch 包裹 hook 主邏輯。
 * fn() 若拋出例外，輸出 defaultOutput 並 exit 0。
 * fn() 正常完成後，也輸出 defaultOutput 並 exit 0（fn 內部自行 stdout.write 的 hook 應在 fn 內呼叫 process.exit(0)）。
 * @param {Function} fn - hook 主邏輯
 * @param {object} defaultOutput - 失敗時輸出的 JSON 物件
 */
function safeRun(fn, defaultOutput = { result: '' }) {
  try {
    fn();
  } catch (err) {
    hookError('safeRun', err.message || String(err));
    process.stdout.write(JSON.stringify(defaultOutput));
    process.exit(0);
  }
  // fn 正常完成但沒有自行退出時，輸出 defaultOutput
  process.stdout.write(JSON.stringify(defaultOutput));
  process.exit(0);
}

/**
 * 寫入 stderr 錯誤訊息（帶 [overtone/{hookName}] 前綴）。
 * @param {string} hookName
 * @param {string} message
 */
function hookError(hookName, message) {
  process.stderr.write(`[overtone/${hookName}] ${message}\n`);
}

module.exports = { safeReadStdin, safeRun, hookError };
