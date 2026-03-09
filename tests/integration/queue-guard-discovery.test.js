'use strict';
/**
 * queue-guard-discovery.test.js — guardDiscoveryMode 整合測試
 *
 * 測試面向：
 *   A: guardDiscoveryMode 讀取正確的 workflow state（activeWorkflowId 路徑）
 *   B: guardDiscoveryMode PM 完成後放行（m3）
 *   F: init-workflow.js 回寫 workflowId 到佇列（m2）
 *
 * 注意：這些測試在功能未實作前應為紅燈（failing）。
 *
 * 測試策略：
 *   - 直接 require queue.js 的 _guardDiscoveryMode export
 *   - 透過建立真實的 session 目錄和 state 檔案模擬 workflow 狀態
 *   - init-workflow.js 透過 runInitWorkflow helper 執行（subprocess）
 */

const { test, expect, describe, beforeEach, afterEach } = require('bun:test');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } = require('fs');
const { join } = require('path');
const { tmpdir, homedir } = require('os');
const { SCRIPTS_LIB, SCRIPTS_DIR } = require('../helpers/paths');

const paths = require(join(SCRIPTS_LIB, 'paths'));
const state = require(join(SCRIPTS_LIB, 'state'));
const executionQueue = require(join(SCRIPTS_LIB, 'execution-queue'));
const { _guardDiscoveryMode } = require(join(SCRIPTS_DIR, 'queue'));
const { runInitWorkflow } = require('../helpers/hook-runner');

// ── 測試目錄隔離 ──

let testSessionId;
let testProjectRoot;

