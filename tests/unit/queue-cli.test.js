'use strict';
/**
 * queue-cli.test.js — queue.js CLI 單元測試
 *
 * 測試面向：
 *   1. add 子命令：建立佇列
 *   2. list 子命令：列出狀態
 *   3. clear 子命令：清除佇列
 *   4. --project-root / --source 選項
 *   5. 錯誤處理
 *   6. Discovery 模式守衛
 */

const { test, expect, describe, afterAll, beforeEach, afterEach, spyOn } = require('bun:test');
const { rmSync, mkdirSync, writeFileSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const { SCRIPTS_DIR, SCRIPTS_LIB } = require('../helpers/paths');

const paths = require(join(SCRIPTS_LIB, 'paths'));
const executionQueue = require(join(SCRIPTS_LIB, 'execution-queue'));

const TIMESTAMP = Date.now();
const TEST_PROJECT = join(homedir(), '.overtone', 'test-queue-cli-' + TIMESTAMP);

afterAll(() => {
  rmSync(paths.global.dir(TEST_PROJECT), { recursive: true, force: true });
});

beforeEach(() => {
  executionQueue.clearQueue(TEST_PROJECT);
});

// ── helper ──

function runCli(args) {
  const { main } = require(join(SCRIPTS_DIR, 'queue'));
  const logs = [];
  const errors = [];
  const originalLog = console.log;
  const originalError = console.error;
  let exitCode = null;

  console.log = (...a) => logs.push(a.join(' '));
  console.error = (...a) => errors.push(a.join(' '));

  // mock process.exit
  const origExit = process.exit;
  process.exit = (code) => { exitCode = code; };

  try {
    main(args);
  } finally {
    console.log = originalLog;
    console.error = originalError;
    process.exit = origExit;
  }

  return { logs, errors, exitCode };
}

// ────────────────────────────────────────────────────────────────────────────
// 1. add 子命令
// ────────────────────────────────────────────────────────────────────────────

describe('add', () => {
  test('新增單一項目', () => {
    const { logs } = runCli(['add', '--project-root', TEST_PROJECT, 'task-1', 'quick']);
    expect(logs[0]).toContain('已建立佇列（1 項）');

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items).toHaveLength(1);
    expect(queue.items[0].name).toBe('task-1');
    expect(queue.items[0].workflow).toBe('quick');
    expect(queue.source).toBe('CLI');
  });

  test('新增多個項目', () => {
    const { logs } = runCli([
      'add', '--project-root', TEST_PROJECT,
      'feat-a', 'standard', 'fix-b', 'quick',
    ]);
    expect(logs[0]).toContain('已建立佇列（2 項）');

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items).toHaveLength(2);
    expect(queue.items[0].name).toBe('feat-a');
    expect(queue.items[1].name).toBe('fix-b');
  });

  test('自訂 --source', () => {
    runCli([
      'add', '--project-root', TEST_PROJECT,
      '--source', 'PM Discovery 2026-03-04',
      'task-x', 'single',
    ]);

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.source).toBe('PM Discovery 2026-03-04');
  });

  test('奇數參數時報錯', () => {
    const { errors, exitCode } = runCli([
      'add', '--project-root', TEST_PROJECT, 'only-name',
    ]);
    expect(exitCode).toBe(1);
    expect(errors[0]).toContain('用法');
  });

  test('無參數時報錯', () => {
    const { errors, exitCode } = runCli([
      'add', '--project-root', TEST_PROJECT,
    ]);
    expect(exitCode).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. list 子命令
// ────────────────────────────────────────────────────────────────────────────

describe('list', () => {
  test('空佇列顯示提示', () => {
    const { logs } = runCli(['list', '--project-root', TEST_PROJECT]);
    expect(logs[0]).toContain('佇列為空');
  });

  test('列出含狀態的佇列', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'a', workflow: 'quick' },
      { name: 'b', workflow: 'standard' },
    ], 'test-source');

    // 推進 a 到 in_progress 再完成
    executionQueue.advanceToNext(TEST_PROJECT);
    executionQueue.completeCurrent(TEST_PROJECT);

    const { logs } = runCli(['list', '--project-root', TEST_PROJECT]);
    const output = logs.join('\n');
    expect(output).toContain('test-source');
    expect(output).toContain('1/2 完成');
    expect(output).toContain('✅');
    expect(output).toContain('⬜');
  });

  test('列出失敗項目', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'fail-task', workflow: 'quick' },
    ], 'test');

    executionQueue.advanceToNext(TEST_PROJECT);
    executionQueue.failCurrent(TEST_PROJECT, 'spawn 失敗');

    const { logs } = runCli(['list', '--project-root', TEST_PROJECT]);
    const output = logs.join('\n');
    expect(output).toContain('❌');
    expect(output).toContain('spawn 失敗');
    expect(output).toContain('1 失敗');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. clear 子命令
