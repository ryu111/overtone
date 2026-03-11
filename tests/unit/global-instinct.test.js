'use strict';
/**
 * global-instinct.test.js — global-instinct.js 單元測試
 *
 * 覆蓋 BDD 規格中的 9 個 Feature、40 個 Scenario：
 *   Feature 1: 畢業機制（graduate）
 *   Feature 2: 全域查詢（queryGlobal）
 *   Feature 3: 全域衰減（decayGlobal）
 *   Feature 6: 路徑與設定
 *   Feature 7: 自動壓縮（auto-compaction）
 *   Feature 8: 統計摘要（summarizeGlobal）
 *   Feature 9: 專案維度隔離（projectHash）
 */
const { test, expect, describe, beforeEach, afterEach } = require('bun:test');
const { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, appendFileSync } = require('fs');
const os = require('os');
const path = require('path');
const { join } = require('path');
const { homedir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const globalInstinct = require(join(SCRIPTS_LIB, 'knowledge/global-instinct'));
const paths = require(join(SCRIPTS_LIB, 'paths'));
const registry = require(join(SCRIPTS_LIB, 'registry'));

// ── 輔助工具 ──

/**
 * 建立唯一的測試用 projectRoot（避免測試間污染）
 */
function makeTmpProject(suffix = '') {
  const dir = path.join(os.tmpdir(), `ot-gi-test-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * 建立測試用 sessionId 並初始化觀察檔
 */
function makeTmpSession(projectRoot, suffix = '') {
  const id = `test_gi_${suffix}_${Date.now()}`;
  const dir = projectRoot
    ? paths.sessionDir(projectRoot, id)
    : join(homedir(), '.nova', 'sessions', id);
  mkdirSync(dir, { recursive: true });
  return { id, dir };
}

/**
 * 向 session 寫入一筆觀察記錄（per-project 路徑）
 */
function writeSessionObs(projectRoot, sessionId, obs) {
  const filePath = paths.session.observations(projectRoot, sessionId);
  mkdirSync(path.dirname(filePath), { recursive: true });
  appendFileSync(filePath, JSON.stringify(obs) + '\n', 'utf8');
}

/**
 * 建立最小合法觀察物件
 */
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
// Feature 1: 畢業機制（graduate）
// ════════════════════════════════════════════════════════════════════

describe('Feature 1: 畢業機制（graduate）', () => {
  let projectRoot;
  let session;

  beforeEach(() => {
    projectRoot = makeTmpProject('grad');
    session = makeTmpSession(projectRoot, 'grad');
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(session.dir, { recursive: true, force: true });
    // 清理全域 hash 目錄，避免 ~/.nova/global/{hash}/ 洩漏
    rmSync(paths.global.dir(projectRoot), { recursive: true, force: true });
  });

  // Scenario 1-1
  test('Scenario 1-1: 高信心觀察成功畢業到全域 store', () => {
    writeSessionObs(projectRoot, session.id, makeObs({ confidence: 0.8, tag: 'high-conf', type: 'tool_preferences' }));

    const result = globalInstinct.graduate(session.id, projectRoot);

    expect(result.graduated).toBe(1);
    const obs = globalInstinct.queryGlobal(projectRoot, {});
    expect(obs).toHaveLength(1);
    expect(obs[0].globalTs).toBeDefined();
    expect(new Date(obs[0].globalTs).toISOString()).toBe(obs[0].globalTs);
  });

  // Scenario 1-2
  test('Scenario 1-2: 低信心觀察不畢業', () => {
    writeSessionObs(projectRoot, session.id, makeObs({ confidence: 0.5, tag: 'low-conf', type: 'tool_preferences' }));

    const result = globalInstinct.graduate(session.id, projectRoot);

    expect(result.graduated).toBe(0);
    const obs = globalInstinct.queryGlobal(projectRoot, {});
    expect(obs).toHaveLength(0);
  });

  // Scenario 1-3
  test('Scenario 1-3: 邊界值 confidence = 0.7 剛好畢業', () => {
    writeSessionObs(projectRoot, session.id, makeObs({ confidence: 0.7, tag: 'boundary', type: 'tool_preferences' }));

    const result = globalInstinct.graduate(session.id, projectRoot);

    expect(result.graduated).toBe(1);
    const obs = globalInstinct.queryGlobal(projectRoot, {});
    expect(obs).toHaveLength(1);
  });

  // Scenario 1-4
  test('Scenario 1-4: 相同 tag+type 去重合併，保留較高 confidence', () => {
    // 先畢業一個低信心觀察到全域
    writeSessionObs(projectRoot, session.id, makeObs({ confidence: 0.75, tag: 'testing', type: 'pattern' }));
    globalInstinct.graduate(session.id, projectRoot);

    // 新 session 有更高信心的同 tag+type 觀察
    const session2 = makeTmpSession(projectRoot, 'grad2');
    try {
      writeSessionObs(projectRoot, session2.id, makeObs({ confidence: 0.9, tag: 'testing', type: 'pattern' }));
      globalInstinct.graduate(session2.id, projectRoot);

      const obs = globalInstinct.queryGlobal(projectRoot, { tag: 'testing', type: 'pattern' });
      expect(obs).toHaveLength(1);
      expect(obs[0].confidence).toBe(0.9);
    } finally {
      rmSync(session2.dir, { recursive: true, force: true });
    }
  });

  // Scenario 1-5
  test('Scenario 1-5: 相同 tag+type 去重合併，不降低已有的高 confidence', () => {
    // 先畢業高信心觀察
    writeSessionObs(projectRoot, session.id, makeObs({ confidence: 0.9, tag: 'testing', type: 'pattern' }));
    globalInstinct.graduate(session.id, projectRoot);

    // 新 session 有更低信心的同 tag+type 觀察
    const session2 = makeTmpSession(projectRoot, 'grad3');
    try {
      writeSessionObs(projectRoot, session2.id, makeObs({ confidence: 0.75, tag: 'testing', type: 'pattern' }));
      globalInstinct.graduate(session2.id, projectRoot);

      const obs = globalInstinct.queryGlobal(projectRoot, { tag: 'testing', type: 'pattern' });
      expect(obs).toHaveLength(1);
      expect(obs[0].confidence).toBe(0.9);
    } finally {
      rmSync(session2.dir, { recursive: true, force: true });
    }
  });

  // Scenario 1-6
  test('Scenario 1-6: 空 session 呼叫 graduate 不出錯，回傳 graduated = 0', () => {
    // 不寫任何觀察
    expect(() => {
      const result = globalInstinct.graduate(session.id, projectRoot);
      expect(result.graduated).toBe(0);
    }).not.toThrow();
  });

  // Scenario 1-7
  test('Scenario 1-7: graduate 末尾自動執行 decayGlobal，回傳結果包含 decayed 欄位', () => {
    // 寫入一筆超過 1 週的舊觀察到全域 store
    const oldDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const obsPath = paths.global.observations(projectRoot);
    mkdirSync(path.dirname(obsPath), { recursive: true });
    appendFileSync(obsPath, JSON.stringify(makeObs({
      confidence: 0.8,
      tag: 'old-obs',
      type: 'tool_preferences',
      lastSeen: oldDate,
      globalTs: oldDate,
    })) + '\n', 'utf8');

    // 現在 graduate（session 可以是空的）
    const result = globalInstinct.graduate(session.id, projectRoot);

    expect(result).toHaveProperty('decayed');
    expect(typeof result.decayed).toBe('number');
    expect(result.decayed).toBeGreaterThanOrEqual(1);
  });
});

// ════════════════════════════════════════════════════════════════════
// Feature 2: 全域查詢（queryGlobal）
// ════════════════════════════════════════════════════════════════════

describe('Feature 2: 全域查詢（queryGlobal）', () => {
  let projectRoot;
  let session;

  beforeEach(() => {
    projectRoot = makeTmpProject('query');
    session = makeTmpSession(projectRoot, 'query');
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(session.dir, { recursive: true, force: true });
    rmSync(paths.global.dir(projectRoot), { recursive: true, force: true });
  });

  function seedGlobal(observations) {
    const obsPath = paths.global.observations(projectRoot);
    mkdirSync(path.dirname(obsPath), { recursive: true });
    for (const o of observations) {
      appendFileSync(obsPath, JSON.stringify(o) + '\n', 'utf8');
    }
  }

  // Scenario 2-1
  test('Scenario 2-1: 無 filter 回傳全部觀察', () => {
    seedGlobal([
      makeObs({ tag: 'a', type: 'tool_preferences', confidence: 0.8, globalTs: new Date().toISOString() }),
      makeObs({ tag: 'b', type: 'tool_preferences', confidence: 0.9, globalTs: new Date().toISOString() }),
      makeObs({ tag: 'c', type: 'tool_preferences', confidence: 0.7, globalTs: new Date().toISOString() }),
    ]);

    const result = globalInstinct.queryGlobal(projectRoot, {});
    expect(result).toHaveLength(3);
  });

  // Scenario 2-2
  test('Scenario 2-2: 按 type 篩選', () => {
    seedGlobal([
      makeObs({ tag: 'a', type: 'pattern', confidence: 0.8, globalTs: new Date().toISOString() }),
      makeObs({ tag: 'b', type: 'pattern', confidence: 0.9, globalTs: new Date().toISOString() }),
      makeObs({ tag: 'c', type: 'preference', confidence: 0.7, globalTs: new Date().toISOString() }),
      makeObs({ tag: 'd', type: 'preference', confidence: 0.8, globalTs: new Date().toISOString() }),
    ]);

    const result = globalInstinct.queryGlobal(projectRoot, { type: 'pattern' });
    expect(result).toHaveLength(2);
    expect(result.every(o => o.type === 'pattern')).toBe(true);
  });

  // Scenario 2-3
  test('Scenario 2-3: 按 tag 篩選', () => {
    seedGlobal([
      makeObs({ tag: 'testing', type: 'pattern', confidence: 0.8, globalTs: new Date().toISOString() }),
      makeObs({ tag: 'testing', type: 'preference', confidence: 0.9, globalTs: new Date().toISOString() }),
      makeObs({ tag: 'debugging', type: 'pattern', confidence: 0.7, globalTs: new Date().toISOString() }),
      makeObs({ tag: 'debugging', type: 'preference', confidence: 0.8, globalTs: new Date().toISOString() }),
    ]);

    const result = globalInstinct.queryGlobal(projectRoot, { tag: 'testing' });
    expect(result).toHaveLength(2);
    expect(result.every(o => o.tag === 'testing')).toBe(true);
  });

  // Scenario 2-4
  test('Scenario 2-4: 按 minConfidence 篩選', () => {
    seedGlobal([
      makeObs({ tag: 'low', type: 'tool_preferences', confidence: 0.5, globalTs: new Date().toISOString() }),
      makeObs({ tag: 'mid', type: 'tool_preferences', confidence: 0.7, globalTs: new Date().toISOString() }),
      makeObs({ tag: 'high', type: 'tool_preferences', confidence: 0.9, globalTs: new Date().toISOString() }),
    ]);

    const result = globalInstinct.queryGlobal(projectRoot, { minConfidence: 0.7 });
    expect(result).toHaveLength(2);
    expect(result.every(o => o.confidence >= 0.7)).toBe(true);
  });

  // Scenario 2-5
  test('Scenario 2-5: limit 取 top-N 依信心降序排列', () => {
    seedGlobal([
      makeObs({ tag: 'a', type: 'tool_preferences', confidence: 0.9, globalTs: new Date().toISOString() }),
      makeObs({ tag: 'b', type: 'tool_preferences', confidence: 0.8, globalTs: new Date().toISOString() }),
      makeObs({ tag: 'c', type: 'tool_preferences', confidence: 0.7, globalTs: new Date().toISOString() }),
      makeObs({ tag: 'd', type: 'tool_preferences', confidence: 0.75, globalTs: new Date().toISOString() }),
      makeObs({ tag: 'e', type: 'tool_preferences', confidence: 0.85, globalTs: new Date().toISOString() }),
    ]);

    const result = globalInstinct.queryGlobal(projectRoot, { limit: 3 });
    expect(result).toHaveLength(3);
    // 應依 confidence 降序排列
    expect(result[0].confidence).toBe(0.9);
    expect(result[0].confidence).toBeGreaterThanOrEqual(result[1].confidence);
    expect(result[1].confidence).toBeGreaterThanOrEqual(result[2].confidence);
  });

  // Scenario 2-6
  test('Scenario 2-6: 空全域 store 回傳空陣列', () => {
    expect(() => {
      const result = globalInstinct.queryGlobal(projectRoot, {});
      expect(result).toEqual([]);
    }).not.toThrow();
  });

  // Scenario 2-7
  test('Scenario 2-7: 組合多個 filter 條件', () => {
    seedGlobal([
      makeObs({ tag: 'testing', type: 'pattern', confidence: 0.9, globalTs: new Date().toISOString() }),
      makeObs({ tag: 'testing', type: 'preference', confidence: 0.5, globalTs: new Date().toISOString() }),
      makeObs({ tag: 'debugging', type: 'pattern', confidence: 0.9, globalTs: new Date().toISOString() }),
      makeObs({ tag: 'debugging', type: 'preference', confidence: 0.5, globalTs: new Date().toISOString() }),
    ]);

    const result = globalInstinct.queryGlobal(projectRoot, { tag: 'testing', minConfidence: 0.7 });
    expect(result).toHaveLength(1);
    expect(result[0].tag).toBe('testing');
    expect(result[0].confidence).toBe(0.9);
  });
});

// ════════════════════════════════════════════════════════════════════
// Feature 3: 全域衰減（decayGlobal）
// ════════════════════════════════════════════════════════════════════

describe('Feature 3: 全域衰減（decayGlobal）', () => {
  let projectRoot;

  beforeEach(() => {
    projectRoot = makeTmpProject('decay');
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(paths.global.dir(projectRoot), { recursive: true, force: true });
  });

  function seedGlobalObs(observations) {
    const obsPath = paths.global.observations(projectRoot);
    mkdirSync(path.dirname(obsPath), { recursive: true });
    for (const o of observations) {
      appendFileSync(obsPath, JSON.stringify(o) + '\n', 'utf8');
    }
  }

  // Scenario 3-1
  test('Scenario 3-1: 超過一週的觀察依週數衰減', () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    seedGlobalObs([
      makeObs({ tag: 'old', type: 'tool_preferences', confidence: 0.8, lastSeen: twoWeeksAgo, globalTs: twoWeeksAgo }),
    ]);

    const result = globalInstinct.decayGlobal(projectRoot);

    expect(result.decayed).toBe(1);
    const obs = globalInstinct.queryGlobal(projectRoot, {});
    // 固定衰減：0.8 - 0.02 = 0.78（每次呼叫固定衰減 0.02，無論超過幾週）
    expect(obs[0].confidence).toBe(0.78);
  });

  // Scenario 3-2
  test('Scenario 3-2: 衰減後 confidence < 0.2 自動刪除', () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    seedGlobalObs([
      makeObs({ tag: 'dying', type: 'tool_preferences', confidence: 0.21, lastSeen: twoWeeksAgo, globalTs: twoWeeksAgo }),
    ]);

    const result = globalInstinct.decayGlobal(projectRoot);

    // 衰減後 0.21 - 0.02 = 0.19 < 0.2，應被刪除
    expect(result.pruned).toBe(1);
    const obs = globalInstinct.queryGlobal(projectRoot, {});
    expect(obs).toHaveLength(0);
  });

  // Scenario 3-3
  test('Scenario 3-3: 更新時間未超過一週的觀察不衰減', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    seedGlobalObs([
      makeObs({ tag: 'fresh', type: 'tool_preferences', confidence: 0.8, lastSeen: threeDaysAgo, globalTs: threeDaysAgo }),
    ]);

    const result = globalInstinct.decayGlobal(projectRoot);

    expect(result.decayed).toBe(0);
    const obs = globalInstinct.queryGlobal(projectRoot, {});
    expect(obs[0].confidence).toBe(0.8);
  });

  // Scenario 3-4
  test('Scenario 3-4: 空全域 store 呼叫 decayGlobal 不出錯', () => {
    expect(() => {
      const result = globalInstinct.decayGlobal(projectRoot);
      expect(result.decayed).toBe(0);
      expect(result.pruned).toBe(0);
    }).not.toThrow();
  });
});

// ════════════════════════════════════════════════════════════════════
// Feature 6: 路徑與設定
// ════════════════════════════════════════════════════════════════════

describe('Feature 6: 路徑與設定', () => {
  const testRoot = '/Users/test/projects/my-project';

  // Scenario 6-1
  test('Scenario 6-1: paths.global.dir() 回傳正確路徑', () => {
    const dir = paths.global.dir(testRoot);
    const homeDir = os.homedir();
    // 路徑應以 ~/.nova/global 開頭
    expect(dir.startsWith(path.join(homeDir, '.nova', 'global'))).toBe(true);
    // 路徑應包含 8 字元 hex hash（不重複同一個 root 的 hash）
    const hashPart = paths.projectHash(testRoot);
    expect(dir).toContain(hashPart);
    // 路徑不應是空字串
    expect(dir.length).toBeGreaterThan(0);
  });

  // Scenario 6-2
  test('Scenario 6-2: paths.global.observations() 回傳正確路徑', () => {
    const obsPath = paths.global.observations(testRoot);
    expect(obsPath).toContain('.nova');
    expect(obsPath).toContain('global');
    expect(obsPath).toEndWith('observations.jsonl');
  });

  // Scenario 6-3
  test('Scenario 6-3: registry 包含 globalInstinctDefaults 設定', () => {
    expect(registry.globalInstinctDefaults).toBeDefined();
    expect(registry.globalInstinctDefaults.graduationThreshold).toBe(0.7);
    expect(registry.globalInstinctDefaults.loadTopN).toBe(50);
  });
});

// ════════════════════════════════════════════════════════════════════
// Feature 7: 自動壓縮（auto-compaction）
// ════════════════════════════════════════════════════════════════════

describe('Feature 7: 自動壓縮（auto-compaction）', () => {
  let projectRoot;

  beforeEach(() => {
    projectRoot = makeTmpProject('compact');
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(paths.global.dir(projectRoot), { recursive: true, force: true });
  });

  // Scenario 7-1
  test('Scenario 7-1: 行數超過唯一數 2 倍時觸發自動壓縮', () => {
    const obsPath = paths.global.observations(projectRoot);
    mkdirSync(path.dirname(obsPath), { recursive: true });

    // 建立 10 筆唯一觀察，但透過 append 模擬歷史行數 25 行
    const uniqueObs = Array.from({ length: 10 }, (_, i) =>
      makeObs({ tag: `tag-${i}`, type: 'tool_preferences', confidence: 0.8, globalTs: new Date().toISOString() })
    );

    // 寫入 25 行（每筆最多 3 次 append，共超過 20 行閾值）
    for (let i = 0; i < 3; i++) {
      for (const o of uniqueObs.slice(0, 8)) {
        appendFileSync(obsPath, JSON.stringify(o) + '\n', 'utf8');
      }
    }
    // 確保行數 > 唯一數 * 2（8 * 3 = 24 行，唯一 8 個，閾值 16）
    const linesBefore = readFileSync(obsPath, 'utf8').trim().split('\n').filter(Boolean).length;
    expect(linesBefore).toBeGreaterThan(8 * 2);

    // 觸發 queryGlobal（內部讀取時會自動壓縮）
    globalInstinct.queryGlobal(projectRoot, {});

    // 讀取 _readAll 會觸發壓縮，之後行數應 <= 唯一數 * 2
    const linesAfter = readFileSync(obsPath, 'utf8').trim().split('\n').filter(Boolean).length;
    expect(linesAfter).toBeLessThanOrEqual(8 * 2);
  });

  // Scenario 7-2
  test('Scenario 7-2: 壓縮後保留每個 tag+type 鍵的最新版本', () => {
    const obsPath = paths.global.observations(projectRoot);
    mkdirSync(path.dirname(obsPath), { recursive: true });

    // 同一個 tag+type 有 3 個歷史版本
    const base = makeObs({ tag: 'multi', type: 'tool_preferences', globalTs: new Date().toISOString() });
    appendFileSync(obsPath, JSON.stringify({ ...base, confidence: 0.7 }) + '\n', 'utf8');
    appendFileSync(obsPath, JSON.stringify({ ...base, confidence: 0.8 }) + '\n', 'utf8');
    appendFileSync(obsPath, JSON.stringify({ ...base, confidence: 0.9 }) + '\n', 'utf8');
    // 超過閾值（3 行 > 1 唯一 * 2 = 2）
    // 再加幾個其他觀察也超過閾值
    appendFileSync(obsPath, JSON.stringify(makeObs({ tag: 'other', type: 'tool_preferences', confidence: 0.8, globalTs: new Date().toISOString() })) + '\n', 'utf8');
    appendFileSync(obsPath, JSON.stringify(makeObs({ tag: 'other', type: 'tool_preferences', confidence: 0.8, globalTs: new Date().toISOString() })) + '\n', 'utf8');
    appendFileSync(obsPath, JSON.stringify(makeObs({ tag: 'other', type: 'tool_preferences', confidence: 0.8, globalTs: new Date().toISOString() })) + '\n', 'utf8');

    // 觸發讀取（自動壓縮）
    const result = globalInstinct.queryGlobal(projectRoot, { tag: 'multi' });

    expect(result).toHaveLength(1);
    // 最後追加的是 confidence: 0.9（append-only 合併取最後一筆）
    expect(result[0].confidence).toBe(0.9);
  });

  // Scenario 7-3
  test('Scenario 7-3: 行數未超過閾值時不壓縮', () => {
    const obsPath = paths.global.observations(projectRoot);
    mkdirSync(path.dirname(obsPath), { recursive: true });

    // 5 筆唯一觀察，8 行（< 5 * 2 = 10，不觸發壓縮）
    const uniqueObs = Array.from({ length: 5 }, (_, i) =>
      makeObs({ tag: `tag-${i}`, type: 'tool_preferences', confidence: 0.8, globalTs: new Date().toISOString() })
    );
    for (const o of uniqueObs) {
      appendFileSync(obsPath, JSON.stringify(o) + '\n', 'utf8');
    }
    // 再加 3 行（共 8 行，< 10）
    for (let i = 0; i < 3; i++) {
      appendFileSync(obsPath, JSON.stringify(uniqueObs[i]) + '\n', 'utf8');
    }

    const linesBefore = readFileSync(obsPath, 'utf8').trim().split('\n').filter(Boolean).length;
    expect(linesBefore).toBe(8);

    globalInstinct.queryGlobal(projectRoot, {});

    const linesAfter = readFileSync(obsPath, 'utf8').trim().split('\n').filter(Boolean).length;
    // 不壓縮 → 行數不變
    expect(linesAfter).toBe(8);
  });
});

// ════════════════════════════════════════════════════════════════════
// Feature 8: 統計摘要（summarizeGlobal）
// ════════════════════════════════════════════════════════════════════

describe('Feature 8: 統計摘要（summarizeGlobal）', () => {
  let projectRoot;

  beforeEach(() => {
    projectRoot = makeTmpProject('summary');
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(paths.global.dir(projectRoot), { recursive: true, force: true });
  });

  function seedGlobal(observations) {
    const obsPath = paths.global.observations(projectRoot);
    mkdirSync(path.dirname(obsPath), { recursive: true });
    for (const o of observations) {
      appendFileSync(obsPath, JSON.stringify(o) + '\n', 'utf8');
    }
  }

  // Scenario 8-1
  test('Scenario 8-1: 正確統計 total 和 byType', () => {
    seedGlobal([
      makeObs({ tag: 'a', type: 'pattern', confidence: 0.8, globalTs: new Date().toISOString() }),
      makeObs({ tag: 'b', type: 'pattern', confidence: 0.9, globalTs: new Date().toISOString() }),
      makeObs({ tag: 'c', type: 'pattern', confidence: 0.7, globalTs: new Date().toISOString() }),
      makeObs({ tag: 'd', type: 'preference', confidence: 0.8, globalTs: new Date().toISOString() }),
      makeObs({ tag: 'e', type: 'preference', confidence: 0.9, globalTs: new Date().toISOString() }),
    ]);

    const result = globalInstinct.summarizeGlobal(projectRoot);

    expect(result.total).toBe(5);
    expect(result.byType.pattern).toBe(3);
    expect(result.byType.preference).toBe(2);
  });

  // Scenario 8-2
  test('Scenario 8-2: 正確統計 byTag', () => {
    seedGlobal([
      makeObs({ tag: 'testing', type: 'pattern', confidence: 0.8, globalTs: new Date().toISOString() }),
      makeObs({ tag: 'testing', type: 'preference', confidence: 0.9, globalTs: new Date().toISOString() }),
      makeObs({ tag: 'debugging', type: 'pattern', confidence: 0.7, globalTs: new Date().toISOString() }),
    ]);

    const result = globalInstinct.summarizeGlobal(projectRoot);

    expect(result.byTag.testing).toBe(2);
    expect(result.byTag.debugging).toBe(1);
  });

  // Scenario 8-3
  test('Scenario 8-3: 正確統計 applicable（confidence >= 0.7）', () => {
    seedGlobal([
      makeObs({ tag: 'high', type: 'pattern', confidence: 0.9, globalTs: new Date().toISOString() }),
      makeObs({ tag: 'mid', type: 'preference', confidence: 0.7, globalTs: new Date().toISOString() }),
      makeObs({ tag: 'low', type: 'pattern', confidence: 0.5, globalTs: new Date().toISOString() }),
    ]);

    const result = globalInstinct.summarizeGlobal(projectRoot);

    expect(result.applicable).toBe(2);
    expect(result.total).toBe(3);
  });

  // Scenario 8-4
  test('Scenario 8-4: 空全域 store 的統計', () => {
    const result = globalInstinct.summarizeGlobal(projectRoot);

    expect(result.total).toBe(0);
    expect(result.applicable).toBe(0);
    expect(result.byType).toEqual({});
    expect(result.byTag).toEqual({});
  });
});

// ════════════════════════════════════════════════════════════════════
// Feature 9: 專案維度隔離（projectHash）
// ════════════════════════════════════════════════════════════════════

describe('Feature 9: 專案維度隔離（projectHash）', () => {
  let projectA;
  let projectB;
  let sessionA;
  let sessionB;

  beforeEach(() => {
    projectA = makeTmpProject('proj-a');
    projectB = makeTmpProject('proj-b');
    sessionA = makeTmpSession(projectA, 'proj-a');
    sessionB = makeTmpSession(projectB, 'proj-b');
  });

  afterEach(() => {
    rmSync(projectA, { recursive: true, force: true });
    rmSync(projectB, { recursive: true, force: true });
    rmSync(sessionA.dir, { recursive: true, force: true });
    rmSync(sessionB.dir, { recursive: true, force: true });
    rmSync(paths.global.dir(projectA), { recursive: true, force: true });
    rmSync(paths.global.dir(projectB), { recursive: true, force: true });
  });

  // Scenario 9-1
  test('Scenario 9-1: 不同專案的觀察存入各自的 store', () => {
    writeSessionObs(projectA, sessionA.id, makeObs({ confidence: 0.8, tag: 'proj-a-tag', type: 'tool_preferences' }));
    writeSessionObs(projectA, sessionA.id, makeObs({ confidence: 0.8, tag: 'proj-a-tag2', type: 'tool_preferences' }));
    globalInstinct.graduate(sessionA.id, projectA);

    writeSessionObs(projectB, sessionB.id, makeObs({ confidence: 0.8, tag: 'proj-b-tag', type: 'tool_preferences' }));
    writeSessionObs(projectB, sessionB.id, makeObs({ confidence: 0.8, tag: 'proj-b-tag2', type: 'tool_preferences' }));
    writeSessionObs(projectB, sessionB.id, makeObs({ confidence: 0.8, tag: 'proj-b-tag3', type: 'tool_preferences' }));
    globalInstinct.graduate(sessionB.id, projectB);

    const obsA = globalInstinct.queryGlobal(projectA, {});
    const obsB = globalInstinct.queryGlobal(projectB, {});

    expect(obsA).toHaveLength(2);
    expect(obsB).toHaveLength(3);

    // 檔案路徑不同
    expect(paths.global.observations(projectA)).not.toBe(paths.global.observations(projectB));
  });

  // Scenario 9-2
  test('Scenario 9-2: 查詢只回傳當前專案的觀察', () => {
    writeSessionObs(projectA, sessionA.id, makeObs({ confidence: 0.8, tag: 'bun-test', type: 'tool_preferences' }));
    globalInstinct.graduate(sessionA.id, projectA);

    writeSessionObs(projectB, sessionB.id, makeObs({ confidence: 0.8, tag: 'npm-test', type: 'tool_preferences' }));
    globalInstinct.graduate(sessionB.id, projectB);

    const obsA = globalInstinct.queryGlobal(projectA, {});

    expect(obsA.some(o => o.tag === 'bun-test')).toBe(true);
    expect(obsA.some(o => o.tag === 'npm-test')).toBe(false);
  });

  // Scenario 9-3
  test('Scenario 9-3: paths.global.observations(projectRoot) 依專案回傳不同路徑', () => {
    const pathA = paths.global.observations('/Users/me/projects/overtone');
    const pathB = paths.global.observations('/Users/me/projects/other-project');

    expect(pathA).not.toBe(pathB);
    expect(pathA).toContain('observations.jsonl');
    expect(pathB).toContain('observations.jsonl');
    // 路徑格式：~/.nova/global/{hash}/observations.jsonl
    const homeDir = os.homedir();
    expect(pathA).toContain(path.join(homeDir, '.nova', 'global'));
  });

  // Scenario 9-4
  test('Scenario 9-4: projectHash 穩定且可重現', () => {
    const root = '/Users/me/projects/overtone';

    const path1 = paths.global.observations(root);
    const path2 = paths.global.observations(root);
    const path3 = paths.global.observations(root);

    expect(path1).toBe(path2);
    expect(path2).toBe(path3);

    // hash 部分是固定的 8 字元 hex
    const hashPart = paths.projectHash(root);
    expect(hashPart).toHaveLength(8);
    expect(/^[0-9a-f]{8}$/.test(hashPart)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════
// pruneGlobal — 獨立測試
// ════════════════════════════════════════════════════════════════════

describe('pruneGlobal — 清除低信心觀察', () => {
  let projectRoot;

  beforeEach(() => {
    projectRoot = makeTmpProject('prune');
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(paths.global.dir(projectRoot), { recursive: true, force: true });
  });

  test('刪除信心低於 0.2 的觀察', () => {
    const obsPath = paths.global.observations(projectRoot);
    mkdirSync(path.dirname(obsPath), { recursive: true });
    appendFileSync(obsPath, JSON.stringify(makeObs({ tag: 'keep', type: 'tool_preferences', confidence: 0.8, globalTs: new Date().toISOString() })) + '\n', 'utf8');
    appendFileSync(obsPath, JSON.stringify(makeObs({ tag: 'delete-me', type: 'tool_preferences', confidence: 0.1, globalTs: new Date().toISOString() })) + '\n', 'utf8');

    const pruned = globalInstinct.pruneGlobal(projectRoot);

    expect(pruned).toBe(1);
    const obs = globalInstinct.queryGlobal(projectRoot, {});
    expect(obs).toHaveLength(1);
    expect(obs[0].tag).toBe('keep');
  });

  test('空 store 呼叫 pruneGlobal 不出錯', () => {
    expect(() => {
      const pruned = globalInstinct.pruneGlobal(projectRoot);
      expect(pruned).toBe(0);
    }).not.toThrow();
  });

  test('信心恰好 0.2 的觀察保留（閾值為嚴格小於 0.2 才刪除）', () => {
    const obsPath = paths.global.observations(projectRoot);
    mkdirSync(path.dirname(obsPath), { recursive: true });
    appendFileSync(obsPath, JSON.stringify(makeObs({ tag: 'boundary', type: 'tool_preferences', confidence: 0.2, globalTs: new Date().toISOString() })) + '\n', 'utf8');

    const pruned = globalInstinct.pruneGlobal(projectRoot);

    expect(pruned).toBe(0);
    const obs = globalInstinct.queryGlobal(projectRoot, {});
    expect(obs).toHaveLength(1);
  });
});

// ════════════════════════════════════════════════════════════════════
// graduate merge 語意細節
// ════════════════════════════════════════════════════════════════════

describe('graduate merge 語意', () => {
  let projectRoot;
  let session;

  beforeEach(() => {
    projectRoot = makeTmpProject('merge');
    session = makeTmpSession(projectRoot, 'merge');
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(session.dir, { recursive: true, force: true });
    rmSync(paths.global.dir(projectRoot), { recursive: true, force: true });
  });

  test('merge 時 count 相加', () => {
    // 先畢業一筆 count=2
    const obsPath = paths.global.observations(projectRoot);
    mkdirSync(path.dirname(obsPath), { recursive: true });
    appendFileSync(obsPath, JSON.stringify(makeObs({
      tag: 'merge-test', type: 'tool_preferences', confidence: 0.8, count: 2,
      globalTs: new Date().toISOString(),
    })) + '\n', 'utf8');

    // session 有同 tag+type 的觀察 count=3
    writeSessionObs(projectRoot, session.id, makeObs({
      confidence: 0.75, tag: 'merge-test', type: 'tool_preferences', count: 3,
    }));

    globalInstinct.graduate(session.id, projectRoot);

    const obs = globalInstinct.queryGlobal(projectRoot, { tag: 'merge-test' });
    expect(obs).toHaveLength(1);
    expect(obs[0].count).toBe(5); // 2 + 3
  });

  test('merge 時 globalTs 保留原始值', () => {
    const originalGlobalTs = '2026-01-01T00:00:00.000Z';
    const obsPath = paths.global.observations(projectRoot);
    mkdirSync(path.dirname(obsPath), { recursive: true });
    appendFileSync(obsPath, JSON.stringify(makeObs({
      tag: 'ts-test', type: 'tool_preferences', confidence: 0.8, count: 1,
      globalTs: originalGlobalTs,
    })) + '\n', 'utf8');

    writeSessionObs(projectRoot, session.id, makeObs({
      confidence: 0.9, tag: 'ts-test', type: 'tool_preferences', count: 1,
    }));

    globalInstinct.graduate(session.id, projectRoot);

    const obs = globalInstinct.queryGlobal(projectRoot, { tag: 'ts-test' });
    expect(obs[0].globalTs).toBe(originalGlobalTs);
  });

  test('session confidence 相等時 trigger/action 取 session 方', () => {
    const obsPath = paths.global.observations(projectRoot);
    mkdirSync(path.dirname(obsPath), { recursive: true });
    appendFileSync(obsPath, JSON.stringify(makeObs({
      tag: 'equal-conf', type: 'tool_preferences', confidence: 0.8, count: 1,
      trigger: '舊觸發條件', action: '舊行動',
      globalTs: new Date().toISOString(),
    })) + '\n', 'utf8');

    writeSessionObs(projectRoot, session.id, makeObs({
      confidence: 0.8, tag: 'equal-conf', type: 'tool_preferences', count: 1,
      trigger: '新觸發條件', action: '新行動',
    }));

    globalInstinct.graduate(session.id, projectRoot);

    const obs = globalInstinct.queryGlobal(projectRoot, { tag: 'equal-conf' });
    // session confidence 相等時，取 session 方（最新版本）
    expect(obs[0].trigger).toBe('新觸發條件');
    expect(obs[0].action).toBe('新行動');
  });
});

// ════════════════════════════════════════════════════════════════════
// Feature 6: queryGlobal excludeTypes 過濾（BDD Feature 6）
// ════════════════════════════════════════════════════════════════════

describe('Feature 6: queryGlobal excludeTypes 過濾', () => {
  let projectRoot;

  beforeEach(() => {
    projectRoot = makeTmpProject('excl');
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(paths.global.dir(projectRoot), { recursive: true, force: true });
  });

  function seedGlobal(observations) {
    const obsPath = paths.global.observations(projectRoot);
    mkdirSync(path.dirname(obsPath), { recursive: true });
    for (const o of observations) {
      appendFileSync(obsPath, JSON.stringify(o) + '\n', 'utf8');
    }
  }

  // Scenario 6-1
  test('Scenario 6-1: excludeTypes 過濾掉指定 type 的記錄', () => {
    seedGlobal([
      makeObs({ tag: 'j1', type: 'intent_journal', confidence: 0.8, globalTs: new Date().toISOString() }),
      makeObs({ tag: 'p1', type: 'tool_preferences', confidence: 0.8, globalTs: new Date().toISOString() }),
    ]);

    const result = globalInstinct.queryGlobal(projectRoot, { excludeTypes: ['intent_journal'] });

    expect(result.some(o => o.type === 'intent_journal')).toBe(false);
    expect(result.some(o => o.type === 'tool_preferences')).toBe(true);
  });

  // Scenario 6-2
  test('Scenario 6-2: excludeTypes 為空陣列時不過濾任何記錄', () => {
    seedGlobal([
      makeObs({ tag: 'j1', type: 'intent_journal', confidence: 0.8, globalTs: new Date().toISOString() }),
      makeObs({ tag: 'p1', type: 'tool_preferences', confidence: 0.8, globalTs: new Date().toISOString() }),
    ]);

    const result = globalInstinct.queryGlobal(projectRoot, { excludeTypes: [] });

    expect(result).toHaveLength(2);
  });

  // Scenario 6-3
  test('Scenario 6-3: excludeTypes 不傳時不過濾任何記錄（向後相容）', () => {
    seedGlobal([
      makeObs({ tag: 'j1', type: 'intent_journal', confidence: 0.8, globalTs: new Date().toISOString() }),
    ]);

    const result = globalInstinct.queryGlobal(projectRoot, {});

    expect(result.some(o => o.type === 'intent_journal')).toBe(true);
  });

  // Scenario 6-4
  test('Scenario 6-4: excludeTypes 可同時排除多個 type', () => {
    seedGlobal([
      makeObs({ tag: 'j1', type: 'intent_journal', confidence: 0.8, globalTs: new Date().toISOString() }),
      makeObs({ tag: 'p1', type: 'tool_preferences', confidence: 0.8, globalTs: new Date().toISOString() }),
      makeObs({ tag: 'u1', type: 'user_corrections', confidence: 0.8, globalTs: new Date().toISOString() }),
    ]);

    const result = globalInstinct.queryGlobal(projectRoot, {
      excludeTypes: ['intent_journal', 'tool_preferences'],
    });

    expect(result.some(o => o.type === 'intent_journal')).toBe(false);
    expect(result.some(o => o.type === 'tool_preferences')).toBe(false);
    expect(result.some(o => o.type === 'user_corrections')).toBe(true);
  });

  // Scenario 6-5 (excludeTypes)
  test('Scenario 6-5: excludeTypes 與 type filter 可同時使用（雙重過濾）', () => {
    seedGlobal([
      makeObs({ tag: 'j1', type: 'intent_journal', confidence: 0.8, globalTs: new Date().toISOString() }),
      makeObs({ tag: 'p1', type: 'tool_preferences', confidence: 0.8, globalTs: new Date().toISOString() }),
      makeObs({ tag: 'u1', type: 'user_corrections', confidence: 0.8, globalTs: new Date().toISOString() }),
    ]);

    const result = globalInstinct.queryGlobal(projectRoot, {
      type: 'tool_preferences',
      excludeTypes: ['intent_journal'],
    });

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('tool_preferences');
    expect(result.some(o => o.type === 'intent_journal')).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════
// Feature 10: 關鍵詞相關性排序（relevanceTo）
// ════════════════════════════════════════════════════════════════════

describe('Feature 10: 關鍵詞相關性排序（relevanceTo）', () => {
  // ── 10A: _extractKeywords 單元測試 ──

  describe('_extractKeywords', () => {
    test('提取英文關鍵詞，過濾停用詞', () => {
      const kw = globalInstinct._extractKeywords('the bug is in the handler code');
      expect(kw.has('bug')).toBe(true);
      expect(kw.has('handler')).toBe(true);
      expect(kw.has('code')).toBe(true);
      expect(kw.has('the')).toBe(false);
      expect(kw.has('is')).toBe(false);
      expect(kw.has('in')).toBe(false);
    });

    test('提取 CJK bigram', () => {
      const kw = globalInstinct._extractKeywords('並行收斂偵測');
      expect(kw.has('並行')).toBe(true);
      expect(kw.has('收斂')).toBe(true);
      expect(kw.has('偵測')).toBe(true);
    });

    test('中英混合文本', () => {
      const kw = globalInstinct._extractKeywords('修復 registry 錯誤');
      expect(kw.has('registry')).toBe(true);
      expect(kw.has('修復')).toBe(true);
      expect(kw.has('錯誤')).toBe(true);
    });

    test('空字串回傳空 Set', () => {
      expect(globalInstinct._extractKeywords('').size).toBe(0);
      expect(globalInstinct._extractKeywords(null).size).toBe(0);
      expect(globalInstinct._extractKeywords(undefined).size).toBe(0);
    });

    test('過濾過短的英文詞（< 2 字元）', () => {
      const kw = globalInstinct._extractKeywords('a b cd ef');
      expect(kw.has('a')).toBe(false);
      expect(kw.has('b')).toBe(false);
      expect(kw.has('cd')).toBe(true);
      expect(kw.has('ef')).toBe(true);
    });
  });

  // ── 10B: _calcRelevance 單元測試 ──

  describe('_calcRelevance', () => {
    test('完全無重疊回傳 0', () => {
      expect(globalInstinct._calcRelevance('apple banana', 'cherry grape')).toBe(0);
    });

    test('完全相同文本回傳高分（接近 1）', () => {
      const score = globalInstinct._calcRelevance('registry stage workflow', 'registry stage workflow');
      expect(score).toBeGreaterThan(0.8);
    });

    test('部分重疊回傳中間值', () => {
      const score = globalInstinct._calcRelevance('registry 錯誤處理', 'registry 型別檢查和錯誤');
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
    });

    test('空字串回傳 0', () => {
      expect(globalInstinct._calcRelevance('', 'something')).toBe(0);
      expect(globalInstinct._calcRelevance('something', '')).toBe(0);
    });
  });

  // ── 10C: queryGlobal relevanceTo 整合測試 ──

  describe('queryGlobal with relevanceTo', () => {
    let projectRoot;

    beforeEach(() => {
      projectRoot = makeTmpProject('relevance');
    });

    afterEach(() => {
      rmSync(projectRoot, { recursive: true, force: true });
      rmSync(paths.global.dir(projectRoot), { recursive: true, force: true });
    });

    function seedGlobal(observations) {
      const obsPath = paths.global.observations(projectRoot);
      mkdirSync(path.dirname(obsPath), { recursive: true });
      for (const o of observations) {
        appendFileSync(obsPath, JSON.stringify(o) + '\n', 'utf8');
      }
    }

    test('relevanceTo 模式下依 finalScore 排序（非純 confidence）', () => {
      seedGlobal([
        makeObs({ tag: 'high-conf-irrelevant', type: 'pattern', confidence: 0.95,
          action: '烹飪食譜建議', trigger: '料理問題', globalTs: new Date().toISOString() }),
        makeObs({ tag: 'low-conf-relevant', type: 'pattern', confidence: 0.7,
          action: 'registry 型別檢查修復', trigger: 'registry 錯誤', globalTs: new Date().toISOString() }),
      ]);

      const resultWithRelevance = globalInstinct.queryGlobal(projectRoot, {
        relevanceTo: '修復 registry 錯誤',
      });

      expect(resultWithRelevance[0].tag).toBe('low-conf-relevant');
      expect(resultWithRelevance[0]._finalScore).toBeDefined();
      expect(resultWithRelevance[0]._relevance).toBeGreaterThan(0);
    });

    test('無 relevanceTo 時仍按純 confidence 排序', () => {
      seedGlobal([
        makeObs({ tag: 'high', type: 'pattern', confidence: 0.95,
          action: '任何內容', globalTs: new Date().toISOString() }),
        makeObs({ tag: 'low', type: 'pattern', confidence: 0.7,
          action: 'registry 修復', globalTs: new Date().toISOString() }),
      ]);

      const result = globalInstinct.queryGlobal(projectRoot, {});
      expect(result[0].tag).toBe('high');
      expect(result[0]._finalScore).toBeUndefined();
    });

    test('relevanceTo + limit 截取 finalScore 前 N', () => {
      seedGlobal([
        makeObs({ tag: 'a', type: 'p1', confidence: 0.9,
          action: '不相關的烹飪', globalTs: new Date().toISOString() }),
        makeObs({ tag: 'b', type: 'p2', confidence: 0.8,
          action: '不相關的音樂', globalTs: new Date().toISOString() }),
        makeObs({ tag: 'c', type: 'p3', confidence: 0.7,
          action: 'workflow stage 處理', globalTs: new Date().toISOString() }),
        makeObs({ tag: 'd', type: 'p4', confidence: 0.75,
          action: 'workflow 收斂偵測', globalTs: new Date().toISOString() }),
      ]);

      const result = globalInstinct.queryGlobal(projectRoot, {
        relevanceTo: 'workflow stage 收斂',
        limit: 2,
      });

      expect(result).toHaveLength(2);
      const tags = result.map(r => r.tag);
      expect(tags).toContain('c');
      expect(tags).toContain('d');
    });

    test('relevanceTo 與其他 filter 組合使用', () => {
      seedGlobal([
        makeObs({ tag: 'match', type: 'pattern', confidence: 0.8,
          action: 'registry 設定管理', globalTs: new Date().toISOString() }),
        makeObs({ tag: 'excluded', type: 'intent_journal', confidence: 0.9,
          action: 'registry 完整分析', globalTs: new Date().toISOString() }),
      ]);

      const result = globalInstinct.queryGlobal(projectRoot, {
        relevanceTo: 'registry',
        excludeTypes: ['intent_journal'],
      });

      expect(result).toHaveLength(1);
      expect(result[0].tag).toBe('match');
    });

    test('全部觀察都不相關時退化為 confidence * 0.6 排序', () => {
      seedGlobal([
        makeObs({ tag: 'high', type: 'pattern', confidence: 0.9,
          action: '烹飪食譜', globalTs: new Date().toISOString() }),
        makeObs({ tag: 'low', type: 'pattern', confidence: 0.7,
          action: '音樂播放', globalTs: new Date().toISOString() }),
      ]);

      const result = globalInstinct.queryGlobal(projectRoot, {
        relevanceTo: 'registry workflow stage 並行收斂',
      });

      expect(result[0]._relevance).toBe(0);
      expect(result[1]._relevance).toBe(0);
      expect(result[0].tag).toBe('high');
    });
  });
});
