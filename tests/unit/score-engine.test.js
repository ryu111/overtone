'use strict';
/**
 * score-engine.test.js — 數值評分引擎單元測試
 *
 * 覆蓋 BDD 規格：
 *   Feature 1: saveScore — 評分記錄寫入
 *   Feature 2: queryScores — 評分記錄查詢
 *   Feature 3: getScoreSummary — 平均分摘要
 *   Feature 4: 截斷機制（_trimIfNeeded）
 *   Feature 5: 專案隔離（projectRoot 維度）
 *   Feature 8: 損壞 JSONL 容錯
 *   Feature 9: registry.js 設定常數
 *   Feature 10: paths.js 全域評分路徑
 */

const { test, expect, describe, beforeEach, afterEach, afterAll } = require('bun:test');
const { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const scoreEngine = require(join(SCRIPTS_LIB, 'score-engine'));
const paths = require(join(SCRIPTS_LIB, 'paths'));
const { scoringConfig, scoringDefaults } = require(join(SCRIPTS_LIB, 'registry'));

// ── 測試基礎設施 ──

const TIMESTAMP = Date.now();
const TEST_PROJECT_ROOT = join(homedir(), '.overtone', 'test-score-project-' + TIMESTAMP);
const TEST_PROJECT_ROOT_B = join(homedir(), '.overtone', 'test-score-project-b-' + TIMESTAMP);
const dirsToClean = [TEST_PROJECT_ROOT, TEST_PROJECT_ROOT_B];

// 建立基本有效的評分記錄
function makeRecord(overrides = {}) {
  return {
    ts: new Date().toISOString(),
    sessionId: 'sess_' + TIMESTAMP,
    workflowType: 'quick',
    stage: 'DEV',
    agent: 'developer',
    scores: { clarity: 4, completeness: 5, actionability: 3 },
    overall: 4.0,
    ...overrides,
  };
}

afterAll(() => {
  for (const dir of dirsToClean) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* 靜默 */ }
  }
  // 清理 global scores 目錄
  try {
    const globalDir = paths.global.dir(TEST_PROJECT_ROOT);
    rmSync(globalDir, { recursive: true, force: true });
  } catch { /* 靜默 */ }
  try {
    const globalDir = paths.global.dir(TEST_PROJECT_ROOT_B);
    rmSync(globalDir, { recursive: true, force: true });
  } catch { /* 靜默 */ }
});

beforeEach(() => {
  // 清除每個測試間的 scores.jsonl
  const scorePath = paths.global.scores(TEST_PROJECT_ROOT);
  try { rmSync(scorePath); } catch { /* 靜默 */ }
  const scorePathB = paths.global.scores(TEST_PROJECT_ROOT_B);
  try { rmSync(scorePathB); } catch { /* 靜默 */ }
});

// ── Feature 1: saveScore — 評分記錄寫入 ──

