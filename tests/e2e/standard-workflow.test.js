'use strict';
/**
 * standard-workflow.test.js — BDD F3：standard workflow 8-stage 全路徑 E2E 測試
 *
 * 驗證 standard workflow 的完整狀態機：
 *   PLAN → ARCH → TEST(spec) → DEV → [REVIEW + TEST:2(verify)] → RETRO → DOCS
 *
 * 測試的核心重點：
 *   - 8 個 stage 的 mode 設定正確（TEST.mode=spec, TEST:2.mode=verify）
 *   - 並行組 [REVIEW + TEST:2] 同時 active 的行為
 *   - 並行組第一個完成時不觸發全部完成
 *   - 並行組最後一個完成後收斂並推進至 RETRO
 */

const { test, expect, describe, beforeAll, afterAll } = require('bun:test');
const { existsSync, rmSync } = require('fs');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');
const { runOnStart, runInitWorkflow, runPreTask, runSubagentStop } = require('../helpers/hook-runner');

const paths    = require(join(SCRIPTS_LIB, 'paths'));
const stateLib = require(join(SCRIPTS_LIB, 'state'));

// 跨 describe 共用的唯一 sessionId
const SESSION_ID = `e2e-standard-${Date.now()}`;

afterAll(() => {
  rmSync(paths.sessionDir(SESSION_ID), { recursive: true, force: true });
});

// ────────────────────────────────────────────────────────────────────────────
// BDD F3 Scenario 1：初始化 standard workflow 建立 8 個 stage
// ────────────────────────────────────────────────────────────────────────────

