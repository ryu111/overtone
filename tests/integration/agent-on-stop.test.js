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
const { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } = require('fs');
const { join } = require('path');
const { HOOKS_DIR, SCRIPTS_LIB } = require('../helpers/paths');

// ── 路徑設定 ──

const HOOK_PATH = join(HOOKS_DIR, 'agent', 'on-stop.js');

const paths = require(join(SCRIPTS_LIB, 'paths'));
const state = require(join(SCRIPTS_LIB, 'state'));
const timeline = require(join(SCRIPTS_LIB, 'timeline'));
const { workflows } = require(join(SCRIPTS_LIB, 'registry'));
const DEFAULT_CWD = process.cwd();

// ── 輔助函式 ──

/**
 * 執行 on-stop.js hook，回傳解析後的 JSON 輸出
 * @param {object} input - hook 的 stdin 輸入
 * @param {string} sessionId - CLAUDE_SESSION_ID 環境變數
 * @returns {Promise<object>} 解析後的 JSON（{ result: string }）
 */
async function runHook(input, sessionId) {
  const baseEnv = { ...process.env, NOVA_TEST: '1' }; // 防止 failure-tracker 寫入真實 failures.jsonl
  const envConfig = sessionId !== undefined
    ? { ...baseEnv, CLAUDE_SESSION_ID: sessionId }
    : (() => { const e = { ...baseEnv }; delete e.CLAUDE_SESSION_ID; return e; })();

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
function setupWorkflowWithActiveStage(sessionId, workflowType, activeStageKey, overrides = {}, projectRoot = DEFAULT_CWD) {
  const stageList = workflows[workflowType].stages;
  state.initState(projectRoot, sessionId, workflowType, stageList);

  return state.updateStateAtomic(projectRoot, sessionId, null, (s) => {
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
    const dir = paths.sessionDir(DEFAULT_CWD, sid);
    rmSync(dir, { recursive: true, force: true });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 1：PASS — developer agent 完成
// ────────────────────────────────────────────────────────────────────────────

describe('場景 1：PASS — developer agent 完成', () => {
  test('DEV stage PASS → state 變 completed，timeline 有 agent:complete', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(DEFAULT_CWD, sessionId), { recursive: true });
    setupWorkflowWithActiveStage(sessionId, 'quick', 'DEV');

    const result = await runHook(
      { agent_type: 'developer', last_assistant_message: 'VERDICT: pass 開發完成' },
      sessionId
    );

    // state 中 DEV stage 的 status 應變為 completed
    const updatedState = state.readState(DEFAULT_CWD, sessionId);
    expect(updatedState.stages['DEV'].status).toBe('completed');

    // timeline 應有 agent:complete 事件
    const events = timeline.query(DEFAULT_CWD, sessionId, null, { type: 'agent:complete' });
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
  test('TEST stage FAIL → failCount = 1，state 記錄失敗', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(DEFAULT_CWD, sessionId), { recursive: true });
    // quick workflow: DEV → REVIEW → TEST
    // 將 DEV 和 REVIEW 標記為 completed，TEST 設為 active
    state.initState(DEFAULT_CWD, sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.updateStateAtomic(DEFAULT_CWD, sessionId, null, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['REVIEW'].status = 'completed';
      s.stages['REVIEW'].result = 'pass';
      s.stages['TEST'].status = 'active';
      s.currentStage = 'TEST';
      return s;
    });

    const result = await runHook(
      { agent_type: 'tester', last_assistant_message: '測試失敗 3 tests fail' },
      sessionId
    );

    // state 中 failCount = 1
    const updatedState = state.readState(DEFAULT_CWD, sessionId);
    expect(updatedState.failCount).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 3：REJECT — code-reviewer 拒絕
// ────────────────────────────────────────────────────────────────────────────

describe('場景 3：REJECT — code-reviewer 拒絕', () => {
  test('REVIEW stage REJECT → rejectCount = 1，state 記錄拒絕', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(DEFAULT_CWD, sessionId), { recursive: true });
    // quick workflow: DEV → REVIEW → TEST
    state.initState(DEFAULT_CWD, sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.updateStateAtomic(DEFAULT_CWD, sessionId, null, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['REVIEW'].status = 'active';
      s.currentStage = 'REVIEW';
      return s;
    });

    const result = await runHook(
      { agent_type: 'code-reviewer', last_assistant_message: '拒絕，程式碼有安全問題 reject' },
      sessionId
    );

    // state 中 rejectCount = 1
    const updatedState = state.readState(DEFAULT_CWD, sessionId);
    expect(updatedState.rejectCount).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 4：FAIL 達到上限（failCount >= 3）
// ────────────────────────────────────────────────────────────────────────────

describe('場景 4：FAIL 達到上限', () => {
  test('failCount 達到 3 → state 標記上限，hook 正常完成', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(DEFAULT_CWD, sessionId), { recursive: true });
    // quick workflow，TEST 設為 active，failCount 預設為 2（再 +1 就達到上限 3）
    state.initState(DEFAULT_CWD, sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.updateStateAtomic(DEFAULT_CWD, sessionId, null, (s) => {
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
      { agent_type: 'tester', last_assistant_message: '3 tests failed' },
      sessionId
    );

    // state failCount 應為 3
    const updatedState = state.readState(DEFAULT_CWD, sessionId);
    expect(updatedState.failCount).toBe(3);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 5：無 sessionId 跳過
// ────────────────────────────────────────────────────────────────────────────

describe('場景 5：無 sessionId 跳過', () => {
  test('無 CLAUDE_SESSION_ID → hook 正常完成（靜默放行）', async () => {
    // 不傳入 sessionId（傳 undefined → 刪除環境變數）
    const result = await runHook(
      { agent_type: 'developer', last_assistant_message: '任意輸出' },
      undefined
    );

    expect(result).toEqual({});
  });

  test('CLAUDE_SESSION_ID 為空字串 → hook 正常完成（靜默放行）', async () => {
    const result = await runHook(
      { agent_type: 'developer', last_assistant_message: '任意輸出' },
      ''
    );

    expect(result).toEqual({});
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 6：非 Overtone agent 跳過
// ────────────────────────────────────────────────────────────────────────────

describe('場景 6：非 Overtone agent 跳過', () => {
  test('unknown-agent → hook 正常完成（靜默放行）', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(DEFAULT_CWD, sessionId), { recursive: true });
    state.initState(DEFAULT_CWD, sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);

    const result = await runHook(
      { agent_type: 'unknown-agent', last_assistant_message: '未知的 agent 輸出' },
      sessionId
    );

    expect(result).toEqual({});
  });

  test('agent_type 為空 → hook 正常完成（靜默放行）', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(DEFAULT_CWD, sessionId), { recursive: true });
    state.initState(DEFAULT_CWD, sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);

    const result = await runHook(
      { agent_type: '', last_assistant_message: '任意輸出' },
      sessionId
    );

    expect(result).toEqual({});
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 7：PASS — 所有 stages 完成（最後一個 stage）
// ────────────────────────────────────────────────────────────────────────────

describe('場景 7：PASS — 所有 stages 完成', () => {
  test('最後一個 stage 完成 → state 全部標記 completed', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(DEFAULT_CWD, sessionId), { recursive: true });
    // single workflow：只有 DEV 一個 stage
    state.initState(DEFAULT_CWD, sessionId, 'single', ['DEV']);
    state.updateStateAtomic(DEFAULT_CWD, sessionId, null, (s) => {
      s.stages['DEV'].status = 'active';
      return s;
    });

    const result = await runHook(
      { agent_type: 'developer', last_assistant_message: 'VERDICT: pass 開發完成' },
      sessionId
    );

    // state 中 DEV 應標記為 completed
    const updatedState = state.readState(DEFAULT_CWD, sessionId);
    expect(updatedState.stages['DEV'].status).toBe('completed');
    expect(result).toEqual({});
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 8：並行收斂偵測
// ────────────────────────────────────────────────────────────────────────────

describe('場景 8：並行收斂偵測', () => {
  test('REVIEW 和 TEST 都 active，REVIEW 先完成 → TEST 仍為 active（未全部完成）', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(DEFAULT_CWD, sessionId), { recursive: true });
    // quick workflow: DEV → REVIEW → TEST
    state.initState(DEFAULT_CWD, sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.updateStateAtomic(DEFAULT_CWD, sessionId, null, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      // 兩個都設為 active（模擬並行）
      s.stages['REVIEW'].status = 'active';
      s.stages['TEST'].status = 'active';
      s.currentStage = 'REVIEW';
      // 加入 activeAgents entries，避免 enforceInvariants 把 active 改回 pending
      s.activeAgents['reviewer:1'] = { agentName: 'code-reviewer', stage: 'REVIEW', startedAt: new Date().toISOString() };
      s.activeAgents['tester:1'] = { agentName: 'tester', stage: 'TEST', startedAt: new Date().toISOString() };
      return s;
    });

    // REVIEW 完成
    const result = await runHook(
      { agent_type: 'code-reviewer', last_assistant_message: 'code looks good, no issues found' },
      sessionId
    );

    // 還有 TEST 未完成，REVIEW 應標記為 completed，TEST 仍為 active
    const updatedState = state.readState(DEFAULT_CWD, sessionId);
    expect(updatedState.stages['REVIEW'].status).toBe('completed');
    expect(updatedState.stages['TEST'].status).toBe('active');
  });

  test('REVIEW 和 TEST 都完成 → 所有 stage 標記為 completed（並行收斂）', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(DEFAULT_CWD, sessionId), { recursive: true });
    // quick workflow: DEV → REVIEW → TEST
    state.initState(DEFAULT_CWD, sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.updateStateAtomic(DEFAULT_CWD, sessionId, null, (s) => {
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
      { agent_type: 'tester', last_assistant_message: 'all tests passed successfully' },
      sessionId
    );

    // 因為 REVIEW 已在本次前就 completed，TEST 完成後全部都 completed
    // 應有並行收斂提示或全部完成提示
    const updatedState = state.readState(DEFAULT_CWD, sessionId);
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

    mkdirSync(paths.sessionDir(DEFAULT_CWD, sessionId), { recursive: true });
    state.initState(DEFAULT_CWD, sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.updateStateAtomic(DEFAULT_CWD, sessionId, null, (s) => {
      s.stages['DEV'].status = 'active';
      return s;
    });

    await runHook(
      { agent_type: 'developer', last_assistant_message: 'VERDICT: pass 完成' },
      sessionId
    );

    const stageEvents = timeline.query(DEFAULT_CWD, sessionId, null, { type: 'stage:complete' });
    expect(stageEvents.length).toBeGreaterThan(0);
    expect(stageEvents[stageEvents.length - 1].stage).toBe('DEV');
  });

  test('FAIL 時 timeline 應有 stage:retry 事件', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(DEFAULT_CWD, sessionId), { recursive: true });
    state.initState(DEFAULT_CWD, sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.updateStateAtomic(DEFAULT_CWD, sessionId, null, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['REVIEW'].status = 'completed';
      s.stages['REVIEW'].result = 'pass';
      s.stages['TEST'].status = 'active';
      s.currentStage = 'TEST';
      return s;
    });

    await runHook(
      { agent_type: 'tester', last_assistant_message: '5 tests failed with errors' },
      sessionId
    );

    const retryEvents = timeline.query(DEFAULT_CWD, sessionId, null, { type: 'stage:retry' });
    expect(retryEvents.length).toBeGreaterThan(0);
  });

  test('FAIL 達上限時 timeline 應有 error:fatal 事件', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(DEFAULT_CWD, sessionId), { recursive: true });
    state.initState(DEFAULT_CWD, sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.updateStateAtomic(DEFAULT_CWD, sessionId, null, (s) => {
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
      { agent_type: 'tester', last_assistant_message: 'tests failed critical failure' },
      sessionId
    );

    const fatalEvents = timeline.query(DEFAULT_CWD, sessionId, null, { type: 'error:fatal' });
    expect(fatalEvents.length).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 10：REJECT 達到上限
// ────────────────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────────────────
// 場景 15：featureName auto-sync — workflow.json 無 featureName 時自動偵測
// ────────────────────────────────────────────────────────────────────────────

describe('場景 15：featureName auto-sync', () => {
  const os = require('os');
  const path = require('path');
  const specs = require(join(SCRIPTS_LIB, 'specs'));

  test('workflow.json 無 featureName + specs 有 active feature → auto-sync 並勾選 checkbox', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    // 建立臨時 project root，有 in-progress feature
    const tmpProject = mkdtempSync(join(os.tmpdir(), 'overtone-autosync-'));
    const featurePath = specs.initFeatureDir(tmpProject, 'my-feature', 'quick');
    const tasksPath = join(featurePath, 'tasks.md');

    // 確認 tasks.md 有 DEV checkbox（在 ## Stages 區塊）
    const initialContent = readFileSync(tasksPath, 'utf8');
    expect(initialContent).toContain('- [ ] DEV');

    // 建立 workflow state（不帶 featureName）— handler 用 cwd: tmpProject 解析 projectRoot
    mkdirSync(paths.sessionDir(tmpProject, sessionId), { recursive: true });
    state.initState(tmpProject, sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.updateStateAtomic(tmpProject, sessionId, null, (s) => {
      s.stages['DEV'].status = 'active';
      s.featureName = null;
      return s;
    });

    // 執行 hook（帶 cwd 指向臨時 project）
    const proc = Bun.spawn(['node', HOOK_PATH], {
      stdin: Buffer.from(JSON.stringify({
        agent_type: 'developer',
        last_assistant_message: 'VERDICT: pass 開發完成',
        cwd: tmpProject,
      })),
      env: { ...process.env, CLAUDE_SESSION_ID: sessionId, NOVA_TEST: '1' },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const output = await new Response(proc.stdout).text();
    await proc.exited;
    const result = JSON.parse(output);

    // tasks.md 中 DEV checkbox 應被自動勾選
    const updatedContent = readFileSync(tasksPath, 'utf8');
    expect(updatedContent).toContain('- [x] DEV');

    // state 中 featureName 應被同步（per-project 路徑）
    const updatedState = state.readState(tmpProject, sessionId);
    expect(updatedState.featureName).toBe('my-feature');

    // 清理臨時目錄
    rmSync(tmpProject, { recursive: true, force: true });
  });

  test('workflow.json 無 featureName + specs 無 active feature → 靜默忽略，不拋例外', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    // 使用不含 specs 目錄的 project root
    const tmpProject = mkdtempSync(join(os.tmpdir(), 'overtone-nofeature-'));

    // handler 用 cwd: tmpProject 解析 projectRoot
    mkdirSync(paths.sessionDir(tmpProject, sessionId), { recursive: true });
    state.initState(tmpProject, sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.updateStateAtomic(tmpProject, sessionId, null, (s) => {
      s.stages['DEV'].status = 'active';
      s.featureName = null;
      return s;
    });

    const proc = Bun.spawn(['node', HOOK_PATH], {
      stdin: Buffer.from(JSON.stringify({
        agent_type: 'developer',
        last_assistant_message: 'VERDICT: pass 開發完成',
        cwd: tmpProject,
      })),
      env: { ...process.env, CLAUDE_SESSION_ID: sessionId, NOVA_TEST: '1' },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const output = await new Response(proc.stdout).text();
    await proc.exited;
    const result = JSON.parse(output);

    // state featureName 維持 null
    const updatedState = state.readState(tmpProject, sessionId);
    expect(updatedState.featureName).toBeNull();

    rmSync(tmpProject, { recursive: true, force: true });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 11：RETRO PASS / ISSUES
// ────────────────────────────────────────────────────────────────────────────

describe('場景 11：RETRO — 迭代回顧', () => {
  test('RETRO PASS → state 標記完成，retroCount 未遞增', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(DEFAULT_CWD, sessionId), { recursive: true });
    // quick workflow 含 RETRO stage：DEV → REVIEW → TEST → RETRO
    state.initState(DEFAULT_CWD, sessionId, 'quick', ['DEV', 'REVIEW', 'TEST', 'RETRO']);
    state.updateStateAtomic(DEFAULT_CWD, sessionId, null, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['REVIEW'].status = 'completed';
      s.stages['REVIEW'].result = 'pass';
      s.stages['TEST'].status = 'completed';
      s.stages['TEST'].result = 'pass';
      s.stages['RETRO'].status = 'active';
      s.currentStage = 'RETRO';
      return s;
    });

    const result = await runHook(
      { agent_type: 'retrospective', last_assistant_message: '回顧完成，無重要問題。PASS' },
      sessionId
    );

    // retroCount 不應遞增（PASS 不計）
    const updatedState = state.readState(DEFAULT_CWD, sessionId);
    expect(updatedState.retroCount || 0).toBe(0);
  });

  test('RETRO ISSUES → retroCount 遞增為 1，state 記錄 issues', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(DEFAULT_CWD, sessionId), { recursive: true });
    state.initState(DEFAULT_CWD, sessionId, 'quick', ['DEV', 'REVIEW', 'TEST', 'RETRO']);
    state.updateStateAtomic(DEFAULT_CWD, sessionId, null, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['REVIEW'].status = 'completed';
      s.stages['REVIEW'].result = 'pass';
      s.stages['TEST'].status = 'completed';
      s.stages['TEST'].result = 'pass';
      s.stages['RETRO'].status = 'active';
      s.currentStage = 'RETRO';
      return s;
    });

    const result = await runHook(
      { agent_type: 'retrospective', last_assistant_message: '發現 2 個改善建議，建議下一輪優化架構' },
      sessionId
    );

    // retroCount 應遞增為 1
    const updatedState = state.readState(DEFAULT_CWD, sessionId);
    expect(updatedState.retroCount).toBe(1);
  });

  test('RETRO ISSUES 達到上限（retroCount = 3）→ state 標記上限，hook 正常完成', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(DEFAULT_CWD, sessionId), { recursive: true });
    state.initState(DEFAULT_CWD, sessionId, 'quick', ['DEV', 'REVIEW', 'TEST', 'RETRO']);
    state.updateStateAtomic(DEFAULT_CWD, sessionId, null, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['REVIEW'].status = 'completed';
      s.stages['REVIEW'].result = 'pass';
      s.stages['TEST'].status = 'completed';
      s.stages['TEST'].result = 'pass';
      s.stages['RETRO'].status = 'active';
      s.currentStage = 'RETRO';
      s.retroCount = 2; // 再一次就達到上限 3
      return s;
    });

    const result = await runHook(
      { agent_type: 'retrospective', last_assistant_message: '仍有 issues 需要改善建議' },
      sessionId
    );

    // retroCount 應為 3
    const updatedState = state.readState(DEFAULT_CWD, sessionId);
    expect(updatedState.retroCount).toBe(3);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 10：REJECT 達到上限
// ────────────────────────────────────────────────────────────────────────────

describe('場景 10：REJECT 達到上限', () => {
  test('rejectCount 達到 3 → state 標記上限，hook 正常完成', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(DEFAULT_CWD, sessionId), { recursive: true });
    state.initState(DEFAULT_CWD, sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.updateStateAtomic(DEFAULT_CWD, sessionId, null, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['REVIEW'].status = 'active';
      s.currentStage = 'REVIEW';
      s.rejectCount = 2; // 再拒絕一次 → 3 次，達到上限
      return s;
    });

    const result = await runHook(
      { agent_type: 'code-reviewer', last_assistant_message: 'I must reject this, multiple security issues' },
      sessionId
    );

    // state rejectCount 應為 3
    const updatedState = state.readState(DEFAULT_CWD, sessionId);
    expect(updatedState.rejectCount).toBe(3);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 12：D2 修復 — 並行 agent 未全部完成時不推進 hint
// ────────────────────────────────────────────────────────────────────────────

describe('場景 12：D2 — 並行 agent 未完成時 hint 等待', () => {
  test('REVIEW 完成但 TEST 仍 active（activeAgents 有 tester）→ REVIEW 標記 completed，TEST 仍 active', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(DEFAULT_CWD, sessionId), { recursive: true });
    // quick workflow: DEV → REVIEW → TEST
    state.initState(DEFAULT_CWD, sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.updateStateAtomic(DEFAULT_CWD, sessionId, null, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      // 兩個都 active（模擬並行）
      s.stages['REVIEW'].status = 'active';
      s.stages['TEST'].status = 'active';
      s.currentStage = 'REVIEW';
      // tester 仍在執行中
      s.activeAgents['tester'] = { stage: 'TEST', startedAt: new Date().toISOString() };
      return s;
    });

    // REVIEW 完成
    const result = await runHook(
      { agent_type: 'code-reviewer', last_assistant_message: 'LGTM, code looks good, approved' },
      sessionId
    );

    // 因 tester 仍 active，REVIEW 應標記 completed，TEST 維持 active
    const updatedState = state.readState(DEFAULT_CWD, sessionId);
    expect(updatedState.stages['REVIEW'].status).toBe('completed');
    expect(updatedState.stages['TEST'].status).toBe('active');
  });

  test('REVIEW 完成且 activeAgents 為空 → REVIEW 標記 completed，hook 正常完成', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(DEFAULT_CWD, sessionId), { recursive: true });
    // quick workflow: DEV → REVIEW → TEST → RETRO
    state.initState(DEFAULT_CWD, sessionId, 'quick', ['DEV', 'REVIEW', 'TEST', 'RETRO']);
    state.updateStateAtomic(DEFAULT_CWD, sessionId, null, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['REVIEW'].status = 'active';
      s.currentStage = 'REVIEW';
      // activeAgents 為空（無其他並行 agent）
      s.activeAgents = {};
      return s;
    });

    // REVIEW 完成
    const result = await runHook(
      { agent_type: 'code-reviewer', last_assistant_message: 'LGTM no issues' },
      sessionId
    );

    // REVIEW 應標記 completed
    const updatedState = state.readState(DEFAULT_CWD, sessionId);
    expect(updatedState.stages['REVIEW'].status).toBe('completed');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 13：D3 修復 — 雙重失敗協調提示
// ────────────────────────────────────────────────────────────────────────────

describe('場景 13：D3 — 雙重失敗協調提示', () => {
  test('TEST FAIL 且 rejectCount > 0 → failCount 遞增，state 記錄雙重失敗', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(DEFAULT_CWD, sessionId), { recursive: true });
    state.initState(DEFAULT_CWD, sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.updateStateAtomic(DEFAULT_CWD, sessionId, null, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['REVIEW'].status = 'completed';
      s.stages['REVIEW'].result = 'reject'; // REVIEW 已 reject
      s.stages['TEST'].status = 'active';
      s.currentStage = 'TEST';
      s.rejectCount = 1; // 已有 REVIEW REJECT
      return s;
    });

    // TEST 失敗
    const result = await runHook(
      { agent_type: 'tester', last_assistant_message: '3 tests failed with errors' },
      sessionId
    );

    // failCount 遞增（雙重失敗：rejectCount=1 + testFail=1）
    const updatedState = state.readState(DEFAULT_CWD, sessionId);
    expect(updatedState.failCount).toBe(1);
    expect(updatedState.rejectCount).toBe(1);
  });

  test('REVIEW REJECT 且 failCount > 0 → rejectCount 遞增，state 記錄雙重失敗', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(DEFAULT_CWD, sessionId), { recursive: true });
    state.initState(DEFAULT_CWD, sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.updateStateAtomic(DEFAULT_CWD, sessionId, null, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['REVIEW'].status = 'active';
      s.stages['TEST'].status = 'completed';
      s.stages['TEST'].result = 'fail'; // TEST 已 fail
      s.currentStage = 'REVIEW';
      s.failCount = 1; // 已有 TEST FAIL
      return s;
    });

    // REVIEW 拒絕
    const result = await runHook(
      { agent_type: 'code-reviewer', last_assistant_message: 'I reject this, multiple issues' },
      sessionId
    );

    // rejectCount 遞增（雙重失敗：failCount=1 + rejectFail=1）
    const updatedState = state.readState(DEFAULT_CWD, sessionId);
    expect(updatedState.rejectCount).toBe(1);
    expect(updatedState.failCount).toBe(1);
  });

  test('單一 TEST FAIL（rejectCount = 0）→ failCount 遞增，state 正常記錄', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(DEFAULT_CWD, sessionId), { recursive: true });
    state.initState(DEFAULT_CWD, sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.updateStateAtomic(DEFAULT_CWD, sessionId, null, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['REVIEW'].status = 'completed';
      s.stages['REVIEW'].result = 'pass';
      s.stages['TEST'].status = 'active';
      s.currentStage = 'TEST';
      s.rejectCount = 0; // 無 REVIEW REJECT
      return s;
    });

    const result = await runHook(
      { agent_type: 'tester', last_assistant_message: '2 tests failed' },
      sessionId
    );

    // failCount 遞增（無雙重失敗）
    const updatedState = state.readState(DEFAULT_CWD, sessionId);
    expect(updatedState.failCount).toBe(1);
    expect(updatedState.rejectCount).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 14：agent_performance Instinct 觀察驗證
// ────────────────────────────────────────────────────────────────────────────

describe('場景 14：agent_performance Instinct 觀察', () => {
  const instinct = require(join(SCRIPTS_LIB, 'knowledge/instinct'));

  test('developer PASS → observations.jsonl 新增 agent_performance 記錄', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(DEFAULT_CWD, sessionId), { recursive: true });
    setupWorkflowWithActiveStage(sessionId, 'single', 'DEV');

    await runHook(
      { agent_type: 'developer', last_assistant_message: 'VERDICT: pass 開發完成' },
      sessionId
    );

    // 查詢 agent_performance 觀察
    const observations = instinct.query(DEFAULT_CWD, sessionId, { type: 'agent_performance' });
    expect(observations.length).toBeGreaterThan(0);

    const devObs = observations.find(o => o.tag === 'agent-developer');
    expect(devObs).toBeDefined();
    expect(devObs.type).toBe('agent_performance');
    expect(devObs.trigger).toContain('developer');
    expect(devObs.trigger).toContain('pass');
    expect(devObs.trigger).toContain('DEV');
  });

  test('tester FAIL → 觀察 tag 為 agent-tester，trigger 含 fail', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(DEFAULT_CWD, sessionId), { recursive: true });
    state.initState(DEFAULT_CWD, sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.updateStateAtomic(DEFAULT_CWD, sessionId, null, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['REVIEW'].status = 'completed';
      s.stages['REVIEW'].result = 'pass';
      s.stages['TEST'].status = 'active';
      s.currentStage = 'TEST';
      return s;
    });

    await runHook(
      { agent_type: 'tester', last_assistant_message: '測試失敗 3 tests fail' },
      sessionId
    );

    const observations = instinct.query(DEFAULT_CWD, sessionId, { type: 'agent_performance' });
    const testerObs = observations.find(o => o.tag === 'agent-tester');
    expect(testerObs).toBeDefined();
    expect(testerObs.trigger).toContain('tester');
    expect(testerObs.trigger).toContain('fail');
  });

  test('code-reviewer REJECT → 觀察 tag 為 agent-code-reviewer，trigger 含 reject', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(DEFAULT_CWD, sessionId), { recursive: true });
    state.initState(DEFAULT_CWD, sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.updateStateAtomic(DEFAULT_CWD, sessionId, null, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['REVIEW'].status = 'active';
      s.currentStage = 'REVIEW';
      return s;
    });

    await runHook(
      { agent_type: 'code-reviewer', last_assistant_message: '拒絕，程式碼有安全問題 reject' },
      sessionId
    );

    const observations = instinct.query(DEFAULT_CWD, sessionId, { type: 'agent_performance' });
    const reviewerObs = observations.find(o => o.tag === 'agent-code-reviewer');
    expect(reviewerObs).toBeDefined();
    expect(reviewerObs.trigger).toContain('code-reviewer');
    expect(reviewerObs.trigger).toContain('reject');
  });

  test('同一 agent 多次完成後信心累積（confirm 機制）', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(DEFAULT_CWD, sessionId), { recursive: true });

    // 第一次完成
    setupWorkflowWithActiveStage(sessionId, 'single', 'DEV');
    await runHook(
      { agent_type: 'developer', last_assistant_message: 'VERDICT: pass 第一次完成' },
      sessionId
    );

    const first = instinct.query(DEFAULT_CWD, sessionId, { type: 'agent_performance', tag: 'agent-developer' });
    expect(first.length).toBeGreaterThan(0);
    expect(first[0].count).toBe(1);
    expect(first[0].confidence).toBe(0.3);

    // 第二次完成（需要重設 stage 為 active，同時清除 completedAt 以通過不變量守衛）
    state.updateStateAtomic(DEFAULT_CWD, sessionId, null, (s) => {
      s.stages['DEV'].status = 'active';
      delete s.stages['DEV'].completedAt;
      delete s.stages['DEV'].result;
      return s;
    });
    await runHook(
      { agent_type: 'developer', last_assistant_message: 'VERDICT: pass 第二次完成' },
      sessionId
    );

    const second = instinct.query(DEFAULT_CWD, sessionId, { type: 'agent_performance', tag: 'agent-developer' });
    expect(second[0].count).toBe(2);
    expect(second[0].confidence).toBe(0.35); // 0.3 + 0.05
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 17：RETRO stage — hook result 不含 dead code 掃描（P3 純化後）
// ────────────────────────────────────────────────────────────────────────────

describe('場景 17：RETRO stage — hook result 不含 dead code 掃描（P3 純化）', () => {
  // 建立 RETRO stage active 的 state
  function setupRetroActiveState(sessionId) {
    state.initState(DEFAULT_CWD, sessionId, 'quick', ['DEV', 'REVIEW', 'TEST', 'RETRO']);
    state.updateStateAtomic(DEFAULT_CWD, sessionId, null, (s) => {
      ['DEV', 'REVIEW', 'TEST'].forEach(k => {
        s.stages[k].status = 'completed';
        s.stages[k].result = 'pass';
      });
      s.stages['RETRO'].status = 'active';
      s.currentStage = 'RETRO';
      return s;
    });
  }

  test('RETRO PASS → state 標記 completed，不含 dead code 掃描字串（P3 已移除）', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(DEFAULT_CWD, sessionId), { recursive: true });
    setupRetroActiveState(sessionId);

    const result = await runHook(
      { agent_type: 'retrospective', last_assistant_message: 'VERDICT: pass 回顧完成' },
      sessionId
    );

    // state RETRO 應標記為 completed
    const updatedState = state.readState(DEFAULT_CWD, sessionId);
    expect(updatedState.stages['RETRO'].status).toBe('completed');
    expect(result).toEqual({});
  });

  test('RETRO PASS → hook 正常完成，不因移除 dead-code 掃描而影響主流程', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(DEFAULT_CWD, sessionId), { recursive: true });
    setupRetroActiveState(sessionId);

    const result = await runHook(
      { agent_type: 'retrospective', last_assistant_message: 'VERDICT: pass 回顧完成' },
      sessionId
    );

    // hook 正常完成（回傳空 JSON 物件）
    expect(result).toEqual({});
  });

  test('DEV PASS → hook 正常完成，不含 dead code 掃描（非 RETRO stage 也不觸發）', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(DEFAULT_CWD, sessionId), { recursive: true });
    setupWorkflowWithActiveStage(sessionId, 'single', 'DEV');

    const result = await runHook(
      { agent_type: 'developer', last_assistant_message: 'VERDICT: pass 開發完成' },
      sessionId
    );

    expect(result).toEqual({});
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 16：DOCS stage — hook result 不含 docs-sync 結果（P3 純化後）
// ────────────────────────────────────────────────────────────────────────────

describe('場景 16：DOCS stage — hook result 不含 docs-sync 結果（P3 純化）', () => {
  // 準備 DOCS stage 全部前置 stages 完成的 state
  function setupDocsActiveState(sessionId) {
    state.initState(DEFAULT_CWD, sessionId, 'quick', ['DEV', 'REVIEW', 'TEST', 'RETRO', 'DOCS']);
    state.updateStateAtomic(DEFAULT_CWD, sessionId, null, (s) => {
      ['DEV', 'REVIEW', 'TEST', 'RETRO'].forEach(k => {
        s.stages[k].status = 'completed';
        s.stages[k].result = 'pass';
      });
      s.stages['DOCS'].status = 'active';
      s.currentStage = 'DOCS';
      return s;
    });
  }

  test('DOCS PASS → state 標記 completed，不含文件數字自動修復字串（P3 已移除）', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(DEFAULT_CWD, sessionId), { recursive: true });
    setupDocsActiveState(sessionId);

    const result = await runHook(
      { agent_type: 'doc-updater', last_assistant_message: 'VERDICT: pass 文件撰寫完成' },
      sessionId
    );

    // state DOCS 應標記為 completed
    const updatedState = state.readState(DEFAULT_CWD, sessionId);
    expect(updatedState.stages['DOCS'].status).toBe('completed');
    expect(result).toEqual({});
  });

  test('DOCS PASS → hook 正常完成，不含文件同步錯誤訊息', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(DEFAULT_CWD, sessionId), { recursive: true });
    setupDocsActiveState(sessionId);

    const result = await runHook(
      { agent_type: 'doc-updater', last_assistant_message: 'VERDICT: pass 文件完成' },
      sessionId
    );

    // P3 純化後：hook 正常完成
    expect(result).toEqual({});
  });

  test('DEV PASS → hook 正常完成，不含 docs-sync 修復訊息（非 DOCS stage）', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(DEFAULT_CWD, sessionId), { recursive: true });
    setupWorkflowWithActiveStage(sessionId, 'single', 'DEV');

    const result = await runHook(
      { agent_type: 'developer', last_assistant_message: 'VERDICT: pass 開發完成' },
      sessionId
    );

    expect(result).toEqual({});
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 18：Knowledge Engine — 知識歸檔整合
// ────────────────────────────────────────────────────────────────────────────

describe('場景 18：Knowledge Engine — 知識歸檔', () => {
  test('DEV PASS + 含 Handoff Findings → 知識歸檔不拋例外，主流程正常', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(DEFAULT_CWD, sessionId), { recursive: true });
    setupWorkflowWithActiveStage(sessionId, 'single', 'DEV');

    // 模擬含 Handoff 格式的 agent 輸出，包含 testing 相關關鍵詞
    const result = await runHook(
      {
        agent_type: 'developer',
        last_assistant_message: [
          'VERDICT: pass',
          '### Findings',
          '- 使用 describe/it/expect 組織 BDD 測試',
          '- mock 和 stub 用於隔離外部依賴',
          '- coverage 指標：statement 90% branch 85%',
          '### Files Modified',
          '- src/feature.js',
          '- tests/feature.test.js',
        ].join('\n'),
      },
      sessionId
    );

    // hook 不應因知識歸檔而拋例外，正常完成
    expect(result).toEqual({});
  });

  test('TEST FAIL → 知識歸檔不執行（只在 PASS/ISSUES 執行）', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(DEFAULT_CWD, sessionId), { recursive: true });
    state.initState(DEFAULT_CWD, sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.updateStateAtomic(DEFAULT_CWD, sessionId, null, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['REVIEW'].status = 'completed';
      s.stages['REVIEW'].result = 'pass';
      s.stages['TEST'].status = 'active';
      s.currentStage = 'TEST';
      return s;
    });

    // TEST stage 才支援 fail verdict
    const result = await runHook(
      {
        agent_type: 'tester',
        last_assistant_message: '5 tests failed with errors',
      },
      sessionId
    );

    // hook 正常完成，state failCount 遞增
    const updatedState = state.readState(DEFAULT_CWD, sessionId);
    expect(updatedState.failCount).toBe(1);
  });

  test('REVIEW REJECT → 知識歸檔不執行', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(DEFAULT_CWD, sessionId), { recursive: true });
    state.initState(DEFAULT_CWD, sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.updateStateAtomic(DEFAULT_CWD, sessionId, null, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['REVIEW'].status = 'active';
      s.currentStage = 'REVIEW';
      return s;
    });

    const result = await runHook(
      {
        agent_type: 'code-reviewer',
        last_assistant_message: 'reject 程式碼品質不合格',
      },
      sessionId
    );

    // REJECT 結果 — hook stdout 固定是 {}，知識歸檔不執行（無錯誤）
    expect(result).toEqual({});
  });

  test('RETRO PASS + 含 Findings → 知識歸檔 + dead-code 掃描同時執行不衝突', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(DEFAULT_CWD, sessionId), { recursive: true });
    state.initState(DEFAULT_CWD, sessionId, 'quick', ['DEV', 'REVIEW', 'TEST', 'RETRO']);
    state.updateStateAtomic(DEFAULT_CWD, sessionId, null, (s) => {
      ['DEV', 'REVIEW', 'TEST'].forEach(k => {
        s.stages[k].status = 'completed';
        s.stages[k].result = 'pass';
      });
      s.stages['RETRO'].status = 'active';
      s.currentStage = 'RETRO';
      return s;
    });

    // RETRO PASS 會同時觸發知識歸檔 + dead-code 掃描
    const result = await runHook(
      {
        agent_type: 'retrospective',
        last_assistant_message: [
          'VERDICT: pass 回顧完成',
          '### Findings',
          '- 程式碼品質良好',
          '- 測試覆蓋率充分',
          '### Context',
          '回顧已確認所有品質指標達標',
        ].join('\n'),
      },
      sessionId
    );

    // 主流程正常（知識歸檔 + dead-code 掃描同時執行不衝突）— hook stdout 固定是 {}
    expect(result).toEqual({});
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 19：修復 1 — featureName auto-sync 只對有 specs 的 workflow 執行
// ────────────────────────────────────────────────────────────────────────────

describe('場景 19：auto-sync specsConfig 過濾', () => {
  const os = require('os');
  const path = require('path');
  const specs = require(join(SCRIPTS_LIB, 'specs'));

  test('Scenario 1-1：single workflow + in-progress feature → auto-sync 不發生', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    // 建立臨時 project root，有 in-progress feature
    const tmpProject = mkdtempSync(path.join(os.tmpdir(), 'overtone-autosync-single-'));
    specs.initFeatureDir(tmpProject, 'my-feature', 'single');

    // 建立 single workflow state（不帶 featureName）— handler 用 cwd: tmpProject
    mkdirSync(paths.sessionDir(tmpProject, sessionId), { recursive: true });
    state.initState(tmpProject, sessionId, 'single', ['DEV']);
    state.updateStateAtomic(tmpProject, sessionId, null, (s) => {
      s.stages['DEV'].status = 'active';
      s.featureName = null;
      return s;
    });

    // 執行 hook
    const proc = Bun.spawn(['node', HOOK_PATH], {
      stdin: Buffer.from(JSON.stringify({
        agent_type: 'developer',
        last_assistant_message: 'VERDICT: pass 開發完成',
        cwd: tmpProject,
      })),
      env: { ...process.env, CLAUDE_SESSION_ID: sessionId, NOVA_TEST: '1' },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const output = await new Response(proc.stdout).text();
    await proc.exited;
    const result = JSON.parse(output);

    // hook 應正常輸出（stdout 固定是 {}）
    expect(result).toEqual({});

    // single workflow → specsConfig['single'].length === 0 → auto-sync 不執行
    const updatedState = state.readState(tmpProject, sessionId);
    expect(updatedState.featureName).toBeNull();

    rmSync(tmpProject, { recursive: true, force: true });
  });

  test('Scenario 1-3：standard workflow + in-progress feature → auto-sync 正常發生（回歸）', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    // 建立臨時 project root，有 in-progress feature
    const tmpProject = mkdtempSync(path.join(os.tmpdir(), 'overtone-autosync-standard-'));
    specs.initFeatureDir(tmpProject, 'my-feature', 'standard');

    // 建立 standard workflow state（不帶 featureName）— handler 用 cwd: tmpProject
    mkdirSync(paths.sessionDir(tmpProject, sessionId), { recursive: true });
    state.initState(tmpProject, sessionId, 'standard', ['PLAN', 'ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST:2', 'RETRO', 'DOCS']);
    state.updateStateAtomic(tmpProject, sessionId, null, (s) => {
      s.stages['DEV'].status = 'active';
      s.featureName = null;
      return s;
    });

    // 執行 hook
    const proc = Bun.spawn(['node', HOOK_PATH], {
      stdin: Buffer.from(JSON.stringify({
        agent_type: 'developer',
        last_assistant_message: 'VERDICT: pass 開發完成',
        cwd: tmpProject,
      })),
      env: { ...process.env, CLAUDE_SESSION_ID: sessionId, NOVA_TEST: '1' },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const output = await new Response(proc.stdout).text();
    await proc.exited;
    const result = JSON.parse(output);

    // hook 應正常輸出（stdout 固定是 {}）
    expect(result).toEqual({});

    // standard workflow → specsConfig['standard'].length > 0 → auto-sync 執行
    const updatedState = state.readState(tmpProject, sessionId);
    expect(updatedState.featureName).toBe('my-feature');

    rmSync(tmpProject, { recursive: true, force: true });
  });
});
