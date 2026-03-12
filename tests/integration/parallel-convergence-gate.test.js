'use strict';
/**
 * parallel-convergence-gate.test.js
 * BDD spec: specs/features/in-progress/parallel-convergence-gate/bdd.md
 *
 * 覆蓋範圍：
 *   Feature 2: pre-task.js instanceId 追蹤（Scenario 2-2, 2-3, 2-4, 2-5）
 *   Feature 3: on-stop.js 收斂門（Scenario 3-1 ~ 3-10）
 *   Feature 7: 邊界案例與競態條件（Scenario 7-3, 7-4）
 *
 * Feature 2 Scenario 2-1 已被 pre-task-parallel.test.js BDD F6 S1/2/3 覆蓋。
 * Feature 3 Scenario 3-1/3-2/3-3 合併驗證（三步驟一路收斂）。
 */

const { test, expect, describe, afterAll } = require('bun:test');
const { mkdirSync, mkdtempSync, rmSync, existsSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');
const SessionContext = require(join(SCRIPTS_LIB, 'session-context'));
const { runPreTask, runSubagentStop, isAllowed } = require('../helpers/hook-runner');

const paths = require(join(SCRIPTS_LIB, 'paths'));
const state = require(join(SCRIPTS_LIB, 'state'));
const timeline = require(join(SCRIPTS_LIB, 'timeline'));
const { workflows } = require(join(SCRIPTS_LIB, 'registry'));
const { atomicWrite } = require(join(SCRIPTS_LIB, 'utils'));

// ── 隔離的 projectRoot（避免汙染 ~/.nova 和並行衝突）──

const TEST_PROJECT_ROOT = mkdtempSync(join(tmpdir(), 'pcg-test-'));

// ── session 管理 ──

const SESSION_PREFIX = `test_pcg_${Date.now()}`;
let counter = 0;

function newSessionId() {
  return `${SESSION_PREFIX}_${++counter}`;
}

const createdSessions = [];

afterAll(() => {
  for (const sid of createdSessions) {
    rmSync(paths.sessionDir(TEST_PROJECT_ROOT, sid), { recursive: true, force: true });
  }
  // 清理 projectRoot 目錄
  rmSync(TEST_PROJECT_ROOT, { recursive: true, force: true });
});

function setupSession(workflowType = 'single') {
  const sessionId = newSessionId();
  createdSessions.push(sessionId);
  mkdirSync(paths.sessionDir(TEST_PROJECT_ROOT, sessionId), { recursive: true });
  state.initStateCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId), workflowType, workflows[workflowType].stages);
  return sessionId;
}