describe('Feature 1: saveScore — 評分記錄寫入', () => {
  test('Scenario 1-1: 有效記錄成功寫入 scores.jsonl', () => {
    const record = makeRecord({ stage: 'DEV', overall: 4.0 });
    scoreEngine.saveScore(TEST_PROJECT_ROOT, record);

    const scorePath = paths.global.scores(TEST_PROJECT_ROOT);
    expect(existsSync(scorePath)).toBe(true);

    const content = readFileSync(scorePath, 'utf8').trim();
    const lines = content.split('\n').filter(Boolean);
    expect(lines.length).toBe(1);

    const parsed = JSON.parse(lines[0]);
    expect(parsed.stage).toBe('DEV');
    expect(parsed.overall).toBe(4.0);
  });

  test('Scenario 1-2: 多次呼叫以 append-only 方式累積記錄', () => {
    const record1 = makeRecord({ stage: 'DEV' });
    const record2 = makeRecord({ stage: 'REVIEW' });

    scoreEngine.saveScore(TEST_PROJECT_ROOT, record1);
    scoreEngine.saveScore(TEST_PROJECT_ROOT, record2);

    const scorePath = paths.global.scores(TEST_PROJECT_ROOT);
    const content = readFileSync(scorePath, 'utf8').trim();
    const lines = content.split('\n').filter(Boolean);
    expect(lines.length).toBe(2);

    const first = JSON.parse(lines[0]);
    expect(first.stage).toBe('DEV');
  });

  test('Scenario 1-3: 缺少 stage 欄位時拋出錯誤', () => {
    const record = makeRecord();
    delete record.stage;

    expect(() => scoreEngine.saveScore(TEST_PROJECT_ROOT, record)).toThrow();

    // scores.jsonl 不應被建立
    const scorePath = paths.global.scores(TEST_PROJECT_ROOT);
    expect(existsSync(scorePath)).toBe(false);
  });

  test('Scenario 1-4: 缺少 scores.clarity 欄位時拋出錯誤', () => {
    const record = makeRecord();
    delete record.scores.clarity;

    expect(() => scoreEngine.saveScore(TEST_PROJECT_ROOT, record)).toThrow();
  });

  test('Scenario 1-5: 分數目錄不存在時自動建立', () => {
    // 使用全新的專案根目錄
    const freshRoot = join(homedir(), '.overtone', 'test-score-fresh-' + TIMESTAMP + '-new');
    dirsToClean.push(freshRoot);
    try {
      const record = makeRecord();
      scoreEngine.saveScore(freshRoot, record);

      const scorePath = paths.global.scores(freshRoot);
      expect(existsSync(scorePath)).toBe(true);

      const content = readFileSync(scorePath, 'utf8').trim();
      const parsed = JSON.parse(content.split('\n')[0]);
      expect(parsed.stage).toBe('DEV');
    } finally {
      try { rmSync(paths.global.dir(freshRoot), { recursive: true, force: true }); } catch { /* 靜默 */ }
    }
  });
});

// ── Feature 2: queryScores — 評分記錄查詢 ──

