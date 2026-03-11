'use strict';
/**
 * trend-analysis.test.js — 趨勢分析單元測試
 *
 * 覆蓋：
 *   Feature 1: computeBaselineTrend — baseline-tracker 趨勢計算
 *   Feature 2: computeScoreTrend — score-engine 趨勢計算
 *   Feature 3: formatScoreSummary — 品質評分摘要格式化
 *   Feature 4: formatBaselineSummary 整合趨勢箭頭
 */

const { test, expect, describe, afterAll } = require('bun:test');
const { mkdirSync, rmSync, writeFileSync, existsSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const baselineTracker = require(join(SCRIPTS_LIB, 'baseline-tracker'));
const scoreEngine = require(join(SCRIPTS_LIB, 'score-engine'));
const paths = require(join(SCRIPTS_LIB, 'paths'));

// ── 測試基礎設施 ──

const TIMESTAMP = Date.now();
const TEST_PROJECT_ROOT = join(homedir(), '.nova', 'test-trend-project-' + TIMESTAMP);

function ensureDir(p) {
  mkdirSync(require('path').dirname(p), { recursive: true });
}

function writeBaselines(records) {
  const blPath = paths.global.baselines(TEST_PROJECT_ROOT);
  if (existsSync(blPath)) rmSync(blPath);
  ensureDir(blPath);
  writeFileSync(blPath, records.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
}

function writeScores(records) {
  const scorePath = paths.global.scores(TEST_PROJECT_ROOT);
  if (existsSync(scorePath)) rmSync(scorePath);
  ensureDir(scorePath);
  writeFileSync(scorePath, records.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
}

// 建立模擬 baseline 記錄
function makeBaselineRecord(overrides = {}) {
  return {
    ts: new Date().toISOString(),
    sessionId: 'sess_bl_' + Math.random(),
    workflowType: 'quick',
    duration: 30000,
    retryCount: 1,
    pass1Rate: 0.8,
    stageCount: 5,
    stageDurations: {},
    ...overrides,
  };
}

// 建立模擬評分記錄
function makeScoreRecord(overrides = {}) {
  return {
    ts: new Date().toISOString(),
    sessionId: 'sess_sc_' + Math.random(),
    workflowType: 'quick',
    stage: 'DEV',
    agent: 'developer',
    scores: { clarity: 4, completeness: 4, actionability: 4 },
    overall: 4.0,
    ...overrides,
  };
}

afterAll(() => {
  const globalDir = paths.global.dir(TEST_PROJECT_ROOT);
  try { rmSync(globalDir, { recursive: true, force: true }); } catch { /* 靜默 */ }
});

// ────────────────────────────────────────────────────────────────────────────
// Feature 1: computeBaselineTrend
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 1: computeBaselineTrend', () => {
  test('Scenario 1-1: 不足 4 筆回傳 null', () => {
    writeBaselines([
      makeBaselineRecord(),
      makeBaselineRecord(),
      makeBaselineRecord(),
    ]);

    const result = baselineTracker.computeBaselineTrend(TEST_PROJECT_ROOT, 'quick');
    expect(result).toBeNull();
  });

  test('Scenario 1-2: 剛好 4 筆可以計算（不回傳 null）', () => {
    writeBaselines([
      makeBaselineRecord({ duration: 40000 }),
      makeBaselineRecord({ duration: 40000 }),
      makeBaselineRecord({ duration: 30000 }),
      makeBaselineRecord({ duration: 30000 }),
    ]);

    const result = baselineTracker.computeBaselineTrend(TEST_PROJECT_ROOT, 'quick');
    expect(result).not.toBeNull();
    expect(result.sessionCount).toBe(4);
  });

  test('Scenario 1-3: duration 明顯下降 → improving', () => {
    // 前半 duration 高，後半 duration 低
    writeBaselines([
      makeBaselineRecord({ duration: 60000, pass1Rate: 0.8 }),
      makeBaselineRecord({ duration: 60000, pass1Rate: 0.8 }),
      makeBaselineRecord({ duration: 30000, pass1Rate: 0.8 }),
      makeBaselineRecord({ duration: 30000, pass1Rate: 0.8 }),
    ]);

    const result = baselineTracker.computeBaselineTrend(TEST_PROJECT_ROOT, 'quick');
    expect(result).not.toBeNull();
    expect(result.direction).toBe('improving');
  });

  test('Scenario 1-4: duration 明顯上升 → degrading', () => {
    // 前半 duration 低，後半 duration 高
    writeBaselines([
      makeBaselineRecord({ duration: 20000, pass1Rate: 0.8 }),
      makeBaselineRecord({ duration: 20000, pass1Rate: 0.8 }),
      makeBaselineRecord({ duration: 60000, pass1Rate: 0.8 }),
      makeBaselineRecord({ duration: 60000, pass1Rate: 0.8 }),
    ]);

    const result = baselineTracker.computeBaselineTrend(TEST_PROJECT_ROOT, 'quick');
    expect(result).not.toBeNull();
    expect(result.direction).toBe('degrading');
  });

  test('Scenario 1-5: duration 變化 < 5% → stagnant（duration 維度）', () => {
    // 前後半 duration 幾乎相同，pass1Rate 也穩定
    writeBaselines([
      makeBaselineRecord({ duration: 30000, pass1Rate: 0.8 }),
      makeBaselineRecord({ duration: 30000, pass1Rate: 0.8 }),
      makeBaselineRecord({ duration: 30500, pass1Rate: 0.8 }),
      makeBaselineRecord({ duration: 30500, pass1Rate: 0.8 }),
    ]);

    const result = baselineTracker.computeBaselineTrend(TEST_PROJECT_ROOT, 'quick');
    expect(result).not.toBeNull();
    expect(result.direction).toBe('stagnant');
  });

  test('Scenario 1-6: pass1Rate 上升 + duration 穩定 → improving（多數決）', () => {
    // pass1Rate 明顯上升，duration 穩定
    writeBaselines([
      makeBaselineRecord({ duration: 30000, pass1Rate: 0.5 }),
      makeBaselineRecord({ duration: 30000, pass1Rate: 0.5 }),
      makeBaselineRecord({ duration: 30000, pass1Rate: 0.9 }),
      makeBaselineRecord({ duration: 30000, pass1Rate: 0.9 }),
    ]);

    const result = baselineTracker.computeBaselineTrend(TEST_PROJECT_ROOT, 'quick');
    expect(result).not.toBeNull();
    expect(result.direction).toBe('improving');
  });

  test('Scenario 1-7: 回傳結果包含 direction、details、sessionCount', () => {
    writeBaselines([
      makeBaselineRecord({ duration: 60000, pass1Rate: 0.8 }),
      makeBaselineRecord({ duration: 60000, pass1Rate: 0.8 }),
      makeBaselineRecord({ duration: 30000, pass1Rate: 0.8 }),
      makeBaselineRecord({ duration: 30000, pass1Rate: 0.8 }),
    ]);

    const result = baselineTracker.computeBaselineTrend(TEST_PROJECT_ROOT, 'quick');
    expect(result).not.toBeNull();
    expect(['improving', 'stagnant', 'degrading']).toContain(result.direction);
    expect(result.details).toBeDefined();
    expect(typeof result.details.duration).toBe('string');
    expect(typeof result.details.pass1Rate).toBe('string');
    expect(typeof result.sessionCount).toBe('number');
  });

  test('Scenario 1-8: 不存在的 workflowType 回傳 null', () => {
    writeBaselines([
      makeBaselineRecord({ duration: 30000 }),
      makeBaselineRecord({ duration: 30000 }),
      makeBaselineRecord({ duration: 30000 }),
      makeBaselineRecord({ duration: 30000 }),
    ]);

    const result = baselineTracker.computeBaselineTrend(TEST_PROJECT_ROOT, 'nonexistent');
    expect(result).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature 2: computeScoreTrend
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 2: computeScoreTrend', () => {
  test('Scenario 2-1: 不足 4 筆回傳 null', () => {
    writeScores([
      makeScoreRecord({ overall: 4.0 }),
      makeScoreRecord({ overall: 4.0 }),
      makeScoreRecord({ overall: 4.0 }),
    ]);

    const result = scoreEngine.computeScoreTrend(TEST_PROJECT_ROOT, 'DEV');
    expect(result).toBeNull();
  });

  test('Scenario 2-2: overall 明顯上升 → improving', () => {
    // 前半 overall 低，後半 overall 高
    writeScores([
      makeScoreRecord({ overall: 3.0 }),
      makeScoreRecord({ overall: 3.0 }),
      makeScoreRecord({ overall: 4.5 }),
      makeScoreRecord({ overall: 4.5 }),
    ]);

    const result = scoreEngine.computeScoreTrend(TEST_PROJECT_ROOT, 'DEV');
    expect(result).not.toBeNull();
    expect(result.direction).toBe('improving');
  });

  test('Scenario 2-3: overall 明顯下降 → degrading', () => {
    // 前半 overall 高，後半 overall 低
    writeScores([
      makeScoreRecord({ overall: 4.5 }),
      makeScoreRecord({ overall: 4.5 }),
      makeScoreRecord({ overall: 3.0 }),
      makeScoreRecord({ overall: 3.0 }),
    ]);

    const result = scoreEngine.computeScoreTrend(TEST_PROJECT_ROOT, 'DEV');
    expect(result).not.toBeNull();
    expect(result.direction).toBe('degrading');
  });

  test('Scenario 2-4: overall 變化 < 5% → stagnant', () => {
    // 前後半幾乎相同
    writeScores([
      makeScoreRecord({ overall: 4.0 }),
      makeScoreRecord({ overall: 4.0 }),
      makeScoreRecord({ overall: 4.05 }),
      makeScoreRecord({ overall: 4.05 }),
    ]);

    const result = scoreEngine.computeScoreTrend(TEST_PROJECT_ROOT, 'DEV');
    expect(result).not.toBeNull();
    expect(result.direction).toBe('stagnant');
  });

  test('Scenario 2-5: 回傳結果包含 firstHalfAvg、secondHalfAvg、sessionCount', () => {
    writeScores([
      makeScoreRecord({ overall: 3.0 }),
      makeScoreRecord({ overall: 3.0 }),
      makeScoreRecord({ overall: 4.5 }),
      makeScoreRecord({ overall: 4.5 }),
    ]);

    const result = scoreEngine.computeScoreTrend(TEST_PROJECT_ROOT, 'DEV');
    expect(result).not.toBeNull();
    expect(typeof result.firstHalfAvg).toBe('number');
    expect(typeof result.secondHalfAvg).toBe('number');
    expect(typeof result.sessionCount).toBe('number');
    expect(result.firstHalfAvg).toBe(3.0);
    expect(result.secondHalfAvg).toBe(4.5);
  });

  test('Scenario 2-6: 指定不存在的 stage 回傳 null', () => {
    writeScores([
      makeScoreRecord({ stage: 'DEV', overall: 4.0 }),
      makeScoreRecord({ stage: 'DEV', overall: 4.0 }),
      makeScoreRecord({ stage: 'DEV', overall: 4.0 }),
      makeScoreRecord({ stage: 'DEV', overall: 4.0 }),
    ]);

    const result = scoreEngine.computeScoreTrend(TEST_PROJECT_ROOT, 'REVIEW');
    expect(result).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature 3: formatScoreSummary
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 3: formatScoreSummary', () => {
  test('Scenario 3-1: 無資料時回傳空字串', () => {
    // 確保沒有評分記錄
    const scorePath = paths.global.scores(TEST_PROJECT_ROOT);
    if (existsSync(scorePath)) rmSync(scorePath);

    const result = scoreEngine.formatScoreSummary(TEST_PROJECT_ROOT);
    expect(result).toBe('');
  });

  test('Scenario 3-2: 有評分時包含 stage 名稱和 overall 值', () => {
    writeScores([
      makeScoreRecord({ stage: 'DEV', overall: 4.25 }),
    ]);

    const result = scoreEngine.formatScoreSummary(TEST_PROJECT_ROOT);
    expect(result).toContain('DEV');
    expect(result).toContain('4.25');
    expect(result).toContain('/5.0');
  });

  test('Scenario 3-3: 不足 4 筆時不顯示趨勢箭頭', () => {
    writeScores([
      makeScoreRecord({ stage: 'DEV', overall: 4.0 }),
      makeScoreRecord({ stage: 'DEV', overall: 4.0 }),
    ]);

    const result = scoreEngine.formatScoreSummary(TEST_PROJECT_ROOT);
    // 不足 4 筆，不應有趨勢箭頭
    expect(result).not.toContain('↑');
    expect(result).not.toContain('↓');
    expect(result).not.toContain('→');
  });

  test('Scenario 3-4: 足夠記錄且 overall 上升時顯示 ↑ 進步中', () => {
    writeScores([
      makeScoreRecord({ stage: 'DEV', overall: 3.0 }),
      makeScoreRecord({ stage: 'DEV', overall: 3.0 }),
      makeScoreRecord({ stage: 'DEV', overall: 4.5 }),
      makeScoreRecord({ stage: 'DEV', overall: 4.5 }),
    ]);

    const result = scoreEngine.formatScoreSummary(TEST_PROJECT_ROOT);
    expect(result).toContain('↑ 進步中');
  });

  test('Scenario 3-5: 摘要以品質評分標題開頭（有資料時）', () => {
    writeScores([
      makeScoreRecord({ stage: 'DEV', overall: 4.0 }),
    ]);

    const result = scoreEngine.formatScoreSummary(TEST_PROJECT_ROOT);
    expect(result).toContain('品質評分');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature 4: formatBaselineSummary 整合趨勢箭頭
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 4: formatBaselineSummary 整合趨勢', () => {
  test('Scenario 4-1: 不足 4 筆時不顯示趨勢箭頭', () => {
    writeBaselines([
      makeBaselineRecord({ duration: 30000, pass1Rate: 0.8 }),
      makeBaselineRecord({ duration: 30000, pass1Rate: 0.8 }),
    ]);

    const result = baselineTracker.formatBaselineSummary(TEST_PROJECT_ROOT);
    expect(result).not.toContain('↑');
    expect(result).not.toContain('↓');
    expect(result).not.toContain('→');
  });

  test('Scenario 4-2: duration 下降時摘要包含 ↑ 進步中', () => {
    // 前半 duration 高，後半低 → improving
    writeBaselines([
      makeBaselineRecord({ duration: 60000, pass1Rate: 0.8 }),
      makeBaselineRecord({ duration: 60000, pass1Rate: 0.8 }),
      makeBaselineRecord({ duration: 30000, pass1Rate: 0.8 }),
      makeBaselineRecord({ duration: 30000, pass1Rate: 0.8 }),
    ]);

    const result = baselineTracker.formatBaselineSummary(TEST_PROJECT_ROOT);
    expect(result).toContain('↑ 進步中');
  });

  test('Scenario 4-3: duration 上升時摘要包含 ↓ 退步中', () => {
    // 前半 duration 低，後半高 → degrading
    writeBaselines([
      makeBaselineRecord({ duration: 20000, pass1Rate: 0.8 }),
      makeBaselineRecord({ duration: 20000, pass1Rate: 0.8 }),
      makeBaselineRecord({ duration: 60000, pass1Rate: 0.8 }),
      makeBaselineRecord({ duration: 60000, pass1Rate: 0.8 }),
    ]);

    const result = baselineTracker.formatBaselineSummary(TEST_PROJECT_ROOT);
    expect(result).toContain('↓ 退步中');
  });

  test('Scenario 4-4: 穩定時摘要包含 → 穩定', () => {
    // 前後半幾乎相同
    writeBaselines([
      makeBaselineRecord({ duration: 30000, pass1Rate: 0.8 }),
      makeBaselineRecord({ duration: 30000, pass1Rate: 0.8 }),
      makeBaselineRecord({ duration: 30200, pass1Rate: 0.8 }),
      makeBaselineRecord({ duration: 30200, pass1Rate: 0.8 }),
    ]);

    const result = baselineTracker.formatBaselineSummary(TEST_PROJECT_ROOT);
    expect(result).toContain('→ 穩定');
  });

  test('Scenario 4-5: 摘要仍包含原有的次數、秒數、pass@1 資訊', () => {
    writeBaselines([
      makeBaselineRecord({ duration: 60000, pass1Rate: 0.8 }),
      makeBaselineRecord({ duration: 60000, pass1Rate: 0.8 }),
      makeBaselineRecord({ duration: 30000, pass1Rate: 0.8 }),
      makeBaselineRecord({ duration: 30000, pass1Rate: 0.8 }),
    ]);

    const result = baselineTracker.formatBaselineSummary(TEST_PROJECT_ROOT);
    expect(result).toContain('quick');
    expect(result).toContain('次');
    expect(result).toContain('s');
    expect(result).toContain('pass@1');
    expect(result).toContain('%');
  });
});
