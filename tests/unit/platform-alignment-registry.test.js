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

  // Scenario 1h-2: 新增 tool:failure 後 timelineEvents 共有 23 個事件
  describe('Scenario 1h-2: timelineEvents 總數為 23', () => {
    test('Object.keys(timelineEvents).length === 23', () => {
      expect(Object.keys(timelineEvents).length).toBe(23);
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

  // Scenario 1e-7（對應 1h-1）: tool:failure 不拋出未知事件類型錯誤
  describe('Scenario 1e-7: tool:failure 是合法的 timeline 事件', () => {
    test('tool:failure 鍵存在且結構完整', () => {
      const entry = timelineEvents['tool:failure'];
      expect(entry).toMatchObject({
        label: expect.any(String),
        category: expect.any(String),
      });
    });

    test('tool:failure label 非空字串', () => {
      expect(timelineEvents['tool:failure'].label).not.toBe('');
    });
  });
});
