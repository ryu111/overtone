'use strict';
/**
 * statusline-state.test.js
 *
 * 驗證 plugins/overtone/scripts/lib/statusline-state.js 的 update() 和 read() 函數邏輯。
 *
 * Scenario 1: agent:start 兩次 + agent:stop 一次 → activeAgents 剩一個
 * Scenario 2: workflow:init → 設定 workflowType + 清空 activeAgents + idle=false
 * Scenario 3: turn:stop → idle=true
 * Scenario 4: agent:start → idle=false
 * Scenario 5: read() 無檔案 → null
 * Scenario 6: read('') → null
 * Scenario 7: agent:stop 不存在的 key → 不影響
 */

const { test, expect, describe, afterEach } = require('bun:test');
const { join } = require('path');
const { mkdirSync, rmSync, existsSync, writeFileSync, utimesSync } = require('fs');
const { homedir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const statuslineState = require(join(SCRIPTS_LIB, 'statusline-state'));

// ── session 管理 ──

const SESSION_PREFIX = `sl-test-${Date.now()}`;
let counter = 0;
const createdSessions = [];

function newSessionId() {
  const sid = `${SESSION_PREFIX}-${++counter}-${Math.random().toString(36).slice(2, 6)}`;
  createdSessions.push(sid);
  return sid;
}

afterEach(() => {
  // 每個測試後清理本次新增的 session 目錄
  const SESSIONS_DIR = join(homedir(), '.overtone', 'sessions');
  for (const sid of createdSessions.splice(0)) {
    const dir = join(SESSIONS_DIR, sid);
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

// ────────────────────────────────────────────────────────────────────────────

describe('statusline-state update()', () => {
  test('Scenario 1: agent:start 兩次 + agent:stop 一次 → activeAgents 剩一個', () => {
    const sid = newSessionId();

    statuslineState.update(sid, 'agent:start', { stageKey: 'DEV:1' });
    statuslineState.update(sid, 'agent:start', { stageKey: 'TEST:1' });
    statuslineState.update(sid, 'agent:stop', { stageKey: 'DEV:1' });

    const state = statuslineState.read(sid);
    expect(state.activeAgents).toEqual(['TEST:1']);
  });

  test('Scenario 2: workflow:init → 設定 workflowType + 清空 activeAgents + idle=false', () => {
    const sid = newSessionId();

    // 先加一些 agent，再執行 workflow:init
    statuslineState.update(sid, 'agent:start', { stageKey: 'DEV:1' });
    statuslineState.update(sid, 'workflow:init', { workflowType: 'standard' });

    const state = statuslineState.read(sid);
    expect(state.workflowType).toBe('standard');
    expect(state.activeAgents).toEqual([]);
    expect(state.idle).toBe(false);
  });

  test('Scenario 3: turn:stop → idle=true', () => {
    const sid = newSessionId();

    statuslineState.update(sid, 'turn:stop');

    const state = statuslineState.read(sid);
    expect(state.idle).toBe(true);
  });

  test('Scenario 4: agent:start → idle=false', () => {
    const sid = newSessionId();

    // 先設成 idle
    statuslineState.update(sid, 'turn:stop');
    expect(statuslineState.read(sid).idle).toBe(true);

    // agent:start 應該把 idle 設回 false
    statuslineState.update(sid, 'agent:start', { stageKey: 'DEV:1' });

    const state = statuslineState.read(sid);
    expect(state.idle).toBe(false);
  });

  test('Scenario 7: agent:stop 不存在的 key → 不影響現有 activeAgents', () => {
    const sid = newSessionId();

    statuslineState.update(sid, 'agent:start', { stageKey: 'DEV:1' });
    statuslineState.update(sid, 'agent:stop', { stageKey: 'NONEXISTENT:99' });

    const state = statuslineState.read(sid);
    expect(state.activeAgents).toEqual(['DEV:1']);
  });
});

describe('statusline-state read()', () => {
  test('Scenario 5: read() 無檔案 → null', () => {
    const sid = newSessionId();
    // 不建立任何檔案，直接讀
    const result = statuslineState.read(sid);
    expect(result).toBeNull();
  });

  test('Scenario 6: read(\'\') → null', () => {
    const result = statuslineState.read('');
    expect(result).toBeNull();
  });
});

// ── TTL 測試輔助 ──

const SESSIONS_DIR = join(homedir(), '.overtone', 'sessions');
const TTL_MS = 10 * 60 * 1000;

function writeSlStateWithMtime(sessionId, stateData, mtimeMs) {
  const sessionDir = join(SESSIONS_DIR, sessionId);
  mkdirSync(sessionDir, { recursive: true });
  const p = join(sessionDir, 'statusline-state.json');
  writeFileSync(p, JSON.stringify(stateData));
  // utimesSync 接受秒數（浮點）
  const mtimeSec = mtimeMs / 1000;
  utimesSync(p, mtimeSec, mtimeSec);
}

// ── Feature: TTL 過期機制 ──

describe('statusline-state TTL 過期機制', () => {
  test('TTL-1: idle=true 且 mtime 超過 TTL → null', () => {
    const sid = newSessionId();
    const expiredMtime = Date.now() - TTL_MS - 1000; // 超過 10 分鐘
    writeSlStateWithMtime(sid, { idle: true, activeAgents: [], workflowType: 'quick' }, expiredMtime);

    const result = statuslineState.read(sid);
    expect(result).toBeNull();
  });

  test('TTL-2: idle=false 且 mtime 超過 TTL → 回傳 state（不過期）', () => {
    const sid = newSessionId();
    const expiredMtime = Date.now() - TTL_MS - 1000;
    writeSlStateWithMtime(sid, { idle: false, activeAgents: ['DEV'], workflowType: 'quick' }, expiredMtime);

    const result = statuslineState.read(sid);
    expect(result).not.toBeNull();
    expect(result.idle).toBe(false);
    expect(result.activeAgents).toContain('DEV');
  });

  test('TTL-3: idle=true 且 mtime 在 TTL 內 → 回傳 state（未過期）', () => {
    const sid = newSessionId();
    const freshMtime = Date.now() - 60 * 1000; // 1 分鐘前（未過期）
    writeSlStateWithMtime(sid, { idle: true, activeAgents: [], workflowType: 'standard' }, freshMtime);

    const result = statuslineState.read(sid);
    expect(result).not.toBeNull();
    expect(result.idle).toBe(true);
  });

  test('TTL-4: 檔案不存在 → null（既有行為）', () => {
    const sid = newSessionId();
    // 不建立任何檔案
    const result = statuslineState.read(sid);
    expect(result).toBeNull();
  });

  test('TTL-5: sessionId 為空（空字串/null/undefined）→ null', () => {
    expect(statuslineState.read('')).toBeNull();
    expect(statuslineState.read(null)).toBeNull();
    expect(statuslineState.read(undefined)).toBeNull();
  });

  test('TTL-6: mtime 剛好等於 TTL 邊界 → null（>= 條件包含邊界）', () => {
    const sid = newSessionId();
    const exactBoundaryMtime = Date.now() - TTL_MS; // 剛好等於 TTL
    writeSlStateWithMtime(sid, { idle: true, activeAgents: [], workflowType: null }, exactBoundaryMtime);

    const result = statuslineState.read(sid);
    expect(result).toBeNull();
  });

  test('TTL-7: 過期狀態呼叫 update() 後 read() 恢復正常', () => {
    const sid = newSessionId();
    const expiredMtime = Date.now() - TTL_MS - 5000;
    writeSlStateWithMtime(sid, { idle: true, activeAgents: [], workflowType: 'quick' }, expiredMtime);

    // 確認目前過期
    expect(statuslineState.read(sid)).toBeNull();

    // 呼叫 update()，觸發 write()，mtime 更新
    statuslineState.update(sid, 'agent:start', { stageKey: 'DEV' });

    const result = statuslineState.read(sid);
    expect(result).not.toBeNull();
    expect(result.idle).toBe(false);
    expect(result.activeAgents).toContain('DEV');
  });
});
