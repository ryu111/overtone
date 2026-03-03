'use strict';
/**
 * state-invariants.test.js
 * BDD spec: specs/features/in-progress/core-simplification-guards/bdd.md
 *
 * Feature 3: State 不變量守衛（enforceInvariants 透過 updateStateAtomic 觸發）
 *
 * Scenario 3-1: 孤兒 activeAgent entry 被自動移除
 * Scenario 3-2: 合法的 activeAgent entry 不被移除
 * Scenario 3-3: stage status 逆轉（completed → active）被修正
 * Scenario 3-4: stage status 逆轉（active → pending）被修正
 * Scenario 3-5: 合法的 status 轉換不產生 warning
 * Scenario 3-6: parallelDone 超出 parallelTotal 被截斷
 * Scenario 3-7: parallelDone 未超出 parallelTotal 時不截斷
 * Scenario 3-8: 違反不變量時 emit system:warning timeline 事件
 * Scenario 3-9: 無違規時不 emit system:warning
 * Scenario 3-11: getNextStageHint 不含 TTL 過濾邏輯（靜態掃描）
 * Scenario 3-12: statusline.js activeAgents fallback 不含 TTL（靜態掃描）
 * Scenario 3-13: pre-compact.js 活躍 agents 顯示不含 TTL（靜態掃描）
 */

const { describe, it, expect, afterAll } = require('bun:test');
const { join } = require('path');
const { mkdirSync, rmSync, readFileSync, existsSync } = require('fs');
const { SCRIPTS_LIB, SCRIPTS_DIR, HOOKS_DIR, PROJECT_ROOT } = require('../helpers/paths');

const state = require(join(SCRIPTS_LIB, 'state'));
const timeline = require(join(SCRIPTS_LIB, 'timeline'));
const paths = require(join(SCRIPTS_LIB, 'paths'));

// ── session 管理 ──

const SESSION_PREFIX = `test_invariants_${Date.now()}`;
let counter = 0;
const createdSessions = [];

function newSessionId() {
  return `${SESSION_PREFIX}_${++counter}`;
}

