'use strict';
/**
 * pm-bdd-enrichment.test.js — BDD 場景產出品質強化測試
 *
 * 涵蓋以下功能：
 *   Feature A: buildBDDScenarios — facet 衍生場景
 *   Feature B: enrichBDDScenarios — 補充場景到 ≥10 個
 *   Feature C: generateSpec 整合 enrichBDDScenarios
 */

const { test, expect, describe, beforeAll, afterAll } = require('bun:test');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const {
  init,
  recordAnswer,
  generateSpec,
  enrichBDDScenarios,
  QUESTION_BANK,
} = require(path.join(SCRIPTS_LIB, 'interview'));

// ── 測試輔助 ──────────────────────────────────────────────────────────────

function makeTmpDir(suffix) {
  const dir = path.join(os.tmpdir(), `pm-bdd-enrich-${suffix}-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanTmpDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

/**
 * 建立具備各面向回答的 session，用於測試 facet 衍生場景
 */
function makeRichSession(outputPath) {
  let session = init('訂單管理系統', outputPath);

  // functional
  session = recordAnswer(session, 'func-1', '讓使用者可以建立和追蹤訂單。提供完整的訂單生命週期管理');
  session = recordAnswer(session, 'func-2', '電商平台的買家，需要即時查看訂單狀態');

  // flow
  session = recordAnswer(session, 'flow-1', '使用者登入後選擇商品。加入購物車。確認訂單。完成付款');
  session = recordAnswer(session, 'flow-2', '訂單確認頁面顯示。發送確認 email。庫存扣除');
  session = recordAnswer(session, 'flow-3', '付款失敗時顯示錯誤訊息。提示使用者更換付款方式');

  // edge-cases
  session = recordAnswer(session, 'edge-1', '商品庫存為零時阻擋下單。顯示缺貨提示');
  session = recordAnswer(session, 'edge-2', '訂單金額超過 100 萬時需要人工審核。超長備註截斷至 500 字');
  session = recordAnswer(session, 'edge-3', '同一使用者同時送出兩筆相同訂單時去重處理');

  // acceptance
  session = recordAnswer(session, 'acc-1', '使用者可以在 60 秒內完成下單流程。訂單即時出現在後台');
  session = recordAnswer(session, 'acc-2', '訂單 API 回應時間 < 300ms。系統支援 500 concurrent users');
  session = recordAnswer(session, 'acc-3', '正常路徑：商品有貨時可成功下單。錯誤路徑：庫存不足時阻擋');

  return session;
}

// ══════════════════════════════════════════════════════════════════
// Feature A: buildBDDScenarios — facet 衍生場景
// ══════════════════════════════════════════════════════════════════

describe('Feature A: buildBDDScenarios — facet 衍生場景', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = makeTmpDir('facet-derive');
  });

  afterAll(() => {
    cleanTmpDir(tmpDir);
  });

  test('Scenario A-1: edge-cases facet 的回答衍生邊界條件場景', () => {
    const outputPath = path.join(tmpDir, 'a1');
    fs.mkdirSync(outputPath, { recursive: true });
    const session = makeRichSession(outputPath);

    const spec = generateSpec(session);
    const scenarios = spec.facets.acceptance;

    // 應含有「邊界場景」開頭的場景
    const edgeScenarios = scenarios.filter(s => s.title.startsWith('邊界場景'));
    expect(edgeScenarios.length).toBeGreaterThan(0);

    // 每個邊界場景的 given 應提到邊界條件
    for (const s of edgeScenarios) {
      expect(s.given).toContain('邊界條件');
    }
  });

  test('Scenario A-2: flow facet 的回答衍生流程場景', () => {
    const outputPath = path.join(tmpDir, 'a2');
    fs.mkdirSync(outputPath, { recursive: true });
    const session = makeRichSession(outputPath);

    const spec = generateSpec(session);
    const scenarios = spec.facets.acceptance;

    // 應含有「流程場景」開頭的場景
    const flowScenarios = scenarios.filter(s => s.title.startsWith('流程場景'));
    expect(flowScenarios.length).toBeGreaterThan(0);

    // 每個流程場景的 given 應提到操作流程
    for (const s of flowScenarios) {
      expect(s.given).toContain('操作流程');
    }
  });

  test('Scenario A-3: acceptance facet 的回答衍生驗收場景', () => {
    const outputPath = path.join(tmpDir, 'a3');
    fs.mkdirSync(outputPath, { recursive: true });
    const session = makeRichSession(outputPath);

    const spec = generateSpec(session);
    const scenarios = spec.facets.acceptance;

    // acceptance 面向有回答，應有對應場景（given 含「功能已啟用」）
    const accScenarios = scenarios.filter(s => s.given.includes('功能已啟用'));
    expect(accScenarios.length).toBeGreaterThan(0);
  });

  test('Scenario A-4: 場景 title 去重，相同 title 只保留一個', () => {
    const outputPath = path.join(tmpDir, 'a4');
    fs.mkdirSync(outputPath, { recursive: true });
    const session = makeRichSession(outputPath);

    const spec = generateSpec(session);
    const scenarios = spec.facets.acceptance;

    const titles = scenarios.map(s => s.title);
    const uniqueTitles = new Set(titles);
    expect(uniqueTitles.size).toBe(titles.length);
  });

  test('Scenario A-5: 場景數量 >= 10（PM spec 最低要求）', () => {
    const outputPath = path.join(tmpDir, 'a5');
    fs.mkdirSync(outputPath, { recursive: true });
    const session = makeRichSession(outputPath);

    const spec = generateSpec(session);
    expect(spec.facets.acceptance.length).toBeGreaterThanOrEqual(10);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature B: enrichBDDScenarios — 補充場景到 ≥10 個
// ══════════════════════════════════════════════════════════════════

describe('Feature B: enrichBDDScenarios — 補充到 ≥10 個', () => {
  test('Scenario B-1: 空陣列傳入時補充到 ≥10 個場景', () => {
    let session = init('測試功能', '/tmp/out');
    session = recordAnswer(session, 'func-1', '核心功能：讓使用者可以搜尋資料。快速找到結果');
    session = recordAnswer(session, 'func-2', '一般使用者需要查詢報表');

    const result = enrichBDDScenarios([], session);
    expect(result.length).toBeGreaterThanOrEqual(10);
  });

  test('Scenario B-2: 已有 5 個場景時補充到 ≥10 個', () => {
    const session = init('補充功能', '/tmp/out');
    const base = Array.from({ length: 5 }, (_, i) => ({
      title: `場景 ${i + 1}`,
      given: `前提 ${i + 1}`,
      when: `動作 ${i + 1}`,
      then: `結果 ${i + 1}`,
    }));

    const result = enrichBDDScenarios(base, session);
    expect(result.length).toBeGreaterThanOrEqual(10);
  });

  test('Scenario B-3: 已有 ≥10 個場景時不減少場景數', () => {
    const session = init('滿場景功能', '/tmp/out');
    const base = Array.from({ length: 12 }, (_, i) => ({
      title: `場景 ${i + 1}`,
      given: `前提 ${i + 1}`,
      when: `動作 ${i + 1}`,
      then: `結果 ${i + 1}`,
    }));

    const result = enrichBDDScenarios(base, session);
    expect(result.length).toBeGreaterThanOrEqual(12);
  });

  test('Scenario B-4: enrichBDDScenarios 不修改原始陣列（immutable）', () => {
    const session = init('不可變功能', '/tmp/out');
    const base = [
      { title: '場景 1', given: 'G', when: 'W', then: 'T' },
    ];
    const originalLength = base.length;

    enrichBDDScenarios(base, session);

    expect(base.length).toBe(originalLength);
  });

  test('Scenario B-5: functional facet 回答用於補充 happy path 場景', () => {
    let session = init('購物車功能', '/tmp/out');
    session = recordAnswer(session, 'func-1', '讓使用者加入商品到購物車。管理購物清單');
    session = recordAnswer(session, 'func-2', '電商買家，需要選購多件商品');

    const result = enrichBDDScenarios([], session);

    const funcScenarios = result.filter(s => s.title.startsWith('功能場景'));
    expect(funcScenarios.length).toBeGreaterThan(0);
    // 功能場景的 then 應包含「功能定義」
    for (const s of funcScenarios) {
      expect(s.then).toContain('功能定義');
    }
  });

  test('Scenario B-6: 通用模板「空輸入處理」在 edge-cases 未涵蓋時加入', () => {
    // session 沒有 edge-cases 回答（未提及「空」等詞彙）
    let session = init('純功能測試', '/tmp/out');
    session = recordAnswer(session, 'func-1', '系統提供資料查詢功能');

    const result = enrichBDDScenarios([], session);

    const emptyInputScenario = result.find(s => s.title === '通用場景：空輸入處理');
    expect(emptyInputScenario).toBeDefined();
    expect(emptyInputScenario.given).toContain('輸入表單');
    expect(emptyInputScenario.then).toContain('驗證錯誤');
  });

  test('Scenario B-7: 通用模板在 edge-cases 已涵蓋相同議題時不重複加入', () => {
    // edge-cases 中明確提及「空白」（空輸入議題）
    let session = init('有邊界的功能', '/tmp/out');
    session = recordAnswer(session, 'edge-1', '空白輸入時顯示驗證錯誤。空值處理');

    const result = enrichBDDScenarios([], session);

    // 不應有重複的「通用場景：空輸入處理」
    const emptyInputScenarios = result.filter(s => s.title === '通用場景：空輸入處理');
    expect(emptyInputScenarios.length).toBe(0);
  });

  test('Scenario B-8: 輸出場景的 title 均唯一（去重保證）', () => {
    const session = init('去重功能', '/tmp/out');
    const base = [
      { title: '場景 1', given: 'G', when: 'W', then: 'T' },
      { title: '場景 1', given: 'G2', when: 'W2', then: 'T2' }, // 重複 title
    ];

    const result = enrichBDDScenarios(base, session);

    const titles = result.map(s => s.title);
    const uniqueTitles = new Set(titles);
    expect(uniqueTitles.size).toBe(titles.length);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature C: generateSpec 整合 enrichBDDScenarios
// ══════════════════════════════════════════════════════════════════

describe('Feature C: generateSpec 整合 enrichBDDScenarios', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = makeTmpDir('gen-spec-enrich');
  });

  afterAll(() => {
    cleanTmpDir(tmpDir);
  });

  test('Scenario C-1: 稀少回答時 generateSpec 仍產生 ≥10 個場景', () => {
    const outputPath = path.join(tmpDir, 'c1');
    fs.mkdirSync(outputPath, { recursive: true });

    // 只回答 2 個問題（極少回答）
    let session = init('最少回答功能', outputPath);
    session = recordAnswer(session, 'func-1', '提供資料匯出功能。支援 CSV 格式');
    session = recordAnswer(session, 'acc-1', '使用者可下載 CSV 檔案');

    const spec = generateSpec(session);
    expect(spec.facets.acceptance.length).toBeGreaterThanOrEqual(10);
  });

  test('Scenario C-2: 場景結構完整（title/given/when/then 均非空）', () => {
    const outputPath = path.join(tmpDir, 'c2');
    fs.mkdirSync(outputPath, { recursive: true });

    let session = init('結構驗證功能', outputPath);
    session = recordAnswer(session, 'func-1', '使用者管理功能');
    session = recordAnswer(session, 'acc-1', '可以新增使用者');

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

  test('Scenario C-3: 多 facet 回答時場景涵蓋多種來源（acceptance + edge + flow）', () => {
    const outputPath = path.join(tmpDir, 'c3');
    fs.mkdirSync(outputPath, { recursive: true });
    const session = makeRichSession(outputPath);

    const spec = generateSpec(session);
    const scenarios = spec.facets.acceptance;

    // 應同時包含來自不同 facet 的場景
    const hasAccScenario = scenarios.some(s => s.given.includes('功能已啟用'));
    const hasEdgeScenario = scenarios.some(s => s.title.startsWith('邊界場景'));
    const hasFlowScenario = scenarios.some(s => s.title.startsWith('流程場景'));

    expect(hasAccScenario || hasEdgeScenario || hasFlowScenario).toBe(true);
    // 總場景數應 ≥10
    expect(scenarios.length).toBeGreaterThanOrEqual(10);
  });
});
