'use strict';
const { test, expect, describe } = require('bun:test');
const {
  stages,
  workflows,
  timelineEvents,
  effortLevels,
} = require('../../plugins/overtone/scripts/lib/registry');

describe('registry.js 資料完整性', () => {
  describe('所有 16 個 agent 名稱符合 kebab-case 格式', () => {
    test('stages 共有 16 個項目', () => {
      expect(Object.keys(stages).length).toBe(16);
    });

    test('每個 agent 名稱只包含小寫英文字母、數字與連字符', () => {
      const kebabPattern = /^[a-z0-9-]+$/;
      for (const [stageKey, stageDef] of Object.entries(stages)) {
        expect(stageDef.agent).toMatch(kebabPattern);
      }
    });

    test('無任何 agent 名稱包含底線、空格或大寫字母', () => {
      for (const [stageKey, stageDef] of Object.entries(stages)) {
        expect(stageDef.agent).not.toMatch(/[_\sA-Z]/);
      }
    });
  });

  describe('所有 stage 名稱存在於至少一個 workflow 的 stages 陣列中', () => {
    test('每個 stage key 都能在至少一個 workflow stages 中找到', () => {
      const allWorkflowStages = new Set(
        Object.values(workflows).flatMap(wf => wf.stages)
      );

      for (const stageKey of Object.keys(stages)) {
        expect(allWorkflowStages.has(stageKey)).toBe(true);
      }
    });
  });

  describe('quick workflow 包含正確的 stages 陣列', () => {
    test('quick workflow stages 長度為 5', () => {
      expect(workflows['quick'].stages.length).toBe(5);
    });

    test('quick workflow stages 依序包含 DEV、REVIEW、TEST、RETRO、DOCS', () => {
      expect(workflows['quick'].stages).toEqual(['DEV', 'REVIEW', 'TEST', 'RETRO', 'DOCS']);
    });
  });

  describe('timelineEvents 物件非空且結構合理', () => {
    test('timelineEvents 的 key 數量大於 0', () => {
      expect(Object.keys(timelineEvents).length).toBeGreaterThan(0);
    });

    test('每個事件 key 都是非空字串', () => {
      for (const key of Object.keys(timelineEvents)) {
        expect(typeof key).toBe('string');
        expect(key.length).toBeGreaterThan(0);
      }
    });
  });

  describe('effortLevels — model 對應 effort level 映射', () => {
    test('effortLevels 存在且非空', () => {
      expect(effortLevels).toBeDefined();
      expect(typeof effortLevels).toBe('object');
      expect(Object.keys(effortLevels).length).toBeGreaterThan(0);
    });

    test('opus 對應 high', () => {
      expect(effortLevels['opus']).toBe('high');
    });

    test('sonnet 對應 medium', () => {
      expect(effortLevels['sonnet']).toBe('medium');
    });

    test('haiku 對應 low', () => {
      expect(effortLevels['haiku']).toBe('low');
    });

    test('所有 effort level 值都是合法的平台值', () => {
      const validLevels = new Set(['low', 'medium', 'high', 'max']);
      for (const [model, level] of Object.entries(effortLevels)) {
        expect(validLevels.has(level)).toBe(true);
      }
    });
  });
});
