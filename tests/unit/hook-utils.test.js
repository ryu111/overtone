'use strict';
/**
 * hook-utils.test.js
 * 測試 safeReadStdin, safeRun, hookError 三個函式
 *
 * 策略：
 * - hookError：直接呼叫，spy stderr
 * - safeRun：spawn 子進程以避免 process.exit(0) 污染測試環境
 * - safeReadStdin：spawn 子進程並 pipe stdin，驗證解析結果
 */

const { describe, it, expect } = require('bun:test');
const { join } = require('path');
const { spawnSync } = require('child_process');
const { SCRIPTS_LIB } = require('../helpers/paths');

const HOOK_UTILS = join(SCRIPTS_LIB, 'hook-utils');

// ── 輔助函式 ──

/**
 * 執行一個小型 node 腳本（傳入 stdin 字串），捕捉 stdout/stderr/exitCode
 */
function runScript(script, stdinData = '') {
  const result = spawnSync('node', ['-e', script], {
    input: stdinData,
    encoding: 'utf8',
    timeout: 5000,
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status,
  };
}

// ── Feature 1: safeReadStdin ──

describe('safeReadStdin', () => {
  it('正常 JSON stdin 成功解析', () => {
    const script = `
      const { safeReadStdin } = require(${JSON.stringify(HOOK_UTILS)});
      const result = safeReadStdin();
      process.stdout.write(JSON.stringify(result));
    `;
    const { stdout, stderr, exitCode } = runScript(script, '{"session_id":"abc123","tool_input":{}}');
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual({ session_id: 'abc123', tool_input: {} });
    expect(stderr).toBe('');
  });

  it('畸形 JSON stdin 回傳空物件', () => {
    const script = `
      const { safeReadStdin } = require(${JSON.stringify(HOOK_UTILS)});
      const result = safeReadStdin();
      process.stdout.write(JSON.stringify(result));
    `;
    const { stdout, stderr, exitCode } = runScript(script, '{not valid json');
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual({});
    expect(stderr).toContain('[overtone/');
  });

  it('空 stdin 回傳空物件並寫入 stderr 警告', () => {
    const script = `
      const { safeReadStdin } = require(${JSON.stringify(HOOK_UTILS)});
      const result = safeReadStdin();
      process.stdout.write(JSON.stringify(result));
    `;
    const { stdout, stderr, exitCode } = runScript(script, '');
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual({});
    expect(stderr).toContain('[overtone/');
  });

  it('stdin 讀取失敗（不可讀）時回傳空物件且不拋例外', () => {
    // 用 /dev/null 模擬無法讀到有效 JSON 的情況
    // 在 node 中，嘗試 readFileSync('/dev/null') 會回傳空字串
    const script = `
      const fs = require('fs');
      const original = fs.readFileSync;
      fs.readFileSync = (path, enc) => {
        if (path === '/dev/stdin') throw Object.assign(new Error('EBADF'), { code: 'EBADF' });
        return original.call(fs, path, enc);
      };
      const { safeReadStdin } = require(${JSON.stringify(HOOK_UTILS)});
      const result = safeReadStdin();
      process.stdout.write(JSON.stringify(result));
    `;
    const { stdout, stderr, exitCode } = runScript(script, '');
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual({});
    expect(stderr).toContain('[overtone/');
  });
});

// ── Feature 2: safeRun ──

describe('safeRun', () => {
  it('函式拋出未預期錯誤時輸出 defaultOutput 並 exit 0', () => {
    const script = `
      const { safeRun } = require(${JSON.stringify(HOOK_UTILS)});
      safeRun(() => { throw new Error('unexpected'); });
    `;
    const { stdout, stderr, exitCode } = runScript(script);
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual({ result: '' });
    expect(stderr).toContain('[overtone/');
  });

  it('自訂 defaultOutput（additionalContext）時輸出正確格式', () => {
    const script = `
      const { safeRun } = require(${JSON.stringify(HOOK_UTILS)});
      safeRun(() => { throw new Error('oops'); }, { additionalContext: '' });
    `;
    const { stdout, stderr, exitCode } = runScript(script);
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual({ additionalContext: '' });
    expect(stderr).toContain('[overtone/');
  });

  it('exit code 永遠為 0（正常路徑）', () => {
    const script = `
      const { safeRun } = require(${JSON.stringify(HOOK_UTILS)});
      safeRun(() => {
        // fn 正常完成但沒有手動 stdout.write + exit
        // safeRun 負責輸出 defaultOutput 並 exit 0
      });
    `;
    const { stdout, exitCode } = runScript(script);
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual({ result: '' });
  });

  it('exit code 永遠為 0（錯誤路徑）', () => {
    const script = `
      const { safeRun } = require(${JSON.stringify(HOOK_UTILS)});
      safeRun(() => { throw new Error('crash'); });
    `;
    const { exitCode } = runScript(script);
    expect(exitCode).toBe(0);
  });

  it('fn 內部自行呼叫 process.stdout.write 並 process.exit(0) 時正常退出', () => {
    const script = `
      const { safeRun } = require(${JSON.stringify(HOOK_UTILS)});
      safeRun(() => {
        process.stdout.write(JSON.stringify({ result: 'custom' }));
        process.exit(0);
      });
    `;
    const { stdout, exitCode } = runScript(script);
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual({ result: 'custom' });
  });
});

// ── Feature 3: hookError ──

describe('hookError', () => {
  it('stderr 格式正確包含 hookName 和 message', () => {
    const script = `
      const { hookError } = require(${JSON.stringify(HOOK_UTILS)});
      hookError('on-start', 'stdin parse failed');
    `;
    const { stdout, stderr } = runScript(script);
    expect(stderr).toBe('[overtone/on-start] stdin parse failed\n');
    expect(stdout).toBe('');
  });

  it('不同 hookName 輸出對應前綴', () => {
    const script = `
      const { hookError } = require(${JSON.stringify(HOOK_UTILS)});
      hookError('pre-task', 'state read error');
    `;
    const { stderr } = runScript(script);
    expect(stderr).toBe('[overtone/pre-task] state read error\n');
  });

  it('hookError 不影響 stdout', () => {
    const script = `
      const { hookError } = require(${JSON.stringify(HOOK_UTILS)});
      hookError('on-stop', 'some error');
      hookError('on-stop', 'another error');
    `;
    const { stdout, stderr } = runScript(script);
    expect(stdout).toBe('');
    expect(stderr).toContain('[overtone/on-stop] some error');
    expect(stderr).toContain('[overtone/on-stop] another error');
  });
});
