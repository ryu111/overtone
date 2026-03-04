'use strict';
/**
 * state-sanitize.test.js
 *
 * Feature: state.sanitize() — session 啟動時清理殘留不一致狀態
 *
 * Scenario 1: session 不存在時回傳 null
 * Scenario 2: 無不一致狀態時回傳 { fixed: [], state } 且不寫入檔案
 * Scenario 3: 孤兒 activeAgent（stage key 不在 stages 中）被清除
 * Scenario 4: 合法的 activeAgent（stage key 存在）不被清除
 * Scenario 5: completedAt 存在但 status 非 completed 時 status 被修正為 completed
 * Scenario 6: 複合情況：孤兒 activeAgent + status 不一致同時修復
 * Scenario 7: sanitize() 已匯出（module.exports 包含 sanitize）
 */

const { describe, it, expect, afterAll } = require('bun:test');
const { join } = require('path');
const { mkdirSync, rmSync } = require('fs');
const { SCRIPTS_LIB } = require('../helpers/paths');

const state = require(join(SCRIPTS_LIB, 'state'));
const paths = require(join(SCRIPTS_LIB, 'paths'));

// ── session 管理 ──

const SESSION_PREFIX = `test_sanitize_${Date.now()}`;
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

// ────────────────────────────────────────────────────────────────────────────
// Scenario 1: session 不存在時回傳 null
// ────────────────────────────────────────────────────────────────────────────

