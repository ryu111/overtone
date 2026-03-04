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
 */

const { test, expect, describe, afterAll, beforeEach, spyOn } = require('bun:test');
const { rmSync } = require('fs');
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
