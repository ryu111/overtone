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

const { describe, it, expect, beforeEach, afterEach } = require('bun:test');
const { join } = require('path');
const { mkdirSync, rmSync } = require('fs');

const { SCRIPTS_LIB } = require('../helpers/paths');
const state = require(join(SCRIPTS_LIB, 'state'));
const SessionContext = require(join(SCRIPTS_LIB, 'session-context'));
const paths = require(join(SCRIPTS_LIB, 'paths'));
const { makeTmpProject, createCtx, setupWorkflow, cleanupProject } = require('../helpers/session-factory');

// ── session 管理（並行安全：每個 test 有獨立 projectRoot）──

let currentProjectRoot = null;

beforeEach(() => {
  currentProjectRoot = makeTmpProject('ot-cgfix');
});

afterEach(() => {
  cleanupProject(currentProjectRoot);
  currentProjectRoot = null;
});

// ── 輔助函式 ──

function initSession(projectRoot, workflowType, stageList, stateOverride = {}) {
  const ctx = createCtx(projectRoot);
  setupWorkflow(ctx, workflowType, stageList);
  if (Object.keys(stateOverride).length > 0) {
    const current = state.readStateCtx(ctx);
    state.writeStateCtx(ctx, { ...current, ...stateOverride });
  }
  return { ctx, current: state.readStateCtx(ctx) };
}

// ──────────────────────────────────────────────────────────────────────────────
// Feature A: 收斂門根因修復
// ──────────────────────────────────────────────────────────────────────────────