// ────────────────────────────────────────────────────────────────────────────

describe('clear', () => {
  test('清除佇列', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'x', workflow: 'quick' },
    ], 'test');

    const { logs } = runCli(['clear', '--project-root', TEST_PROJECT]);
    expect(logs[0]).toContain('已清除');
    expect(executionQueue.readQueue(TEST_PROJECT)).toBeNull();
  });

  test('清除不存在的佇列不報錯', () => {
    const { logs } = runCli(['clear', '--project-root', TEST_PROJECT]);
    expect(logs[0]).toContain('已清除');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. 預設命令 / 錯誤處理
// ────────────────────────────────────────────────────────────────────────────

describe('CLI 入口', () => {
  test('無子命令顯示用法', () => {
    const { logs, exitCode } = runCli([]);
    expect(exitCode).toBe(1);
    expect(logs[0]).toContain('用法');
  });

  test('未知子命令顯示用法', () => {
    const { logs, exitCode } = runCli(['unknown']);
    expect(exitCode).toBe(1);
    expect(logs[0]).toContain('用法');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 5. PM 整合流程
// ────────────────────────────────────────────────────────────────────────────

describe('PM 整合流程', () => {
  test('模擬 PM 多次迭代寫入佇列', () => {
    // 模擬 PM 產出的 5 次迭代
    const { logs } = runCli([
      'add', '--project-root', TEST_PROJECT,
      '--source', 'PM Discovery 2026-03-04',
      'phantom-events-fix', 'quick',
      'doc-drift-precision', 'quick',
      'data-quality-cleanup', 'quick',
      'queue-cli', 'quick',
      'pm-auto-queue', 'quick',
    ]);

    expect(logs[0]).toContain('已建立佇列（5 項）');

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items).toHaveLength(5);
    expect(queue.source).toBe('PM Discovery 2026-03-04');
    expect(queue.items.every(i => i.status === 'pending')).toBe(true);
  });

  test('PM 佇列推進：advanceToNext 後 getCurrent 回傳第一項', () => {
    runCli([
      'add', '--project-root', TEST_PROJECT,
      '--source', 'PM Discovery 2026-03-04',
      'phantom-events-fix', 'quick',
      'doc-drift-precision', 'quick',
    ]);

    executionQueue.advanceToNext(TEST_PROJECT);

    const current = executionQueue.getCurrent(TEST_PROJECT);
    expect(current).not.toBeNull();
    expect(current.item.name).toBe('phantom-events-fix');
    expect(current.item.status).toBe('in_progress');
  });

  test('PM 佇列完成一項後下一項仍為 pending', () => {
    runCli([
      'add', '--project-root', TEST_PROJECT,
      '--source', 'PM Discovery 2026-03-04',
      'phantom-events-fix', 'quick',
      'doc-drift-precision', 'quick',
    ]);

    executionQueue.advanceToNext(TEST_PROJECT);
    executionQueue.completeCurrent(TEST_PROJECT);

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items[0].status).toBe('completed');
    expect(queue.items[1].status).toBe('pending');

    const next = executionQueue.getNext(TEST_PROJECT);
    expect(next).not.toBeNull();
    expect(next.item.name).toBe('doc-drift-precision');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 6. Discovery 模式守衛
// ────────────────────────────────────────────────────────────────────────────

describe('Discovery 模式守衛', () => {
  const stateModule = require(join(SCRIPTS_LIB, 'state'));
  let origReadState;
  const GUARD_SESSION_ID = 'test-discovery-guard-' + Date.now();

  // 輔助：為 guardDiscoveryMode 建立 activeWorkflowId 檔案
  function setupDiscoverySession(sessionId, workflowId) {
    const sessionDir = paths.sessionDir(sessionId);
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(paths.session.activeWorkflowId(sessionId), workflowId);
  }

  // 輔助：清理 session 目錄
  function cleanupDiscoverySession(sessionId) {
    try {
      rmSync(paths.sessionDir(sessionId), { recursive: true, force: true });
    } catch { /* ignore */ }
  }

  beforeEach(() => {
    origReadState = stateModule.readState;
  });

  afterEach(() => {
    stateModule.readState = origReadState;
    delete process.env.CLAUDE_SESSION_ID;
    cleanupDiscoverySession(GUARD_SESSION_ID);
  });

  test('discovery workflow 時 add 被阻擋（exit 1）', () => {
    process.env.CLAUDE_SESSION_ID = GUARD_SESSION_ID;
    setupDiscoverySession(GUARD_SESSION_ID, 'test-wf-guard');
    stateModule.readState = () => ({ workflowType: 'discovery', currentStage: 'PM' });

    const { errors, exitCode } = runCli([
      'add', '--project-root', TEST_PROJECT,
      'should-block', 'quick',
    ]);

    expect(exitCode).toBe(1);
    expect(errors[0]).toContain('Discovery');
  });

  test('discovery workflow 時 append 被阻擋（exit 1）', () => {
    process.env.CLAUDE_SESSION_ID = GUARD_SESSION_ID;
    setupDiscoverySession(GUARD_SESSION_ID, 'test-wf-guard');
    stateModule.readState = () => ({ workflowType: 'discovery', currentStage: 'PM' });

    const { errors, exitCode } = runCli([
      'append', '--project-root', TEST_PROJECT,
      'should-block', 'quick',
    ]);

    expect(exitCode).toBe(1);
    expect(errors[0]).toContain('Discovery');
  });

  test('discovery workflow + --force 時允許寫入', () => {
    process.env.CLAUDE_SESSION_ID = GUARD_SESSION_ID;
    setupDiscoverySession(GUARD_SESSION_ID, 'test-wf-guard');
    stateModule.readState = () => ({ workflowType: 'discovery', currentStage: 'PM' });

    const { logs, exitCode } = runCli([
      'add', '--project-root', TEST_PROJECT, '--force',
      'should-pass', 'quick',
    ]);

    expect(exitCode).not.toBe(1);
    expect(logs[0]).toContain('已建立佇列');
  });

  test('非 discovery workflow 時正常寫入', () => {
    process.env.CLAUDE_SESSION_ID = 'test-discovery-guard';
    stateModule.readState = () => ({ workflowType: 'product' });

    const { logs, exitCode } = runCli([
      'add', '--project-root', TEST_PROJECT,
      'should-pass', 'quick',
    ]);

    expect(exitCode).not.toBe(1);
    expect(logs[0]).toContain('已建立佇列');
  });

  test('無 CLAUDE_SESSION_ID 時正常寫入（非 session 環境）', () => {
    delete process.env.CLAUDE_SESSION_ID;

    const { logs, exitCode } = runCli([
      'add', '--project-root', TEST_PROJECT,
      'should-pass', 'quick',
    ]);

    expect(exitCode).not.toBe(1);
    expect(logs[0]).toContain('已建立佇列');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature C: queue.js CLI suggest-order --smart flag
// ────────────────────────────────────────────────────────────────────────────

describe('suggest-order --smart flag', () => {
  test('C-1 不加 --smart 時不顯示智慧排序說明文字', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'full-task', workflow: 'full' },
      { name: 'quick-task', workflow: 'quick' },
    ], 'test');

    const { logs } = runCli(['suggest-order', '--project-root', TEST_PROJECT]);
    const output = logs.join('\n');
    expect(output).toContain('建議排序');
    expect(output).not.toContain('智慧排序模式');
  });

  test('C-2 加 --smart 時輸出包含智慧排序模式說明', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'full-task', workflow: 'full' },
      { name: 'quick-task', workflow: 'quick' },
    ], 'test');

    const { logs } = runCli(['suggest-order', '--smart', '--project-root', TEST_PROJECT]);
    const output = logs.join('\n');
    expect(output).toContain('智慧排序模式（依複雜度 + 歷史失敗率）');
    expect(output).toContain('建議排序');
  });

  test('C-3 --smart 不被誤判為 positional 參數（不產生 Unknown command）', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'task-A', workflow: 'standard' },
      { name: 'task-B', workflow: 'quick' },
    ], 'test');

    const { errors, exitCode } = runCli(['suggest-order', '--smart', '--project-root', TEST_PROJECT]);
    expect(errors).toHaveLength(0);
    expect(exitCode).not.toBe(1);
  });

  test('C-4 --smart 與 --apply 可同時使用，排序套用後佇列順序改變', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'full-task', workflow: 'full' },
      { name: 'quick-task', workflow: 'quick' },
    ], 'test');

    const { logs, errors } = runCli([
      'suggest-order', '--smart', '--apply', '--project-root', TEST_PROJECT,
    ]);
    const output = logs.join('\n');
    expect(errors).toHaveLength(0);
    expect(output).toContain('智慧排序模式');
    expect(output).toContain('已套用建議排序');

    // 確認佇列順序已被套用
    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items[0].name).toBe('quick-task');
    expect(queue.items[1].name).toBe('full-task');
  });
});
