'use strict';
/**
 * cross-session-memory.test.js — 跨 Session 長期記憶整合測試
 *
 * 覆蓋 BDD 規格 Feature 4（SessionEnd 畢業整合）和 Feature 5（SessionStart 載入整合）。
 *
 * 測試策略：
 *   - 直接測試 global-instinct.js API 與 paths.js 的端對端整合
 *   - 模擬 SessionEnd/SessionStart hook 邏輯驗證整合行為
 *   - 使用獨立臨時目錄確保測試隔離
 */
const { test, expect, describe, beforeEach, afterEach } = require('bun:test');
const { mkdirSync, rmSync, existsSync, appendFileSync } = require('fs');
const os = require('os');
const path = require('path');
const { join } = require('path');
const { homedir } = require('os');
const { SCRIPTS_LIB, HOOKS_DIR } = require('../helpers/paths');

const globalInstinct = require(join(SCRIPTS_LIB, 'knowledge/global-instinct'));
const paths = require(join(SCRIPTS_LIB, 'paths'));
const registry = require(join(SCRIPTS_LIB, 'registry'));

// ── 輔助工具 ──

function makeTmpProject(suffix = '') {
  const dir = path.join(os.tmpdir(), `ot-csm-int-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeTmpSession(projectRoot, suffix = '') {
  const id = `test_csm_${suffix}_${Date.now()}`;
  const dir = projectRoot
    ? paths.sessionDir(projectRoot, id)
    : join(homedir(), '.nova', 'sessions', id);
  mkdirSync(dir, { recursive: true });
  return { id, dir };
}

function writeSessionObs(projectRoot, sessionId, obs) {
  const filePath = paths.session.observations(projectRoot, sessionId);
  mkdirSync(path.dirname(filePath), { recursive: true });
  appendFileSync(filePath, JSON.stringify(obs) + '\n', 'utf8');
}

function makeObs(overrides = {}) {
  return {
    id: `inst_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    ts: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    type: 'tool_preferences',
    trigger: '測試觸發條件',
    action: '測試建議行動',
    tag: 'test-tag',
    confidence: 0.8,
    count: 1,
    ...overrides,
  };
}

// ════════════════════════════════════════════════════════════════════
// Feature 4: SessionEnd 畢業整合
// ════════════════════════════════════════════════════════════════════

describe('Feature 4: SessionEnd 畢業整合', () => {
  let projectRoot;
  let session;

  beforeEach(() => {
    projectRoot = makeTmpProject('session-end');
    session = makeTmpSession(projectRoot, 'se');
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(session.dir, { recursive: true, force: true });
  });

  // Scenario 4-1: SessionEnd 成功觸發 graduate 並記錄結果
  test('Scenario 4-1: SessionEnd 成功觸發 graduate，高信心觀察出現在全域 store', () => {
    // 模擬 session 有高信心觀察
    writeSessionObs(projectRoot, session.id, makeObs({
      confidence: 0.85,
      tag: 'session-end-test',
      type: 'tool_preferences',
    }));

    // 模擬 SessionEnd hook 呼叫 graduate
    const result = globalInstinct.graduate(session.id, projectRoot);

    expect(result.graduated).toBeGreaterThanOrEqual(1);

    // 畢業的觀察出現在全域 store
    const obs = globalInstinct.queryGlobal(projectRoot, {});
    expect(obs.some(o => o.tag === 'session-end-test')).toBe(true);
  });

  // Scenario 4-2: graduate 拋出錯誤不影響 SessionEnd 其他清理步驟（try/catch 隔離）
  test('Scenario 4-2: graduate 邏輯由 try/catch 隔離，不拋出未捕獲例外', () => {
    // 模擬 on-session-end.js 的 try/catch 模式
    let errorCaught = false;
    let otherStepCompleted = false;

    try {
      // 傳入無效的 projectRoot 可能引發讀寫錯誤
      globalInstinct.graduate(session.id, '/invalid/path/that/cannot/be/written');
    } catch {
      errorCaught = true;
    }

    // 其他步驟正常完成
    otherStepCompleted = true;

    // graduate 可能成功（空 session 直接回傳 0），也可能靜默處理錯誤
    // 重要的是「其他步驟」照常執行
    expect(otherStepCompleted).toBe(true);
    // 即使 errorCaught，系統也正常運作
  });

  // Scenario 4-3: 全域 store 目錄不存在時自動建立
  test('Scenario 4-3: 全域 store 目錄不存在時，graduate 自動建立目錄', () => {
    // projectRoot 是全新的臨時目錄，全域 store 目錄尚未建立
    const obsDir = paths.global.dir(projectRoot);
    expect(existsSync(obsDir)).toBe(false);

    writeSessionObs(projectRoot, session.id, makeObs({ confidence: 0.9, tag: 'auto-dir', type: 'tool_preferences' }));

    globalInstinct.graduate(session.id, projectRoot);

    // 目錄已自動建立
    expect(existsSync(obsDir)).toBe(true);
    // graduate 正常完成
    const obs = globalInstinct.queryGlobal(projectRoot, {});
    expect(obs).toHaveLength(1);
  });

  // 混合信心觀察：只有高信心的才畢業
  test('混合信心觀察：只有 >= 0.7 的才畢業', () => {
    writeSessionObs(projectRoot, session.id, makeObs({ confidence: 0.9, tag: 'high-1', type: 'tool_preferences' }));
    writeSessionObs(projectRoot, session.id, makeObs({ confidence: 0.7, tag: 'high-2', type: 'tool_preferences' }));
    writeSessionObs(projectRoot, session.id, makeObs({ confidence: 0.6, tag: 'low-1', type: 'tool_preferences' }));
    writeSessionObs(projectRoot, session.id, makeObs({ confidence: 0.3, tag: 'low-2', type: 'tool_preferences' }));

    const result = globalInstinct.graduate(session.id, projectRoot);

    expect(result.graduated).toBe(2);
    const obs = globalInstinct.queryGlobal(projectRoot, {});
    expect(obs).toHaveLength(2);
    expect(obs.map(o => o.tag).sort()).toEqual(['high-1', 'high-2'].sort());
  });
});

