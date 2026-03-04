'use strict';
/**
 * session-digest.test.js — Session 自動摘要單元測試
 *
 * 測試面向：
 *   1. generateDigest — 正常 timeline 場景
 *   2. generateDigest — 空 timeline 場景
 *   3. generateDigest — 無 failure 場景
 *   4. generateDigest — stage 執行結果統計（pass/fail/reject）
 *   5. generateDigest — durationMs 計算
 *   6. appendDigest — 寫入並可讀取
 *   7. data.js query digests — 路由測試
 */

const { test, expect, describe, afterAll } = require('bun:test');
const { join } = require('path');
const { existsSync, readFileSync, unlinkSync, mkdirSync } = require('fs');
const { SCRIPTS_LIB, SCRIPTS_DIR } = require('../helpers/paths');

const sessionDigest = require(join(SCRIPTS_LIB, 'session-digest.js'));
const dataCli = require(join(SCRIPTS_DIR, 'data.js'));

// ── 測試用暫存目錄 ──

const TEST_TMP = '/tmp/session-digest-test-' + Date.now();
const TEST_SESSION_ID = 'test-digest-session-001';
const TEST_PROJECT_ROOT = TEST_TMP + '/project';

// afterAll 清理暫存目錄
afterAll(() => {
  try {
    require('fs').rmSync(TEST_TMP, { recursive: true, force: true });
  } catch {
    // 靜默
  }
});

// ── 公用 Mock 資料 ──

const MOCK_TIMELINE_EVENTS = [
  { ts: '2024-01-01T00:00:00.000Z', type: 'workflow:start', category: 'workflow', label: '工作流開始', workflowType: 'quick' },
  { ts: '2024-01-01T00:01:00.000Z', type: 'stage:start', category: 'stage', label: '階段開始', stage: 'DEV' },
  { ts: '2024-01-01T00:05:00.000Z', type: 'stage:complete', category: 'stage', label: '階段完成', stage: 'DEV', result: 'pass' },
  { ts: '2024-01-01T00:06:00.000Z', type: 'workflow:complete', category: 'workflow', label: '工作流完成' },
];

const MOCK_STATE = {
  sessionId: TEST_SESSION_ID,
  workflowType: 'quick',
  featureName: 'my-feature',
  currentStage: 'DEV',
  stages: {},
  activeAgents: {},
};

/**
 * 建立標準 mock deps，可局部覆蓋
 */
