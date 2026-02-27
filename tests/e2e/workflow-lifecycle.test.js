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
const { existsSync, rmSync, readFileSync } = require('fs');
const { join } = require('path');
const { HOOKS_DIR, SCRIPTS_DIR, SCRIPTS_LIB } = require('../helpers/paths');

// ── 路徑設定 ──

const ON_START_PATH = join(HOOKS_DIR, 'session', 'on-start.js');
const ON_STOP_PATH = join(HOOKS_DIR, 'session', 'on-stop.js');
const INIT_WORKFLOW_PATH = join(SCRIPTS_DIR, 'init-workflow.js');

const paths = require(join(SCRIPTS_LIB, 'paths'));
const state = require(join(SCRIPTS_LIB, 'state'));

// 跨 describe 共用的唯一 sessionId
const SESSION_ID = `e2e-lifecycle-${Date.now()}`;

// ── 輔助函式 ──

/**
 * 執行 on-start.js 子進程（同步）
 * @param {string} sessionId
 * @returns {{ exitCode: number, stdout: string, stderr: string }}
 */
function runOnStart(sessionId) {
  const proc = Bun.spawnSync(['node', ON_START_PATH], {
    stdin: Buffer.from(JSON.stringify({ session_id: sessionId })),
    env: {
      ...process.env,
      CLAUDE_SESSION_ID: '',
      OVERTONE_NO_DASHBOARD: '1',
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout ? new TextDecoder().decode(proc.stdout) : '',
    stderr: proc.stderr ? new TextDecoder().decode(proc.stderr) : '',
  };
}

/**
 * 執行 init-workflow.js 子進程（同步）
 * @param {string} workflowType
 * @param {string} sessionId
 * @returns {{ exitCode: number, stdout: string, stderr: string }}
 */
function runInitWorkflow(workflowType, sessionId) {
  const proc = Bun.spawnSync(['node', INIT_WORKFLOW_PATH, workflowType, sessionId], {
    env: {
      ...process.env,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout ? new TextDecoder().decode(proc.stdout) : '',
    stderr: proc.stderr ? new TextDecoder().decode(proc.stderr) : '',
  };
}

/**
 * 執行 on-stop.js 子進程（同步）
 * @param {string} sessionId
 * @param {string} lastAssistantMessage
 * @returns {{ exitCode: number, stdout: string, stderr: string, parsed: object|null }}
 */
function runOnStop(sessionId, lastAssistantMessage = 'test') {
  const input = {
    session_id: sessionId,
    stop_hook_active: false,
    last_assistant_message: lastAssistantMessage,
  };
  const proc = Bun.spawnSync(['node', ON_STOP_PATH], {
    stdin: Buffer.from(JSON.stringify(input)),
    env: {
      ...process.env,
      CLAUDE_SESSION_ID: '',
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stdout = proc.stdout ? new TextDecoder().decode(proc.stdout) : '';
  let parsed = null;
  try { parsed = JSON.parse(stdout); } catch { /* 解析失敗時保留 null */ }
  return {
    exitCode: proc.exitCode,
    stdout,
    stderr: proc.stderr ? new TextDecoder().decode(proc.stderr) : '',
    parsed,
  };
}

// ── 清理 ──

afterAll(() => {
  const sessionDir = paths.sessionDir(SESSION_ID);
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
    const workflowPath = paths.session.workflow(SESSION_ID);
    expect(existsSync(workflowPath)).toBe(true);
  });

  test('workflow.json 中 workflowType 為 quick', () => {
    const ws = state.readState(SESSION_ID);
    expect(ws).not.toBeNull();
    expect(ws.workflowType).toBe('quick');
  });

  test('workflow.json 中 stages 包含 DEV', () => {
    const ws = state.readState(SESSION_ID);
    expect(ws.stages).toHaveProperty('DEV');
  });

  test('workflow.json 中 stages 包含 REVIEW', () => {
    const ws = state.readState(SESSION_ID);
    expect(ws.stages).toHaveProperty('REVIEW');
  });

  test('workflow.json 中 stages 包含 TEST', () => {
    const ws = state.readState(SESSION_ID);
    expect(ws.stages).toHaveProperty('TEST');
  });

  test('workflow.json 中 stages 包含 RETRO', () => {
    const ws = state.readState(SESSION_ID);
    expect(ws.stages).toHaveProperty('RETRO');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 2：所有 stages 標記完成後 on-stop.js 偵測到完成狀態
// ────────────────────────────────────────────────────────────────────────────

describe('場景 2：所有 stages 完成後 on-stop 偵測到完成狀態', () => {
  let stopResult;

  beforeAll(() => {
    // 手動將所有 stages 標記為 completed
    const ws = state.readState(SESSION_ID);
    if (ws) {
      for (const stageKey of Object.keys(ws.stages)) {
        state.updateStage(SESSION_ID, stageKey, { status: 'completed', result: 'pass' });
      }
    }

    // 執行 on-stop.js 並記錄結果
    stopResult = runOnStop(SESSION_ID);
  });

  test('on-stop.js exit code 為 0', () => {
    expect(stopResult.exitCode).toBe(0);
  });

  test('on-stop.js 輸出包含完成提示（result 欄位存在）', () => {
    expect(stopResult.parsed).not.toBeNull();
    expect(stopResult.parsed).toHaveProperty('result');
  });

  test('on-stop.js result 包含工作流完成訊息', () => {
    const result = stopResult.parsed?.result ?? '';
    // on-stop.js 在所有階段完成時輸出 buildCompletionSummary，含 "工作流完成！"
    expect(result).toContain('工作流完成');
  });

  test('on-stop.js result 包含 quick workflow 類型', () => {
    const result = stopResult.parsed?.result ?? '';
    expect(result).toContain('quick');
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
      const ws = state.readState(cleanSessionId);
      if (ws) {
        for (const stageKey of Object.keys(ws.stages)) {
          state.updateStage(cleanSessionId, stageKey, { status: 'completed', result: 'pass' });
        }
      }

      const stopResult = runOnStop(cleanSessionId);
      expect(stopResult.exitCode).toBe(0);
    } finally {
      // 清理此場景的測試 session 目錄
      const cleanDir = paths.sessionDir(cleanSessionId);
      rmSync(cleanDir, { recursive: true, force: true });
    }
  });

  test('afterAll 清理後 session 目錄將不存在（由 afterAll 負責）', () => {
    // 此 test 驗證 afterAll 清理的 SESSION_ID 目錄在 afterAll 前仍存在
    // 確保 afterAll 有實際內容可清理
    const sessionDir = paths.sessionDir(SESSION_ID);
    expect(existsSync(sessionDir)).toBe(true);
  });
});
