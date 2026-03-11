'use strict';
/**
 * data-cli.test.js — 統一資料查詢 CLI 單元測試
 *
 * 測試面向：
 *   1. parseArgs — 參數解析
 *   2. query timeline — timeline 查詢
 *   3. query failures — failures 查詢
 *   4. query scores — scores 查詢
 *   5. query observations — observations 查詢
 *   6. query baselines — baselines 查詢
 *   7. stats (per-session) — session 統計
 *   8. stats --global — 全域統計
 *   9. gc — 垃圾清理
 *   10. recent — 列出最近 session
 *   11. 無效命令的錯誤處理
 *   12. help 輸出
 */

const { test, expect, describe, beforeEach, afterAll, spyOn } = require('bun:test');
const { join } = require('path');
const { SCRIPTS_DIR } = require('../helpers/paths');

const dataCli = require(join(SCRIPTS_DIR, 'data.js'));

// ── 公用 mock 資料 ──

const MOCK_SESSION_ID = 'test-session-001';
const MOCK_PROJECT_ROOT = '/tmp/test-project-data-cli';

const MOCK_TIMELINE_EVENTS = [
  { ts: '2024-01-01T00:00:00.000Z', type: 'workflow:start', category: 'workflow', label: '工作流開始', workflowType: 'quick' },
  { ts: '2024-01-01T00:01:00.000Z', type: 'stage:start', category: 'stage', label: '階段開始', stage: 'DEV' },
  { ts: '2024-01-01T00:05:00.000Z', type: 'stage:complete', category: 'stage', label: '階段完成', stage: 'DEV', result: 'pass' },
  { ts: '2024-01-01T00:06:00.000Z', type: 'workflow:complete', category: 'workflow', label: '工作流完成' },
];

const MOCK_FAILURE_PATTERNS = {
  totalFailures: 3,
  byStage: {
    DEV: { count: 2, rate: 0.6667 },
    TEST: { count: 1, rate: 0.3333 },
  },
  byAgent: {
    developer: { count: 2, rate: 0.6667 },
    tester: { count: 1, rate: 0.3333 },
  },
  topPattern: { stage: 'DEV', agent: 'developer', count: 2 },
};

const MOCK_SCORES = [
  { ts: '2024-01-01T00:00:00.000Z', stage: 'DEV', agent: 'developer', overall: 4.0, scores: { clarity: 4, completeness: 4, actionability: 4 } },
  { ts: '2024-01-02T00:00:00.000Z', stage: 'DEV', agent: 'developer', overall: 4.5, scores: { clarity: 5, completeness: 4, actionability: 4.5 } },
];

const MOCK_OBSERVATIONS = [
  { id: 'obs-1', tag: 'dev-pattern', type: 'antipattern', confidence: 0.9, count: 3, trigger: 'test', action: 'avoid', lastSeen: '2024-01-01T00:00:00.000Z' },
  { id: 'obs-2', tag: 'review-pattern', type: 'pattern', confidence: 0.7, count: 2, trigger: 'x', action: 'y', lastSeen: '2024-01-02T00:00:00.000Z' },
];

const MOCK_BASELINE_DATA = [
  { ts: '2024-01-01T00:00:00.000Z', sessionId: 'sess-1', workflowType: 'quick', duration: 300000, retryCount: 1, pass1Rate: 0.8, stageCount: 3, stageDurations: {} },
  { ts: '2024-01-02T00:00:00.000Z', sessionId: 'sess-2', workflowType: 'quick', duration: 250000, retryCount: 0, pass1Rate: 1.0, stageCount: 3, stageDurations: {} },
];

/**
 * 建立標準 mock deps
 * @param {object} [overrides] - 局部覆蓋
 */
