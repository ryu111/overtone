'use strict';
/**
 * interview-ux.test.js — interview.js UX 功能測試
 *
 * 覆蓋三個新 UX 功能：
 *   Feature 1: nextQuestion 進度指示器（progress 欄位）
 *   Feature 2: getProgress — facet 完成度摘要
 *   Feature 3: getAnswerSummary — 答案預覽列表
 */

const { test, expect, describe } = require('bun:test');
const path = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');

const {
  init,
  nextQuestion,
  recordAnswer,
  getProgress,
  getAnswerSummary,
  QUESTION_BANK,
} = require(path.join(SCRIPTS_LIB, 'interview'));

// ── 測試輔助 ──────────────────────────────────────────────────────────────

/**
 * 回答全部必問題，使 session 達到完成門檻
 */
function answerAllRequired(session) {
  let s = session;
  for (const q of QUESTION_BANK.filter(q => q.required)) {
    s = recordAnswer(s, q.id, `答案 for ${q.id}`);
  }
  return s;
}

// ══════════════════════════════════════════════════════════════════
// Feature 1: nextQuestion — progress 欄位
// ══════════════════════════════════════════════════════════════════

describe('Feature 1: nextQuestion — progress 欄位', () => {
  test('Scenario 1-1: 全新 session 第一題時 current 為 1', () => {
    const session = init('prog-test', '/tmp/out');
    const q = nextQuestion(session);

    expect(q).not.toBeNull();
    expect(q.progress).toBeDefined();
    expect(q.progress.current).toBe(1);
  });

  test('Scenario 1-2: progress.total 大於 0 且為正整數', () => {
    const session = init('prog-test-2', '/tmp/out');
    const q = nextQuestion(session);

    expect(q.progress.total).toBeGreaterThan(0);
    expect(Number.isInteger(q.progress.total)).toBe(true);
  });

  test('Scenario 1-3: progress.percentage 在 1~100 之間', () => {
    const session = init('prog-test-3', '/tmp/out');
    const q = nextQuestion(session);

    expect(q.progress.percentage).toBeGreaterThanOrEqual(1);
    expect(q.progress.percentage).toBeLessThanOrEqual(100);
  });

  test('Scenario 1-4: 回答一題後 current 遞增為 2', () => {
    let session = init('prog-test-4', '/tmp/out');
    const q1 = nextQuestion(session);
    session = recordAnswer(session, q1.id, '第一個答案');

    const q2 = nextQuestion(session);
    expect(q2).not.toBeNull();
    expect(q2.progress.current).toBe(2);
  });

  test('Scenario 1-5: percentage = Math.round(current / total * 100)', () => {
    const session = init('prog-test-5', '/tmp/out');
    const q = nextQuestion(session);

    const expected = Math.round(q.progress.current / q.progress.total * 100);
    expect(q.progress.percentage).toBe(expected);
  });

  test('Scenario 1-6: 全部問題答完後 nextQuestion 回傳 null（不含 progress）', () => {
    let session = init('prog-test-6', '/tmp/out');
    for (const q of QUESTION_BANK) {
      session = recordAnswer(session, q.id, `答案 for ${q.id}`);
    }
    const result = nextQuestion(session);
    expect(result).toBeNull();
  });

  test('Scenario 1-7: progress 不影響原始 Question 欄位（id/facet/text/required/dependsOn 仍存在）', () => {
    const session = init('prog-test-7', '/tmp/out');
    const q = nextQuestion(session);

    expect(typeof q.id).toBe('string');
    expect(typeof q.facet).toBe('string');
    expect(typeof q.text).toBe('string');
    expect(typeof q.required).toBe('boolean');
    // dependsOn 可為 null 或 string
    expect(q.dependsOn === null || typeof q.dependsOn === 'string').toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 2: getProgress — facet 完成度摘要
// ══════════════════════════════════════════════════════════════════

describe('Feature 2: getProgress — facet 完成度摘要', () => {
  test('Scenario 2-1: 全新 session 時所有 facet answered 為 0', () => {
    const session = init('gp-test-1', '/tmp/out');
    const prog = getProgress(session);

    expect(prog.functional.answered).toBe(0);
    expect(prog.flow.answered).toBe(0);
    expect(prog.ui.answered).toBe(0);
    expect(prog['edge-cases'].answered).toBe(0);
    expect(prog.acceptance.answered).toBe(0);
  });

  test('Scenario 2-2: 回答 functional 2 題後 functional.answered 為 2', () => {
    let session = init('gp-test-2', '/tmp/out');
    session = recordAnswer(session, 'func-1', '答案一');
    session = recordAnswer(session, 'func-2', '答案二');

    const prog = getProgress(session);
    expect(prog.functional.answered).toBe(2);
    // 其他 facet 不受影響
    expect(prog.flow.answered).toBe(0);
  });

  test('Scenario 2-3: getProgress 包含 overall 欄位（answered/total/percentage）', () => {
    const session = init('gp-test-3', '/tmp/out');
    const prog = getProgress(session);

    expect(prog.overall).toBeDefined();
    expect(typeof prog.overall.answered).toBe('number');
    expect(typeof prog.overall.total).toBe('number');
    expect(typeof prog.overall.percentage).toBe('number');
  });

  test('Scenario 2-4: overall.percentage = Math.round(answered / total * 100)', () => {
    let session = init('gp-test-4', '/tmp/out');
    session = recordAnswer(session, 'func-1', 'A');
    session = recordAnswer(session, 'func-2', 'B');
    session = recordAnswer(session, 'flow-1', 'C');

    const prog = getProgress(session);
    const expected = Math.round(prog.overall.answered / prog.overall.total * 100);
    expect(prog.overall.percentage).toBe(expected);
  });

  test('Scenario 2-5: facet.total 與 QUESTION_BANK 題數一致', () => {
    const session = init('gp-test-5', '/tmp/out');
    const prog = getProgress(session);

    const countByFacet = (facet) => QUESTION_BANK.filter(q => q.facet === facet).length;
    expect(prog.functional.total).toBe(countByFacet('functional'));
    expect(prog.flow.total).toBe(countByFacet('flow'));
    expect(prog.ui.total).toBe(countByFacet('ui'));
    expect(prog['edge-cases'].total).toBe(countByFacet('edge-cases'));
    expect(prog.acceptance.total).toBe(countByFacet('acceptance'));
  });

  test('Scenario 2-6: skipFacets 中的面向 answered 和 total 均為 0', () => {
    const session = init('gp-test-6', '/tmp/out', { skipFacets: ['ui'] });
    const prog = getProgress(session);

    expect(prog.ui.answered).toBe(0);
    expect(prog.ui.total).toBe(0);
  });

  test('Scenario 2-7: 全部問題回答後 overall.percentage 為 100', () => {
    let session = init('gp-test-7', '/tmp/out');
    for (const q of QUESTION_BANK) {
      session = recordAnswer(session, q.id, `答案 for ${q.id}`);
    }
    const prog = getProgress(session);
    expect(prog.overall.percentage).toBe(100);
    expect(prog.overall.answered).toBe(prog.overall.total);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 3: getAnswerSummary — 答案預覽列表
// ══════════════════════════════════════════════════════════════════

describe('Feature 3: getAnswerSummary — 答案預覽列表', () => {
  test('Scenario 3-1: 全新 session（無回答）時回傳空陣列', () => {
    const session = init('as-test-1', '/tmp/out');
    const summary = getAnswerSummary(session);

    expect(Array.isArray(summary)).toBe(true);
    expect(summary.length).toBe(0);
  });

  test('Scenario 3-2: 回答 2 題後 summary 長度為 2', () => {
    let session = init('as-test-2', '/tmp/out');
    session = recordAnswer(session, 'func-1', '第一個答案');
    session = recordAnswer(session, 'flow-1', '第二個答案');

    const summary = getAnswerSummary(session);
    expect(summary.length).toBe(2);
  });

  test('Scenario 3-3: 每筆記錄包含 id/facet/questionText/answerPreview 四個欄位', () => {
    let session = init('as-test-3', '/tmp/out');
    session = recordAnswer(session, 'func-1', '答案內容');

    const summary = getAnswerSummary(session);
    expect(summary.length).toBe(1);

    const item = summary[0];
    expect(item.id).toBe('func-1');
    expect(item.facet).toBe('functional');
    expect(typeof item.questionText).toBe('string');
    expect(item.questionText.length).toBeGreaterThan(0);
    expect(typeof item.answerPreview).toBe('string');
  });

  test('Scenario 3-4: 超過 80 字的答案被截斷並加上 ...', () => {
    const longAnswer = 'A'.repeat(100);
    let session = init('as-test-4', '/tmp/out');
    session = recordAnswer(session, 'func-1', longAnswer);

    const summary = getAnswerSummary(session);
    const preview = summary[0].answerPreview;

    expect(preview).toBe(longAnswer.slice(0, 80) + '...');
    expect(preview.length).toBe(83);
  });

  test('Scenario 3-5: 80 字以內的答案不加省略號', () => {
    const shortAnswer = 'B'.repeat(80);
    let session = init('as-test-5', '/tmp/out');
    session = recordAnswer(session, 'func-1', shortAnswer);

    const summary = getAnswerSummary(session);
    const preview = summary[0].answerPreview;

    expect(preview).toBe(shortAnswer);
    expect(preview.endsWith('...')).toBe(false);
  });

  test('Scenario 3-6: 79 字的答案不加省略號', () => {
    const answer = 'C'.repeat(79);
    let session = init('as-test-6', '/tmp/out');
    session = recordAnswer(session, 'func-2', answer);

    const summary = getAnswerSummary(session);
    expect(summary[0].answerPreview).toBe(answer);
  });

  test('Scenario 3-7: 答案為空字串時 answerPreview 為空字串', () => {
    let session = init('as-test-7', '/tmp/out');
    session = recordAnswer(session, 'func-1', '');

    const summary = getAnswerSummary(session);
    expect(summary.length).toBe(1);
    expect(summary[0].answerPreview).toBe('');
  });

  test('Scenario 3-8: questionText 與 QUESTION_BANK 中的 text 一致', () => {
    let session = init('as-test-8', '/tmp/out');
    session = recordAnswer(session, 'flow-1', '操作步驟描述');

    const summary = getAnswerSummary(session);
    const bankQ = QUESTION_BANK.find(q => q.id === 'flow-1');
    expect(summary[0].questionText).toBe(bankQ.text);
  });
});
