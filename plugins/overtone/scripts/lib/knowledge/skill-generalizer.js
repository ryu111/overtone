'use strict';
/**
 * skill-generalizer.js — 知識條目通用化處理器
 *
 * 純函式模組，移除知識條目中的專案特定內容，使其可通用化後保存至 internalized.md。
 * 採段落級移除策略：包含專案特定模式的段落整段移除。
 *
 * 導出：
 *   PROJECT_SPECIFIC_PATTERNS — 預設的專案特定內容偵測 pattern
 *   generalizeEntry — 處理單一條目
 *   generalizeEntries — 批量處理（只處理 qualified=true 的條目）
 */

/**
 * 預設的專案特定內容偵測 pattern。
 * 段落包含以下任一模式時整段移除。
 */
const PROJECT_SPECIFIC_PATTERNS = [
  // 絕對路徑（Unix-like 和 Windows）
  /\/Users\/[^\s]+/,
  /\/home\/[^\s]+/,
  /[A-Z]:\\[^\s]+/,
  // 相對路徑中的專案特定目錄
  /plugins\/overtone\//,
  /scripts\/lib\//,
  // require/import 的具體模組路徑
  /require\(['"]\.[^'"]+['"]\)/,
  /import\s+.*\s+from\s+['"]\.[^'"]+['"]/,
  // 版本號（v1.2.3 或 @^1.0.0 格式）
  /\bv\d+\.\d+\.\d+\b/,
  /@[\^~]?\d+\.\d+\.\d+/,
  // Session ID（sha 格式：8+ 位 hex 字元）
  /\b[0-9a-f]{8,}\b/,
];

/**
 * 通用化單一知識條目。
 *
 * 處理流程：
 *   1. 以空行分段（段落級處理）
 *   2. 對每個段落，檢查是否包含任何專案特定 pattern
 *   3. 包含 pattern 的段落整段移除
 *   4. 重組剩餘段落，計算結果
 *
 * @param {string} content - 原始條目內容
 * @param {object} [options]
 * @param {RegExp[]} [options.customPatterns] - 額外的移除 pattern
 * @param {number} [options.minLength=50] - 通用化後最小長度（低於此值標記 isEmpty）
 * @returns {{ original: string, generalized: string, removed: string[], isEmpty: boolean }}
 */
function generalizeEntry(content, options = {}) {
  const customPatterns = Array.isArray(options.customPatterns) ? options.customPatterns : [];
  const minLength = typeof options.minLength === 'number' ? options.minLength : 50;
  const allPatterns = [...PROJECT_SPECIFIC_PATTERNS, ...customPatterns];

  // 以空行分段（支援 \r\n 和 \n）
  const paragraphs = content.split(/\n\s*\n/);

  const kept = [];
  const removed = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue; // 跳過空白段落

    const isSpecific = allPatterns.some(pattern => pattern.test(trimmed));
    if (isSpecific) {
      removed.push(trimmed);
    } else {
      kept.push(trimmed);
    }
  }

  const generalized = kept.join('\n\n');
  const isEmpty = generalized.length < minLength;

  return {
    original: content,
    generalized,
    removed,
    isEmpty,
  };
}

/**
 * 批量通用化知識條目。
 * 只處理 qualified=true 的 EvaluationResult 條目。
 * 過濾掉通用化後 isEmpty=true 的結果。
 *
 * @param {Array<{entry: string, qualified: boolean, domain: string|null, score: number}>} entries
 * @param {object} [options]
 * @param {RegExp[]} [options.customPatterns] - 額外的移除 pattern
 * @param {number} [options.minLength=50] - 通用化後最小長度
 * @returns {Array<{original: string, generalized: string, removed: string[], isEmpty: boolean}>}
 */
function generalizeEntries(entries, options = {}) {
  if (!Array.isArray(entries)) return [];

  return entries
    .filter(e => e && e.qualified === true)
    .map(e => generalizeEntry(e.entry || '', options));
}

module.exports = { PROJECT_SPECIFIC_PATTERNS, generalizeEntry, generalizeEntries };