beforeEach(() => {
  // 建立隔離的 session（使用 UUID 風格 id 避免並行衝突）
  testSessionId = `test-guard-disc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  testProjectRoot = mkdtempSync(join(tmpdir(), 'guard-disc-'));

  // 建立 session 基本目錄
  mkdirSync(paths.sessionDir(testSessionId), { recursive: true });
});

afterEach(() => {
  // 清理 session 目錄
  const sessionDir = paths.sessionDir(testSessionId);
  rmSync(sessionDir, { recursive: true, force: true });

  // 清理 project 目錄
  if (testProjectRoot && existsSync(testProjectRoot)) {
    rmSync(testProjectRoot, { recursive: true, force: true });
  }
  testProjectRoot = null;
});

// ── 輔助函式 ──

/**
 * 建立一個測試用的 workflow state（帶 workflowId）
 */
function createWorkflowState(sessionId, workflowId, overrides = {}) {
  // 建立 workflow 子目錄
  mkdirSync(paths.session.workflowDir(sessionId, workflowId), { recursive: true });

  const defaultState = {
    workflowType: 'discovery',
    workflowId,
    currentStage: 'PM',
    stages: {
      PM: { status: 'active' },
    },
    createdAt: new Date().toISOString(),
    featureName: null,
    failCount: 0,
    rejectCount: 0,
    activeAgents: {},
  };

  const ws = { ...defaultState, ...overrides };
  state.writeState(sessionId, ws, workflowId);

  // 寫入 active-workflow-id
  writeFileSync(paths.session.activeWorkflowId(sessionId), workflowId);

  return ws;
}

// ────────────────────────────────────────────────────────────────────────────
// Feature A: guardDiscoveryMode 讀取正確的 workflow state
// ────────────────────────────────────────────────────────────────────────────

describe('Feature A: guardDiscoveryMode 讀取正確的 workflow state', () => {

  test('A-1: discovery workflow PM 進行中時阻擋（讀取正確 workflowId 路徑）', () => {
    // 建立 workflow state（現在需要 workflowId）
    const workflowId = 'test-wf-' + Date.now().toString(36);
    createWorkflowState(testSessionId, workflowId, {
      workflowType: 'discovery',
      currentStage: 'PM',
    });

    // 設定環境變數模擬 session
    const origSessionId = process.env.CLAUDE_SESSION_ID;
    process.env.CLAUDE_SESSION_ID = testSessionId;

    let exitCode = null;
    const origExit = process.exit;
    process.exit = (code) => { exitCode = code; throw new Error('process.exit called'); };

    try {
      _guardDiscoveryMode(false);
    } catch (err) {
      // process.exit 拋出的例外，預期行為
    } finally {
      process.exit = origExit;
      if (origSessionId === undefined) {
        delete process.env.CLAUDE_SESSION_ID;
      } else {
        process.env.CLAUDE_SESSION_ID = origSessionId;
      }
    }

    // 修復後：應讀取 workflowId 路徑並阻擋（exitCode = 1）
    expect(exitCode).toBe(1);
  });

  test('A-2: active-workflow-id 不存在時放行（無狀態）', () => {
    // 不建立任何 active-workflow-id（模擬舊 session 無 workflowId）
    const origSessionId = process.env.CLAUDE_SESSION_ID;
    process.env.CLAUDE_SESSION_ID = testSessionId;

    let exitCalled = false;
    const origExit = process.exit;
    process.exit = () => { exitCalled = true; throw new Error('exit called'); };

    try {
      _guardDiscoveryMode(false);
    } catch {
      // 若 exit 被呼叫則 exitCalled = true
    } finally {
      process.exit = origExit;
      if (origSessionId === undefined) {
        delete process.env.CLAUDE_SESSION_ID;
      } else {
        process.env.CLAUDE_SESSION_ID = origSessionId;
      }
    }

    // 無 active-workflow-id → readState 回傳 null → 放行
    expect(exitCalled).toBe(false);
  });

  test('A-3: workflowType 非 discovery 時放行', () => {
    const workflowId = 'test-wf-quick-' + Date.now().toString(36);
    createWorkflowState(testSessionId, workflowId, {
      workflowType: 'quick',
      currentStage: 'DEV',
    });

    const origSessionId = process.env.CLAUDE_SESSION_ID;
    process.env.CLAUDE_SESSION_ID = testSessionId;

    let exitCalled = false;
    const origExit = process.exit;
    process.exit = () => { exitCalled = true; throw new Error('exit called'); };

    try {
      _guardDiscoveryMode(false);
    } catch {
      // 若 exit 被呼叫則 exitCalled = true
    } finally {
      process.exit = origExit;
      if (origSessionId === undefined) {
        delete process.env.CLAUDE_SESSION_ID;
      } else {
        process.env.CLAUDE_SESSION_ID = origSessionId;
      }
    }

    expect(exitCalled).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature B: guardDiscoveryMode PM 完成後放行
// ────────────────────────────────────────────────────────────────────────────

describe('Feature B: guardDiscoveryMode PM 完成後放行', () => {

  test('B-1: PM stage 仍在進行（currentStage === PM）時阻擋', () => {
    const workflowId = 'test-wf-pm-' + Date.now().toString(36);
    createWorkflowState(testSessionId, workflowId, {
      workflowType: 'discovery',
      currentStage: 'PM',
    });

    const origSessionId = process.env.CLAUDE_SESSION_ID;
    process.env.CLAUDE_SESSION_ID = testSessionId;

    let exitCode = null;
    const origExit = process.exit;
    process.exit = (code) => { exitCode = code; throw new Error('exit called'); };

    try {
      _guardDiscoveryMode(false);
    } catch { /* expected */ }
    finally {
      process.exit = origExit;
      if (origSessionId === undefined) {
        delete process.env.CLAUDE_SESSION_ID;
      } else {
        process.env.CLAUDE_SESSION_ID = origSessionId;
      }
    }

    expect(exitCode).toBe(1);
  });

  test('B-2: currentStage 為 null（PM 已完成）時放行', () => {
    const workflowId = 'test-wf-pm-done-' + Date.now().toString(36);
    createWorkflowState(testSessionId, workflowId, {
      workflowType: 'discovery',
      currentStage: null,  // PM 已完成，currentStage 為 null
    });

    const origSessionId = process.env.CLAUDE_SESSION_ID;
    process.env.CLAUDE_SESSION_ID = testSessionId;

    let exitCalled = false;
    const origExit = process.exit;
    process.exit = () => { exitCalled = true; throw new Error('exit called'); };

    try {
      _guardDiscoveryMode(false);
    } catch { /* 若 exitCalled 才是問題 */ }
    finally {
      process.exit = origExit;
      if (origSessionId === undefined) {
        delete process.env.CLAUDE_SESSION_ID;
      } else {
        process.env.CLAUDE_SESSION_ID = origSessionId;
      }
    }

    expect(exitCalled).toBe(false);
  });

  test('B-2b: currentStage 為 DEV（PM 已完成，推進到下一 stage）時放行', () => {
    const workflowId = 'test-wf-dev-' + Date.now().toString(36);
    createWorkflowState(testSessionId, workflowId, {
      workflowType: 'discovery',
      currentStage: 'DEV',  // PM 已完成，推進至 DEV
    });

    const origSessionId = process.env.CLAUDE_SESSION_ID;
    process.env.CLAUDE_SESSION_ID = testSessionId;

    let exitCalled = false;
    const origExit = process.exit;
    process.exit = () => { exitCalled = true; throw new Error('exit called'); };

    try {
      _guardDiscoveryMode(false);
    } catch { /* 若 exitCalled 才是問題 */ }
    finally {
      process.exit = origExit;
      if (origSessionId === undefined) {
        delete process.env.CLAUDE_SESSION_ID;
      } else {
        process.env.CLAUDE_SESSION_ID = origSessionId;
      }
    }

    expect(exitCalled).toBe(false);
  });

  test('B-3: --force 旗標跳過所有檢查，不阻擋', () => {
    const workflowId = 'test-wf-force-' + Date.now().toString(36);
    createWorkflowState(testSessionId, workflowId, {
      workflowType: 'discovery',
      currentStage: 'PM',  // 正常會阻擋
    });

    const origSessionId = process.env.CLAUDE_SESSION_ID;
    process.env.CLAUDE_SESSION_ID = testSessionId;

    let exitCalled = false;
    const origExit = process.exit;
    process.exit = () => { exitCalled = true; throw new Error('exit called'); };

    try {
      _guardDiscoveryMode(true);  // forceFlag = true
    } catch { /* 若 exitCalled 才是問題 */ }
    finally {
      process.exit = origExit;
      if (origSessionId === undefined) {
        delete process.env.CLAUDE_SESSION_ID;
      } else {
        process.env.CLAUDE_SESSION_ID = origSessionId;
      }
    }

    expect(exitCalled).toBe(false);
  });

  test('B-3b: 無 CLAUDE_SESSION_ID 環境變數時放行（非 session 環境）', () => {
    const origSessionId = process.env.CLAUDE_SESSION_ID;
    delete process.env.CLAUDE_SESSION_ID;

    let exitCalled = false;
    const origExit = process.exit;
    process.exit = () => { exitCalled = true; throw new Error('exit called'); };

    try {
      _guardDiscoveryMode(false);
    } catch { /* 若 exitCalled 才是問題 */ }
    finally {
      process.exit = origExit;
      if (origSessionId !== undefined) {
        process.env.CLAUDE_SESSION_ID = origSessionId;
      }
    }

    expect(exitCalled).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature F: init-workflow.js 回寫 workflowId（m2）
// ────────────────────────────────────────────────────────────────────────────

describe('Feature F: init-workflow.js 回寫 workflowId 到佇列', () => {

  test('F-1: featureName 存在且佇列有匹配項目時，workflowId 被回寫', () => {
    const featureName = 'test-feature-' + Date.now().toString(36);

    // 建立佇列（pending 項目，name 與 featureName 相同）
    executionQueue.writeQueue(testProjectRoot, [
      { name: featureName, workflow: 'quick' },
    ], 'test');

    // 執行 init-workflow.js（with featureName）
    const result = runInitWorkflow('quick', testSessionId, featureName, testProjectRoot);

    expect(result.exitCode).toBe(0);
    expect(result.workflowId).not.toBeNull();

    // 驗證佇列項目的 workflowId 被回寫
    const queue = executionQueue.readQueue(testProjectRoot);
    expect(queue).not.toBeNull();
    const item = queue.items.find(i => i.name === featureName);
    expect(item).not.toBeUndefined();
    expect(item.workflowId).toBe(result.workflowId);
  });

  test('F-2: featureName 不存在時跳過回寫，workflow 正常初始化', () => {
    // 執行 init-workflow.js（不帶 featureName）
    const result = runInitWorkflow('quick', testSessionId);

    expect(result.exitCode).toBe(0);
    expect(result.workflowId).not.toBeNull();
    // 佇列中無任何項目（沒有佇列）
    const queue = executionQueue.readQueue(testProjectRoot);
    expect(queue).toBeNull();
  });

  test('F-3: 佇列不存在時靜默忽略，workflow 仍正常初始化', () => {
    const featureName = 'no-queue-feature-' + Date.now().toString(36);
    // 不建立任何佇列

    const result = runInitWorkflow('quick', testSessionId, featureName, testProjectRoot);

    // workflow 應仍然正常初始化（exit code 0）
    expect(result.exitCode).toBe(0);
    expect(result.workflowId).not.toBeNull();
  });
});