describe('Feature 2: queryScores — 評分記錄查詢', () => {
  test('Scenario 2-1: 無 filter 回傳全部記錄', () => {
    scoreEngine.saveScore(TEST_PROJECT_ROOT, makeRecord({ stage: 'DEV' }));
    scoreEngine.saveScore(TEST_PROJECT_ROOT, makeRecord({ stage: 'REVIEW' }));
    scoreEngine.saveScore(TEST_PROJECT_ROOT, makeRecord({ stage: 'TEST' }));

    const results = scoreEngine.queryScores(TEST_PROJECT_ROOT, {});
    expect(results.length).toBe(3);
    expect(results[0].stage).toBe('DEV');
    expect(results[1].stage).toBe('REVIEW');
    expect(results[2].stage).toBe('TEST');
  });

  test('Scenario 2-2: 按 stage 篩選只回傳符合的記錄', () => {
    scoreEngine.saveScore(TEST_PROJECT_ROOT, makeRecord({ stage: 'DEV' }));
    scoreEngine.saveScore(TEST_PROJECT_ROOT, makeRecord({ stage: 'DEV' }));
    scoreEngine.saveScore(TEST_PROJECT_ROOT, makeRecord({ stage: 'REVIEW' }));

    const results = scoreEngine.queryScores(TEST_PROJECT_ROOT, { stage: 'DEV' });
    expect(results.length).toBe(2);
    expect(results.every(r => r.stage === 'DEV')).toBe(true);
  });

  test('Scenario 2-3: 按 workflowType 篩選', () => {
    scoreEngine.saveScore(TEST_PROJECT_ROOT, makeRecord({ workflowType: 'quick' }));
    scoreEngine.saveScore(TEST_PROJECT_ROOT, makeRecord({ workflowType: 'quick' }));
    scoreEngine.saveScore(TEST_PROJECT_ROOT, makeRecord({ workflowType: 'standard' }));

    const results = scoreEngine.queryScores(TEST_PROJECT_ROOT, { workflowType: 'quick' });
    expect(results.length).toBe(2);
    expect(results.every(r => r.workflowType === 'quick')).toBe(true);
  });

  test('Scenario 2-4: limit 限制最多回傳筆數（取最新）', () => {
    for (let i = 1; i <= 5; i++) {
      scoreEngine.saveScore(TEST_PROJECT_ROOT, makeRecord({ overall: i * 1.0 }));
    }

    const results = scoreEngine.queryScores(TEST_PROJECT_ROOT, { limit: 3 });
    expect(results.length).toBe(3);
    // 應回傳最後 3 筆（overall: 3, 4, 5）
    expect(results[0].overall).toBe(3.0);
    expect(results[1].overall).toBe(4.0);
    expect(results[2].overall).toBe(5.0);
  });

  test('Scenario 2-5: scores.jsonl 不存在時回傳空陣列', () => {
    const results = scoreEngine.queryScores(TEST_PROJECT_ROOT, {});
    expect(results).toEqual([]);
  });

  test('Scenario 2-6: 組合 stage + limit 篩選', () => {
    scoreEngine.saveScore(TEST_PROJECT_ROOT, makeRecord({ stage: 'DEV', overall: 1.0 }));
    scoreEngine.saveScore(TEST_PROJECT_ROOT, makeRecord({ stage: 'DEV', overall: 2.0 }));
    scoreEngine.saveScore(TEST_PROJECT_ROOT, makeRecord({ stage: 'DEV', overall: 3.0 }));
    scoreEngine.saveScore(TEST_PROJECT_ROOT, makeRecord({ stage: 'DEV', overall: 4.0 }));
    scoreEngine.saveScore(TEST_PROJECT_ROOT, makeRecord({ stage: 'REVIEW', overall: 5.0 }));
    scoreEngine.saveScore(TEST_PROJECT_ROOT, makeRecord({ stage: 'REVIEW', overall: 5.0 }));

    const results = scoreEngine.queryScores(TEST_PROJECT_ROOT, { stage: 'DEV', limit: 2 });
    expect(results.length).toBe(2);
    expect(results.every(r => r.stage === 'DEV')).toBe(true);
    // 應回傳最後 2 筆 DEV（overall: 3, 4）
    expect(results[0].overall).toBe(3.0);
    expect(results[1].overall).toBe(4.0);
  });

  test('Scenario 2-7: 損壞的 JSON 行被跳過，不影響其他記錄', () => {
    const scorePath = paths.global.scores(TEST_PROJECT_ROOT);
    mkdirSync(require('path').dirname(scorePath), { recursive: true });
    writeFileSync(scorePath, [
      JSON.stringify(makeRecord({ stage: 'DEV', overall: 4.0 })),
      'INVALID_JSON_LINE',
      JSON.stringify(makeRecord({ stage: 'REVIEW', overall: 3.0 })),
    ].join('\n') + '\n', 'utf8');

    const results = scoreEngine.queryScores(TEST_PROJECT_ROOT, {});
    expect(results.length).toBe(2);
  });
});

// ── Feature 3: getScoreSummary — 平均分摘要 ──

