/**
 * feature-sync.js
 * 共享模組：統一 featureName 自動同步邏輯
 *
 * 兩個 hook（session/on-start.js、agent/on-stop.js）皆需要：
 *   specs.getActiveFeature → 若 workflow.json 沒有 featureName → 自動設定
 * 抽取此模組避免重複實作。
 */

const state = require('./state');
const specs = require('./specs');

/**
 * 同步 featureName 到 workflow.json
 *
 * @param {string} projectRoot - 專案根目錄
 * @param {string} sessionId - 目前 session ID
 * @returns {string|null} 設定的 featureName，或 null（未設定 / 錯誤）
 */
function syncFeatureName(projectRoot, sessionId) {
  try {
    const activeFeature = specs.getActiveFeature(projectRoot);
    if (!activeFeature || !sessionId) return null;

    const ws = state.readState(sessionId);
    if (!ws || ws.featureName) return null;

    state.setFeatureName(sessionId, activeFeature.name);
    return activeFeature.name;
  } catch {
    // 靜默跳過，不阻擋呼叫端主流程
    return null;
  }
}

module.exports = { syncFeatureName };
