'use strict';
/**
 * hook-utils.js — Hook 共用工具
 *
 * 提供四個函式，統一所有 hook 的錯誤處理方式：
 *   safeReadStdin            — 同步讀取 stdin + JSON.parse，失敗回傳 {}
 *   safeRun                  — 頂層 try/catch 包裹，crash 時輸出 defaultOutput + exit 0
 *   hookError                — 統一 stderr 錯誤記錄（帶 [overtone/{hookName}] 前綴）
 *   buildPendingTasksMessage — 讀取活躍 feature 的未完成任務，供 SessionStart + PreCompact 共用
 */

const { readFileSync } = require('fs');
const path = require('path');

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

/**
 * 建構未完成任務恢復訊息。
 *
 * 從 specs/features/in-progress 讀取活躍 feature 的 tasks.md，
 * 組裝未完成任務清單。供 SessionStart 和 PreCompact hook 共用。
 *
 * @param {string} projectRoot - 專案根目錄
 * @param {object} [options]
 * @param {string} [options.header] - 自訂標頭文字（預設 '未完成任務'）
 * @returns {string|null} 未完成任務訊息，無活躍 feature 或全部完成時回傳 null
 */
function buildPendingTasksMessage(projectRoot, options = {}) {
  try {
    // 延遲 require 避免循環依賴，且僅在需要時載入
    const specs = require(path.join(__dirname, 'specs'));
    const activeFeature = specs.getActiveFeature(projectRoot);
    if (!activeFeature) return null;

    const checkboxes = activeFeature.tasks;
    if (!checkboxes || checkboxes.allChecked || checkboxes.total === 0) return null;

    const header = options.header || '未完成任務';
    const unchecked = checkboxes.unchecked || [];
    const lines = [
      `📋 **${header}**`,
      `Feature：${activeFeature.name}（${checkboxes.checked}/${checkboxes.total} 完成）`,
      ...unchecked.slice(0, 5).map(t => `- [ ] ${t}`),
    ];
    if (unchecked.length > 5) {
      lines.push(`... 還有 ${unchecked.length - 5} 個`);
    }
    lines.push(`→ 請使用 TaskCreate 重建以上任務的 TaskList，然後繼續執行。`);
    return lines.join('\n');
  } catch {
    return null;
  }
}

module.exports = { safeReadStdin, safeRun, hookError, buildPendingTasksMessage };
