// @sequential
'use strict';
/**
 * debug-workflow.test.js — BDD：debug workflow 3-stage 全路徑 E2E 測試
 *
 * 驗證 debug workflow 的完整狀態機：
 *   DEBUG → DEV → TEST(verify)
 *
 * 測試的核心重點：
 *   - 3 個 stage 的 mode 設定正確（TEST.mode=verify，因 hasDevBefore=true）
 *   - sequential 依序推進
 *   - 所有 stage 完成後工作流結束
 */

const { test, expect, describe, beforeAll, afterAll } = require('bun:test');
const { existsSync, rmSync } = require('fs');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');
const { runOnStart, runInitWorkflow, runPreTask, runSubagentStop } = require('../helpers/hook-runner');

const paths    = require(join(SCRIPTS_LIB, 'paths'));
const stateLib = require(join(SCRIPTS_LIB, 'state'));

// 跨 describe 共用的唯一 sessionId
const SESSION_ID = `e2e-debug-${Date.now()}`;

afterAll(() => {
  rmSync(paths.sessionDir(SESSION_ID), { recursive: true, force: true });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 1：初始化 debug workflow 建立 3 個 stage
// ────────────────────────────────────────────────────────────────────────────

describe('BDD debug：初始化 debug workflow 建立 3 個 stage', () => {
  let initResult;

  beforeAll(() => {
    runOnStart(SESSION_ID);
    initResult = runInitWorkflow('debug', SESSION_ID);
  });

  test('init-workflow.js exit code 為 0', () => {
    expect(initResult.exitCode).toBe(0);
  });

  test('workflow.json 存在', () => {
    expect(existsSync(paths.session.workflow(SESSION_ID))).toBe(true);
  });

  test('stages 包含 DEBUG、DEV、TEST（共 3 個）', () => {
    const ws = stateLib.readState(SESSION_ID);
    const stageKeys = Object.keys(ws.stages);
    expect(stageKeys).toContain('DEBUG');
    expect(stageKeys).toContain('DEV');
    expect(stageKeys).toContain('TEST');
    expect(stageKeys.length).toBe(3);
  });

  test('TEST stage 的 mode 為 verify（DEV 之後，hasDevBefore = true）', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['TEST'].mode).toBe('verify');
  });

  test('所有 stage 初始狀態為 pending', () => {
    const ws = stateLib.readState(SESSION_ID);
    for (const val of Object.values(ws.stages)) {
      expect(val.status).toBe('pending');
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 2：DEBUG → DEV 依序推進
// ────────────────────────────────────────────────────────────────────────────

describe('BDD debug：DEBUG → DEV 依序推進', () => {
  beforeAll(() => {
    // DEBUG：pre-task + on-stop PASS
    runPreTask(SESSION_ID, { description: '委派 debugger 根因分析' });
    runSubagentStop(SESSION_ID, 'ot:debugger', 'VERDICT: pass 根因已找到');

    // DEV：pre-task + on-stop PASS
    runPreTask(SESSION_ID, { description: '委派 developer 修復問題' });
    runSubagentStop(SESSION_ID, 'ot:developer', 'VERDICT: pass 修復完成');
  });

  test('DEBUG.status 為 completed', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['DEBUG'].status).toBe('completed');
  });

  test('DEV.status 為 completed', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['DEV'].status).toBe('completed');
  });

  test('currentStage 推進至 TEST（verify mode）', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.currentStage).toBe('TEST');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 3：TEST(verify) 完成後所有 stage 均為 completed
// ────────────────────────────────────────────────────────────────────────────

describe('BDD debug：TEST(verify) 完成後所有 stage 均為 completed', () => {
  let result;

  beforeAll(() => {
    // TEST（verify mode）：pre-task + on-stop PASS
    runPreTask(SESSION_ID, { description: '委派 tester 驗證修復結果' });
    result = runSubagentStop(SESSION_ID, 'ot:tester', 'VERDICT: pass 所有測試通過');
  });

  test('TEST.status 為 completed（verify mode）', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['TEST'].status).toBe('completed');
  });

  test('所有 3 個 stage 均為 completed', () => {
    const ws = stateLib.readState(SESSION_ID);
    const allCompleted = Object.values(ws.stages).every((s) => s.status === 'completed');
    expect(allCompleted).toBe(true);
    expect(Object.keys(ws.stages).length).toBe(3);
  });

  test('result 含「所有階段已完成」', () => {
    expect(result.parsed?.result).toContain('所有階段已完成');
  });
});
