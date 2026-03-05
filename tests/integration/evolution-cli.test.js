'use strict';
/**
 * evolution-cli.test.js — evolution.js CLI help 與 status 子命令整合測試
 *
 * 覆蓋：
 *   Scenario 1: --help 旗標行為
 *   Scenario 2: 子命令 --help 行為
 *   Scenario 3: status 子命令純文字輸出
 *   Scenario 4: status --json 輸出結構
 */

const { test, expect, describe } = require('bun:test');
const path = require('path');
const { SCRIPTS_DIR, PROJECT_ROOT } = require('../helpers/paths');

const EVOLUTION_SCRIPT = path.join(SCRIPTS_DIR, 'evolution.js');

// ── 輔助函式 ──

/**
 * 執行 evolution.js 子進程
 * @param {string[]} args - CLI 參數
 * @returns {{ exitCode: number, stdout: string, stderr: string }}
 */
function runEvolution(args = []) {
  const proc = Bun.spawnSync(['bun', EVOLUTION_SCRIPT, ...args], {
    cwd: PROJECT_ROOT,
    env: { ...process.env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout ? new TextDecoder().decode(proc.stdout) : '',
    stderr: proc.stderr ? new TextDecoder().decode(proc.stderr) : '',
  };
}

// ══════════════════════════════════════════════════════════════════
// Scenario 1: --help 旗標行為
// ══════════════════════════════════════════════════════════════════

describe('Scenario 1: --help 旗標', () => {
  let result;

  function getResult() {
    if (!result) result = runEvolution(['--help']);
    return result;
  }

  test('exit code 為 0（不是 1）', () => {
    expect(getResult().exitCode).toBe(0);
  });

  test('stdout 包含完整子命令列表', () => {
    const out = getResult().stdout;
    expect(out).toContain('analyze');
    expect(out).toContain('fix');
    expect(out).toContain('forge');
    expect(out).toContain('orchestrate');
    expect(out).toContain('internalize');
    expect(out).toContain('status');
  });

  test('stdout 包含 --help 選項說明', () => {
    expect(getResult().stdout).toContain('--help');
  });

  test('stderr 無錯誤', () => {
    expect(getResult().stderr).toBe('');
  });
});

// ══════════════════════════════════════════════════════════════════
// Scenario 2: 子命令 --help 行為
// ══════════════════════════════════════════════════════════════════

describe('Scenario 2: forge --help 子命令說明', () => {
  let result;

  function getResult() {
    if (!result) result = runEvolution(['forge', '--help']);
    return result;
  }

  test('exit code 為 0', () => {
    expect(getResult().exitCode).toBe(0);
  });

  test('stdout 包含 forge 用法說明', () => {
    const out = getResult().stdout;
    expect(out).toContain('forge');
    expect(out).toContain('domain');
    expect(out).toContain('--execute');
  });

  test('stderr 無錯誤', () => {
    expect(getResult().stderr).toBe('');
  });
});

describe('Scenario 2b: fix --help 子命令說明', () => {
  test('exit code 為 0 且包含 fix 用法', () => {
    const result = runEvolution(['fix', '--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('fix');
    expect(result.stdout).toContain('--execute');
    expect(result.stdout).toContain('--type');
  });
});

describe('Scenario 2c: analyze --help 子命令說明', () => {
  test('exit code 為 0 且包含 analyze 用法', () => {
    const result = runEvolution(['analyze', '--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('analyze');
  });
});

describe('Scenario 2d: internalize --help 子命令說明', () => {
  test('exit code 為 0 且包含 internalize 用法', () => {
    const result = runEvolution(['internalize', '--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('internalize');
    expect(result.stdout).toContain('--execute');
  });
});

describe('Scenario 2e: status --help 子命令說明', () => {
  test('exit code 為 0 且包含 status 用法', () => {
    const result = runEvolution(['status', '--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('status');
  });
});

// ══════════════════════════════════════════════════════════════════
// Scenario 3: status 子命令純文字輸出
// ══════════════════════════════════════════════════════════════════

describe('Scenario 3: status 純文字輸出', () => {
  let result;

  function getResult() {
    if (!result) result = runEvolution(['status']);
    return result;
  }

  test('exit code 為 0', () => {
    expect(getResult().exitCode).toBe(0);
  });

  test('stdout 包含 Evolution Status 標題', () => {
    expect(getResult().stdout).toContain('Evolution Status');
  });

  test('stdout 包含 Gap 分析區塊', () => {
    expect(getResult().stdout).toContain('Gap 分析');
  });

  test('stdout 包含 Internalize 索引區塊', () => {
    expect(getResult().stdout).toContain('Internalize 索引');
  });

  test('stdout 包含 Experience Index 區塊', () => {
    expect(getResult().stdout).toContain('Experience Index');
  });

  test('stderr 無錯誤', () => {
    expect(getResult().stderr).toBe('');
  });
});

// ══════════════════════════════════════════════════════════════════
// Scenario 4: status --json 輸出結構
// ══════════════════════════════════════════════════════════════════

describe('Scenario 4: status --json 輸出結構', () => {
  let result;
  let parsed;

  function getResult() {
    if (!result) result = runEvolution(['status', '--json']);
    return result;
  }

  function getParsed() {
    if (!parsed) parsed = JSON.parse(getResult().stdout);
    return parsed;
  }

  test('exit code 為 0', () => {
    expect(getResult().exitCode).toBe(0);
  });

  test('輸出為合法 JSON', () => {
    expect(() => getParsed()).not.toThrow();
  });

  test('包含 gaps 物件', () => {
    const { gaps } = getParsed();
    expect(typeof gaps).toBe('object');
    expect(typeof gaps.ok).toBe('boolean');
  });

  test('gaps 包含 total 數值', () => {
    expect(typeof getParsed().gaps.total).toBe('number');
  });

  test('gaps 包含 bySeverity 物件', () => {
    const { bySeverity } = getParsed().gaps;
    expect(typeof bySeverity).toBe('object');
    expect(typeof bySeverity.error).toBe('number');
    expect(typeof bySeverity.warning).toBe('number');
    expect(typeof bySeverity.info).toBe('number');
  });

  test('包含 internalize 物件', () => {
    const { internalize } = getParsed();
    expect(typeof internalize).toBe('object');
    expect(typeof internalize.exists).toBe('boolean');
  });

  test('包含 experienceIndex 物件', () => {
    const { experienceIndex } = getParsed();
    expect(typeof experienceIndex).toBe('object');
    expect(typeof experienceIndex.exists).toBe('boolean');
  });
});