// ────────────────────────────────────────────────────────────────────────────
// Feature 2: pre-task.js instanceId 追蹤
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 2：pre-task.js PARALLEL_TOTAL 解析與注入', () => {

  // Scenario 2-2: prompt 含 PARALLEL_TOTAL: 3 時 stage entry 寫入 parallelTotal = 3
  test('Scenario 2-2: prompt 含 PARALLEL_TOTAL: 3 → stages.DEV.parallelTotal 設定為 3', () => {
    const sessionId = setupSession('single');

    const result = runPreTask(sessionId, {
      subagent_type: 'developer',
      description: '並行開發任務',
      prompt: 'PARALLEL_TOTAL: 3\n請實作並行功能',
    }, { cwd: TEST_PROJECT_ROOT });

    expect(isAllowed(result.parsed)).toBe(true);

    const ws = state.readStateCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId));
    expect(ws.stages['DEV'].parallelTotal).toBe(3);
  });

  // Scenario 2-3: prompt 不含 PARALLEL_TOTAL 時 parallelTotal 不被設定
  test('Scenario 2-3: prompt 不含 PARALLEL_TOTAL → stages.DEV 不含 parallelTotal 欄位', () => {
    const sessionId = setupSession('single');

    const result = runPreTask(sessionId, {
      subagent_type: 'developer',
      description: '單一開發任務',
      prompt: '請實作功能（無並行標記）',
    }, { cwd: TEST_PROJECT_ROOT });

    expect(isAllowed(result.parsed)).toBe(true);

    const ws = state.readStateCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId));
    expect(ws.stages['DEV'].parallelTotal).toBeUndefined();
  });

  // Scenario 2-4: updatedInput 注入 [PARALLEL INSTANCE] 區塊
  test('Scenario 2-4: prompt 含 PARALLEL_TOTAL: 3 → updatedInput.prompt 最前面含 [PARALLEL INSTANCE] 區塊', () => {
    const sessionId = setupSession('single');

    const result = runPreTask(sessionId, {
      subagent_type: 'developer',
      description: '並行開發',
      prompt: 'PARALLEL_TOTAL: 3\n原始任務內容',
    }, { cwd: TEST_PROJECT_ROOT });

    expect(isAllowed(result.parsed)).toBe(true);

    const updatedPrompt = result.parsed?.hookSpecificOutput?.updatedInput?.prompt || '';
    // [PARALLEL INSTANCE] 區塊必須存在
    expect(updatedPrompt).toContain('[PARALLEL INSTANCE]');
    // 必須含 INSTANCE_ID: developer:...
    expect(updatedPrompt).toMatch(/INSTANCE_ID:\s*developer:/);
    // 必須含 PARALLEL_TOTAL: 3
    expect(updatedPrompt).toContain('PARALLEL_TOTAL: 3');
    // 原始 prompt 保留在後面
    expect(updatedPrompt).toContain('原始任務內容');
    // [PARALLEL INSTANCE] 必須出現在原始 prompt 之前
    const parallelIdx = updatedPrompt.indexOf('[PARALLEL INSTANCE]');
    const originalIdx = updatedPrompt.indexOf('原始任務內容');
    expect(parallelIdx).toBeLessThan(originalIdx);
  });

  // Scenario 2-5: 多個並行 pre-task 執行 parallelTotal 取最大值（race condition 防禦）
  // 模擬情境：DEV stage 為 pending，第一個 pre-task 已寫入 parallelTotal = 2，
  // 第二個 pre-task（PARALLEL_TOTAL: 3）應取 Math.max(2, 3) = 3。
  test('Scenario 2-5: 既有 parallelTotal = 2，第二次 pre-task PARALLEL_TOTAL: 3 → 取 max 為 3', () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);
    mkdirSync(paths.sessionDir(TEST_PROJECT_ROOT, sessionId), { recursive: true });
    state.initStateCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId), 'single', workflows['single'].stages);

    // 預先模擬第一個 pre-task 已將 parallelTotal 設為 2（DEV 仍 pending）
    state.updateStateAtomicCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId), (s) => {
      s.stages['DEV'].parallelTotal = 2;
      // DEV 保持 pending，讓 actualKey 能找到
      return s;
    });

    // 第二個 pre-task（PARALLEL_TOTAL: 3）
    const result = runPreTask(sessionId, {
      subagent_type: 'developer',
      description: '並行開發',
      prompt: 'PARALLEL_TOTAL: 3\n任務',
    }, { cwd: TEST_PROJECT_ROOT });

    expect(isAllowed(result.parsed)).toBe(true);

    const ws = state.readStateCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId));
    // 取 Math.max(2, 3) = 3
    expect(ws.stages['DEV'].parallelTotal).toBe(3);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature 3: on-stop.js 收斂門
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 3：on-stop.js 並行收斂門 — 3 個 developer 全部 pass', () => {

  // Scenario 3-1: 第 1 個完成後 stage 仍 active
  // Scenario 3-2: 第 2 個完成後 stage 仍 active
  // Scenario 3-3: 第 3 個完成後 stage 標記 completed + pass
  test('Scenario 3-1~3-3: 3 個 developer 依序完成 → 前 2 個 stage 仍 active，第 3 個收斂', () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);
    mkdirSync(paths.sessionDir(TEST_PROJECT_ROOT, sessionId), { recursive: true });
    state.initStateCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId), 'single', workflows['single'].stages);

    // 手動設定 DEV stage 為 active，parallelTotal = 3
    state.updateStateAtomicCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId), (s) => {
      s.stages['DEV'].status = 'active';
      s.stages['DEV'].parallelTotal = 3;
      s.stages['DEV'].parallelDone = 0;
      // 模擬 3 個 activeAgents instanceId
      s.activeAgents['developer:aaa001-inst1'] = { agentName: 'developer', stage: 'DEV', startedAt: new Date().toISOString() };
      s.activeAgents['developer:bbb002-inst2'] = { agentName: 'developer', stage: 'DEV', startedAt: new Date().toISOString() };
      s.activeAgents['developer:ccc003-inst3'] = { agentName: 'developer', stage: 'DEV', startedAt: new Date().toISOString() };
      return s;
    });

    // 第 1 個 instance 完成（帶 INSTANCE_ID）
    runSubagentStop(sessionId, 'developer', 'VERDICT: pass 任務一完成\n\nINSTANCE_ID: developer:aaa001-inst1', { cwd: TEST_PROJECT_ROOT });

    const ws1 = state.readStateCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId));
    // 未收斂：stage 仍 active（parallelDone = 1，parallelTotal = 3）
    expect(ws1.stages['DEV'].status).toBe('active');
    expect(ws1.stages['DEV'].parallelDone).toBe(1);

    // 第 2 個 instance 完成
    runSubagentStop(sessionId, 'developer', 'VERDICT: pass 任務二完成\n\nINSTANCE_ID: developer:bbb002-inst2', { cwd: TEST_PROJECT_ROOT });

    const ws2 = state.readStateCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId));
    // 仍未收斂
    expect(ws2.stages['DEV'].status).toBe('active');
    expect(ws2.stages['DEV'].parallelDone).toBe(2);

    // 第 3 個 instance 完成（最後一個，觸發收斂）
    runSubagentStop(sessionId, 'developer', 'VERDICT: pass 任務三完成\n\nINSTANCE_ID: developer:ccc003-inst3', { cwd: TEST_PROJECT_ROOT });

    const ws3 = state.readStateCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId));
    // 已收斂：stage 標記 completed + pass
    expect(ws3.stages['DEV'].status).toBe('completed');
    expect(ws3.stages['DEV'].result).toBe('pass');
    expect(ws3.stages['DEV'].parallelDone).toBe(3);
    expect(ws3.stages['DEV'].completedAt).toBeDefined();
  });
});

