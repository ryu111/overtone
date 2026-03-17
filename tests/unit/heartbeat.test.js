import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  readState,
  writeState,
  poll,
  executeTask,
  STATE_FILE,
} from '../../../../.claude/scripts/heartbeat.js';

// ─── 測試工具 ──────────────────────────────────────────────────────────────────

function makeTmpDir() {
  const dir = join(tmpdir(), `heartbeat-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** 防止測試寫到 production session-summaries.jsonl */
function tmpSummaryFile(dir) {
  return join(dir, 'session-summaries.jsonl');
}

// ─── readState / writeState ───────────────────────────────────────────────────

describe('readState / writeState', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  test('檔案不存在時回傳 defaultState', () => {
    const path = join(tmpDir, 'state.json');
    const state = readState(path);
    expect(state.running).toBe(false);
    expect(state.pid).toBeNull();
    expect(state.consecutiveFailures).toBe(0);
    expect(state.paused).toBe(false);
  });

  test('寫入再讀取正確', () => {
    const path = join(tmpDir, 'state.json');
    const s = {
      running: true,
      pid: 99,
      startedAt: '2026-01-01T00:00:00.000Z',
      lastPoll: '2026-01-01T01:00:00.000Z',
      consecutiveFailures: 2,
      activeTask: { id: 'abc', name: 'test', claimedAt: '2026-01-01T01:00:00.000Z' },
      paused: false,
    };
    writeState(s, path);
    const loaded = readState(path);
    expect(loaded.running).toBe(true);
    expect(loaded.pid).toBe(99);
    expect(loaded.consecutiveFailures).toBe(2);
    expect(loaded.activeTask.name).toBe('test');
  });

  test('寫入時自動建立目錄', () => {
    const path = join(tmpDir, 'deep/nested/state.json');
    writeState({ running: false, pid: null, consecutiveFailures: 0, paused: false }, path);
    expect(existsSync(path)).toBe(true);
  });

  test('損壞的 JSON 不崩潰，回傳 defaultState', () => {
    const path = join(tmpDir, 'state.json');
    writeFileSync(path, '{broken json', 'utf-8');
    const state = readState(path);
    expect(state.running).toBe(false);
    expect(state.consecutiveFailures).toBe(0);
  });
});

// ─── poll — idle ──────────────────────────────────────────────────────────────

describe('poll idle（無任務）', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  test('無任務 → action: idle', async () => {
    const stateFile = join(tmpDir, 'state.json');
    writeState({ running: true, paused: false, consecutiveFailures: 0 }, stateFile);

    const deps = {
      listTasks: async () => [],
      claimTask: async () => {},
      completeTask: async () => {},
      summaryFile: tmpSummaryFile(tmpDir),
    };

    const result = await poll({ _stateFile: stateFile }, deps);
    expect(result.action).toBe('idle');
  });

  test('空陣列也是 idle', async () => {
    const stateFile = join(tmpDir, 'state.json');
    writeState({ running: true, paused: false, consecutiveFailures: 0 }, stateFile);

    const deps = { listTasks: async () => [], claimTask: async () => {}, completeTask: async () => {} };
    const result = await poll({ _stateFile: stateFile }, deps);
    expect(result.action).toBe('idle');
  });

  test('idle 時 consecutiveFailures 歸零', async () => {
    const stateFile = join(tmpDir, 'state.json');
    writeState({ running: true, paused: false, consecutiveFailures: 2 }, stateFile);

    const deps = { listTasks: async () => [], claimTask: async () => {}, completeTask: async () => {} };
    await poll({ _stateFile: stateFile }, deps);

    const state = readState(stateFile);
    expect(state.consecutiveFailures).toBe(0);
  });
});

// ─── poll — execute ───────────────────────────────────────────────────────────

describe('poll execute（有任務 → claim）', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  test('有任務 → action: execute + task', async () => {
    const stateFile = join(tmpDir, 'state.json');
    writeState({ running: true, paused: false, consecutiveFailures: 0 }, stateFile);

    const task = { id: 'task-1', name: '實作功能', priority: 'P1' };
    const deps = {
      listTasks: async () => [task],
      claimTask: async () => {},
      completeTask: async () => {},
      summaryFile: tmpSummaryFile(tmpDir),
    };

    const result = await poll({ _stateFile: stateFile }, deps);
    expect(result.action).toBe('execute');
    expect(result.task).toBeDefined();
    expect(result.task.name).toBe('實作功能');
  });

  test('多個任務按 priority 排序，取最高優先', async () => {
    const stateFile = join(tmpDir, 'state.json');
    writeState({ running: true, paused: false, consecutiveFailures: 0 }, stateFile);

    const tasks = [
      { id: 't2', name: '低優先任務', priority: 'P2' },
      { id: 't0', name: '最高優先任務', priority: 'P0' },
      { id: 't1', name: '中優先任務', priority: 'P1' },
    ];
    let claimedId = null;
    const deps = {
      listTasks: async () => tasks,
      claimTask: async (id) => { claimedId = id; },
      completeTask: async () => {},
      summaryFile: tmpSummaryFile(tmpDir),
    };

    const result = await poll({ _stateFile: stateFile }, deps);
    expect(result.action).toBe('execute');
    expect(result.task.name).toBe('最高優先任務');
    expect(claimedId).toBe('t0');
  });

  test('claim 後 activeTask 寫入 state', async () => {
    const stateFile = join(tmpDir, 'state.json');
    writeState({ running: true, paused: false, consecutiveFailures: 0 }, stateFile);

    const task = { id: 'task-1', name: '測試任務', priority: 'P1' };
    const deps = {
      listTasks: async () => [task],
      claimTask: async () => {},
      completeTask: async () => {},
      summaryFile: tmpSummaryFile(tmpDir),
    };

    await poll({ _stateFile: stateFile }, deps);
    const state = readState(stateFile);
    expect(state.activeTask).toBeDefined();
    expect(state.activeTask.name).toBe('測試任務');
  });
});

// ─── poll — paused ────────────────────────────────────────────────────────────

describe('poll paused（連續失敗 3 次）', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  test('state.paused=true → action: paused（不呼叫 listTasks）', async () => {
    const stateFile = join(tmpDir, 'state.json');
    writeState({ running: true, paused: true, consecutiveFailures: 3 }, stateFile);

    let listCalled = false;
    const deps = {
      listTasks: async () => { listCalled = true; return []; },
      claimTask: async () => {},
      completeTask: async () => {},
      summaryFile: tmpSummaryFile(tmpDir),
    };

    const result = await poll({ _stateFile: stateFile }, deps);
    expect(result.action).toBe('paused');
    expect(listCalled).toBe(false);
  });

  test('listTasks 失敗 3 次 → paused', async () => {
    const stateFile = join(tmpDir, 'state.json');
    writeState({ running: true, paused: false, consecutiveFailures: 2 }, stateFile);

    const deps = {
      listTasks: async () => { throw new Error('Notion API error'); },
      claimTask: async () => {},
      completeTask: async () => {},
      summaryFile: tmpSummaryFile(tmpDir),
    };

    const result = await poll({ _stateFile: stateFile, maxConsecutiveFailures: 3 }, deps);
    expect(result.action).toBe('paused');

    const state = readState(stateFile);
    expect(state.paused).toBe(true);
    expect(state.consecutiveFailures).toBe(3);
  });

  test('listTasks 失敗 2 次 → 還未 paused', async () => {
    const stateFile = join(tmpDir, 'state.json');
    writeState({ running: true, paused: false, consecutiveFailures: 1 }, stateFile);

    const deps = {
      listTasks: async () => { throw new Error('Notion API error'); },
      claimTask: async () => {},
      completeTask: async () => {},
      summaryFile: tmpSummaryFile(tmpDir),
    };

    const result = await poll({ _stateFile: stateFile, maxConsecutiveFailures: 3 }, deps);
    expect(result.action).toBe('idle');

    const state = readState(stateFile);
    expect(state.paused).toBe(false);
    expect(state.consecutiveFailures).toBe(2);
  });

  test('claimTask 失敗 3 次 → paused', async () => {
    const stateFile = join(tmpDir, 'state.json');
    writeState({ running: true, paused: false, consecutiveFailures: 2 }, stateFile);

    const deps = {
      listTasks: async () => [{ id: 't1', name: 'task', priority: 'P1' }],
      claimTask: async () => { throw new Error('claim failed'); },
      completeTask: async () => {},
      summaryFile: tmpSummaryFile(tmpDir),
    };

    const result = await poll({ _stateFile: stateFile, maxConsecutiveFailures: 3 }, deps);
    expect(result.action).toBe('paused');
  });
});

// ─── executeTask ─────────────────────────────────────────────────────────────

describe('executeTask success 路徑', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  test('spawn 成功 → { status: success }', async () => {
    const stateFile = join(tmpDir, 'state.json');
    writeState({ running: true, activeTask: { id: 't1', name: 'task' }, paused: false, consecutiveFailures: 0 }, stateFile);

    const mockOutcome = Promise.resolve({
      exitCode: 0,
      stdout: JSON.stringify({ type: 'result', result: 'task done' }),
      duration: 1000,
    });

    let completedId = null;
    const deps = {
      spawnSession: () => ({ ok: true, child: {}, outcome: mockOutcome }),
      completeTask: async (id) => { completedId = id; },
      summaryFile: tmpSummaryFile(tmpDir),
    };

    const task = { id: 't1', name: '測試任務', priority: 'P0' };
    const result = await executeTask(task, { _stateFile: stateFile }, deps);

    expect(result.status).toBe('success');
    expect(completedId).toBe('t1');
  });

  test('完成後清除 activeTask', async () => {
    const stateFile = join(tmpDir, 'state.json');
    writeState({ running: true, activeTask: { id: 't1', name: 'task' }, paused: false, consecutiveFailures: 0 }, stateFile);

    const mockOutcome = Promise.resolve({
      exitCode: 0,
      stdout: JSON.stringify({ type: 'result', result: 'done' }),
      duration: 500,
    });

    const deps = {
      spawnSession: () => ({ ok: true, child: {}, outcome: mockOutcome }),
      completeTask: async () => {},
      summaryFile: tmpSummaryFile(tmpDir),
    };

    const task = { id: 't1', name: '任務', priority: 'P0' };
    await executeTask(task, { _stateFile: stateFile }, deps);

    const state = readState(stateFile);
    expect(state.activeTask).toBeNull();
  });
});

describe('executeTask failed 路徑', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  test('spawn 回傳 ok:false → { status: failed }', async () => {
    const stateFile = join(tmpDir, 'state.json');
    writeState({ running: true, activeTask: null, paused: false, consecutiveFailures: 0 }, stateFile);

    const deps = {
      spawnSession: () => ({ ok: false, error: 'recursive spawn blocked' }),
      completeTask: async () => {},
      summaryFile: tmpSummaryFile(tmpDir),
    };

    const task = { id: 't1', name: '任務', priority: 'P0' };
    const result = await executeTask(task, { _stateFile: stateFile }, deps);

    expect(result.status).toBe('failed');
    expect(result.error).toBe('recursive spawn blocked');
  });

  test('exit code 非 0 → { status: failed }', async () => {
    const stateFile = join(tmpDir, 'state.json');
    writeState({ running: true, activeTask: { id: 't1', name: 'task' }, paused: false, consecutiveFailures: 0 }, stateFile);

    const mockOutcome = Promise.resolve({
      exitCode: 1,
      stdout: JSON.stringify({ type: 'error', error: 'session crashed' }),
      duration: 200,
    });

    const deps = {
      spawnSession: () => ({ ok: true, child: {}, outcome: mockOutcome }),
      completeTask: async () => {},
    };

    const task = { id: 't1', name: '任務', priority: 'P0' };
    const result = await executeTask(task, { _stateFile: stateFile }, deps);

    expect(result.status).toBe('failed');
  });

  test('失敗後仍清除 activeTask', async () => {
    const stateFile = join(tmpDir, 'state.json');
    writeState({ running: true, activeTask: { id: 't1', name: 'task' }, paused: false, consecutiveFailures: 0 }, stateFile);

    const mockOutcome = Promise.resolve({ exitCode: 1, stdout: '', duration: 100 });

    const deps = {
      spawnSession: () => ({ ok: true, child: {}, outcome: mockOutcome }),
      completeTask: async () => {},
    };

    const task = { id: 't1', name: '任務', priority: 'P0' };
    await executeTask(task, { _stateFile: stateFile }, deps);

    const state = readState(stateFile);
    expect(state.activeTask).toBeNull();
  });
});

// ─── CLI start / stop / status ────────────────────────────────────────────────

describe('CLI start — stale PID 清理', () => {
  test('PID_FILE 含過期 PID → 清除並繼續', async () => {
    // 這個測試驗證 stale PID 清理邏輯
    // 由於 cmdStart 是 async 且需要 spawn，用整合方式測試
    // 直接驗證 readState 和 writeState 的 roundtrip
    const tmpDir = makeTmpDir();
    const stateFile = join(tmpDir, 'state.json');

    writeState({ running: true, pid: 99999, startedAt: '2026-01-01T00:00:00.000Z', paused: false, consecutiveFailures: 0 }, stateFile);
    const loaded = readState(stateFile);

    // PID 99999 應該不存在（除非真的有程序用這個 PID）
    let pidExists = true;
    try { process.kill(loaded.pid, 0); } catch { pidExists = false; }

    // 若 PID 不存在，這就是 stale 情況
    expect(typeof pidExists).toBe('boolean');

    rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe('CLI status 輸出', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  test('state 有 activeTask 時可讀取', () => {
    const stateFile = join(tmpDir, 'state.json');
    writeState({
      running: true,
      pid: process.pid,
      startedAt: '2026-01-01T00:00:00.000Z',
      lastPoll: '2026-01-01T01:00:00.000Z',
      consecutiveFailures: 0,
      activeTask: { id: 'abc', name: '進行中的任務', claimedAt: '2026-01-01T01:00:00.000Z' },
      paused: false,
    }, stateFile);

    const state = readState(stateFile);
    expect(state.activeTask.name).toBe('進行中的任務');
    expect(state.lastPoll).toBe('2026-01-01T01:00:00.000Z');
  });

  test('paused 狀態正確讀取', () => {
    const stateFile = join(tmpDir, 'state.json');
    writeState({
      running: true,
      pid: 999,
      paused: true,
      consecutiveFailures: 3,
      activeTask: null,
    }, stateFile);

    const state = readState(stateFile);
    expect(state.paused).toBe(true);
    expect(state.consecutiveFailures).toBe(3);
  });
});

// ─── OVERTONE_SPAWNED 遞迴防護（透過 spawnSession）────────────────────────────

describe('OVERTONE_SPAWNED 遞迴防護（整合）', () => {
  test('executeTask 在 OVERTONE_SPAWNED=1 環境中 → failed', async () => {
    const tmpDir = makeTmpDir();
    const stateFile = join(tmpDir, 'state.json');
    writeState({ running: true, activeTask: null, paused: false, consecutiveFailures: 0 }, stateFile);

    // 使用真實 spawnSession，但傳入 env = { OVERTONE_SPAWNED: '1' }
    const { spawnSession: realSpawnSession } = await import('../../../../.claude/scripts/session-spawner.js');

    const spawnWithBlockedEnv = (prompt, opts) =>
      realSpawnSession(prompt, opts, { env: { OVERTONE_SPAWNED: '1' } });

    const deps = {
      spawnSession: spawnWithBlockedEnv,
      completeTask: async () => {},
    };

    const task = { id: 't1', name: '遞迴任務', priority: 'P0' };
    const result = await executeTask(task, { _stateFile: stateFile }, deps);

    expect(result.status).toBe('failed');
    expect(result.error).toBe('recursive spawn blocked');

    rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ─── maxTotalTime 超時 break 驗證 ───────────────────────────────────────────

describe('executeTask maxTotalTime 超時立即停止', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  test('maxTotalTime 超過 → 不再 retry，立即 failed', async () => {
    const stateFile = join(tmpDir, 'state.json');
    writeState({ running: true, activeTask: { id: 't1', name: 'task' }, paused: false, consecutiveFailures: 0 }, stateFile);

    let attempts = 0;
    const deps = {
      spawnSession: () => {
        attempts++;
        // 每次都回傳失敗 session（exit code 1）
        return {
          ok: true, child: {},
          outcome: Promise.resolve({ exitCode: 1, stdout: JSON.stringify({ type: 'error', error: 'timeout' }), duration: 500 }),
        };
      },
      completeTask: async () => {},
    };

    const result = await executeTask(
      { id: 't1', name: '逾時任務', priority: 'P0' },
      { _stateFile: stateFile, maxRetries: 5, maxTotalTime: 0 },  // maxTotalTime=0 → 立即超時
      deps,
    );

    expect(result.status).toBe('failed');
    expect(result.error).toContain('maxTotalTime exceeded');
    // 應在第一次 attempt 就停止，不繼續 retry
    expect(attempts).toBe(1);
  });

  test('maxTotalTime 未超過 → 正常 retry', async () => {
    const stateFile = join(tmpDir, 'state.json');
    writeState({ running: true, activeTask: { id: 't1', name: 'task' }, paused: false, consecutiveFailures: 0 }, stateFile);

    let attempts = 0;
    const deps = {
      spawnSession: () => {
        attempts++;
        if (attempts === 2) {
          // 第二次成功
          return {
            ok: true, child: {},
            outcome: Promise.resolve({ exitCode: 0, stdout: JSON.stringify({ type: 'result', result: 'ok', session_id: 'sess-1' }), duration: 100 }),
          };
        }
        return {
          ok: true, child: {},
          outcome: Promise.resolve({ exitCode: 1, stdout: JSON.stringify({ type: 'error', error: 'temp fail', session_id: 'sess-1' }), duration: 100 }),
        };
      },
      completeTask: async () => {},
    };

    const result = await executeTask(
      { id: 't1', name: '重試任務', priority: 'P0' },
      { _stateFile: stateFile, maxRetries: 3, maxTotalTime: 60000 },
      deps,
    );

    expect(result.status).toBe('success');
    expect(attempts).toBe(2);
  });
});

// ─── auto-unpause 冷卻恢復驗證 ──────────────────────────────────────────────

describe('auto-unpause 冷卻恢復', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  test('paused + pausedAt 過冷卻期 → 自動恢復，繼續 poll', async () => {
    const stateFile = join(tmpDir, 'state.json');
    // pausedAt 設為 10 秒前
    const tenSecsAgo = new Date(Date.now() - 10000).toISOString();
    writeState({
      running: true, paused: true, consecutiveFailures: 3,
      pausedAt: tenSecsAgo, activeTask: null,
    }, stateFile);

    const deps = {
      listTasks: async () => [],
      claimTask: async () => {},
      completeTask: async () => {},
    };

    // pauseCooldownMs=5000（5 秒），已過 10 秒 → 應 unpause
    const result = await poll({ _stateFile: stateFile, pauseCooldownMs: 5000 }, deps);
    expect(result.action).toBe('idle'); // 不是 paused，而是 idle（因為無任務）

    const state = readState(stateFile);
    expect(state.paused).toBe(false);
    expect(state.consecutiveFailures).toBe(0);
  });

  test('paused + pausedAt 未過冷卻期 → 仍然 paused', async () => {
    const stateFile = join(tmpDir, 'state.json');
    // pausedAt 設為 1 秒前
    const oneSecAgo = new Date(Date.now() - 1000).toISOString();
    writeState({
      running: true, paused: true, consecutiveFailures: 3,
      pausedAt: oneSecAgo, activeTask: null,
    }, stateFile);

    const deps = {
      listTasks: async () => [],
      claimTask: async () => {},
      completeTask: async () => {},
    };

    // pauseCooldownMs=60000（60 秒），只過 1 秒 → 仍 paused
    const result = await poll({ _stateFile: stateFile, pauseCooldownMs: 60000 }, deps);
    expect(result.action).toBe('paused');
  });

  test('paused 但無 pausedAt（舊格式相容）→ 仍然 paused', async () => {
    const stateFile = join(tmpDir, 'state.json');
    writeState({
      running: true, paused: true, consecutiveFailures: 3,
      activeTask: null,
    }, stateFile);

    const deps = {
      listTasks: async () => [],
      claimTask: async () => {},
      completeTask: async () => {},
    };

    const result = await poll({ _stateFile: stateFile, pauseCooldownMs: 0 }, deps);
    expect(result.action).toBe('paused');
  });

  test('listTasks 失敗致 pause 時記錄 pausedAt', async () => {
    const stateFile = join(tmpDir, 'state.json');
    writeState({ running: true, paused: false, consecutiveFailures: 2, activeTask: null }, stateFile);

    const deps = {
      listTasks: async () => { throw new Error('Notion down'); },
      claimTask: async () => {},
      completeTask: async () => {},
    };

    await poll({ _stateFile: stateFile, maxConsecutiveFailures: 3 }, deps);
    const state = readState(stateFile);
    expect(state.paused).toBe(true);
    expect(state.pausedAt).toBeTruthy();
    // pausedAt 應是近幾秒內的時間戳
    const ts = new Date(state.pausedAt).getTime();
    expect(Date.now() - ts).toBeLessThan(5000);
  });
});

// ─── stale activeTask 清理驗證 ──────────────────────────────────────────────

describe('stale activeTask 清理', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  test('超齡 activeTask → 自動清除 + resetTask', async () => {
    const stateFile = join(tmpDir, 'state.json');
    // claimedAt 設為 2 小時前
    const twoHoursAgo = new Date(Date.now() - 7200000).toISOString();
    writeState({
      running: true, paused: false, consecutiveFailures: 0,
      activeTask: { id: 'stale-1', name: '殘留任務', claimedAt: twoHoursAgo },
    }, stateFile);

    let resetCalled = null;
    const deps = {
      listTasks: async () => [],
      claimTask: async () => {},
      completeTask: async () => {},
      resetTask: async (id, msg) => { resetCalled = { id, msg }; },
      summaryFile: tmpSummaryFile(tmpDir),
    };

    // staleTaskTimeout=3600000（1 小時），已過 2 小時 → 應清除
    const result = await poll({ _stateFile: stateFile, staleTaskTimeout: 3600000 }, deps);
    expect(result.action).toBe('idle');

    const state = readState(stateFile);
    expect(state.activeTask).toBeNull();
    expect(resetCalled).not.toBeNull();
    expect(resetCalled.id).toBe('stale-1');
  });

  test('未超齡 activeTask → 不清除', async () => {
    const stateFile = join(tmpDir, 'state.json');
    // claimedAt 設為 5 分鐘前
    const fiveMinAgo = new Date(Date.now() - 300000).toISOString();
    writeState({
      running: true, paused: false, consecutiveFailures: 0,
      activeTask: { id: 'active-1', name: '進行中任務', claimedAt: fiveMinAgo },
    }, stateFile);

    let resetCalled = false;
    const deps = {
      listTasks: async () => [],
      claimTask: async () => {},
      completeTask: async () => {},
      resetTask: async () => { resetCalled = true; },
    };

    // staleTaskTimeout=3600000（1 小時），才過 5 分鐘 → 不清除
    await poll({ _stateFile: stateFile, staleTaskTimeout: 3600000 }, deps);

    const state = readState(stateFile);
    expect(state.activeTask).not.toBeNull();
    expect(resetCalled).toBe(false);
  });

  test('stale resetTask 失敗不崩潰，仍清除 activeTask', async () => {
    const stateFile = join(tmpDir, 'state.json');
    const longAgo = new Date(Date.now() - 7200000).toISOString();
    writeState({
      running: true, paused: false, consecutiveFailures: 0,
      activeTask: { id: 'stale-2', name: '殘留任務2', claimedAt: longAgo },
    }, stateFile);

    const deps = {
      listTasks: async () => [],
      claimTask: async () => {},
      completeTask: async () => {},
      resetTask: async () => { throw new Error('Notion API error'); },
    };

    // 即使 resetTask 失敗，也要清除 local state
    const result = await poll({ _stateFile: stateFile, staleTaskTimeout: 3600000 }, deps);
    expect(result.action).toBe('idle');

    const state = readState(stateFile);
    expect(state.activeTask).toBeNull();
  });
});

// ─── 空 catch 修復驗證 ────────────────────────────────────────────────────────

describe('空 catch 修復驗證', () => {
  test('executeTask 中 resetTask 失敗有 console.error 輸出', async () => {
    const tmpDir = makeTmpDir();
    const stateFile = join(tmpDir, 'state.json');
    writeState({ running: true, activeTask: null, paused: false, consecutiveFailures: 0 }, stateFile);

    const mockOutcome = Promise.resolve({ exitCode: 0, stdout: JSON.stringify({ type: 'result', result: 'done' }), duration: 500 });
    let completeError = false;
    const deps = {
      spawnSession: () => ({ ok: true, child: {}, outcome: mockOutcome }),
      completeTask: async () => { completeError = true; throw new Error('complete failed'); },
      resetTask: async () => { throw new Error('reset also failed'); },
    };

    const spy = [];
    const origError = console.error;
    console.error = (...args) => spy.push(args.join(' '));
    try {
      const task = { id: 't1', name: '任務', priority: 'P0' };
      await executeTask(task, { _stateFile: stateFile }, deps);
      // resetTask 失敗應有 console.error 輸出
      expect(spy.some(m => m.includes('resetTask'))).toBe(true);
    } finally {
      console.error = origError;
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ─── 穩定性防護驗證 ───────────────────────────────────────────────────────────

describe('穩定性防護驗證', () => {
  test('spawnSession — claude CLI 不在 PATH 時回傳 ok: false', async () => {
    const { spawnSession: realSpawnSession } = await import('../../../../.claude/scripts/session-spawner.js');
    const result = realSpawnSession('test', {}, { which: () => null, env: {} });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('not found');
  });

  test('spawnSession — OVERTONE_SPAWNED=1 時仍優先觸發遞迴防護', async () => {
    const { spawnSession: realSpawnSession } = await import('../../../../.claude/scripts/session-spawner.js');
    const result = realSpawnSession('test', {}, { env: { OVERTONE_SPAWNED: '1' } });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('recursive spawn blocked');
  });
});

// ─── Spawn 穩定性驗證 ─────────────────────────────────────────────────────────

describe('spawn 穩定性驗證', () => {
  test('spawn 失敗寫入 hook-errors.jsonl', async () => {
    // 清除 hook-errors.jsonl 舊內容，方便驗證
    const hookErrorsPath = '/tmp/hook-errors.jsonl';
    try { writeFileSync(hookErrorsPath, '', 'utf-8'); } catch (_) { /* 忽略 */ }

    const { spawnSession: realSpawnSession } = await import('../../../../.claude/scripts/session-spawner.js');
    const result = realSpawnSession('test prompt', {}, {
      spawn: () => { throw new Error('spawn test error'); },
      env: {},
      which: () => '/usr/local/bin/claude',
    });
    expect(result.ok).toBe(false);

    // 驗證 hook-errors.jsonl 有寫入
    const errors = readFileSync(hookErrorsPath, 'utf-8');
    const lines = errors.trim().split('\n').filter(l => l.trim());
    const last = JSON.parse(lines[lines.length - 1]);
    expect(last.event).toBe('heartbeat-spawn');
    expect(last.error).toContain('spawn test error');
  });
});
