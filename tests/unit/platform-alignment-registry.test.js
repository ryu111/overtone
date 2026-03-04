'use strict';
/**
 * platform-alignment-registry.test.js
 *
 * Feature 1h: registry.js tool:failure 事件
 * BDD 規格：specs/features/in-progress/platform-alignment-phase1/bdd.md
 *
 * 對應 Scenario 1h-1、1h-2、1h-3
 * 以及 Scenario 1e-7（tool:failure 是已定義的 timeline 事件）
 */

const { describe, test, expect } = require('bun:test');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');

const { timelineEvents } = require(join(SCRIPTS_LIB, 'registry'));

// ────────────────────────────────────────────────────────────────────────────
// Feature 1h: registry.js tool:failure 事件
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 1h: registry.js tool:failure 事件', () => {
  // Scenario 1h-1: tool:failure 事件已定義在 timelineEvents
  describe('Scenario 1h-1: tool:failure 事件定義存在', () => {
    test('timelineEvents["tool:failure"] 回傳物件，不回傳 undefined', () => {
      const entry = timelineEvents['tool:failure'];
      expect(entry).toBeDefined();
      expect(entry).not.toBeNull();
    });

    test('tool:failure 的 label 為 "工具失敗"', () => {
      expect(timelineEvents['tool:failure'].label).toBe('工具失敗');
    });

    test('tool:failure 的 category 為 "tool"', () => {
      expect(timelineEvents['tool:failure'].category).toBe('tool');
    });
  });

  // Scenario 1h-2: timelineEvents 總數檢查（至少包含已知的核心事件）
  describe('Scenario 1h-2: timelineEvents 總數至少為 27 且包含代表性事件', () => {
    test('Object.keys(timelineEvents).length >= 27', () => {
      expect(Object.keys(timelineEvents).length).toBeGreaterThanOrEqual(27);
    });
    test('包含代表性事件 stage:start 和 workflow:start', () => {
      expect(timelineEvents['stage:start']).toBeDefined();
      expect(timelineEvents['workflow:start']).toBeDefined();
    });
  });

  // Scenario 1h-3: tool:failure 的 category 為 tool（新分類）
  describe('Scenario 1h-3: tool:failure category 為 tool', () => {
    test('category 欄位值為字串 "tool"', () => {
      const entry = timelineEvents['tool:failure'];
      expect(typeof entry.category).toBe('string');
      expect(entry.category).toBe('tool');
    });
  });

});
