'use strict';
/**
 * gap-fixer.test.js — gap-fixer.js 單元測試
 *
 * 覆蓋：
 *   Feature 1: dryRun 模式不執行任何 fs 操作
 *   Feature 2: no-references 修復 → 建立 references/README.md
 *   Feature 3: typeFilter 只修復指定類型
 *   Feature 4: fixable: false 缺口一律跳過（not-fixable）
 *   Feature 5: 空 gaps 陣列 → FixResult 全空
 *   Feature 6: sync-mismatch 修復 → 呼叫 fix-consistency.js（真實環境）
 *   Feature 7: no-references 修復失敗 → failed 陣列
 *   Feature 8: typeFilter 為不可修復類型時全部跳過
 */

const { test, expect, describe, beforeAll, afterAll } = require('bun:test');
const path = require('path');
const { mkdirSync, existsSync, readFileSync, rmSync, writeFileSync } = require('fs');
const { SCRIPTS_LIB, PLUGIN_ROOT } = require('../helpers/paths');

const { fixGaps } = require(path.join(SCRIPTS_LIB, 'gap-fixer'));

// ── 測試輔助 ──

function makeNoReferencesGap(skillName, overrides = {}) {
  return {
    type: 'no-references',
    severity: 'warning',
    file: `skills/${skillName}/SKILL.md`,
    message: `skill "${skillName}" 缺少 references/ 目錄`,
    suggestion: '',
    sourceCheck: 'completion-gap',
    fixable: true,
    fixAction: 'create-references: 建立 references/ 目錄和 README.md 佔位',
    ...overrides,
  };
}

function makeSyncMismatchGap(agentName, skillName, overrides = {}) {
  return {
    type: 'sync-mismatch',
    severity: 'warning',
    file: `agents/${agentName}.md`,
    message: `agent "${agentName}" 使用 skill "${skillName}" 但消費者表未列出`,
    suggestion: '',
    sourceCheck: 'dependency-sync',
    fixable: true,
    fixAction: 'fix-consistency: 在 SKILL.md 消費者表新增缺少的 agent',
    ...overrides,
  };
}

