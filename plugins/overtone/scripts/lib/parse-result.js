'use strict';
/**
 * parse-result.js — 解析 agent 輸出，判斷結果
 *
 * 解析策略（優先順序）：
 *   1. 結構化 VERDICT 標記（<!-- VERDICT: {"result": "PASS"} -->）
 *   2. 依 stageKey 分類進行字串匹配
 */

// 排除條件常量（避免 false positive）
const REJECT_EXCLUDES = ['no reject', 'not reject'];
const FAIL_EXCLUDES = ['no fail', '0 fail', 'without fail', 'failure mode'];
const ERROR_EXCLUDES = ['0 error', 'no error', 'without error', 'error handling', 'error recovery', 'error-free', 'error free'];
const ISSUES_EXCLUDES = ['no issues', '0 issues', 'no significant issues', 'without issues'];

/**
 * 輔助函式：檢查 text 是否包含 keywords 中的任一關鍵字，且不符合 excludes 中的任一排除條件
 * @param {string} text - 已 toLowerCase 的文字
 * @param {string[]} keywords - 觸發關鍵字
 * @param {string[]} excludes - 排除條件
 * @returns {boolean}
 */
function matchesWithExclusions(text, keywords, excludes) {
  const hasKeyword = keywords.some((kw) => text.includes(kw));
  if (!hasKeyword) return false;
  return !excludes.some((ex) => text.includes(ex));
}

/**
 * 解析 agent 輸出，判斷結果
 * @param {string} output - agent 的完整輸出文字
 * @param {string} stageKey - stage 名稱（如 'REVIEW', 'TEST', 'RETRO'）
 * @returns {{ verdict: string }} verdict 為 'pass' | 'fail' | 'reject' | 'issues'
 */
function parseResult(output, stageKey) {
  // 優先解析結構化 verdict（agent prompt 約定格式）
  const verdictMatch = output.match(/<!--\s*VERDICT:\s*(\{[^}]+\})\s*-->/);
  if (verdictMatch) {
    try {
      const parsed = JSON.parse(verdictMatch[1]);
      if (parsed.result) {
        return { verdict: parsed.result.toLowerCase() };
      }
    } catch {
      // 解析失敗，fallback 到字串匹配
    }
  }

  const lower = output.toLowerCase();

  // REVIEWER → PASS / REJECT
  if (stageKey === 'REVIEW' || stageKey === 'SECURITY' || stageKey === 'DB-REVIEW') {
    if (matchesWithExclusions(lower, ['reject', '拒絕'], REJECT_EXCLUDES)) {
      return { verdict: 'reject' };
    }
    return { verdict: 'pass' };
  }

  // TESTER / QA / E2E / BUILD-FIX → PASS / FAIL
  if (stageKey === 'TEST' || stageKey === 'QA' || stageKey === 'E2E' || stageKey === 'BUILD-FIX') {
    if (matchesWithExclusions(lower, ['fail', '失敗'], FAIL_EXCLUDES)) {
      return { verdict: 'fail' };
    }
    // 'error' 單獨檢查，排除 'error handling'、'0 errors'、'error-free'、'without error'
    if (matchesWithExclusions(lower, ['error'], ERROR_EXCLUDES)) {
      return { verdict: 'fail' };
    }
    return { verdict: 'pass' };
  }

  // PM → 預設 pass（advisory 角色，不存在 fail/reject）
  if (stageKey === 'PM') {
    return { verdict: 'pass' };
  }

  // RETRO → PASS / ISSUES（有改善建議，不算 fail）
  // 排除 false positive：「no issues」「0 issues」等 PASS 情境的自然語言
  if (stageKey === 'RETRO') {
    if (matchesWithExclusions(lower, ['issues', '改善建議', '建議優化'], ISSUES_EXCLUDES)) {
      return { verdict: 'issues' };
    }
    return { verdict: 'pass' };
  }

  // 其他 → 預設 pass
  return { verdict: 'pass' };
}

module.exports = parseResult;
