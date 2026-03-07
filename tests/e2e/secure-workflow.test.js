// @sequential
'use strict';
/**
 * secure-workflow.test.js — BDD：secure workflow 9-stage 全路徑 E2E 測試
 *
 * 驗證 secure workflow 的完整狀態機：
 *   PLAN → ARCH → TEST(spec) → DEV
 *     → [REVIEW + TEST:2(verify) + SECURITY]（secure-quality 三成員並行組）
 *     → RETRO → DOCS
 *
 * 測試的核心重點：
 *   - 9 個 stage 的 mode 設定正確
 *   - 三成員並行組 secure-quality [REVIEW + TEST:2 + SECURITY]
 *   - 前兩個完成不收斂，第三個完成後收斂
 *   - 最終 RETRO → DOCS 後所有 9 stage 完成
 */

const { test, expect, describe, beforeAll, afterAll } = require('bun:test');
const { existsSync, rmSync } = require('fs');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');
const { runOnStart, runInitWorkflow, runPreTask, runSubagentStop, isAllowed } = require('../helpers/hook-runner');

const paths    = require(join(SCRIPTS_LIB, 'paths'));
const stateLib = require(join(SCRIPTS_LIB, 'state'));

// 跨 describe 共用的唯一 sessionId
const SESSION_ID = `e2e-secure-${Date.now()}`;

