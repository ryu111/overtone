// @sequential
'use strict';
/**
 * full-workflow.test.js — BDD：full workflow 11-stage 全路徑 E2E 測試
 *
 * 驗證 full workflow 的完整狀態機：
 *   PLAN → ARCH → DESIGN → TEST(spec) → DEV
 *     → [REVIEW + TEST:2(verify)]（quality 並行組）
 *     → [QA + E2E]（verify 並行組）
 *     → RETRO → DOCS
 *
 * 測試的核心重點：
 *   - 11 個 stage 的 mode 設定正確
 *   - 兩層並行：quality（REVIEW+TEST:2）→ verify（QA+E2E）
 *   - 各並行組內第一個完成不收斂，第二個完成後收斂推進
 *   - 最終 RETRO → DOCS 後所有 11 stage 完成
 */

const { test, expect, describe, beforeAll, afterAll } = require('bun:test');
const { existsSync, rmSync } = require('fs');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');
const { runOnStart, runInitWorkflow, runPreTask, runSubagentStop, isAllowed } = require('../helpers/hook-runner');

const paths    = require(join(SCRIPTS_LIB, 'paths'));
const stateLib = require(join(SCRIPTS_LIB, 'state'));

// 跨 describe 共用的唯一 sessionId
const SESSION_ID = `e2e-full-${Date.now()}`;

