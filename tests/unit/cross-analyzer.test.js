'use strict';
/**
 * cross-analyzer.test.js — 跨資料源交叉分析模組單元測試
 *
 * 測試面向：
 *   1. analyzeFailureHotspot — 失敗熱點分析（正常路徑 + 邊界情況）
 *   2. analyzeHookOverhead — Hook 開銷分析（正常路徑 + 邊界情況）
 *   3. analyzeWorkflowVelocity — 工作流速度分析（正常路徑 + 邊界情況）
 */

const { test, expect, describe } = require('bun:test');
const { join } = require('path');
const { SCRIPTS_DIR } = require('../helpers/paths');

const crossAnalyzer = require(join(SCRIPTS_DIR, 'lib', 'analyzers', 'cross-analyzer.js'));

const MOCK_PROJECT_ROOT = '/tmp/test-cross-analyzer';

// ── Mock 工廠 ──

/**
 * 建立 mock failureTracker
 * @param {object[]} rawRecords - 原始失敗記錄
 * @param {object} patternsOverride - getFailurePatterns 回傳覆蓋
 */
function makeMockFailureTracker(rawRecords = [], patternsOverride = null) {
  const defaultPatterns = rawRecords.length === 0
    ? { totalFailures: 0, byStage: {}, byAgent: {}, topPattern: null }
    : {
        totalFailures: rawRecords.length,
        byStage: _buildByStage(rawRecords),
        byAgent: _buildByAgent(rawRecords),
        topPattern: _findTopPattern(rawRecords),
      };

  return {
    getFailurePatterns: () => patternsOverride || defaultPatterns,
    _readAll: () => rawRecords,
  };
}

function _buildByStage(records) {
  const counts = {};
  for (const r of records) {
    if (!counts[r.stage]) counts[r.stage] = 0;
    counts[r.stage]++;
  }
  const total = records.length;
  const result = {};
  for (const [stage, count] of Object.entries(counts)) {
    result[stage] = { count, rate: count / total };
  }
  return result;
}

function _buildByAgent(records) {
  const counts = {};
  for (const r of records) {
    if (!counts[r.agent]) counts[r.agent] = 0;
    counts[r.agent]++;
  }
  const total = records.length;
  const result = {};
  for (const [agent, count] of Object.entries(counts)) {
    result[agent] = { count, rate: count / total };
  }
  return result;
}

function _findTopPattern(records) {
  const pairCount = {};
  for (const r of records) {
    const key = `${r.stage}::${r.agent}`;
    if (!pairCount[key]) pairCount[key] = { stage: r.stage, agent: r.agent, count: 0 };
    pairCount[key].count++;
  }
  return Object.values(pairCount).sort((a, b) => b.count - a.count)[0] || null;
}

/**
 * 建立 mock timeline
 * @param {object} eventsPerSession - { sessionId: events[] }
 */
