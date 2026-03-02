'use strict';
/**
 * refactor-workflow.test.js — BDD：refactor workflow 5-stage 全路徑 E2E 測試
 *
 * 驗證 refactor workflow 的完整狀態機：
 *   ARCH → TEST(spec) → DEV → [REVIEW + TEST:2(verify)]
 *
 * 測試的核心重點：
 *   - 5 個 stage 的 mode 設定正確（TEST.mode=spec, TEST:2.mode=verify）
 *   - 前半 sequential：ARCH → TEST(spec) → DEV
 *   - 並行組 quality [REVIEW + TEST:2] 同時 active
 *   - 並行組第一個完成時不收斂
 *   - 並行組第二個完成後收斂，無 RETRO/DOCS
 */

const { test, expect, describe, beforeAll, afterAll } = require('bun:test');
const { existsSync, rmSync } = require('fs');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');
const { runOnStart, runInitWorkflow, runPreTask, runSubagentStop, isAllowed } = require('../helpers/hook-runner');

const paths    = require(join(SCRIPTS_LIB, 'paths'));
const stateLib = require(join(SCRIPTS_LIB, 'state'));

// 跨 describe 共用的唯一 sessionId
const SESSION_ID = `e2e-refactor-${Date.now()}`;

afterAll(() => {
  rmSync(paths.sessionDir(SESSION_ID), { recursive: true, force: true });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 1：初始化 refactor workflow 建立 5 個 stage
// ────────────────────────────────────────────────────────────────────────────

describe('BDD refactor：初始化 refactor workflow 建立 5 個 stage', () => {
  let initResult;

  beforeAll(() => {
    runOnStart(SESSION_ID);
    initResult = runInitWorkflow('refactor', SESSION_ID);
  });

  test('init-workflow.js exit code 為 0', () => {
    expect(initResult.exitCode).toBe(0);
  });

  test('workflow.json 存在', () => {
    expect(existsSync(paths.session.workflow(SESSION_ID))).toBe(true);
  });

  test('stages 包含 ARCH、TEST、DEV、REVIEW、TEST:2（共 5 個）', () => {
    const ws = stateLib.readState(SESSION_ID);
    const stageKeys = Object.keys(ws.stages);
    expect(stageKeys).toContain('ARCH');
    expect(stageKeys).toContain('TEST');
    expect(stageKeys).toContain('DEV');
    expect(stageKeys).toContain('REVIEW');
    expect(stageKeys).toContain('TEST:2');
    expect(stageKeys.length).toBe(5);
  });

  test('TEST stage 的 mode 為 spec', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['TEST'].mode).toBe('spec');
  });

  test('TEST:2 stage 的 mode 為 verify', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['TEST:2'].mode).toBe('verify');
  });

  test('無 RETRO 和 DOCS stage', () => {
    const ws = stateLib.readState(SESSION_ID);
    const stageKeys = Object.keys(ws.stages);
    expect(stageKeys).not.toContain('RETRO');
    expect(stageKeys).not.toContain('DOCS');
  });

  test('所有 stage 初始狀態為 pending', () => {
    const ws = stateLib.readState(SESSION_ID);
    for (const val of Object.values(ws.stages)) {
      expect(val.status).toBe('pending');
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 2：前半 sequential — ARCH → TEST(spec) → DEV
// ────────────────────────────────────────────────────────────────────────────

describe('BDD refactor：前半 sequential — ARCH → TEST(spec) → DEV', () => {
  beforeAll(() => {
    // ARCH：pre-task + on-stop PASS
    runPreTask(SESSION_ID, { description: '委派 architect 設計重構架構' });
    runSubagentStop(SESSION_ID, 'ot:architect', 'VERDICT: pass 架構設計完成');

    // TEST（spec mode）：pre-task + on-stop PASS
    runPreTask(SESSION_ID, { description: '委派 tester 撰寫 BDD spec' });
    runSubagentStop(SESSION_ID, 'ot:tester', 'VERDICT: pass BDD spec 完成');

    // DEV：pre-task + on-stop PASS
    runPreTask(SESSION_ID, { description: '委派 developer 執行重構' });
    runSubagentStop(SESSION_ID, 'ot:developer', 'VERDICT: pass 重構完成');
  });

  test('ARCH.status 為 completed', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['ARCH'].status).toBe('completed');
  });

  test('TEST.status 為 completed（spec mode）', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['TEST'].status).toBe('completed');
  });

  test('DEV.status 為 completed', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['DEV'].status).toBe('completed');
  });

  test('currentStage 推進至 REVIEW（並行組第一個）', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.currentStage).toBe('REVIEW');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 3：DEV 完成後 REVIEW 和 TEST:2 同時進入 active（並行組）
