'use strict';
/**
 * on-task-completed.test.js
 *
 * 驗證 TaskCompleted hook 的放行行為。
 *
 * 策略：spawn 子進程執行 hook 腳本，注入 mock stdin，捕捉 exit code。
 *
 * 所有 task 直接放行（exit 0），包含 [DEV] task。
 * bun test 全量執行需 58s > 45s timeout，導致 100% 假失敗，故移除。
 * DEV agent 自身停止條件已包含「測試通過」，hook 不再重複執行測試。
 */

const { describe, test, expect } = require('bun:test');
const { join } = require('path');
const { spawnSync } = require('child_process');
const { HOOKS_DIR } = require('../helpers/paths');

const HOOK_PATH = join(HOOKS_DIR, 'task', 'on-task-completed.js');

/**
 * 執行 hook 腳本並注入 stdin JSON，回傳 { exitCode, stdout, stderr }
 */
function runHook(input, timeoutMs = 10000) {
  const result = spawnSync('node', [HOOK_PATH], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    timeout: timeoutMs,
  });
  return {
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

// ── Scenario 1: 非 [DEV] task 直接放行 ──

describe('非 [DEV] task → 直接放行（exit 0）', () => {
  test('[REVIEW] task 不執行品質檢查，exit 0', () => {
    const { exitCode } = runHook({
      session_id: 'test-session',
      task_id: 'task-1',
      task_subject: '[REVIEW] 審查程式碼',
    });
    expect(exitCode).toBe(0);
  });

  test('[TEST] task 不執行品質檢查，exit 0', () => {
    const { exitCode } = runHook({
      session_id: 'test-session',
      task_id: 'task-2',
      task_subject: '[TEST] 執行測試',
    });
    expect(exitCode).toBe(0);
  });

  test('[PLAN] task 不執行品質檢查，exit 0', () => {
    const { exitCode } = runHook({
      session_id: 'test-session',
      task_id: 'task-3',
      task_subject: '[PLAN] 規劃功能',
    });
    expect(exitCode).toBe(0);
  });

  test('[RETRO] task 不執行品質檢查，exit 0', () => {
    const { exitCode } = runHook({
      session_id: 'test-session',
      task_id: 'task-4',
      task_subject: '[RETRO] 回顧',
    });
    expect(exitCode).toBe(0);
  });
});

// ── Scenario 2: 無 task_subject → 靜默放行 ──

describe('無 task_subject → 靜默放行（exit 0）', () => {
  test('task_subject 缺失時 exit 0', () => {
    const { exitCode } = runHook({
      session_id: 'test-session',
      task_id: 'task-5',
    });
    expect(exitCode).toBe(0);
  });

  test('task_subject 為空字串時 exit 0', () => {
    const { exitCode } = runHook({
      session_id: 'test-session',
      task_id: 'task-6',
      task_subject: '',
    });
    expect(exitCode).toBe(0);
  });
});

// ── Scenario 3: [DEV] task → 直接放行（不執行 bun test）──

describe('[DEV] task → 直接放行（exit 0，不執行 bun test）', () => {
  test('[DEV] task 直接放行，exit 0', () => {
    const { exitCode } = runHook({
      session_id: 'test-session',
      task_id: 'task-7',
      task_subject: '[DEV] S7 TaskCompleted Hook 開發',
    });
    expect(exitCode).toBe(0);
  });

  test('[DEV] task 即使 cwd 不存在也放行，exit 0', () => {
    const { exitCode } = runHook({
      session_id: 'test-session',
      task_id: 'task-8',
      task_subject: '[DEV] 某功能開發',
      cwd: '/tmp/nonexistent-project-dir-overtone-test',
    });
    expect(exitCode).toBe(0);
  });
});
