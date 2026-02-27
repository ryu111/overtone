'use strict';
/**
 * pre-task-parallel.test.js — BDD F6：並行 stage 的 PreToolUse 行為 integration 測試
 *
 * 測試重點：
 *   - DEV 完成後委派 code-reviewer / tester → 放行，stage 設為 active
 *   - 同時委派兩者 → 兩者均放行，均設為 active
 *   - 前置 stage 未完成時委派後置 stage → 阻擋並指明缺少的 stage
 *   - prompt 含 .test.js 路徑時不誤判為 tester（整合驗證）
 */

const { test, expect, describe, afterAll } = require('bun:test');
const { mkdirSync, rmSync } = require('fs');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');
const { runPreTask } = require('../helpers/hook-runner');

const paths   = require(join(SCRIPTS_LIB, 'paths'));
const state   = require(join(SCRIPTS_LIB, 'state'));
const { workflows } = require(join(SCRIPTS_LIB, 'registry'));

// ── session 管理 ──

const SESSION_PREFIX = `test_pre_task_parallel_${Date.now()}`;
let counter = 0;

function newSessionId() {
  return `${SESSION_PREFIX}_${++counter}`;
}

const createdSessions = [];

afterAll(() => {
  for (const sid of createdSessions) {
    rmSync(paths.sessionDir(sid), { recursive: true, force: true });
  }
});

function setupQuickWithDevCompleted() {
  const sessionId = newSessionId();
  createdSessions.push(sessionId);
  mkdirSync(paths.sessionDir(sessionId), { recursive: true });
  state.initState(sessionId, 'quick', workflows['quick'].stages);
  state.updateStateAtomic(sessionId, (s) => {
    s.stages['DEV'].status = 'completed';
    s.stages['DEV'].result = 'pass';
    s.currentStage = 'REVIEW';
    return s;
  });
  return sessionId;
}

// ────────────────────────────────────────────────────────────────────────────
// BDD F6 Scenario 1：DEV 完成後委派 code-reviewer → 放行，REVIEW 設為 active
// ────────────────────────────────────────────────────────────────────────────

describe('BDD F6：DEV 完成後委派 code-reviewer → 放行，REVIEW 設為 active', () => {
  test('pre-task 回傳 result 為空字串，REVIEW.status 為 active，activeAgents 包含 code-reviewer', () => {
    const sessionId = setupQuickWithDevCompleted();

    const result = runPreTask(sessionId, {
      description: '委派 code-reviewer agent 審查程式碼',
      prompt: '請審查以下程式碼...',
    });

    expect(result.parsed?.result).toBe('');

    const ws = state.readState(sessionId);
    expect(ws.stages['REVIEW'].status).toBe('active');
    expect(ws.activeAgents).toHaveProperty('code-reviewer');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// BDD F6 Scenario 2：DEV 完成後委派 tester → 放行，TEST 設為 active
//
// 在 quick workflow 中，TEST 排在 REVIEW 後面（DEV → REVIEW → TEST → RETRO）。
// 要讓 tester 放行，需要先委派 code-reviewer（REVIEW 進入 active），
// 因為 pre-task.js 視 active 前置 stage 為「不跳過」（不阻擋）。
// ────────────────────────────────────────────────────────────────────────────

describe('BDD F6：DEV 完成後委派 tester → 放行，TEST 設為 active', () => {
  test('先委派 reviewer（REVIEW active），再委派 tester → result 為空字串，TEST.status 為 active', () => {
    const sessionId = setupQuickWithDevCompleted();

    // 先委派 code-reviewer，讓 REVIEW 進入 active（pre-task.js 視 active 為不阻擋）
    runPreTask(sessionId, { description: '委派 code-reviewer agent 審查程式碼' });

    // 再委派 tester（REVIEW 已 active，不視為跳過）
    const result = runPreTask(sessionId, {
      description: '委派 tester agent 驗證功能',
      prompt: '請驗證以下功能...',
    });

    expect(result.parsed?.result).toBe('');

    const ws = state.readState(sessionId);
    expect(ws.stages['TEST'].status).toBe('active');
    expect(ws.activeAgents).toHaveProperty('tester');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// BDD F6 Scenario 3：DEV 完成後同時委派 code-reviewer 和 tester → 兩者均放行
// ────────────────────────────────────────────────────────────────────────────

describe('BDD F6：DEV 完成後同時委派 code-reviewer 和 tester → 兩者均放行', () => {
  test('兩次 pre-task 均回傳 result 為空字串，activeAgents 同時包含兩者', () => {
    const sessionId = setupQuickWithDevCompleted();

    const r1 = runPreTask(sessionId, {
      description: '委派 code-reviewer agent 審查程式碼',
    });
    const r2 = runPreTask(sessionId, {
      description: '委派 tester agent 驗證功能',
    });

    // 兩次均放行
    expect(r1.parsed?.result).toBe('');
    expect(r2.parsed?.result).toBe('');

    // 兩個 stage 均為 active
    const ws = state.readState(sessionId);
    expect(ws.stages['REVIEW'].status).toBe('active');
    expect(ws.stages['TEST'].status).toBe('active');

    // activeAgents 同時包含兩者
    expect(ws.activeAgents).toHaveProperty('code-reviewer');
    expect(ws.activeAgents).toHaveProperty('tester');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// BDD F6 Scenario 4：前置 stage 未完成時委派後置 stage agent → 阻擋並指明缺少的 stage
// ────────────────────────────────────────────────────────────────────────────

describe('BDD F6：前置 stage 未完成時委派後置 stage agent → 阻擋', () => {
  test('DEV pending → 委派 code-reviewer → deny，permissionDecisionReason 含 DEV', () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    // quick workflow，DEV 保持 pending（預設）
    state.initState(sessionId, 'quick', workflows['quick'].stages);

    const result = runPreTask(sessionId, {
      description: '委派 code-reviewer agent 審查',
      prompt: '請審查...',
    });

    expect(result.parsed?.hookSpecificOutput).toBeDefined();
    expect(result.parsed?.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(result.parsed?.hookSpecificOutput.permissionDecisionReason).toContain('DEV');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// BDD F6 Scenario 5：prompt 含 .test.js 路徑時不誤判為 tester（整合驗證）
// ────────────────────────────────────────────────────────────────────────────

describe('BDD F6：prompt 含 .test.js 路徑時不誤判為 tester', () => {
  test('description 無 agent 名稱 + prompt 含 .test.js → 放行且 TEST 仍為 pending', () => {
    const sessionId = setupQuickWithDevCompleted();

    const result = runPreTask(sessionId, {
      // description 為一般描述，不含 agent 名稱
      description: '執行程式碼相關任務',
      // prompt 含測試檔案路徑（不應誤判為 tester）
      prompt: '請檢視 tests/unit/foo.test.js 和 tests/integration/bar.test.js 的輸出',
    });

    // 應放行（不阻擋）
    expect(result.parsed?.result).toBe('');

    // TEST.status 仍為 pending（未被誤設為 active）
    const ws = state.readState(sessionId);
    expect(ws.stages['TEST'].status).toBe('pending');

    // activeAgents 不包含 tester
    expect(ws.activeAgents).not.toHaveProperty('tester');
  });
});
