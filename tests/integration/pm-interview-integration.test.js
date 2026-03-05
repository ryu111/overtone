'use strict';
/**
 * pm-interview-integration.test.js — PM 訪談引擎整合測試
 *
 * 驗證完整訪談流程，使用真實 interview.js API（不 mock）。
 *
 * 流程：loadSession（首次返回 null）→ init → nextQuestion 循環 → recordAnswer
 *      → isComplete → generateSpec → 確認 project-spec.md 寫入正確
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
} = require(path.join(SCRIPTS_LIB, 'interview'));

// ── 測試輔助 ──────────────────────────────────────────────────────────────

function makeTmpDir(suffix) {
  const dir = path.join(os.tmpdir(), `pm-interview-int-${suffix}-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanTmpDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

// ── 整合測試 ──────────────────────────────────────────────────────────────

describe('整合測試：完整訪談流程', () => {
  let tmpDir;
  let outputPath;
  let statePath;

  beforeAll(() => {
    tmpDir = makeTmpDir('full-flow');
    outputPath = path.join(tmpDir, 'output');
    statePath = path.join(tmpDir, 'interview-state.json');
    fs.mkdirSync(outputPath, { recursive: true });
  });

  afterAll(() => {
    cleanTmpDir(tmpDir);
  });

  test('Step 1: loadSession 首次呼叫（狀態檔不存在）回傳 null', () => {
    const result = loadSession(statePath);
    expect(result).toBeNull();
  });

  test('Step 2: init 建立新 session，結構符合預期', () => {
    const session = init('task-manager', outputPath);

    expect(session.featureName).toBe('task-manager');
    expect(session.outputPath).toBe(outputPath);
    expect(session.answers).toEqual({});
    expect(new Date(session.startedAt).toISOString()).toBe(session.startedAt);
    expect(session.completedAt).toBeUndefined();
    expect(session.options.minAnswersPerFacet).toBe(2);
  });

  test('Step 3: 全新 session 的 isComplete 回傳 false', () => {
    const session = init('task-manager', outputPath);
    expect(isComplete(session)).toBe(false);
  });

  test('Step 4: nextQuestion 循環 → recordAnswer → isComplete 達成完整訪談流程', () => {
    let session = init('task-manager', outputPath);

    // 預設回答集：確保必問面向各達 minAnswersPerFacet(=2) 門檻
    const answerMap = {
      'func-1': '使用者可以建立、編輯、刪除和檢視待辦事項',
      'func-2': '一般使用者在日常工作中管理任務',
      'func-3': '輸入任務名稱和截止日期，輸出已儲存的任務列表',
      'flow-1': '1. 點擊新增 2. 填寫表單 3. 確認送出 4. 列表更新',
      'flow-2': '顯示成功提示，任務出現在列表頂部',
      'flow-3': '顯示錯誤訊息，輸入欄位標記紅色，資料不儲存',
      'edge-1': '空白任務名稱時顯示「名稱不可為空」驗證錯誤',
      'edge-2': '超過 200 字元的任務名稱自動截斷，提示使用者',
      'edge-3': '使用樂觀鎖（optimistic lock）處理並發衝突，衝突時通知使用者',
      'acc-1': '功能完成定義：使用者能在 3 步驟內完成任務建立，成功率 > 95%',
      'acc-2': '回應時間 < 200ms，每秒支援 1000 concurrent requests',
      'acc-3': '正常路徑：建立任務成功。錯誤路徑：空白輸入顯示提示。邊界：超長字串截斷',
    };

    let questionCount = 0;
    let q = nextQuestion(session);

    // 循環直到 isComplete 或無更多必問題
    while (q !== null && !isComplete(session)) {
      expect(q.id).toBeTruthy();
      expect(['functional', 'flow', 'ui', 'edge-cases', 'acceptance']).toContain(q.facet);

      const answer = answerMap[q.id] || `預設回答 for ${q.id}`;
      session = recordAnswer(session, q.id, answer);
      questionCount++;

      // 防止無限迴圈
      if (questionCount > 30) break;

      q = nextQuestion(session);
    }

    // 訪談應已完成
    expect(isComplete(session)).toBe(true);
    // 至少回答了 8 個問題（四面向各 2 個必問）
    expect(Object.keys(session.answers).length).toBeGreaterThanOrEqual(8);
  });

  test('Step 5: saveSession 儲存 session 到狀態檔', () => {
    let session = init('task-manager', outputPath);
    session = recordAnswer(session, 'func-1', '使用者管理任務');
    session = recordAnswer(session, 'func-2', '日常使用者');

    saveSession(session, statePath);

    expect(fs.existsSync(statePath)).toBe(true);
    const raw = fs.readFileSync(statePath, 'utf8');
    const data = JSON.parse(raw);
    expect(data.version).toBe(1);
    expect(data.featureName).toBe('task-manager');
    expect(data.answers['func-1']).toBe('使用者管理任務');
  });

  test('Step 6: loadSession 從狀態檔還原 session（中斷恢復）', () => {
    // 先儲存一個有回答的 session
    let session = init('task-manager', outputPath, { minAnswersPerFacet: 2 });
    session = recordAnswer(session, 'func-1', '使用者管理任務');
    session = recordAnswer(session, 'func-2', '日常使用者');
    session = recordAnswer(session, 'flow-1', '步驟 1→2→3');
    saveSession(session, statePath);

    // 還原
    const restored = loadSession(statePath);
    expect(restored).not.toBeNull();
    expect(restored.featureName).toBe('task-manager');
    expect(restored.answers['func-1']).toBe('使用者管理任務');
    expect(restored.answers['func-2']).toBe('日常使用者');
    expect(restored.answers['flow-1']).toBe('步驟 1→2→3');
    expect(restored.options.minAnswersPerFacet).toBe(2);

    // 還原後的 nextQuestion 不應返回已回答的問題
    const nextQ = nextQuestion(restored);
    if (nextQ !== null) {
      expect(['func-1', 'func-2', 'flow-1']).not.toContain(nextQ.id);
    }
  });

  test('Step 7: generateSpec 從完成的 session 產生 project-spec.md', () => {
    // 建立一個完成的 session
    let session = init('task-manager', outputPath);
    session = recordAnswer(session, 'func-1', '使用者可以建立、編輯、刪除和檢視待辦事項');
    session = recordAnswer(session, 'func-2', '一般使用者在日常工作中管理任務');
    session = recordAnswer(session, 'flow-1', '1. 點擊新增 2. 填寫表單 3. 確認送出 4. 列表更新');
    session = recordAnswer(session, 'flow-2', '顯示成功提示，任務出現在列表頂部');
    session = recordAnswer(session, 'edge-1', '空白任務名稱時顯示驗證錯誤');
    session = recordAnswer(session, 'edge-2', '超過 200 字元的任務名稱自動截斷');
    session = recordAnswer(session, 'acc-1', '功能完成定義：使用者能在 3 步驟內完成任務建立');
    session = recordAnswer(session, 'acc-2', '回應時間 < 200ms，每秒支援 1000 concurrent requests');
    session = recordAnswer(session, 'acc-3', '正常路徑：建立任務成功。錯誤路徑：空白輸入顯示提示。邊界：超長字串截斷');

    expect(isComplete(session)).toBe(true);

    const spec = generateSpec(session);

    // 驗證 ProjectSpec 結構
    expect(spec.feature).toBe('task-manager');
    expect(new Date(spec.generatedAt).toISOString()).toBe(spec.generatedAt);
    expect(spec.facets.acceptance.length).toBeGreaterThanOrEqual(10);

    // 驗證每個 BDD 場景包含必要欄位
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

    // 驗證 project-spec.md 寫入
    const specFile = path.join(outputPath, 'project-spec.md');
    expect(fs.existsSync(specFile)).toBe(true);
    const content = fs.readFileSync(specFile, 'utf8');
    expect(content.length).toBeGreaterThan(0);
    expect(content).toContain('GIVEN');
    expect(content).toContain('WHEN');
    expect(content).toContain('THEN');
    expect(content).toContain('task-manager');
  });
});

describe('整合測試：邊界條件與異常情境', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = makeTmpDir('edge');
  });

  afterAll(() => {
    cleanTmpDir(tmpDir);
  });

  test('狀態檔損壞時 loadSession 回傳 null，不中斷流程', () => {
    const corruptPath = path.join(tmpDir, 'corrupt-state.json');
    fs.writeFileSync(corruptPath, '{ invalid json', 'utf8');

    const result = loadSession(corruptPath);
    expect(result).toBeNull();

    // 可以正常重新 init
    const session = init('recovery-feature', path.join(tmpDir, 'output'));
    expect(session.featureName).toBe('recovery-feature');
  });

  test('多次呼叫 generateSpec 覆蓋既有 project-spec.md', () => {
    const outputPath = path.join(tmpDir, 'multi-gen');
    fs.mkdirSync(outputPath, { recursive: true });

    let session = init('multi-gen-feature', outputPath);
    session = recordAnswer(session, 'func-1', '功能一');
    session = recordAnswer(session, 'func-2', '功能二');
    session = recordAnswer(session, 'flow-1', '流程一');
    session = recordAnswer(session, 'flow-2', '流程二');
    session = recordAnswer(session, 'edge-1', '邊界一');
    session = recordAnswer(session, 'edge-2', '邊界二');
    session = recordAnswer(session, 'acc-1', '驗收一');
    session = recordAnswer(session, 'acc-2', '驗收二');
    session = recordAnswer(session, 'acc-3', '正常路徑完成。錯誤路徑提示。邊界截斷。');

    const spec1 = generateSpec(session);
    const specFile = path.join(outputPath, 'project-spec.md');
    expect(fs.existsSync(specFile)).toBe(true);

    // 再次呼叫不應拋出錯誤
    let spec2;
    expect(() => {
      spec2 = generateSpec(session);
    }).not.toThrow();

    // 新的 generatedAt 不早於舊的
    expect(new Date(spec2.generatedAt) >= new Date(spec1.generatedAt)).toBe(true);
    expect(fs.existsSync(specFile)).toBe(true);
  });

  test('nextQuestion 在 answers 為 null 時不崩潰', () => {
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

    expect(result === null || typeof result === 'object').toBe(true);
  });
});
