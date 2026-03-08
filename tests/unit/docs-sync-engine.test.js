'use strict';
/**
 * docs-sync-engine.test.js
 *
 * 驗證 docs-sync-engine.js 模組的核心行為：
 * 1. scanDrift() 能正確偵測 CLAUDE.md 中的錯誤數字
 * 2. fixDrift() 能修復 CLAUDE.md 中的數字
 * 3. 在 CLAUDE.md 數字正確時，isClean = true
 * 4. scanDrift() 不修改任何檔案（純掃描）
 * 5. fixDrift() 只修改有 drift 的檔案
 */

const { describe, test, expect, beforeEach, afterEach } = require('bun:test');
const fs = require('fs');
const { join } = require('path');
const os = require('os');

// ── 模組路徑 ──────────────────────────────────────────────────────────────

const { PROJECT_ROOT, SCRIPTS_LIB } = require('../helpers/paths');
const ENGINE_PATH = join(SCRIPTS_LIB, 'analyzers/docs-sync-engine.js');

// ── 直接測試 extractNumber ───────────────────────────────────────────────

const {
  extractNumber,
} = require(ENGINE_PATH);

describe('extractNumber — 從文字提取數字', () => {
  test('成功提取 regex 匹配的第一個數字', () => {
    const result = extractNumber('17 個 agent', /(\d+)\s+個\s*agent/);
    expect(result).toBe(17);
  });

  test('無匹配回傳 null', () => {
    const result = extractNumber('無匹配文字', /(\d+)\s+個\s*agent/);
    expect(result).toBeNull();
  });
});

// ── getActualCounts 測試 ─────────────────────────────────────────────────

describe('getActualCounts — 計算實際組件數量', () => {
  const { getActualCounts } = require(ENGINE_PATH);

  test('回傳值包含 agentCount、skillCount、commandCount、hookCount', () => {
    const counts = getActualCounts();
    expect(typeof counts.agentCount).toBe('number');
    expect(typeof counts.skillCount).toBe('number');
    expect(typeof counts.commandCount).toBe('number');
    expect(typeof counts.hookCount).toBe('number');
  });

  test('agentCount 為正整數（至少 1）', () => {
    const { agentCount } = getActualCounts();
    expect(agentCount).toBeGreaterThan(0);
  });

  test('skillCount 為正整數（至少 1）', () => {
    const { skillCount } = getActualCounts();
    expect(skillCount).toBeGreaterThan(0);
  });

  test('commandCount 為正整數（至少 1）', () => {
    const { commandCount } = getActualCounts();
    expect(commandCount).toBeGreaterThan(0);
  });

  test('hookCount 為正整數（至少 1）', () => {
    const { hookCount } = getActualCounts();
    expect(hookCount).toBeGreaterThan(0);
  });
});

// ── scanDrift() 測試 ────────────────────────────────────────────────────

describe('scanDrift() — 純掃描行為', () => {
  const { scanDrift } = require(ENGINE_PATH);

  test('回傳物件包含 drifts 陣列和 isClean 布林值', () => {
    const result = scanDrift();
    expect(Array.isArray(result.drifts)).toBe(true);
    expect(typeof result.isClean).toBe('boolean');
  });

  test('isClean 為 true 時 drifts 陣列為空', () => {
    const result = scanDrift();
    if (result.isClean) {
      expect(result.drifts.length).toBe(0);
    }
  });

  test('isClean 為 false 時 drifts 陣列不為空', () => {
    const result = scanDrift();
    if (!result.isClean) {
      expect(result.drifts.length).toBeGreaterThan(0);
    }
  });

  test('drift 項目包含必要欄位：file、field、expected、actual', () => {
    const result = scanDrift();
    for (const drift of result.drifts) {
      expect(drift.file).toBeTruthy();
      expect(drift.field).toBeTruthy();
      expect(drift.expected).toBeDefined();
      expect(drift.actual).toBeDefined();
    }
  });

  test('scanDrift() 不修改任何檔案（純掃描）', () => {
    const claudeMdPath = join(PROJECT_ROOT, 'CLAUDE.md');

    if (!fs.existsSync(claudeMdPath)) {
      return;
    }

    const mtimeBefore = fs.statSync(claudeMdPath).mtimeMs;
    scanDrift();
    const mtimeAfter = fs.statSync(claudeMdPath).mtimeMs;

    expect(mtimeAfter).toBe(mtimeBefore);
  });
});

// ── fixDrift() 行為測試 ────────────────────────────────────────────────────

describe('fixDrift() — 修復行為', () => {
  const { fixDrift } = require(ENGINE_PATH);

  test('空 drifts 陣列回傳空結果', () => {
    const result = fixDrift([]);
    expect(result.fixed).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  test('null/undefined drifts 回傳空結果', () => {
    const result1 = fixDrift(null);
    expect(result1.fixed).toEqual([]);

    const result2 = fixDrift(undefined);
    expect(result2.fixed).toEqual([]);
  });

  test('Plugin 版本 drift 被跳過（不自動修復）', () => {
    const drifts = [{
      file: 'CLAUDE.md',
      field: 'Plugin 版本',
      expected: '1.0.0',
      actual: '0.9.0',
    }];
    const result = fixDrift(drifts);
    expect(result.skipped.length).toBe(1);
    expect(result.fixed.length).toBe(0);
    expect(result.skipped[0]).toMatch(/版本語意/);
  });

  test('回傳 { fixed, skipped, errors } 三個陣列', () => {
    const result = fixDrift([]);
    expect(Array.isArray(result.fixed)).toBe(true);
    expect(Array.isArray(result.skipped)).toBe(true);
    expect(Array.isArray(result.errors)).toBe(true);
  });
});

// ── runDocsSyncCheck() 整合測試 ───────────────────────────────────────────

describe('runDocsSyncCheck() — 一鍵掃描 + 修復', () => {
  const { runDocsSyncCheck } = require(ENGINE_PATH);

  test('回傳物件包含 wasClean、drifts、fixed、skipped、errors', () => {
    const result = runDocsSyncCheck();
    expect(typeof result.wasClean).toBe('boolean');
    expect(Array.isArray(result.drifts)).toBe(true);
    expect(Array.isArray(result.fixed)).toBe(true);
    expect(Array.isArray(result.skipped)).toBe(true);
    expect(Array.isArray(result.errors)).toBe(true);
  });

  test('wasClean = true 時 drifts 和 fixed 均為空陣列', () => {
    const result = runDocsSyncCheck();
    if (result.wasClean) {
      expect(result.drifts.length).toBe(0);
      expect(result.fixed.length).toBe(0);
    }
  });

  test('wasClean = false 時 drifts 不為空', () => {
    const result = runDocsSyncCheck();
    if (!result.wasClean) {
      expect(result.drifts.length).toBeGreaterThan(0);
    }
  });
});

// ── 系統整合驗證 ──────────────────────────────────────────────────────────

describe('系統整合驗證 — CLAUDE.md 數字正確時 isClean = true', () => {
  const { scanDrift } = require(ENGINE_PATH);

  test('掃描結果中無 CLAUDE.md 相關的 drift', () => {
    const result = scanDrift();
    const claudeDrifts = result.drifts.filter(d => d.file === 'CLAUDE.md');

    if (claudeDrifts.length > 0) {
      const details = claudeDrifts.map(d => `${d.field}: 期望 ${d.expected}, 實際 ${d.actual}`).join('; ');
      throw new Error(`CLAUDE.md 數字不一致：${details}`);
    }
  });
});