function makeMockDeps(overrides = {}) {
  return {
    timeline: {
      query: (sessionId, filter) => {
        if (filter && filter.type === 'stage:complete') {
          return MOCK_TIMELINE_EVENTS.filter(e => e.type === 'stage:complete');
        }
        return MOCK_TIMELINE_EVENTS;
      },
      ...((overrides.timeline) || {}),
    },
    failureTracker: {
      getFailurePatterns: () => ({
        totalFailures: 0,
        byStage: {},
        byAgent: {},
        topPattern: null,
      }),
      ...((overrides.failureTracker) || {}),
    },
    state: {
      readState: () => MOCK_STATE,
      ...((overrides.state) || {}),
    },
    paths: {
      global: {
        digests: (projectRoot) => join(projectRoot, 'digests.jsonl'),
      },
      ...((overrides.paths) || {}),
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 1. generateDigest — 正常 timeline 場景
// ────────────────────────────────────────────────────────────────────────────

describe('generateDigest — 正常 timeline', () => {
  test('回傳結構包含所有必要欄位', () => {
    const deps = makeMockDeps();
    const result = sessionDigest.generateDigest(TEST_SESSION_ID, TEST_PROJECT_ROOT, deps);

    expect(result.ts).toBeDefined();
    expect(result.sessionId).toBe(TEST_SESSION_ID);
    expect(result.workflowType).toBe('quick');
    expect(result.featureName).toBe('my-feature');
    expect(typeof result.durationMs).toBe('number');
    expect(typeof result.totalEvents).toBe('number');
    expect(typeof result.byCategory).toBe('object');
    expect(typeof result.stages).toBe('object');
  });

  test('totalEvents 正確計算', () => {
    const deps = makeMockDeps();
    const result = sessionDigest.generateDigest(TEST_SESSION_ID, TEST_PROJECT_ROOT, deps);

    expect(result.totalEvents).toBe(MOCK_TIMELINE_EVENTS.length);
  });

  test('byCategory 按 category 正確分組', () => {
    const deps = makeMockDeps();
    const result = sessionDigest.generateDigest(TEST_SESSION_ID, TEST_PROJECT_ROOT, deps);

    // workflow:start + workflow:complete = 2 個 workflow 事件
    expect(result.byCategory.workflow).toBe(2);
    // stage:start + stage:complete = 2 個 stage 事件
    expect(result.byCategory.stage).toBe(2);
  });

  test('durationMs 計算第一到最後事件的時間差', () => {
    const deps = makeMockDeps();
    const result = sessionDigest.generateDigest(TEST_SESSION_ID, TEST_PROJECT_ROOT, deps);

    // 2024-01-01T00:00:00 → 2024-01-01T00:06:00 = 6 分鐘 = 360000ms
    expect(result.durationMs).toBe(360000);
  });

  test('ts 是 ISO 字串', () => {
    const deps = makeMockDeps();
    const result = sessionDigest.generateDigest(TEST_SESSION_ID, TEST_PROJECT_ROOT, deps);

    expect(() => new Date(result.ts)).not.toThrow();
    expect(typeof result.ts).toBe('string');
    expect(result.ts).toContain('T');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. generateDigest — 空 timeline 場景
// ────────────────────────────────────────────────────────────────────────────

describe('generateDigest — 空 timeline', () => {
  test('空 timeline 時 totalEvents = 0', () => {
    const deps = makeMockDeps({
      timeline: {
        query: () => [],
      },
    });
    const result = sessionDigest.generateDigest(TEST_SESSION_ID, TEST_PROJECT_ROOT, deps);

    expect(result.totalEvents).toBe(0);
  });

  test('空 timeline 時 byCategory 為空物件', () => {
    const deps = makeMockDeps({
      timeline: {
        query: () => [],
      },
    });
    const result = sessionDigest.generateDigest(TEST_SESSION_ID, TEST_PROJECT_ROOT, deps);

    expect(result.byCategory).toEqual({});
  });

  test('空 timeline 時 durationMs 為 null', () => {
    const deps = makeMockDeps({
      timeline: {
        query: () => [],
      },
    });
    const result = sessionDigest.generateDigest(TEST_SESSION_ID, TEST_PROJECT_ROOT, deps);

    expect(result.durationMs).toBeNull();
  });

  test('timeline.query 拋出錯誤時靜默降級', () => {
    const deps = makeMockDeps({
      timeline: {
        query: () => { throw new Error('timeline 讀取失敗'); },
      },
    });

    // 不應拋出
    expect(() => sessionDigest.generateDigest(TEST_SESSION_ID, TEST_PROJECT_ROOT, deps)).not.toThrow();

    const result = sessionDigest.generateDigest(TEST_SESSION_ID, TEST_PROJECT_ROOT, deps);
    expect(result.totalEvents).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. generateDigest — 無 failure 場景
// ────────────────────────────────────────────────────────────────────────────

describe('generateDigest — 無 failure 場景', () => {
  test('無 failure 時 failureHotspot 為 null', () => {
    const deps = makeMockDeps({
      failureTracker: {
        getFailurePatterns: () => ({
          totalFailures: 0,
          byStage: {},
          byAgent: {},
          topPattern: null,
        }),
      },
    });
    const result = sessionDigest.generateDigest(TEST_SESSION_ID, TEST_PROJECT_ROOT, deps);

    expect(result.failureHotspot).toBeNull();
  });

  test('有 failure 時 failureHotspot 包含 topPattern', () => {
    const deps = makeMockDeps({
      failureTracker: {
        getFailurePatterns: () => ({
          totalFailures: 3,
          byStage: { DEV: { count: 2, rate: 0.6667 } },
          byAgent: { developer: { count: 2, rate: 0.6667 } },
          topPattern: { stage: 'DEV', agent: 'developer', count: 2 },
        }),
      },
    });
    const result = sessionDigest.generateDigest(TEST_SESSION_ID, TEST_PROJECT_ROOT, deps);

    expect(result.failureHotspot).not.toBeNull();
    expect(result.failureHotspot.stage).toBe('DEV');
    expect(result.failureHotspot.agent).toBe('developer');
    expect(result.failureHotspot.count).toBe(2);
  });

  test('failureTracker 拋出錯誤時靜默降級（failureHotspot 為 null）', () => {
    const deps = makeMockDeps({
      failureTracker: {
        getFailurePatterns: () => { throw new Error('failure-tracker 讀取失敗'); },
      },
    });

    expect(() => sessionDigest.generateDigest(TEST_SESSION_ID, TEST_PROJECT_ROOT, deps)).not.toThrow();

    const result = sessionDigest.generateDigest(TEST_SESSION_ID, TEST_PROJECT_ROOT, deps);
    expect(result.failureHotspot).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. generateDigest — stage 執行結果統計
// ────────────────────────────────────────────────────────────────────────────

describe('generateDigest — stage 執行結果統計', () => {
  test('全部 pass 時正確計數', () => {
    const deps = makeMockDeps({
      timeline: {
        query: (sessionId, filter) => {
          if (filter && filter.type === 'stage:complete') {
            return [
              { ts: '2024-01-01T00:05:00.000Z', type: 'stage:complete', stage: 'DEV', result: 'pass' },
              { ts: '2024-01-01T00:10:00.000Z', type: 'stage:complete', stage: 'TEST', result: 'pass' },
            ];
          }
          return MOCK_TIMELINE_EVENTS;
        },
      },
    });
    const result = sessionDigest.generateDigest(TEST_SESSION_ID, TEST_PROJECT_ROOT, deps);

    expect(result.stages.total).toBe(2);
    expect(result.stages.pass).toBe(2);
    expect(result.stages.fail).toBe(0);
    expect(result.stages.reject).toBe(0);
  });

  test('混合結果時正確計數', () => {
    const deps = makeMockDeps({
      timeline: {
        query: (sessionId, filter) => {
          if (filter && filter.type === 'stage:complete') {
            return [
              { ts: '2024-01-01T00:05:00.000Z', type: 'stage:complete', stage: 'DEV', result: 'pass' },
              { ts: '2024-01-01T00:10:00.000Z', type: 'stage:complete', stage: 'TEST', result: 'fail' },
              { ts: '2024-01-01T00:15:00.000Z', type: 'stage:complete', stage: 'REVIEW', result: 'reject' },
            ];
          }
          return MOCK_TIMELINE_EVENTS;
        },
      },
    });
    const result = sessionDigest.generateDigest(TEST_SESSION_ID, TEST_PROJECT_ROOT, deps);

    expect(result.stages.total).toBe(3);
    expect(result.stages.pass).toBe(1);
    expect(result.stages.fail).toBe(1);
    expect(result.stages.reject).toBe(1);
  });

  test('無 stage:complete 事件時全為 0', () => {
    const deps = makeMockDeps({
      timeline: {
        query: (sessionId, filter) => {
          if (filter && filter.type === 'stage:complete') {
            return [];
          }
          return MOCK_TIMELINE_EVENTS;
        },
      },
    });
    const result = sessionDigest.generateDigest(TEST_SESSION_ID, TEST_PROJECT_ROOT, deps);

    expect(result.stages.total).toBe(0);
    expect(result.stages.pass).toBe(0);
    expect(result.stages.fail).toBe(0);
    expect(result.stages.reject).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 5. generateDigest — workflowType 和 featureName
// ────────────────────────────────────────────────────────────────────────────

describe('generateDigest — workflowType 和 featureName', () => {
  test('從 state 讀取 workflowType 和 featureName', () => {
    const deps = makeMockDeps({
      state: {
        readState: () => ({
          workflowType: 'standard',
          featureName: 'cool-feature',
        }),
      },
    });
    const result = sessionDigest.generateDigest(TEST_SESSION_ID, TEST_PROJECT_ROOT, deps);

    expect(result.workflowType).toBe('standard');
    expect(result.featureName).toBe('cool-feature');
  });

  test('state.readState 回傳 null 時欄位為 null', () => {
    const deps = makeMockDeps({
      state: {
        readState: () => null,
      },
    });
    const result = sessionDigest.generateDigest(TEST_SESSION_ID, TEST_PROJECT_ROOT, deps);

    expect(result.workflowType).toBeNull();
    expect(result.featureName).toBeNull();
  });

  test('state.readState 拋出錯誤時靜默降級', () => {
    const deps = makeMockDeps({
      state: {
        readState: () => { throw new Error('state 讀取失敗'); },
      },
    });

    expect(() => sessionDigest.generateDigest(TEST_SESSION_ID, TEST_PROJECT_ROOT, deps)).not.toThrow();

    const result = sessionDigest.generateDigest(TEST_SESSION_ID, TEST_PROJECT_ROOT, deps);
    expect(result.workflowType).toBeNull();
    expect(result.featureName).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 6. appendDigest — 寫入並可讀取
// ────────────────────────────────────────────────────────────────────────────

describe('appendDigest — 寫入並可讀取', () => {
  test('第一次寫入後檔案存在', () => {
    const digestsPath = join(TEST_TMP, 'digests-test-write.jsonl');
    const deps = makeMockDeps({
      paths: {
        global: {
          digests: () => digestsPath,
        },
      },
    });

    const digest = sessionDigest.generateDigest(TEST_SESSION_ID, TEST_PROJECT_ROOT, makeMockDeps());
    sessionDigest.appendDigest(TEST_PROJECT_ROOT, digest, deps);

    expect(existsSync(digestsPath)).toBe(true);
  });

  test('寫入的內容可解析為 JSON', () => {
    const digestsPath = join(TEST_TMP, 'digests-test-parse.jsonl');
    const deps = makeMockDeps({
      paths: {
        global: {
          digests: () => digestsPath,
        },
      },
    });

    const digest = sessionDigest.generateDigest(TEST_SESSION_ID, TEST_PROJECT_ROOT, makeMockDeps());
    sessionDigest.appendDigest(TEST_PROJECT_ROOT, digest, deps);

    const content = readFileSync(digestsPath, 'utf8').trim();
    const parsed = JSON.parse(content);

    expect(parsed.sessionId).toBe(TEST_SESSION_ID);
    expect(parsed.workflowType).toBe('quick');
  });

  test('多次 append 後每行各自獨立', () => {
    const digestsPath = join(TEST_TMP, 'digests-test-multi.jsonl');
    const deps = makeMockDeps({
      paths: {
        global: {
          digests: () => digestsPath,
        },
      },
    });

    const digest1 = { ...sessionDigest.generateDigest(TEST_SESSION_ID, TEST_PROJECT_ROOT, makeMockDeps()), sessionId: 'sess-001' };
    const digest2 = { ...sessionDigest.generateDigest(TEST_SESSION_ID, TEST_PROJECT_ROOT, makeMockDeps()), sessionId: 'sess-002' };

    sessionDigest.appendDigest(TEST_PROJECT_ROOT, digest1, deps);
    sessionDigest.appendDigest(TEST_PROJECT_ROOT, digest2, deps);

    const lines = readFileSync(digestsPath, 'utf8').trim().split('\n').filter(Boolean);
    expect(lines.length).toBe(2);

    const parsed1 = JSON.parse(lines[0]);
    const parsed2 = JSON.parse(lines[1]);
    expect(parsed1.sessionId).toBe('sess-001');
    expect(parsed2.sessionId).toBe('sess-002');
  });

  test('digest 為 null 時不寫入', () => {
    const digestsPath = join(TEST_TMP, 'digests-test-null.jsonl');
    const deps = makeMockDeps({
      paths: {
        global: {
          digests: () => digestsPath,
        },
      },
    });

    sessionDigest.appendDigest(TEST_PROJECT_ROOT, null, deps);

    expect(existsSync(digestsPath)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 7. data.js query digests — 路由測試
// ────────────────────────────────────────────────────────────────────────────

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

function makeDataMockDeps(digestRecords = []) {
  return {
    timeline: { query: () => [], latest: () => null, count: () => 0 },
    failureTracker: { getFailurePatterns: () => ({ totalFailures: 0, byStage: {}, byAgent: {}, topPattern: null }) },
    scoreEngine: { queryScores: () => [], getScoreSummary: () => ({}), computeScoreTrend: () => null },
    globalInstinct: { queryGlobal: () => [], summarizeGlobal: () => ({ total: 0 }) },
    baselineTracker: { getBaseline: () => null, computeBaselineTrend: () => null },
    sessionCleanup: { cleanupStaleGlobalDirs: () => ({ cleaned: 0, dryRunList: [], errors: [], skipped: 0 }) },
    paths: {
      SESSIONS_DIR: '/tmp/nonexistent-sessions-' + Date.now(),
      global: {
        baselines: () => '/tmp/nonexistent-baselines.jsonl',
        failures: () => '/tmp/nonexistent-failures.jsonl',
        digests: () => {
          // 如果有 digestRecords，寫入暫存檔
          if (digestRecords.length === 0) {
            return '/tmp/nonexistent-digests-' + Date.now() + '.jsonl';
          }
          const tmpPath = join(TEST_TMP, 'data-cli-digests-' + Date.now() + '.jsonl');
          mkdirSync(require('path').dirname(tmpPath), { recursive: true });
          require('fs').writeFileSync(tmpPath, digestRecords.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
          return tmpPath;
        },
      },
    },
    crossAnalyzer: {
      analyzeFailureHotspot: () => ({ hotspots: [], totalFailures: 0 }),
      analyzeHookOverhead: () => ({ hooks: [], sessionId: null }),
      analyzeWorkflowVelocity: () => ({ stages: [], sessionCount: 0 }),
    },
    sessionDigest: { generateDigest: () => ({}), appendDigest: () => {} },
  };
}

describe('data.js query digests', () => {
  test('digests 檔案不存在時輸出空陣列', () => {
    const deps = makeDataMockDeps([]);
    const { logs } = runWithCapture(() => {
      dataCli._cmdQuery(['digests'], {}, '/tmp/test-project', deps);
    });

    const output = JSON.parse(logs[0]);
    expect(Array.isArray(output)).toBe(true);
    expect(output.length).toBe(0);
  });

  test('digests 有資料時回傳正確記錄', () => {
    const mockDigests = [
      { ts: '2024-01-01T00:00:00Z', sessionId: 'sess-001', workflowType: 'quick', featureName: 'feat-a', totalEvents: 10, stages: { total: 2, pass: 2, fail: 0, reject: 0 } },
      { ts: '2024-01-02T00:00:00Z', sessionId: 'sess-002', workflowType: 'standard', featureName: 'feat-b', totalEvents: 20, stages: { total: 4, pass: 3, fail: 1, reject: 0 } },
    ];

    const deps = makeDataMockDeps(mockDigests);
    const { logs } = runWithCapture(() => {
      dataCli._cmdQuery(['digests'], {}, '/tmp/test-project', deps);
    });

    const output = JSON.parse(logs[0]);
    expect(Array.isArray(output)).toBe(true);
    expect(output.length).toBe(2);
    expect(output[0].sessionId).toBe('sess-001');
    expect(output[1].sessionId).toBe('sess-002');
  });

  test('--workflow 過濾特定 workflowType', () => {
    const mockDigests = [
      { ts: '2024-01-01T00:00:00Z', sessionId: 'sess-001', workflowType: 'quick', totalEvents: 10 },
      { ts: '2024-01-02T00:00:00Z', sessionId: 'sess-002', workflowType: 'standard', totalEvents: 20 },
    ];

    const deps = makeDataMockDeps(mockDigests);
    const { logs } = runWithCapture(() => {
      dataCli._cmdQuery(['digests'], { workflow: 'quick' }, '/tmp/test-project', deps);
    });

    const output = JSON.parse(logs[0]);
    expect(Array.isArray(output)).toBe(true);
    expect(output.length).toBe(1);
    expect(output[0].workflowType).toBe('quick');
  });

  test('--limit 限制回傳數量', () => {
    const mockDigests = [
      { ts: '2024-01-01T00:00:00Z', sessionId: 'sess-001', workflowType: 'quick', totalEvents: 10 },
      { ts: '2024-01-02T00:00:00Z', sessionId: 'sess-002', workflowType: 'quick', totalEvents: 20 },
      { ts: '2024-01-03T00:00:00Z', sessionId: 'sess-003', workflowType: 'quick', totalEvents: 30 },
    ];

    const deps = makeDataMockDeps(mockDigests);
    const { logs } = runWithCapture(() => {
      dataCli._cmdQuery(['digests'], { limit: '2' }, '/tmp/test-project', deps);
    });

    const output = JSON.parse(logs[0]);
    expect(Array.isArray(output)).toBe(true);
    expect(output.length).toBe(2);
  });

  test('data.js main 路由 query digests 正確', () => {
    const deps = makeDataMockDeps([]);
    const { logs } = runWithCapture(() => {
      dataCli.main(['query', 'digests'], deps);
    });

    const output = JSON.parse(logs[0]);
    expect(Array.isArray(output)).toBe(true);
  });
});
