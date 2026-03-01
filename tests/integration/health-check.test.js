'use strict';
/**
 * health-check.test.js — health-check.js 整合測試
 *
 * 覆蓋：
 *   Feature 6: 輸出格式驗證（JSON schema 合規性）
 *   Feature 7: Exit code 行為
 *   在真實 codebase 執行驗證
 */

const { test, expect, describe } = require('bun:test');
const path = require('path');
const { SCRIPTS_DIR } = require('../helpers/paths');

const HEALTH_CHECK_SCRIPT = path.join(SCRIPTS_DIR, 'health-check.js');

// ── 輔助函式 ──

/**
 * 執行 health-check.js 子進程
 * @returns {{ exitCode: number, stdout: string, stderr: string }}
 */
function runHealthCheck() {
  const proc = Bun.spawnSync(['bun', HEALTH_CHECK_SCRIPT], {
    cwd: path.join(SCRIPTS_DIR, '..', '..', '..'),  // 專案根目錄
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
// Feature 6: 輸出格式驗證
// ══════════════════════════════════════════════════════════════════

describe('Feature 6：輸出格式驗證', () => {
  // 只執行一次，讓所有測試共用結果
  let result;
  let parsed;

  // 執行腳本（共用結果）
  function getResult() {
    if (!result) {
      result = runHealthCheck();
    }
    return result;
  }

  function getParsed() {
    if (!parsed) {
      parsed = JSON.parse(getResult().stdout);
    }
    return parsed;
  }

  test('Scenario 正常 — stdout 是合法的 JSON 字串', () => {
    const { stdout } = getResult();
    expect(() => JSON.parse(stdout)).not.toThrow();
  });

  test('Scenario 正常 — 頂層物件包含 version 欄位（string）', () => {
    const output = getParsed();
    expect(typeof output.version).toBe('string');
    expect(output.version.length).toBeGreaterThan(0);
  });

  test('Scenario 正常 — 頂層物件包含 timestamp 欄位（ISO 8601）', () => {
    const output = getParsed();
    expect(typeof output.timestamp).toBe('string');
    // 驗證 ISO 8601 格式
    const d = new Date(output.timestamp);
    expect(isNaN(d.getTime())).toBe(false);
  });

  test('Scenario 正常 — 頂層物件包含 checks 欄位（array）', () => {
    const output = getParsed();
    expect(Array.isArray(output.checks)).toBe(true);
  });

  test('Scenario 正常 — 頂層物件包含 findings 欄位（array）', () => {
    const output = getParsed();
    expect(Array.isArray(output.findings)).toBe(true);
  });

  test('Scenario 正常 — 頂層物件包含 summary 欄位（object）', () => {
    const output = getParsed();
    expect(typeof output.summary).toBe('object');
    expect(output.summary).not.toBeNull();
  });

  test('Scenario checks — checks 陣列長度為 7', () => {
    const output = getParsed();
    expect(output.checks.length).toBe(7);
  });

  test('Scenario checks — 包含所有 7 個偵測項目', () => {
    const output = getParsed();
    const names = output.checks.map((c) => c.name);
    expect(names).toContain('phantom-events');
    expect(names).toContain('dead-exports');
    expect(names).toContain('doc-code-drift');
    expect(names).toContain('unused-paths');
    expect(names).toContain('duplicate-logic');
    expect(names).toContain('platform-drift');
    expect(names).toContain('doc-staleness');
  });

  test('Scenario checks — 每個 check 包含 name、passed、findingsCount', () => {
    const output = getParsed();
    for (const c of output.checks) {
      expect(typeof c.name).toBe('string');
      expect(typeof c.passed).toBe('boolean');
      expect(typeof c.findingsCount).toBe('number');
    }
  });

  test('Scenario findings — 每筆 finding 包含必要欄位', () => {
    const output = getParsed();
    const validChecks = new Set(['phantom-events', 'dead-exports', 'doc-code-drift', 'unused-paths', 'duplicate-logic', 'platform-drift', 'doc-staleness']);
    const validSeverities = new Set(['error', 'warning', 'info']);
    for (const f of output.findings) {
      expect(typeof f.check).toBe('string');
      expect(validChecks.has(f.check)).toBe(true);
      expect(validSeverities.has(f.severity)).toBe(true);
      expect(typeof f.file).toBe('string');
      expect(typeof f.message).toBe('string');
    }
  });

  test('Scenario summary — 包含 total、errors、warnings、infos、passed', () => {
    const { summary } = getParsed();
    expect(typeof summary.total).toBe('number');
    expect(typeof summary.errors).toBe('number');
    expect(typeof summary.warnings).toBe('number');
    expect(typeof summary.infos).toBe('number');
    expect(typeof summary.passed).toBe('boolean');
  });

  test('Scenario summary — summary 數字與 findings 陣列一致', () => {
    const output = getParsed();
    const { findings, summary } = output;

    const errors   = findings.filter((f) => f.severity === 'error').length;
    const warnings = findings.filter((f) => f.severity === 'warning').length;
    const infos    = findings.filter((f) => f.severity === 'info').length;

    expect(summary.total).toBe(findings.length);
    expect(summary.errors).toBe(errors);
    expect(summary.warnings).toBe(warnings);
    expect(summary.infos).toBe(infos);
  });

  test('Scenario summary — passed 與 findings 長度一致', () => {
    const output = getParsed();
    const { findings, summary } = output;
    if (findings.length === 0) {
      expect(summary.passed).toBe(true);
    } else {
      expect(summary.passed).toBe(false);
    }
  });

  test('Scenario summary — version 與 plugin.json 一致', () => {
    const { readFileSync } = require('fs');
    const pluginJsonPath = path.join(SCRIPTS_DIR, '..', '.claude-plugin', 'plugin.json');
    const pluginJson = JSON.parse(readFileSync(pluginJsonPath, 'utf8'));
    const output = getParsed();
    expect(output.version).toBe(pluginJson.version);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 7: Exit code 行為
// ══════════════════════════════════════════════════════════════════

describe('Feature 7：Exit code 行為', () => {
  test('Scenario — exit code 與 summary.passed 一致', () => {
    const result = runHealthCheck();
    const output = JSON.parse(result.stdout);

    if (output.summary.passed) {
      expect(result.exitCode).toBe(0);
    } else {
      expect(result.exitCode).toBe(1);
    }
  });

  test('Scenario — 任何 finding（無論 severity）都導致 exit 1', () => {
    const result = runHealthCheck();
    const output = JSON.parse(result.stdout);

    // 若有任何 finding（包括 info），exit code 應為 1
    if (output.findings.length > 0) {
      expect(result.exitCode).toBe(1);
    }
  });

  test('Scenario — exit code 0 時 passed 為 true', () => {
    const result = runHealthCheck();
    if (result.exitCode === 0) {
      const output = JSON.parse(result.stdout);
      expect(output.summary.passed).toBe(true);
      expect(output.findings.length).toBe(0);
    } else {
      // exit 1 時 passed 為 false
      const output = JSON.parse(result.stdout);
      expect(output.summary.passed).toBe(false);
    }
  });

  test('Scenario — stdout 不為空（即使有錯誤也有輸出）', () => {
    const result = runHealthCheck();
    expect(result.stdout.length).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// 真實 codebase 執行驗證
// ══════════════════════════════════════════════════════════════════

describe('真實 codebase 執行驗證', () => {
  test('在真實 codebase 執行不拋出非預期例外', () => {
    const result = runHealthCheck();
    // 無論有無 findings，stdout 都應是合法 JSON
    expect(() => JSON.parse(result.stdout)).not.toThrow();
  });

  test('所有 7 個 check 都成功執行（findingsCount 為數字）', () => {
    const result = runHealthCheck();
    const output = JSON.parse(result.stdout);
    expect(output.checks.length).toBe(7);
    for (const c of output.checks) {
      expect(Number.isInteger(c.findingsCount)).toBe(true);
      expect(c.findingsCount).toBeGreaterThanOrEqual(0);
    }
  });

  test('phantom-events check 有執行（存在於 checks 陣列中）', () => {
    const result = runHealthCheck();
    const output = JSON.parse(result.stdout);
    const check = output.checks.find((c) => c.name === 'phantom-events');
    expect(check).toBeDefined();
    expect(typeof check.passed).toBe('boolean');
  });

  test('dead-exports check 有執行', () => {
    const result = runHealthCheck();
    const output = JSON.parse(result.stdout);
    const check = output.checks.find((c) => c.name === 'dead-exports');
    expect(check).toBeDefined();
  });

  test('doc-code-drift check 有執行', () => {
    const result = runHealthCheck();
    const output = JSON.parse(result.stdout);
    const check = output.checks.find((c) => c.name === 'doc-code-drift');
    expect(check).toBeDefined();
  });

  test('unused-paths check 有執行', () => {
    const result = runHealthCheck();
    const output = JSON.parse(result.stdout);
    const check = output.checks.find((c) => c.name === 'unused-paths');
    expect(check).toBeDefined();
  });

  test('duplicate-logic check 有執行', () => {
    const result = runHealthCheck();
    const output = JSON.parse(result.stdout);
    const check = output.checks.find((c) => c.name === 'duplicate-logic');
    expect(check).toBeDefined();
  });

  test('doc-staleness check 有執行', () => {
    const result = runHealthCheck();
    const output = JSON.parse(result.stdout);
    const check = output.checks.find((c) => c.name === 'doc-staleness');
    expect(check).toBeDefined();
    expect(typeof check.passed).toBe('boolean');
  });
});
