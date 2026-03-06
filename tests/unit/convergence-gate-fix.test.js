'use strict';
/**
 * convergence-gate-fix.test.js
 *
 * BDD spec: specs/features/in-progress/convergence-gate-fix/bdd.md
 *
 * Feature A: 收斂門根因修復（findActualStageKey 移入 updateStateAtomic）
 *   Scenario A-1: 兩個並行 agent 依序完成，stage 正確標記 completed
 *   Scenario A-2: 後到者補位場景 — 先到者已將 stage 標記 completed+pass
 *   Scenario A-3: callback 內無匹配 stage，安全 early exit 不修改 state
 *
 * Feature B: Mid-session sanitize（pre-task 委派前觸發 sanitize）
 *   Scenario B-1: PreToolUse(Task) 委派前 sanitize 修復孤兒 active stage
 *   Scenario B-2: sanitize 靜默處理 — workflow.json 不存在時不 throw
 *
 * Feature C: 退化場景
 *   Scenario C-1: parallelTotal=1 時正常完成（非並行路徑）
 */

const { describe, it, expect, afterAll } = require('bun:test');
const { join } = require('path');
const { mkdirSync, rmSync, existsSync, readFileSync } = require('fs');

const { SCRIPTS_LIB } = require('../helpers/paths');
const state = require(join(SCRIPTS_LIB, 'state'));
const paths = require(join(SCRIPTS_LIB, 'paths'));

// ── session 管理 ──

const SESSION_PREFIX = `test_convergence_${Date.now()}`;
let counter = 0;
const createdSessions = [];

function newSessionId() {
  const sid = `${SESSION_PREFIX}_${++counter}`;
  createdSessions.push(sid);
  return sid;
}

afterAll(() => {
  for (const sid of createdSessions) {
    rmSync(paths.sessionDir(sid), { recursive: true, force: true });
  }
});

// ── 輔助函式 ──

function initSession(sessionId, workflowType, stageList, stateOverride = {}) {
  mkdirSync(paths.sessionDir(sessionId), { recursive: true });
  state.initState(sessionId, workflowType, stageList);
  if (Object.keys(stateOverride).length > 0) {
    const current = state.readState(sessionId);
    state.writeState(sessionId, { ...current, ...stateOverride });
  }
  return state.readState(sessionId);
}

// ── 建立模擬 handleAgentStop 環境（直接操作 state，不需要完整 hook 輸出）──
// 測試核心邏輯：findActualStageKey 在 callback 內解析，補位邏輯正確運作

// ──────────────────────────────────────────────────────────────────────────────
// Feature A: 收斂門根因修復
// ──────────────────────────────────────────────────────────────────────────────

