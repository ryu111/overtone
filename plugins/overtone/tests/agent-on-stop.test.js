'use strict';
/**
 * agent-on-stop.test.js — SubagentStop hook 整合測試
 *
 * 測試完整的 on-stop.js 流程：
 *   stdin 輸入 → 辨識 stage → 更新 state → emit timeline → 輸出提示
 *
 * 策略：使用 Bun.spawn 啟動真實子進程，驗證端到端行為。
 */

const { test, expect, describe, beforeAll, afterAll, afterEach } = require('bun:test');
const { mkdirSync, rmSync } = require('fs');
const { join } = require('path');

// ── 路徑設定 ──

const HOOK_PATH = join(
  __dirname,
  '../hooks/scripts/agent/on-stop.js'
);

const STATE_LIB_PATH = join(__dirname, '../scripts/lib/state');
const TIMELINE_LIB_PATH = join(__dirname, '../scripts/lib/timeline');
const PATHS_LIB_PATH = join(__dirname, '../scripts/lib/paths');

const paths = require(PATHS_LIB_PATH);
const state = require(STATE_LIB_PATH);
const timeline = require(TIMELINE_LIB_PATH);
const { workflows } = require('../scripts/lib/registry');

// ── 輔助函式 ──

/**
 * 執行 on-stop.js hook，回傳解析後的 JSON 輸出
 * @param {object} input - hook 的 stdin 輸入
 * @param {string} sessionId - CLAUDE_SESSION_ID 環境變數
 * @returns {Promise<object>} 解析後的 JSON（{ result: string }）
 */
