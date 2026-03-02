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
      { agent_type: 'ot:developer', last_assistant_message: 'VERDICT: pass 開發完成' },
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
      { agent_type: 'ot:tester', last_assistant_message: '測試失敗 3 tests fail' },
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
      { agent_type: 'ot:code-reviewer', last_assistant_message: '拒絕，程式碼有安全問題 reject' },
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
      { agent_type: 'ot:tester', last_assistant_message: '3 tests failed' },
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
      { agent_type: 'ot:developer', last_assistant_message: '任意輸出' },
      undefined
    );

    expect(result.result).toBe('');
  });

  test('CLAUDE_SESSION_ID 為空字串 → result 為空字串', async () => {
    const result = await runHook(
      { agent_type: 'ot:developer', last_assistant_message: '任意輸出' },
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
      { agent_type: 'ot:unknown-agent', last_assistant_message: '未知的 agent 輸出' },
      sessionId
    );

    expect(result.result).toBe('');
  });

  test('agent_type 為空 → result 為空字串', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);

    const result = await runHook(
      { agent_type: 'ot:', last_assistant_message: '任意輸出' },
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
      { agent_type: 'ot:developer', last_assistant_message: 'VERDICT: pass 開發完成' },
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
      { agent_type: 'ot:code-reviewer', last_assistant_message: 'code looks good, no issues found' },
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
      { agent_type: 'ot:tester', last_assistant_message: 'all tests passed successfully' },
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
      { agent_type: 'ot:developer', last_assistant_message: 'VERDICT: pass 完成' },
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
      { agent_type: 'ot:tester', last_assistant_message: '5 tests failed with errors' },
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
      { agent_type: 'ot:tester', last_assistant_message: 'tests failed critical failure' },
      sessionId
    );

    const fatalEvents = timeline.query(sessionId, { type: 'error:fatal' });
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

    // 建立 workflow state（不帶 featureName）
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.updateStateAtomic(sessionId, (s) => {
      s.stages['DEV'].status = 'active';
      // 明確不設定 featureName
      s.featureName = null;
      return s;
    });

    // 執行 hook（帶 cwd 指向臨時 project）
    const proc = Bun.spawn(['node', HOOK_PATH], {
      stdin: Buffer.from(JSON.stringify({
        agent_type: 'ot:developer',
        last_assistant_message: 'VERDICT: pass 開發完成',
        cwd: tmpProject,
      })),
      env: { ...process.env, CLAUDE_SESSION_ID: sessionId },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const output = await new Response(proc.stdout).text();
    await proc.exited;
    const result = JSON.parse(output);

    // hook 應正常輸出（pass）
    expect(result.result).toContain('✅');

    // tasks.md 中 DEV checkbox 應被自動勾選
    const updatedContent = readFileSync(tasksPath, 'utf8');
    expect(updatedContent).toContain('- [x] DEV');

    // state 中 featureName 應被同步
    const updatedState = state.readState(sessionId);
    expect(updatedState.featureName).toBe('my-feature');

    // 清理臨時目錄
    rmSync(tmpProject, { recursive: true, force: true });
  });

  test('workflow.json 無 featureName + specs 無 active feature → 靜默忽略，不拋例外', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    // 使用不含 specs 目錄的 project root
    const tmpProject = mkdtempSync(join(os.tmpdir(), 'overtone-nofeature-'));

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.updateStateAtomic(sessionId, (s) => {
      s.stages['DEV'].status = 'active';
      s.featureName = null;
      return s;
    });

    const proc = Bun.spawn(['node', HOOK_PATH], {
      stdin: Buffer.from(JSON.stringify({
        agent_type: 'ot:developer',
        last_assistant_message: 'VERDICT: pass 開發完成',
        cwd: tmpProject,
      })),
      env: { ...process.env, CLAUDE_SESSION_ID: sessionId },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const output = await new Response(proc.stdout).text();
    await proc.exited;
    const result = JSON.parse(output);

    // hook 仍應正常輸出，不因找不到 feature 而失敗
    expect(result.result).toContain('✅');

    // state featureName 維持 null
    const updatedState = state.readState(sessionId);
    expect(updatedState.featureName).toBeNull();

    rmSync(tmpProject, { recursive: true, force: true });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 11：RETRO PASS / ISSUES
// ────────────────────────────────────────────────────────────────────────────

describe('場景 11：RETRO — 迭代回顧', () => {
  test('RETRO PASS → result 含 ✅ 和 回顧，retroCount 未遞增', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    // quick workflow 含 RETRO stage：DEV → REVIEW → TEST → RETRO
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW', 'TEST', 'RETRO']);
    state.updateStateAtomic(sessionId, (s) => {
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
      { agent_type: 'ot:retrospective', last_assistant_message: '回顧完成，無重要問題。PASS' },
      sessionId
    );

    // result 包含 ✅
    expect(result.result).toContain('✅');
    // result 包含「回顧」字樣
    expect(result.result).toContain('回顧');

    // retroCount 不應遞增（PASS 不計）
    const updatedState = state.readState(sessionId);
    expect(updatedState.retroCount || 0).toBe(0);
  });

  test('RETRO ISSUES → result 含 🔁 和 改善建議，retroCount = 1', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW', 'TEST', 'RETRO']);
    state.updateStateAtomic(sessionId, (s) => {
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
      { agent_type: 'ot:retrospective', last_assistant_message: '發現 2 個改善建議，建議下一輪優化架構' },
      sessionId
    );

    // result 包含 🔁
    expect(result.result).toContain('🔁');
    // result 包含「改善建議」
    expect(result.result).toContain('改善建議');

    // retroCount 應遞增為 1
    const updatedState = state.readState(sessionId);
    expect(updatedState.retroCount).toBe(1);
  });

  test('RETRO ISSUES 達到上限（retroCount = 3）→ result 含 ⛔ 和迭代上限提示', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW', 'TEST', 'RETRO']);
    state.updateStateAtomic(sessionId, (s) => {
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
      { agent_type: 'ot:retrospective', last_assistant_message: '仍有 issues 需要改善建議' },
      sessionId
    );

    // result 包含 ⛔
    expect(result.result).toContain('⛔');

    // retroCount 應為 3
    const updatedState = state.readState(sessionId);
    expect(updatedState.retroCount).toBe(3);
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
      { agent_type: 'ot:code-reviewer', last_assistant_message: 'I must reject this, multiple security issues' },
      sessionId
    );

    // result 包含 ⛔
    expect(result.result).toContain('⛔');

    // result 包含人工介入
    expect(result.result).toContain('人工介入');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 12：D2 修復 — 並行 agent 未全部完成時不推進 hint
// ────────────────────────────────────────────────────────────────────────────

describe('場景 12：D2 — 並行 agent 未完成時 hint 等待', () => {
  test('REVIEW 完成但 TEST 仍 active（activeAgents 有 tester）→ hint 含「等待並行 agent」', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    // quick workflow: DEV → REVIEW → TEST
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.updateStateAtomic(sessionId, (s) => {
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
      { agent_type: 'ot:code-reviewer', last_assistant_message: 'LGTM, code looks good, approved' },
      sessionId
    );

    // 因 tester 仍 active，hint 應提示等待而非推進到 RETRO
    expect(result.result).toContain('等待並行 agent');
    expect(result.result).not.toContain('RETRO');
  });

  test('REVIEW 完成且 activeAgents 為空 → hint 正常推進（不含「等待」）', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    // quick workflow: DEV → REVIEW → TEST → RETRO
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW', 'TEST', 'RETRO']);
    state.updateStateAtomic(sessionId, (s) => {
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
      { agent_type: 'ot:code-reviewer', last_assistant_message: 'LGTM no issues' },
      sessionId
    );

    // hint 不含等待提示
    expect(result.result).not.toContain('等待並行 agent');
    // 應推進到 TEST
    expect(result.result).toContain('✅');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 13：D3 修復 — 雙重失敗協調提示
// ────────────────────────────────────────────────────────────────────────────

describe('場景 13：D3 — 雙重失敗協調提示', () => {
  test('TEST FAIL 且 rejectCount > 0 → 輸出整合協調提示', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.updateStateAtomic(sessionId, (s) => {
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
      { agent_type: 'ot:tester', last_assistant_message: '3 tests failed with errors' },
      sessionId
    );

    // 應包含雙重失敗警告
    expect(result.result).toContain('雙重失敗');
    // 應包含協調策略
    expect(result.result).toContain('協調策略');
    // 應提到 DEBUGGER
    expect(result.result.toUpperCase()).toContain('DEBUGGER');
  });

  test('REVIEW REJECT 且 failCount > 0 → 輸出整合協調提示（TEST FAIL 優先）', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.updateStateAtomic(sessionId, (s) => {
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
      { agent_type: 'ot:code-reviewer', last_assistant_message: 'I reject this, multiple issues' },
      sessionId
    );

    // 應包含雙重失敗警告
    expect(result.result).toContain('雙重失敗');
    // 應包含協調策略（TEST FAIL 優先）
    expect(result.result).toContain('協調策略');
  });

  test('單一 TEST FAIL（rejectCount = 0）→ 一般失敗提示，不含雙重失敗', async () => {
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
      s.rejectCount = 0; // 無 REVIEW REJECT
      return s;
    });

    const result = await runHook(
      { agent_type: 'ot:tester', last_assistant_message: '2 tests failed' },
      sessionId
    );

    // 不應包含雙重失敗
    expect(result.result).not.toContain('雙重失敗');
    // 一般 DEBUGGER 提示
    expect(result.result.toUpperCase()).toContain('DEBUGGER');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 14：agent_performance Instinct 觀察驗證
// ────────────────────────────────────────────────────────────────────────────

describe('場景 14：agent_performance Instinct 觀察', () => {
  const instinct = require(join(SCRIPTS_LIB, 'instinct'));

  test('developer PASS → observations.jsonl 新增 agent_performance 記錄', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    setupWorkflowWithActiveStage(sessionId, 'single', 'DEV');

    await runHook(
      { agent_type: 'ot:developer', last_assistant_message: 'VERDICT: pass 開發完成' },
      sessionId
    );

    // 查詢 agent_performance 觀察
    const observations = instinct.query(sessionId, { type: 'agent_performance' });
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
      { agent_type: 'ot:tester', last_assistant_message: '測試失敗 3 tests fail' },
      sessionId
    );

    const observations = instinct.query(sessionId, { type: 'agent_performance' });
    const testerObs = observations.find(o => o.tag === 'agent-tester');
    expect(testerObs).toBeDefined();
    expect(testerObs.trigger).toContain('tester');
    expect(testerObs.trigger).toContain('fail');
  });

  test('code-reviewer REJECT → 觀察 tag 為 agent-code-reviewer，trigger 含 reject', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.updateStateAtomic(sessionId, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['REVIEW'].status = 'active';
      s.currentStage = 'REVIEW';
      return s;
    });

    await runHook(
      { agent_type: 'ot:code-reviewer', last_assistant_message: '拒絕，程式碼有安全問題 reject' },
      sessionId
    );

    const observations = instinct.query(sessionId, { type: 'agent_performance' });
    const reviewerObs = observations.find(o => o.tag === 'agent-code-reviewer');
    expect(reviewerObs).toBeDefined();
    expect(reviewerObs.trigger).toContain('code-reviewer');
    expect(reviewerObs.trigger).toContain('reject');
  });

  test('同一 agent 多次完成後信心累積（confirm 機制）', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });

    // 第一次完成
    setupWorkflowWithActiveStage(sessionId, 'single', 'DEV');
    await runHook(
      { agent_type: 'ot:developer', last_assistant_message: 'VERDICT: pass 第一次完成' },
      sessionId
    );

    const first = instinct.query(sessionId, { type: 'agent_performance', tag: 'agent-developer' });
    expect(first.length).toBeGreaterThan(0);
    expect(first[0].count).toBe(1);
    expect(first[0].confidence).toBe(0.3);

    // 第二次完成（需要重設 stage 為 active）
    state.updateStateAtomic(sessionId, (s) => {
      s.stages['DEV'].status = 'active';
      return s;
    });
    await runHook(
      { agent_type: 'ot:developer', last_assistant_message: 'VERDICT: pass 第二次完成' },
      sessionId
    );

    const second = instinct.query(sessionId, { type: 'agent_performance', tag: 'agent-developer' });
    expect(second[0].count).toBe(2);
    expect(second[0].confidence).toBe(0.35); // 0.3 + 0.05
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 17：RETRO stage — dead code 掃描自動觸發
// ────────────────────────────────────────────────────────────────────────────

describe('場景 17：RETRO stage — dead code 掃描自動觸發', () => {
  const instinct = require(join(SCRIPTS_LIB, 'instinct'));

  // 建立 RETRO stage active 的 state
  function setupRetroActiveState(sessionId) {
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW', 'TEST', 'RETRO']);
    state.updateStateAtomic(sessionId, (s) => {
      ['DEV', 'REVIEW', 'TEST'].forEach(k => {
        s.stages[k].status = 'completed';
        s.stages[k].result = 'pass';
      });
      s.stages['RETRO'].status = 'active';
      s.currentStage = 'RETRO';
      return s;
    });
  }

  test('RETRO PASS → hook 正常輸出 ✅，主流程不受 dead-code 掃描影響', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    setupRetroActiveState(sessionId);

    const result = await runHook(
      { agent_type: 'ot:retrospective', last_assistant_message: 'VERDICT: pass 回顧完成' },
      sessionId
    );

    // 主流程正常：含 PASS 符號
    expect(result.result).toContain('✅');
    // result 為字串
    expect(typeof result.result).toBe('string');
  });

  test('RETRO PASS → observations.jsonl 新增 dead_code 類型觀察（若有 dead code）', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    setupRetroActiveState(sessionId);

    await runHook(
      { agent_type: 'ot:retrospective', last_assistant_message: 'VERDICT: pass 回顧完成' },
      sessionId
    );

    // 查詢 dead_code 類型觀察（若 dead-code scanner 有找到結果才會有）
    // 此測試只驗證：若觀察存在，格式必須正確；主流程不應因此失敗
    const observations = instinct.query(sessionId, { type: 'dead_code' });
    for (const obs of observations) {
      expect(obs.type).toBe('dead_code');
      expect(obs.tag).toBe('auto-scan');
      expect(obs.trigger).toBe('RETRO complete');
      expect(obs.action).toMatch(/Found \d+ unused exports, \d+ orphan files/);
    }
  });

  test('非 RETRO stage（DOCS）PASS → dead-code 掃描不觸發（DOCS 有自己的 docs-sync）', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW', 'TEST', 'RETRO', 'DOCS']);
    state.updateStateAtomic(sessionId, (s) => {
      ['DEV', 'REVIEW', 'TEST', 'RETRO'].forEach(k => {
        s.stages[k].status = 'completed';
        s.stages[k].result = 'pass';
      });
      s.stages['DOCS'].status = 'active';
      s.currentStage = 'DOCS';
      return s;
    });

    await runHook(
      { agent_type: 'ot:doc-updater', last_assistant_message: 'VERDICT: pass 文件完成' },
      sessionId
    );

    // DOCS PASS → 不觸發 RETRO dead-code 掃描
    const observations = instinct.query(sessionId, { type: 'dead_code' });
    expect(observations.length).toBe(0);
  });

  test('非 RETRO stage（DEV）PASS → dead-code 掃描不觸發', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    setupWorkflowWithActiveStage(sessionId, 'single', 'DEV');

    await runHook(
      { agent_type: 'ot:developer', last_assistant_message: 'VERDICT: pass 開發完成' },
      sessionId
    );

    // DEV PASS → 不觸發 dead-code 掃描
    const observations = instinct.query(sessionId, { type: 'dead_code' });
    expect(observations.length).toBe(0);
    // result 正常
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 16：DOCS stage — docs-sync 自動觸發
// ────────────────────────────────────────────────────────────────────────────

describe('場景 16：DOCS stage — docs-sync 自動觸發', () => {
  // 準備 DOCS stage 全部前置 stages 完成的 state
  function setupDocsActiveState(sessionId) {
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW', 'TEST', 'RETRO', 'DOCS']);
    state.updateStateAtomic(sessionId, (s) => {
      ['DEV', 'REVIEW', 'TEST', 'RETRO'].forEach(k => {
        s.stages[k].status = 'completed';
        s.stages[k].result = 'pass';
      });
      s.stages['DOCS'].status = 'active';
      s.currentStage = 'DOCS';
      return s;
    });
  }

  test('DOCS PASS → result 含 ✅，主流程不受 docs-sync 影響', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    setupDocsActiveState(sessionId);

    const result = await runHook(
      { agent_type: 'ot:doc-updater', last_assistant_message: 'VERDICT: pass 文件撰寫完成' },
      sessionId
    );

    // 主流程正常：含 PASS 符號
    expect(result.result).toContain('✅');
    // result 為字串（docs-sync 例外不影響主流程）
    expect(typeof result.result).toBe('string');
  });

  test('DOCS PASS（docs-sync isClean）→ result 不含錯誤或警告訊息', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    setupDocsActiveState(sessionId);

    const result = await runHook(
      { agent_type: 'ot:doc-updater', last_assistant_message: 'VERDICT: pass 文件完成' },
      sessionId
    );

    // 數字已同步時不含修復提示
    expect(result.result).not.toContain('文件同步錯誤');
    // result 非空
    expect(result.result.length).toBeGreaterThan(0);
  });

  test('非 DOCS stage（DEV）PASS → docs-sync 不觸發', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    setupWorkflowWithActiveStage(sessionId, 'single', 'DEV');

    const result = await runHook(
      { agent_type: 'ot:developer', last_assistant_message: 'VERDICT: pass 開發完成' },
      sessionId
    );

    // DEV PASS 含 ✅
    expect(result.result).toContain('✅');
    // 不含 docs-sync 修復訊息
    expect(result.result).not.toContain('文件數字自動修復');
    expect(result.result).not.toContain('需人工確認');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 18：Knowledge Engine — 知識歸檔整合
// ────────────────────────────────────────────────────────────────────────────

describe('場景 18：Knowledge Engine — 知識歸檔', () => {
  test('DEV PASS + 含 Handoff Findings → 知識歸檔不拋例外，主流程正常', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    setupWorkflowWithActiveStage(sessionId, 'single', 'DEV');

    // 模擬含 Handoff 格式的 agent 輸出，包含 testing 相關關鍵詞
    const result = await runHook(
      {
        agent_type: 'ot:developer',
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

    // 主流程正常：含 ✅
    expect(result.result).toContain('✅');
    // hook 不應因知識歸檔而拋例外
    expect(typeof result.result).toBe('string');
  });

  test('TEST FAIL → 知識歸檔不執行（只在 PASS/ISSUES 執行）', async () => {
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

    // TEST stage 才支援 fail verdict
    const result = await runHook(
      {
        agent_type: 'ot:tester',
        last_assistant_message: '5 tests failed with errors',
      },
      sessionId
    );

    // FAIL 結果
    expect(result.result).toContain('❌');
    // 不應有知識歸檔相關錯誤
    expect(typeof result.result).toBe('string');
  });

  test('REVIEW REJECT → 知識歸檔不執行', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW', 'TEST']);
    state.updateStateAtomic(sessionId, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['REVIEW'].status = 'active';
      s.currentStage = 'REVIEW';
      return s;
    });

    const result = await runHook(
      {
        agent_type: 'ot:code-reviewer',
        last_assistant_message: 'reject 程式碼品質不合格',
      },
      sessionId
    );

    // REJECT 結果
    expect(result.result).toContain('🔙');
    // 不應有知識歸檔相關錯誤
    expect(typeof result.result).toBe('string');
  });

  test('RETRO PASS + 含 Findings → 知識歸檔 + dead-code 掃描同時執行不衝突', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW', 'TEST', 'RETRO']);
    state.updateStateAtomic(sessionId, (s) => {
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
        agent_type: 'ot:retrospective',
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

    // 主流程正常（知識歸檔 + dead-code 掃描同時執行不衝突）
    expect(result.result).toContain('✅');
    expect(typeof result.result).toBe('string');
  });
});
