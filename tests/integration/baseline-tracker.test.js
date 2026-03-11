'use strict';
/**
 * baseline-tracker.test.js（整合測試）
 *
 * 驗證效能基線追蹤的端對端流程：
 *   1. SessionEnd 保存基線
 *   2. SessionStart 載入基線摘要
 *   3. 多 session 累積後基線改善偵測
 */

const { test, expect, describe, afterAll } = require('bun:test');
const { mkdirSync, rmSync, writeFileSync, existsSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const { SCRIPTS_LIB, HOOKS_DIR } = require('../helpers/paths');

const paths = require(join(SCRIPTS_LIB, 'paths'));

// ── 測試基礎設施 ──

const TIMESTAMP = Date.now();
const TEST_PROJECT_ROOT = join(homedir(), '.nova', 'test-bl-integ-' + TIMESTAMP);
const sessionsToClean = [];

function makeSession(suffix) {
  const id = `test_bl_integ_${suffix}_${TIMESTAMP}`;
  const dir = join(homedir(), '.nova', 'sessions', id);
  mkdirSync(dir, { recursive: true });
  sessionsToClean.push(dir);
  return { id, dir };
}

function setupCompleteWorkflow(session, durationMs = 30000) {
  const ws = {
    sessionId: session.id,
    workflowType: 'quick',
    createdAt: new Date().toISOString(),
    currentStage: null,
    stages: {
      DEV:    { status: 'completed', result: 'pass' },
      REVIEW: { status: 'completed', result: 'pass' },
      TEST:   { status: 'completed', result: 'pass' },
      RETRO:  { status: 'completed', result: 'pass' },
      DOCS:   { status: 'completed', result: 'pass' },
    },
    activeAgents: {},
    failCount: 0,
    rejectCount: 0,
  };
  writeFileSync(join(session.dir, 'workflow.json'), JSON.stringify(ws), 'utf8');

  const baseTime = Date.now() - durationMs;
  const events = [
    { ts: new Date(baseTime).toISOString(), type: 'workflow:start', category: 'workflow', label: '工作流啟動' },
    { ts: new Date(baseTime + 1000).toISOString(), type: 'stage:start', category: 'stage', label: '階段開始', stage: 'DEV' },
    { ts: new Date(baseTime + 6000).toISOString(), type: 'stage:complete', category: 'stage', label: '階段完成', stage: 'DEV', result: 'pass' },
    { ts: new Date(baseTime + 7000).toISOString(), type: 'stage:start', category: 'stage', label: '階段開始', stage: 'REVIEW' },
    { ts: new Date(baseTime + 12000).toISOString(), type: 'stage:complete', category: 'stage', label: '階段完成', stage: 'REVIEW', result: 'pass' },
    { ts: new Date(baseTime + 13000).toISOString(), type: 'stage:start', category: 'stage', label: '階段開始', stage: 'TEST' },
    { ts: new Date(baseTime + 18000).toISOString(), type: 'stage:complete', category: 'stage', label: '階段完成', stage: 'TEST', result: 'pass' },
    { ts: new Date(baseTime + 19000).toISOString(), type: 'stage:start', category: 'stage', label: '階段開始', stage: 'RETRO' },
    { ts: new Date(baseTime + 22000).toISOString(), type: 'stage:complete', category: 'stage', label: '階段完成', stage: 'RETRO', result: 'pass' },
    { ts: new Date(baseTime + 23000).toISOString(), type: 'stage:start', category: 'stage', label: '階段開始', stage: 'DOCS' },
    { ts: new Date(baseTime + 28000).toISOString(), type: 'stage:complete', category: 'stage', label: '階段完成', stage: 'DOCS', result: 'pass' },
    { ts: new Date(baseTime + durationMs).toISOString(), type: 'workflow:complete', category: 'workflow', label: '工作流完成' },
  ];
  writeFileSync(join(session.dir, 'timeline.jsonl'), events.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf8');
}

afterAll(() => {
  for (const dir of sessionsToClean) {
    rmSync(dir, { recursive: true, force: true });
  }
  rmSync(paths.global.dir(TEST_PROJECT_ROOT), { recursive: true, force: true });
});

// ────────────────────────────────────────────────────────────────────────────
// 1. SessionEnd 基線保存
// ────────────────────────────────────────────────────────────────────────────

describe('SessionEnd 基線保存', () => {
  test('on-session-end.js 保存基線不崩潰', () => {
    const session = makeSession('end-save');
    setupCompleteWorkflow(session, 20000);

    // 模擬 SessionEnd hook 呼叫 saveBaseline
    const baselineTracker = require(join(SCRIPTS_LIB, 'baseline-tracker'));
    const { saved, metrics } = baselineTracker.saveBaseline(session.id, TEST_PROJECT_ROOT);

    expect(saved).toBe(true);
    expect(metrics.workflowType).toBe('quick');
    expect(metrics.duration).toBeGreaterThan(0);

    // 確認 baselines.jsonl 存在
    expect(existsSync(paths.global.baselines(TEST_PROJECT_ROOT))).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. SessionStart 基線摘要載入
// ────────────────────────────────────────────────────────────────────────────

describe('SessionStart 基線摘要載入', () => {
  test('formatBaselineSummary 回傳可讀文字', () => {
    const baselineTracker = require(join(SCRIPTS_LIB, 'baseline-tracker'));

    // 確保有資料
    const session = makeSession('start-summary');
    setupCompleteWorkflow(session, 25000);
    baselineTracker.saveBaseline(session.id, TEST_PROJECT_ROOT);

    const summary = baselineTracker.formatBaselineSummary(TEST_PROJECT_ROOT);
    expect(summary).toContain('效能基線');
    expect(summary).toContain('quick');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. 多 session 累積後基線改善偵測
// ────────────────────────────────────────────────────────────────────────────

describe('多 session 基線改善偵測', () => {
  test('第 N 次比第 1 次更快時顯示改善', () => {
    const baselineTracker = require(join(SCRIPTS_LIB, 'baseline-tracker'));

    // 清理已有基線
    const blPath = paths.global.baselines(TEST_PROJECT_ROOT);
    if (existsSync(blPath)) rmSync(blPath);

    // 模擬 5 次逐漸變快的執行
    const durations = [60000, 55000, 50000, 45000, 40000];
    for (let i = 0; i < durations.length; i++) {
      const session = makeSession(`improve-${i}`);
      setupCompleteWorkflow(session, durations[i]);
      baselineTracker.saveBaseline(session.id, TEST_PROJECT_ROOT);
    }

    // 第 6 次：最快
    const fastSession = makeSession('improve-fast');
    setupCompleteWorkflow(fastSession, 30000);

    const comparison = baselineTracker.compareToBaseline(fastSession.id, TEST_PROJECT_ROOT);
    expect(comparison).not.toBeNull();
    expect(comparison.comparison.duration.improved).toBe(true);
    expect(comparison.comparison.duration.deltaPct).toBeLessThan(0);
  });

  test('第 N 次比第 1 次更慢時顯示退化', () => {
    const baselineTracker = require(join(SCRIPTS_LIB, 'baseline-tracker'));

    const blPath = paths.global.baselines(TEST_PROJECT_ROOT);
    if (existsSync(blPath)) rmSync(blPath);

    // 先寫入快速基線
    const records = [
      { ts: '2026-03-01T00:00:00Z', sessionId: 'fast1', workflowType: 'standard', duration: 20000, retryCount: 0, pass1Rate: 1.0, stageCount: 8 },
      { ts: '2026-03-02T00:00:00Z', sessionId: 'fast2', workflowType: 'standard', duration: 25000, retryCount: 0, pass1Rate: 0.9, stageCount: 8 },
    ];
    mkdirSync(require('path').dirname(blPath), { recursive: true });
    writeFileSync(blPath, records.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');

    // 慢的 session
    const slowSession = makeSession('regress');
    setupCompleteWorkflow(slowSession, 60000);
    // 覆蓋 workflowType 為 standard
    const ws = JSON.parse(require('fs').readFileSync(join(slowSession.dir, 'workflow.json'), 'utf8'));
    ws.workflowType = 'standard';
    ws.stages = { PLAN: { status: 'completed', result: 'pass' }, ARCH: { status: 'completed', result: 'pass' }, TEST: { status: 'completed', result: 'pass' }, DEV: { status: 'completed', result: 'pass' }, REVIEW: { status: 'completed', result: 'pass' }, 'TEST:2': { status: 'completed', result: 'pass' }, RETRO: { status: 'completed', result: 'pass' }, DOCS: { status: 'completed', result: 'pass' } };
    writeFileSync(join(slowSession.dir, 'workflow.json'), JSON.stringify(ws), 'utf8');

    const comparison = baselineTracker.compareToBaseline(slowSession.id, TEST_PROJECT_ROOT);
    expect(comparison).not.toBeNull();
    expect(comparison.comparison.duration.improved).toBe(false);
    expect(comparison.comparison.duration.deltaPct).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. on-session-end hook 整合
// ────────────────────────────────────────────────────────────────────────────

describe('on-session-end hook 整合', () => {
  test('hook 正常執行包含基線保存', () => {
    const session = makeSession('hook-end');
    setupCompleteWorkflow(session, 15000);

    // 執行 hook
    const hookPath = join(HOOKS_DIR, 'session', 'on-session-end.js');
    const proc = Bun.spawnSync(['node', hookPath], {
      stdin: Buffer.from(JSON.stringify({
        session_id: session.id,
        reason: 'other',
      })),
      env: {
        ...process.env,
        CLAUDE_SESSION_ID: session.id,
        CLAUDE_PROJECT_ROOT: TEST_PROJECT_ROOT,
        NOVA_NO_DASHBOARD: '1',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(proc.exitCode).toBe(0);

    // 確認 baselines.jsonl 有新記錄
    const blPath = paths.global.baselines(TEST_PROJECT_ROOT);
    expect(existsSync(blPath)).toBe(true);
  });
});