function makeMockTimeline(eventsPerSession = {}) {
  return {
    query: (projectRoot, sessionId, workflowId, filter = {}) => {
      const events = eventsPerSession[sessionId] || [];
      if (!filter.type) return events;
      return events.filter(e => e.type === filter.type);
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 1. analyzeFailureHotspot
// ────────────────────────────────────────────────────────────────────────────

describe('analyzeFailureHotspot', () => {
  test('正常路徑：找出失敗次數最多的 stage + agent 組合', () => {
    const rawRecords = [
      { ts: '2024-01-01T00:00:00Z', stage: 'DEV', agent: 'developer', verdict: 'fail' },
      { ts: '2024-01-01T01:00:00Z', stage: 'DEV', agent: 'developer', verdict: 'fail' },
      { ts: '2024-01-01T02:00:00Z', stage: 'DEV', agent: 'developer', verdict: 'reject' },
      { ts: '2024-01-01T03:00:00Z', stage: 'TEST', agent: 'tester', verdict: 'fail' },
    ];
    const deps = {
      failureTracker: makeMockFailureTracker(rawRecords),
      timeline: makeMockTimeline(),
    };

    const result = crossAnalyzer.analyzeFailureHotspot(deps, MOCK_PROJECT_ROOT);

    expect(result.totalFailures).toBe(4);
    expect(Array.isArray(result.hotspots)).toBe(true);
    expect(result.hotspots.length).toBeGreaterThan(0);

    // 最高失敗的組合應為 DEV + developer（3 次）
    expect(result.hotspots[0].stage).toBe('DEV');
    expect(result.hotspots[0].agent).toBe('developer');
    expect(result.hotspots[0].count).toBe(3);
  });

  test('正常路徑：hotspot 包含 lastFailedAt 時間戳', () => {
    const rawRecords = [
      { ts: '2024-01-01T00:00:00Z', stage: 'REVIEW', agent: 'code-reviewer', verdict: 'reject' },
      { ts: '2024-01-02T00:00:00Z', stage: 'REVIEW', agent: 'code-reviewer', verdict: 'reject' },
    ];
    const deps = {
      failureTracker: makeMockFailureTracker(rawRecords),
      timeline: makeMockTimeline(),
    };

    const result = crossAnalyzer.analyzeFailureHotspot(deps, MOCK_PROJECT_ROOT);

    expect(result.hotspots[0].lastFailedAt).toBe('2024-01-02T00:00:00Z');
  });

  test('邊界情況：無失敗記錄時回傳空 hotspots', () => {
    const deps = {
      failureTracker: makeMockFailureTracker([]),
      timeline: makeMockTimeline(),
    };

    const result = crossAnalyzer.analyzeFailureHotspot(deps, MOCK_PROJECT_ROOT);

    expect(result.totalFailures).toBe(0);
    expect(result.hotspots).toEqual([]);
  });

  test('邊界情況：多個組合時按失敗次數降序排列', () => {
    const rawRecords = [
      { ts: '2024-01-01T00:00:00Z', stage: 'TEST', agent: 'tester', verdict: 'fail' },
      { ts: '2024-01-01T01:00:00Z', stage: 'DEV', agent: 'developer', verdict: 'fail' },
      { ts: '2024-01-01T02:00:00Z', stage: 'DEV', agent: 'developer', verdict: 'fail' },
      { ts: '2024-01-01T03:00:00Z', stage: 'REVIEW', agent: 'code-reviewer', verdict: 'reject' },
      { ts: '2024-01-01T04:00:00Z', stage: 'REVIEW', agent: 'code-reviewer', verdict: 'reject' },
      { ts: '2024-01-01T05:00:00Z', stage: 'REVIEW', agent: 'code-reviewer', verdict: 'reject' },
    ];
    const deps = {
      failureTracker: makeMockFailureTracker(rawRecords),
      timeline: makeMockTimeline(),
    };

    const result = crossAnalyzer.analyzeFailureHotspot(deps, MOCK_PROJECT_ROOT);

    // 第一名應是 REVIEW + code-reviewer（3 次），第二名 DEV + developer（2 次）
    expect(result.hotspots[0].stage).toBe('REVIEW');
    expect(result.hotspots[0].count).toBe(3);
    expect(result.hotspots[1].stage).toBe('DEV');
    expect(result.hotspots[1].count).toBe(2);
  });

  test('邊界情況：failureTracker 拋出例外時回傳空結果', () => {
    const deps = {
      failureTracker: {
        getFailurePatterns: () => { throw new Error('讀取失敗'); },
        _readAll: () => { throw new Error('讀取失敗'); },
      },
      timeline: makeMockTimeline(),
    };

    const result = crossAnalyzer.analyzeFailureHotspot(deps, MOCK_PROJECT_ROOT);

    expect(result.totalFailures).toBe(0);
    expect(result.hotspots).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. analyzeHookOverhead
// ────────────────────────────────────────────────────────────────────────────

describe('analyzeHookOverhead', () => {
  const SESSION_ID = 'test-session-hook';

  test('正常路徑：計算每個 hook 的平均/最大耗時', () => {
    const events = [
      { ts: '2024-01-01T00:00:00Z', type: 'hook:timing', hook: 'UserPromptSubmit', durationMs: 100 },
      { ts: '2024-01-01T00:01:00Z', type: 'hook:timing', hook: 'UserPromptSubmit', durationMs: 200 },
      { ts: '2024-01-01T00:02:00Z', type: 'hook:timing', hook: 'SubagentStop', durationMs: 50 },
    ];
    const deps = {
      timeline: makeMockTimeline({ [SESSION_ID]: events }),
      failureTracker: makeMockFailureTracker(),
    };

    const result = crossAnalyzer.analyzeHookOverhead(deps, { session: SESSION_ID }, MOCK_PROJECT_ROOT);

    expect(result.sessionId).toBe(SESSION_ID);
    expect(Array.isArray(result.hooks)).toBe(true);
    expect(result.hooks.length).toBe(2);

    // UserPromptSubmit：avg = (100+200)/2 = 150，max = 200
    const ups = result.hooks.find(h => h.hook === 'UserPromptSubmit');
    expect(ups).toBeDefined();
    expect(ups.avgMs).toBe(150);
    expect(ups.maxMs).toBe(200);
    expect(ups.count).toBe(2);
  });

  test('正常路徑：按平均耗時降序排列', () => {
    const events = [
      { ts: '2024-01-01T00:00:00Z', type: 'hook:timing', hook: 'FastHook', durationMs: 10 },
      { ts: '2024-01-01T00:01:00Z', type: 'hook:timing', hook: 'SlowHook', durationMs: 500 },
      { ts: '2024-01-01T00:02:00Z', type: 'hook:timing', hook: 'SlowHook', durationMs: 300 },
    ];
    const deps = {
      timeline: makeMockTimeline({ [SESSION_ID]: events }),
      failureTracker: makeMockFailureTracker(),
    };

    const result = crossAnalyzer.analyzeHookOverhead(deps, { session: SESSION_ID }, MOCK_PROJECT_ROOT);

    // SlowHook avg = (500+300)/2 = 400，FastHook avg = 10 → SlowHook 在前
    expect(result.hooks[0].hook).toBe('SlowHook');
    expect(result.hooks[0].avgMs).toBe(400);
    expect(result.hooks[1].hook).toBe('FastHook');
  });

  test('邊界情況：無 session 時回傳空結果', () => {
    const deps = {
      timeline: makeMockTimeline(),
      failureTracker: makeMockFailureTracker(),
    };

    const result = crossAnalyzer.analyzeHookOverhead(deps, {}, MOCK_PROJECT_ROOT);

    expect(result.hooks).toEqual([]);
    expect(result.sessionId).toBeNull();
  });

  test('邊界情況：session 無 hook:timing 事件時回傳空結果', () => {
    const events = [
      { ts: '2024-01-01T00:00:00Z', type: 'stage:start', stage: 'DEV' },
    ];
    const deps = {
      timeline: makeMockTimeline({ [SESSION_ID]: events }),
      failureTracker: makeMockFailureTracker(),
    };

    const result = crossAnalyzer.analyzeHookOverhead(deps, { session: SESSION_ID }, MOCK_PROJECT_ROOT);

    expect(result.hooks).toEqual([]);
    expect(result.sessionId).toBe(SESSION_ID);
  });

  test('邊界情況：timeline.query 拋出例外時回傳空 hooks', () => {
    const deps = {
      timeline: {
        query: () => { throw new Error('讀取失敗'); },
      },
      failureTracker: makeMockFailureTracker(),
    };

    const result = crossAnalyzer.analyzeHookOverhead(deps, { session: SESSION_ID }, MOCK_PROJECT_ROOT);

    expect(result.hooks).toEqual([]);
    expect(result.sessionId).toBe(SESSION_ID);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. analyzeWorkflowVelocity
// ────────────────────────────────────────────────────────────────────────────

describe('analyzeWorkflowVelocity', () => {
  const SESSION_A = 'session-velocity-a';
  const SESSION_B = 'session-velocity-b';

  test('正常路徑：計算每個 stage 的平均耗時', () => {
    // Session A: DEV = 5 分鐘, TEST = 2 分鐘
    // Session B: DEV = 3 分鐘
    const events = {
      [SESSION_A]: [
        { ts: '2024-01-01T00:00:00Z', type: 'stage:start', stage: 'DEV' },
        { ts: '2024-01-01T00:05:00Z', type: 'stage:complete', stage: 'DEV', result: 'pass' },
        { ts: '2024-01-01T00:06:00Z', type: 'stage:start', stage: 'TEST' },
        { ts: '2024-01-01T00:08:00Z', type: 'stage:complete', stage: 'TEST', result: 'pass' },
      ],
      [SESSION_B]: [
        { ts: '2024-01-02T00:00:00Z', type: 'stage:start', stage: 'DEV' },
        { ts: '2024-01-02T00:03:00Z', type: 'stage:complete', stage: 'DEV', result: 'pass' },
      ],
    };
    const deps = {
      timeline: makeMockTimeline(events),
      failureTracker: makeMockFailureTracker(),
    };

    const result = crossAnalyzer.analyzeWorkflowVelocity(deps, [SESSION_A, SESSION_B], MOCK_PROJECT_ROOT);

    expect(result.sessionCount).toBe(2);
    expect(Array.isArray(result.stages)).toBe(true);

    // DEV: (5分 + 3分) / 2 = 4分 = 240000ms
    const devStage = result.stages.find(s => s.stage === 'DEV');
    expect(devStage).toBeDefined();
    expect(devStage.avgMs).toBe(240000);
    expect(devStage.samples).toBe(2);

    // TEST: 2分 = 120000ms
    const testStage = result.stages.find(s => s.stage === 'TEST');
    expect(testStage).toBeDefined();
    expect(testStage.avgMs).toBe(120000);
    expect(testStage.samples).toBe(1);
  });

  test('正常路徑：按平均耗時降序排列', () => {
    const events = {
      [SESSION_A]: [
        { ts: '2024-01-01T00:00:00Z', type: 'stage:start', stage: 'DEV' },
        { ts: '2024-01-01T00:10:00Z', type: 'stage:complete', stage: 'DEV', result: 'pass' },
        { ts: '2024-01-01T00:11:00Z', type: 'stage:start', stage: 'REVIEW' },
        { ts: '2024-01-01T00:12:00Z', type: 'stage:complete', stage: 'REVIEW', result: 'pass' },
      ],
    };
    const deps = {
      timeline: makeMockTimeline(events),
      failureTracker: makeMockFailureTracker(),
    };

    const result = crossAnalyzer.analyzeWorkflowVelocity(deps, [SESSION_A], MOCK_PROJECT_ROOT);

    // DEV (10min) > REVIEW (1min)，DEV 應在前
    expect(result.stages[0].stage).toBe('DEV');
    expect(result.stages[1].stage).toBe('REVIEW');
  });

  test('正常路徑：包含 minMs 和 maxMs 統計', () => {
    const events = {
      [SESSION_A]: [
        { ts: '2024-01-01T00:00:00Z', type: 'stage:start', stage: 'DEV' },
        { ts: '2024-01-01T00:02:00Z', type: 'stage:complete', stage: 'DEV', result: 'pass' },
      ],
      [SESSION_B]: [
        { ts: '2024-01-02T00:00:00Z', type: 'stage:start', stage: 'DEV' },
        { ts: '2024-01-02T00:08:00Z', type: 'stage:complete', stage: 'DEV', result: 'pass' },
      ],
    };
    const deps = {
      timeline: makeMockTimeline(events),
      failureTracker: makeMockFailureTracker(),
    };

    const result = crossAnalyzer.analyzeWorkflowVelocity(deps, [SESSION_A, SESSION_B], MOCK_PROJECT_ROOT);

    const devStage = result.stages.find(s => s.stage === 'DEV');
    expect(devStage.minMs).toBe(120000);  // 2 分鐘
    expect(devStage.maxMs).toBe(480000);  // 8 分鐘
  });

  test('邊界情況：空 sessionIds 回傳空結果', () => {
    const deps = {
      timeline: makeMockTimeline(),
      failureTracker: makeMockFailureTracker(),
    };

    const result = crossAnalyzer.analyzeWorkflowVelocity(deps, [], MOCK_PROJECT_ROOT);

    expect(result.stages).toEqual([]);
    expect(result.sessionCount).toBe(0);
  });

  test('邊界情況：session 無事件時不影響結果（安靜跳過）', () => {
    const events = {
      [SESSION_A]: [
        { ts: '2024-01-01T00:00:00Z', type: 'stage:start', stage: 'DEV' },
        { ts: '2024-01-01T00:05:00Z', type: 'stage:complete', stage: 'DEV', result: 'pass' },
      ],
      // SESSION_B 無任何事件
      [SESSION_B]: [],
    };
    const deps = {
      timeline: makeMockTimeline(events),
      failureTracker: makeMockFailureTracker(),
    };

    const result = crossAnalyzer.analyzeWorkflowVelocity(deps, [SESSION_A, SESSION_B], MOCK_PROJECT_ROOT);

    expect(result.sessionCount).toBe(2);
    const devStage = result.stages.find(s => s.stage === 'DEV');
    expect(devStage.samples).toBe(1);
  });

  test('邊界情況：無對應 stage:start 的 stage:complete 不計入', () => {
    const events = {
      [SESSION_A]: [
        // 只有 complete，無 start
        { ts: '2024-01-01T00:05:00Z', type: 'stage:complete', stage: 'DEV', result: 'pass' },
      ],
    };
    const deps = {
      timeline: makeMockTimeline(events),
      failureTracker: makeMockFailureTracker(),
    };

    const result = crossAnalyzer.analyzeWorkflowVelocity(deps, [SESSION_A], MOCK_PROJECT_ROOT);

    expect(result.stages).toEqual([]);
  });
});