describe('Feature A: 收斂門根因修復（findActualStageKey 移入 updateStateAtomic）', () => {

  it('Scenario A-1: 兩個並行 agent 依序完成，parallelDone 正確累計為 2 且 stage 標記 completed', () => {
    const { ctx } = initSession(currentProjectRoot, 'quick', ['DEV', 'REVIEW']);

    // 模擬並行 TEST stage（parallelTotal=2，兩個 instance 均 active）
    state.writeStateCtx(ctx, {
      ...state.readStateCtx(ctx),
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
    state.updateStateAtomicCtx(new SessionContext(currentProjectRoot, ctx.sessionId, ctx.workflowId), (s) => {
      const { findActualStageKey, checkSameStageConvergence } = require(join(SCRIPTS_LIB, 'state'));
      firstResolved = findActualStageKey(s, 'TEST');
      if (!firstResolved) return s;
      const entry = s.stages[firstResolved];
      entry.parallelDone = (entry.parallelDone || 0) + 1;
      if (!checkSameStageConvergence(entry)) return s; // 尚未收斂
      Object.assign(entry, { status: 'completed', result: 'pass', completedAt: new Date().toISOString() });
      return s;
    });

    const afterFirst = state.readStateCtx(ctx);
    expect(firstResolved).not.toBeNull();
    // 第一個完成後 parallelDone=1，未到 parallelTotal=2，stage 仍 active
    expect(afterFirst.stages[firstResolved].parallelDone).toBe(1);
    expect(afterFirst.stages[firstResolved].status).toBe('active');

    // 模擬第二個 agent 完成（TEST:2）
    let secondResolved = null;
    state.updateStateAtomicCtx(new SessionContext(currentProjectRoot, ctx.sessionId, ctx.workflowId), (s) => {
      const { findActualStageKey, checkSameStageConvergence } = require(join(SCRIPTS_LIB, 'state'));
      secondResolved = findActualStageKey(s, 'TEST');
      if (!secondResolved) return s;
      const entry = s.stages[secondResolved];
      entry.parallelDone = (entry.parallelDone || 0) + 1;
      if (!checkSameStageConvergence(entry)) return s;
      Object.assign(entry, { status: 'completed', result: 'pass', completedAt: new Date().toISOString() });
      return s;
    });

    const afterSecond = state.readStateCtx(ctx);
    expect(secondResolved).not.toBeNull();
    // 兩個 instance 使用同一個 stage key（第一個 active 的）
    const stageEntry = afterSecond.stages[secondResolved] || afterSecond.stages[firstResolved];
    expect(stageEntry.parallelDone).toBe(2);
    expect(stageEntry.status).toBe('completed');
    expect(stageEntry.result).toBe('pass');
  });

  it('Scenario A-2: 後到者補位 — 先到者已標記 completed+pass，parallelDone 正確遞增', () => {
    const { ctx } = initSession(currentProjectRoot, 'quick', ['DEV', 'REVIEW']);

    // 先到者已完成 TEST:1，parallelDone=1
    state.writeStateCtx(ctx, {
      ...state.readStateCtx(ctx),
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
    state.updateStateAtomicCtx(new SessionContext(currentProjectRoot, ctx.sessionId, ctx.workflowId), (s) => {
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

    const finalState = state.readStateCtx(ctx);
    expect(resolvedKey).toBe('TEST:1');
    expect(finalState.stages['TEST:1'].parallelDone).toBe(2);
    expect(finalState.stages['TEST:1'].parallelDone).toBe(finalState.stages['TEST:1'].parallelTotal);
  });

  it('Scenario A-3: callback 內無匹配 stage，安全 early exit，state 不變', () => {
    const { ctx } = initSession(currentProjectRoot, 'quick', ['DEV', 'REVIEW']);

    // 初始 state 中沒有任何 TEST stage
    const before = state.readStateCtx(ctx);

    let resolvedKey = null;
    let callbackCalled = false;
    expect(() => {
      state.updateStateAtomicCtx(new SessionContext(currentProjectRoot, ctx.sessionId, ctx.workflowId), (s) => {
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
    const after = state.readStateCtx(ctx);
    expect(Object.keys(after.stages)).toEqual(Object.keys(before.stages));
  });

});

// ──────────────────────────────────────────────────────────────────────────────
// Feature B: Mid-session sanitize
// ──────────────────────────────────────────────────────────────────────────────

describe('Feature B: Mid-session sanitize（pre-task 委派前觸發）', () => {

  it('Scenario B-1: sanitize 修復孤兒 active stage（無對應 activeAgents entry）', () => {
    const { ctx } = initSession(currentProjectRoot, 'quick', ['DEV', 'REVIEW']);

    // 製造孤兒 active stage：DEV 為 active 但 activeAgents 為空
    state.writeStateCtx(ctx, {
      ...state.readStateCtx(ctx),
      stages: {
        DEV: { status: 'active', parallelTotal: null, parallelDone: 0 },
        REVIEW: { status: 'pending' },
      },
      activeAgents: {}, // 無對應 agent
      currentStage: 'DEV',
    });

    // 呼叫 sanitize（模擬 handlePreTask 在 updateStateAtomic 前呼叫）
    const result = state.sanitizeCtx(new SessionContext(currentProjectRoot, ctx.sessionId, ctx.workflowId));

    expect(result).not.toBeNull();
    expect(result.fixed.some(msg => msg.includes('孤兒 active stage') && msg.includes('DEV'))).toBe(true);

    const after = state.readStateCtx(ctx);
    // 無 completedAt → 應修正為 pending
    expect(after.stages.DEV.status).toBe('pending');
  });

  it('Scenario B-2: sanitize 靜默處理 — workflow.json 不存在時回傳 null 不 throw', () => {
    const sessionDir = paths.sessionDir(currentProjectRoot, 'nonexistent-session-xyz');
    // 建立 session 目錄但不寫入 workflow.json
    mkdirSync(sessionDir, { recursive: true });

    let caughtError = null;
    let result = null;
    try {
      result = state.sanitizeCtx(new SessionContext(currentProjectRoot, 'nonexistent-session-xyz', null));
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
    const { ctx } = initSession(currentProjectRoot, 'quick', ['DEV', 'REVIEW']);

    state.writeStateCtx(ctx, {
      ...state.readStateCtx(ctx),
      stages: {
        DEV: { status: 'active', parallelTotal: null, parallelDone: 0 },
        REVIEW: { status: 'pending' },
      },
      currentStage: 'DEV',
    });

    expect(() => {
      state.updateStateAtomicCtx(new SessionContext(currentProjectRoot, ctx.sessionId, ctx.workflowId), (s) => {
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

    const after = state.readStateCtx(ctx);
    expect(after.stages.DEV.status).toBe('completed');
    expect(after.stages.DEV.result).toBe('pass');
    expect(after.currentStage).toBe('REVIEW');
  });

});