describe('Scenario 1: session 不存在時回傳 null', () => {
  it('不存在的 sessionId 回傳 null', () => {
    const result = state.sanitize('nonexistent_sanitize_session_xyz');
    expect(result).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 2: 無不一致狀態時回傳 { fixed: [], state } 且不修改檔案
// ────────────────────────────────────────────────────────────────────────────

describe('Scenario 2: 無不一致狀態時 fixed 為空陣列', () => {
  it('乾淨的 state 回傳 fixed 為空陣列', () => {
    const sessionId = newSessionId();
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW']);

    const result = state.sanitize(sessionId);
    expect(result).not.toBeNull();
    expect(result.fixed).toEqual([]);
  });

  it('乾淨的 state 回傳 state 物件與當前 state 相同', () => {
    const sessionId = newSessionId();
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW']);

    const before = state.readState(sessionId);
    const result = state.sanitize(sessionId);
    expect(result.state.workflowType).toBe(before.workflowType);
    expect(result.state.currentStage).toBe(before.currentStage);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 3: 孤兒 activeAgent（stage key 不在 stages 中）被清除
// ────────────────────────────────────────────────────────────────────────────

describe('Scenario 3: 孤兒 activeAgent 被清除', () => {
  it('stage 不在 workflow 中的 activeAgent 被移除', () => {
    const sessionId = newSessionId();
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW']);

    // 注入孤兒 activeAgent（TEST:999 在 stages 中不存在）
    state.writeState(sessionId, {
      ...state.readState(sessionId),
      activeAgents: {
        'tester:orphan001': {
          agentName: 'tester',
          stage: 'TEST:999',
          startedAt: new Date().toISOString(),
        },
      },
    });

    const result = state.sanitize(sessionId);
    expect(result.fixed.length).toBe(1);
    expect(result.fixed[0]).toContain('tester:orphan001');

    const ws = state.readState(sessionId);
    expect(ws.activeAgents['tester:orphan001']).toBeUndefined();
    expect(Object.keys(ws.activeAgents)).toHaveLength(0);
  });

  it('孤兒 activeAgent 移除後 fixed 訊息包含 instanceId', () => {
    const sessionId = newSessionId();
    state.initState(sessionId, 'quick', ['DEV']);

    state.writeState(sessionId, {
      ...state.readState(sessionId),
      activeAgents: {
        'qa:xyz789': {
          agentName: 'qa',
          stage: 'QA',
          startedAt: new Date().toISOString(),
        },
      },
    });

    const result = state.sanitize(sessionId);
    expect(result.fixed[0]).toContain('qa:xyz789');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 4: 合法的 activeAgent（stage key 存在）不被清除
// ────────────────────────────────────────────────────────────────────────────

describe('Scenario 4: 合法的 activeAgent 不被清除', () => {
  it('stage 存在於 workflow 的 activeAgent 保持不變', () => {
    const sessionId = newSessionId();
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW']);

    state.writeState(sessionId, {
      ...state.readState(sessionId),
      activeAgents: {
        'developer:valid001': {
          agentName: 'developer',
          stage: 'DEV',
          startedAt: new Date().toISOString(),
        },
      },
    });

    const result = state.sanitize(sessionId);
    expect(result.fixed).toEqual([]);

    const ws = state.readState(sessionId);
    expect(ws.activeAgents['developer:valid001']).toBeDefined();
    expect(ws.activeAgents['developer:valid001'].agentName).toBe('developer');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 5: completedAt 存在但 status 非 completed 時 status 被修正
// ────────────────────────────────────────────────────────────────────────────

describe('Scenario 5: completedAt 存在但 status 非 completed 時修正', () => {
  it('completedAt 存在但 status 為 active 時修正為 completed', () => {
    const sessionId = newSessionId();
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW']);

    // 直接寫入 status 不一致的 state（completedAt 存在但 status 為 active）
    const s = state.readState(sessionId);
    s.stages['DEV'].completedAt = new Date().toISOString();
    s.stages['DEV'].status = 'active'; // 不一致：有 completedAt 卻是 active
    state.writeState(sessionId, s);

    const result = state.sanitize(sessionId);
    expect(result.fixed.length).toBe(1);
    expect(result.fixed[0]).toContain('DEV');
    expect(result.fixed[0]).toContain('completed');

    const ws = state.readState(sessionId);
    expect(ws.stages['DEV'].status).toBe('completed');
  });

  it('正常的 completed stage（status 與 completedAt 一致）不被觸動', () => {
    const sessionId = newSessionId();
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW']);

    state.updateStateAtomic(sessionId, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].completedAt = new Date().toISOString();
      s.stages['DEV'].result = 'pass';
      return s;
    });

    const result = state.sanitize(sessionId);
    expect(result.fixed).toEqual([]);

    const ws = state.readState(sessionId);
    expect(ws.stages['DEV'].status).toBe('completed');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 6: 複合情況 — 孤兒 activeAgent + status 不一致同時修復
// ────────────────────────────────────────────────────────────────────────────

describe('Scenario 6: 複合情況同時修復', () => {
  it('孤兒 activeAgent 和 status 不一致同時被修復', () => {
    const sessionId = newSessionId();
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW']);

    const s = state.readState(sessionId);
    // 注入孤兒 activeAgent
    s.activeAgents['tester:orphan999'] = {
      agentName: 'tester',
      stage: 'TEST:999',
      startedAt: new Date().toISOString(),
    };
    // 注入 status 不一致
    s.stages['REVIEW'].completedAt = new Date().toISOString();
    s.stages['REVIEW'].status = 'pending'; // 有 completedAt 卻是 pending
    state.writeState(sessionId, s);

    const result = state.sanitize(sessionId);
    expect(result.fixed.length).toBe(2);

    const ws = state.readState(sessionId);
    expect(ws.activeAgents['tester:orphan999']).toBeUndefined();
    expect(ws.stages['REVIEW'].status).toBe('completed');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 8: 孤兒 active stage（status=active 但無對應 activeAgents）被修復（規則 3）
// ────────────────────────────────────────────────────────────────────────────

describe('Scenario 8: 孤兒 active stage 被修復（規則 3）', () => {
  it('無 completedAt 的孤兒 active stage 修正為 pending', () => {
    const sessionId = newSessionId();
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW']);

    // 注入孤兒 active stage（無 completedAt、無 activeAgents）
    const s = state.readState(sessionId);
    s.stages['DEV'].status = 'active';
    s.activeAgents = {};
    state.writeState(sessionId, s);

    const result = state.sanitize(sessionId);
    expect(result.fixed.length).toBe(1);
    expect(result.fixed[0]).toContain('DEV');
    expect(result.fixed[0]).toContain('pending');

    const ws = state.readState(sessionId);
    expect(ws.stages['DEV'].status).toBe('pending');
  });

  it('有 completedAt 的孤兒 active stage 修正為 completed', () => {
    const sessionId = newSessionId();
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW']);

    // 注入有 completedAt 但 status 仍為 active 的孤兒 stage
    const s = state.readState(sessionId);
    s.stages['DEV'].status = 'active';
    s.stages['DEV'].completedAt = new Date().toISOString();
    s.stages['DEV'].result = 'pass';
    s.activeAgents = {};
    state.writeState(sessionId, s);

    const result = state.sanitize(sessionId);
    // 規則 2 會先修復（completedAt 存在但 status 非 completed）
    // 無論哪條規則先觸發，最終 status 應為 completed
    const ws = state.readState(sessionId);
    expect(ws.stages['DEV'].status).toBe('completed');
    expect(result.fixed.length).toBeGreaterThan(0);
  });

  it('有對應 activeAgent 的 active stage 不被修復', () => {
    const sessionId = newSessionId();
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW']);

    // 注入 active stage + 對應 activeAgent
    const s = state.readState(sessionId);
    s.stages['DEV'].status = 'active';
    s.activeAgents = {
      'developer:valid001': {
        agentName: 'developer',
        stage: 'DEV',
        startedAt: new Date().toISOString(),
      },
    };
    state.writeState(sessionId, s);

    const result = state.sanitize(sessionId);
    expect(result.fixed).toEqual([]);

    const ws = state.readState(sessionId);
    expect(ws.stages['DEV'].status).toBe('active'); // 維持 active
  });

  it('固定訊息格式包含 stage key 和修正方向', () => {
    const sessionId = newSessionId();
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW']);

    const s = state.readState(sessionId);
    s.stages['REVIEW'].status = 'active';
    s.activeAgents = {};
    state.writeState(sessionId, s);

    const result = state.sanitize(sessionId);
    expect(result.fixed.length).toBe(1);
    // fixed 訊息應包含 stage key 和目標狀態
    expect(result.fixed[0]).toContain('REVIEW');
    expect(result.fixed[0]).toContain('active');
    expect(result.fixed[0]).toContain('pending');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 7: sanitize() 已匯出
// ────────────────────────────────────────────────────────────────────────────

describe('Scenario 7: sanitize() 已匯出', () => {
  it('state.sanitize 是函式', () => {
    expect(typeof state.sanitize).toBe('function');
  });

  it('sanitize() 回傳值包含 fixed 陣列和 state 物件', () => {
    const sessionId = newSessionId();
    state.initState(sessionId, 'single', ['DEV']);

    const result = state.sanitize(sessionId);
    expect(Array.isArray(result.fixed)).toBe(true);
    expect(typeof result.state).toBe('object');
    expect(result.state).not.toBeNull();
  });
});
