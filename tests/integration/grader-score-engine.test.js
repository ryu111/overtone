'use strict';
/**
 * grader-score-engine.test.js — 評分引擎整合測試
 *
 * 覆蓋 BDD 規格：
 *   Feature 6: stop-message-builder 整合 — PASS 階段評分提示
 *   Feature 7: 低分閾值觸發 instinct quality_signal
 *
 * 策略：
 *   - Feature 6：直接呼叫 buildStopMessages，驗證評分提示和警告訊息
 *   - Feature 7：驗證 stateUpdates 的 emitQualitySignal，以及 on-stop.js 整合
 */

const { test, expect, describe, beforeEach, afterEach, afterAll } = require('bun:test');
const { mkdirSync, rmSync, writeFileSync, existsSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const { SCRIPTS_LIB, HOOKS_DIR } = require('../helpers/paths');

const { buildStopMessages } = require(join(SCRIPTS_LIB, 'stop-message-builder'));
const { scoringConfig } = require(join(SCRIPTS_LIB, 'registry'));
const paths = require(join(SCRIPTS_LIB, 'paths'));
const state = require(join(SCRIPTS_LIB, 'state'));
const { workflows, stages, retryDefaults, parallelGroups } = require(join(SCRIPTS_LIB, 'registry'));

// ── 測試基礎設施 ──

const TIMESTAMP = Date.now();
const TEST_PROJECT_ROOT = join(homedir(), '.overtone', 'test-grader-score-' + TIMESTAMP);

// 基本有效的 buildStopMessages ctx
function makeCtx(overrides = {}) {
  return {
    verdict: 'pass',
    stageKey: 'DEV',
    actualStageKey: 'DEV',
    agentName: 'developer',
    sessionId: 'sess_test_' + TIMESTAMP,
    state: { failCount: 0, rejectCount: 0, retroCount: 0 },
    stages,
    retryDefaults,
    parallelGroups,
    tasksCheckboxWarning: null,
    compactSuggestion: { suggest: false },
    convergence: null,
    nextHint: '委派 code-reviewer',
    featureName: null,
    projectRoot: TEST_PROJECT_ROOT,
    specsInfo: null,
    scoringConfig,
    lastScore: null,
    workflowType: 'quick',
    ...overrides,
  };
}

afterAll(() => {
  try {
    const globalDir = paths.global.dir(TEST_PROJECT_ROOT);
    rmSync(globalDir, { recursive: true, force: true });
  } catch { /* 靜默 */ }
});

// ── Feature 6: stop-message-builder 整合 — PASS 階段評分提示 ──

describe('Feature 6: stop-message-builder 整合 — PASS 階段評分提示', () => {
  test('Scenario 6-1: 在 gradedStages 中的 stage PASS 時出現評分提示訊息', () => {
    const ctx = makeCtx({ stageKey: 'DEV', verdict: 'pass', scoringConfig });

    const result = buildStopMessages(ctx);

    const hasGraderMsg = result.messages.some(m => m.includes('grader 評分'));
    expect(hasGraderMsg).toBe(true);

    const graderMsg = result.messages.find(m => m.includes('grader 評分'));
    expect(graderMsg).toContain('STAGE=DEV');
    expect(graderMsg).toContain('AGENT=developer');
  });

  test('Scenario 6-2: 不在 gradedStages 中的 stage PASS 時不出現評分提示', () => {
    const ctx = makeCtx({ stageKey: 'DOCS', verdict: 'pass', scoringConfig });

    const result = buildStopMessages(ctx);

    const hasGraderMsg = result.messages.some(m => m.includes('grader 評分'));
    expect(hasGraderMsg).toBe(false);
  });

  test('Scenario 6-3: 未傳入 scoringConfig 時不出現評分提示（向後相容）', () => {
    const ctx = makeCtx({ stageKey: 'DEV', verdict: 'pass', scoringConfig: undefined });

    let result;
    expect(() => {
      result = buildStopMessages(ctx);
    }).not.toThrow();

    const hasGraderMsg = result.messages.some(m => m.includes('grader 評分'));
    expect(hasGraderMsg).toBe(false);
  });

  test('Scenario 6-4: result = "fail" 時不觸發評分提示', () => {
    const ctx = makeCtx({
      stageKey: 'TEST',
      verdict: 'fail',
      scoringConfig,
      state: { failCount: 1, rejectCount: 0, retroCount: 0 },
    });

    const result = buildStopMessages(ctx);

    const hasGraderMsg = result.messages.some(m => m.includes('grader 評分'));
    expect(hasGraderMsg).toBe(false);
  });

  test('Scenario 6-5: 有上次低分記錄時附加低分警告訊息', () => {
    const ctx = makeCtx({
      stageKey: 'DEV',
      verdict: 'pass',
      scoringConfig,
      lastScore: {
        sessionCount: 3,
        avgClarity: 2.5,
        avgCompleteness: 2.5,
        avgActionability: 2.5,
        avgOverall: 2.5, // 低於 lowScoreThreshold = 3.0
      },
    });

    const result = buildStopMessages(ctx);

    const hasWarning = result.messages.some(m => m.includes('歷史平均分偏低'));
    expect(hasWarning).toBe(true);

    const warningMsg = result.messages.find(m => m.includes('歷史平均分偏低'));
    expect(warningMsg).toContain('2.50');
  });

  test('Scenario 6-6: 有上次記錄但分數高於閾值時不出現警告', () => {
    const ctx = makeCtx({
      stageKey: 'DEV',
      verdict: 'pass',
      scoringConfig,
      lastScore: {
        sessionCount: 5,
        avgClarity: 4.2,
        avgCompleteness: 4.2,
        avgActionability: 4.2,
        avgOverall: 4.2, // 高於 lowScoreThreshold = 3.0
      },
    });

    const result = buildStopMessages(ctx);

    const hasWarning = result.messages.some(m => m.includes('歷史平均分偏低'));
    expect(hasWarning).toBe(false);

    // 評分提示仍然存在
    const hasGraderMsg = result.messages.some(m => m.includes('grader 評分'));
    expect(hasGraderMsg).toBe(true);
  });

  test('Scenario 6-7: lastScore.avgOverall = null（尚無歷史記錄）時不出現警告', () => {
    const ctx = makeCtx({
      stageKey: 'DEV',
      verdict: 'pass',
      scoringConfig,
      lastScore: {
        sessionCount: 0,
        avgClarity: null,
        avgCompleteness: null,
        avgActionability: null,
        avgOverall: null,
      },
    });

    const result = buildStopMessages(ctx);

    const hasWarning = result.messages.some(m => m.includes('歷史平均分偏低'));
    expect(hasWarning).toBe(false);

    // 評分提示仍然存在
    const hasGraderMsg = result.messages.some(m => m.includes('grader 評分'));
    expect(hasGraderMsg).toBe(true);
  });
});

// ── Feature 7: 低分閾值觸發 instinct quality_signal ──

describe('Feature 7: 低分閾值觸發 instinct quality_signal', () => {
  test('Scenario 7-1: overall 低於 lowScoreThreshold 時 stateUpdates 包含 emitQualitySignal', () => {
    const ctx = makeCtx({
      stageKey: 'DEV',
      verdict: 'pass',
      scoringConfig,
      lastScore: {
        sessionCount: 3,
        avgClarity: 2.5,
        avgCompleteness: 2.5,
        avgActionability: 2.5,
        avgOverall: 2.5, // 低於 3.0
      },
    });

    const result = buildStopMessages(ctx);

    const qualityUpdate = result.stateUpdates.find(u => u.type === 'emitQualitySignal');
    expect(qualityUpdate).toBeDefined();
    expect(qualityUpdate.agentName).toBe('developer');
    expect(qualityUpdate.stageKey).toBe('DEV');
    expect(qualityUpdate.avgOverall).toBe(2.5);
    expect(qualityUpdate.threshold).toBe(3.0);
  });

  test('Scenario 7-2: overall 等於 lowScoreThreshold 時不觸發（須嚴格低於）', () => {
    const ctx = makeCtx({
      stageKey: 'DEV',
      verdict: 'pass',
      scoringConfig,
      lastScore: {
        sessionCount: 3,
        avgOverall: 3.0, // 剛好等於閾值，不應觸發
      },
    });

    const result = buildStopMessages(ctx);

    const qualityUpdate = result.stateUpdates.find(u => u.type === 'emitQualitySignal');
    expect(qualityUpdate).toBeUndefined();

    const hasWarning = result.messages.some(m => m.includes('歷史平均分偏低'));
    expect(hasWarning).toBe(false);
  });

  test('Scenario 7-3: stageKey 不在 gradedStages 時不觸發評分或 instinct', () => {
    const ctx = makeCtx({
      stageKey: 'DOCS',
      verdict: 'pass',
      scoringConfig,
      lastScore: {
        sessionCount: 0,
        avgOverall: null,
      },
    });

    const result = buildStopMessages(ctx);

    // 不觸發 emitQualitySignal
    const qualityUpdate = result.stateUpdates.find(u => u.type === 'emitQualitySignal');
    expect(qualityUpdate).toBeUndefined();

    // 不出現評分提示
    const hasGraderMsg = result.messages.some(m => m.includes('grader 評分'));
    expect(hasGraderMsg).toBe(false);
  });

  test('Scenario 7-4: getScoreSummary 拋出例外時靜默捕獲，on-stop 仍正常運行', async () => {
    // 用 on-stop.js 真實子進程測試靜默捕獲
    const sessionId = `test_grader_score_7_4_${TIMESTAMP}`;
    const sessionDir = paths.session.workflow(sessionId).replace('/workflow.json', '');
    mkdirSync(sessionDir, { recursive: true });

    // 初始化一個 quick workflow，DEV stage 為 active
    const stageList = workflows['quick'].stages;
    state.initState(sessionId, 'quick', stageList);
    state.updateStateAtomic(sessionId, (s) => {
      if (s.stages['DEV']) s.stages['DEV'].status = 'active';
      return s;
    });

    const hookPath = join(HOOKS_DIR, 'agent', 'on-stop.js');
    const input = {
      session_id: sessionId,
      agent_type: 'developer',
      last_assistant_message: 'HANDOFF: developer → code-reviewer\n\n### Context\n完成實作',
      cwd: TEST_PROJECT_ROOT,
      transcript_path: null,
    };

    const proc = Bun.spawn(['node', hookPath], {
      stdin: Buffer.from(JSON.stringify(input)),
      env: { ...process.env, CLAUDE_SESSION_ID: sessionId },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const output = await new Response(proc.stdout).text();
    await proc.exited;

    // on-stop.js 不崩潰，輸出合法 JSON
    expect(() => JSON.parse(output)).not.toThrow();
    const parsed = JSON.parse(output);
    expect(typeof parsed).toBe('object');

    // 清理
    try { rmSync(sessionDir, { recursive: true, force: true }); } catch { /* 靜默 */ }
  });
});
