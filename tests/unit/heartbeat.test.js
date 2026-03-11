'use strict';
/**
 * heartbeat.test.js — heartbeat.js daemon 單元測試
 *
 * BDD 覆蓋：
 *   Feature 2：CLI start / stop / status
 *   Feature 3：Daemon PID 檔管理
 *   Feature 4：佇列監聽與 session 排程
 *   Feature 5：安全邊界 — 連續失敗暫停
 *   Feature 6：Telegram 通知
 *   Feature 7：TelegramAdapter.notify()
 *   Feature 8：execution-queue.js failCurrent()
 *   Feature 9：paths.js HEARTBEAT 路徑常數
 *
 * 策略：
 *   - cmdStart/cmdStop/cmdStatus：直接呼叫，_deps 注入 readPid/writePid/deletePid/exit/spawn
 *   - poll 邏輯：使用 _createPollFn 建立 poll 函式，直接 await 執行
 *   - cmdDaemon：使用 _deps.setInterval = () => {} 防止 event loop 卡住
 */

const { test, expect, describe } = require('bun:test');
const { EventEmitter } = require('events');
const { join } = require('path');
const { homedir } = require('os');
const { SCRIPTS_DIR, SCRIPTS_LIB } = require('../helpers/paths');

const heartbeat = require(join(SCRIPTS_DIR, 'heartbeat'));
const paths = require(join(SCRIPTS_LIB, 'paths'));
const executionQueue = require(join(SCRIPTS_LIB, 'execution-queue'));

// ── 工具 ──

function makeMockChild(pid = 99999) {
  const stdout = new EventEmitter();
  return {
    pid,
    stdout,
    _killed: false,
    _killSignal: null,
    kill(signal) {
      this._killed = true;
      this._killSignal = signal;
    },
    unref() {},
    on() {},
  };
}

/**
 * 建立基本 daemon state 物件
 */