afterAll(() => {
  rmSync(paths.sessionDir(SESSION_ID), { recursive: true, force: true });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 1：初始化 secure workflow 建立 9 個 stage
// ────────────────────────────────────────────────────────────────────────────

describe('BDD secure：初始化 secure workflow 建立 9 個 stage', () => {
  let initResult;

  beforeAll(() => {
    runOnStart(SESSION_ID);
    initResult = runInitWorkflow('secure', SESSION_ID);
  });

  test('init-workflow.js exit code 為 0', () => {
    expect(initResult.exitCode).toBe(0);
  });

  test('workflow.json 存在', () => {
    expect(existsSync(paths.session.workflow(SESSION_ID))).toBe(true);
  });

  test('stages 包含 PLAN、ARCH、TEST、DEV、REVIEW、TEST:2、SECURITY、RETRO、DOCS（共 9 個）', () => {
    const ws = stateLib.readState(SESSION_ID);
    const stageKeys = Object.keys(ws.stages);
    expect(stageKeys).toContain('PLAN');
    expect(stageKeys).toContain('ARCH');
    expect(stageKeys).toContain('TEST');
    expect(stageKeys).toContain('DEV');
    expect(stageKeys).toContain('REVIEW');
    expect(stageKeys).toContain('TEST:2');
    expect(stageKeys).toContain('SECURITY');
    expect(stageKeys).toContain('RETRO');
    expect(stageKeys).toContain('DOCS');
    expect(stageKeys.length).toBe(9);
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
// Scenario 2：前半 sequential — PLAN → ARCH → TEST(spec) → DEV
// ────────────────────────────────────────────────────────────────────────────

describe('BDD secure：前半 sequential — PLAN → ARCH → TEST(spec) → DEV', () => {
  beforeAll(() => {
    // PLAN
    runPreTask(SESSION_ID, { description: '委派 planner 規劃高風險功能' });
    runSubagentStop(SESSION_ID, 'ot:planner', 'VERDICT: pass 規劃完成');

    // ARCH
    runPreTask(SESSION_ID, { description: '委派 architect 設計安全架構' });
    runSubagentStop(SESSION_ID, 'ot:architect', 'VERDICT: pass 架構完成');

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

  test('TEST.status 為 completed（spec mode）', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['TEST'].status).toBe('completed');
  });

  test('DEV.status 為 completed', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['DEV'].status).toBe('completed');
  });

  test('currentStage 推進至 REVIEW（secure-quality 並行組第一個）', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.currentStage).toBe('REVIEW');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 3：DEV 完成後 REVIEW、TEST:2、SECURITY 同時進入 active（三成員並行組）
// ────────────────────────────────────────────────────────────────────────────

describe('BDD secure：DEV 完成後三成員並行組同時進入 active', () => {
  let reviewResult;
  let testResult;
  let securityResult;

  beforeAll(() => {
    // 委派 secure-quality 並行組的三個 agent
    reviewResult   = runPreTask(SESSION_ID, { description: '委派 code-reviewer 審查程式碼' });
    testResult     = runPreTask(SESSION_ID, { description: '委派 tester 驗證功能' });
    securityResult = runPreTask(SESSION_ID, { description: '委派 security-reviewer 安全審查' });
  });

  test('委派 code-reviewer 的 pre-task 回傳放行', () => {
    expect(isAllowed(reviewResult.parsed)).toBe(true);
  });

  test('委派 tester 的 pre-task 回傳放行', () => {
    expect(isAllowed(testResult.parsed)).toBe(true);
  });

  test('委派 security-reviewer 的 pre-task 回傳放行', () => {
    expect(isAllowed(securityResult.parsed)).toBe(true);
  });

  test('REVIEW.status 為 active', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['REVIEW'].status).toBe('active');
  });

  test('TEST:2.status 為 active', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['TEST:2'].status).toBe('active');
  });

  test('SECURITY.status 為 active', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['SECURITY'].status).toBe('active');
  });

  test('activeAgents 同時包含 code-reviewer、tester、security-reviewer', () => {
    const ws = stateLib.readState(SESSION_ID);
    // activeAgents key 格式為 instanceId，以 agentName 欄位驗證
    const reviewerEntry = Object.values(ws.activeAgents).find(e => e.agentName === 'code-reviewer');
    const testerEntry = Object.values(ws.activeAgents).find(e => e.agentName === 'tester');
    const securityEntry = Object.values(ws.activeAgents).find(e => e.agentName === 'security-reviewer');
    expect(reviewerEntry).toBeDefined();
    expect(testerEntry).toBeDefined();
    expect(securityEntry).toBeDefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 4：前兩個完成不收斂，第三個完成後收斂
// ────────────────────────────────────────────────────────────────────────────

describe('BDD secure：前兩個完成不收斂，第三個完成後收斂', () => {
  let firstResult;
  let secondResult;
  let thirdResult;

  beforeAll(() => {
    // REVIEW 先完成
    firstResult  = runSubagentStop(SESSION_ID, 'ot:code-reviewer', 'VERDICT: pass 審查通過');
    // TEST:2 第二個完成（尚未收斂）
    secondResult = runSubagentStop(SESSION_ID, 'ot:tester', 'VERDICT: pass 所有測試通過');
    // SECURITY 第三個完成（觸發收斂）
    thirdResult  = runSubagentStop(SESSION_ID, 'ot:security-reviewer', 'VERDICT: pass 無安全漏洞');
  });

  test('REVIEW 完成：result 不含「所有階段已完成」', () => {
    expect(firstResult.parsed?.result).not.toContain('所有階段已完成');
  });

  test('TEST:2 完成：result 不含「所有階段已完成」', () => {
    expect(secondResult.parsed?.result).not.toContain('所有階段已完成');
  });

  test('REVIEW.status 為 completed', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['REVIEW'].status).toBe('completed');
  });

  test('TEST:2.status 為 completed', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['TEST:2'].status).toBe('completed');
  });

  test('SECURITY.status 為 completed', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.stages['SECURITY'].status).toBe('completed');
  });

  test('三成員均完成後 currentStage 推進至 RETRO', () => {
    const ws = stateLib.readState(SESSION_ID);
    expect(ws.currentStage).toBe('RETRO');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Scenario 5：RETRO → DOCS 完成後所有 9 stage 均為 completed
// ────────────────────────────────────────────────────────────────────────────

describe('BDD secure：RETRO → DOCS 完成後所有 9 stage 均為 completed', () => {
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

  test('所有 9 個 stage 均為 completed', () => {
    const ws = stateLib.readState(SESSION_ID);
    const allCompleted = Object.values(ws.stages).every((s) => s.status === 'completed');
    expect(allCompleted).toBe(true);
    expect(Object.keys(ws.stages).length).toBe(9);
  });

  test('result 含「所有階段已完成」', () => {
    expect(docsResult.parsed?.result).toContain('所有階段已完成');
  });
});
