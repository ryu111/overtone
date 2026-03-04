'use strict';
/**
 * hook-contract.test.js — Hook Contract 整合測試
 *
 * 驗證 Hook 之間的隱含契約（透過 state.js API 模擬 hook 行為）：
 *
 * D1: pre-task.js → on-stop.js 全鏈路
 *   Scenario 1-1: 單一 agent 全鏈路 — pre-task 建立 entry → on-stop 清除 entry → activeAgents 為空
 *   Scenario 1-2: 並行 agent 全鏈路 — 2 個 entry 並行，各自清除對應 entry
 *   Scenario 1-3: Stage 狀態轉換 — pre-task 設 active → on-stop 設 completed（pass verdict）
 *   Scenario 1-4: 失敗時 stage 正確標記 fail，不清除 stage
 *
 * D2: PreCompact → 恢復鏈路
 *   Scenario 2-1: PreCompact 清空 activeAgents → workflow.json activeAgents 為空
 *   Scenario 2-2: 新的 pre-task（清空後）寫入新 entry → 正常顯示
 *   Scenario 2-3: enforceInvariants 不阻擋清空後的合法新 entry
 *   Scenario 2-4: getNextStageHint 壓縮後正確提示（不再「等待」已清除的 agent）
 */

const { describe, it, expect, afterAll, beforeAll } = require('bun:test');
const { join } = require('path');
const { mkdirSync, rmSync } = require('fs');
const { SCRIPTS_LIB } = require('../helpers/paths');

const state = require(join(SCRIPTS_LIB, 'state'));
const paths = require(join(SCRIPTS_LIB, 'paths'));
const { stages, parallelGroups } = require(join(SCRIPTS_LIB, 'registry'));

// ── session 管理 ──

const SESSION_PREFIX = `test_hook_contract_${Date.now()}`;
let counter = 0;
const createdSessions = [];

function newSessionId() {
  const id = `${SESSION_PREFIX}_${++counter}`;
  createdSessions.push(id);
  mkdirSync(paths.sessionDir(id), { recursive: true });
  return id;
}

afterAll(() => {
  for (const sid of createdSessions) {
    rmSync(paths.sessionDir(sid), { recursive: true, force: true });
  }
});

// ── 輔助函式：模擬 pre-task.js 的核心狀態寫入行為 ──

/**
 * 模擬 pre-task.js 寫入 activeAgents[instanceId] + 設 stage.status=active
 * @param {string} sessionId
 * @param {string} instanceId - 格式 agentName:timestamp-random
 * @param {string} agentName
 * @param {string} stageBase - 如 'DEV', 'REVIEW'
 * @param {number|null} parallelTotal - 並行總數，null 為單 agent
 */
function simulatePreTask(sessionId, instanceId, agentName, stageBase, parallelTotal = null) {
  state.updateStateAtomic(sessionId, (s) => {
    s.activeAgents[instanceId] = {
      agentName,
      stage: stageBase,
      startedAt: new Date().toISOString(),
    };

    // 找到對應 stage key 並設 active
    const stageKey = Object.keys(s.stages).find((k) =>
      k.split(':')[0] === stageBase &&
      (s.stages[k].status === 'pending' || s.stages[k].status === 'active')
    );
    if (stageKey && s.stages[stageKey]) {
      s.stages[stageKey].status = 'active';
      if (parallelTotal !== null && !isNaN(parallelTotal)) {
        s.stages[stageKey].parallelTotal = Math.max(s.stages[stageKey].parallelTotal || 0, parallelTotal);
      }
    }
    return s;
  });
}

/**
 * 模擬 on-stop.js 的核心狀態清理行為（pass verdict）
 * @param {string} sessionId
 * @param {string} instanceId - 從 agentOutput 解析的 instanceId
 * @param {string} agentName
 * @param {string} stageBase
 * @param {'pass'|'fail'|'reject'} verdict
 */
function simulateOnStop(sessionId, instanceId, agentName, stageBase, verdict = 'pass') {
  // activeAgents cleanup
  state.updateStateAtomic(sessionId, (s) => {
    if (instanceId && s.activeAgents[instanceId]) {
      delete s.activeAgents[instanceId];
    } else {
      // fallback：找最早登記的同名 instance
      const candidates = Object.keys(s.activeAgents || {})
        .filter((k) => (s.activeAgents[k]?.agentName || k.split(':')[0]) === agentName)
        .sort();
      const fallbackKey = candidates[0] || null;
      if (fallbackKey) {
        delete s.activeAgents[fallbackKey];
      }
    }
    return s;
  });

  // stage 狀態更新
  state.updateStateAtomic(sessionId, (s) => {
    const stageKey = Object.keys(s.stages).find((k) => {
      const base = k.split(':')[0];
      return base === stageBase && (s.stages[k].status === 'active' || s.stages[k].status === 'pending');
    });
    if (!stageKey) return s;

    const entry = s.stages[stageKey];
    entry.parallelDone = (entry.parallelDone || 0) + 1;

    if (verdict === 'fail' || verdict === 'reject') {
      Object.assign(entry, { status: 'completed', result: verdict, completedAt: new Date().toISOString() });
      if (verdict === 'fail') s.failCount = (s.failCount || 0) + 1;
      else if (verdict === 'reject') s.rejectCount = (s.rejectCount || 0) + 1;
    } else {
      // pass：收斂門檢查
      const isConverged = !entry.parallelTotal || entry.parallelDone >= entry.parallelTotal;
      if (isConverged) {
        Object.assign(entry, { status: 'completed', result: 'pass', completedAt: new Date().toISOString() });
        const nextPending = Object.keys(s.stages).find((k) => s.stages[k].status === 'pending');
        if (nextPending) s.currentStage = nextPending;
      }
    }
    return s;
  });
}

