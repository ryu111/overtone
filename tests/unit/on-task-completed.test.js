'use strict';
/**
 * on-task-completed.test.js
 *
 * 驗證 TaskCompleted hook 的品質門檻硬阻擋行為。
 *
 * 策略：spawn 子進程執行 hook 腳本，注入 mock stdin，捕捉 exit code + stderr。
 *
 * [DEV] + 測試通過 scenario：
 *   建立暫時目錄，放入假的 package.json + 空 test 檔，讓 bun test 成功。
 *   這樣可以在合理時間內驗證 exit 0 分支，不依賴完整專案的 bun test。
 */

const { describe, test, expect, beforeAll, afterAll } = require('bun:test');
const { join } = require('path');
const { spawnSync } = require('child_process');
const { mkdirSync, writeFileSync, rmSync, existsSync } = require('fs');
const { HOOKS_DIR } = require('../helpers/paths');

const HOOK_PATH = join(HOOKS_DIR, 'task', 'on-task-completed.js');

// 暫時目錄路徑（[DEV] + 通過 scenario 使用）
const TEMP_PASS_DIR = join('/tmp', 'overtone-task-completed-pass-test');

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

// ── 暫時目錄初始化/清理 ──

beforeAll(() => {
  // 建立最小化 bun 測試專案（bun test 可以正常執行且通過）
  if (!existsSync(TEMP_PASS_DIR)) {
    mkdirSync(TEMP_PASS_DIR, { recursive: true });
  }
  writeFileSync(join(TEMP_PASS_DIR, 'package.json'), JSON.stringify({
    name: 'overtone-test-mock',
    version: '1.0.0',
  }));
  // 建立一個空的 test 檔案（bun test 發現時會 pass）
  writeFileSync(join(TEMP_PASS_DIR, 'empty.test.js'), `
'use strict';
const { test, expect } = require('bun:test');
test('dummy pass', () => { expect(1).toBe(1); });
`);
});

afterAll(() => {
  try {
    if (existsSync(TEMP_PASS_DIR)) {
      rmSync(TEMP_PASS_DIR, { recursive: true, force: true });
    }
  } catch {
    // 清理失敗不影響測試結果
  }
});

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

// ── Scenario 3: [DEV] task + bun test 通過 → exit 0 ──

describe('[DEV] task + 測試通過 → exit 0', () => {
  test('[DEV] task，bun test 通過，exit 0', () => {
    const { exitCode } = runHook({
      session_id: 'test-session',
      task_id: 'task-7',
      task_subject: '[DEV] S7 TaskCompleted Hook 開發',
      cwd: TEMP_PASS_DIR,
    }, 30000);
    expect(exitCode).toBe(0);
  });
});

// ── Scenario 4: [DEV] task + bun test 失敗 → exit 2 + stderr 包含品質門檻訊息 ──

describe('[DEV] task + 測試失敗 → exit 2', () => {
  test('[DEV] task，bun test 失敗（不存在的 cwd），exit 2', () => {
    const { exitCode, stderr } = runHook({
      session_id: 'test-session',
      task_id: 'task-8',
      task_subject: '[DEV] 某功能開發',
      cwd: '/tmp/nonexistent-project-dir-overtone-test',
    });
    expect(exitCode).toBe(2);
    expect(stderr).toContain('品質門檻未通過');
  });

  test('失敗時 stderr 包含「請修復後再標記 DEV 完成」', () => {
    const { exitCode, stderr } = runHook({
      session_id: 'test-session',
      task_id: 'task-9',
      task_subject: '[DEV] 某功能開發',
      cwd: '/tmp/nonexistent-project-dir-overtone-test',
    });
    expect(exitCode).toBe(2);
    expect(stderr).toContain('請修復後再標記 DEV 完成');
  });
});