describe('Feature 3：on-stop.js 收斂門 — fail 立即觸發', () => {

  // Scenario 3-4: 並行 3 個，其中 1 個 fail 時立即標記 stage completed + fail
  // 注意：parse-result 只對 TEST/QA/E2E/BUILD-FIX stage 支援 fail 判定。
  // 使用 tester agent（TEST stage）來驗證此行為。
  test('Scenario 3-4: 並行 TEST stage，第 2 個 instance fail → stage 立即 completed + fail', () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);
    mkdirSync(paths.sessionDir(TEST_PROJECT_ROOT, sessionId), { recursive: true });
    // 建立含 DEV + TEST 的自訂 workflow（DEV 後有 REVIEW + TEST 並行）
    state.initStateCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId), 'standard', ['DEV', 'REVIEW', 'TEST', 'RETRO']);

    state.updateStateAtomicCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId), (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['REVIEW'].status = 'active';
      s.stages['TEST'].status = 'active';
      s.stages['TEST'].parallelTotal = 3;
      s.stages['TEST'].parallelDone = 1; // 第 1 個已 pass
      s.activeAgents['tester:aaa001-inst1'] = { agentName: 'tester', stage: 'TEST', startedAt: new Date().toISOString() };
      s.activeAgents['tester:bbb002-inst2'] = { agentName: 'tester', stage: 'TEST', startedAt: new Date().toISOString() };
      s.activeAgents['tester:ccc003-inst3'] = { agentName: 'tester', stage: 'TEST', startedAt: new Date().toISOString() };
      return s;
    });

    // 第 2 個 tester instance fail（TEST stage 會判定 fail）
    runSubagentStop(sessionId, 'tester', '3 tests failed with errors\n\nINSTANCE_ID: tester:bbb002-inst2', { cwd: TEST_PROJECT_ROOT });

    const ws = state.readStateCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId));
    // 立即標記 completed + fail
    expect(ws.stages['TEST'].status).toBe('completed');
    expect(ws.stages['TEST'].result).toBe('fail');
    expect(ws.stages['TEST'].parallelDone).toBe(2); // parallelDone 遞增
    expect(ws.failCount).toBeGreaterThanOrEqual(1);
  });

  // Scenario 3-5: 先 fail 再 pass 時 stage 結果維持 fail（不被後續 pass 覆蓋）
  // 使用 developer（DEV stage）— stage 已 completed + fail 後，後續 pass 不改結果
  // （DEV 永遠 pass，但這裡是測試 stage 已 completed 的 cleanup 路徑，與 parse-result 無關）
  test('Scenario 3-5: stage 已 completed + fail，後續 instance pass 到達 → 結果維持 fail', () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);
    mkdirSync(paths.sessionDir(TEST_PROJECT_ROOT, sessionId), { recursive: true });
    state.initStateCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId), 'single', workflows['single'].stages);

    // 模擬已 completed + fail（任一機制觸發，直接手動設定）
    state.updateStateAtomicCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId), (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'fail';
      s.stages['DEV'].parallelTotal = 3;
      s.stages['DEV'].parallelDone = 1;
      // 第 3 個 instance 還在 activeAgents 中
      s.activeAgents['developer:ccc003-inst3'] = { agentName: 'developer', stage: 'DEV', startedAt: new Date().toISOString() };
      return s;
    });

    // 後續到達的 inst3（DEV 永遠 pass，但 stage 已 completed → 只做 cleanup）
    runSubagentStop(sessionId, 'developer', 'VERDICT: pass 任務三完成\n\nINSTANCE_ID: developer:ccc003-inst3', { cwd: TEST_PROJECT_ROOT });

    const ws = state.readStateCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId));
    // 結果維持 fail（不被 pass 覆蓋）
    expect(ws.stages['DEV'].result).toBe('fail');
    expect(ws.stages['DEV'].status).toBe('completed');
    // activeAgents 中的 ccc003-inst3 被清除（cleanup 仍執行）
    expect(ws.activeAgents['developer:ccc003-inst3']).toBeUndefined();
  });
});

