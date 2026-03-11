// @sequential — health-check 子進程 cwd 競爭
'use strict';
/**
 * evolution-analyze.test.js — evolution.js CLI 整合測試
 *
 * 覆蓋：
 *   Scenario 1: analyze 子命令輸出純文字報告
 *   Scenario 2: analyze --json 輸出 JSON 格式
 *   Scenario 3: 無缺口時 exit 0（真實 plugin root）
 *   Scenario 4: analyze --json 無缺口時輸出空陣列
 *   Scenario 5: 無效子命令顯示使用說明 + exit 1
 *   Scenario 6: 不帶子命令顯示使用說明 + exit 1
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
// Scenario 1: analyze 子命令輸出純文字報告
// ══════════════════════════════════════════════════════════════════

describe('Scenario 1: analyze 純文字輸出', () => {
  let result;

  function getResult() {
    if (!result) result = runEvolution(['analyze']);
    return result;
  }

  test('stdout 包含 Evolution Gap Analysis 標題', () => {
    expect(getResult().stdout).toContain('Evolution Gap Analysis');
  });

  test('stdout 包含總計缺口資訊', () => {
    expect(getResult().stdout).toContain('總計：');
  });

  test('exit code 為 0 或 1（依缺口有無決定）', () => {
    const code = getResult().exitCode;
    expect(code === 0 || code === 1).toBe(true);
  });

  test('stderr 無錯誤', () => {
    expect(getResult().stderr).toBe('');
  });
});

// ══════════════════════════════════════════════════════════════════
// Scenario 2: analyze --json 輸出 JSON 格式
// ══════════════════════════════════════════════════════════════════

describe('Scenario 2: analyze --json 輸出格式', () => {
  let result;
  let parsed;

  function getResult() {
    if (!result) result = runEvolution(['analyze', '--json']);
    return result;
  }

  function getParsed() {
    if (!parsed) parsed = JSON.parse(getResult().stdout);
    return parsed;
  }

  test('stdout 為合法 JSON（不拋例外）', () => {
    expect(() => getParsed()).not.toThrow();
  });

  test('JSON 包含 gaps 陣列', () => {
    expect(Array.isArray(getParsed().gaps)).toBe(true);
  });

  test('JSON 包含 summary 物件', () => {
    expect(typeof getParsed().summary).toBe('object');
    expect(getParsed().summary).not.toBeNull();
  });

  test('summary 包含 total 數值', () => {
    expect(typeof getParsed().summary.total).toBe('number');
  });

  test('summary 包含 bySeverity 物件', () => {
    const { bySeverity } = getParsed().summary;
    expect(typeof bySeverity).toBe('object');
    expect(typeof bySeverity.error).toBe('number');
    expect(typeof bySeverity.warning).toBe('number');
    expect(typeof bySeverity.info).toBe('number');
  });

  test('stderr 無錯誤', () => {
    expect(getResult().stderr).toBe('');
  });
});

// ══════════════════════════════════════════════════════════════════
// Scenario 3: 真實 plugin root — 無缺口時 exit 0
// ══════════════════════════════════════════════════════════════════

describe('Scenario 3: 真實 plugin root 無缺口 exit 0', () => {
  test('analyze 以真實 codebase 執行應 exit 0（系統健康）', () => {
    const result = runEvolution(['analyze']);
    expect(result.exitCode).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// Scenario 4: analyze --json 無缺口時輸出空陣列
// ══════════════════════════════════════════════════════════════════

describe('Scenario 4: analyze --json 無缺口時結構', () => {
  let result;
  let parsed;

  function getResult() {
    if (!result) result = runEvolution(['analyze', '--json']);
    return result;
  }

  function getParsed() {
    if (!parsed) parsed = JSON.parse(getResult().stdout);
    return parsed;
  }

  test('gaps 為空陣列', () => {
    expect(getParsed().gaps).toEqual([]);
  });

  test('summary.total 為 0', () => {
    expect(getParsed().summary.total).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// Scenario 5: 無效子命令顯示使用說明 + exit 1
// ══════════════════════════════════════════════════════════════════

describe('Scenario 5: 無效子命令', () => {
  let result;

  function getResult() {
    if (!result) result = runEvolution(['invalid-command']);
    return result;
  }

  test('exit code 為 1', () => {
    expect(getResult().exitCode).toBe(1);
  });

  test('stdout 包含使用說明', () => {
    expect(getResult().stdout).toContain('用法');
  });

  test('stderr 包含未知子命令提示', () => {
    expect(getResult().stderr).toContain('未知子命令');
  });
});

// ══════════════════════════════════════════════════════════════════
// Scenario 6: 不帶子命令顯示使用說明 + exit 1
// ══════════════════════════════════════════════════════════════════

describe('Scenario 6: 不帶子命令', () => {
  let result;

  function getResult() {
    if (!result) result = runEvolution([]);
    return result;
  }

  test('exit code 為 1', () => {
    expect(getResult().exitCode).toBe(1);
  });

  test('stdout 包含使用說明', () => {
    expect(getResult().stdout).toContain('用法');
  });

  test('stdout 包含 analyze 子命令說明', () => {
    expect(getResult().stdout).toContain('analyze');
  });
});
