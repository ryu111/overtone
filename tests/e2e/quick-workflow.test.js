// @sequential
'use strict';
/**
 * quick-workflow.test.js — BDD F4：quick workflow hook 驅動 state 轉移 E2E 測試
 *
 * 驗證 quick workflow（DEV → REVIEW → RETRO → DOCS）的完整生命週期：
 *   - 初始化：4 個 stage（DEV, REVIEW, RETRO, DOCS）
 *   - DEV 完成後 REVIEW 放行（獨立執行，無並行群組）
 *   - REVIEW PASS 後推進至 RETRO
 *   - RETRO PASS 後推進至 DOCS
 *   - DOCS PASS 後所有 stage 完成
 */

const { test, expect, describe, beforeAll, afterAll } = require('bun:test');
const { existsSync, rmSync } = require('fs');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');
const { runOnStart, runInitWorkflow, runPreTask, runSubagentStop, isAllowed, readWorkflowState } = require('../helpers/hook-runner');

const paths = require(join(SCRIPTS_LIB, 'paths'));

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

  test('stages 包含 DEV、REVIEW、RETRO、DOCS（共 4 個，不含 TEST）', () => {
    const ws = readWorkflowState(SESSION_ID);
    const stageKeys = Object.keys(ws.stages);
    expect(stageKeys).toContain('DEV');
    expect(stageKeys).toContain('REVIEW');
    expect(stageKeys).not.toContain('TEST');
    expect(stageKeys).toContain('RETRO');
    expect(stageKeys).toContain('DOCS');
    expect(stageKeys.length).toBe(4);
  });

  test('所有 stage 初始狀態為 pending', () => {
    const ws = readWorkflowState(SESSION_ID);
    for (const val of Object.values(ws.stages)) {
      expect(val.status).toBe('pending');
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// BDD F4 Scenario 2：DEV 完成後 REVIEW 放行（獨立執行）
// ────────────────────────────────────────────────────────────────────────────

describe('BDD F4：DEV 完成後 REVIEW 放行', () => {
  let reviewResult;

  beforeAll(() => {
    // DEV：pre-task + on-stop PASS
    runPreTask(SESSION_ID, { description: '委派 developer 實作功能' });
    runSubagentStop(SESSION_ID, 'developer', 'VERDICT: pass 開發完成');

    // 委派 REVIEW
    reviewResult = runPreTask(SESSION_ID, { description: '委派 code-reviewer 審查程式碼' });
  });

  test('委派 code-reviewer 的 pre-task 回傳放行（result 為空字串或 updatedInput 注入）', () => {
    expect(isAllowed(reviewResult.parsed)).toBe(true);
  });

  test('REVIEW.status 為 active', () => {
    const ws = readWorkflowState(SESSION_ID);
    expect(ws.stages['REVIEW'].status).toBe('active');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// BDD F4 Scenario 3：REVIEW PASS 後推進至 RETRO
// ────────────────────────────────────────────────────────────────────────────

describe('BDD F4：REVIEW PASS 後推進至 RETRO', () => {
  beforeAll(() => {
    // REVIEW：on-stop PASS
    runSubagentStop(SESSION_ID, 'code-reviewer', 'VERDICT: pass 審查通過，程式碼品質良好');
  });

  test('REVIEW.status 為 completed', () => {
    const ws = readWorkflowState(SESSION_ID);
    expect(ws.stages['REVIEW'].status).toBe('completed');
  });

  test('currentStage 推進至 RETRO', () => {
    const ws = readWorkflowState(SESSION_ID);
    expect(ws.currentStage).toBe('RETRO');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// BDD F4 Scenario 4：RETRO PASS 後推進至 DOCS
// ────────────────────────────────────────────────────────────────────────────

describe('BDD F4：RETRO PASS 後推進至 DOCS', () => {
  beforeAll(() => {
    // RETRO：pre-task + on-stop PASS
    runPreTask(SESSION_ID, { description: '委派 retrospective 進行回顧' });
    runSubagentStop(SESSION_ID, 'retrospective', 'VERDICT: pass 回顧完成，品質良好');
  });

  test('RETRO.status 為 completed', () => {
    const ws = readWorkflowState(SESSION_ID);
    expect(ws.stages['RETRO'].status).toBe('completed');
  });

  test('currentStage 推進至 DOCS', () => {
    const ws = readWorkflowState(SESSION_ID);
    expect(ws.currentStage).toBe('DOCS');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// BDD F4 Scenario 5：DOCS PASS 後所有 stage 完成
// ────────────────────────────────────────────────────────────────────────────

describe('BDD F4：DOCS PASS 後所有 stage 完成', () => {
  let result;

  beforeAll(() => {
    // DOCS：pre-task + on-stop PASS
    runPreTask(SESSION_ID, { description: '委派 doc-updater 同步文件' });
    result = runSubagentStop(SESSION_ID, 'doc-updater', 'VERDICT: pass 文件同步完成');
  });

  test('DOCS.status 為 completed', () => {
    const ws = readWorkflowState(SESSION_ID);
    expect(ws.stages['DOCS'].status).toBe('completed');
  });

  test('所有 4 個 stage 均為 completed', () => {
    const ws = readWorkflowState(SESSION_ID);
    const allCompleted = Object.values(ws.stages).every((s) => s.status === 'completed');
    expect(allCompleted).toBe(true);
  });

  test('hook output 為空物件（SubagentStop schema 無 result 欄位）', () => {
    expect(result.parsed).toEqual({});
  });
});