describe('Feature 3：on-stop.js 收斂門 — instanceId 解析', () => {

  // Scenario 3-6: instanceId 從 agentOutput regex 解析成功
  test('Scenario 3-6: agentOutput 末尾含 INSTANCE_ID → 對應 entry 被清除', () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);
    mkdirSync(paths.sessionDir(TEST_PROJECT_ROOT, sessionId), { recursive: true });
    state.initStateCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId), 'single', workflows['single'].stages);

    const instanceId = 'developer:m3xap2k-f7r9qz';
    state.updateStateAtomicCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId), (s) => {
      s.stages['DEV'].status = 'active';
      s.stages['DEV'].parallelTotal = 2;
      s.stages['DEV'].parallelDone = 0;
      s.activeAgents[instanceId] = { agentName: 'developer', stage: 'DEV', startedAt: new Date().toISOString() };
      s.activeAgents['developer:zzzzzz-other'] = { agentName: 'developer', stage: 'DEV', startedAt: new Date().toISOString() };
      return s;
    });

    runSubagentStop(sessionId, 'developer', `VERDICT: pass 完成\n\nINSTANCE_ID: ${instanceId}`, { cwd: TEST_PROJECT_ROOT });

    const ws = state.readStateCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId));
    // 對應的 instanceId entry 被清除，另一個仍存在
    expect(ws.activeAgents[instanceId]).toBeUndefined();
    expect(ws.activeAgents['developer:zzzzzz-other']).toBeDefined();
  });

  // Scenario 3-7: instanceId 解析失敗時 fallback 至最早的同名 instance
  test('Scenario 3-7: agentOutput 不含 INSTANCE_ID → fallback 清除字典序最小的 key', () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);
    mkdirSync(paths.sessionDir(TEST_PROJECT_ROOT, sessionId), { recursive: true });
    state.initStateCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId), 'single', workflows['single'].stages);

    // aaaa01 字典序 < bbbb02
    state.updateStateAtomicCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId), (s) => {
      s.stages['DEV'].status = 'active';
      s.stages['DEV'].parallelTotal = 2;
      s.stages['DEV'].parallelDone = 0;
      s.activeAgents['developer:aaaa01-xxx'] = { agentName: 'developer', stage: 'DEV', startedAt: new Date().toISOString() };
      s.activeAgents['developer:bbbb02-yyy'] = { agentName: 'developer', stage: 'DEV', startedAt: new Date().toISOString() };
      return s;
    });

    // agentOutput 不含 INSTANCE_ID
    runSubagentStop(sessionId, 'developer', 'VERDICT: pass 完成（無 instanceId）', { cwd: TEST_PROJECT_ROOT });

    const ws = state.readStateCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId));
    // aaaa01 被清除（字典序最小），bbbb02 保留
    expect(ws.activeAgents['developer:aaaa01-xxx']).toBeUndefined();
    expect(ws.activeAgents['developer:bbbb02-yyy']).toBeDefined();
  });
});