// ────────────────────────────────────────────────────────────────────────────

describe('BDD refactor：DEV 完成後 REVIEW 和 TEST:2 同時進入 active（並行組）', () => {
  let reviewResult;
  let testResult;

  beforeAll(() => {
    // 委派並行組的兩個 agent
    reviewResult = runPreTask(SESSION_ID, { description: '委派 code-reviewer 審查重構' });
    testResult   = runPreTask(SESSION_ID, { description: '委派 tester 驗證重構結果' });
  });

  test('委派 code-reviewer 的 pre-task 回傳放行', () => {
    expect(isAllowed(reviewResult.parsed)).toBe(true);
  });

  test('委派 tester 的 pre-task 回傳放行', () => {
    expect(isAllowed(testResult.parsed)).toBe(true);
  });

  test('REVIEW.status 為 active', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['REVIEW'].status).toBe('active');
  });

  test('TEST:2.status 為 active', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['TEST:2'].status).toBe('active');
  });

  test('activeAgents 同時包含 code-reviewer 和 tester', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.activeAgents).toHaveProperty('code-reviewer');
    expect(ws.activeAgents).toHaveProperty('tester');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 4：並行組中第一個完成時不觸發全部完成
// ────────────────────────────────────────────────────────────────────────────

describe('BDD refactor：並行組中第一個完成時不觸發全部完成', () => {
  let result;

  beforeAll(() => {
    // REVIEW 先完成（TEST:2 仍 active）
    result = runSubagentStop(SESSION_ID, 'ot:code-reviewer', 'VERDICT: pass 重構審查通過');
  });

  test('REVIEW.status 變為 completed', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['REVIEW'].status).toBe('completed');
  });

  test('result 含 ✅', () => {
    expect(result.parsed?.result).toContain('✅');
  });

  test('result 不含「所有階段已完成」', () => {
    expect(result.parsed?.result).not.toContain('所有階段已完成');
  });

  test('result 不含 🎉（未觸發全部完成）', () => {
    expect(result.parsed?.result).not.toContain('🎉');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 5：並行組最後一個完成後所有 stage 均為 completed（無 RETRO/DOCS）
// ────────────────────────────────────────────────────────────────────────────

describe('BDD refactor：並行組最後一個完成後所有 stage 均為 completed', () => {
  let result;

  beforeAll(() => {
    // TEST:2 完成（REVIEW 已 completed）
    result = runSubagentStop(SESSION_ID, 'ot:tester', 'VERDICT: pass 所有驗證測試通過');
  });

  test('TEST:2.status 變為 completed', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['TEST:2'].status).toBe('completed');
  });

  test('REVIEW 和 TEST:2 均為 completed（並行收斂）', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['REVIEW'].status).toBe('completed');
    expect(ws.stages['TEST:2'].status).toBe('completed');
  });

  test('所有 5 個 stage 均為 completed（refactor 無 RETRO/DOCS）', () => {
    const ws = stateLib.readState(SESSION_ID);
    const allCompleted = Object.values(ws.stages).every((s) => s.status === 'completed');
    expect(allCompleted).toBe(true);
    expect(Object.keys(ws.stages).length).toBe(5);
  });

  test('result 含「所有階段已完成」', () => {
    expect(result.parsed?.result).toContain('所有階段已完成');
  });
});
