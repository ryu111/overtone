'use strict';
/**
 * interview.test.js — interview.js 單元測試
 *
 * 覆蓋 BDD spec 的 8 個 Feature / 32 個 Scenario：
 *   Feature 1: init — 初始化訪談 session（3 scenarios）
 *   Feature 2: nextQuestion — 取得下一個問題（5 scenarios）
 *   Feature 3: recordAnswer — 記錄回答（3 scenarios）
 *   Feature 4: isComplete — 完成度判斷（5 scenarios）
 *   Feature 5: generateSpec — 產生 Project Spec（5 scenarios）
 *   Feature 6: loadSession / saveSession — 中斷恢復（5 scenarios）
 *   Feature 7: 問題庫結構完整性（3 scenarios）
 *   Feature 8: 邊界條件與防禦性行為（3 scenarios）
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
} = require(path.join(SCRIPTS_LIB, 'interview'));

// ── 測試輔助 ──────────────────────────────────────────────────────────────

/** 建立臨時目錄（每個測試 suite 獨立） */
function makeTmpDir(suffix) {
  const dir = path.join(os.tmpdir(), `interview-test-${suffix}-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 清理臨時目錄 */
function cleanTmpDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

/**
 * 建立一個滿足完成條件的 session（minAnswersPerFacet = 2）
 * 四個必問面向各回答 2 個必問題
 */
function makeCompletedSession(outputPath) {
  let session = init('test-feature', outputPath);

  // functional 必問題：func-1, func-2, func-3（取前 2 個）
  session = recordAnswer(session, 'func-1', '使用者可以管理待辦事項清單');
  session = recordAnswer(session, 'func-2', '一般使用者，日常任務管理情境');

  // flow 必問題：flow-1, flow-2, flow-3（取前 2 個）
  session = recordAnswer(session, 'flow-1', '1. 開啟應用 2. 新增待辦 3. 設定優先級 4. 儲存');
  session = recordAnswer(session, 'flow-2', '任務清單更新，顯示成功提示');

  // edge-cases 必問題：edge-1, edge-2, edge-3（取前 2 個）
  session = recordAnswer(session, 'edge-1', '空白任務名稱時顯示驗證錯誤');
  session = recordAnswer(session, 'edge-2', '超過 500 字的任務名稱自動截斷');

  // acceptance 必問題：acc-1, acc-2, acc-3（取前 2 個）
  session = recordAnswer(session, 'acc-1', '使用者可以在 3 秒內新增一個任務');
  session = recordAnswer(session, 'acc-2', '新增操作回應時間 < 200ms，支援 100 concurrent users');

  return session;
}

// ══════════════════════════════════════════════════════════════════
// Feature 1: init — 初始化訪談 session
// ══════════════════════════════════════════════════════════════════

describe('Feature 1: init', () => {
  test('Scenario: 以合法參數建立新訪談 session', () => {
    const session = init('my-feature', '/tmp/output');

    expect(typeof session).toBe('object');
    expect(session.featureName).toBe('my-feature');
    expect(session.outputPath).toBe('/tmp/output');
    expect(session.answers).toEqual({});
    // startedAt 為合法 ISO 8601
    expect(new Date(session.startedAt).toISOString()).toBe(session.startedAt);
    expect(session.completedAt).toBeUndefined();
    expect(session.options.minAnswersPerFacet).toBe(2);
  });

  test('Scenario: 以自訂 options 初始化 session', () => {
    const session = init('feature-x', '/tmp/out', { minAnswersPerFacet: 3 });

    expect(session.options.minAnswersPerFacet).toBe(3);
    expect(session.featureName).toBe('feature-x');
    expect(session.answers).toEqual({});
    expect(session.completedAt).toBeUndefined();
  });

  test('Scenario: featureName 為空時拋出錯誤', () => {
    expect(() => init('', '/some/path')).toThrow();

    try {
      init('', '/some/path');
    } catch (err) {
      expect(err.message).toContain('INVALID_INPUT');
      expect(err.message).toContain('featureName 不可為空');
    }
  });

  test('Scenario: featureName 為 undefined 時拋出錯誤', () => {
    expect(() => init(undefined, '/some/path')).toThrow();
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 2: nextQuestion — 取得下一個問題
// ══════════════════════════════════════════════════════════════════

describe('Feature 2: nextQuestion', () => {
  test('Scenario: 全新 session 時返回第一個必問題', () => {
    const session = init('feature-a', '/tmp/out');
    const q = nextQuestion(session);

    expect(q).not.toBeNull();
    expect(q.required).toBe(true);
    const validFacets = ['functional', 'flow', 'ui', 'edge-cases', 'acceptance'];
    expect(validFacets).toContain(q.facet);
    // id 符合格式：字母+連字號 + 連字號 + 數字
    expect(q.id).toMatch(/^[a-z-]+-\d+$/);
  });

  test('Scenario: 必問題全部完成後返回補充題', () => {
    let session = init('feature-b', '/tmp/out');
    // 回答所有必問題
    const required = QUESTION_BANK.filter(q => q.required);
    for (const q of required) {
      session = recordAnswer(session, q.id, `答案 for ${q.id}`);
    }

    const q = nextQuestion(session);
    expect(q).not.toBeNull();
    expect(q.required).toBe(false);
  });

  test('Scenario: 所有問題（必問 + 補充）均已回答時返回 null', () => {
    let session = init('feature-c', '/tmp/out');
    for (const q of QUESTION_BANK) {
      session = recordAnswer(session, q.id, `答案 for ${q.id}`);
    }

    const result = nextQuestion(session);
    expect(result).toBeNull();
  });

  test('Scenario: 已達完成門檻但仍有未回答補充題時繼續返回補充題', () => {
    let session = init('feature-d', '/tmp/out');

    // 回答所有必問題（達到門檻）
    const required = QUESTION_BANK.filter(q => q.required);
    for (const q of required) {
      session = recordAnswer(session, q.id, `答案 for ${q.id}`);
    }

    // 確認 isComplete 為 true
    expect(isComplete(session)).toBe(true);

    // 仍有未回答的補充題，nextQuestion 應返回補充題
    const q = nextQuestion(session);
    expect(q).not.toBeNull();
    expect(q.required).toBe(false);
  });

  test('Scenario: dependsOn 題目的前置問題尚未回答時跳過該題', () => {
    // flow-4 dependsOn flow-1；flow-5 dependsOn null
    // 先回答所有不依賴 flow-1 的必問題
    let session = init('feature-e', '/tmp/out');

    // 回答所有必問題（不含 flow-1，讓 flow-4 的前置未滿足）
    const required = QUESTION_BANK.filter(q => q.required);
    for (const q of required) {
      session = recordAnswer(session, q.id, `答案 for ${q.id}`);
    }
    // 也回答不依賴 flow-1 的補充題
    const optionalWithoutDep = QUESTION_BANK.filter(
      q => !q.required && q.dependsOn !== 'flow-1' && q.dependsOn !== 'func-1'
    );
    for (const q of optionalWithoutDep) {
      session = recordAnswer(session, q.id, `答案 for ${q.id}`);
    }

    // 此時 flow-4（dependsOn flow-1）應被跳過，func-5（dependsOn func-1）也應被跳過
    // flow-1 已回答（在必問題中），所以 flow-4 的前置是滿足的
    // 但 func-5 dependsOn func-1，func-1 已回答，所以 func-5 也可以作答
    // 實際上，flow-4 dependsOn flow-1，flow-1 已回答，故 flow-4 可以出現
    // 此測試主要驗證：若 flow-1 未回答，flow-4 會被跳過

    // 建立一個 flow-1 未回答但其他必問題已答的 session
    let session2 = init('feature-e2', '/tmp/out');
    const requiredExceptFlow1 = QUESTION_BANK.filter(q => q.required && q.id !== 'flow-1');
    for (const q of requiredExceptFlow1) {
      session2 = recordAnswer(session2, q.id, `答案 for ${q.id}`);
    }
    // 回答不依賴 flow-1 和 func-1 的補充題
    const noDepOptional = QUESTION_BANK.filter(
      q => !q.required && !q.dependsOn
    );
    for (const q of noDepOptional) {
      session2 = recordAnswer(session2, q.id, `答案 for ${q.id}`);
    }
    // func-5 依賴 func-1（已回答）→ func-5 可以出現
    // func-5 在這裡不影響 flow-4 的跳過邏輯

    // 現在 nextQuestion 應返回 flow-1（因為它是必問題且未回答）
    // 或是 flow-4 不應出現（因為 flow-1 未答）
    const q2 = nextQuestion(session2);
    // 返回的問題應該是 flow-1（必問題），而不是 flow-4（補充題，依賴 flow-1）
    expect(q2).not.toBeNull();
    // 如果返回的不是 null，它應該是 flow-1（必問題尚未回答）
    // 確認返回的問題不是 flow-4
    expect(q2.id).not.toBe('flow-4');
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 3: recordAnswer — 記錄回答
// ══════════════════════════════════════════════════════════════════

describe('Feature 3: recordAnswer', () => {
  test('Scenario: 正常記錄一個回答', () => {
    const session = init('feature-f', '/tmp/out');
    const updated = recordAnswer(session, 'func-1', '使用者可以新增待辦事項');

    expect(updated.answers['func-1']).toBe('使用者可以新增待辦事項');
    // 其他 answers 維持空
    const otherKeys = Object.keys(updated.answers).filter(k => k !== 'func-1');
    expect(otherKeys.length).toBe(0);
  });

  test('Scenario: 對同一 questionId 重複回答時覆蓋舊答案', () => {
    let session = init('feature-g', '/tmp/out');
    session = recordAnswer(session, 'func-1', '舊的回答');
    const updated = recordAnswer(session, 'func-1', '新的回答');

    expect(updated.answers['func-1']).toBe('新的回答');
    // 只有一筆 func-1
    const func1Keys = Object.keys(updated.answers).filter(k => k === 'func-1');
    expect(func1Keys.length).toBe(1);
  });

  test('Scenario: 回答為空字串時仍可記錄', () => {
    const session = init('feature-h', '/tmp/out');
    let updated;
    expect(() => {
      updated = recordAnswer(session, 'func-2', '');
    }).not.toThrow();

    expect(updated.answers['func-2']).toBe('');
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 4: isComplete — 完成度判斷
// ══════════════════════════════════════════════════════════════════

describe('Feature 4: isComplete', () => {
  test('Scenario: 每個必問面向均達到 minAnswersPerFacet 門檻時回傳 true', () => {
    let session = init('feature-i', '/tmp/out');
    // 每個必問面向回答 2 個必問題
    session = recordAnswer(session, 'func-1', 'A');
    session = recordAnswer(session, 'func-2', 'B');
    session = recordAnswer(session, 'flow-1', 'C');
    session = recordAnswer(session, 'flow-2', 'D');
    session = recordAnswer(session, 'edge-1', 'E');
    session = recordAnswer(session, 'edge-2', 'F');
    session = recordAnswer(session, 'acc-1', 'G');
    session = recordAnswer(session, 'acc-2', 'H');

    expect(isComplete(session)).toBe(true);
  });

  test('Scenario: 任一必問面向未達門檻時回傳 false', () => {
    let session = init('feature-j', '/tmp/out');
    // functional 只回答 1 個（門檻 2）
    session = recordAnswer(session, 'func-1', 'A');
    session = recordAnswer(session, 'flow-1', 'B');
    session = recordAnswer(session, 'flow-2', 'C');
    session = recordAnswer(session, 'edge-1', 'D');
    session = recordAnswer(session, 'edge-2', 'E');
    session = recordAnswer(session, 'acc-1', 'F');
    session = recordAnswer(session, 'acc-2', 'G');

    expect(isComplete(session)).toBe(false);
  });

  test('Scenario: ui 面向（全補充題）不影響完成度判斷', () => {
    let session = init('feature-k', '/tmp/out');
    // 四個必問面向各答 2 個，ui 面向不回答
    session = recordAnswer(session, 'func-1', 'A');
    session = recordAnswer(session, 'func-2', 'B');
    session = recordAnswer(session, 'flow-1', 'C');
    session = recordAnswer(session, 'flow-2', 'D');
    session = recordAnswer(session, 'edge-1', 'E');
    session = recordAnswer(session, 'edge-2', 'F');
    session = recordAnswer(session, 'acc-1', 'G');
    session = recordAnswer(session, 'acc-2', 'H');

    // ui 無回答，仍應完成
    expect(isComplete(session)).toBe(true);
  });

  test('Scenario: minAnswersPerFacet 為 3 時需要更多回答才算完成', () => {
    let session = init('feature-l', '/tmp/out', { minAnswersPerFacet: 3 });
    // 每個必問面向只答 2 個
    session = recordAnswer(session, 'func-1', 'A');
    session = recordAnswer(session, 'func-2', 'B');
    session = recordAnswer(session, 'flow-1', 'C');
    session = recordAnswer(session, 'flow-2', 'D');
    session = recordAnswer(session, 'edge-1', 'E');
    session = recordAnswer(session, 'edge-2', 'F');
    session = recordAnswer(session, 'acc-1', 'G');
    session = recordAnswer(session, 'acc-2', 'H');

    expect(isComplete(session)).toBe(false);
  });

  test('Scenario: 全新 session（無任何回答）時回傳 false', () => {
    const session = init('feature-m', '/tmp/out');
    expect(isComplete(session)).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 5: generateSpec — 產生 Project Spec
// ══════════════════════════════════════════════════════════════════

describe('Feature 5: generateSpec', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = makeTmpDir('gen-spec');
  });

  afterAll(() => {
    cleanTmpDir(tmpDir);
  });

  test('Scenario: 訪談完成後產生合法的 ProjectSpec 物件並寫入檔案', () => {
    const outputPath = path.join(tmpDir, 'test1');
    fs.mkdirSync(outputPath, { recursive: true });
    const session = makeCompletedSession(outputPath);

    const spec = generateSpec(session);

    // ProjectSpec 結構
    expect(spec.feature).toBe('test-feature');
    expect(new Date(spec.generatedAt).toISOString()).toBe(spec.generatedAt);
    // BDD 場景數 >= 10
    expect(spec.facets.acceptance.length).toBeGreaterThanOrEqual(10);

    // 檔案存在且非空
    const specFile = path.join(outputPath, 'project-spec.md');
    expect(fs.existsSync(specFile)).toBe(true);
    const content = fs.readFileSync(specFile, 'utf8');
    expect(content.length).toBeGreaterThan(0);
  });

  test('Scenario: BDD 場景數量不足 10 時自動從 edge-cases + acceptance 補充', () => {
    const outputPath = path.join(tmpDir, 'test2');
    fs.mkdirSync(outputPath, { recursive: true });

    // 只回答少量 acceptance（3 個）+ edge-cases（3 個）
    let session = init('sparse-feature', outputPath);
    session = recordAnswer(session, 'acc-1', '任務完成');
    session = recordAnswer(session, 'acc-2', '回應 < 200ms');
    session = recordAnswer(session, 'acc-3', '正常路徑通過。錯誤路徑顯示提示。邊界情況截斷。');
    session = recordAnswer(session, 'edge-1', '空白輸入。超長輸入。特殊字符輸入。');
    session = recordAnswer(session, 'edge-2', '極端情況處理。無效資料型態。');

    const spec = generateSpec(session);
    expect(spec.facets.acceptance.length).toBeGreaterThanOrEqual(10);
  });

  test('Scenario: 每個 BDD 場景均包含 title、given、when、then 欄位', () => {
    const outputPath = path.join(tmpDir, 'test3');
    fs.mkdirSync(outputPath, { recursive: true });
    const session = makeCompletedSession(outputPath);

    const spec = generateSpec(session);

    for (const scenario of spec.facets.acceptance) {
      expect(typeof scenario.title).toBe('string');
      expect(scenario.title.length).toBeGreaterThan(0);
      expect(typeof scenario.given).toBe('string');
      expect(scenario.given.length).toBeGreaterThan(0);
      expect(typeof scenario.when).toBe('string');
      expect(scenario.when.length).toBeGreaterThan(0);
      expect(typeof scenario.then).toBe('string');
      expect(scenario.then.length).toBeGreaterThan(0);
    }
  });

  test('Scenario: outputPath 無寫入權限時拋出 WRITE_ERROR', () => {
    // 使用不存在且無法建立的路徑（根目錄下的子目錄）
    const noPermPath = '/no-permission-dir-interview-test';
    const session = makeCompletedSession(noPermPath);

    expect(() => generateSpec(session)).toThrow();

    try {
      generateSpec(session);
    } catch (err) {
      expect(err.message).toContain('WRITE_ERROR');
      expect(err.message).toContain(noPermPath);
    }
  });

  test('Scenario: 產生的 project-spec.md 包含 Markdown GIVEN/WHEN/THEN 格式', () => {
    const outputPath = path.join(tmpDir, 'test5');
    fs.mkdirSync(outputPath, { recursive: true });
    const session = makeCompletedSession(outputPath);

    generateSpec(session);

    const content = fs.readFileSync(path.join(outputPath, 'project-spec.md'), 'utf8');
    expect(content).toContain('GIVEN');
    expect(content).toContain('WHEN');
    expect(content).toContain('THEN');
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 6: loadSession / saveSession — 中斷恢復
// ══════════════════════════════════════════════════════════════════

describe('Feature 6: loadSession / saveSession', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = makeTmpDir('session-persist');
  });

  afterAll(() => {
    cleanTmpDir(tmpDir);
  });

  test('Scenario: saveSession 將 session 寫入指定路徑', () => {
    const statePath = path.join(tmpDir, 'interview-state.json');
    let session = init('save-test', '/tmp/out');
    session = recordAnswer(session, 'func-1', '測試回答');

    saveSession(session, statePath);

    expect(fs.existsSync(statePath)).toBe(true);
    const raw = fs.readFileSync(statePath, 'utf8');
    const data = JSON.parse(raw);
    expect(data.version).toBe(1);
    expect(data.featureName).toBe('save-test');
    expect(data.answers['func-1']).toBe('測試回答');
  });

  test('Scenario: loadSession 從已有狀態檔還原 session', () => {
    const statePath = path.join(tmpDir, 'interview-state-load.json');
    let session = init('load-test', '/tmp/out', { minAnswersPerFacet: 3 });
    session = recordAnswer(session, 'func-1', '還原測試');
    session = recordAnswer(session, 'func-2', '第二個回答');

    saveSession(session, statePath);

    const restored = loadSession(statePath);

    expect(restored).not.toBeNull();
    expect(restored.featureName).toBe('load-test');
    expect(restored.answers['func-1']).toBe('還原測試');
    expect(restored.answers['func-2']).toBe('第二個回答');
    expect(restored.options.minAnswersPerFacet).toBe(3);
  });

  test('Scenario: 狀態檔不存在時回傳 null', () => {
    const statePath = path.join(tmpDir, 'nonexistent-state.json');
    const result = loadSession(statePath);
    expect(result).toBeNull();
  });

  test('Scenario: 狀態檔內容損壞（非合法 JSON）時回傳 null', () => {
    const statePath = path.join(tmpDir, 'broken-state.json');
    fs.writeFileSync(statePath, '{ broken json', 'utf8');

    const result = loadSession(statePath);
    expect(result).toBeNull();
  });

  test('Scenario: 中斷恢復完整流程', () => {
    const statePath = path.join(tmpDir, 'interview-state-resume.json');
    let session = init('resume-test', '/tmp/out');

    // 回答 3 個問題
    session = recordAnswer(session, 'func-1', '回答一');
    session = recordAnswer(session, 'func-2', '回答二');
    session = recordAnswer(session, 'func-3', '回答三');

    saveSession(session, statePath);

    // 還原 session
    const restored = loadSession(statePath);
    expect(restored).not.toBeNull();

    // 繼續取得下一個問題
    const q = nextQuestion(restored);

    // 返回的問題不是已回答的 3 個問題之一
    const answeredIds = ['func-1', 'func-2', 'func-3'];
    expect(answeredIds).not.toContain(q.id);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 7: 問題庫結構完整性
// ══════════════════════════════════════════════════════════════════

describe('Feature 7: 問題庫結構完整性', () => {
  test('Scenario: 問題庫包含五個面向的問題（含最低題數）', () => {
    const byFacet = facet => QUESTION_BANK.filter(q => q.facet === facet);
    const reqCount = facet => QUESTION_BANK.filter(q => q.facet === facet && q.required).length;
    const optCount = facet => QUESTION_BANK.filter(q => q.facet === facet && !q.required).length;

    // functional：至少 3 必問 + 2 補充
    expect(reqCount('functional')).toBeGreaterThanOrEqual(3);
    expect(optCount('functional')).toBeGreaterThanOrEqual(2);

    // flow：至少 2 必問 + 2 補充（BDD spec 說 2 必問）
    expect(reqCount('flow')).toBeGreaterThanOrEqual(2);
    expect(optCount('flow')).toBeGreaterThanOrEqual(2);

    // ui：0 必問 + 至少 3 補充
    expect(reqCount('ui')).toBe(0);
    expect(optCount('ui')).toBeGreaterThanOrEqual(3);

    // edge-cases：至少 2 必問 + 2 補充
    expect(reqCount('edge-cases')).toBeGreaterThanOrEqual(2);
    expect(optCount('edge-cases')).toBeGreaterThanOrEqual(2);

    // acceptance：至少 3 必問 + 2 補充
    expect(reqCount('acceptance')).toBeGreaterThanOrEqual(3);
    expect(optCount('acceptance')).toBeGreaterThanOrEqual(2);

    // 五個面向都有題目
    const facets = ['functional', 'flow', 'ui', 'edge-cases', 'acceptance'];
    for (const f of facets) {
      expect(byFacet(f).length).toBeGreaterThan(0);
    }
  });

  test('Scenario: 所有問題的 id 符合格式規範且唯一', () => {
    const ids = QUESTION_BANK.map(q => q.id);

    // 每個 id 符合 /^[a-z-]+-\d+$/
    for (const id of ids) {
      expect(id).toMatch(/^[a-z-]+-\d+$/);
    }

    // 所有 id 唯一
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  test('Scenario: 問題庫總題數在 15 到 30 之間', () => {
    expect(QUESTION_BANK.length).toBeGreaterThanOrEqual(15);
    expect(QUESTION_BANK.length).toBeLessThanOrEqual(30);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 8: 邊界條件與防禦性行為
// ══════════════════════════════════════════════════════════════════

describe('Feature 8: 邊界條件與防禦性行為', () => {
  test('Scenario: nextQuestion 在 session.answers 為 null 時不崩潰', () => {
    const session = {
      featureName: 'test',
      outputPath: '/tmp',
      answers: null,
      startedAt: new Date().toISOString(),
      options: { minAnswersPerFacet: 2, skipFacets: [] },
    };

    let result;
    expect(() => {
      result = nextQuestion(session);
    }).not.toThrow();

    // 回傳 Question 或 null（合理處理）
    expect(result === null || typeof result === 'object').toBe(true);
  });

  test('Scenario: recordAnswer 不改變傳入的原始 session 物件（純函式）', () => {
    let session = init('pure-test', '/tmp/out');
    session = recordAnswer(session, 'func-1', '第一個回答');

    const originalAnswers = { ...session.answers };
    const updated = recordAnswer(session, 'func-2', '答案');

    // 原始 session 不變
    expect(session.answers).toEqual(originalAnswers);
    expect(Object.prototype.hasOwnProperty.call(session.answers, 'func-2')).toBe(false);

    // 新 session 有新答案
    expect(updated.answers['func-2']).toBe('答案');
    expect(updated.answers['func-1']).toBe('第一個回答');
  });

  test('Scenario: 多次呼叫 generateSpec 不產生重複檔案衝突', () => {
    const tmpDir2 = makeTmpDir('gen-spec-multi');
    try {
      const outputPath = path.join(tmpDir2, 'multi-spec');
      fs.mkdirSync(outputPath, { recursive: true });
      const session = makeCompletedSession(outputPath);

      // 第一次產生
      const spec1 = generateSpec(session);
      const specFile = path.join(outputPath, 'project-spec.md');
      const mtime1 = fs.statSync(specFile).mtimeMs;

      // 稍等確保時間戳不同
      // eslint-disable-next-line no-promise-executor-return
      const wait = (ms) => new Promise(r => setTimeout(r, ms));

      // 第二次產生（覆蓋）
      let spec2;
      expect(() => {
        spec2 = generateSpec(session);
      }).not.toThrow();

      expect(fs.existsSync(specFile)).toBe(true);
      // 新的 generatedAt 應不早於舊的
      expect(new Date(spec2.generatedAt) >= new Date(spec1.generatedAt)).toBe(true);
    } finally {
      cleanTmpDir(tmpDir2);
    }
  });
});