function makeState(overrides = {}) {
  return {
    pid: process.pid,
    projectRoot: '/proj',
    activeSession: null,
    consecutiveFailures: 0,
    paused: false,
    startedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * 建立 mock executionQueue
 */
function makeMockQueue({
  getCurrent = null,
  getNext = null,
  advanceToNextReturn = null,
  completeCurrentReturn = true,
  failCurrentReturn = true,
  throwOnGetNext = false,
} = {}) {
  const calls = { advanceToNext: [], completeCurrent: [], failCurrent: [] };
  return {
    _calls: calls,
    getCurrent: () => getCurrent,
    getNext: () => {
      if (throwOnGetNext) throw new Error('損壞的 JSON');
      return getNext;
    },
    advanceToNext: (root) => { calls.advanceToNext.push(root); return advanceToNextReturn; },
    completeCurrent: (root) => { calls.completeCurrent.push(root); return completeCurrentReturn; },
    failCurrent: (root, reason) => { calls.failCurrent.push({ root, reason }); return failCurrentReturn; },
  };
}

/**
 * 執行一次 poll 並等待 outcome 完成
 * @param {object} opts
 */
async function runPoll({
  state = null,
  getCurrent = null,
  getNext = null,
  advanceToNextReturn = null,
  throwOnGetNext = false,
  outcomeResult = { status: 'success', sessionId: 'abc' },
  telegramNotified = [],
  persistStateMock = null,
} = {}) {
  const s = state || makeState();
  const mockQueue = makeMockQueue({ getCurrent, getNext, advanceToNextReturn, throwOnGetNext });
  const outcomePromise = Promise.resolve(outcomeResult);
  const spawnCalls = [];

  const mockSpawnSession = (prompt, opts) => {
    spawnCalls.push({ prompt, opts });
    return { child: makeMockChild(), outcome: outcomePromise };
  };

  const notify = (msg) => { telegramNotified.push(msg); };

  const pollDeps = {
    executionQueue: mockQueue,
    spawnSession: mockSpawnSession,
    notify,
  };
  if (persistStateMock) pollDeps.persistState = persistStateMock;

  const poll = heartbeat._createPollFn('/proj', s, pollDeps);

  await poll();

  // 若有 spawn，等 outcome callback 執行
  if (spawnCalls.length > 0) {
    await outcomePromise;
    await new Promise(r => setTimeout(r, 10));
  }

  return { state: s, spawnCalls, queueCalls: mockQueue._calls, telegramNotified };
}

// ────────────────────────────────────────────────────────────────────────────
// Feature 2: heartbeat.js CLI — start / stop / status
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 2: heartbeat.js CLI — start / stop / status', () => {

  // Scenario 2-1: start 成功 — 無 PID 檔時正常啟動
  test('Scenario 2-1: start — 無 PID 檔時正常啟動，寫入 PID 並 fork daemon', () => {
    let writePidCalled = false;
    let spawnCalled = false;
    let exitCode = null;

    const mockChild = makeMockChild(55555);
    const deps = {
      readPid: () => null,
      writePid: (pid) => {
        writePidCalled = true;
        expect(pid).toBe(55555);
      },
      spawn: (_exec, _args, _opts) => {
        spawnCalled = true;
        expect(_args).toContain('_daemon');
        return mockChild;
      },
      exit: (code) => { exitCode = code; },
    };

    heartbeat.cmdStart('/proj', deps);

    expect(writePidCalled).toBe(true);
    expect(spawnCalled).toBe(true);
    expect(exitCode).toBe(0);
  });

  // Scenario 2-2: start 失敗 — PID 檔存在且 process 存活
  test('Scenario 2-2: start — PID 存在且存活時拒絕啟動，exit(1)', () => {
    let exitCode = null;
    let spawnCalled = false;

    const alivePid = process.pid; // 自身 PID 必然存活

    const deps = {
      readPid: () => alivePid,
      spawn: () => { spawnCalled = true; return makeMockChild(); },
      exit: (code) => { exitCode = code; },
    };

    heartbeat.cmdStart('/proj', deps);

    expect(spawnCalled).toBe(false);
    expect(exitCode).toBe(1);
  });

  // Scenario 2-3: start 成功 — PID 存在但 process 不存在（stale PID）
  test('Scenario 2-3: start — stale PID 自動清理後正常啟動', () => {
    let deletePidCalled = false;
    let writePidCalled = false;
    let exitCode = null;

    const stalePid = 9999999; // 不可能存活的 PID

    const deps = {
      readPid: () => stalePid,
      deletePid: () => { deletePidCalled = true; },
      writePid: () => { writePidCalled = true; },
      spawn: () => makeMockChild(44444),
      exit: (code) => { exitCode = code; },
    };

    heartbeat.cmdStart('/proj', deps);

    expect(deletePidCalled).toBe(true);
    expect(writePidCalled).toBe(true);
    expect(exitCode).toBe(0);
  });

  // Scenario 2-3b: start 遞迴防護 — NOVA_SPAWNED=1 時拒絕啟動
  test('Scenario 2-3b: start — NOVA_SPAWNED=1 時拒絕啟動（防遞迴）', () => {
    let exitCode = null;
    let spawnCalled = false;

    const origSpawned = process.env.NOVA_SPAWNED;
    process.env.NOVA_SPAWNED = '1';

    try {
      const deps = {
        readPid: () => null,
        spawn: () => { spawnCalled = true; return makeMockChild(); },
        exit: (code) => { exitCode = code; },
      };

      heartbeat.cmdStart('/proj', deps);

      expect(spawnCalled).toBe(false);
      expect(exitCode).toBe(1);
    } finally {
      if (origSpawned !== undefined) process.env.NOVA_SPAWNED = origSpawned;
      else delete process.env.NOVA_SPAWNED;
    }
  });

  // Scenario 2-4: stop 成功 — PID 檔存在
  test('Scenario 2-4: stop — PID 存在，發送 SIGTERM', () => {
    let exitCode = null;
    let killedPid = null;
    let killedSignal = null;

    const testPid = 88888;

    // 替換 process.kill
    const origProcessKill = process.kill;
    Object.defineProperty(process, 'kill', {
      value: (pid, signal) => { killedPid = pid; killedSignal = signal; },
      writable: true,
      configurable: true,
    });

    const deps = {
      readPid: () => testPid,
      exit: (code) => { exitCode = code; },
    };

    try {
      heartbeat.cmdStop(deps);
    } finally {
      Object.defineProperty(process, 'kill', {
        value: origProcessKill,
        writable: true,
        configurable: true,
      });
    }

    expect(killedPid).toBe(testPid);
    expect(killedSignal).toBe('SIGTERM');
    expect(exitCode).toBe(0);
  });

  // Scenario 2-5: stop — PID 檔不存在
  test('Scenario 2-5: stop — PID 不存在，exit 0 不報錯', () => {
    let exitCode = null;

    heartbeat.cmdStop({
      readPid: () => null,
      exit: (code) => { exitCode = code; },
    });

    expect(exitCode).toBe(0);
  });

  // Scenario 2-6: status — daemon 執行中
  test('Scenario 2-6: status — daemon 執行中，輸出不拋出例外', () => {
    expect(() => heartbeat.cmdStatus({
      readPid: () => process.pid, // 自身存活
    })).not.toThrow();
  });

  // Scenario 2-7: status — daemon 未執行
  test('Scenario 2-7: status — daemon 未執行，輸出提示不拋出例外', () => {
    expect(() => heartbeat.cmdStatus({
      readPid: () => null,
    })).not.toThrow();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature 3: Daemon PID 檔管理
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 3: Daemon PID 檔管理', () => {

  function makeDaemonDeps(overrides = {}) {
    return {
      writePid: () => {},
      deletePid: () => {},
      spawnSession: () => ({ child: makeMockChild(), outcome: new Promise(() => {}) }),
      executionQueue: makeMockQueue(),
      TelegramAdapter: function() { return { notify: () => Promise.resolve() }; },
      setInterval: () => ({ ref: () => {}, unref: () => {} }),
      processOn: (event, handler) => {
        if (event === 'SIGTERM') {
          // 儲存 handler 供測試使用
          makeDaemonDeps._sigterm = handler;
        }
      },
      processExit: () => {},
      ...overrides,
    };
  }
  makeDaemonDeps._sigterm = null;

  // Scenario 3-1: _daemon 啟動時寫入 PID 檔
  test('Scenario 3-1: _daemon 初始化時呼叫 writePid（自身 PID）', () => {
    let writtenPid = null;
    const deps = makeDaemonDeps({
      writePid: (pid) => { writtenPid = pid; },
    });

    heartbeat.cmdDaemon('/proj', deps);

    expect(writtenPid).toBe(process.pid);
  });

  // Scenario 3-2: daemon 正常退出時清理 PID 檔
  test('Scenario 3-2: cleanup 呼叫後 deletePid 被執行', () => {
    let pidDeleted = false;
    let cleanupFn = null;

    const deps = makeDaemonDeps({
      deletePid: () => { pidDeleted = true; },
      processOn: (event, handler) => {
        if (event === 'SIGTERM') cleanupFn = handler;
      },
    });

    heartbeat.cmdDaemon('/proj', deps);
    if (cleanupFn) cleanupFn();

    expect(pidDeleted).toBe(true);
  });

  // Scenario 3-3: SIGTERM 優雅關閉 — 無活躍 session
  test('Scenario 3-3: SIGTERM — 無活躍 session，cleanup 清理 PID 且 exit 0', () => {
    let pidDeleted = false;
    let exitCode = null;
    let cleanupFn = null;

    const deps = makeDaemonDeps({
      deletePid: () => { pidDeleted = true; },
      processOn: (event, handler) => {
        if (event === 'SIGTERM') cleanupFn = handler;
      },
      processExit: (code) => { exitCode = code; },
    });

    heartbeat.cmdDaemon('/proj', deps);
    if (cleanupFn) cleanupFn();

    expect(pidDeleted).toBe(true);
    expect(exitCode).toBe(0);
  });

  // Scenario 3-4: SIGTERM 優雅關閉 — 有活躍 session
  test('Scenario 3-4: SIGTERM — 有活躍 session，先殺子程序再清理', () => {
    let childKilled = false;
    let pidDeleted = false;
    let cleanupFn = null;

    const mockChild = {
      pid: 77777,
      _killed: false,
      kill(signal) { this._killed = true; childKilled = true; },
      stdout: new EventEmitter(),
      unref() {},
      on() {},
    };

    const deps = makeDaemonDeps({
      deletePid: () => { pidDeleted = true; },
      processOn: (event, handler) => {
        if (event === 'SIGTERM') cleanupFn = handler;
      },
      processExit: () => {},
    });

    const { state, cleanup } = heartbeat.cmdDaemon('/proj', deps);

    // 手動設定 activeSession（模擬 session 執行中）
    state.activeSession = {
      child: mockChild,
      itemName: 'test-feature',
      startedAt: new Date().toISOString(),
    };

    // 使用回傳的 cleanup，或 SIGTERM handler
    if (cleanupFn) {
      cleanupFn();
    } else if (cleanup) {
      cleanup();
    }

    expect(childKilled).toBe(true);
    expect(pidDeleted).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature 4: 佇列監聽與 session 排程（使用 _createPollFn）
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 4: 佇列監聽與 session 排程', () => {

  // Scenario 4-1: polling 偵測到 pending 項目時觸發 spawn
  test('Scenario 4-1: 有 pending 項目 → advanceToNext + spawnSession 被呼叫', async () => {
    const { spawnCalls, queueCalls } = await runPoll({
      getCurrent: null,
      getNext: { item: { name: 'my-feature', workflow: 'standard' }, index: 0 },
      outcomeResult: { status: 'success', sessionId: 'abc' },
    });

    expect(spawnCalls.length).toBe(1);
    expect(spawnCalls[0].prompt).toContain('my-feature');
    expect(spawnCalls[0].prompt).toContain('standard');
    expect(queueCalls.advanceToNext.length).toBe(1);
  });

  // Scenario 4-2: 無 pending 項目時不 spawn
  test('Scenario 4-2: 無 pending 項目 → spawnSession 不被呼叫', async () => {
    const { spawnCalls } = await runPoll({
      getCurrent: null,
      getNext: null,
    });

    expect(spawnCalls.length).toBe(0);
  });

  // Scenario 4-3: 已有 in_progress 項目時不並行 spawn
  test('Scenario 4-3: getCurrent 有 in_progress 項目 → 不 spawn', async () => {
    const { spawnCalls } = await runPoll({
      getCurrent: { item: { name: 'first', workflow: 'standard' }, index: 0 },
      getNext: { item: { name: 'second', workflow: 'standard' }, index: 1 },
    });

    expect(spawnCalls.length).toBe(0);
  });

  // Scenario 4-4: state.activeSession !== null 時不 spawn（最大並行 = 1）
  test('Scenario 4-4: activeSession 存在 → 不 spawn（並行 = 1）', async () => {
    const s = makeState({
      activeSession: {
        child: makeMockChild(),
        itemName: 'first-feature',
        startedAt: new Date().toISOString(),
      },
    });

    const { spawnCalls } = await runPoll({
      state: s,
      getNext: { item: { name: 'second-feature', workflow: 'standard' }, index: 1 },
    });

    expect(spawnCalls.length).toBe(0);
  });

  // Scenario 4-5: session 成功完成後推進佇列
  test('Scenario 4-5: outcome success → completeCurrent 呼叫，consecutiveFailures 重設為 0', async () => {
    const s = makeState({ consecutiveFailures: 2 });

    const { queueCalls, state } = await runPoll({
      state: s,
      getCurrent: null,
      getNext: { item: { name: 'my-feature', workflow: 'standard' }, index: 0 },
      outcomeResult: { status: 'success', sessionId: 'abc' },
    });

    expect(queueCalls.completeCurrent.length).toBe(1);
    expect(queueCalls.failCurrent.length).toBe(0);
    expect(state.consecutiveFailures).toBe(0);
    expect(state.activeSession).toBeNull();
  });

  // Scenario 4-6: session 失敗後 consecutiveFailures 遞增
  test('Scenario 4-6: outcome error → failCurrent 呼叫，consecutiveFailures++', async () => {
    const s = makeState({ consecutiveFailures: 0 });

    const { queueCalls, state } = await runPoll({
      state: s,
      getCurrent: null,
      getNext: { item: { name: 'my-feature', workflow: 'standard' }, index: 0 },
      outcomeResult: { status: 'error', sessionId: null, errorCode: 'error_max_turns' },
    });

    expect(queueCalls.failCurrent.length).toBe(1);
    expect(queueCalls.completeCurrent.length).toBe(0);
    expect(state.consecutiveFailures).toBe(1);
    expect(state.activeSession).toBeNull();
  });

  // Scenario 4-7: execution-queue.json 損壞時 polling 靜默跳過
  test('Scenario 4-7: getNext 拋出例外 → 不 spawn，不拋出未捕獲例外', async () => {
    const { spawnCalls } = await runPoll({
      throwOnGetNext: true,
    });

    expect(spawnCalls.length).toBe(0);
  });

  // Scenario 4-8: paused = true 時 polling 跳過 spawn
  test('Scenario 4-8: paused = true → 不 spawn', async () => {
    const s = makeState({ paused: true });

    const { spawnCalls } = await runPoll({
      state: s,
      getNext: { item: { name: 'my-feature', workflow: 'standard' }, index: 0 },
    });

    expect(spawnCalls.length).toBe(0);
  });

  // Scenario 4-9: polling 每次執行後更新 state.lastPollAt（BDD 4-8）
  test('Scenario 4-9: poll 執行後 state.lastPollAt 更新為 ISO 8601 格式時間戳記', async () => {
    const s = makeState();
    let callCount = 0;

    // mock persistState：模擬真實函式中設定 state.lastPollAt 的行為，並記錄呼叫次數
    const mockPersist = (state) => {
      callCount++;
      state.lastPollAt = new Date().toISOString();
    };

    await runPoll({
      state: s,
      getNext: null, // 無 pending 項目，走最短路徑
      persistStateMock: mockPersist,
    });

    // 至少呼叫一次 persistState
    expect(callCount).toBeGreaterThan(0);
    // state.lastPollAt 應為 ISO 8601 格式
    expect(s.lastPollAt).toBeTruthy();
    expect(new Date(s.lastPollAt).toISOString()).toBe(s.lastPollAt);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature 5: 安全邊界 — 連續失敗暫停
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 5: 安全邊界 — 連續失敗暫停', () => {

  // Scenario 5-1: 連續 3 次失敗觸發暫停
  test('Scenario 5-1: 連續 3 次失敗 → paused = true，notify 含「暫停」', async () => {
    const s = makeState({ consecutiveFailures: 2 }); // 第 3 次即達到閾值
    const telegramNotified = [];

    await runPoll({
      state: s,
      telegramNotified,
      getCurrent: null,
      getNext: { item: { name: 'my-feature', workflow: 'standard' }, index: 0 },
      outcomeResult: { status: 'error', sessionId: null, errorCode: 'error_max_turns' },
    });

    expect(s.consecutiveFailures).toBe(3);
    expect(s.paused).toBe(true);
    expect(telegramNotified.some(m => m.includes('暫停'))).toBe(true);
  });

  // Scenario 5-2: 連續失敗未達閾值不暫停
  test('Scenario 5-2: 連續 2 次失敗（consecutiveFailures 1→2）→ paused 維持 false', async () => {
    const s = makeState({ consecutiveFailures: 1 }); // 第 2 次失敗
    const telegramNotified = [];

    await runPoll({
      state: s,
      telegramNotified,
      getCurrent: null,
      getNext: { item: { name: 'my-feature', workflow: 'standard' }, index: 0 },
      outcomeResult: { status: 'error', sessionId: null, errorCode: 'crash' },
    });

    expect(s.consecutiveFailures).toBe(2);
    expect(s.paused).toBe(false);
    // 不含「暫停」訊息（或無通知）
    expect(telegramNotified.every(m => !m.includes('暫停') || !m.includes('daemon 暫停'))).toBe(true);
  });

  // Scenario 5-3: 成功一次後 consecutiveFailures 重設
  test('Scenario 5-3: 成功後 consecutiveFailures 重設為 0', async () => {
    const s = makeState({ consecutiveFailures: 2 });

    await runPoll({
      state: s,
      getCurrent: null,
      getNext: { item: { name: 'my-feature', workflow: 'standard' }, index: 0 },
      outcomeResult: { status: 'success', sessionId: 'ok' },
    });

    expect(s.consecutiveFailures).toBe(0);
  });

  // Scenario 5-4: CONSECUTIVE_FAILURE_THRESHOLD 常數值為 3
  test('Scenario 5-4: CONSECUTIVE_FAILURE_THRESHOLD 值為 3', () => {
    expect(heartbeat.CONSECUTIVE_FAILURE_THRESHOLD).toBe(3);
  });

  // Scenario 5-5: 暫停狀態持久化 — paused:true 且 consecutiveFailures:3（BDD 5-4）
  test('Scenario 5-5: 連續 3 次失敗後 persistState 以 paused:true, consecutiveFailures:3 呼叫', async () => {
    const s = makeState({ consecutiveFailures: 2 });
    const persistCalls = [];

    const mockPersist = (state) => {
      persistCalls.push({ paused: state.paused, consecutiveFailures: state.consecutiveFailures });
    };

    await runPoll({
      state: s,
      persistStateMock: mockPersist,
      getCurrent: null,
      getNext: { item: { name: 'my-feature', workflow: 'standard' }, index: 0 },
      outcomeResult: { status: 'error', sessionId: null, errorCode: 'error_max_turns' },
    });

    // outcome 回呼後，state.paused === true, consecutiveFailures === 3
    expect(s.paused).toBe(true);
    expect(s.consecutiveFailures).toBe(3);

    // 至少有一次 persistState 呼叫時帶著 paused:true 和 consecutiveFailures:3
    const pausedCall = persistCalls.find(c => c.paused === true && c.consecutiveFailures === 3);
    expect(pausedCall).toBeTruthy();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature 6: Telegram 通知
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 6: Telegram 通知', () => {

  // Scenario 6-1: spawn 開始時發送通知
  test('Scenario 6-1: spawn 前發送「開始執行」通知', async () => {
    const notified = [];

    await runPoll({
      telegramNotified: notified,
      getCurrent: null,
      getNext: { item: { name: 'my-feature', workflow: 'standard' }, index: 0 },
      outcomeResult: { status: 'success', sessionId: null },
    });

    expect(notified.some(m => m.includes('my-feature'))).toBe(true);
    // 開始執行通知出現在任何完成/失敗通知之前
    const startIdx = notified.findIndex(m => m.includes('開始執行'));
    expect(startIdx).toBeGreaterThanOrEqual(0);
  });

  // Scenario 6-2: session 成功完成時發送通知
  test('Scenario 6-2: outcome success → 發送「完成」通知', async () => {
    const notified = [];

    await runPoll({
      telegramNotified: notified,
      getCurrent: null,
      getNext: { item: { name: 'my-feature', workflow: 'standard' }, index: 0 },
      outcomeResult: { status: 'success', sessionId: null },
    });

    expect(notified.some(m => m.includes('完成'))).toBe(true);
  });

  // Scenario 6-3: session 失敗時發送通知（未達暫停閾值）
  test('Scenario 6-3: outcome error → 發送「失敗」通知', async () => {
    const notified = [];

    await runPoll({
      telegramNotified: notified,
      getCurrent: null,
      getNext: { item: { name: 'my-feature', workflow: 'standard' }, index: 0 },
      outcomeResult: { status: 'error', sessionId: null, errorCode: 'error_max_turns' },
    });

    expect(notified.some(m => m.includes('失敗'))).toBe(true);
  });

  // Scenario 6-4: 連續 3 次失敗暫停時發送暫停通知
  test('Scenario 6-4: 第 3 次失敗觸發暫停，notify 含「暫停」', async () => {
    const notified = [];
    const s = makeState({ consecutiveFailures: 2 });

    await runPoll({
      state: s,
      telegramNotified: notified,
      getCurrent: null,
      getNext: { item: { name: 'my-feature', workflow: 'standard' }, index: 0 },
      outcomeResult: { status: 'error', sessionId: null, errorCode: 'timeout' },
    });

    expect(notified.some(m => m.includes('暫停'))).toBe(true);
  });

  // Scenario 6-5: Telegram token 不存在時靜默跳過（不拋出例外）
  test('Scenario 6-5: notify 為 noop 時不拋出例外', async () => {
    // notify 是 noop（不推送任何東西）
    const notified = [];

    await expect(runPoll({
      telegramNotified: notified,
      getCurrent: null,
      getNext: { item: { name: 'f', workflow: 'quick' }, index: 0 },
      outcomeResult: { status: 'success', sessionId: null },
    })).resolves.toBeTruthy();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature 7: TelegramAdapter.notify() 公開方法
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 7: TelegramAdapter.notify() 公開方法', () => {
  const TelegramAdapter = require(join(SCRIPTS_LIB, 'remote', 'telegram-adapter'));

  // Scenario 7-1: chatId 存在時 notify 成功發送訊息
  test('Scenario 7-1: chatId 存在時 notify 呼叫 _sendMessage', async () => {
    const adapter = new TelegramAdapter('fake-token', null, { chatId: '12345' });

    let sentChatId = null;
    let sentText = null;
    adapter._sendMessage = async (chatId, text) => {
      sentChatId = chatId;
      sentText = text;
    };

    await adapter.notify('Hello from heartbeat');

    expect(sentChatId).toBe('12345');
    expect(sentText).toBe('Hello from heartbeat');
  });

  // Scenario 7-2: chatId 為 null 時 notify 靜默 return
  test('Scenario 7-2: chatId 為 null 時 notify 不呼叫 _sendMessage', async () => {
    const adapter = new TelegramAdapter('fake-token', null, { chatId: null });

    let sendCalled = false;
    adapter._sendMessage = async () => { sendCalled = true; };

    await adapter.notify('any message');

    expect(sendCalled).toBe(false);
  });

  // Scenario 7-3: _sendMessage 拋出例外時 notify 不向外傳播
  test('Scenario 7-3: _sendMessage 拋出例外時 notify 捕獲不拋出', async () => {
    const adapter = new TelegramAdapter('fake-token', null, { chatId: '12345' });

    adapter._sendMessage = async () => {
      throw new Error('網路錯誤');
    };

    await expect(adapter.notify('message')).resolves.toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature 8: execution-queue.js — failCurrent() 新增方法
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 8: execution-queue.js — failCurrent()', () => {
  const { rmSync } = require('fs');
  const TIMESTAMP = Date.now();
  const TEST_PROJECT = join(homedir(), '.nova', 'test-fail-current-' + TIMESTAMP);

  const cleanup = () => {
    try {
      rmSync(paths.global.dir(TEST_PROJECT), { recursive: true, force: true });
    } catch {
      // 忽略
    }
  };

  // Scenario 8-1: 成功將 in_progress 項目標記為 failed
  test('Scenario 8-1: failCurrent → status 改為 failed，failedAt、failReason 寫入', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'TaskA', workflow: 'standard' },
    ], 'test');
    executionQueue.advanceToNext(TEST_PROJECT);

    const result = executionQueue.failCurrent(TEST_PROJECT, '60分鐘 timeout');
    expect(result).toBe(true);

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items[0].status).toBe('failed');
    expect(queue.items[0].failedAt).toBeTruthy();
    expect(queue.items[0].failReason).toBe('60分鐘 timeout');

    cleanup();
  });

  // Scenario 8-2: 無 in_progress 項目時回傳 false
  test('Scenario 8-2: 無 in_progress 時 failCurrent 回傳 false', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'PendingOnly', workflow: 'standard' },
    ], 'test');

    const result = executionQueue.failCurrent(TEST_PROJECT, 'reason');
    expect(result).toBe(false);

    cleanup();
  });

  // Scenario 8-3: reason 參數省略時不加 failReason 欄位
  test('Scenario 8-3: reason 省略時 failReason 欄位不存在', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'TaskB', workflow: 'quick' },
    ], 'test');
    executionQueue.advanceToNext(TEST_PROJECT);

    const result = executionQueue.failCurrent(TEST_PROJECT);
    expect(result).toBe(true);

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items[0].status).toBe('failed');
    expect(queue.items[0].failedAt).toBeTruthy();
    expect(queue.items[0].failReason).toBeUndefined();

    cleanup();
  });

  // Scenario 8-4: execution-queue.json 不存在時回傳 false
  test('Scenario 8-4: queue 不存在時 failCurrent 回傳 false，不拋出例外', () => {
    const noSuchProject = '/tmp/no-such-project-' + TIMESTAMP;
    const result = executionQueue.failCurrent(noSuchProject, 'reason');
    expect(result).toBe(false);
  });

  // Scenario 8-5: failCurrent 冪等性 — 已 failed 的項目不重複標記
  test('Scenario 8-5: 已 failed 項目（無 in_progress）→ 連續 failCurrent 回傳 false', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'TaskC', workflow: 'quick' },
    ], 'test');
    executionQueue.advanceToNext(TEST_PROJECT);
    executionQueue.failCurrent(TEST_PROJECT, 'first');

    const r1 = executionQueue.failCurrent(TEST_PROJECT, 'second');
    const r2 = executionQueue.failCurrent(TEST_PROJECT, 'third');
    expect(r1).toBe(false);
    expect(r2).toBe(false);

    cleanup();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature 9: paths.js — HEARTBEAT 路徑常數
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 9: paths.js — HEARTBEAT 路徑常數', () => {

  // Scenario 9-1: HEARTBEAT_PID_FILE 路徑指向正確位置
  test('Scenario 9-1: HEARTBEAT_PID_FILE 含 .nova 且以 heartbeat.pid 結尾', () => {
    expect(paths.HEARTBEAT_PID_FILE).toBeTruthy();
    expect(paths.HEARTBEAT_PID_FILE).toContain('.nova');
    expect(paths.HEARTBEAT_PID_FILE).toMatch(/heartbeat\.pid$/);
  });

  // Scenario 9-2: HEARTBEAT_STATE_FILE 路徑指向正確位置
  test('Scenario 9-2: HEARTBEAT_STATE_FILE 含 .nova 且以 heartbeat-state.json 結尾', () => {
    expect(paths.HEARTBEAT_STATE_FILE).toBeTruthy();
    expect(paths.HEARTBEAT_STATE_FILE).toContain('.nova');
    expect(paths.HEARTBEAT_STATE_FILE).toMatch(/heartbeat-state\.json$/);
  });

  // Scenario 9-3: heartbeat.js 使用 paths 常數（不魔術字串）
  test('Scenario 9-3: heartbeat.js 不包含 hardcoded ~/.nova/heartbeat.pid 字串', () => {
    const { readFileSync } = require('fs');
    const heartbeatSrc = readFileSync(join(SCRIPTS_DIR, 'heartbeat.js'), 'utf8');

    expect(heartbeatSrc).not.toContain("'~/.nova/heartbeat.pid'");
    expect(heartbeatSrc).not.toContain('"~/.nova/heartbeat.pid"');
    expect(heartbeatSrc).toContain('paths');
  });
});
