'use strict';
/**
 * interview-edge-cases.test.js — interview.js 邊界情況測試
 *
 * 補充 interview.test.js 未涵蓋的邊界場景：
 *   - recordAnswer 傳入 null / undefined
 *   - saveSession → loadSession roundtrip 欄位完整性
 *   - 問題池耗盡後 nextQuestion 的行為
 *   - 不存在的 facet、facet 為空
 *   - generateSpec session 無答案時的輸出
 *   - buildBDDScenarios 邊界（透過 generateSpec 間接測）
 *   - processAnswer 連續調用
 */

const { test, expect, describe, beforeAll, afterAll } = require('bun:test');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const {
  init,
  nextQuestion,
  recordAnswer,
  isComplete,
  generateSpec,
  loadSession,
  saveSession,
  QUESTION_BANK,
  enrichBDDScenarios,
} = require(path.join(SCRIPTS_LIB, 'interview'));

// ── 測試輔助 ──────────────────────────────────────────────────────────────

function makeTmpDir(suffix) {
  const dir = path.join(os.tmpdir(), `interview-edge-${suffix}-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanTmpDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

// ══════════════════════════════════════════════════════════════════
// Feature A: recordAnswer 邊界 — null / undefined 輸入
// ══════════════════════════════════════════════════════════════════

describe('Feature A: recordAnswer — null / undefined 輸入', () => {
  test('Scenario A-1: answer 為 null 時記錄 null', () => {
    const session = init('edge-feature', '/tmp/out');
    const updated = recordAnswer(session, 'func-1', null);

    // 鍵存在，值為 null
    expect(Object.prototype.hasOwnProperty.call(updated.answers, 'func-1')).toBe(true);
    expect(updated.answers['func-1']).toBeNull();
  });

  test('Scenario A-2: answer 為 undefined 時記錄 undefined', () => {
    const session = init('edge-feature', '/tmp/out');
    const updated = recordAnswer(session, 'func-1', undefined);

    // 鍵存在，值為 undefined
    expect(Object.prototype.hasOwnProperty.call(updated.answers, 'func-1')).toBe(true);
    expect(updated.answers['func-1']).toBeUndefined();
  });

  test('Scenario A-3: 傳入純空白字串的 answer 時正確記錄', () => {
    const session = init('edge-feature', '/tmp/out');
    const updated = recordAnswer(session, 'func-2', '   ');

    expect(updated.answers['func-2']).toBe('   ');
    // 不影響原始 session
    expect(Object.prototype.hasOwnProperty.call(session.answers, 'func-2')).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature B: saveSession / loadSession roundtrip 欄位完整性
// ══════════════════════════════════════════════════════════════════

describe('Feature B: saveSession / loadSession roundtrip 欄位完整性', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = makeTmpDir('roundtrip');
  });

  afterAll(() => {
    cleanTmpDir(tmpDir);
  });

  test('Scenario B-1: startedAt / completedAt 欄位還原正確', () => {
    const statePath = path.join(tmpDir, 'rt-b1.json');
    let session = init('rt-feature', '/tmp/out');
    const originalStartedAt = session.startedAt;

    // 手動設定 completedAt
    session = { ...session, completedAt: new Date().toISOString() };
    saveSession(session, statePath);

    const restored = loadSession(statePath);
    expect(restored.startedAt).toBe(originalStartedAt);
    expect(restored.completedAt).toBe(session.completedAt);
  });

  test('Scenario B-2: answers 欄位（多筆）還原完整無損', () => {
    const statePath = path.join(tmpDir, 'rt-b2.json');
    let session = init('rt-feature-2', '/tmp/out');
    session = recordAnswer(session, 'func-1', '答案一');
    session = recordAnswer(session, 'func-2', '答案二');
    session = recordAnswer(session, 'flow-1', '流程描述');
    session = recordAnswer(session, 'edge-1', '邊界說明');

    saveSession(session, statePath);
    const restored = loadSession(statePath);

    expect(restored.answers['func-1']).toBe('答案一');
    expect(restored.answers['func-2']).toBe('答案二');
    expect(restored.answers['flow-1']).toBe('流程描述');
    expect(restored.answers['edge-1']).toBe('邊界說明');
    expect(Object.keys(restored.answers).length).toBe(4);
  });

  test('Scenario B-3: options 欄位（自訂 skipFacets）還原正確', () => {
    const statePath = path.join(tmpDir, 'rt-b3.json');
    const session = init('rt-feature-3', '/tmp/out', {
      minAnswersPerFacet: 3,
      skipFacets: ['ui'],
    });

    saveSession(session, statePath);
    const restored = loadSession(statePath);

    expect(restored.options.minAnswersPerFacet).toBe(3);
    expect(restored.options.skipFacets).toContain('ui');
  });

  test('Scenario B-4: domainResearch 欄位存在時還原正確', () => {
    const statePath = path.join(tmpDir, 'rt-b4.json');
    const session = {
      ...init('rt-feature-4', '/tmp/out'),
      domainResearch: {
        summary: '研究摘要',
        concepts: ['概念A', '概念B'],
        questions: ['深度問題一？', '深度問題二？'],
      },
    };

    saveSession(session, statePath);
    const restored = loadSession(statePath);

    expect(restored.domainResearch).not.toBeNull();
    expect(restored.domainResearch.summary).toBe('研究摘要');
    expect(restored.domainResearch.concepts).toHaveLength(2);
    expect(restored.domainResearch.questions).toHaveLength(2);
  });

  test('Scenario B-5: domainResearch 為空時還原為 undefined（不崩潰）', () => {
    const statePath = path.join(tmpDir, 'rt-b5.json');
    const session = init('rt-feature-5', '/tmp/out');
    // 無 domainResearch

    saveSession(session, statePath);
    const restored = loadSession(statePath);

    // loadSession 對 null 的 domainResearch 還原為 undefined
    expect(restored.domainResearch === undefined || restored.domainResearch === null).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature C: 問題池耗盡後的行為
// ══════════════════════════════════════════════════════════════════

describe('Feature C: 問題池耗盡', () => {
  test('Scenario C-1: 全部問題回答後 nextQuestion 返回 null', () => {
    let session = init('exhaust-feature', '/tmp/out');
    for (const q of QUESTION_BANK) {
      session = recordAnswer(session, q.id, `answer-${q.id}`);
    }

    const result = nextQuestion(session);
    expect(result).toBeNull();
  });

  test('Scenario C-2: 只跳過必問題後，nextQuestion 仍返回補充題', () => {
    let session = init('exhaust-feature-2', '/tmp/out');
    // 回答所有必問題，但不回答補充題
    const requiredQuestions = QUESTION_BANK.filter(q => q.required);
    for (const q of requiredQuestions) {
      session = recordAnswer(session, q.id, `answer-${q.id}`);
    }

    const q = nextQuestion(session);
    // 必須有補充題可以回答
    expect(q).not.toBeNull();
    expect(q.required).toBe(false);
  });

  test('Scenario C-3: skipFacets 跳過面向後，被跳過面向的問題不出現', () => {
    const session = init('skip-feature', '/tmp/out', { skipFacets: ['ui', 'acceptance'] });

    // 回答 ui 和 acceptance 以外的所有必問題
    let s = session;
    const otherRequired = QUESTION_BANK.filter(
      q => q.required && q.facet !== 'ui' && q.facet !== 'acceptance'
    );
    for (const q of otherRequired) {
      s = recordAnswer(s, q.id, `answer-${q.id}`);
    }

    // 補充題（非 ui/acceptance）也回答完
    const otherOptional = QUESTION_BANK.filter(
      q => !q.required && q.facet !== 'ui' && q.facet !== 'acceptance'
    );
    for (const q of otherOptional) {
      s = recordAnswer(s, q.id, `answer-${q.id}`);
    }

    const result = nextQuestion(s);
    // 所有未被跳過的問題已全部回答，返回 null
    expect(result).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature D: facet 邊界
// ══════════════════════════════════════════════════════════════════

describe('Feature D: facet 邊界', () => {
  test('Scenario D-1: skipFacets 包含不存在的 facet 時不崩潰', () => {
    let result;
    expect(() => {
      const session = init('facet-edge', '/tmp/out', {
        skipFacets: ['nonexistent-facet', 'another-fake'],
      });
      result = nextQuestion(session);
    }).not.toThrow();

    // 不存在的 facet 不影響正常問題的取得
    expect(result).not.toBeNull();
  });

  test('Scenario D-2: skipFacets 跳過所有必問面向時 isComplete 直接回傳 true', () => {
    const session = init('all-skip', '/tmp/out', {
      skipFacets: ['functional', 'flow', 'edge-cases', 'acceptance'],
    });

    // 沒有任何面向需要檢查，應視為完成
    expect(isComplete(session)).toBe(true);
  });

  test('Scenario D-3: 只跳過部分面向時完成度計算正確', () => {
    // 跳過 edge-cases 和 acceptance，只需 functional + flow
    let session = init('partial-skip', '/tmp/out', {
      skipFacets: ['edge-cases', 'acceptance'],
    });

    // 只回答 functional + flow 的必問題（各 2 個）
    session = recordAnswer(session, 'func-1', 'A');
    session = recordAnswer(session, 'func-2', 'B');
    session = recordAnswer(session, 'flow-1', 'C');
    session = recordAnswer(session, 'flow-2', 'D');

    expect(isComplete(session)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature E: generateSpec 邊界 — session 無答案時
// ══════════════════════════════════════════════════════════════════

describe('Feature E: generateSpec — session 無答案時', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = makeTmpDir('gen-empty');
  });

  afterAll(() => {
    cleanTmpDir(tmpDir);
  });

  test('Scenario E-1: session 無任何回答時 generateSpec 仍可成功執行', () => {
    const outputPath = path.join(tmpDir, 'empty-spec');
    fs.mkdirSync(outputPath, { recursive: true });
    const session = init('empty-interview', outputPath);

    let spec;
    expect(() => {
      spec = generateSpec(session);
    }).not.toThrow();

    // 基本結構存在
    expect(spec.feature).toBe('empty-interview');
    expect(new Date(spec.generatedAt).toISOString()).toBe(spec.generatedAt);
  });

  test('Scenario E-2: session 無回答時 facets.functional 為空陣列', () => {
    const outputPath = path.join(tmpDir, 'empty-spec-2');
    fs.mkdirSync(outputPath, { recursive: true });
    const session = init('empty-interview-2', outputPath);

    const spec = generateSpec(session);

    expect(Array.isArray(spec.facets.functional)).toBe(true);
    expect(spec.facets.functional.length).toBe(0);
    expect(Array.isArray(spec.facets.flow)).toBe(true);
    expect(spec.facets.flow.length).toBe(0);
  });

  test('Scenario E-3: session 無回答時 acceptance 場景仍 >= 10（enrichBDDScenarios 補充）', () => {
    const outputPath = path.join(tmpDir, 'empty-spec-3');
    fs.mkdirSync(outputPath, { recursive: true });
    const session = init('empty-interview-3', outputPath);

    const spec = generateSpec(session);

    // enrichBDDScenarios 會補充到 >= 10 個場景
    expect(spec.facets.acceptance.length).toBeGreaterThanOrEqual(10);
  });

  test('Scenario E-4: session 只有單一 facet 有答案時 generateSpec 輸出仍完整', () => {
    const outputPath = path.join(tmpDir, 'single-facet-spec');
    fs.mkdirSync(outputPath, { recursive: true });
    let session = init('single-facet', outputPath);
    // 只回答 functional 的問題
    session = recordAnswer(session, 'func-1', '核心功能：任務管理');
    session = recordAnswer(session, 'func-2', '使用者：一般使用者');

    const spec = generateSpec(session);

    expect(spec.facets.functional.length).toBe(2);
    expect(spec.facets.flow.length).toBe(0);
    // acceptance 場景仍 >= 10（透過 enrichBDDScenarios）
    expect(spec.facets.acceptance.length).toBeGreaterThanOrEqual(10);
    // 所有場景結構完整
    for (const scenario of spec.facets.acceptance) {
      expect(typeof scenario.title).toBe('string');
      expect(typeof scenario.given).toBe('string');
      expect(typeof scenario.when).toBe('string');
      expect(typeof scenario.then).toBe('string');
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature F: enrichBDDScenarios 邊界
// ══════════════════════════════════════════════════════════════════

describe('Feature F: enrichBDDScenarios 邊界', () => {
  test('Scenario F-1: 空場景陣列 + 空 session 時補充到 >= 10 個', () => {
    const session = init('enrich-empty', '/tmp/out');
    const result = enrichBDDScenarios([], session);

    expect(result.length).toBeGreaterThanOrEqual(10);
    // 每個場景結構完整
    for (const s of result) {
      expect(typeof s.title).toBe('string');
      expect(s.title.length).toBeGreaterThan(0);
      expect(typeof s.given).toBe('string');
      expect(typeof s.when).toBe('string');
      expect(typeof s.then).toBe('string');
    }
  });

  test('Scenario F-2: 已有 10 個場景時不再新增場景', () => {
    const session = init('enrich-full', '/tmp/out');
    const existingScenarios = Array.from({ length: 10 }, (_, i) => ({
      title: `場景 ${i + 1}`,
      given: `前提 ${i + 1}`,
      when: `動作 ${i + 1}`,
      then: `結果 ${i + 1}`,
    }));

    const result = enrichBDDScenarios(existingScenarios, session);

    // 已有 10 個，不需補充（長度相同）
    expect(result.length).toBe(10);
  });

  test('Scenario F-3: 場景 title 不重複（去重保護）', () => {
    const session = init('enrich-dedup', '/tmp/out');
    // 傳入重複 title 的場景
    const duplicates = [
      { title: '重複場景', given: 'G1', when: 'W1', then: 'T1' },
      { title: '重複場景', given: 'G2', when: 'W2', then: 'T2' },
    ];

    const result = enrichBDDScenarios(duplicates, session);

    const titles = result.map(s => s.title);
    const uniqueTitles = new Set(titles);
    expect(uniqueTitles.size).toBe(titles.length);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature G: processAnswer（recordAnswer）連續調用
// ══════════════════════════════════════════════════════════════════

describe('Feature G: recordAnswer 連續調用與重複 questionId', () => {
  test('Scenario G-1: 連續多次 recordAnswer 累積所有回答', () => {
    let session = init('chain-feature', '/tmp/out');

    const allQIds = QUESTION_BANK.slice(0, 5).map(q => q.id);
    for (const id of allQIds) {
      session = recordAnswer(session, id, `answer-${id}`);
    }

    // 所有 5 個問題都應有回答
    expect(Object.keys(session.answers).length).toBe(5);
    for (const id of allQIds) {
      expect(session.answers[id]).toBe(`answer-${id}`);
    }
  });

  test('Scenario G-2: 重複記錄同一 questionId 時最後一次覆蓋前次', () => {
    let session = init('repeat-feature', '/tmp/out');

    session = recordAnswer(session, 'func-1', '第一次回答');
    session = recordAnswer(session, 'func-1', '第二次回答');
    session = recordAnswer(session, 'func-1', '最終回答');

    expect(session.answers['func-1']).toBe('最終回答');
    // func-1 只有一筆
    expect(Object.keys(session.answers).filter(k => k === 'func-1').length).toBe(1);
  });

  test('Scenario G-3: 同一 questionId 記錄空字串後，再次記錄正常值可覆蓋', () => {
    let session = init('override-empty', '/tmp/out');

    session = recordAnswer(session, 'acc-1', '');
    expect(session.answers['acc-1']).toBe('');

    session = recordAnswer(session, 'acc-1', '有效的驗收標準');
    expect(session.answers['acc-1']).toBe('有效的驗收標準');
  });
});