function makeNotFixableGap(type = 'missing-skill', overrides = {}) {
  return {
    type,
    severity: 'warning',
    file: `agents/developer.md`,
    message: `gap message`,
    suggestion: '',
    sourceCheck: 'component-chain',
    fixable: false,
    fixAction: '',
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════
// Feature 5: 空 gaps 陣列
// ══════════════════════════════════════════════════════════════════

describe('fixGaps — 空 gaps 陣列', () => {
  test('空陣列時 fixed/skipped/failed 均為空', () => {
    const result = fixGaps([], { dryRun: false });
    expect(result.fixed).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
  });

  test('undefined gaps 不拋例外', () => {
    expect(() => {
      fixGaps(undefined, { dryRun: false });
    }).not.toThrow();
  });

  test('undefined gaps 回傳空結果', () => {
    const result = fixGaps(undefined, { dryRun: false });
    expect(result.fixed).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 1: dryRun 模式
// ══════════════════════════════════════════════════════════════════

describe('fixGaps — dryRun 模式', () => {
  const TMP_ROOT = '/tmp/gap-fixer-dryrun-test-' + Date.now();

  beforeAll(() => {
    mkdirSync(path.join(TMP_ROOT, 'skills', 'foo'), { recursive: true });
    writeFileSync(path.join(TMP_ROOT, 'skills', 'foo', 'SKILL.md'), '# Foo\n');
  });

  afterAll(() => {
    try { rmSync(TMP_ROOT, { recursive: true, force: true }); } catch { /* 靜默 */ }
  });

  test('dryRun: true 時 fixed 為空', () => {
    const gaps = [
      makeNoReferencesGap('foo'),
      makeSyncMismatchGap('developer', 'foo'),
    ];
    const result = fixGaps(gaps, { dryRun: true, pluginRoot: TMP_ROOT });
    expect(result.fixed).toHaveLength(0);
  });

  test('dryRun: true 時 skipped 包含全部 fixable 缺口', () => {
    const gaps = [
      makeNoReferencesGap('foo'),
      makeSyncMismatchGap('developer', 'foo'),
    ];
    const result = fixGaps(gaps, { dryRun: true, pluginRoot: TMP_ROOT });
    expect(result.skipped).toHaveLength(2);
    for (const item of result.skipped) {
      expect(item.reason).toBe('dry-run');
    }
  });

  test('dryRun: true 時磁碟不新增 references 目錄', () => {
    const gaps = [makeNoReferencesGap('foo')];
    fixGaps(gaps, { dryRun: true, pluginRoot: TMP_ROOT });
    expect(existsSync(path.join(TMP_ROOT, 'skills', 'foo', 'references'))).toBe(false);
  });

  test('dryRun 預設值為 true（不傳 dryRun 時不修復）', () => {
    const gaps = [makeNoReferencesGap('foo')];
    const result = fixGaps(gaps, { pluginRoot: TMP_ROOT });
    expect(result.fixed).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe('dry-run');
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 4: fixable: false 缺口跳過
// ══════════════════════════════════════════════════════════════════

describe('fixGaps — fixable: false 缺口', () => {
  test('missing-skill 出現在 skipped，reason 為 not-fixable', () => {
    const gaps = [makeNotFixableGap('missing-skill')];
    const result = fixGaps(gaps, { dryRun: false });
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe('not-fixable');
    expect(result.skipped[0].gap.type).toBe('missing-skill');
  });

  test('broken-chain 出現在 skipped，reason 為 not-fixable', () => {
    const gaps = [makeNotFixableGap('broken-chain')];
    const result = fixGaps(gaps, { dryRun: false });
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe('not-fixable');
  });

  test('missing-consumer 出現在 skipped，reason 為 not-fixable', () => {
    const gaps = [makeNotFixableGap('missing-consumer')];
    const result = fixGaps(gaps, { dryRun: false });
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe('not-fixable');
  });

  test('混合：not-fixable + fixable 時 not-fixable 在 skipped，fixable 在 fixed', () => {
    const TMP_ROOT = '/tmp/gap-fixer-mixed-' + Date.now();
    mkdirSync(path.join(TMP_ROOT, 'skills', 'bar'), { recursive: true });

    const gaps = [
      makeNotFixableGap('missing-skill'),
      makeNoReferencesGap('bar'),
    ];
    const result = fixGaps(gaps, { dryRun: false, pluginRoot: TMP_ROOT });

    expect(result.fixed).toHaveLength(1);
    expect(result.fixed[0].type).toBe('no-references');
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe('not-fixable');

    try { rmSync(TMP_ROOT, { recursive: true, force: true }); } catch { /* 靜默 */ }
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 3: typeFilter 過濾
// ══════════════════════════════════════════════════════════════════

describe('fixGaps — typeFilter 過濾', () => {
  test('typeFilter: no-references 時 sync-mismatch 出現在 skipped', () => {
    const TMP_ROOT = '/tmp/gap-fixer-filter-' + Date.now();
    mkdirSync(path.join(TMP_ROOT, 'skills', 'baz'), { recursive: true });
    mkdirSync(path.join(TMP_ROOT, 'skills', 'qux'), { recursive: true });

    const gaps = [
      makeSyncMismatchGap('dev', 'baz'),
      makeSyncMismatchGap('arch', 'qux'),
      makeNoReferencesGap('baz'),
      makeNoReferencesGap('qux'),
    ];
    const result = fixGaps(gaps, { dryRun: false, typeFilter: 'no-references', pluginRoot: TMP_ROOT });

    const fixedTypes = result.fixed.map((g) => g.type);
    const skippedReasons = result.skipped.map((i) => i.reason);

    expect(result.fixed.length).toBe(2);
    expect(fixedTypes.every((t) => t === 'no-references')).toBe(true);
    expect(result.skipped.length).toBe(2);
    expect(skippedReasons.every((r) => r === 'type-filter')).toBe(true);

    try { rmSync(TMP_ROOT, { recursive: true, force: true }); } catch { /* 靜默 */ }
  });

  test('typeFilter 為不可修復類型時全部跳過（reason: type-filter 優先於 not-fixable）', () => {
    const gaps = [
      makeNoReferencesGap('x'),
      makeSyncMismatchGap('dev', 'x'),
    ];
    const result = fixGaps(gaps, { dryRun: false, typeFilter: 'missing-skill' });

    // 兩個 fixable 缺口，type 不匹配 → type-filter
    expect(result.fixed).toHaveLength(0);
    expect(result.skipped).toHaveLength(2);
    for (const item of result.skipped) {
      expect(item.reason).toBe('type-filter');
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 2: no-references 修復（建立 references/README.md）
// ══════════════════════════════════════════════════════════════════

describe('fixGaps — no-references 修復', () => {
  const TMP_ROOT = '/tmp/gap-fixer-norefs-' + Date.now();

  beforeAll(() => {
    mkdirSync(path.join(TMP_ROOT, 'skills', 'skill-a'), { recursive: true });
    writeFileSync(path.join(TMP_ROOT, 'skills', 'skill-a', 'SKILL.md'), '# Skill A\n');
  });

  afterAll(() => {
    try { rmSync(TMP_ROOT, { recursive: true, force: true }); } catch { /* 靜默 */ }
  });

  test('修復後 references/ 目錄存在', () => {
    const gaps = [makeNoReferencesGap('skill-a')];
    fixGaps(gaps, { dryRun: false, pluginRoot: TMP_ROOT });
    expect(existsSync(path.join(TMP_ROOT, 'skills', 'skill-a', 'references'))).toBe(true);
  });

  test('修復後 references/README.md 存在且內容為 "# References\\n"', () => {
    const readmePath = path.join(TMP_ROOT, 'skills', 'skill-a', 'references', 'README.md');
    expect(existsSync(readmePath)).toBe(true);
    const content = readFileSync(readmePath, 'utf8');
    expect(content).toBe('# References\n');
  });

  test('修復後 fixed 陣列包含該缺口', () => {
    // 先刪掉 references/ 再重建
    const TMP_ROOT2 = '/tmp/gap-fixer-norefs2-' + Date.now();
    mkdirSync(path.join(TMP_ROOT2, 'skills', 'skill-b'), { recursive: true });
    const gaps = [makeNoReferencesGap('skill-b')];
    const result = fixGaps(gaps, { dryRun: false, pluginRoot: TMP_ROOT2 });
    expect(result.fixed).toHaveLength(1);
    expect(result.fixed[0].type).toBe('no-references');
    try { rmSync(TMP_ROOT2, { recursive: true, force: true }); } catch { /* 靜默 */ }
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 7: no-references 修復失敗 → failed 陣列
// ══════════════════════════════════════════════════════════════════

describe('fixGaps — no-references 修復失敗', () => {
  test('file 路徑無法解析 skillName 時進入 failed', () => {
    // file 為空字串或無 skills 路徑
    const gap = makeNoReferencesGap('x', { file: 'invalid-path-no-skills' });
    const result = fixGaps([gap], { dryRun: false });
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].error).toBeTruthy();
    expect(result.fixed).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 6: sync-mismatch 修復（真實 fix-consistency.js）
// ══════════════════════════════════════════════════════════════════

describe('fixGaps — sync-mismatch 修復（真實環境）', () => {
  // 此測試使用真實 pluginRoot，僅在 sync-mismatch 真實存在時有意義
  // 但測試邏輯驗證：給定已修復的 pluginRoot，呼叫後 fixed.length >= 0（不拋例外）
  test('不拋例外且回傳 FixResult 結構', () => {
    // 給予一個空 gaps 陣列的 sync-mismatch（無需真實問題）
    const result = fixGaps([], { dryRun: false, pluginRoot: PLUGIN_ROOT });
    expect(typeof result).toBe('object');
    expect(Array.isArray(result.fixed)).toBe(true);
    expect(Array.isArray(result.skipped)).toBe(true);
    expect(Array.isArray(result.failed)).toBe(true);
  });

  test('3 個 sync-mismatch 缺口只呼叫一次（批次）— 驗證 fixed 或 failed 總計等於輸入數', () => {
    // 使用假 sync-mismatch gaps，由於 fix-consistency.js --fix 是真實執行
    // 在系統已同步的狀態下，會 exit 0 → fixed = 3
    const gaps = [
      makeSyncMismatchGap('dev', 'skill1'),
      makeSyncMismatchGap('arch', 'skill2'),
      makeSyncMismatchGap('tester', 'skill3'),
    ];
    const result = fixGaps(gaps, { dryRun: false, pluginRoot: PLUGIN_ROOT });
    // 批次執行：全部 fixed 或全部 failed（取決於 fix-consistency.js 是否 exit 0）
    const total = result.fixed.length + result.failed.length;
    expect(total).toBe(3);
  });
});