// ══════════════════════════════════════════════════════════════════
// D1: pre-task.js → on-stop.js 全鏈路
// ══════════════════════════════════════════════════════════════════

describe('D1: pre-task → on-stop 全鏈路', () => {

  // Scenario 1-1: 單一 agent 全鏈路
  it('Scenario 1-1: 單一 agent 全鏈路 — pre-task 建立 entry → on-stop 清除 entry → activeAgents 為空', () => {
    const sessionId = newSessionId();
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW']);

    const instanceId = 'developer:abc123-xyz';

    // 模擬 pre-task
    simulatePreTask(sessionId, instanceId, 'developer', 'DEV');

    let ws = state.readState(sessionId);
    // activeAgents 應有此 entry
    expect(ws.activeAgents[instanceId]).toBeDefined();
    expect(ws.activeAgents[instanceId].agentName).toBe('developer');
    // stage 應設為 active
    expect(ws.stages['DEV'].status).toBe('active');

    // 模擬 on-stop
    simulateOnStop(sessionId, instanceId, 'developer', 'DEV', 'pass');

    ws = state.readState(sessionId);
    // activeAgents 應清空
    expect(ws.activeAgents[instanceId]).toBeUndefined();
    expect(Object.keys(ws.activeAgents)).toHaveLength(0);
    // stage 應設為 completed
    expect(ws.stages['DEV'].status).toBe('completed');
    expect(ws.stages['DEV'].result).toBe('pass');
  });

  // Scenario 1-2: 並行 agent 全鏈路
  it('Scenario 1-2: 並行 agent 全鏈路 — 第 1 個 on-stop 只清除對應 entry，第 2 個清除剩餘', () => {
    const sessionId = newSessionId();
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW']);

    const instanceId1 = 'developer:parallel001-aaa';
    const instanceId2 = 'developer:parallel002-bbb';

    // 兩個並行 pre-task（parallelTotal=2）
    simulatePreTask(sessionId, instanceId1, 'developer', 'DEV', 2);
    simulatePreTask(sessionId, instanceId2, 'developer', 'DEV', 2);

    let ws = state.readState(sessionId);
    expect(Object.keys(ws.activeAgents)).toHaveLength(2);
    expect(ws.stages['DEV'].parallelTotal).toBe(2);

    // 第 1 個 on-stop
    simulateOnStop(sessionId, instanceId1, 'developer', 'DEV', 'pass');

    ws = state.readState(sessionId);
    // 第 1 個 entry 被清除，第 2 個仍在
    expect(ws.activeAgents[instanceId1]).toBeUndefined();
    expect(ws.activeAgents[instanceId2]).toBeDefined();
    // 未完全收斂，stage 仍為 active
    expect(ws.stages['DEV'].status).toBe('active');
    expect(ws.stages['DEV'].parallelDone).toBe(1);

    // 第 2 個 on-stop
    simulateOnStop(sessionId, instanceId2, 'developer', 'DEV', 'pass');

    ws = state.readState(sessionId);
    // 兩個 entry 都被清除
    expect(Object.keys(ws.activeAgents)).toHaveLength(0);
    // 已收斂，stage 完成
    expect(ws.stages['DEV'].status).toBe('completed');
    expect(ws.stages['DEV'].result).toBe('pass');
    expect(ws.stages['DEV'].parallelDone).toBe(2);
  });

  // Scenario 1-3: Stage 狀態轉換
  it('Scenario 1-3: Stage 狀態轉換 — pre-task 設 active → on-stop 設 completed（pass verdict）', () => {
    const sessionId = newSessionId();
    state.initState(sessionId, 'single', ['DEV']);

    const instanceId = 'developer:stateflow001';

    // 初始狀態
    let ws = state.readState(sessionId);
    expect(ws.stages['DEV'].status).toBe('pending');

    // pre-task 後狀態
    simulatePreTask(sessionId, instanceId, 'developer', 'DEV');
    ws = state.readState(sessionId);
    expect(ws.stages['DEV'].status).toBe('active');

    // on-stop 後狀態
    simulateOnStop(sessionId, instanceId, 'developer', 'DEV', 'pass');
    ws = state.readState(sessionId);
    expect(ws.stages['DEV'].status).toBe('completed');
    expect(ws.stages['DEV'].result).toBe('pass');
    expect(ws.stages['DEV'].completedAt).toBeDefined();
  });

  // Scenario 1-4: 失敗不清除殘留 — on-stop fail 後 stage 正確標記
  it('Scenario 1-4: on-stop fail 後 stage 標記 fail，failCount 遞增', () => {
    const sessionId = newSessionId();
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW']);

    const instanceId = 'developer:failtest001';

    simulatePreTask(sessionId, instanceId, 'developer', 'DEV');
    simulateOnStop(sessionId, instanceId, 'developer', 'DEV', 'fail');

    const ws = state.readState(sessionId);
    // activeAgents 清除（on-stop 仍清除 activeAgent）
    expect(ws.activeAgents[instanceId]).toBeUndefined();
    // stage 標記 fail
    expect(ws.stages['DEV'].status).toBe('completed');
    expect(ws.stages['DEV'].result).toBe('fail');
    // failCount 遞增
    expect(ws.failCount).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════
// D2: PreCompact → 恢復鏈路
// ══════════════════════════════════════════════════════════════════

describe('D2: PreCompact → 恢復鏈路', () => {

  // Scenario 2-1: PreCompact 清空 activeAgents
  it('Scenario 2-1: PreCompact 清空 activeAgents → workflow.json activeAgents 為空', () => {
    const sessionId = newSessionId();
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW']);

    // 注入一個 activeAgent（模擬壓縮前正在執行的 agent）
    state.updateStateAtomic(sessionId, (s) => {
      s.activeAgents['developer:before-compact'] = {
        agentName: 'developer',
        stage: 'DEV',
        startedAt: new Date().toISOString(),
      };
      return s;
    });

    let ws = state.readState(sessionId);
    expect(Object.keys(ws.activeAgents)).toHaveLength(1);

    // 模擬 PreCompact 清空 activeAgents（pre-compact.js 的行為）
    state.updateStateAtomic(sessionId, (s) => { s.activeAgents = {}; return s; });

    ws = state.readState(sessionId);
    expect(Object.keys(ws.activeAgents)).toHaveLength(0);
  });

  // Scenario 2-2: 新的 pre-task（清空後）寫入新 entry → 正常顯示
  it('Scenario 2-2: 壓縮後新的 pre-task 可正常寫入新 entry', () => {
    const sessionId = newSessionId();
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW']);

    // 模擬 PreCompact 清空
    state.updateStateAtomic(sessionId, (s) => { s.activeAgents = {}; return s; });

    // 壓縮後新的 pre-task
    const newInstanceId = 'developer:after-compact001';
    simulatePreTask(sessionId, newInstanceId, 'developer', 'DEV');

    const ws = state.readState(sessionId);
    expect(ws.activeAgents[newInstanceId]).toBeDefined();
    expect(ws.activeAgents[newInstanceId].agentName).toBe('developer');
  });

  // Scenario 2-3: enforceInvariants 不阻擋合法的新 entry
  it('Scenario 2-3: enforceInvariants 不阻擋壓縮後合法的新 activeAgent entry', () => {
    const sessionId = newSessionId();
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW']);

    // 模擬 PreCompact 清空
    state.updateStateAtomic(sessionId, (s) => { s.activeAgents = {}; return s; });

    // 注入合法 activeAgent（stage DEV 存在於 stages 中）
    state.updateStateAtomic(sessionId, (s) => {
      s.activeAgents['developer:legit001'] = {
        agentName: 'developer',
        stage: 'DEV',
        startedAt: new Date().toISOString(),
      };
      return s;
    });

    // enforceInvariants 透過 updateStateAtomic 觸發，合法 entry 不被移除
    state.updateStateAtomic(sessionId, (s) => s);

    const ws = state.readState(sessionId);
    expect(ws.activeAgents['developer:legit001']).toBeDefined();
  });

  // Scenario 2-4: getNextStageHint 壓縮後正確提示（不再「等待」已清除的 agent）
  it('Scenario 2-4: getNextStageHint 壓縮後不顯示等待已清除 agent 的提示', () => {
    const sessionId = newSessionId();
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW']);

    // 注入一個 activeAgent（壓縮前有 agent 在執行）
    state.updateStateAtomic(sessionId, (s) => {
      s.activeAgents['developer:before-compact'] = {
        agentName: 'developer',
        stage: 'DEV',
        startedAt: new Date().toISOString(),
      };
      return s;
    });

    let ws = state.readState(sessionId);
    // 壓縮前 hint 顯示「等待並行 agent 完成」
    const hintBefore = state.getNextStageHint(ws, { stages, parallelGroups });
    expect(hintBefore).toContain('等待');

    // 模擬 PreCompact 清空 activeAgents
    state.updateStateAtomic(sessionId, (s) => { s.activeAgents = {}; return s; });

    ws = state.readState(sessionId);
    // 壓縮後 hint 不再顯示等待
    const hintAfter = state.getNextStageHint(ws, { stages, parallelGroups });
    expect(hintAfter).not.toContain('等待');
    // 應提示執行下一步
    expect(hintAfter).not.toBeNull();
  });
});
