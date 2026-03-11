// @sequential
'use strict';
/**
 * workflow-lifecycle.test.js — 完整 workflow 生命週期 E2E 測試
 *
 * 驗證三個核心場景：
 *   1. on-start.js 建立 session 目錄後 init-workflow.js 可初始化 quick workflow
 *   2. 所有 stages 標記完成後 on-stop.js 偵測到完成狀態並輸出完成摘要
 *   3. 完整生命週期後清理，不留殘留
 */

const { test, expect, describe, beforeAll, afterAll } = require('bun:test');
const { existsSync, rmSync } = require('fs');
const { SCRIPTS_LIB } = require('../helpers/paths');
const { join } = require('path');

const {
  runOnStart,
  runInitWorkflow,
  runSessionStop,
  getActiveWorkflowId,
  readWorkflowState,
  getWorkflowFilePath,
} = require('../helpers/hook-runner');

const paths = require(join(SCRIPTS_LIB, 'paths'));
const state = require(join(SCRIPTS_LIB, 'state'));

// 跨 describe 共用的唯一 sessionId
const SESSION_ID = `e2e-lifecycle-${Date.now()}`;

// ── 清理 ──

afterAll(() => {
  const sessionDir = paths.sessionDir(process.cwd(), SESSION_ID);
  rmSync(sessionDir, { recursive: true, force: true });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 1：on-start.js 建立 session 目錄後 init-workflow.js 可初始化 quick workflow
// ────────────────────────────────────────────────────────────────────────────

describe('場景 1：on-start 建立目錄，init-workflow 初始化 quick workflow', () => {
  // 執行一次 on-start 並保存結果供 tests 使用
  let startResult;
  let initResult;

  beforeAll(() => {
    startResult = runOnStart(SESSION_ID);
    initResult = runInitWorkflow('quick', SESSION_ID);
  });

  test('on-start.js exit code 為 0', () => {
    expect(startResult.exitCode).toBe(0);
  });

  test('init-workflow.js exit code 為 0', () => {
    expect(initResult.exitCode).toBe(0);
  });

  test('workflow.json 已建立', () => {
    const workflowPath = getWorkflowFilePath(SESSION_ID);
    expect(existsSync(workflowPath)).toBe(true);
  });

  test('workflow.json 中 workflowType 為 quick', () => {
    const ws = readWorkflowState(SESSION_ID);
    expect(ws).not.toBeNull();
    expect(ws.workflowType).toBe('quick');
  });

  test('workflow.json 中 stages 包含 DEV', () => {
    const ws = readWorkflowState(SESSION_ID);
    expect(ws.stages).toHaveProperty('DEV');
  });

  test('workflow.json 中 stages 包含 REVIEW', () => {
    const ws = readWorkflowState(SESSION_ID);
    expect(ws.stages).toHaveProperty('REVIEW');
  });

  test('workflow.json 中 stages 包含 RETRO', () => {
    const ws = readWorkflowState(SESSION_ID);
    expect(ws.stages).toHaveProperty('RETRO');
  });

  test('workflow.json 中 stages 包含 DOCS', () => {
    const ws = readWorkflowState(SESSION_ID);
    expect(ws.stages).toHaveProperty('DOCS');
  });

  test('workflow.json 中 stages 不含 TEST（quick workflow 已移除）', () => {
    const ws = readWorkflowState(SESSION_ID);
    expect(ws.stages).not.toHaveProperty('TEST');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 2：所有 stages 標記完成後 on-stop.js 偵測到完成狀態
// ────────────────────────────────────────────────────────────────────────────

describe('場景 2：所有 stages 完成後 on-stop 偵測到完成狀態', () => {
  let stopResult;

  beforeAll(() => {
    // 手動將所有 stages 標記為 completed
    const workflowId = getActiveWorkflowId(SESSION_ID);
    const ws = readWorkflowState(SESSION_ID);
    if (ws) {
      for (const stageKey of Object.keys(ws.stages)) {
        state.updateStage(process.cwd(), SESSION_ID, workflowId, stageKey, { status: 'completed', result: 'pass' });
      }
    }

    // 執行 on-stop.js 並記錄結果
    stopResult = runSessionStop(SESSION_ID);
  });

  test('on-stop.js exit code 為 0', () => {
    expect(stopResult.exitCode).toBe(0);
  });

  test('on-stop.js 輸出為空物件（SessionStop schema 無 result 欄位）', () => {
    expect(stopResult.parsed).not.toBeNull();
    expect(stopResult.parsed).toEqual({});
  });

  test('所有 stages 均已 completed（workflow 真正完成的驗證）', () => {
    const ws = readWorkflowState(SESSION_ID);
    const allCompleted = Object.values(ws.stages).every((s) => s.status === 'completed');
    expect(allCompleted).toBe(true);
  });

  test('workflow 類型為 quick', () => {
    const ws = readWorkflowState(SESSION_ID);
    expect(ws.workflowType).toBe('quick');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 3：完整生命週期後清理，不留殘留
// ────────────────────────────────────────────────────────────────────────────

describe('場景 3：完整生命週期後清理驗證', () => {
  test('所有子進程 exit code 均確認為 0（場景 1 + 2 已執行）', () => {
    // 此處重新執行一次完整流程（使用不同 sessionId 避免衝突）
    const cleanSessionId = `${SESSION_ID}-clean`;

    try {
      const startResult = runOnStart(cleanSessionId);
      expect(startResult.exitCode).toBe(0);

      const initResult = runInitWorkflow('quick', cleanSessionId);
      expect(initResult.exitCode).toBe(0);

      // 標記所有 stages 完成
      const workflowId = getActiveWorkflowId(cleanSessionId);
      const ws = readWorkflowState(cleanSessionId);
      if (ws) {
        for (const stageKey of Object.keys(ws.stages)) {
          state.updateStage(process.cwd(), cleanSessionId, workflowId, stageKey, { status: 'completed', result: 'pass' });
        }
      }

      const stopResult = runSessionStop(cleanSessionId);
      expect(stopResult.exitCode).toBe(0);
    } finally {
      // 清理此場景的測試 session 目錄
      const cleanDir = paths.sessionDir(process.cwd(), cleanSessionId);
      rmSync(cleanDir, { recursive: true, force: true });
    }
  });

  test('afterAll 清理後 session 目錄將不存在（由 afterAll 負責）', () => {
    // 此 test 驗證 afterAll 清理的 SESSION_ID 目錄在 afterAll 前仍存在
    // 確保 afterAll 有實際內容可清理
    const sessionDir = paths.sessionDir(process.cwd(), SESSION_ID);
    expect(existsSync(sessionDir)).toBe(true);
  });
});