function makeMockDeps(overrides = {}) {
  return {
    timeline: {
      query: () => MOCK_TIMELINE_EVENTS,
      latest: (sessionId, type) => {
        if (type === 'workflow:start') return MOCK_TIMELINE_EVENTS[0];
        if (type === 'workflow:complete') return MOCK_TIMELINE_EVENTS[3];
        return null;
      },
      count: () => MOCK_TIMELINE_EVENTS.length,
      ...((overrides.timeline) || {}),
    },
    failureTracker: {
      getFailurePatterns: () => MOCK_FAILURE_PATTERNS,
      ...((overrides.failureTracker) || {}),
    },
    scoreEngine: {
      queryScores: () => MOCK_SCORES,
      getScoreSummary: () => ({ sessionCount: 2, avgClarity: 4.5, avgCompleteness: 4.0, avgActionability: 4.25, avgOverall: 4.25 }),
      computeScoreTrend: () => null,
      ...((overrides.scoreEngine) || {}),
    },
    globalInstinct: {
      queryGlobal: () => MOCK_OBSERVATIONS,
      summarizeGlobal: () => ({ total: 2, applicable: 1, byType: { antipattern: 1, pattern: 1 }, byTag: { 'dev-pattern': 1, 'review-pattern': 1 } }),
      ...((overrides.globalInstinct) || {}),
    },
    baselineTracker: {
      getBaseline: () => ({ avgDuration: 275000, avgRetries: 0.5, avgPass1Rate: 0.9, sessionCount: 2 }),
      computeBaselineTrend: () => null,
      ...((overrides.baselineTracker) || {}),
    },
    sessionCleanup: {
      cleanupStaleGlobalDirs: (opts) => {
        if (opts && opts.dryRun) return { cleaned: 0, dryRunList: ['/tmp/.nova/global/abc12345'], errors: [], skipped: 0 };
        return { cleaned: 1, dryRunList: [], errors: [], skipped: 2 };
      },
      ...((overrides.sessionCleanup) || {}),
    },
    paths: {
      SESSIONS_DIR: '/tmp/mock-sessions',
      global: {
        baselines: () => '/tmp/mock-baselines.jsonl',
        failures: () => '/tmp/mock-failures.jsonl',
      },
      ...((overrides.paths) || {}),
    },
    crossAnalyzer: {
      analyzeFailureHotspot: () => ({
        hotspots: [{ stage: 'DEV', agent: 'developer', count: 2, lastFailedAt: '2024-01-02T00:00:00Z' }],
        totalFailures: 2,
      }),
      analyzeHookOverhead: (_deps, opts) => ({
        hooks: [{ hook: 'UserPromptSubmit', avgMs: 150, maxMs: 200, count: 2 }],
        sessionId: opts && opts.session ? opts.session : null,
      }),
      analyzeWorkflowVelocity: () => ({
        stages: [{ stage: 'DEV', avgMs: 300000, minMs: 200000, maxMs: 400000, samples: 3 }],
        sessionCount: 3,
      }),
      ...((overrides.crossAnalyzer) || {}),
    },
  };
}

// ── 捕捉 console.log/error 並攔截 process.exit ──

/** 包裝執行並捕捉輸出 */
function runWithCapture(fn) {
  const logs = [];
  const errors = [];
  const originalLog = console.log;
  const originalError = console.error;
  let exitCode = null;

  console.log = (...args) => logs.push(args.join(' '));
  console.error = (...args) => errors.push(args.join(' '));

  const originalExit = process.exit;
  process.exit = (code) => { exitCode = code; throw new Error(`process.exit(${code})`); };

  let threw = null;
  try {
    fn();
  } catch (e) {
    // process.exit() 擲出例外是預期行為
    if (!e.message || !e.message.startsWith('process.exit(')) {
      threw = e;
    }
  } finally {
    console.log = originalLog;
    console.error = originalError;
    process.exit = originalExit;
  }

  if (threw) throw threw;
  return { logs, errors, exitCode };
}

// ────────────────────────────────────────────────────────────────────────────
// 1. parseArgs
// ────────────────────────────────────────────────────────────────────────────