describe('Feature 3: getScoreSummary — 平均分摘要', () => {
  test('Scenario 3-1: 有記錄時回傳正確平均值', () => {
    // 第一筆：clarity=4, completeness=4, actionability=4, overall=4.0
    scoreEngine.saveScore(TEST_PROJECT_ROOT, makeRecord({
      stage: 'DEV',
      scores: { clarity: 4, completeness: 4, actionability: 4 },
      overall: 4.0,
    }));
    // 第二筆：clarity=2, completeness=2, actionability=2, overall=2.0
    scoreEngine.saveScore(TEST_PROJECT_ROOT, makeRecord({
      stage: 'DEV',
      scores: { clarity: 2, completeness: 2, actionability: 2 },
      overall: 2.0,
    }));

    const summary = scoreEngine.getScoreSummary(TEST_PROJECT_ROOT, 'DEV');
    expect(summary.sessionCount).toBe(2);
    expect(summary.avgOverall).toBe(3.0);
    expect(summary.avgClarity).toBe(3.0);
    expect(summary.avgCompleteness).toBe(3.0);
    expect(summary.avgActionability).toBe(3.0);
  });

  test('Scenario 3-2: windowSize 只取最近 N 筆', () => {
    // 15 筆，overall 從 1.0 到 5.0（15 等份遞增）
    for (let i = 1; i <= 15; i++) {
      const overall = Math.round((i / 3) * 100) / 100; // 近似值
      scoreEngine.saveScore(TEST_PROJECT_ROOT, makeRecord({
        stage: 'DEV',
        overall: i * 1.0,
        scores: { clarity: Math.min(i, 5), completeness: Math.min(i, 5), actionability: Math.min(i, 5) },
      }));
    }

    const summary = scoreEngine.getScoreSummary(TEST_PROJECT_ROOT, 'DEV', 5);
    expect(summary.sessionCount).toBe(5);
    // 最後 5 筆 overall: 11, 12, 13, 14, 15 → 平均 13
    expect(summary.avgOverall).toBe(13.0);
  });

  test('Scenario 3-3: 不傳 n 時使用 scoringDefaults.compareWindowSize（預設 10）', () => {
    // 12 筆記錄
    for (let i = 1; i <= 12; i++) {
      scoreEngine.saveScore(TEST_PROJECT_ROOT, makeRecord({
        stage: 'DEV',
        overall: i * 1.0,
        scores: { clarity: Math.min(i, 5), completeness: Math.min(i, 5), actionability: Math.min(i, 5) },
      }));
    }

    const summary = scoreEngine.getScoreSummary(TEST_PROJECT_ROOT, 'DEV');
    expect(summary.sessionCount).toBe(10); // 預設 compareWindowSize = 10
  });

  test('Scenario 3-4: 指定 stage 無記錄時回傳 null 平均值', () => {
    scoreEngine.saveScore(TEST_PROJECT_ROOT, makeRecord({ stage: 'REVIEW' }));

    const summary = scoreEngine.getScoreSummary(TEST_PROJECT_ROOT, 'DEV');
    expect(summary.sessionCount).toBe(0);
    expect(summary.avgClarity).toBeNull();
    expect(summary.avgCompleteness).toBeNull();
    expect(summary.avgActionability).toBeNull();
    expect(summary.avgOverall).toBeNull();
  });

  test('Scenario 3-5: scores.jsonl 不存在時回傳空摘要不報錯', () => {
    const summary = scoreEngine.getScoreSummary(TEST_PROJECT_ROOT, 'DEV');
    expect(summary.sessionCount).toBe(0);
    expect(summary.avgOverall).toBeNull();
  });
});

// ── Feature 4: 截斷機制（_trimIfNeeded）──