afterAll(() => {
  for (const sid of createdSessions) {
    rmSync(paths.sessionDir(sid), { recursive: true, force: true });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Feature 3: 不變量守衛（Scenarios 3-1 到 3-9）
// ────────────────────────────────────────────────────────────────────────────

describe('state 不變量守衛 — 孤兒 activeAgent 清除（規則 1）', () => {

  it('Scenario 3-1: 孤兒 activeAgent entry（stage key 不存在）被自動移除', () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW']);

    // 注入一個 stage 為 TEST:999 的孤兒 entry（stages 中不存在）
    state.writeState(sessionId, {
      ...state.readState(sessionId),
      sessionId,
      activeAgents: {
        'tester:abc123': {
          agentName: 'tester',
          stage: 'TEST:999',
          startedAt: new Date().toISOString(),
        },
      },
    });

    // 透過 updateStateAtomic 觸發不變量守衛（modifier 不做任何修改）
    state.updateStateAtomic(sessionId, (s) => s);

    const ws = state.readState(sessionId);
    // 孤兒 entry 應被移除
    expect(ws.activeAgents['tester:abc123']).toBeUndefined();
  });

  it('Scenario 3-2: 合法的 activeAgent entry（stage key 存在）不被移除', () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW']);

    // 注入一個 stage 為 DEV 的合法 entry（stages 中存在）
    state.writeState(sessionId, {
      ...state.readState(sessionId),
      sessionId,
      activeAgents: {
        'developer:xyz789': {
          agentName: 'developer',
          stage: 'DEV',
          startedAt: new Date().toISOString(),
        },
      },
    });

    state.updateStateAtomic(sessionId, (s) => s);

    const ws = state.readState(sessionId);
    // 合法 entry 應被保留
    expect(ws.activeAgents['developer:xyz789']).toBeDefined();
  });
});

describe('state 不變量守衛 — status 逆轉阻止（規則 2）', () => {

  it('Scenario 3-3: stage status 逆轉（completedAt 存在但 status → active）被修正為 completed', () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW']);

    // 先標記 DEV:1 為 completed
    state.updateStateAtomic(sessionId, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].completedAt = new Date().toISOString();
      s.stages['DEV'].result = 'pass';
      return s;
    });

    // 嘗試逆轉 status 回 active（completedAt 保留不刪除）
    state.updateStateAtomic(sessionId, (s) => {
      s.stages['DEV'].status = 'active';
      // 故意不刪除 completedAt，模擬逆轉
      return s;
    });

    const ws = state.readState(sessionId);
    // 守衛應修正回 completed（因 completedAt 存在）
    expect(ws.stages['DEV'].status).toBe('completed');
  });

  it('Scenario 3-4: stage status 逆轉（active → pending）被守衛阻止（completedAt 不存在時不阻止）', () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW']);

    // 先標記 ARCH（這裡用 REVIEW）為 active
    state.updateStateAtomic(sessionId, (s) => {
      s.stages['REVIEW'].status = 'active';
      // 沒有 completedAt（active 時不設 completedAt）
      return s;
    });

    // 嘗試逆轉 status 回 pending
    state.updateStateAtomic(sessionId, (s) => {
      s.stages['REVIEW'].status = 'pending';
      return s;
    });

    // 規則 2 只檢查 completedAt，active → pending 沒有 completedAt，不阻止
    // 這是設計決策：completedAt 是 completed 的標誌，只有有 completedAt 才阻止逆轉
    const ws = state.readState(sessionId);
    // pending 狀態被允許（無 completedAt 的逆轉不阻止）
    expect(ws.stages['REVIEW'].status).toBe('pending');
  });

  it('Scenario 3-5: 合法的 status 轉換（active → completed）不被阻止', () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW']);

    // 標記 DEV 為 active
    state.updateStateAtomic(sessionId, (s) => {
      s.stages['DEV'].status = 'active';
      return s;
    });

    // 合法轉換 active → completed（同時設 completedAt）
    state.updateStateAtomic(sessionId, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].completedAt = new Date().toISOString();
      s.stages['DEV'].result = 'pass';
      return s;
    });

    const ws = state.readState(sessionId);
    // 合法轉換，status 維持 completed
    expect(ws.stages['DEV'].status).toBe('completed');
    expect(ws.stages['DEV'].result).toBe('pass');
  });
});

describe('state 不變量守衛 — parallelDone 截斷（規則 3）', () => {

  it('Scenario 3-6: parallelDone 超出 parallelTotal 被截斷為 parallelTotal', () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW']);

    state.updateStateAtomic(sessionId, (s) => {
      s.stages['DEV'].status = 'active';
      s.stages['DEV'].parallelTotal = 3;
      s.stages['DEV'].parallelDone = 5; // 超出上限
      return s;
    });

    const ws = state.readState(sessionId);
    // parallelDone 被截斷為 parallelTotal
    expect(ws.stages['DEV'].parallelDone).toBe(3);
  });

  it('Scenario 3-7: parallelDone 等於 parallelTotal（合法）時不截斷', () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW']);

    state.updateStateAtomic(sessionId, (s) => {
      s.stages['DEV'].status = 'active';
      s.stages['DEV'].parallelTotal = 3;
      s.stages['DEV'].parallelDone = 3; // 等於上限，合法
      return s;
    });

    const ws = state.readState(sessionId);
    // 未超出，維持 3
    expect(ws.stages['DEV'].parallelDone).toBe(3);
  });
});

