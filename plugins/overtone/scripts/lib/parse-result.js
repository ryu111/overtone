'use strict';
/**
 * parse-result.js — 解析 agent 輸出，判斷結果
 *
 * 解析策略（優先順序）：
 *   1. 結構化 VERDICT 標記（<!-- VERDICT: {"result": "PASS"} -->）
 *   2. 依 stageKey 分類進行字串匹配
 */

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
    // 排除 false positive：「no rejections」「not rejected」
    if ((lower.includes('reject') || lower.includes('拒絕'))
        && !lower.includes('no reject') && !lower.includes('not reject')) {
      return { verdict: 'reject' };
    }
    return { verdict: 'pass' };
  }

  // TESTER / QA / E2E / BUILD-FIX → PASS / FAIL
  if (stageKey === 'TEST' || stageKey === 'QA' || stageKey === 'E2E' || stageKey === 'BUILD-FIX') {
    // 排除 false positive（M-3 擴充）
    if ((lower.includes('fail') || lower.includes('失敗'))
        && !lower.includes('no fail') && !lower.includes('0 fail')
        && !lower.includes('without fail') && !lower.includes('failure mode')) {
      return { verdict: 'fail' };
    }
    // 'error' 單獨檢查，排除 'error handling'、'0 errors'、'error-free'、'without error'
    if (lower.includes('error') && !lower.includes('0 error') && !lower.includes('no error')
        && !lower.includes('without error')
        && !lower.includes('error handling') && !lower.includes('error recovery')
        && !lower.includes('error-free') && !lower.includes('error free')) {
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
    if ((lower.includes('issues') || lower.includes('改善建議') || lower.includes('建議優化'))
        && !lower.includes('no issues') && !lower.includes('0 issues')
        && !lower.includes('no significant issues') && !lower.includes('without issues')) {
      return { verdict: 'issues' };
    }
    return { verdict: 'pass' };
  }

  // 其他 → 預設 pass
  return { verdict: 'pass' };
}

module.exports = parseResult;
