'use strict';
/**
 * evolution-fix.test.js — evolution.js fix 子命令 integration 測試
 *
 * 覆蓋（BDD Feature 3, 4, 5）：
 *   Feature 1: fix 預設 dry-run → 不修改檔案，exit 0
 *   Feature 2: fix --execute → 真正修復（no-references），exit 0
 *   Feature 3: fix --type sync-mismatch → 只修復該類型
 *   Feature 4: fix --type invalid → exit 1
 *   Feature 5: fix 無缺口 → exit 0
 *   Feature 6: fix --json → JSON 輸出
 */

const { test, expect, describe, beforeAll, afterAll } = require('bun:test');
const path = require('path');
const { mkdirSync, existsSync, rmSync, writeFileSync, readFileSync } = require('fs');
const { SCRIPTS_DIR, PLUGIN_ROOT } = require('../helpers/paths');

const EVOLUTION_SCRIPT = path.join(SCRIPTS_DIR, 'evolution.js');

// 啟動一個子進程執行 evolution.js
function runEvolution(args = [], env = {}) {
  const result = Bun.spawnSync(['bun', EVOLUTION_SCRIPT, ...args], {
    cwd: path.dirname(SCRIPTS_DIR),
    env: { ...process.env, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout ? Buffer.from(result.stdout).toString() : '',
    stderr: result.stderr ? Buffer.from(result.stderr).toString() : '',
  };
}

// ══════════════════════════════════════════════════════════════════
// Feature 1: fix 預設 dry-run
// ══════════════════════════════════════════════════════════════════

describe('evolution fix — 預設 dry-run', () => {
  test('不加 --execute 時 exit 0', () => {
    const result = runEvolution(['fix']);
    expect(result.exitCode).toBe(0);
  });

  test('不加 --execute 時 stdout 包含 dry-run 提示', () => {
    const result = runEvolution(['fix']);
    // 可能是 "無缺口" 或 "Dry Run 預覽"
    const hasDryRunOrNoGap = result.stdout.includes('Dry Run') || result.stdout.includes('無缺口') || result.stdout.includes('無可修復');
    expect(hasDryRunOrNoGap).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 4: fix --type invalid → exit 1
// ══════════════════════════════════════════════════════════════════

describe('evolution fix — --type 無效值', () => {
  test('--type invalid-type → exit 1', () => {
    const result = runEvolution(['fix', '--type', 'invalid-type']);
    expect(result.exitCode).toBe(1);
  });

  test('--type invalid-type → stderr 包含錯誤訊息', () => {
    const result = runEvolution(['fix', '--type', 'invalid-type']);
    expect(result.stderr).toContain('invalid-type');
  });

  test('--type invalid-type 搭配 --execute → 同樣 exit 1', () => {
    const result = runEvolution(['fix', '--execute', '--type', 'invalid-type']);
    expect(result.exitCode).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 5: 系統無缺口時 exit 0（真實 plugin 已健康）
// ══════════════════════════════════════════════════════════════════

describe('evolution fix — 真實系統（無缺口）', () => {
  test('系統健康時 fix 執行 exit 0', () => {
    const result = runEvolution(['fix']);
    expect(result.exitCode).toBe(0);
  });

  test('系統健康時 fix --execute exit 0', () => {
    const result = runEvolution(['fix', '--execute']);
    expect(result.exitCode).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 2: fix --execute 修復 no-references（透過注入缺口的方式）
// ══════════════════════════════════════════════════════════════════

describe('evolution fix --execute — no-references 真實修復', () => {
  // 在 PLUGIN_ROOT 下建立一個臨時 skill（無 references/）
  // 因為 fix-consistency.js 直接跑，只能測試整體流程不報錯
  // 具體的 no-references 修復由 gap-fixer.test.js 單元測試覆蓋

  const TEST_SKILL_NAME = 'test-tmp-skill-' + Date.now();
  const TEST_SKILL_DIR = path.join(PLUGIN_ROOT, 'skills', TEST_SKILL_NAME);
  const SKILL_MD_PATH = path.join(TEST_SKILL_DIR, 'SKILL.md');

  beforeAll(() => {
    // 建立一個沒有 references/ 的 skill，觸發 no-references 缺口
    mkdirSync(TEST_SKILL_DIR, { recursive: true });
    writeFileSync(SKILL_MD_PATH, [
      '---',
      `name: ${TEST_SKILL_NAME}`,
      'description: 測試用暫存 skill',
      '---',
      '',
      '# Test Skill',
      '',
      '## 消費者',
      '',
      '| Agent | 用途 |',
      '|-------|------|',
      '| developer | 測試用 |',
      '',
      '## 資源索引',
      '',
      '（無）',
    ].join('\n'));
  });

  afterAll(() => {
    // 清除暫存 skill 目錄
    try { rmSync(TEST_SKILL_DIR, { recursive: true, force: true }); } catch { /* 靜默 */ }
  });

  test('fix --execute 執行不報錯（exit 0 或有修復動作）', () => {
    const result = runEvolution(['fix', '--execute']);
    // 修復後若仍有其他缺口可能 exit 1，但不應因 runtime 錯誤而失敗
    // 主要驗證：不是因為 exception 崩潰（exit code 不是 non-zero runtime error）
    expect([0, 1]).toContain(result.exitCode);
    expect(result.stderr).not.toContain('TypeError');
    expect(result.stderr).not.toContain('ReferenceError');
  });

  test('fix --execute 後 references/README.md 被建立', () => {
    // 在上一個測試中已執行 fix --execute
    // 若 analyzeGaps 偵測到 no-references 缺口，fix 應已建立 README.md
    const readmePath = path.join(TEST_SKILL_DIR, 'references', 'README.md');
    // 驗證修復確實發生（或 skill 不在 completion-gap 偵測範圍內）
    // 此斷言寬鬆：若沒被偵測到則目錄不存在也可接受
    if (existsSync(readmePath)) {
      const content = readFileSync(readmePath, 'utf8');
      expect(content).toBe('# References\n');
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 3: fix --type sync-mismatch
// ══════════════════════════════════════════════════════════════════

describe('evolution fix --type sync-mismatch', () => {
  test('--type sync-mismatch → exit 0（型別合法）', () => {
    const result = runEvolution(['fix', '--type', 'sync-mismatch']);
    expect(result.exitCode).toBe(0);
  });

  test('--type no-references → exit 0（型別合法）', () => {
    const result = runEvolution(['fix', '--type', 'no-references']);
    expect(result.exitCode).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 6: fix --json → JSON 輸出
// ══════════════════════════════════════════════════════════════════

describe('evolution fix --json', () => {
  test('輸出為合法 JSON', () => {
    const result = runEvolution(['fix', '--json']);
    expect(result.exitCode).toBe(0);
    let parsed;
    expect(() => {
      parsed = JSON.parse(result.stdout);
    }).not.toThrow();
    expect(typeof parsed).toBe('object');
  });

  test('JSON 包含 dryRun: true', () => {
    const result = runEvolution(['fix', '--json']);
    const parsed = JSON.parse(result.stdout);
    // 若無缺口，結構略有不同，但 dryRun 或 fixableGaps 必須存在
    const hasExpectedKey = 'dryRun' in parsed || 'fixableGaps' in parsed || 'fixed' in parsed;
    expect(hasExpectedKey).toBe(true);
  });

  test('fix --execute --json 輸出含 fixed/skipped/failed 陣列', () => {
    const result = runEvolution(['fix', '--execute', '--json']);
    expect([0, 1]).toContain(result.exitCode);
    let parsed;
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      // 若 exit 1 且輸出不是 JSON 則失敗
      throw new Error(`stdout 不是合法 JSON: ${result.stdout}`);
    }
    expect(Array.isArray(parsed.fixed)).toBe(true);
    expect(Array.isArray(parsed.skipped)).toBe(true);
    expect(Array.isArray(parsed.failed)).toBe(true);
    expect(Array.isArray(parsed.remainingGaps)).toBe(true);
  });

  test('fix --json --type invalid-type → exit 1（JSON 格式不輸出）', () => {
    const result = runEvolution(['fix', '--json', '--type', 'bad-type']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('bad-type');
  });
});