describe('Feature 4: 截斷機制（_trimIfNeeded）', () => {
  // 縮小測試用 maxRecordsPerStage 以加快速度 — 直接操作 scoringDefaults
  // 實際測試用真實的 maxRecordsPerStage = 50

  test('Scenario 4-1: 某 stage 記錄超過 maxRecordsPerStage 時自動截斷', () => {
    const max = scoringDefaults.maxRecordsPerStage; // 50

    // 寫入 max 筆（恰好達到上限）
    for (let i = 0; i < max; i++) {
      scoreEngine.saveScore(TEST_PROJECT_ROOT, makeRecord({ stage: 'DEV', overall: i * 0.1 }));
    }

    // 寫入第 51 筆（觸發截斷）
    scoreEngine.saveScore(TEST_PROJECT_ROOT, makeRecord({ stage: 'DEV', overall: 5.0 }));

    // 截斷後 DEV 應仍為 max 筆
    const results = scoreEngine.queryScores(TEST_PROJECT_ROOT, { stage: 'DEV' });
    expect(results.length).toBe(max);
    // 最後一筆應是最新加入的（overall = 5.0）
    expect(results[results.length - 1].overall).toBe(5.0);
  });

  test('Scenario 4-2: 截斷只影響超限的 stage，其他 stage 記錄不受影響', () => {
    const max = scoringDefaults.maxRecordsPerStage; // 50

    // 寫入 max 筆 DEV 和 3 筆 REVIEW
    for (let i = 0; i < max; i++) {
      scoreEngine.saveScore(TEST_PROJECT_ROOT, makeRecord({ stage: 'DEV' }));
    }
    for (let i = 0; i < 3; i++) {
      scoreEngine.saveScore(TEST_PROJECT_ROOT, makeRecord({ stage: 'REVIEW' }));
    }

    // 寫入第 51 筆 DEV（觸發截斷）
    scoreEngine.saveScore(TEST_PROJECT_ROOT, makeRecord({ stage: 'DEV' }));

    const devResults = scoreEngine.queryScores(TEST_PROJECT_ROOT, { stage: 'DEV' });
    const reviewResults = scoreEngine.queryScores(TEST_PROJECT_ROOT, { stage: 'REVIEW' });
    expect(devResults.length).toBe(max);
    expect(reviewResults.length).toBe(3);
  });

  test('Scenario 4-3: 記錄未超過上限時不觸發截斷', () => {
    // 寫入 10 筆（遠低於 50 上限）
    for (let i = 0; i < 10; i++) {
      scoreEngine.saveScore(TEST_PROJECT_ROOT, makeRecord({ stage: 'DEV' }));
    }

    // 再寫 1 筆
    scoreEngine.saveScore(TEST_PROJECT_ROOT, makeRecord({ stage: 'DEV' }));

    const results = scoreEngine.queryScores(TEST_PROJECT_ROOT, { stage: 'DEV' });
    expect(results.length).toBe(11);
  });

  test('Scenario 4-4: 截斷使用原子寫回不產生中間損壞狀態', () => {
    const max = scoringDefaults.maxRecordsPerStage;

    for (let i = 0; i <= max; i++) {
      scoreEngine.saveScore(TEST_PROJECT_ROOT, makeRecord({ stage: 'DEV', overall: 3.0 }));
    }

    // 截斷後每行均可解析
    const scorePath = paths.global.scores(TEST_PROJECT_ROOT);
    expect(existsSync(scorePath)).toBe(true);

    const content = readFileSync(scorePath, 'utf8').trim();
    const lines = content.split('\n').filter(Boolean);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
    expect(lines.length).toBeGreaterThan(0);
  });
});

// ── Feature 5: 專案隔離（projectRoot 維度）──

describe('Feature 5: 專案隔離（projectRoot 維度）', () => {
  test('Scenario 5-1: 不同 projectRoot 寫入各自的 scores.jsonl', () => {
    scoreEngine.saveScore(TEST_PROJECT_ROOT, makeRecord({ stage: 'DEV' }));

    const scorePathB = paths.global.scores(TEST_PROJECT_ROOT_B);
    expect(existsSync(scorePathB)).toBe(false);
  });

  test('Scenario 5-2: 查詢只回傳當前 projectRoot 的記錄', () => {
    scoreEngine.saveScore(TEST_PROJECT_ROOT, makeRecord({ stage: 'DEV' }));
    scoreEngine.saveScore(TEST_PROJECT_ROOT, makeRecord({ stage: 'DEV' }));
    scoreEngine.saveScore(TEST_PROJECT_ROOT_B, makeRecord({ stage: 'REVIEW' }));
    scoreEngine.saveScore(TEST_PROJECT_ROOT_B, makeRecord({ stage: 'REVIEW' }));
    scoreEngine.saveScore(TEST_PROJECT_ROOT_B, makeRecord({ stage: 'REVIEW' }));

    const resultsA = scoreEngine.queryScores(TEST_PROJECT_ROOT, { stage: 'DEV' });
    expect(resultsA.length).toBe(2);
    expect(resultsA.every(r => r.stage === 'DEV')).toBe(true);
  });

  test('Scenario 5-3: 兩個 projectRoot 的 scores.jsonl 路徑不同', () => {
    const pathA = paths.global.scores(TEST_PROJECT_ROOT);
    const pathB = paths.global.scores(TEST_PROJECT_ROOT_B);
    expect(pathA).not.toBe(pathB);
    expect(pathA).toMatch(/scores\.jsonl$/);
    expect(pathB).toMatch(/scores\.jsonl$/);
  });
});

// ── Feature 8: 損壞 JSONL 容錯 ──

