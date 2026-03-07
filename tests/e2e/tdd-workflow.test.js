// @sequential
'use strict';
/**
 * tdd-workflow.test.js — BDD：tdd workflow 3-stage 全路徑 E2E 測試
 *
 * 驗證 tdd workflow 的完整狀態機：
 *   TEST(spec) → DEV → TEST:2(verify)
 *
 * 測試的核心重點：
 *   - 3 個 stage 的 mode 設定正確（TEST.mode=spec, TEST:2.mode=verify）
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
const SESSION_ID = `e2e-tdd-${Date.now()}`;

afterAll(() => {
  rmSync(paths.sessionDir(SESSION_ID), { recursive: true, force: true });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 1：初始化 tdd workflow 建立 3 個 stage
// ────────────────────────────────────────────────────────────────────────────

describe('BDD tdd：初始化 tdd workflow 建立 3 個 stage', () => {
  let initResult;

  beforeAll(() => {
    runOnStart(SESSION_ID);
    initResult = runInitWorkflow('tdd', SESSION_ID);
  });

  test('init-workflow.js exit code 為 0', () => {
    expect(initResult.exitCode).toBe(0);
  });

  test('workflow.json 存在', () => {
    expect(existsSync(paths.session.workflow(SESSION_ID))).toBe(true);
  });

  test('stages 包含 TEST、DEV、TEST:2（共 3 個）', () => {
    const ws = stateLib.readState(SESSION_ID);
    const stageKeys = Object.keys(ws.stages);
    expect(stageKeys).toContain('TEST');
    expect(stageKeys).toContain('DEV');
    expect(stageKeys).toContain('TEST:2');
    expect(stageKeys.length).toBe(3);
  });

  test('TEST stage 的 mode 為 spec', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['TEST'].mode).toBe('spec');
  });

  test('TEST:2 stage 的 mode 為 verify', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['TEST:2'].mode).toBe('verify');
  });

  test('所有 stage 初始狀態為 pending', () => {
    const ws = stateLib.readState(SESSION_ID);
    for (const val of Object.values(ws.stages)) {
      expect(val.status).toBe('pending');
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 2：TEST(spec) → DEV → TEST:2(verify) sequential 依序推進
// ────────────────────────────────────────────────────────────────────────────

describe('BDD tdd：TEST(spec) → DEV 依序推進', () => {
  beforeAll(() => {
    // TEST（spec mode）：pre-task + on-stop PASS
    runPreTask(SESSION_ID, { description: '委派 tester 撰寫 BDD spec' });
    runSubagentStop(SESSION_ID, 'ot:tester', 'VERDICT: pass BDD spec 完成');

    // DEV：pre-task + on-stop PASS
    runPreTask(SESSION_ID, { description: '委派 developer 實作功能' });
    runSubagentStop(SESSION_ID, 'ot:developer', 'VERDICT: pass 開發完成');
  });

  test('TEST.status 為 completed（spec mode）', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['TEST'].status).toBe('completed');
  });

  test('DEV.status 為 completed', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['DEV'].status).toBe('completed');
  });

  test('currentStage 推進至 TEST:2（verify mode）', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.currentStage).toBe('TEST:2');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 3：TEST:2(verify) 完成後所有 stage 均為 completed
// ────────────────────────────────────────────────────────────────────────────

describe('BDD tdd：TEST:2(verify) 完成後所有 stage 均為 completed', () => {
  let result;

  beforeAll(() => {
    // TEST:2（verify mode）：pre-task + on-stop PASS
    runPreTask(SESSION_ID, { description: '委派 tester 執行驗證測試' });
    result = runSubagentStop(SESSION_ID, 'ot:tester', 'VERDICT: pass 所有測試通過');
  });

  test('TEST:2.status 為 completed（verify mode）', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['TEST:2'].status).toBe('completed');
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
