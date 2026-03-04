'use strict';
/**
 * baseline-tracker.test.js — 效能基線追蹤單元測試
 *
 * 測試面向：
 *   1. computeSessionMetrics：從 timeline + state 擷取指標
 *   2. saveBaseline + getBaseline：持久化與基線計算
 *   3. compareToBaseline：比較與改善判斷
 *   4. formatBaselineSummary：人類可讀摘要
 *   5. _trimIfNeeded：自動截斷
 *   6. 邊界情況：空 store、無 workflow、跨 workflowType 隔離
 */

const { test, expect, describe, beforeEach, afterEach, afterAll } = require('bun:test');
const { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const baselineTracker = require(join(SCRIPTS_LIB, 'baseline-tracker'));
const timeline = require(join(SCRIPTS_LIB, 'timeline'));
const state = require(join(SCRIPTS_LIB, 'state'));
const paths = require(join(SCRIPTS_LIB, 'paths'));
const { baselineDefaults } = require(join(SCRIPTS_LIB, 'registry'));

// ── 測試基礎設施 ──

const TIMESTAMP = Date.now();
const TEST_PROJECT_ROOT = join(homedir(), '.overtone', 'test-baseline-project-' + TIMESTAMP);
const sessionsToClean = [];
const dirsToClean = [TEST_PROJECT_ROOT];

function makeSession(suffix) {
  const id = `test_bl_${suffix}_${TIMESTAMP}`;
  const dir = join(homedir(), '.overtone', 'sessions', id);
  mkdirSync(dir, { recursive: true });
  sessionsToClean.push(dir);
  return { id, dir };
}

/**
 * 建立一個完整的 workflow 模擬（有 state + timeline 事件）
 */
function setupCompleteWorkflow(session, options = {}) {
  const {
    workflowType = 'quick',
    stages = ['DEV', 'REVIEW', 'TEST', 'RETRO', 'DOCS'],
    failCount = 0,
    rejectCount = 0,
    durationMs = 30000,
    stageDurationMs = 5000,
  } = options;

  // 建立 state
  const stageEntries = {};
  for (const s of stages) {
    stageEntries[s] = { status: 'completed', result: 'pass' };
  }

  const ws = {
    sessionId: session.id,
    workflowType,
    createdAt: new Date().toISOString(),
    currentStage: null,
    stages: stageEntries,
    activeAgents: {},
    failCount,
    rejectCount,
    retroCount: 0,
    featureName: null,
  };
  writeFileSync(join(session.dir, 'workflow.json'), JSON.stringify(ws), 'utf8');

  // 建立 timeline 事件
  const baseTime = Date.now() - durationMs;
  const events = [];

  events.push({ ts: new Date(baseTime).toISOString(), type: 'workflow:start', category: 'workflow', label: '工作流啟動' });

  let offset = 1000;
  for (const s of stages) {
    events.push({ ts: new Date(baseTime + offset).toISOString(), type: 'stage:start', category: 'stage', label: '階段開始', stage: s });
    offset += stageDurationMs;
    events.push({ ts: new Date(baseTime + offset).toISOString(), type: 'stage:complete', category: 'stage', label: '階段完成', stage: s, result: 'pass' });
    offset += 100;
  }

  events.push({ ts: new Date(baseTime + durationMs).toISOString(), type: 'workflow:complete', category: 'workflow', label: '工作流完成' });

  const timelineContent = events.map(e => JSON.stringify(e)).join('\n') + '\n';
  writeFileSync(join(session.dir, 'timeline.jsonl'), timelineContent, 'utf8');
}

afterAll(() => {
  for (const dir of sessionsToClean) {
    rmSync(dir, { recursive: true, force: true });
  }
  for (const dir of dirsToClean) {
    rmSync(dir, { recursive: true, force: true });
  }
  // 清理全域 baselines 測試檔
  const globalDir = paths.global.dir(TEST_PROJECT_ROOT);
  rmSync(globalDir, { recursive: true, force: true });
});

// ────────────────────────────────────────────────────────────────────────────
// 1. computeSessionMetrics
// ────────────────────────────────────────────────────────────────────────────

describe('computeSessionMetrics', () => {
  test('無 workflow state 時回傳 null', () => {
    const session = makeSession('no-state');
    const result = baselineTracker.computeSessionMetrics(session.id);
    expect(result).toBeNull();
  });

  test('完整 workflow 回傳正確指標', () => {
    const session = makeSession('complete');
    setupCompleteWorkflow(session, { durationMs: 30000, stageDurationMs: 5000 });

    const metrics = baselineTracker.computeSessionMetrics(session.id);
    expect(metrics).not.toBeNull();
    expect(metrics.workflowType).toBe('quick');
    expect(metrics.duration).toBeGreaterThan(0);
    expect(metrics.retryCount).toBe(0);
    expect(metrics.stageCount).toBe(5);
    expect(typeof metrics.stageDurations).toBe('object');
    expect(Object.keys(metrics.stageDurations).length).toBeGreaterThan(0);
  });

  test('有失敗的 workflow 回傳正確 retryCount', () => {
    const session = makeSession('retries');
    setupCompleteWorkflow(session, { failCount: 2, rejectCount: 1 });

    const metrics = baselineTracker.computeSessionMetrics(session.id);
    expect(metrics.retryCount).toBe(3);
  });

  test('無 workflow:complete 事件時 duration 為 null', () => {
    const session = makeSession('no-complete');
    // 只建 state 不建 timeline
    const ws = {
      sessionId: session.id,
      workflowType: 'quick',
      createdAt: new Date().toISOString(),
      currentStage: 'DEV',
      stages: { DEV: { status: 'active', result: null } },
      activeAgents: {},
      failCount: 0,
      rejectCount: 0,
    };
    writeFileSync(join(session.dir, 'workflow.json'), JSON.stringify(ws), 'utf8');

    const metrics = baselineTracker.computeSessionMetrics(session.id);
    expect(metrics).not.toBeNull();
    expect(metrics.duration).toBeNull();
  });

  test('多次 workflow 的 session 中，start 比最新 complete 晚時 duration 為 null', () => {
    // 模擬：第 1 次 workflow 完成後，第 2 次 workflow 已 start 但未 complete
    const session = makeSession('multi-wf');
    const ws = {
      sessionId: session.id,
      workflowType: 'quick',
      createdAt: new Date().toISOString(),
      currentStage: 'DEV',
      stages: { DEV: { status: 'active', result: null } },
      activeAgents: {},
      failCount: 0,
      rejectCount: 0,
    };
    writeFileSync(join(session.dir, 'workflow.json'), JSON.stringify(ws), 'utf8');

    const baseTime = Date.now();
    const events = [
      { ts: new Date(baseTime - 60000).toISOString(), type: 'workflow:start', category: 'workflow', label: '第 1 次' },
      { ts: new Date(baseTime - 30000).toISOString(), type: 'workflow:complete', category: 'workflow', label: '第 1 次完成' },
      { ts: new Date(baseTime - 10000).toISOString(), type: 'workflow:start', category: 'workflow', label: '第 2 次' },
      // 第 2 次沒有 workflow:complete
    ];
    writeFileSync(join(session.dir, 'timeline.jsonl'), events.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf8');

    const metrics = baselineTracker.computeSessionMetrics(session.id);
    // latest('workflow:start') = 第 2 次 (baseTime-10000)
    // latest('workflow:complete') = 第 1 次 (baseTime-30000)
    // complete < start → duration 應為 null
    expect(metrics.duration).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. saveBaseline + getBaseline
// ────────────────────────────────────────────────────────────────────────────

describe('saveBaseline + getBaseline', () => {
  test('保存完整 workflow 的基線', () => {
    const session = makeSession('save1');
    setupCompleteWorkflow(session, { durationMs: 20000 });

    const { saved, metrics } = baselineTracker.saveBaseline(session.id, TEST_PROJECT_ROOT);
    expect(saved).toBe(true);
    expect(metrics.workflowType).toBe('quick');
  });

  test('未完成的 workflow 不保存（duration null）', () => {
    const session = makeSession('save-incomplete');
    const ws = {
      sessionId: session.id,
      workflowType: 'quick',
      createdAt: new Date().toISOString(),
      currentStage: 'DEV',
      stages: { DEV: { status: 'active', result: null } },
      activeAgents: {},
      failCount: 0,
      rejectCount: 0,
    };
    writeFileSync(join(session.dir, 'workflow.json'), JSON.stringify(ws), 'utf8');

    const { saved } = baselineTracker.saveBaseline(session.id, TEST_PROJECT_ROOT);
    expect(saved).toBe(false);
  });

  test('getBaseline 計算正確的平均值', () => {
    // 清理已有的基線
    const blPath = paths.global.baselines(TEST_PROJECT_ROOT);
    if (existsSync(blPath)) rmSync(blPath);

    // 寫入 3 筆模擬記錄
    const records = [
      { ts: '2026-03-01T00:00:00Z', sessionId: 's1', workflowType: 'quick', duration: 10000, retryCount: 0, pass1Rate: 1.0, stageCount: 5 },
      { ts: '2026-03-02T00:00:00Z', sessionId: 's2', workflowType: 'quick', duration: 20000, retryCount: 2, pass1Rate: 0.6, stageCount: 5 },
      { ts: '2026-03-03T00:00:00Z', sessionId: 's3', workflowType: 'quick', duration: 30000, retryCount: 1, pass1Rate: 0.8, stageCount: 5 },
    ];
    mkdirSync(require('path').dirname(blPath), { recursive: true });
    writeFileSync(blPath, records.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');

    const baseline = baselineTracker.getBaseline(TEST_PROJECT_ROOT, 'quick');
    expect(baseline.sessionCount).toBe(3);
    expect(baseline.avgDuration).toBe(20000); // (10000+20000+30000)/3
    expect(baseline.avgRetries).toBe(1); // (0+2+1)/3 = 1
    expect(baseline.avgPass1Rate).toBe(0.8); // (1.0+0.6+0.8)/3 = 0.8
  });

  test('getBaseline 將歷史負數 duration 視為 null（不計入平均）', () => {
    const blPath = paths.global.baselines(TEST_PROJECT_ROOT);
    if (existsSync(blPath)) rmSync(blPath);

    const records = [
      { ts: '2026-03-01T00:00:00Z', sessionId: 'neg1', workflowType: 'quick', duration: -60000, retryCount: 0, pass1Rate: 0.8, stageCount: 5 },
      { ts: '2026-03-02T00:00:00Z', sessionId: 'neg2', workflowType: 'quick', duration: 20000, retryCount: 0, pass1Rate: 1.0, stageCount: 5 },
      { ts: '2026-03-03T00:00:00Z', sessionId: 'neg3', workflowType: 'quick', duration: -30000, retryCount: 1, pass1Rate: 0.6, stageCount: 5 },
    ];
    mkdirSync(require('path').dirname(blPath), { recursive: true });
    writeFileSync(blPath, records.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');

    const baseline = baselineTracker.getBaseline(TEST_PROJECT_ROOT, 'quick');
    expect(baseline.sessionCount).toBe(3);
    // 負數 duration 被過濾為 null，只有 20000 一筆有效
    expect(baseline.avgDuration).toBe(20000);
    // retryCount 和 pass1Rate 仍正常計算（不受 duration 影響）
    expect(baseline.avgRetries).toBeCloseTo(0.33, 1);
    expect(baseline.avgPass1Rate).toBe(0.8);
  });

  test('getBaseline 空 store 回傳預設值', () => {
    const baseline = baselineTracker.getBaseline('/tmp/nonexistent-project', 'quick');
    expect(baseline.sessionCount).toBe(0);
    expect(baseline.avgDuration).toBeNull();
    expect(baseline.avgRetries).toBe(0);
    expect(baseline.avgPass1Rate).toBeNull();
  });

  test('getBaseline 依 workflowType 隔離', () => {
    const blPath = paths.global.baselines(TEST_PROJECT_ROOT);
    if (existsSync(blPath)) rmSync(blPath);

    const records = [
      { ts: '2026-03-01T00:00:00Z', sessionId: 's1', workflowType: 'quick', duration: 10000, retryCount: 0, pass1Rate: 1.0, stageCount: 5 },
      { ts: '2026-03-02T00:00:00Z', sessionId: 's2', workflowType: 'standard', duration: 50000, retryCount: 0, pass1Rate: 0.5, stageCount: 8 },
    ];
    mkdirSync(require('path').dirname(blPath), { recursive: true });
    writeFileSync(blPath, records.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');

    const quickBl = baselineTracker.getBaseline(TEST_PROJECT_ROOT, 'quick');
    expect(quickBl.sessionCount).toBe(1);
    expect(quickBl.avgDuration).toBe(10000);

    const standardBl = baselineTracker.getBaseline(TEST_PROJECT_ROOT, 'standard');
    expect(standardBl.sessionCount).toBe(1);
    expect(standardBl.avgDuration).toBe(50000);
  });

  test('getBaseline 預設 window size 為 compareWindowSize', () => {
    const blPath = paths.global.baselines(TEST_PROJECT_ROOT);
    if (existsSync(blPath)) rmSync(blPath);

    // 寫入 15 筆（超過預設 window size 10）
    const records = [];
    for (let i = 0; i < 15; i++) {
      records.push({
        ts: new Date(Date.now() - (15 - i) * 1000).toISOString(),
        sessionId: `s${i}`,
        workflowType: 'quick',
        duration: 10000 + i * 1000,
        retryCount: 0,
        pass1Rate: 0.8,
        stageCount: 5,
      });
    }
    mkdirSync(require('path').dirname(blPath), { recursive: true });
    writeFileSync(blPath, records.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');

    // 預設取最近 10 筆（index 5-14），duration 15000-24000
    const baseline = baselineTracker.getBaseline(TEST_PROJECT_ROOT, 'quick');
    expect(baseline.sessionCount).toBe(baselineDefaults.compareWindowSize);
    // avg of 15000..24000 = 19500
    expect(baseline.avgDuration).toBe(19500);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. compareToBaseline
// ────────────────────────────────────────────────────────────────────────────

describe('compareToBaseline', () => {
  test('有基線時回傳比較結果', () => {
    // 先寫入基線
    const blPath = paths.global.baselines(TEST_PROJECT_ROOT);
    if (existsSync(blPath)) rmSync(blPath);
    const records = [
      { ts: '2026-03-01T00:00:00Z', sessionId: 's1', workflowType: 'quick', duration: 20000, retryCount: 2, pass1Rate: 0.6, stageCount: 5 },
      { ts: '2026-03-02T00:00:00Z', sessionId: 's2', workflowType: 'quick', duration: 30000, retryCount: 1, pass1Rate: 0.8, stageCount: 5 },
    ];
    mkdirSync(require('path').dirname(blPath), { recursive: true });
    writeFileSync(blPath, records.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');

    // 建立當前 session（比基線更好：更短、更少重試、更高 pass@1）
    const session = makeSession('compare1');
    setupCompleteWorkflow(session, { durationMs: 15000, failCount: 0, rejectCount: 0 });

    const result = baselineTracker.compareToBaseline(session.id, TEST_PROJECT_ROOT);
    expect(result).not.toBeNull();
    expect(result.workflowType).toBe('quick');
    expect(result.sessionCount).toBe(2);
    expect(result.comparison.duration.improved).toBe(true);
    expect(result.comparison.retries.improved).toBe(true);
  });

  test('無基線時回傳 null', () => {
    const session = makeSession('compare-no-bl');
    setupCompleteWorkflow(session);

    const result = baselineTracker.compareToBaseline(session.id, '/tmp/no-baselines-here');
    expect(result).toBeNull();
  });

  test('未完成 workflow 時回傳 null', () => {
    const session = makeSession('compare-incomplete');
    const ws = {
      sessionId: session.id,
      workflowType: 'quick',
      createdAt: new Date().toISOString(),
      currentStage: 'DEV',
      stages: { DEV: { status: 'active', result: null } },
      activeAgents: {},
      failCount: 0,
      rejectCount: 0,
    };
    writeFileSync(join(session.dir, 'workflow.json'), JSON.stringify(ws), 'utf8');

    const result = baselineTracker.compareToBaseline(session.id, TEST_PROJECT_ROOT);
    expect(result).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. formatBaselineSummary
// ────────────────────────────────────────────────────────────────────────────

describe('formatBaselineSummary', () => {
  test('有基線時回傳格式化摘要', () => {
    const blPath = paths.global.baselines(TEST_PROJECT_ROOT);
    if (existsSync(blPath)) rmSync(blPath);
    const records = [
      { ts: '2026-03-01T00:00:00Z', sessionId: 's1', workflowType: 'quick', duration: 30000, retryCount: 1, pass1Rate: 0.8, stageCount: 5 },
    ];
    mkdirSync(require('path').dirname(blPath), { recursive: true });
    writeFileSync(blPath, records.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');

    const summary = baselineTracker.formatBaselineSummary(TEST_PROJECT_ROOT);
    expect(summary).toContain('效能基線');
    expect(summary).toContain('quick');
    expect(summary).toContain('30s');
    expect(summary).toContain('80%');
  });

  test('指定 workflowType 只顯示該類型', () => {
    const blPath = paths.global.baselines(TEST_PROJECT_ROOT);
    if (existsSync(blPath)) rmSync(blPath);
    const records = [
      { ts: '2026-03-01T00:00:00Z', sessionId: 's1', workflowType: 'quick', duration: 10000, retryCount: 0, pass1Rate: 1.0, stageCount: 5 },
      { ts: '2026-03-02T00:00:00Z', sessionId: 's2', workflowType: 'standard', duration: 50000, retryCount: 0, pass1Rate: 0.5, stageCount: 8 },
    ];
    mkdirSync(require('path').dirname(blPath), { recursive: true });
    writeFileSync(blPath, records.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');

    const summary = baselineTracker.formatBaselineSummary(TEST_PROJECT_ROOT, 'quick');
    expect(summary).toContain('quick');
    expect(summary).not.toContain('standard');
  });

  test('空 store 回傳空字串', () => {
    const summary = baselineTracker.formatBaselineSummary('/tmp/empty-project');
    expect(summary).toBe('');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 5. 截斷行為
// ────────────────────────────────────────────────────────────────────────────

describe('自動截斷', () => {
  test('超過 maxRecordsPerType 時自動截斷', () => {
    const trimProject = join(homedir(), '.overtone', 'test-trim-project-' + TIMESTAMP);
    dirsToClean.push(trimProject);

    const blPath = paths.global.baselines(trimProject);
    mkdirSync(require('path').dirname(blPath), { recursive: true });

    // 寫入 maxRecordsPerType + 10 筆
    const count = baselineDefaults.maxRecordsPerType + 10;
    const records = [];
    for (let i = 0; i < count; i++) {
      records.push({
        ts: new Date(Date.now() - (count - i) * 1000).toISOString(),
        sessionId: `s${i}`,
        workflowType: 'quick',
        duration: 10000 + i * 100,
        retryCount: 0,
        pass1Rate: 0.8,
        stageCount: 5,
      });
    }
    writeFileSync(blPath, records.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');

    // 再存一筆觸發 trimIfNeeded
    const session = makeSession('trim-trigger');
    setupCompleteWorkflow(session, { durationMs: 10000 });
    baselineTracker.saveBaseline(session.id, trimProject);

    // 讀回確認不超過上限 + 1（剛存的那筆）
    const content = readFileSync(blPath, 'utf8').trim();
    const lineCount = content.split('\n').length;
    expect(lineCount).toBeLessThanOrEqual(baselineDefaults.maxRecordsPerType + 1);

    rmSync(paths.global.dir(trimProject), { recursive: true, force: true });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 6. 邊界情況
// ────────────────────────────────────────────────────────────────────────────

describe('邊界情況', () => {
  test('baselines.jsonl 包含無效 JSON 行時不崩潰', () => {
    const corruptProject = join(homedir(), '.overtone', 'test-corrupt-' + TIMESTAMP);
    dirsToClean.push(corruptProject);

    const blPath = paths.global.baselines(corruptProject);
    mkdirSync(require('path').dirname(blPath), { recursive: true });
    writeFileSync(blPath, '{"workflowType":"quick","duration":10000}\nINVALID JSON\n{"workflowType":"quick","duration":20000}\n', 'utf8');

    const baseline = baselineTracker.getBaseline(corruptProject, 'quick');
    expect(baseline.sessionCount).toBe(2); // 跳過無效行，剩 2 筆
    expect(baseline.avgDuration).toBe(15000);

    rmSync(paths.global.dir(corruptProject), { recursive: true, force: true });
  });

  test('不同專案互相隔離（projectHash）', () => {
    const projectA = '/tmp/project-a-' + TIMESTAMP;
    const projectB = '/tmp/project-b-' + TIMESTAMP;

    const blPathA = paths.global.baselines(projectA);
    const blPathB = paths.global.baselines(projectB);

    mkdirSync(require('path').dirname(blPathA), { recursive: true });
    mkdirSync(require('path').dirname(blPathB), { recursive: true });

    writeFileSync(blPathA, JSON.stringify({ workflowType: 'quick', duration: 10000 }) + '\n', 'utf8');
    writeFileSync(blPathB, JSON.stringify({ workflowType: 'quick', duration: 50000 }) + '\n', 'utf8');

    const blA = baselineTracker.getBaseline(projectA, 'quick');
    const blB = baselineTracker.getBaseline(projectB, 'quick');

    expect(blA.avgDuration).toBe(10000);
    expect(blB.avgDuration).toBe(50000);

    // 清理
    rmSync(paths.global.dir(projectA), { recursive: true, force: true });
    rmSync(paths.global.dir(projectB), { recursive: true, force: true });
  });
});