describe('parseArgs', () => {
  test('解析 positional 命令', () => {
    const result = dataCli.parseArgs(['query', 'timeline']);
    expect(result.command).toBe('query');
    expect(result.positional).toEqual(['timeline']);
    expect(result.options).toEqual({});
  });

  test('解析帶值的選項', () => {
    const result = dataCli.parseArgs(['query', 'timeline', '--session', 'sess-1', '--limit', '10']);
    expect(result.command).toBe('query');
    expect(result.positional).toEqual(['timeline']);
    expect(result.options.session).toBe('sess-1');
    expect(result.options.limit).toBe('10');
  });

  test('解析布林旗標', () => {
    const result = dataCli.parseArgs(['gc', '--dry-run']);
    expect(result.command).toBe('gc');
    expect(result.options['dry-run']).toBe(true);
  });

  test('解析多個選項', () => {
    const result = dataCli.parseArgs(['query', 'scores', '--stage', 'DEV', '--limit', '5', '--pretty']);
    expect(result.positional).toEqual(['scores']);
    expect(result.options.stage).toBe('DEV');
    expect(result.options.limit).toBe('5');
    expect(result.options.pretty).toBe(true);
  });

  test('空參數', () => {
    const result = dataCli.parseArgs([]);
    expect(result.command).toBeNull();
    expect(result.positional).toEqual([]);
    expect(result.options).toEqual({});
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. query timeline
// ────────────────────────────────────────────────────────────────────────────

describe('query timeline', () => {
  test('有 --session 時呼叫 timeline.query 並輸出結果', () => {
    let queryCalled = false;
    let capturedSessionId = null;
    let capturedFilter = null;

    const deps = makeMockDeps({
      timeline: {
        query: (sessionId, filter) => {
          queryCalled = true;
          capturedSessionId = sessionId;
          capturedFilter = filter;
          return MOCK_TIMELINE_EVENTS;
        },
        latest: () => null,
        count: () => 0,
      },
    });

    const { logs } = runWithCapture(() => {
      dataCli._cmdQuery(['timeline'], { session: MOCK_SESSION_ID }, MOCK_PROJECT_ROOT, deps);
    });

    expect(queryCalled).toBe(true);
    expect(capturedSessionId).toBe(MOCK_SESSION_ID);
    expect(logs.length).toBe(1);

    const output = JSON.parse(logs[0]);
    expect(Array.isArray(output)).toBe(true);
    expect(output.length).toBe(MOCK_TIMELINE_EVENTS.length);
  });

  test('傳遞 --type 過濾條件', () => {
    let capturedFilter = null;
    const deps = makeMockDeps({
      timeline: {
        query: (sessionId, filter) => { capturedFilter = filter; return []; },
        latest: () => null,
        count: () => 0,
      },
    });

    runWithCapture(() => {
      dataCli._cmdQuery(['timeline'], { session: 'sess-1', type: 'stage:start' }, MOCK_PROJECT_ROOT, deps);
    });

    expect(capturedFilter.type).toBe('stage:start');
  });

  test('傳遞 --limit 限制', () => {
    let capturedFilter = null;
    const deps = makeMockDeps({
      timeline: {
        query: (sessionId, filter) => { capturedFilter = filter; return []; },
        latest: () => null,
        count: () => 0,
      },
    });

    runWithCapture(() => {
      dataCli._cmdQuery(['timeline'], { session: 'sess-1', limit: '3' }, MOCK_PROJECT_ROOT, deps);
    });

    expect(capturedFilter.limit).toBe(3);
  });

  test('缺少 --session 時報錯退出', () => {
    const deps = makeMockDeps();
    const { errors, exitCode } = runWithCapture(() => {
      dataCli._cmdQuery(['timeline'], {}, MOCK_PROJECT_ROOT, deps);
    });

    expect(exitCode).toBe(1);
    expect(errors.some(e => e.includes('--session'))).toBe(true);
  });

  test('--pretty 輸出縮排 JSON', () => {
    const deps = makeMockDeps();
    const { logs } = runWithCapture(() => {
      dataCli._cmdQuery(['timeline'], { session: MOCK_SESSION_ID, pretty: true }, MOCK_PROJECT_ROOT, deps);
    });

    expect(logs.length).toBe(1);
    // pretty JSON 含換行
    expect(logs[0]).toContain('\n');
    const output = JSON.parse(logs[0]);
    expect(Array.isArray(output)).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. query failures
// ────────────────────────────────────────────────────────────────────────────

describe('query failures', () => {
  test('無過濾時輸出完整 patterns', () => {
    const deps = makeMockDeps();
    const { logs } = runWithCapture(() => {
      dataCli._cmdQuery(['failures'], {}, MOCK_PROJECT_ROOT, deps);
    });

    const output = JSON.parse(logs[0]);
    expect(output.totalFailures).toBe(3);
    expect(output.byStage).toBeDefined();
    expect(output.byAgent).toBeDefined();
  });

  test('--stage 過濾特定 stage', () => {
    const deps = makeMockDeps();
    const { logs } = runWithCapture(() => {
      dataCli._cmdQuery(['failures'], { stage: 'DEV' }, MOCK_PROJECT_ROOT, deps);
    });

    const output = JSON.parse(logs[0]);
    // 過濾後應包含 DEV stage 資料
    expect(output).toBeDefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. query scores
// ────────────────────────────────────────────────────────────────────────────

describe('query scores', () => {
  test('呼叫 scoreEngine.queryScores 並輸出結果', () => {
    let queryCalled = false;
    let capturedFilter = null;

    const deps = makeMockDeps({
      scoreEngine: {
        queryScores: (projectRoot, filter) => {
          queryCalled = true;
          capturedFilter = filter;
          return MOCK_SCORES;
        },
        getScoreSummary: () => ({}),
        computeScoreTrend: () => null,
      },
    });

    const { logs } = runWithCapture(() => {
      dataCli._cmdQuery(['scores'], {}, MOCK_PROJECT_ROOT, deps);
    });

    expect(queryCalled).toBe(true);
    const output = JSON.parse(logs[0]);
    expect(Array.isArray(output)).toBe(true);
    expect(output.length).toBe(MOCK_SCORES.length);
  });

  test('--stage 傳遞過濾條件', () => {
    let capturedFilter = null;
    const deps = makeMockDeps({
      scoreEngine: {
        queryScores: (projectRoot, filter) => { capturedFilter = filter; return []; },
        getScoreSummary: () => ({}),
        computeScoreTrend: () => null,
      },
    });

    runWithCapture(() => {
      dataCli._cmdQuery(['scores'], { stage: 'DEV' }, MOCK_PROJECT_ROOT, deps);
    });

    expect(capturedFilter.stage).toBe('DEV');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 5. query observations
// ────────────────────────────────────────────────────────────────────────────

describe('query observations', () => {
  test('呼叫 globalInstinct.queryGlobal 並輸出結果', () => {
    let queryCalled = false;

    const deps = makeMockDeps({
      globalInstinct: {
        queryGlobal: () => { queryCalled = true; return MOCK_OBSERVATIONS; },
        summarizeGlobal: () => ({}),
      },
    });

    const { logs } = runWithCapture(() => {
      dataCli._cmdQuery(['observations'], {}, MOCK_PROJECT_ROOT, deps);
    });

    expect(queryCalled).toBe(true);
    const output = JSON.parse(logs[0]);
    expect(Array.isArray(output)).toBe(true);
    expect(output.length).toBe(MOCK_OBSERVATIONS.length);
  });

  test('--type 傳遞過濾條件', () => {
    let capturedFilter = null;
    const deps = makeMockDeps({
      globalInstinct: {
        queryGlobal: (projectRoot, filter) => { capturedFilter = filter; return []; },
        summarizeGlobal: () => ({}),
      },
    });

    runWithCapture(() => {
      dataCli._cmdQuery(['observations'], { type: 'antipattern' }, MOCK_PROJECT_ROOT, deps);
    });

    expect(capturedFilter.type).toBe('antipattern');
  });

  test('--limit 傳遞限制', () => {
    let capturedFilter = null;
    const deps = makeMockDeps({
      globalInstinct: {
        queryGlobal: (projectRoot, filter) => { capturedFilter = filter; return []; },
        summarizeGlobal: () => ({}),
      },
    });

    runWithCapture(() => {
      dataCli._cmdQuery(['observations'], { limit: '5' }, MOCK_PROJECT_ROOT, deps);
    });

    expect(capturedFilter.limit).toBe(5);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 6. query baselines
// ────────────────────────────────────────────────────────────────────────────

describe('query baselines', () => {
  test('baselines 檔案不存在時輸出空陣列', () => {
    const deps = makeMockDeps({
      paths: {
        SESSIONS_DIR: '/tmp/mock-sessions',
        global: {
          baselines: () => '/tmp/nonexistent-baselines-' + Date.now() + '.jsonl',
          failures: () => '/tmp/mock-failures.jsonl',
        },
      },
    });

    const { logs } = runWithCapture(() => {
      dataCli._cmdQuery(['baselines'], {}, MOCK_PROJECT_ROOT, deps);
    });

    const output = JSON.parse(logs[0]);
    expect(Array.isArray(output)).toBe(true);
    expect(output.length).toBe(0);
  });

  test('未知類型時報錯退出', () => {
    const deps = makeMockDeps();
    const { errors, exitCode } = runWithCapture(() => {
      dataCli._cmdQuery(['unknown-type'], {}, MOCK_PROJECT_ROOT, deps);
    });

    expect(exitCode).toBe(1);
    expect(errors.some(e => e.includes('unknown-type'))).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 7. stats (per-session)
// ────────────────────────────────────────────────────────────────────────────

describe('stats per-session', () => {
  test('輸出 session 統計摘要', () => {
    const deps = makeMockDeps();
    const { logs } = runWithCapture(() => {
      dataCli._cmdStats([MOCK_SESSION_ID], {}, MOCK_PROJECT_ROOT, deps);
    });

    const output = JSON.parse(logs[0]);
    expect(output.sessionId).toBe(MOCK_SESSION_ID);
    expect(output.totalEvents).toBe(MOCK_TIMELINE_EVENTS.length);
    expect(output.byType).toBeDefined();
    expect(typeof output.byType).toBe('object');
    expect(output.stageDurations).toBeDefined();
  });

  test('包含工作流類型', () => {
    const deps = makeMockDeps();
    const { logs } = runWithCapture(() => {
      dataCli._cmdStats([MOCK_SESSION_ID], {}, MOCK_PROJECT_ROOT, deps);
    });

    const output = JSON.parse(logs[0]);
    expect(output.workflowType).toBe('quick');
  });

  test('包含起止時間', () => {
    const deps = makeMockDeps();
    const { logs } = runWithCapture(() => {
      dataCli._cmdStats([MOCK_SESSION_ID], {}, MOCK_PROJECT_ROOT, deps);
    });

    const output = JSON.parse(logs[0]);
    expect(output.startedAt).toBe('2024-01-01T00:00:00.000Z');
    expect(output.completedAt).toBe('2024-01-01T00:06:00.000Z');
  });

  test('無 sessionId 且無 --global 時報錯退出', () => {
    const deps = makeMockDeps();
    const { errors, exitCode } = runWithCapture(() => {
      dataCli._cmdStats([], {}, MOCK_PROJECT_ROOT, deps);
    });

    expect(exitCode).toBe(1);
    expect(errors.some(e => e.includes('sessionId'))).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 8. stats --global
// ────────────────────────────────────────────────────────────────────────────

describe('stats --global', () => {
  test('輸出全域統計結構', () => {
    const deps = makeMockDeps({
      paths: {
        SESSIONS_DIR: '/tmp/mock-sessions',
        global: {
          baselines: () => '/tmp/nonexistent-baselines-' + Date.now() + '.jsonl',
          failures: () => '/tmp/mock-failures.jsonl',
        },
      },
    });

    const { logs } = runWithCapture(() => {
      dataCli._cmdStats([], { global: true }, MOCK_PROJECT_ROOT, deps);
    });

    const output = JSON.parse(logs[0]);
    expect(output.failures).toBeDefined();
    expect(output.observations).toBeDefined();
    expect(output.scores).toBeDefined();
    expect(output.baselines).toBeDefined();
  });

  test('failures 包含 totalFailures', () => {
    const deps = makeMockDeps({
      paths: {
        SESSIONS_DIR: '/tmp/mock-sessions',
        global: {
          baselines: () => '/tmp/nonexistent-baselines-' + Date.now() + '.jsonl',
          failures: () => '/tmp/mock-failures.jsonl',
        },
      },
    });

    const { logs } = runWithCapture(() => {
      dataCli._cmdStats([], { global: true }, MOCK_PROJECT_ROOT, deps);
    });

    const output = JSON.parse(logs[0]);
    expect(output.failures.totalFailures).toBe(3);
  });

  test('observations 包含 total', () => {
    const deps = makeMockDeps({
      paths: {
        SESSIONS_DIR: '/tmp/mock-sessions',
        global: {
          baselines: () => '/tmp/nonexistent-baselines-' + Date.now() + '.jsonl',
          failures: () => '/tmp/mock-failures.jsonl',
        },
      },
    });

    const { logs } = runWithCapture(() => {
      dataCli._cmdStats([], { global: true }, MOCK_PROJECT_ROOT, deps);
    });

    const output = JSON.parse(logs[0]);
    expect(output.observations.total).toBe(2);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 9. gc
// ────────────────────────────────────────────────────────────────────────────

describe('gc', () => {
  test('執行清理並輸出結果', () => {
    const deps = makeMockDeps();
    const { logs } = runWithCapture(() => {
      dataCli._cmdGc({}, deps);
    });

    expect(logs.some(l => l.includes('1'))).toBe(true);
  });

  test('--dry-run 時只預覽不刪除', () => {
    let gcCalled = false;
    let capturedOptions = null;

    const deps = makeMockDeps({
      sessionCleanup: {
        cleanupStaleGlobalDirs: (opts) => {
          gcCalled = true;
          capturedOptions = opts;
          return { cleaned: 0, dryRunList: ['/path/to/hash'], errors: [], skipped: 0 };
        },
      },
    });

    const { logs } = runWithCapture(() => {
      dataCli._cmdGc({ 'dry-run': true }, deps);
    });

    expect(gcCalled).toBe(true);
    expect(capturedOptions.dryRun).toBe(true);
    expect(logs.some(l => l.includes('dry-run'))).toBe(true);
  });

  test('--max-age-days 傳遞正確天數', () => {
    let capturedOptions = null;
    const deps = makeMockDeps({
      sessionCleanup: {
        cleanupStaleGlobalDirs: (opts) => {
          capturedOptions = opts;
          return { cleaned: 0, dryRunList: [], errors: [], skipped: 0 };
        },
      },
    });

    runWithCapture(() => {
      dataCli._cmdGc({ 'max-age-days': '60' }, deps);
    });

    expect(capturedOptions.maxAgeDays).toBe(60);
  });

  test('有錯誤時輸出錯誤訊息', () => {
    const deps = makeMockDeps({
      sessionCleanup: {
        cleanupStaleGlobalDirs: () => ({
          cleaned: 0,
          dryRunList: [],
          errors: ['刪除失敗：Permission denied'],
          skipped: 0,
        }),
      },
    });

    const { errors } = runWithCapture(() => {
      dataCli._cmdGc({}, deps);
    });

    expect(errors.some(e => e.includes('Permission denied'))).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 10. recent
// ────────────────────────────────────────────────────────────────────────────

describe('recent', () => {
  test('sessions 目錄不存在時輸出空陣列', () => {
    const deps = makeMockDeps({
      paths: {
        SESSIONS_DIR: '/tmp/nonexistent-sessions-' + Date.now(),
        global: {
          baselines: () => '/tmp/mock-baselines.jsonl',
          failures: () => '/tmp/mock-failures.jsonl',
        },
      },
    });

    const { logs } = runWithCapture(() => {
      dataCli._cmdRecent({}, deps);
    });

    const output = JSON.parse(logs[0]);
    expect(Array.isArray(output)).toBe(true);
    expect(output.length).toBe(0);
  });

  test('--limit 限制回傳數量（不超過 N 個）', () => {
    // 此測試依賴實際 sessions 目錄，使用空目錄以測試 limit 邏輯
    const deps = makeMockDeps({
      paths: {
        SESSIONS_DIR: '/tmp/nonexistent-sessions-' + Date.now(),
        global: {
          baselines: () => '/tmp/mock-baselines.jsonl',
          failures: () => '/tmp/mock-failures.jsonl',
        },
      },
    });

    const { logs } = runWithCapture(() => {
      dataCli._cmdRecent({ limit: '5' }, deps);
    });

    const output = JSON.parse(logs[0]);
    expect(Array.isArray(output)).toBe(true);
    expect(output.length).toBeLessThanOrEqual(5);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 11. 無效命令的錯誤處理
// ────────────────────────────────────────────────────────────────────────────

describe('無效命令', () => {
  test('未知命令報錯並退出 1', () => {
    const deps = makeMockDeps();
    const { errors, exitCode } = runWithCapture(() => {
      dataCli.main(['unknown-command'], deps);
    });

    expect(exitCode).toBe(1);
    expect(errors.some(e => e.includes('unknown-command'))).toBe(true);
  });

  test('query 無類型報錯退出 1', () => {
    const deps = makeMockDeps();
    const { errors, exitCode } = runWithCapture(() => {
      dataCli.main(['query'], deps);
    });

    expect(exitCode).toBe(1);
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 12. help 輸出
// ────────────────────────────────────────────────────────────────────────────

describe('help 輸出', () => {
  test('--help 顯示所有子命令', () => {
    const deps = makeMockDeps();
    const { logs } = runWithCapture(() => {
      dataCli.main(['--help'], deps);
    });

    const output = logs.join('\n');
    expect(output).toContain('query');
    expect(output).toContain('stats');
    expect(output).toContain('gc');
    expect(output).toContain('recent');
  });

  test('無命令時也顯示 help', () => {
    const deps = makeMockDeps();
    const { logs } = runWithCapture(() => {
      dataCli.main([], deps);
    });

    const output = logs.join('\n');
    expect(output).toContain('query');
    expect(output).toContain('gc');
  });

  test('help 包含所有 query 類型', () => {
    const deps = makeMockDeps();
    const { logs } = runWithCapture(() => {
      dataCli.main(['--help'], deps);
    });

    const output = logs.join('\n');
    expect(output).toContain('timeline');
    expect(output).toContain('failures');
    expect(output).toContain('scores');
    expect(output).toContain('observations');
    expect(output).toContain('baselines');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 附加：main 整合路由測試
// ────────────────────────────────────────────────────────────────────────────

describe('main — 路由整合', () => {
  test('stats --global 透過 main 正確路由', () => {
    const deps = makeMockDeps({
      paths: {
        SESSIONS_DIR: '/tmp/mock-sessions',
        global: {
          baselines: () => '/tmp/nonexistent-baselines-' + Date.now() + '.jsonl',
          failures: () => '/tmp/mock-failures.jsonl',
        },
      },
    });

    const { logs } = runWithCapture(() => {
      dataCli.main(['stats', '--global'], deps);
    });

    const output = JSON.parse(logs[0]);
    expect(output.failures).toBeDefined();
  });

  test('gc --dry-run 透過 main 正確路由', () => {
    let dryRunCalled = false;
    const deps = makeMockDeps({
      sessionCleanup: {
        cleanupStaleGlobalDirs: (opts) => {
          dryRunCalled = opts.dryRun;
          return { cleaned: 0, dryRunList: [], errors: [], skipped: 0 };
        },
      },
    });

    runWithCapture(() => {
      dataCli.main(['gc', '--dry-run'], deps);
    });

    expect(dryRunCalled).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 附加：analyze 子命令路由整合測試
// ────────────────────────────────────────────────────────────────────────────

describe('main — analyze 路由', () => {
  test('analyze failure-hotspot 正確路由並輸出結果', () => {
    let analyzeCalled = false;
    const deps = makeMockDeps({
      crossAnalyzer: {
        analyzeFailureHotspot: () => {
          analyzeCalled = true;
          return { hotspots: [{ stage: 'DEV', agent: 'developer', count: 3, lastFailedAt: '2024-01-01T00:00:00Z' }], totalFailures: 3 };
        },
        analyzeHookOverhead: () => ({ hooks: [], sessionId: null }),
        analyzeWorkflowVelocity: () => ({ stages: [], sessionCount: 0 }),
      },
    });

    const { logs } = runWithCapture(() => {
      dataCli.main(['analyze', 'failure-hotspot'], deps);
    });

    expect(analyzeCalled).toBe(true);
    const output = JSON.parse(logs[0]);
    expect(output.totalFailures).toBe(3);
    expect(Array.isArray(output.hotspots)).toBe(true);
  });

  test('analyze hook-overhead 傳遞 --session 並輸出結果', () => {
    let capturedOpts = null;
    const deps = makeMockDeps({
      crossAnalyzer: {
        analyzeFailureHotspot: () => ({ hotspots: [], totalFailures: 0 }),
        analyzeHookOverhead: (_deps, opts) => {
          capturedOpts = opts;
          return { hooks: [{ hook: 'UserPromptSubmit', avgMs: 100, maxMs: 200, count: 1 }], sessionId: opts.session };
        },
        analyzeWorkflowVelocity: () => ({ stages: [], sessionCount: 0 }),
      },
    });

    const { logs } = runWithCapture(() => {
      dataCli.main(['analyze', 'hook-overhead', '--session', 'sess-abc'], deps);
    });

    expect(capturedOpts.session).toBe('sess-abc');
    const output = JSON.parse(logs[0]);
    expect(output.sessionId).toBe('sess-abc');
    expect(Array.isArray(output.hooks)).toBe(true);
  });

  test('analyze workflow-velocity 正確路由並輸出結果', () => {
    let analyzeCalled = false;
    const deps = makeMockDeps({
      crossAnalyzer: {
        analyzeFailureHotspot: () => ({ hotspots: [], totalFailures: 0 }),
        analyzeHookOverhead: () => ({ hooks: [], sessionId: null }),
        analyzeWorkflowVelocity: () => {
          analyzeCalled = true;
          return { stages: [{ stage: 'DEV', avgMs: 300000, minMs: 200000, maxMs: 400000, samples: 3 }], sessionCount: 3 };
        },
      },
    });

    const { logs } = runWithCapture(() => {
      dataCli.main(['analyze', 'workflow-velocity'], deps);
    });

    expect(analyzeCalled).toBe(true);
    const output = JSON.parse(logs[0]);
    expect(output.sessionCount).toBe(3);
    expect(Array.isArray(output.stages)).toBe(true);
  });

  test('analyze 未知類型時報錯退出 1', () => {
    const deps = makeMockDeps();
    const { errors, exitCode } = runWithCapture(() => {
      dataCli.main(['analyze', 'unknown-analysis'], deps);
    });

    expect(exitCode).toBe(1);
    expect(errors.some(e => e.includes('unknown-analysis'))).toBe(true);
  });

  test('analyze 無類型時報錯退出 1', () => {
    const deps = makeMockDeps();
    const { errors, exitCode } = runWithCapture(() => {
      dataCli.main(['analyze'], deps);
    });

    expect(exitCode).toBe(1);
    expect(errors.length).toBeGreaterThan(0);
  });
});