describe('Feature A: 收斂門根因修復（findActualStageKey 移入 updateStateAtomic）', () => {

  it('Scenario A-1: 兩個並行 agent 依序完成，parallelDone 正確累計為 2 且 stage 標記 completed', () => {
    const sid = newSessionId();
    initSession(sid, 'quick', ['DEV', 'REVIEW']);

    // 模擬並行 TEST stage（parallelTotal=2，兩個 instance 均 active）
    state.writeState(sid, {
      ...state.readState(sid),
      stages: {
        'TEST:1': { status: 'active', parallelTotal: 2, parallelDone: 0 },
        'TEST:2': { status: 'active', parallelTotal: 2, parallelDone: 0 },
      },
      currentStage: 'TEST:1',
      activeAgents: {
        'tester:inst1': { agentName: 'tester', stage: 'TEST', startedAt: new Date().toISOString() },
        'tester:inst2': { agentName: 'tester', stage: 'TEST', startedAt: new Date().toISOString() },
      },
    });

    // 模擬第一個 agent 完成（TEST:1）— 在 callback 內解析 actualStageKey
    let firstResolved = null;
    state.updateStateAtomic(sid, (s) => {
      const { findActualStageKey, checkSameStageConvergence } = require(join(SCRIPTS_LIB, 'state'));
      firstResolved = findActualStageKey(s, 'TEST');
      if (!firstResolved) return s;
      const entry = s.stages[firstResolved];
      entry.parallelDone = (entry.parallelDone || 0) + 1;
      if (!checkSameStageConvergence(entry)) return s; // 尚未收斂
      Object.assign(entry, { status: 'completed', result: 'pass', completedAt: new Date().toISOString() });
      return s;
    });

    const afterFirst = state.readState(sid);
    expect(firstResolved).not.toBeNull();
    // 第一個完成後 parallelDone=1，未到 parallelTotal=2，stage 仍 active
    expect(afterFirst.stages[firstResolved].parallelDone).toBe(1);
    expect(afterFirst.stages[firstResolved].status).toBe('active');

    // 模擬第二個 agent 完成（TEST:2）
    let secondResolved = null;
    state.updateStateAtomic(sid, (s) => {
      const { findActualStageKey, checkSameStageConvergence } = require(join(SCRIPTS_LIB, 'state'));
      secondResolved = findActualStageKey(s, 'TEST');
      if (!secondResolved) return s;
      const entry = s.stages[secondResolved];
      entry.parallelDone = (entry.parallelDone || 0) + 1;
      if (!checkSameStageConvergence(entry)) return s;
      Object.assign(entry, { status: 'completed', result: 'pass', completedAt: new Date().toISOString() });
      return s;
    });

    const afterSecond = state.readState(sid);
    expect(secondResolved).not.toBeNull();
    // 兩個 instance 使用同一個 stage key（第一個 active 的）
    const stageEntry = afterSecond.stages[secondResolved] || afterSecond.stages[firstResolved];
    expect(stageEntry.parallelDone).toBe(2);
    expect(stageEntry.status).toBe('completed');
    expect(stageEntry.result).toBe('pass');
  });

  it('Scenario A-2: 後到者補位 — 先到者已標記 completed+pass，parallelDone 正確遞增', () => {
    const sid = newSessionId();
    initSession(sid, 'quick', ['DEV', 'REVIEW']);

    // 先到者已完成 TEST:1，parallelDone=1
    state.writeState(sid, {
      ...state.readState(sid),
      stages: {
        'TEST:1': {
          status: 'completed',
          result: 'pass',
          parallelTotal: 2,
          parallelDone: 1,
          completedAt: new Date().toISOString(),
        },
      },
      currentStage: 'TEST:1',
      activeAgents: {},
    });

    // 後到者呼叫，stageKey = 'TEST'，findActualStageKey 找不到 active，走補位邏輯
    let resolvedKey = null;
    state.updateStateAtomic(sid, (s) => {
      const { findActualStageKey } = require(join(SCRIPTS_LIB, 'state'));
      resolvedKey = findActualStageKey(s, 'TEST');
      if (!resolvedKey) {
        // 補位：找 completed+pass 的 stage
        resolvedKey = Object.keys(s.stages).find(
          (k) => (k === 'TEST' || k.startsWith('TEST:')) &&
            s.stages[k].status === 'completed' && s.stages[k].result === 'pass'
        ) || null;
      }
      if (!resolvedKey) return s;
      const entry = s.stages[resolvedKey];
      entry.parallelDone = (entry.parallelDone || 0) + 1;
      return s;
    });

    const finalState = state.readState(sid);
    expect(resolvedKey).toBe('TEST:1');
    expect(finalState.stages['TEST:1'].parallelDone).toBe(2);
    expect(finalState.stages['TEST:1'].parallelDone).toBe(finalState.stages['TEST:1'].parallelTotal);
  });

  it('Scenario A-3: callback 內無匹配 stage，安全 early exit，state 不變', () => {
    const sid = newSessionId();
    initSession(sid, 'quick', ['DEV', 'REVIEW']);

    // 初始 state 中沒有任何 TEST stage
    const before = state.readState(sid);

    let resolvedKey = null;
    let callbackCalled = false;
    expect(() => {
      state.updateStateAtomic(sid, (s) => {
        callbackCalled = true;
        const { findActualStageKey } = require(join(SCRIPTS_LIB, 'state'));
        resolvedKey = findActualStageKey(s, 'TEST');
        if (!resolvedKey) {
          // 補位嘗試
          resolvedKey = Object.keys(s.stages).find(
            (k) => (k === 'TEST' || k.startsWith('TEST:')) &&
              s.stages[k].status === 'completed' && s.stages[k].result === 'pass'
          ) || null;
        }
        if (!resolvedKey) return s; // 安全 early exit
        return s;
      });
    }).not.toThrow();

    expect(callbackCalled).toBe(true);
    expect(resolvedKey).toBeNull();

    // state 的 stages 結構應與 before 相同（DEV 和 REVIEW，無 TEST）
    const after = state.readState(sid);
    expect(Object.keys(after.stages)).toEqual(Object.keys(before.stages));
  });

});