describe('Feature 8: 損壞 JSONL 容錯', () => {
  test('Scenario 8-1: scores.jsonl 全部為無效 JSON 時回傳空陣列', () => {
    const scorePath = paths.global.scores(TEST_PROJECT_ROOT);
    mkdirSync(require('path').dirname(scorePath), { recursive: true });
    writeFileSync(scorePath, 'NOT_JSON_AT_ALL\nALSO_NOT_JSON\n', 'utf8');

    const results = scoreEngine.queryScores(TEST_PROJECT_ROOT, {});
    expect(results).toEqual([]);
  });

  test('Scenario 8-2: 部分行損壞時跳過損壞行，保留有效記錄', () => {
    const scorePath = paths.global.scores(TEST_PROJECT_ROOT);
    mkdirSync(require('path').dirname(scorePath), { recursive: true });
    writeFileSync(scorePath, [
      JSON.stringify(makeRecord({ stage: 'DEV' })),
      'CORRUPTED_LINE',
      JSON.stringify(makeRecord({ stage: 'TEST' })),
    ].join('\n') + '\n', 'utf8');

    const results = scoreEngine.queryScores(TEST_PROJECT_ROOT, {});
    expect(results.length).toBe(2);
  });

  test('Scenario 8-3: scores.jsonl 為空檔案時回傳空陣列', () => {
    const scorePath = paths.global.scores(TEST_PROJECT_ROOT);
    mkdirSync(require('path').dirname(scorePath), { recursive: true });
    writeFileSync(scorePath, '', 'utf8');

    const results = scoreEngine.queryScores(TEST_PROJECT_ROOT, {});
    expect(results).toEqual([]);
  });
});

// ── Feature 9: registry.js 設定常數 ──

describe('Feature 9: registry.js 設定常數', () => {
  test('Scenario 9-1: scoringConfig 包含必要欄位', () => {
    expect(Array.isArray(scoringConfig.gradedStages)).toBe(true);
    expect(scoringConfig.gradedStages.length).toBeGreaterThan(0);
    expect(scoringConfig.gradedStages).toContain('DEV');
    expect(scoringConfig.gradedStages).toContain('REVIEW');
    expect(scoringConfig.gradedStages).toContain('TEST');
    expect(scoringConfig.lowScoreThreshold).toBe(3.0);
  });

  test('Scenario 9-2: scoringDefaults 包含必要欄位', () => {
    expect(scoringDefaults.compareWindowSize).toBe(10);
    expect(scoringDefaults.maxRecordsPerStage).toBe(50);
  });

  test('Scenario 9-3: scoringConfig 和 scoringDefaults 可從 module.exports 取得', () => {
    const registry = require(join(SCRIPTS_LIB, 'registry'));
    expect(typeof registry.scoringConfig).toBe('object');
    expect(typeof registry.scoringDefaults).toBe('object');
    expect(registry.scoringConfig).not.toBeUndefined();
    expect(registry.scoringDefaults).not.toBeUndefined();
  });
});

// ── Feature 10: paths.js 全域評分路徑 ──

describe('Feature 10: paths.js 全域評分路徑', () => {
  test('Scenario 10-1: paths.global.scores(projectRoot) 回傳正確路徑格式', () => {
    const projectRoot = '/Users/me/projects/overtone';
    const scorePath = paths.global.scores(projectRoot);
    expect(scorePath).toMatch(/scores\.jsonl$/);
    expect(scorePath).not.toContain(projectRoot); // 應包含 hash 而非原路徑
    expect(scorePath).toMatch(/\.overtone\/global\/[a-f0-9]{8}\/scores\.jsonl$/);
  });

  test('Scenario 10-2: 相同 projectRoot 多次呼叫回傳相同路徑（穩定性）', () => {
    const projectRoot = '/Users/me/projects/overtone';
    const path1 = paths.global.scores(projectRoot);
    const path2 = paths.global.scores(projectRoot);
    const path3 = paths.global.scores(projectRoot);
    expect(path1).toBe(path2);
    expect(path2).toBe(path3);
  });

  test('Scenario 10-3: 不同 projectRoot 回傳不同路徑', () => {
    const pathA = paths.global.scores('/tmp/project-a');
    const pathB = paths.global.scores('/tmp/project-b');
    expect(pathA).not.toBe(pathB);
  });
});
