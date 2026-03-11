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
 * Scenario 9: 被跳過的 pending stage — TEST:2 並行收斂遺留問題（規則 4）
 */

const { describe, it, expect, afterEach } = require('bun:test');
const { join } = require('path');
const { mkdirSync, rmSync, mkdtempSync } = require('fs');
const { tmpdir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const state = require(join(SCRIPTS_LIB, 'state'));
const paths = require(join(SCRIPTS_LIB, 'paths'));

// ── session 管理（並行安全：每個測試有獨立 projectRoot）──

const SESSION_PREFIX = `test_sanitize_${Date.now()}`;
let counter = 0;
// 每個 test 的 projectRoot 清單，afterEach 清理
let currentProjectRoot = null;

afterEach(() => {
  if (currentProjectRoot) {
    rmSync(currentProjectRoot, { recursive: true, force: true });
    currentProjectRoot = null;
  }
});

function newSession() {
  const projectRoot = mkdtempSync(join(tmpdir(), 'state-sanitize-'));
  currentProjectRoot = projectRoot;
  const id = `${SESSION_PREFIX}_${++counter}`;
  mkdirSync(paths.sessionDir(projectRoot, id), { recursive: true });
  return { projectRoot, id };
}

// ────────────────────────────────────────────────────────────────────────────
// Scenario 1: session 不存在時回傳 null
// ────────────────────────────────────────────────────────────────────────────

describe('Scenario 1: session 不存在時回傳 null', () => {
  it('不存在的 sessionId 回傳 null', () => {
    const { projectRoot } = newSession();
    const result = state.sanitize(projectRoot, 'nonexistent_sanitize_session_xyz');
    expect(result).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 2: 無不一致狀態時回傳 { fixed: [], state } 且不修改檔案
// ────────────────────────────────────────────────────────────────────────────

describe('Scenario 2: 無不一致狀態時 fixed 為空陣列', () => {
  it('乾淨的 state 回傳 fixed 為空陣列', () => {
    const { projectRoot, id } = newSession();
    state.initState(projectRoot, id, 'quick', ['DEV', 'REVIEW']);

    const result = state.sanitize(projectRoot, id);
    expect(result).not.toBeNull();
    expect(result.fixed).toEqual([]);
  });

  it('乾淨的 state 回傳 state 物件與當前 state 相同', () => {
    const { projectRoot, id } = newSession();
    state.initState(projectRoot, id, 'quick', ['DEV', 'REVIEW']);

    const before = state.readState(projectRoot, id);
    const result = state.sanitize(projectRoot, id);
    expect(result.state.workflowType).toBe(before.workflowType);
    expect(result.state.currentStage).toBe(before.currentStage);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 3: 孤兒 activeAgent（stage key 不在 stages 中）被清除
// ────────────────────────────────────────────────────────────────────────────

describe('Scenario 3: 孤兒 activeAgent 被清除', () => {
  it('stage 不在 workflow 中的 activeAgent 被移除', () => {
    const { projectRoot, id } = newSession();
    state.initState(projectRoot, id, 'quick', ['DEV', 'REVIEW']);

    // 注入孤兒 activeAgent（TEST:999 在 stages 中不存在）
    state.writeState(projectRoot, id, {
      ...state.readState(projectRoot, id),
      activeAgents: {
        'tester:orphan001': {
          agentName: 'tester',
          stage: 'TEST:999',
          startedAt: new Date().toISOString(),
        },
      },
    });

    const result = state.sanitize(projectRoot, id);
    expect(result.fixed.length).toBe(1);
    expect(result.fixed[0]).toContain('tester:orphan001');

    const ws = state.readState(projectRoot, id);
    expect(ws.activeAgents['tester:orphan001']).toBeUndefined();
    expect(Object.keys(ws.activeAgents)).toHaveLength(0);
  });

  it('孤兒 activeAgent 移除後 fixed 訊息包含 instanceId', () => {
    const { projectRoot, id } = newSession();
    state.initState(projectRoot, id, 'quick', ['DEV']);

    state.writeState(projectRoot, id, {
      ...state.readState(projectRoot, id),
      activeAgents: {
        'qa:xyz789': {
          agentName: 'qa',
          stage: 'QA',
          startedAt: new Date().toISOString(),
        },
      },
    });

    const result = state.sanitize(projectRoot, id);
    expect(result.fixed[0]).toContain('qa:xyz789');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 4: 合法的 activeAgent（stage key 存在）不被清除
// ────────────────────────────────────────────────────────────────────────────

describe('Scenario 4: 合法的 activeAgent 不被清除', () => {
  it('stage 存在於 workflow 的 activeAgent 保持不變', () => {
    const { projectRoot, id } = newSession();
    state.initState(projectRoot, id, 'quick', ['DEV', 'REVIEW']);

    state.writeState(projectRoot, id, {
      ...state.readState(projectRoot, id),
      activeAgents: {
        'developer:valid001': {
          agentName: 'developer',
          stage: 'DEV',
          startedAt: new Date().toISOString(),
        },
      },
    });

    const result = state.sanitize(projectRoot, id);
    expect(result.fixed).toEqual([]);

    const ws = state.readState(projectRoot, id);
    expect(ws.activeAgents['developer:valid001']).toBeDefined();
    expect(ws.activeAgents['developer:valid001'].agentName).toBe('developer');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 5: completedAt 存在但 status 非 completed 時 status 被修正
// ────────────────────────────────────────────────────────────────────────────

describe('Scenario 5: completedAt 存在但 status 非 completed 時修正', () => {
  it('completedAt 存在但 status 為 active 時修正為 completed', () => {
    const { projectRoot, id } = newSession();
    state.initState(projectRoot, id, 'quick', ['DEV', 'REVIEW']);

    // 直接寫入 status 不一致的 state（completedAt 存在但 status 為 active）
    const s = state.readState(projectRoot, id);
    s.stages['DEV'].completedAt = new Date().toISOString();
    s.stages['DEV'].status = 'active'; // 不一致：有 completedAt 卻是 active
    state.writeState(projectRoot, id, s);

    const result = state.sanitize(projectRoot, id);
    expect(result.fixed.length).toBe(1);
    expect(result.fixed[0]).toContain('DEV');
    expect(result.fixed[0]).toContain('completed');

    const ws = state.readState(projectRoot, id);
    expect(ws.stages['DEV'].status).toBe('completed');
  });

  it('正常的 completed stage（status 與 completedAt 一致）不被觸動', () => {
    const { projectRoot, id } = newSession();
    state.initState(projectRoot, id, 'quick', ['DEV', 'REVIEW']);

    state.updateStateAtomic(projectRoot, id, null, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].completedAt = new Date().toISOString();
      s.stages['DEV'].result = 'pass';
      return s;
    });

    const result = state.sanitize(projectRoot, id);
    expect(result.fixed).toEqual([]);

    const ws = state.readState(projectRoot, id);
    expect(ws.stages['DEV'].status).toBe('completed');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 6: 複合情況 — 孤兒 activeAgent + status 不一致同時修復
// ────────────────────────────────────────────────────────────────────────────

describe('Scenario 6: 複合情況同時修復', () => {
  it('孤兒 activeAgent 和 status 不一致同時被修復', () => {
    const { projectRoot, id } = newSession();
    state.initState(projectRoot, id, 'quick', ['DEV', 'REVIEW']);

    const s = state.readState(projectRoot, id);
    // 注入孤兒 activeAgent
    s.activeAgents['tester:orphan999'] = {
      agentName: 'tester',
      stage: 'TEST:999',
      startedAt: new Date().toISOString(),
    };
    // 注入 status 不一致
    s.stages['REVIEW'].completedAt = new Date().toISOString();
    s.stages['REVIEW'].status = 'pending'; // 有 completedAt 卻是 pending
    state.writeState(projectRoot, id, s);

    const result = state.sanitize(projectRoot, id);
    expect(result.fixed.length).toBe(2);

    const ws = state.readState(projectRoot, id);
    expect(ws.activeAgents['tester:orphan999']).toBeUndefined();
    expect(ws.stages['REVIEW'].status).toBe('completed');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 8: 孤兒 active stage（status=active 但無對應 activeAgents）被修復（規則 3）
// ────────────────────────────────────────────────────────────────────────────

describe('Scenario 8: 孤兒 active stage 被修復（規則 3）', () => {
  it('無 completedAt 的孤兒 active stage 修正為 pending', () => {
    const { projectRoot, id } = newSession();
    state.initState(projectRoot, id, 'quick', ['DEV', 'REVIEW']);

    // 注入孤兒 active stage（無 completedAt、無 activeAgents）
    const s = state.readState(projectRoot, id);
    s.stages['DEV'].status = 'active';
    s.activeAgents = {};
    state.writeState(projectRoot, id, s);

    const result = state.sanitize(projectRoot, id);
    expect(result.fixed.length).toBe(1);
    expect(result.fixed[0]).toContain('DEV');
    expect(result.fixed[0]).toContain('pending');

    const ws = state.readState(projectRoot, id);
    expect(ws.stages['DEV'].status).toBe('pending');
  });

  it('有 completedAt 的孤兒 active stage 修正為 completed', () => {
    const { projectRoot, id } = newSession();
    state.initState(projectRoot, id, 'quick', ['DEV', 'REVIEW']);

    // 注入有 completedAt 但 status 仍為 active 的孤兒 stage
    const s = state.readState(projectRoot, id);
    s.stages['DEV'].status = 'active';
    s.stages['DEV'].completedAt = new Date().toISOString();
    s.stages['DEV'].result = 'pass';
    s.activeAgents = {};
    state.writeState(projectRoot, id, s);

    const result = state.sanitize(projectRoot, id);
    // 規則 2 會先修復（completedAt 存在但 status 非 completed）
    // 無論哪條規則先觸發，最終 status 應為 completed
    const ws = state.readState(projectRoot, id);
    expect(ws.stages['DEV'].status).toBe('completed');
    expect(result.fixed.length).toBeGreaterThan(0);
  });

  it('有對應 activeAgent 的 active stage 不被修復', () => {
    const { projectRoot, id } = newSession();
    state.initState(projectRoot, id, 'quick', ['DEV', 'REVIEW']);

    // 注入 active stage + 對應 activeAgent
    const s = state.readState(projectRoot, id);
    s.stages['DEV'].status = 'active';
    s.activeAgents = {
      'developer:valid001': {
        agentName: 'developer',
        stage: 'DEV',
        startedAt: new Date().toISOString(),
      },
    };
    state.writeState(projectRoot, id, s);

    const result = state.sanitize(projectRoot, id);
    expect(result.fixed).toEqual([]);

    const ws = state.readState(projectRoot, id);
    expect(ws.stages['DEV'].status).toBe('active'); // 維持 active
  });

  it('固定訊息格式包含 stage key 和修正方向', () => {
    const { projectRoot, id } = newSession();
    state.initState(projectRoot, id, 'quick', ['DEV', 'REVIEW']);

    const s = state.readState(projectRoot, id);
    s.stages['REVIEW'].status = 'active';
    s.activeAgents = {};
    state.writeState(projectRoot, id, s);

    const result = state.sanitize(projectRoot, id);
    expect(result.fixed.length).toBe(1);
    // fixed 訊息應包含 stage key 和目標狀態
    expect(result.fixed[0]).toContain('REVIEW');
    expect(result.fixed[0]).toContain('active');
    expect(result.fixed[0]).toContain('pending');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 9: 被跳過的 pending stage（規則 4）— TEST:2 並行收斂遺留問題
// ────────────────────────────────────────────────────────────────────────────

describe('Scenario 9: TEST:2 status=pending 但 currentStage 已推進到更後面（規則 4）', () => {
  it('驗收標準 1：TEST:2 status=active 且無 activeAgents → 修復為 pending（由規則 3 處理）', () => {
    const { projectRoot, id } = newSession();
    // standard workflow: PLAN, ARCH, TEST, DEV, REVIEW, TEST:2, RETRO, DOCS
    state.initState(projectRoot, id, 'standard', ['PLAN', 'ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST', 'RETRO', 'DOCS']);

    const s = state.readState(projectRoot, id);
    // 設定 TEST:2 status=active、無 activeAgents
    s.stages['TEST:2'].status = 'active';
    s.activeAgents = {};
    state.writeState(projectRoot, id, s);

    const result = state.sanitize(projectRoot, id);
    const ws = state.readState(projectRoot, id);
    // 規則 3 應將 active（無 activeAgents）修復為 pending
    expect(ws.stages['TEST:2'].status).toBe('pending');
    expect(result.fixed.some((msg) => msg.includes('TEST:2'))).toBe(true);
  });

  it('驗收標準 2：TEST:2 status=pending 且 REVIEW completed 且 currentStage=RETRO → 修復為 completed', () => {
    const { projectRoot, id } = newSession();
    state.initState(projectRoot, id, 'standard', ['PLAN', 'ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST', 'RETRO', 'DOCS']);

    // 模擬：前置 stages 全部 completed，REVIEW completed，TEST:2 pending 被跳過，currentStage=RETRO
    state.writeState(projectRoot, id, {
      ...state.readState(projectRoot, id),
      currentStage: 'RETRO',
      stages: {
        'PLAN':   { status: 'completed', result: 'pass', completedAt: new Date().toISOString() },
        'ARCH':   { status: 'completed', result: 'pass', completedAt: new Date().toISOString() },
        'TEST':   { status: 'completed', result: 'pass', completedAt: new Date().toISOString(), mode: 'spec' },
        'DEV':    { status: 'completed', result: 'pass', completedAt: new Date().toISOString() },
        'REVIEW': { status: 'completed', result: 'pass', completedAt: new Date().toISOString() },
        'TEST:2': { status: 'pending', result: null, mode: 'verify' },  // 被跳過的遺留
        'RETRO':  { status: 'pending', result: null },
        'DOCS':   { status: 'pending', result: null },
      },
    });

    const result = state.sanitize(projectRoot, id);
    const ws = state.readState(projectRoot, id);

    expect(ws.stages['TEST:2'].status).toBe('completed');
    expect(result.fixed.some((msg) => msg.includes('TEST:2'))).toBe(true);
    expect(result.fixed.some((msg) => msg.includes('RETRO'))).toBe(true);
  });

  it('驗收標準 3：正常 workflow（TEST:2 pending, REVIEW 也 pending）→ 不改變 TEST:2', () => {
    const { projectRoot, id } = newSession();
    state.initState(projectRoot, id, 'standard', ['PLAN', 'ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST', 'RETRO', 'DOCS']);

    // 正常狀態：DEV completed，currentStage=REVIEW（並行群組開始），TEST:2 pending
    state.writeState(projectRoot, id, {
      ...state.readState(projectRoot, id),
      currentStage: 'REVIEW',
      stages: {
        'PLAN':   { status: 'completed', result: 'pass', completedAt: new Date().toISOString() },
        'ARCH':   { status: 'completed', result: 'pass', completedAt: new Date().toISOString() },
        'TEST':   { status: 'completed', result: 'pass', completedAt: new Date().toISOString(), mode: 'spec' },
        'DEV':    { status: 'completed', result: 'pass', completedAt: new Date().toISOString() },
        'REVIEW': { status: 'pending', result: null },  // currentStage
        'TEST:2': { status: 'pending', result: null, mode: 'verify' },  // 並行群組成員，正常 pending
        'RETRO':  { status: 'pending', result: null },
        'DOCS':   { status: 'pending', result: null },
      },
    });

    const result = state.sanitize(projectRoot, id);
    const ws = state.readState(projectRoot, id);

    // TEST:2 在 currentStage (REVIEW) 之後，不應被修改
    expect(ws.stages['TEST:2'].status).toBe('pending');
    // REVIEW 是 currentStage，其前的都已 completed，不觸發規則 4
    expect(result.fixed).toEqual([]);
  });

  it('currentStage=DOCS 時，所有前置 pending stage 都被修復', () => {
    const { projectRoot, id } = newSession();
    state.initState(projectRoot, id, 'standard', ['PLAN', 'ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST', 'RETRO', 'DOCS']);

    state.writeState(projectRoot, id, {
      ...state.readState(projectRoot, id),
      currentStage: 'DOCS',
      stages: {
        'PLAN':   { status: 'completed', result: 'pass', completedAt: new Date().toISOString() },
        'ARCH':   { status: 'completed', result: 'pass', completedAt: new Date().toISOString() },
        'TEST':   { status: 'completed', result: 'pass', completedAt: new Date().toISOString(), mode: 'spec' },
        'DEV':    { status: 'completed', result: 'pass', completedAt: new Date().toISOString() },
        'REVIEW': { status: 'completed', result: 'pass', completedAt: new Date().toISOString() },
        'TEST:2': { status: 'pending', result: null, mode: 'verify' },  // 遺留
        'RETRO':  { status: 'completed', result: 'pass', completedAt: new Date().toISOString() },
        'DOCS':   { status: 'pending', result: null },  // currentStage
      },
    });

    const result = state.sanitize(projectRoot, id);
    const ws = state.readState(projectRoot, id);

    expect(ws.stages['TEST:2'].status).toBe('completed');
    expect(ws.stages['RETRO'].status).toBe('completed');  // 已有 completedAt，不受影響
    expect(ws.stages['DOCS'].status).toBe('pending');  // currentStage，不受影響
    expect(result.fixed.some((msg) => msg.includes('TEST:2'))).toBe(true);
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
    const { projectRoot, id } = newSession();
    state.initState(projectRoot, id, 'single', ['DEV']);

    const result = state.sanitize(projectRoot, id);
    expect(Array.isArray(result.fixed)).toBe(true);
    expect(typeof result.state).toBe('object');
    expect(result.state).not.toBeNull();
  });
});
