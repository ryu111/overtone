'use strict';
/**
 * post-use-handler.test.js — observeBashError, extractCommandTag 純函數測試
 */

const { describe, it, expect } = require('bun:test');
const { observeBashError, extractCommandTag } = require('../../plugins/overtone/scripts/lib/post-use-handler');

// ── extractCommandTag 測試 ──

describe('extractCommandTag', () => {
  it('Scenario 1: bun 指令回傳 "bun"', () => {
    expect(extractCommandTag('bun test')).toBe('bun');
  });

  it('Scenario 2: npm 指令回傳 "npm"', () => {
    expect(extractCommandTag('npm run build')).toBe('npm');
  });

  it('Scenario 3: git 指令回傳 "git"', () => {
    expect(extractCommandTag('git commit -m "fix"')).toBe('git');
  });

  it('Scenario 4: tsc 指令回傳 "typescript"', () => {
    expect(extractCommandTag('tsc --noEmit')).toBe('typescript');
  });

  it('Scenario 5: 未知指令回傳原始名稱', () => {
    expect(extractCommandTag('mycommand --flag')).toBe('mycommand');
  });

  it('Scenario 6: 空字串回傳 "shell"', () => {
    expect(extractCommandTag('')).toBe('shell');
  });

  it('Scenario 7: vitest 回傳 "jest"（別名映射）', () => {
    expect(extractCommandTag('vitest run')).toBe('jest');
  });

  it('Scenario 8: python3 回傳 "python"（別名映射）', () => {
    expect(extractCommandTag('python3 script.py')).toBe('python');
  });
});

// ── observeBashError 測試 ──

describe('observeBashError', () => {
  const sessionId = 'test-session-observe';

  it('Scenario 1: exit_code=0 時回傳 null（無錯誤）', () => {
    const result = observeBashError(
      sessionId,
      { command: 'bun test' },
      { exit_code: 0, stderr: '' }
    );
    expect(result).toBeNull();
  });

  it('Scenario 2: exit_code=undefined 時回傳 null', () => {
    const result = observeBashError(
      sessionId,
      { command: 'bun test' },
      {}
    );
    expect(result).toBeNull();
  });

  it('Scenario 3: 空 command 時回傳 null', () => {
    const result = observeBashError(
      sessionId,
      { command: '' },
      { exit_code: 1, stderr: 'error' }
    );
    expect(result).toBeNull();
  });

  it('Scenario 4: 重要工具 + 實質 stderr → 回傳自我修復指令', () => {
    const result = observeBashError(
      sessionId,
      { command: 'bun test' },
      { exit_code: 1, stderr: 'Module not found: cannot resolve "./missing"' }
    );
    expect(result).not.toBeNull();
    expect(result).toContain('Overtone 錯誤守衛');
    expect(result).toContain('debugger');
    expect(result).toContain('developer');
  });

  it('Scenario 5: 重要工具 + 短 stderr（< 20字）→ 回傳 null（非重大）', () => {
    const result = observeBashError(
      sessionId,
      { command: 'git push' },
      { exit_code: 1, stderr: 'rejected' }
    );
    expect(result).toBeNull();
  });

  it('Scenario 6: 非重要工具 + 實質 stderr → 回傳 null', () => {
    const result = observeBashError(
      sessionId,
      { command: 'curl https://example.com' },
      { exit_code: 6, stderr: 'Could not resolve host: example.com' }
    );
    expect(result).toBeNull();
  });

  it('Scenario 7: 支援 exitCode（camelCase）和 returncode 格式', () => {
    // exitCode 格式
    const r1 = observeBashError(
      sessionId,
      { command: 'bun run' },
      { exitCode: 0, stderr: '' }
    );
    expect(r1).toBeNull();

    // returncode 格式
    const r2 = observeBashError(
      sessionId,
      { command: 'bun run' },
      { returncode: 0 }
    );
    expect(r2).toBeNull();
  });
});
