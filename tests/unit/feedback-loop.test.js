'use strict';
/**
 * feedback-loop.test.js — 回饋閉環 score context 邏輯單元測試
 *
 * 覆蓋 pre-task.js 中 score context 注入的核心邏輯：
 *   Feature 1: score context 產生邏輯（有分數時輸出正確字串）
 *   Feature 2: 最低維度偵測（找到三個維度中最低的）
 *   Feature 3: 無分數時回傳 null
 *   Feature 4: lowScoreThreshold 警告邏輯
 */
const { test, expect, describe } = require('bun:test');
const { join } = require('path');
const { mkdirSync, rmSync } = require('fs');
const os = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const scoreEngine = require(join(SCRIPTS_LIB, 'score-engine'));
const { scoringConfig } = require(join(SCRIPTS_LIB, 'registry'));

// ── 輔助工具 ──

/**
 * 建立唯一的測試用 projectRoot
 */
function makeTmpProject(label = '') {
  const dir = join(os.tmpdir(), `ot-fl-unit-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * 模擬 pre-task.js 中 score context 的組裝邏輯（純函式抽取，便於測試）
 */
function buildScoreContext(summary, agentName, stage) {
  if (!summary || summary.sessionCount === 0) return null;

  const dims = [
    { name: 'clarity', val: summary.avgClarity },
    { name: 'completeness', val: summary.avgCompleteness },
    { name: 'actionability', val: summary.avgActionability },
  ];
  const lowest = dims.reduce((a, b) => (a.val <= b.val ? a : b));

  return [
    `[品質歷史 — ${agentName}@${stage}（${summary.sessionCount} 筆）]`,
    `  clarity: ${summary.avgClarity.toFixed(2)}/5.0`,
    `  completeness: ${summary.avgCompleteness.toFixed(2)}/5.0`,
    `  actionability: ${summary.avgActionability.toFixed(2)}/5.0`,
    `  overall: ${summary.avgOverall.toFixed(2)}/5.0`,
    summary.avgOverall < scoringConfig.lowScoreThreshold
      ? `⚠️ 歷史平均分偏低，建議特別注意品質。重點提升 ${lowest.name}。`
      : `💡 歷史最低維度：${lowest.name}（${lowest.val.toFixed(2)}），可優先關注。`,
  ].join('\n');
}

// ────────────────────────────────────────────────────────────────────────────
// Feature 1: score context 產生邏輯
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 1: score context 產生邏輯', () => {
  test('Scenario 1-1: 有分數時產出包含正確 stage 名稱和筆數的 context', () => {
    const summary = {
      sessionCount: 3,
      avgClarity: 4.0,
      avgCompleteness: 3.5,
      avgActionability: 4.2,
      avgOverall: 3.9,
    };

    const ctx = buildScoreContext(summary, 'developer', 'DEV');

    expect(ctx).not.toBeNull();
    expect(ctx).toContain('[品質歷史 — developer@DEV（3 筆）]');
    expect(ctx).toContain('clarity: 4.00/5.0');
    expect(ctx).toContain('completeness: 3.50/5.0');
    expect(ctx).toContain('actionability: 4.20/5.0');
    expect(ctx).toContain('overall: 3.90/5.0');
  });

  test('Scenario 1-2: context 字串格式為多行（換行符分隔）', () => {
    const summary = {
      sessionCount: 1,
      avgClarity: 5.0,
      avgCompleteness: 5.0,
      avgActionability: 5.0,
      avgOverall: 5.0,
    };

    const ctx = buildScoreContext(summary, 'code-reviewer', 'REVIEW');

    expect(ctx).toContain('\n');
    const lines = ctx.split('\n');
    // 應有 6 行：header + 4 個分數行 + 1 個建議行
    expect(lines.length).toBe(6);
  });

  test('Scenario 1-3: REVIEW stage 的 context 包含正確 stage 標籤', () => {
    const summary = {
      sessionCount: 5,
      avgClarity: 3.2,
      avgCompleteness: 3.8,
      avgActionability: 3.5,
      avgOverall: 3.5,
    };

    const ctx = buildScoreContext(summary, 'code-reviewer', 'REVIEW');

    expect(ctx).toContain('[品質歷史 — code-reviewer@REVIEW（5 筆）]');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature 2: 最低維度偵測
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 2: 最低維度偵測', () => {
  test('Scenario 2-1: clarity 最低時，建議提升 clarity', () => {
    const summary = {
      sessionCount: 2,
      avgClarity: 2.0,
      avgCompleteness: 4.5,
      avgActionability: 4.0,
      avgOverall: 3.5,
    };

    const ctx = buildScoreContext(summary, 'developer', 'DEV');

    // overall 3.5 >= lowScoreThreshold(3.0)，顯示 💡 提示
    expect(ctx).toContain('💡 歷史最低維度：clarity（2.00），可優先關注。');
  });

  test('Scenario 2-2: completeness 最低時，建議提升 completeness', () => {
    const summary = {
      sessionCount: 2,
      avgClarity: 4.5,
      avgCompleteness: 2.5,
      avgActionability: 4.0,
      avgOverall: 3.67,
    };

    const ctx = buildScoreContext(summary, 'developer', 'DEV');

    expect(ctx).toContain('💡 歷史最低維度：completeness（2.50），可優先關注。');
  });

  test('Scenario 2-3: actionability 最低時，建議提升 actionability', () => {
    const summary = {
      sessionCount: 2,
      avgClarity: 4.5,
      avgCompleteness: 4.0,
      avgActionability: 1.5,
      avgOverall: 3.33,
    };

    const ctx = buildScoreContext(summary, 'tester', 'TEST');

    expect(ctx).toContain('💡 歷史最低維度：actionability（1.50），可優先關注。');
  });

  test('Scenario 2-4: 三個維度相同時，選第一個（clarity）', () => {
    const summary = {
      sessionCount: 1,
      avgClarity: 3.0,
      avgCompleteness: 3.0,
      avgActionability: 3.0,
      avgOverall: 3.0,
    };

    const ctx = buildScoreContext(summary, 'developer', 'DEV');

    // reduce 取第一個最小，相同時取 a（clarity）
    expect(ctx).toContain('clarity');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature 3: 無分數時回傳 null
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 3: 無分數時回傳 null', () => {
  test('Scenario 3-1: sessionCount 為 0 時回傳 null', () => {
    const summary = {
      sessionCount: 0,
      avgClarity: null,
      avgCompleteness: null,
      avgActionability: null,
      avgOverall: null,
    };

    const ctx = buildScoreContext(summary, 'developer', 'DEV');

    expect(ctx).toBeNull();
  });

  test('Scenario 3-2: summary 為 null 時回傳 null', () => {
    const ctx = buildScoreContext(null, 'developer', 'DEV');

    expect(ctx).toBeNull();
  });

  test('Scenario 3-3: getScoreSummary 在無記錄時回傳 sessionCount: 0', () => {
    const tmpProject = makeTmpProject('no-scores');

    try {
      const summary = scoreEngine.getScoreSummary(tmpProject, 'DEV');

      expect(summary.sessionCount).toBe(0);
      expect(buildScoreContext(summary, 'developer', 'DEV')).toBeNull();
    } finally {
      rmSync(tmpProject, { recursive: true, force: true });
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature 4: lowScoreThreshold 警告邏輯
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 4: lowScoreThreshold 警告邏輯', () => {
  test('Scenario 4-1: overall 低於 lowScoreThreshold 時顯示 ⚠️ 警告', () => {
    // lowScoreThreshold = 3.0，所以 2.9 應觸發警告
    const summary = {
      sessionCount: 3,
      avgClarity: 2.0,
      avgCompleteness: 3.5,
      avgActionability: 3.2,
      avgOverall: 2.9,
    };

    const ctx = buildScoreContext(summary, 'developer', 'DEV');

    expect(ctx).toContain('⚠️ 歷史平均分偏低，建議特別注意品質。重點提升 clarity。');
    expect(ctx).not.toContain('💡');
  });

  test('Scenario 4-2: overall 等於 lowScoreThreshold（3.0）時顯示 💡 提示（非警告）', () => {
    const summary = {
      sessionCount: 2,
      avgClarity: 3.0,
      avgCompleteness: 3.0,
      avgActionability: 3.0,
      avgOverall: 3.0,
    };

    const ctx = buildScoreContext(summary, 'developer', 'DEV');

    // 3.0 < 3.0 為 false，顯示 💡
    expect(ctx).toContain('💡');
    expect(ctx).not.toContain('⚠️');
  });

  test('Scenario 4-3: overall 高於 lowScoreThreshold 時顯示 💡 提示', () => {
    const summary = {
      sessionCount: 5,
      avgClarity: 4.2,
      avgCompleteness: 4.0,
      avgActionability: 4.5,
      avgOverall: 4.23,
    };

    const ctx = buildScoreContext(summary, 'code-reviewer', 'REVIEW');

    expect(ctx).toContain('💡');
    expect(ctx).not.toContain('⚠️');
  });

  test('Scenario 4-4: scoringConfig.lowScoreThreshold 確認為 3.0', () => {
    expect(scoringConfig.lowScoreThreshold).toBe(3.0);
  });

  test('Scenario 4-5: scoringConfig.gradedStages 包含 DEV、REVIEW、TEST', () => {
    expect(scoringConfig.gradedStages).toContain('DEV');
    expect(scoringConfig.gradedStages).toContain('REVIEW');
    expect(scoringConfig.gradedStages).toContain('TEST');
  });
});
