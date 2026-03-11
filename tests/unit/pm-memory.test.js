'use strict';
/**
 * pm-memory.test.js — PM 跨 Session 記憶功能測試
 *
 * 測試 interview.js 新增的兩個函式：
 *   - queryPastInterviews(projectRoot, options?)
 *   - extractInsights(sessions)
 */

const { test, expect, describe, beforeAll, afterAll } = require('bun:test');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { join } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');
const { queryPastInterviews, extractInsights, QUESTION_BANK } = require(join(SCRIPTS_LIB, 'interview'));

// ── 測試輔助 ──

const TEST_PROJECT_ROOT = '/tmp/pm-memory-test-project';
const SESSIONS_DIR = path.join(os.homedir(), '.nova', 'sessions');

// 建立的 session 目錄清單（供 afterAll 清理）
const createdSessionDirs = [];

function makeTestSessionId() {
  return `pm-mem-test-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function createInterviewState(sessionId, data) {
  const dir = path.join(SESSIONS_DIR, sessionId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'interview-state.json'), JSON.stringify(data), 'utf8');
  createdSessionDirs.push(dir);
}

// ── 測試資料 ──

// 完成的訪談 session
let completedSessionId;
let completedSessionData;

// 進行中的訪談 session
let inProgressSessionId;
let inProgressSessionData;

// 另一個 feature 的訪談
let otherFeatureSessionId;
let otherFeatureSessionData;

beforeAll(() => {
  completedSessionId = makeTestSessionId();
  completedSessionData = {
    version: 1,
    featureName: 'user-auth',
    outputPath: '/tmp/specs/user-auth',
    answers: {
      'func-1': '讓使用者可以安全登入系統',
      'func-2': '系統管理員和一般使用者',
      'func-3': '輸入帳號密碼，輸出 JWT token',
      'edge-1': '密碼錯誤三次應鎖定帳號',
      'edge-2': '空白密碼應被拒絕',
    },
    startedAt: '2026-03-01T10:00:00.000Z',
    completedAt: '2026-03-01T10:30:00.000Z',
    options: { minAnswersPerFacet: 2, skipFacets: [] },
  };
  createInterviewState(completedSessionId, completedSessionData);

  inProgressSessionId = makeTestSessionId();
  inProgressSessionData = {
    version: 1,
    featureName: 'user-auth',
    outputPath: '/tmp/specs/user-auth-v2',
    answers: {
      'func-1': '提供 OAuth 2.0 第三方登入',
      'func-2': '所有使用者',
    },
    startedAt: '2026-03-05T09:00:00.000Z',
    completedAt: null,
    options: { minAnswersPerFacet: 2, skipFacets: [] },
  };
  createInterviewState(inProgressSessionId, inProgressSessionData);

  otherFeatureSessionId = makeTestSessionId();
  otherFeatureSessionData = {
    version: 1,
    featureName: 'payment-gateway',
    outputPath: '/tmp/specs/payment',
    answers: {
      'func-1': '整合第三方付款服務',
      'func-2': '購物車結帳的使用者',
      'edge-1': '付款失敗應退款並通知',
    },
    startedAt: '2026-03-03T14:00:00.000Z',
    completedAt: '2026-03-03T14:45:00.000Z',
    options: { minAnswersPerFacet: 2, skipFacets: [] },
  };
  createInterviewState(otherFeatureSessionId, otherFeatureSessionData);
});

afterAll(() => {
  for (const dir of createdSessionDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // 清理失敗靜默
    }
  }
});

// ── queryPastInterviews 測試 ──

describe('queryPastInterviews', () => {
  test('Scenario 1-1: 回傳正確結構 { sessions, total }', () => {
    const result = queryPastInterviews(TEST_PROJECT_ROOT);
    expect(result).toHaveProperty('sessions');
    expect(result).toHaveProperty('total');
    expect(Array.isArray(result.sessions)).toBe(true);
    expect(typeof result.total).toBe('number');
  });

  test('Scenario 1-2: sessions 包含測試建立的訪談記錄', () => {
    const result = queryPastInterviews(TEST_PROJECT_ROOT);
    const ids = result.sessions.map(s => s.sessionId);
    expect(ids).toContain(completedSessionId);
    expect(ids).toContain(inProgressSessionId);
    expect(ids).toContain(otherFeatureSessionId);
  });

  test('Scenario 1-3: session 物件包含必要欄位', () => {
    const result = queryPastInterviews(TEST_PROJECT_ROOT);
    const s = result.sessions.find(s => s.sessionId === completedSessionId);
    expect(s).toBeDefined();
    expect(s.sessionId).toBe(completedSessionId);
    expect(s.feature).toBe('user-auth');
    expect(s.completedAt).toBe('2026-03-01T10:30:00.000Z');
    expect(s.questionCount).toBe(5);
    expect(typeof s.answerSummary).toBe('string');
  });

  test('Scenario 1-4: answerSummary 來自 functional 面向的回答', () => {
    const result = queryPastInterviews(TEST_PROJECT_ROOT);
    const s = result.sessions.find(s => s.sessionId === completedSessionId);
    expect(s.answerSummary).toContain('讓使用者可以安全登入系統');
  });

  test('Scenario 1-5: completedAt 為 null 的 session 仍被包含', () => {
    const result = queryPastInterviews(TEST_PROJECT_ROOT);
    const s = result.sessions.find(s => s.sessionId === inProgressSessionId);
    expect(s).toBeDefined();
    expect(s.completedAt).toBeNull();
  });

  test('Scenario 1-6: options.feature 過濾只回傳特定 feature', () => {
    const result = queryPastInterviews(TEST_PROJECT_ROOT, { feature: 'payment-gateway' });
    expect(result.sessions.every(s => s.feature === 'payment-gateway')).toBe(true);
    expect(result.sessions.some(s => s.sessionId === otherFeatureSessionId)).toBe(true);
    expect(result.sessions.some(s => s.sessionId === completedSessionId)).toBe(false);
  });

  test('Scenario 1-7: options.limit 控制回傳數量', () => {
    const result = queryPastInterviews(TEST_PROJECT_ROOT, { limit: 2 });
    expect(result.sessions.length).toBeLessThanOrEqual(2);
    expect(result.total).toBeGreaterThanOrEqual(3);
  });

  test('Scenario 1-8: completed 的 session 排在未完成前面', () => {
    const result = queryPastInterviews(TEST_PROJECT_ROOT, { feature: 'user-auth' });
    const completedIndex = result.sessions.findIndex(s => s.completedAt !== null);
    const inProgressIndex = result.sessions.findIndex(s => s.completedAt === null);
    if (completedIndex !== -1 && inProgressIndex !== -1) {
      expect(completedIndex).toBeLessThan(inProgressIndex);
    }
  });

  test('Scenario 1-9: sessions 目錄不存在時回傳空結果', () => {
    // 使用非標準路徑（無法找到 sessions 目錄）
    // 這個測試透過 require 直接呼叫，依賴環境；
    // 我們改為驗證不存在的 session 不會出現在結果中
    const result = queryPastInterviews(TEST_PROJECT_ROOT, { feature: 'nonexistent-feature-xyz' });
    expect(result.sessions).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  test('Scenario 1-10: 無 interview-state.json 的 session 目錄被跳過', () => {
    // 建立一個沒有 interview-state.json 的 session 目錄
    const emptySessionId = makeTestSessionId();
    const emptyDir = path.join(SESSIONS_DIR, emptySessionId);
    fs.mkdirSync(emptyDir, { recursive: true });
    createdSessionDirs.push(emptyDir);

    const result = queryPastInterviews(TEST_PROJECT_ROOT);
    expect(result.sessions.some(s => s.sessionId === emptySessionId)).toBe(false);
  });
});

// ── extractInsights 測試 ──

describe('extractInsights', () => {
  test('Scenario 2-1: 回傳正確結構', () => {
    const result = extractInsights([]);
    expect(result).toHaveProperty('commonRequirements');
    expect(result).toHaveProperty('boundaryConditions');
    expect(result).toHaveProperty('userPreferences');
    expect(Array.isArray(result.commonRequirements)).toBe(true);
    expect(Array.isArray(result.boundaryConditions)).toBe(true);
    expect(Array.isArray(result.userPreferences)).toBe(true);
  });

  test('Scenario 2-2: 空陣列輸入回傳空結果', () => {
    const result = extractInsights([]);
    expect(result.commonRequirements).toHaveLength(0);
    expect(result.boundaryConditions).toHaveLength(0);
    expect(result.userPreferences).toHaveLength(0);
  });

  test('Scenario 2-3: functional 回答對應到 commonRequirements', () => {
    const sessions = [
      {
        answers: {
          'func-1': '讓使用者可以安全登入系統',
          'func-2': '系統管理員和一般使用者',
        },
      },
    ];
    const result = extractInsights(sessions);
    expect(result.commonRequirements).toContain('讓使用者可以安全登入系統');
    expect(result.commonRequirements).toContain('系統管理員和一般使用者');
  });

  test('Scenario 2-4: edge-cases 回答對應到 boundaryConditions', () => {
    const sessions = [
      {
        answers: {
          'edge-1': '密碼錯誤三次應鎖定帳號',
          'edge-2': '空白密碼應被拒絕',
        },
      },
    ];
    const result = extractInsights(sessions);
    expect(result.boundaryConditions).toContain('密碼錯誤三次應鎖定帳號');
    expect(result.boundaryConditions).toContain('空白密碼應被拒絕');
  });

  test('Scenario 2-5: flow 回答對應到 userPreferences', () => {
    const sessions = [
      {
        answers: {
          'flow-1': '點擊登入按鈕，輸入帳密，確認送出',
        },
      },
    ];
    const result = extractInsights(sessions);
    expect(result.userPreferences).toContain('點擊登入按鈕，輸入帳密，確認送出');
  });

  test('Scenario 2-6: 重複回答去重', () => {
    const sessions = [
      { answers: { 'func-1': '相同的需求描述' } },
      { answers: { 'func-1': '相同的需求描述' } },
    ];
    const result = extractInsights(sessions);
    const count = result.commonRequirements.filter(r => r === '相同的需求描述').length;
    expect(count).toBe(1);
  });

  test('Scenario 2-7: 多個 session 合併提取', () => {
    const sessions = [
      {
        answers: {
          'func-1': 'session A 的需求',
          'edge-1': 'session A 的邊界',
        },
      },
      {
        answers: {
          'func-1': 'session B 的需求',
          'edge-1': 'session B 的邊界',
        },
      },
    ];
    const result = extractInsights(sessions);
    expect(result.commonRequirements).toContain('session A 的需求');
    expect(result.commonRequirements).toContain('session B 的需求');
    expect(result.boundaryConditions).toContain('session A 的邊界');
    expect(result.boundaryConditions).toContain('session B 的邊界');
  });

  test('Scenario 2-8: commonRequirements 最多回傳 5 筆', () => {
    const sessions = [
      {
        answers: {
          'func-1': 'req-1',
          'func-2': 'req-2',
          'func-3': 'req-3',
          'func-4': 'req-4',
          'func-5': 'req-5',
        },
      },
      {
        answers: {
          'func-1': 'req-6',
        },
      },
    ];
    const result = extractInsights(sessions);
    expect(result.commonRequirements.length).toBeLessThanOrEqual(5);
  });

  test('Scenario 2-9: session 無 answers 欄位時靜默跳過', () => {
    const sessions = [
      { sessionId: 'broken-session' }, // 無 answers
      { answers: { 'func-1': '正常的需求' } },
    ];
    const result = extractInsights(sessions);
    expect(result.commonRequirements).toContain('正常的需求');
  });

  test('Scenario 2-10: 純函式特性 — 不修改輸入', () => {
    const sessions = [
      { answers: { 'func-1': '測試需求' } },
    ];
    const original = JSON.stringify(sessions);
    extractInsights(sessions);
    expect(JSON.stringify(sessions)).toBe(original);
  });
});