describe('Feature 3：on-stop.js 收斂門 — activeAgents 生命週期', () => {

  // Scenario 3-8: 並行收斂 — activeAgents entry 隨 on-stop 逐一清除，收斂後 stage 標記 completed
  test('Scenario 3-8: 未收斂（parallelDone < parallelTotal）activeAgents 保留對應 entry；收斂後 stage 為 completed', () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);
    mkdirSync(paths.sessionDir(TEST_PROJECT_ROOT, sessionId), { recursive: true });
    state.initStateCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId), 'single', workflows['single'].stages);

    state.updateStateAtomicCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId), (s) => {
      s.stages['DEV'].status = 'active';
      s.stages['DEV'].parallelTotal = 3;
      s.stages['DEV'].parallelDone = 0;
      s.activeAgents['developer:aaa001-inst1'] = { agentName: 'developer', stage: 'DEV', startedAt: new Date().toISOString() };
      s.activeAgents['developer:bbb002-inst2'] = { agentName: 'developer', stage: 'DEV', startedAt: new Date().toISOString() };
      s.activeAgents['developer:ccc003-inst3'] = { agentName: 'developer', stage: 'DEV', startedAt: new Date().toISOString() };
      return s;
    });

    // 第 1 個完成（parallelDone = 1，parallelTotal = 3，未收斂）
    runSubagentStop(sessionId, 'developer', 'VERDICT: pass 任務一\n\nINSTANCE_ID: developer:aaa001-inst1', { cwd: TEST_PROJECT_ROOT });

    const ws1 = state.readStateCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId));
    expect(ws1.stages['DEV'].parallelDone).toBe(1);
    // 未收斂 — stage 仍為 active，aaa001 entry 被清除，其他兩個仍在
    expect(ws1.stages['DEV'].status).toBe('active');
    expect(ws1.activeAgents['developer:aaa001-inst1']).toBeUndefined();
    expect(ws1.activeAgents['developer:bbb002-inst2']).toBeDefined();

    // 第 2 個完成（parallelDone = 2，未收斂）
    runSubagentStop(sessionId, 'developer', 'VERDICT: pass 任務二\n\nINSTANCE_ID: developer:bbb002-inst2', { cwd: TEST_PROJECT_ROOT });
    const ws2 = state.readStateCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId));
    expect(ws2.stages['DEV'].parallelDone).toBe(2);
    expect(ws2.stages['DEV'].status).toBe('active');

    // 第 3 個完成（parallelDone = 3，已收斂）
    runSubagentStop(sessionId, 'developer', 'VERDICT: pass 任務三\n\nINSTANCE_ID: developer:ccc003-inst3', { cwd: TEST_PROJECT_ROOT });

    const ws3 = state.readStateCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId));
    expect(ws3.stages['DEV'].status).toBe('completed');
    // 收斂後 activeAgents 中的所有 DEV entry 都被清除
    const devEntries = Object.entries(ws3.activeAgents || {}).filter(([, info]) => info.stage === 'DEV');
    expect(devEntries.length).toBe(0);
  });
});