afterAll(() => {
  rmSync(paths.sessionDir(SESSION_ID), { recursive: true, force: true });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 1：初始化 full workflow 建立 11 個 stage
// ────────────────────────────────────────────────────────────────────────────

describe('BDD full：初始化 full workflow 建立 11 個 stage', () => {
  let initResult;

  beforeAll(() => {
    runOnStart(SESSION_ID);
    initResult = runInitWorkflow('full', SESSION_ID);
  });

  test('init-workflow.js exit code 為 0', () => {
    expect(initResult.exitCode).toBe(0);
  });

  test('workflow.json 存在', () => {
    expect(existsSync(paths.session.workflow(SESSION_ID))).toBe(true);
  });

  test('stages 包含 PLAN、ARCH、DESIGN、TEST、DEV、REVIEW、TEST:2、QA、E2E、RETRO、DOCS（共 11 個）', () => {
    const ws = stateLib.readState(SESSION_ID);
    const stageKeys = Object.keys(ws.stages);
    expect(stageKeys).toContain('PLAN');
    expect(stageKeys).toContain('ARCH');
    expect(stageKeys).toContain('DESIGN');
    expect(stageKeys).toContain('TEST');
    expect(stageKeys).toContain('DEV');
    expect(stageKeys).toContain('REVIEW');
    expect(stageKeys).toContain('TEST:2');
    expect(stageKeys).toContain('QA');
    expect(stageKeys).toContain('E2E');
    expect(stageKeys).toContain('RETRO');
    expect(stageKeys).toContain('DOCS');
    expect(stageKeys.length).toBe(11);
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
// Scenario 2：前半 sequential — PLAN → ARCH → DESIGN → TEST(spec) → DEV
// ────────────────────────────────────────────────────────────────────────────

describe('BDD full：前半 sequential — PLAN → ARCH → DESIGN → TEST(spec) → DEV', () => {
  beforeAll(() => {
    // PLAN
    runPreTask(SESSION_ID, { description: '委派 planner 規劃功能' });
    runSubagentStop(SESSION_ID, 'ot:planner', 'VERDICT: pass 規劃完成');

    // ARCH
    runPreTask(SESSION_ID, { description: '委派 architect 設計架構' });
    runSubagentStop(SESSION_ID, 'ot:architect', 'VERDICT: pass 架構完成');

    // DESIGN
    runPreTask(SESSION_ID, { description: '委派 designer 設計 UI' });
    runSubagentStop(SESSION_ID, 'ot:designer', 'VERDICT: pass 設計完成');

    // TEST（spec mode）
    runPreTask(SESSION_ID, { description: '委派 tester 撰寫 BDD spec' });
    runSubagentStop(SESSION_ID, 'ot:tester', 'VERDICT: pass BDD spec 完成');

    // DEV
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

  test('DESIGN.status 為 completed', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['DESIGN'].status).toBe('completed');
  });

  test('TEST.status 為 completed（spec mode）', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['TEST'].status).toBe('completed');
  });

  test('DEV.status 為 completed', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['DEV'].status).toBe('completed');
  });

  test('currentStage 推進至 REVIEW（quality 並行組第一個）', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.currentStage).toBe('REVIEW');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 3：quality 並行組 [REVIEW + TEST:2] 同時 active
// ────────────────────────────────────────────────────────────────────────────

describe('BDD full：quality 並行組 [REVIEW + TEST:2] 同時 active', () => {
  let reviewResult;
  let testResult;

  beforeAll(() => {
    reviewResult = runPreTask(SESSION_ID, { description: '委派 code-reviewer 審查程式碼' });
    testResult   = runPreTask(SESSION_ID, { description: '委派 tester 驗證功能' });
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
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 4：quality 並行組收斂，推進至 verify 並行組 [QA + E2E]
// ────────────────────────────────────────────────────────────────────────────

describe('BDD full：quality 並行組收斂，推進至 verify 並行組', () => {
  let firstResult;
  let secondResult;
  let qaResult;
  let e2eResult;

  beforeAll(() => {
    // REVIEW 先完成
    firstResult = runSubagentStop(SESSION_ID, 'ot:code-reviewer', 'VERDICT: pass 審查通過');
    // TEST:2 後完成（收斂）
    secondResult = runSubagentStop(SESSION_ID, 'ot:tester', 'VERDICT: pass 所有測試通過');

    // 委派 verify 並行組
    qaResult  = runPreTask(SESSION_ID, { description: '委派 qa 行為驗證' });
    e2eResult = runPreTask(SESSION_ID, { description: '委派 e2e-runner 執行 E2E 測試' });
  });

  test('REVIEW 先完成：result 不含「所有階段已完成」', () => {
    expect(firstResult.parsed?.result).not.toContain('所有階段已完成');
  });

  test('REVIEW.status 為 completed', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['REVIEW'].status).toBe('completed');
  });

  test('TEST:2.status 為 completed', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['TEST:2'].status).toBe('completed');
  });

  test('委派 qa 的 pre-task 回傳放行', () => {
    expect(isAllowed(qaResult.parsed)).toBe(true);
  });

  test('委派 e2e-runner 的 pre-task 回傳放行', () => {
    expect(isAllowed(e2eResult.parsed)).toBe(true);
  });

  test('QA.status 為 active', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['QA'].status).toBe('active');
  });

  test('E2E.status 為 active', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['E2E'].status).toBe('active');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 5：verify 並行組收斂，推進至 RETRO
// ────────────────────────────────────────────────────────────────────────────

describe('BDD full：verify 並行組收斂，推進至 RETRO', () => {
  let firstResult;

  beforeAll(() => {
    // QA 先完成
    firstResult = runSubagentStop(SESSION_ID, 'ot:qa', 'VERDICT: pass 行為驗證通過');
    // E2E 後完成（收斂）
    runSubagentStop(SESSION_ID, 'ot:e2e-runner', 'VERDICT: pass E2E 所有測試通過');
  });

  test('QA 先完成：result 不含「所有階段已完成」', () => {
    expect(firstResult.parsed?.result).not.toContain('所有階段已完成');
  });

  test('QA.status 為 completed', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['QA'].status).toBe('completed');
  });

  test('E2E.status 為 completed', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['E2E'].status).toBe('completed');
  });

  test('currentStage 推進至 RETRO（verify 並行組收斂後）', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.currentStage).toBe('RETRO');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 6：RETRO → DOCS 完成後所有 11 stage 均為 completed
// ────────────────────────────────────────────────────────────────────────────

describe('BDD full：RETRO → DOCS 完成後所有 11 stage 均為 completed', () => {
  let docsResult;

  beforeAll(() => {
    // RETRO
    runPreTask(SESSION_ID, { description: '委派 retrospective 進行回顧' });
    runSubagentStop(SESSION_ID, 'ot:retrospective', 'VERDICT: pass 回顧完成');

    // DOCS
    runPreTask(SESSION_ID, { description: '委派 doc-updater 更新文件' });
    docsResult = runSubagentStop(SESSION_ID, 'ot:doc-updater', 'VERDICT: pass 文件已更新');
  });

  test('RETRO.status 為 completed', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['RETRO'].status).toBe('completed');
  });

  test('DOCS.status 為 completed', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['DOCS'].status).toBe('completed');
  });

  test('所有 11 個 stage 均為 completed', () => {
    const ws = stateLib.readState(SESSION_ID);
    const allCompleted = Object.values(ws.stages).every((s) => s.status === 'completed');
    expect(allCompleted).toBe(true);
    expect(Object.keys(ws.stages).length).toBe(11);
  });

  test('result 含「所有階段已完成」', () => {
    expect(docsResult.parsed?.result).toContain('所有階段已完成');
  });
});