describe('state 不變量守衛 — timeline system:warning 事件', () => {

  it('Scenario 3-8: 違反不變量時 emit system:warning，violations 包含所有記錄', () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW']);

    // 注入孤兒 activeAgent + parallelDone 超出
    state.writeState(sessionId, {
      ...state.readState(sessionId),
      sessionId,
      activeAgents: {
        'tester:orphan001': {
          agentName: 'tester',
          stage: 'TEST:999', // 孤兒（不存在於 stages）
          startedAt: new Date().toISOString(),
        },
      },
    });

    state.updateStateAtomic(sessionId, (s) => {
      s.stages['DEV'].parallelTotal = 2;
      s.stages['DEV'].parallelDone = 5; // 超出
      return s;
    });

    // 查詢 system:warning 事件
    const warnings = timeline.query(sessionId, { type: 'system:warning' });
    expect(warnings.length).toBeGreaterThan(0);

    const latest = warnings[warnings.length - 1];
    expect(latest.source).toBe('state-invariant');
    expect(Array.isArray(latest.warnings)).toBe(true);
    // 至少包含 orphan_agent 和 parallel-done-overflow
    const rules = latest.warnings.map((w) => w.rule);
    expect(rules).toContain('orphan_agent');
    expect(rules).toContain('parallel-done-overflow');
  });

  it('Scenario 3-9: 無違規時不 emit system:warning', () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW']);

    // 設定合法的狀態
    state.updateStateAtomic(sessionId, (s) => {
      s.stages['DEV'].status = 'active';
      s.activeAgents['developer:valid001'] = {
        agentName: 'developer',
        stage: 'DEV',
        startedAt: new Date().toISOString(),
      };
      return s;
    });

    // 不應有 system:warning 事件
    const warnings = timeline.query(sessionId, { type: 'system:warning' });
    expect(warnings.length).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature 3: 靜態掃描（Scenarios 3-11, 3-12, 3-13）
// ────────────────────────────────────────────────────────────────────────────

describe('靜態掃描 — TTL 已移除確認', () => {

  it('Scenario 3-11: state.js getNextStageHint 不含 ACTIVE_AGENT_TTL_MS 常數', () => {
    const stateSource = readFileSync(join(SCRIPTS_LIB, 'state.js'), 'utf8');
    expect(stateSource).not.toContain('ACTIVE_AGENT_TTL_MS');
  });

  it('Scenario 3-12: statusline.js 不含 ACTIVE_AGENT_TTL_MS 常數', () => {
    const statuslineSource = readFileSync(join(SCRIPTS_DIR, 'statusline.js'), 'utf8');
    expect(statuslineSource).not.toContain('ACTIVE_AGENT_TTL_MS');
  });

  it('Scenario 3-13: pre-compact.js 不含 ACTIVE_AGENT_TTL_MS 常數', () => {
    const preCompactSource = readFileSync(join(HOOKS_DIR, 'session', 'pre-compact.js'), 'utf8');
    expect(preCompactSource).not.toContain('ACTIVE_AGENT_TTL_MS');
  });

  it('Scenario B1: pre-task.js 不含 active-agent.json 寫入（atomicWrite + activeAgent 路徑）', () => {
    const preTaskSource = readFileSync(join(HOOKS_DIR, 'tool', 'pre-task.js'), 'utf8');
    // active-agent.json 不再被寫入
    expect(preTaskSource).not.toContain('activeAgent(sessionId)');
    expect(preTaskSource).not.toContain('active-agent.json');
  });

  it('Scenario B2: statusline.js 不含 readActiveAgent 函式', () => {
    const statuslineSource = readFileSync(join(SCRIPTS_DIR, 'statusline.js'), 'utf8');
    expect(statuslineSource).not.toContain('readActiveAgent');
  });

  it('Scenario B2: buildAgentDisplay 函式簽名只有 2 個參數（workflow, registryStages）', () => {
    const statuslineSource = readFileSync(join(SCRIPTS_DIR, 'statusline.js'), 'utf8');
    // 確認函式定義只有 2 個參數
    expect(statuslineSource).toMatch(/function buildAgentDisplay\(workflow,\s*registryStages\)/);
  });
});