describe('Feature 3：on-stop.js timeline — 每個 instance emit agent:complete，只收斂時 emit stage:complete', () => {

  // Scenario 3-9
  test('Scenario 3-9: 前 2 個 instance 只 emit agent:complete；第 3 個 instance 同時 emit stage:complete', () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);
    mkdirSync(paths.sessionDir(TEST_PROJECT_ROOT, sessionId), { recursive: true });
    state.initStateCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId), 'single', workflows['single'].stages);

    state.updateStateAtomicCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId), (s) => {
      s.stages['DEV'].status = 'active';
      s.stages['DEV'].parallelTotal = 3;
      s.stages['DEV'].parallelDone = 0;
      s.activeAgents['developer:a1-inst1'] = { agentName: 'developer', stage: 'DEV', startedAt: new Date().toISOString() };
      s.activeAgents['developer:b2-inst2'] = { agentName: 'developer', stage: 'DEV', startedAt: new Date().toISOString() };
      s.activeAgents['developer:c3-inst3'] = { agentName: 'developer', stage: 'DEV', startedAt: new Date().toISOString() };
      return s;
    });

    // 第 1 個完成
    runSubagentStop(sessionId, 'developer', 'VERDICT: pass inst1\n\nINSTANCE_ID: developer:a1-inst1', { cwd: TEST_PROJECT_ROOT });

    const stageEvents1 = timeline.queryCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId), { type: 'stage:complete' });
    const agentEvents1 = timeline.queryCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId), { type: 'agent:complete' });
    // 只有 agent:complete，沒有 stage:complete
    expect(agentEvents1.length).toBe(1);
    expect(stageEvents1.length).toBe(0);

    // 第 2 個完成
    runSubagentStop(sessionId, 'developer', 'VERDICT: pass inst2\n\nINSTANCE_ID: developer:b2-inst2', { cwd: TEST_PROJECT_ROOT });

    const stageEvents2 = timeline.queryCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId), { type: 'stage:complete' });
    const agentEvents2 = timeline.queryCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId), { type: 'agent:complete' });
    expect(agentEvents2.length).toBe(2);
    expect(stageEvents2.length).toBe(0); // 仍無 stage:complete

    // 第 3 個完成（收斂）
    runSubagentStop(sessionId, 'developer', 'VERDICT: pass inst3\n\nINSTANCE_ID: developer:c3-inst3', { cwd: TEST_PROJECT_ROOT });

    const stageEvents3 = timeline.queryCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId), { type: 'stage:complete' });
    const agentEvents3 = timeline.queryCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId), { type: 'agent:complete' });
    expect(agentEvents3.length).toBe(3); // 3 個 agent:complete
    expect(stageEvents3.length).toBe(1); // 收斂後 1 個 stage:complete
    expect(stageEvents3[0].stage).toBe('DEV');
    expect(stageEvents3[0].result).toBe('pass');
  });

  // Scenario 3-10: 非並行場景（parallelTotal 未設定）第一個完成即收斂
  test('Scenario 3-10: 非並行場景（無 parallelTotal）→ 單一 instance 完成即收斂，行為同舊版', () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);
    mkdirSync(paths.sessionDir(TEST_PROJECT_ROOT, sessionId), { recursive: true });
    state.initStateCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId), 'single', workflows['single'].stages);

    state.updateStateAtomicCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId), (s) => {
      s.stages['DEV'].status = 'active';
      // 不設定 parallelTotal
      return s;
    });

    runSubagentStop(sessionId, 'developer', 'VERDICT: pass 完成', { cwd: TEST_PROJECT_ROOT });

    const ws = state.readStateCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId));
    expect(ws.stages['DEV'].status).toBe('completed');
    expect(ws.stages['DEV'].result).toBe('pass');

    // stage:complete 有記錄
    const stageEvents = timeline.queryCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId), { type: 'stage:complete' });
    expect(stageEvents.length).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature 7: 邊界案例與競態條件
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 7：邊界案例', () => {

  // Scenario 7-3: PARALLEL_TOTAL prompt 含非數字字串時安全忽略
  test('Scenario 7-3: PARALLEL_TOTAL: abc（非法數字）→ parallelTotal 不寫入，不拋例外', () => {
    const sessionId = setupSession('single');

    // 應不拋例外，正常放行
    let result;
    expect(() => {
      result = runPreTask(sessionId, {
        subagent_type: 'developer',
        description: '並行開發',
        prompt: 'PARALLEL_TOTAL: abc\n任意任務',
      }, { cwd: TEST_PROJECT_ROOT });
    }).not.toThrow();

    expect(isAllowed(result.parsed)).toBe(true);

    const ws = state.readStateCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId));
    // parallelTotal 不寫入（parseInt('abc') = NaN）
    expect(ws.stages['DEV'].parallelTotal).toBeUndefined();
  });

  // Scenario 7-4: activeAgents 為空物件時 fallback 靜默失敗不拋出例外
  test('Scenario 7-4: activeAgents 為空 + agentOutput 無 INSTANCE_ID → 靜默不拋例外，instanceId fallback 為 null', () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);
    mkdirSync(paths.sessionDir(TEST_PROJECT_ROOT, sessionId), { recursive: true });
    state.initStateCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId), 'single', workflows['single'].stages);

    state.updateStateAtomicCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId), (s) => {
      s.stages['DEV'].status = 'active';
      // activeAgents 為空物件
      s.activeAgents = {};
      return s;
    });

    // agentOutput 不含 INSTANCE_ID，activeAgents 為空
    let result;
    expect(() => {
      result = runSubagentStop(sessionId, 'developer', 'VERDICT: pass 完成（無 instanceId）', { cwd: TEST_PROJECT_ROOT });
    }).not.toThrow();

    // hook 正常退出（exit code 0）
    expect(result.exitCode).toBe(0);
    // stage 仍正常處理（收斂）
    const ws = state.readStateCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId));
    expect(ws.stages['DEV'].status).toBe('completed');
  });

  // Scenario 7-1: stage 已 completed 但後續 agent 的 on-stop 仍觸發時只做 cleanup
  test('Scenario 7-1: stage 已 completed + fail，後續 instance on-stop → 結果不改變，只做 cleanup', () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);
    mkdirSync(paths.sessionDir(TEST_PROJECT_ROOT, sessionId), { recursive: true });
    state.initStateCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId), 'single', workflows['single'].stages);

    state.updateStateAtomicCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId), (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'fail';
      s.stages['DEV'].parallelTotal = 3;
      s.stages['DEV'].parallelDone = 1;
      s.activeAgents['developer:bbb002-inst2'] = { agentName: 'developer', stage: 'DEV', startedAt: new Date().toISOString() };
      return s;
    });

    // inst2 的 on-stop 在 stage 已 completed 後到達
    runSubagentStop(sessionId, 'developer', 'VERDICT: pass inst2\n\nINSTANCE_ID: developer:bbb002-inst2', { cwd: TEST_PROJECT_ROOT });

    const ws = state.readStateCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId));
    // 結果不改變
    expect(ws.stages['DEV'].result).toBe('fail');
    expect(ws.stages['DEV'].status).toBe('completed');
    // activeAgents 中的 inst2 被清除
    expect(ws.activeAgents['developer:bbb002-inst2']).toBeUndefined();
    // agent:complete 仍有記錄（不重複記錄 stage:complete）
    const agentEvents = timeline.queryCtx(new SessionContext(TEST_PROJECT_ROOT, sessionId), { type: 'agent:complete' });
    expect(agentEvents.length).toBeGreaterThan(0);
  });
});