describe('BDD F3：初始化 standard workflow 建立 8 個 stage', () => {
  let initResult;

  beforeAll(() => {
    runOnStart(SESSION_ID);
    initResult = runInitWorkflow('standard', SESSION_ID);
  });

  test('init-workflow.js exit code 為 0', () => {
    expect(initResult.exitCode).toBe(0);
  });

  test('workflow.json 存在', () => {
    expect(existsSync(paths.session.workflow(SESSION_ID))).toBe(true);
  });

  test('stages 包含 PLAN、ARCH、TEST、DEV、REVIEW、TEST:2、RETRO、DOCS（共 8 個）', () => {
    const ws = stateLib.readState(SESSION_ID);
    const stageKeys = Object.keys(ws.stages);
    expect(stageKeys).toContain('PLAN');
    expect(stageKeys).toContain('ARCH');
    expect(stageKeys).toContain('TEST');
    expect(stageKeys).toContain('DEV');
    expect(stageKeys).toContain('REVIEW');
    expect(stageKeys).toContain('TEST:2');
    expect(stageKeys).toContain('RETRO');
    expect(stageKeys).toContain('DOCS');
    expect(stageKeys.length).toBe(8);
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
    for (const [key, val] of Object.entries(ws.stages)) {
      expect(val.status).toBe('pending');
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// BDD F3 Scenario 2：前半 sequential path — PLAN → ARCH → TEST → DEV 依序推進
// ────────────────────────────────────────────────────────────────────────────

describe('BDD F3：前半 sequential path — PLAN → ARCH → TEST → DEV 依序推進', () => {
  beforeAll(() => {
    // PLAN：pre-task + on-stop PASS
    runPreTask(SESSION_ID, { description: '委派 planner 規劃功能' });
    runSubagentStop(SESSION_ID, 'ot:planner', 'VERDICT: pass 規劃完成');

    // ARCH：pre-task + on-stop PASS
    runPreTask(SESSION_ID, { description: '委派 architect 設計架構' });
    runSubagentStop(SESSION_ID, 'ot:architect', 'VERDICT: pass 架構完成');

    // TEST（spec mode）：pre-task + on-stop PASS
    runPreTask(SESSION_ID, { description: '委派 tester 撰寫 BDD spec' });
    runSubagentStop(SESSION_ID, 'ot:tester', 'VERDICT: pass BDD spec 完成');

    // DEV：pre-task + on-stop PASS
    runPreTask(SESSION_ID, { description: '委派 developer 實作功能' });
    runSubagentStop(SESSION_ID, 'ot:developer', 'VERDICT: pass 開發完成');
  });

  test('PLAN.status 為 completed', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['PLAN'].status).toBe('completed');
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

  test('currentStage 推進至 REVIEW（下一個 pending stage）', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.currentStage).toBe('REVIEW');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// BDD F3 Scenario 3：DEV 完成後 REVIEW 和 TEST:2 同時進入 active（並行組）
// ────────────────────────────────────────────────────────────────────────────

describe('BDD F3：DEV 完成後 REVIEW 和 TEST:2 同時進入 active（並行組）', () => {
  let reviewResult;
  let testResult;

  beforeAll(() => {
    // 依序委派並行組的兩個 agent
    reviewResult = runPreTask(SESSION_ID, { description: '委派 code-reviewer 審查程式碼' });
    testResult   = runPreTask(SESSION_ID, { description: '委派 tester 驗證功能' });
  });

  test('委派 code-reviewer 的 pre-task 回傳 result 為空字串（放行）', () => {
    expect(reviewResult.parsed?.result).toBe('');
  });

  test('委派 tester 的 pre-task 回傳 result 為空字串（放行）', () => {
    expect(testResult.parsed?.result).toBe('');
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
// BDD F3 Scenario 4：並行組中第一個完成時不觸發全部完成
// ────────────────────────────────────────────────────────────────────────────

describe('BDD F3：並行組中第一個完成時不觸發全部完成', () => {
  let result;

  beforeAll(() => {
    // REVIEW 先完成（TEST:2 仍 active）
    result = runSubagentStop(SESSION_ID, 'ot:code-reviewer', 'VERDICT: pass 審查通過，程式碼品質良好');
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
// BDD F3 Scenario 5：並行組最後一個完成時收斂並推進至 RETRO
// ────────────────────────────────────────────────────────────────────────────

describe('BDD F3：並行組最後一個完成時收斂並推進至 RETRO', () => {
  let result;

  beforeAll(() => {
    // TEST:2 完成（REVIEW 已 completed）
    result = runSubagentStop(SESSION_ID, 'ot:tester', 'VERDICT: pass 所有測試通過');
  });

  test('TEST:2.status 變為 completed', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['TEST:2'].status).toBe('completed');
  });

  test('result 含 ✅', () => {
    expect(result.parsed?.result).toContain('✅');
  });

  test('REVIEW 和 TEST:2 均為 completed（並行收斂）', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['REVIEW'].status).toBe('completed');
    expect(ws.stages['TEST:2'].status).toBe('completed');
  });

  test('currentStage 為 RETRO（並行組收斂後推進）', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.currentStage).toBe('RETRO');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// BDD F3 Scenario 6：RETRO 和 DOCS 完成後所有 stage 均為 completed
// ────────────────────────────────────────────────────────────────────────────

describe('BDD F3：RETRO 和 DOCS 完成後所有 stage 均為 completed', () => {
  beforeAll(() => {
    // RETRO：pre-task + on-stop PASS
    runPreTask(SESSION_ID, { description: '委派 retrospective 進行回顧' });
    runSubagentStop(SESSION_ID, 'ot:retrospective', 'VERDICT: pass 回顧完成，無重要問題');

    // DOCS：pre-task + on-stop PASS
    runPreTask(SESSION_ID, { description: '委派 doc-updater 更新文件' });
    runSubagentStop(SESSION_ID, 'ot:doc-updater', 'VERDICT: pass 文件已更新');
  });

  test('RETRO.status 為 completed', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['RETRO'].status).toBe('completed');
  });

  test('DOCS.status 為 completed', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['DOCS'].status).toBe('completed');
  });

  test('所有 8 個 stage 均為 completed', () => {
    const ws = stateLib.readState(SESSION_ID);
    const allCompleted = Object.values(ws.stages).every((s) => s.status === 'completed');
    expect(allCompleted).toBe(true);
    expect(Object.keys(ws.stages).length).toBe(8);
  });
});
