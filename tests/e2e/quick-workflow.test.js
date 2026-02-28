'use strict';
/**
 * quick-workflow.test.js — BDD F4：quick workflow hook 驅動 state 轉移 E2E 測試
 *
 * 驗證 quick workflow（DEV → [REVIEW + TEST] → RETRO）的完整生命週期：
 *   - 初始化：4 個 stage（DEV, REVIEW, TEST, RETRO）
 *   - DEV 完成後 REVIEW 和 TEST 同時放行（並行組）
 *   - 並行組依序完成後偵測到收斂
 *   - RETRO PASS 後所有 stage 完成
 */

const { test, expect, describe, beforeAll, afterAll } = require('bun:test');
const { existsSync, rmSync } = require('fs');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');
const { runOnStart, runInitWorkflow, runPreTask, runSubagentStop, isAllowed } = require('../helpers/hook-runner');

const paths    = require(join(SCRIPTS_LIB, 'paths'));
const stateLib = require(join(SCRIPTS_LIB, 'state'));

// 跨 describe 共用的唯一 sessionId
const SESSION_ID = `e2e-quick-${Date.now()}`;

afterAll(() => {
  rmSync(paths.sessionDir(SESSION_ID), { recursive: true, force: true });
});

// ────────────────────────────────────────────────────────────────────────────
// BDD F4 Scenario 1：初始化 quick workflow 建立 4 個 stage
// ────────────────────────────────────────────────────────────────────────────

describe('BDD F4：初始化 quick workflow 建立 4 個 stage', () => {
  let initResult;

  beforeAll(() => {
    runOnStart(SESSION_ID);
    initResult = runInitWorkflow('quick', SESSION_ID);
  });

  test('init-workflow.js exit code 為 0', () => {
    expect(initResult.exitCode).toBe(0);
  });

  test('stages 包含 DEV、REVIEW、TEST、RETRO（共 4 個）', () => {
    const ws = stateLib.readState(SESSION_ID);
    const stageKeys = Object.keys(ws.stages);
    expect(stageKeys).toContain('DEV');
    expect(stageKeys).toContain('REVIEW');
    expect(stageKeys).toContain('TEST');
    expect(stageKeys).toContain('RETRO');
    expect(stageKeys.length).toBe(4);
  });

  test('所有 stage 初始狀態為 pending', () => {
    const ws = stateLib.readState(SESSION_ID);
    for (const val of Object.values(ws.stages)) {
      expect(val.status).toBe('pending');
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// BDD F4 Scenario 2：DEV 完成後 REVIEW 和 TEST 同時放行（並行組）
// ────────────────────────────────────────────────────────────────────────────

describe('BDD F4：DEV 完成後 REVIEW 和 TEST 同時放行（並行組）', () => {
  let reviewResult;
  let testResult;

  beforeAll(() => {
    // DEV：pre-task + on-stop PASS
    runPreTask(SESSION_ID, { description: '委派 developer 實作功能' });
    runSubagentStop(SESSION_ID, 'ot:developer', 'VERDICT: pass 開發完成');

    // 委派並行組
    reviewResult = runPreTask(SESSION_ID, { description: '委派 code-reviewer 審查程式碼' });
    testResult   = runPreTask(SESSION_ID, { description: '委派 tester 驗證功能' });
  });

  test('委派 code-reviewer 的 pre-task 回傳放行（result 為空字串或 updatedInput 注入）', () => {
    expect(isAllowed(reviewResult.parsed)).toBe(true);
  });

  test('委派 tester 的 pre-task 回傳放行（result 為空字串或 updatedInput 注入）', () => {
    expect(isAllowed(testResult.parsed)).toBe(true);
  });

  test('REVIEW.status 為 active', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['REVIEW'].status).toBe('active');
  });

  test('TEST.status 為 active', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['TEST'].status).toBe('active');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// BDD F4 Scenario 3：並行組依序完成後偵測到收斂
// ────────────────────────────────────────────────────────────────────────────

describe('BDD F4：並行組依序完成後偵測到收斂', () => {
  let firstResult;
  let secondResult;

  beforeAll(() => {
    // REVIEW 先完成（TEST 仍 active）
    firstResult = runSubagentStop(SESSION_ID, 'ot:code-reviewer', 'VERDICT: pass 審查通過，程式碼品質良好');
    // TEST 後完成（觸發收斂）
    secondResult = runSubagentStop(SESSION_ID, 'ot:tester', 'VERDICT: pass 所有測試通過');
  });

  test('第一次 on-stop（REVIEW 完成）：result 不含「所有階段已完成」', () => {
    expect(firstResult.parsed?.result).not.toContain('所有階段已完成');
  });

  test('第一次 on-stop（REVIEW 完成）：REVIEW.status 為 completed', () => {
    // 驗證第一次 on-stop 執行後的狀態（透過第二次 on-stop 後的 state 仍保留）
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['REVIEW'].status).toBe('completed');
  });

  test('第二次 on-stop（TEST 完成）：TEST.status 為 completed', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['TEST'].status).toBe('completed');
  });

  test('第二次 on-stop 後：REVIEW 和 TEST 均為 completed（並行收斂）', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['REVIEW'].status).toBe('completed');
    expect(ws.stages['TEST'].status).toBe('completed');
  });

  test('currentStage 推進至 RETRO', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.currentStage).toBe('RETRO');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// BDD F4 Scenario 4：RETRO PASS 後所有 stage 完成
// ────────────────────────────────────────────────────────────────────────────

describe('BDD F4：RETRO PASS 後所有 stage 完成', () => {
  let result;

  beforeAll(() => {
    // RETRO：pre-task + on-stop PASS
    runPreTask(SESSION_ID, { description: '委派 retrospective 進行回顧' });
    result = runSubagentStop(SESSION_ID, 'ot:retrospective', 'VERDICT: pass 回顧完成，品質良好');
  });

  test('RETRO.status 為 completed', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['RETRO'].status).toBe('completed');
  });

  test('所有 4 個 stage 均為 completed', () => {
    const ws = stateLib.readState(SESSION_ID);
    const allCompleted = Object.values(ws.stages).every((s) => s.status === 'completed');
    expect(allCompleted).toBe(true);
  });

  test('result 含「所有階段已完成」', () => {
    expect(result.parsed?.result).toContain('所有階段已完成');
  });
});