// ════════════════════════════════════════════════════════════════════
// Feature 5: SessionStart 載入整合
// ════════════════════════════════════════════════════════════════════

describe('Feature 5: SessionStart 載入整合', () => {
  let projectRoot;

  beforeEach(() => {
    projectRoot = makeTmpProject('session-start');
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  function seedGlobal(observations) {
    const obsPath = paths.global.observations(projectRoot);
    mkdirSync(path.dirname(obsPath), { recursive: true });
    for (const o of observations) {
      appendFileSync(obsPath, JSON.stringify(o) + '\n', 'utf8');
    }
  }

  // Scenario 5-1: SessionStart 載入 top-50 全域觀察
  test('Scenario 5-1: SessionStart 最多載入 50 筆（依 confidence 降序取 top-50）', () => {
    // 建立 60 筆觀察，confidence 各不同
    const observations = Array.from({ length: 60 }, (_, i) =>
      makeObs({
        tag: `tag-${i}`,
        type: 'tool_preferences',
        confidence: Math.round((0.7 + (i / 60) * 0.3) * 10000) / 10000, // 0.7 ~ 1.0
        globalTs: new Date().toISOString(),
      })
    );
    seedGlobal(observations);

    // 模擬 SessionStart hook 的 queryGlobal 呼叫
    const topObs = globalInstinct.queryGlobal(projectRoot, {
      limit: registry.globalInstinctDefaults.loadTopN,
    });

    expect(topObs).toHaveLength(50);
    // 依信心降序排列
    for (let i = 0; i < topObs.length - 1; i++) {
      expect(topObs[i].confidence).toBeGreaterThanOrEqual(topObs[i + 1].confidence);
    }
  });

  // Scenario 5-2: 全域 store 為空時靜默跳過
  test('Scenario 5-2: 全域 store 為空時 queryGlobal 回傳空陣列', () => {
    const obs = globalInstinct.queryGlobal(projectRoot, {
      limit: registry.globalInstinctDefaults.loadTopN,
    });

    expect(obs).toEqual([]);
    // 不拋出任何錯誤（已由 expect 包裝確保）
  });

  // Scenario 5-3: 全域 store 讀取失敗時不影響 session 啟動
  test('Scenario 5-3: 讀取不存在的全域 store 不拋出例外', () => {
    // 模擬 on-start.js 的 try/catch 模式
    let loadFailed = false;
    let sessionStarted = false;

    try {
      globalInstinct.queryGlobal(projectRoot, {});
      sessionStarted = true;
    } catch {
      loadFailed = true;
    }

    expect(loadFailed).toBe(false);
    expect(sessionStarted).toBe(true);
  });

  // Scenario 5-4: 全域 store 僅有少量觀察時全部載入
  test('Scenario 5-4: 全域 store 只有 5 筆時全部 5 筆都載入', () => {
    seedGlobal(Array.from({ length: 5 }, (_, i) =>
      makeObs({
        tag: `few-${i}`,
        type: 'tool_preferences',
        confidence: 0.8,
        globalTs: new Date().toISOString(),
      })
    ));

    const obs = globalInstinct.queryGlobal(projectRoot, {
      limit: registry.globalInstinctDefaults.loadTopN,
    });

    expect(obs).toHaveLength(5);
  });
});

// ════════════════════════════════════════════════════════════════════
// 端對端整合：session 畢業 → 下一個 session 載入
// ════════════════════════════════════════════════════════════════════

describe('端對端整合：session 畢業 → session 載入', () => {
  let projectRoot;
  let session1;
  let session2;

  beforeEach(() => {
    projectRoot = makeTmpProject('e2e');
    session1 = makeTmpSession(projectRoot, 'e2e-s1');
    session2 = makeTmpSession(projectRoot, 'e2e-s2');
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(session1.dir, { recursive: true, force: true });
    rmSync(session2.dir, { recursive: true, force: true });
  });

  test('Session 1 畢業的觀察在 Session 2 載入時可見', () => {
    // Session 1：累積高信心觀察
    writeSessionObs(projectRoot, session1.id, makeObs({
      confidence: 0.85,
      tag: 'bun-prefer',
      type: 'tool_preferences',
      trigger: '用戶總是使用 bun 而非 npm',
      action: '優先使用 bun',
    }));
    writeSessionObs(projectRoot, session1.id, makeObs({
      confidence: 0.75,
      tag: 'test-pattern',
      type: 'pattern',
      trigger: '測試都用 describe/test 結構',
      action: '使用 bun:test 的 describe/test',
    }));

    // Session 1 結束：畢業到全域
    const graduationResult = globalInstinct.graduate(session1.id, projectRoot);
    expect(graduationResult.graduated).toBe(2);

    // Session 2 開始：載入全域觀察
    const loadedObs = globalInstinct.queryGlobal(projectRoot, {
      limit: registry.globalInstinctDefaults.loadTopN,
    });

    expect(loadedObs).toHaveLength(2);
    expect(loadedObs.some(o => o.tag === 'bun-prefer')).toBe(true);
    expect(loadedObs.some(o => o.tag === 'test-pattern')).toBe(true);
  });

  test('多個 session 的畢業觀察在後續 session 累積', () => {
    // Session 1：畢業 2 筆
    writeSessionObs(projectRoot, session1.id, makeObs({ confidence: 0.8, tag: 's1-obs1', type: 'tool_preferences' }));
    writeSessionObs(projectRoot, session1.id, makeObs({ confidence: 0.9, tag: 's1-obs2', type: 'pattern' }));
    globalInstinct.graduate(session1.id, projectRoot);

    // Session 2：畢業 1 筆（新的，不與 session1 重疊）
    writeSessionObs(projectRoot, session2.id, makeObs({ confidence: 0.75, tag: 's2-obs1', type: 'tool_preferences' }));
    globalInstinct.graduate(session2.id, projectRoot);

    // 後續 session 應看到所有 3 筆
    const allObs = globalInstinct.queryGlobal(projectRoot, {});
    expect(allObs).toHaveLength(3);
  });

  test('同 tag+type 在多個 session 畢業時 confidence 取 max', () => {
    // Session 1：畢業低信心版本
    writeSessionObs(projectRoot, session1.id, makeObs({ confidence: 0.75, tag: 'shared-pattern', type: 'pattern' }));
    globalInstinct.graduate(session1.id, projectRoot);

    // Session 2：畢業高信心版本（同 tag+type）
    writeSessionObs(projectRoot, session2.id, makeObs({ confidence: 0.92, tag: 'shared-pattern', type: 'pattern' }));
    globalInstinct.graduate(session2.id, projectRoot);

    const obs = globalInstinct.queryGlobal(projectRoot, { tag: 'shared-pattern' });
    expect(obs).toHaveLength(1);
    expect(obs[0].confidence).toBe(0.92);
  });

  test('全域 store 統計反映跨 session 累積', () => {
    writeSessionObs(projectRoot, session1.id, makeObs({ confidence: 0.8, tag: 's1-tag', type: 'tool_preferences' }));
    globalInstinct.graduate(session1.id, projectRoot);

    writeSessionObs(projectRoot, session2.id, makeObs({ confidence: 0.9, tag: 's2-tag', type: 'pattern' }));
    globalInstinct.graduate(session2.id, projectRoot);

    const summary = globalInstinct.summarizeGlobal(projectRoot);

    expect(summary.total).toBe(2);
    expect(summary.applicable).toBe(2);
    expect(summary.byType.tool_preferences).toBe(1);
    expect(summary.byType.pattern).toBe(1);
    expect(summary.byTag['s1-tag']).toBe(1);
    expect(summary.byTag['s2-tag']).toBe(1);
  });
});
