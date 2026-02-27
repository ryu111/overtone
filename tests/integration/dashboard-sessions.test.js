'use strict';
const { test, expect, beforeEach, afterEach, describe } = require('bun:test');
const { mkdirSync, rmSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const SESSIONS_BASE = join(homedir(), '.overtone', 'sessions');

// 使用獨立的測試 session ID 避免污染
const TEST_SESSION = `test_sessions_${Date.now()}`;
const SESSION_DIR = join(SESSIONS_BASE, TEST_SESSION);

const sessions = require(join(SCRIPTS_LIB, 'dashboard', 'sessions'));
const state = require(join(SCRIPTS_LIB, 'state'));

describe('dashboard/sessions.js', () => {
  describe('Scenario 1: 無任何 session 目錄時 listSessions() 回傳空陣列', () => {
    test('SESSIONS_DIR 不存在時優雅處理，不拋出例外', () => {
      // sessions.js 在 readdirSync 失敗時直接 return []
      // 此情境依賴真實環境，只需確認函式呼叫本身不拋出
      expect(() => sessions.listSessions()).not.toThrow();
    });

    test('回傳值必須是陣列', () => {
      const result = sessions.listSessions();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Scenario 2: 有效 session 目錄存在時 listSessions() 包含該 session 摘要', () => {
    beforeEach(() => {
      // 建立 session 目錄並初始化 quick workflow state
      mkdirSync(SESSION_DIR, { recursive: true });
      state.initState(TEST_SESSION, 'quick', ['DEV', 'REVIEW', 'TEST']);
    });

    afterEach(() => {
      rmSync(SESSION_DIR, { recursive: true, force: true });
    });

    test('listSessions() 回傳的陣列包含測試 session', () => {
      const result = sessions.listSessions();
      const found = result.find(s => s.sessionId === TEST_SESSION);
      expect(found).toBeDefined();
    });

    test('session 摘要包含 sessionId 欄位', () => {
      const result = sessions.listSessions();
      const found = result.find(s => s.sessionId === TEST_SESSION);
      expect(found.sessionId).toBe(TEST_SESSION);
    });

    test('session 摘要包含 workflowType 欄位', () => {
      const result = sessions.listSessions();
      const found = result.find(s => s.sessionId === TEST_SESSION);
      expect(found.workflowType).toBe('quick');
    });

    test('session 摘要包含 progress 欄位（completed/total）', () => {
      const result = sessions.listSessions();
      const found = result.find(s => s.sessionId === TEST_SESSION);
      expect(found.progress).toBeDefined();
      expect(typeof found.progress.completed).toBe('number');
      expect(typeof found.progress.total).toBe('number');
    });

    test('progress.total 等於 workflow stage 數量（quick 有 3 個 stage）', () => {
      const result = sessions.listSessions();
      const found = result.find(s => s.sessionId === TEST_SESSION);
      expect(found.progress.total).toBe(3);
    });

    test('剛初始化的 workflow progress.completed 為 0', () => {
      const result = sessions.listSessions();
      const found = result.find(s => s.sessionId === TEST_SESSION);
      expect(found.progress.completed).toBe(0);
    });
  });

  describe('Scenario 3: getSessionSummary() 對不存在的 session 回傳 null', () => {
    test('不存在的 session ID 回傳 null', () => {
      const result = sessions.getSessionSummary('nonexistent-abc-9999');
      expect(result).toBeNull();
    });

    test('回傳 null 而非 undefined 或拋出例外', () => {
      expect(() => sessions.getSessionSummary('nonexistent-abc-9999')).not.toThrow();
      const result = sessions.getSessionSummary('nonexistent-abc-9999');
      expect(result).toBeNull();
    });
  });
});