// ──────────────────────────────────────────────────────────────────────────────
// Feature B: Mid-session sanitize
// ──────────────────────────────────────────────────────────────────────────────

describe('Feature B: Mid-session sanitize（pre-task 委派前觸發）', () => {

  it('Scenario B-1: sanitize 修復孤兒 active stage（無對應 activeAgents entry）', () => {
    const sid = newSessionId();
    initSession(sid, 'quick', ['DEV', 'REVIEW']);

    // 製造孤兒 active stage：DEV 為 active 但 activeAgents 為空
    state.writeState(sid, {
      ...state.readState(sid),
      stages: {
        DEV: { status: 'active', parallelTotal: null, parallelDone: 0 },
        REVIEW: { status: 'pending' },
      },
      activeAgents: {}, // 無對應 agent
      currentStage: 'DEV',
    });

    // 呼叫 sanitize（模擬 handlePreTask 在 updateStateAtomic 前呼叫）
    const result = state.sanitize(sid);

    expect(result).not.toBeNull();
    expect(result.fixed.some(msg => msg.includes('孤兒 active stage') && msg.includes('DEV'))).toBe(true);

    const after = state.readState(sid);
    // 無 completedAt → 應修正為 pending
    expect(after.stages.DEV.status).toBe('pending');
  });

  it('Scenario B-2: sanitize 靜默處理 — workflow.json 不存在時回傳 null 不 throw', () => {
    const sid = newSessionId();
    // 建立 session 目錄但不寫入 workflow.json
    mkdirSync(paths.sessionDir(sid), { recursive: true });

    let caughtError = null;
    let result = null;
    try {
      result = state.sanitize(sid);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeNull();
    expect(result).toBeNull(); // readState 回傳 null → sanitize 回傳 null
  });

});

// ──────────────────────────────────────────────────────────────────────────────
// Feature C: 退化場景
// ──────────────────────────────────────────────────────────────────────────────

describe('Feature C: 退化場景', () => {

  it('Scenario C-1: parallelTotal 未設定時 checkSameStageConvergence 回傳 true（單 agent 正常完成）', () => {
    const { checkSameStageConvergence } = require(join(SCRIPTS_LIB, 'state'));

    // parallelTotal 未設定（單 agent 場景）
    const entry = { status: 'active', parallelDone: 1 };
    expect(checkSameStageConvergence(entry)).toBe(true);

    // parallelTotal = 1，parallelDone = 1
    const entry2 = { status: 'active', parallelTotal: 1, parallelDone: 1 };
    expect(checkSameStageConvergence(entry2)).toBe(true);

    // parallelTotal = 2，parallelDone = 1 → 尚未收斂
    const entry3 = { status: 'active', parallelTotal: 2, parallelDone: 1 };
    expect(checkSameStageConvergence(entry3)).toBe(false);
  });

  it('Scenario C-1b: parallelTotal=1 stage 正確標記 completed，不因 parallelTotal 缺失觸發錯誤', () => {
    const sid = newSessionId();
    initSession(sid, 'quick', ['DEV', 'REVIEW']);

    state.writeState(sid, {
      ...state.readState(sid),
      stages: {
        DEV: { status: 'active', parallelTotal: null, parallelDone: 0 },
        REVIEW: { status: 'pending' },
      },
      currentStage: 'DEV',
    });

    expect(() => {
      state.updateStateAtomic(sid, (s) => {
        const { findActualStageKey, checkSameStageConvergence } = require(join(SCRIPTS_LIB, 'state'));
        const key = findActualStageKey(s, 'DEV');
        if (!key) return s;
        const entry = s.stages[key];
        entry.parallelDone = (entry.parallelDone || 0) + 1;
        if (checkSameStageConvergence(entry)) {
          Object.assign(entry, { status: 'completed', result: 'pass', completedAt: new Date().toISOString() });
          const nextPending = Object.keys(s.stages).find((k) => s.stages[k].status === 'pending');
          if (nextPending) s.currentStage = nextPending;
        }
        return s;
      });
    }).not.toThrow();

    const after = state.readState(sid);
    expect(after.stages.DEV.status).toBe('completed');
    expect(after.stages.DEV.result).toBe('pass');
    expect(after.currentStage).toBe('REVIEW');
  });

});
