'use strict';
/**
 * grader-deletion.test.js — Feature 1：grader.js 空殼模組刪除後行為不變驗證
 *
 * BDD 規格：specs/features/in-progress/core-refactor-iter1/bdd.md
 *
 * Scenario 1：刪除空殼模組後無任何 require 錯誤
 * Scenario 2：其他模組不依賴 grader.js 的匯出值
 * Scenario 3：刪除後測試套件完整性不受影響
 */
const { test, expect, describe } = require('bun:test');
const { join } = require('path');
const { existsSync } = require('fs');
const { SCRIPTS_LIB, PLUGIN_ROOT } = require('../helpers/paths');

// ════════════════════════════════════════════════════════
// Scenario 1：刪除後無 require 錯誤
// ════════════════════════════════════════════════════════

describe('Feature 1：grader.js 已刪除 — 無任何 require 錯誤', () => {
  test('grader.js 不存在於 scripts/lib/ 目錄', () => {
    const graderPath = join(SCRIPTS_LIB, 'grader.js');
    expect(existsSync(graderPath)).toBe(false);
  });

  test('registry.js 可正常 require（不依賴 grader.js）', () => {
    expect(() => require(join(SCRIPTS_LIB, 'registry'))).not.toThrow();
  });

  test('config-api.js 可正常 require（不依賴 grader.js）', () => {
    expect(() => require(join(SCRIPTS_LIB, 'config-api'))).not.toThrow();
  });

  test('state.js 可正常 require（不依賴 grader.js）', () => {
    expect(() => require(join(SCRIPTS_LIB, 'state'))).not.toThrow();
  });

  test('timeline.js 可正常 require（不依賴 grader.js）', () => {
    expect(() => require(join(SCRIPTS_LIB, 'timeline'))).not.toThrow();
  });

  test('parse-result.js 可正常 require（不依賴 grader.js）', () => {
    expect(() => require(join(SCRIPTS_LIB, 'parse-result'))).not.toThrow();
  });
});

// ════════════════════════════════════════════════════════
// Scenario 2：其他模組不依賴 grader.js 匯出值
// ════════════════════════════════════════════════════════

describe('Feature 1：其他模組不依賴 grader.js 匯出值', () => {
  test('registry.js 匯出 agentModels 正常，不依賴 grader.js', () => {
    const registry = require(join(SCRIPTS_LIB, 'registry'));
    // registry.js 的 agentModels 管理 agent 模型分配，與 grader.js 模組無關
    expect(registry.agentModels).toBeDefined();
    expect(typeof registry.agentModels).toBe('object');
    // grader agent 透過 agents/grader.md 定義，不在 agentModels 中（由 on-grader hook 委派）
    // 重要：registry.js 可正常載入，代表 grader.js 刪除不影響 registry
    expect(registry.stages).toBeDefined();
  });

  test('parseResult 對 GRADE stage 預設回傳 pass（grader.js 刪除不影響結果解析）', () => {
    const parseResult = require(join(SCRIPTS_LIB, 'parse-result'));
    // GRADE 不是特殊處理的 stage，走預設路徑 → pass
    const result = parseResult('Grading complete. Score: 92/100', 'GRADE');
    expect(result).toEqual({ verdict: 'pass' });
  });
});

// ════════════════════════════════════════════════════════
// Scenario 3：測試套件完整性不受影響
// ════════════════════════════════════════════════════════

describe('Feature 1：測試套件完整性不受影響', () => {
  test('grader agent 在 agents 目錄仍存在（.md 設定檔）', () => {
    const agentPath = join(PLUGIN_ROOT, 'agents', 'grader.md');
    expect(existsSync(agentPath)).toBe(true);
  });

  test('刪除 grader.js 後核心函式庫清單中不含 grader.js', () => {
    const { readdirSync } = require('fs');
    const files = readdirSync(SCRIPTS_LIB);
    expect(files).not.toContain('grader.js');
  });
});