async function runHook(input, sessionId) {
  const envConfig = sessionId !== undefined
    ? { ...process.env, CLAUDE_SESSION_ID: sessionId }
    : (() => { const e = { ...process.env }; delete e.CLAUDE_SESSION_ID; return e; })();

  const proc = Bun.spawn(['node', HOOK_PATH], {
    stdin: Buffer.from(JSON.stringify(input)),
    env: envConfig,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const output = await new Response(proc.stdout).text();
  await proc.exited;
  return JSON.parse(output);
}

/**
 * 建立帶有特定 stage 為 active 狀態的 workflow
 * @param {string} sessionId
 * @param {string} workflowType
 * @param {string} activeStageKey - 要設為 active 的 stage key
 * @param {object} [overrides={}] - 額外要覆蓋的 state 欄位
 * @returns {object} 更新後的 state
 */
function setupWorkflowWithActiveStage(sessionId, workflowType, activeStageKey, overrides = {}) {
  const stageList = workflows[workflowType].stages;
  state.initState(sessionId, workflowType, stageList);

  return state.updateStateAtomic(sessionId, (s) => {
    // 將指定 stage 設為 active
    if (s.stages[activeStageKey]) {
      s.stages[activeStageKey].status = 'active';
    }
    // 套用額外覆蓋
    Object.assign(s, overrides);
    return s;
  });
}

// ── 各測試的獨立 sessionId ──

const SESSION_PREFIX = `test_on_stop_${Date.now()}`;
let testCounter = 0;

function newSessionId() {
  return `${SESSION_PREFIX}_${++testCounter}`;
}

// ── 清理所有測試 session ──

const createdSessions = [];

afterAll(() => {
  for (const sid of createdSessions) {
    const dir = paths.sessionDir(sid);
    rmSync(dir, { recursive: true, force: true });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 1：PASS — developer agent 完成
// ────────────────────────────────────────────────────────────────────────────

describe('場景 1：PASS — developer agent 完成', () => {
  test('DEV stage PASS → result 含 ✅，state 變 completed，timeline 有 agent:complete', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    setupWorkflowWithActiveStage(sessionId, 'quick', 'DEV');

    const result = await runHook(
      { subagent_name: 'developer', output: 'VERDICT: pass 開發完成' },
      sessionId
    );

    // result 包含 ✅
    expect(result.result).toContain('✅');

    // state 中 DEV stage 的 status 應變為 completed
    const updatedState = state.readState(sessionId);
    expect(updatedState.stages['DEV'].status).toBe('completed');

    // timeline 應有 agent:complete 事件
    const events = timeline.query(sessionId, { type: 'agent:complete' });
    expect(events.length).toBeGreaterThan(0);
    expect(events[events.length - 1].agent).toBe('developer');
    expect(events[events.length - 1].stage).toBe('DEV');
    expect(events[events.length - 1].result).toBe('pass');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 2：FAIL — tester agent 失敗
// ────────────────────────────────────────────────────────────────────────────

describe('場景 2：FAIL — tester agent 失敗', () => {
  test('TEST stage FAIL → result 含 ❌，failCount = 1，提示 DEBUGGER', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    // quick workflow: DEV → REVIEW → TEST
    // 將 DEV 和 REVIEW 標記為 completed，TEST 設為 active
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.updateStateAtomic(sessionId, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['REVIEW'].status = 'completed';
      s.stages['REVIEW'].result = 'pass';
      s.stages['TEST'].status = 'active';
      s.currentStage = 'TEST';
      return s;
    });

    const result = await runHook(
      { subagent_name: 'tester', output: '測試失敗 3 tests fail' },
      sessionId
    );

    // result 包含 ❌
    expect(result.result).toContain('❌');

    // state 中 failCount = 1
    const updatedState = state.readState(sessionId);
    expect(updatedState.failCount).toBe(1);

    // result 包含 DEBUGGER 提示
    expect(result.result.toUpperCase()).toContain('DEBUGGER');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 3：REJECT — code-reviewer 拒絕
// ────────────────────────────────────────────────────────────────────────────

describe('場景 3：REJECT — code-reviewer 拒絕', () => {
  test('REVIEW stage REJECT → result 含 🔙，rejectCount = 1', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    // quick workflow: DEV → REVIEW → TEST
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.updateStateAtomic(sessionId, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['REVIEW'].status = 'active';
      s.currentStage = 'REVIEW';
      return s;
    });

    const result = await runHook(
      { subagent_name: 'code-reviewer', output: '拒絕，程式碼有安全問題 reject' },
      sessionId
    );

    // result 包含 🔙
    expect(result.result).toContain('🔙');

    // state 中 rejectCount = 1
    const updatedState = state.readState(sessionId);
    expect(updatedState.rejectCount).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 4：FAIL 達到上限（failCount >= 3）
// ────────────────────────────────────────────────────────────────────────────

describe('場景 4：FAIL 達到上限', () => {
  test('failCount 達到 3 → result 含 ⛔ 和人工介入提示', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    // quick workflow，TEST 設為 active，failCount 預設為 2（再 +1 就達到上限 3）
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.updateStateAtomic(sessionId, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['REVIEW'].status = 'completed';
      s.stages['REVIEW'].result = 'pass';
      s.stages['TEST'].status = 'active';
      s.currentStage = 'TEST';
      s.failCount = 2; // 再失敗一次 → 3 次，達到上限
      return s;
    });

    const result = await runHook(
      { subagent_name: 'tester', output: '3 tests failed' },
      sessionId
    );

    // result 包含 ⛔
    expect(result.result).toContain('⛔');

    // result 包含人工介入
    expect(result.result).toContain('人工介入');

    // state failCount 應為 3
    const updatedState = state.readState(sessionId);
    expect(updatedState.failCount).toBe(3);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 5：無 sessionId 跳過
// ────────────────────────────────────────────────────────────────────────────

describe('場景 5：無 sessionId 跳過', () => {
  test('無 CLAUDE_SESSION_ID → result 為空字串', async () => {
    // 不傳入 sessionId（傳 undefined → 刪除環境變數）
    const result = await runHook(
      { subagent_name: 'developer', output: '任意輸出' },
      undefined
    );

    expect(result.result).toBe('');
  });

  test('CLAUDE_SESSION_ID 為空字串 → result 為空字串', async () => {
    const result = await runHook(
      { subagent_name: 'developer', output: '任意輸出' },
      ''
    );

    expect(result.result).toBe('');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 6：非 Overtone agent 跳過
// ────────────────────────────────────────────────────────────────────────────

describe('場景 6：非 Overtone agent 跳過', () => {
  test('unknown-agent → result 為空字串', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);

    const result = await runHook(
      { subagent_name: 'unknown-agent', output: '未知的 agent 輸出' },
      sessionId
    );

    expect(result.result).toBe('');
  });

  test('subagent_name 為空 → result 為空字串', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);

    const result = await runHook(
      { subagent_name: '', output: '任意輸出' },
      sessionId
    );

    expect(result.result).toBe('');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 7：PASS — 所有 stages 完成（最後一個 stage）
// ────────────────────────────────────────────────────────────────────────────

describe('場景 7：PASS — 所有 stages 完成', () => {
  test('最後一個 stage 完成 → result 含 🎉 所有階段已完成 + 委派 planner 建議', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    // single workflow：只有 DEV 一個 stage
    state.initState(sessionId, 'single', ['DEV']);
    state.updateStateAtomic(sessionId, (s) => {
      s.stages['DEV'].status = 'active';
      return s;
    });

    const result = await runHook(
      { subagent_name: 'developer', output: 'VERDICT: pass 開發完成' },
      sessionId
    );

    // result 包含 🎉 所有階段已完成
    expect(result.result).toContain('🎉');
    expect(result.result).toContain('所有階段已完成');

    // result 包含委派 planner 的建議
    expect(result.result).toContain('planner');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 8：並行收斂偵測
// ────────────────────────────────────────────────────────────────────────────

describe('場景 8：並行收斂偵測', () => {
  test('REVIEW 和 TEST 都 active，REVIEW 先完成 → result 不含全部完成', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    // quick workflow: DEV → REVIEW → TEST
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.updateStateAtomic(sessionId, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      // 兩個都設為 active（模擬並行）
      s.stages['REVIEW'].status = 'active';
      s.stages['TEST'].status = 'active';
      s.currentStage = 'REVIEW';
      return s;
    });

    // REVIEW 完成
    const result = await runHook(
      { subagent_name: 'code-reviewer', output: 'code looks good, no issues found' },
      sessionId
    );

    // 還有 TEST 未完成，不應觸發全部完成
    expect(result.result).not.toContain('🎉');
    expect(result.result).not.toContain('所有階段已完成');

    // REVIEW 完成應有 ✅
    expect(result.result).toContain('✅');
  });

  test('REVIEW 和 TEST 都完成 → result 含並行收斂提示', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    // quick workflow: DEV → REVIEW → TEST
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.updateStateAtomic(sessionId, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['REVIEW'].status = 'completed';
      s.stages['REVIEW'].result = 'pass';
      // TEST 設為 active，是最後一個
      s.stages['TEST'].status = 'active';
      s.currentStage = 'TEST';
      return s;
    });

    // TEST 完成 → 觸發並行群組收斂（REVIEW + TEST 都 completed）
    const result = await runHook(
      { subagent_name: 'tester', output: 'all tests passed successfully' },
      sessionId
    );

    // 所有 stage 都完成了
    expect(result.result).toContain('✅');

    // 因為 REVIEW 已在本次前就 completed，TEST 完成後全部都 completed
    // 應有並行收斂提示或全部完成提示
    const updatedState = state.readState(sessionId);
    const allDone = Object.values(updatedState.stages).every(s => s.status === 'completed');
    expect(allDone).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 9：timeline 驗證 — stage:complete 事件
// ────────────────────────────────────────────────────────────────────────────

describe('場景 9：timeline 事件驗證', () => {
  test('hook 執行後 timeline 應有 stage:complete 事件', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.updateStateAtomic(sessionId, (s) => {
      s.stages['DEV'].status = 'active';
      return s;
    });

    await runHook(
      { subagent_name: 'developer', output: 'VERDICT: pass 完成' },
      sessionId
    );

    const stageEvents = timeline.query(sessionId, { type: 'stage:complete' });
    expect(stageEvents.length).toBeGreaterThan(0);
    expect(stageEvents[stageEvents.length - 1].stage).toBe('DEV');
  });

  test('FAIL 時 timeline 應有 stage:retry 事件', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.updateStateAtomic(sessionId, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['REVIEW'].status = 'completed';
      s.stages['REVIEW'].result = 'pass';
      s.stages['TEST'].status = 'active';
      s.currentStage = 'TEST';
      return s;
    });

    await runHook(
      { subagent_name: 'tester', output: '5 tests failed with errors' },
      sessionId
    );

    const retryEvents = timeline.query(sessionId, { type: 'stage:retry' });
    expect(retryEvents.length).toBeGreaterThan(0);
  });

  test('FAIL 達上限時 timeline 應有 error:fatal 事件', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.updateStateAtomic(sessionId, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['REVIEW'].status = 'completed';
      s.stages['REVIEW'].result = 'pass';
      s.stages['TEST'].status = 'active';
      s.currentStage = 'TEST';
      s.failCount = 2; // 再一次失敗就達上限
      return s;
    });

    await runHook(
      { subagent_name: 'tester', output: 'tests failed critical failure' },
      sessionId
    );

    const fatalEvents = timeline.query(sessionId, { type: 'error:fatal' });
    expect(fatalEvents.length).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 10：REJECT 達到上限
// ────────────────────────────────────────────────────────────────────────────

describe('場景 10：REJECT 達到上限', () => {
  test('rejectCount 達到 3 → result 含 ⛔ 和人工介入提示', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.updateStateAtomic(sessionId, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['REVIEW'].status = 'active';
      s.currentStage = 'REVIEW';
      s.rejectCount = 2; // 再拒絕一次 → 3 次，達到上限
      return s;
    });

    const result = await runHook(
      { subagent_name: 'code-reviewer', output: 'I must reject this, multiple security issues' },
      sessionId
    );

    // result 包含 ⛔
    expect(result.result).toContain('⛔');

    // result 包含人工介入
    expect(result.result).toContain('人工介入');
  });
});
