'use strict';
const { test, expect, describe } = require('bun:test');
const {
  stages,
  workflows,
  timelineEvents,
  effortLevels,
  agentMemory,
  agentModels,
  hookEvents,
  journalDefaults,
  parallelGroupDefs,
} = require('../../plugins/overtone/scripts/lib/registry');

describe('registry.js 資料完整性', () => {
  describe('所有 16 個 agent 名稱符合 kebab-case 格式', () => {
    test('stages 數量至少為 16 個項目', () => {
      expect(Object.keys(stages).length).toBeGreaterThanOrEqual(16);
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
    test('quick workflow stages 長度為 4', () => {
      expect(workflows['quick'].stages.length).toBe(4);
    });

    test('quick workflow stages 依序包含 DEV、REVIEW、RETRO、DOCS（不含 TEST）', () => {
      expect(workflows['quick'].stages).toEqual(['DEV', 'REVIEW', 'RETRO', 'DOCS']);
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

  describe('hookEvents — 合法 hook event 名稱清單', () => {
    test('hookEvents 存在且為陣列', () => {
      expect(Array.isArray(hookEvents)).toBe(true);
      expect(hookEvents.length).toBeGreaterThan(0);
    });

    test('hookEvents 包含 TaskCompleted', () => {
      expect(hookEvents).toContain('TaskCompleted');
    });

    test('hookEvents 包含既有的 9 個事件', () => {
      const expected = [
        'SessionStart', 'SessionEnd',
        'PreCompact',
        'UserPromptSubmit',
        'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
        'SubagentStop',
        'Stop',
      ];
      for (const event of expected) {
        expect(hookEvents).toContain(event);
      }
    });

    test('hookEvents 包含 S12 新增的 Notification 事件', () => {
      expect(hookEvents).toContain('Notification');
    });

    test('hookEvents 數量至少為 11 個事件', () => {
      expect(hookEvents.length).toBeGreaterThanOrEqual(11);
    });
  });

  describe('agentMemory', () => {
    test('包含有 memory 設定的 agents（opus 決策型）', () => {
      expect(agentMemory['code-reviewer']).toBe('local');
      expect(agentMemory['security-reviewer']).toBe('local');
      expect(agentMemory['product-manager']).toBe('local');
      // Phase 2：5 個執行型 agent 加入 memory: local（個體學習升級）
      expect(agentMemory['developer']).toBe('local');
      expect(agentMemory['tester']).toBe('local');
      expect(agentMemory['debugger']).toBe('local');
      expect(agentMemory['planner']).toBe('local');
      expect(agentMemory['architect']).toBe('local');
      // retrospective 已在品質盤點迭代 3 加入 memory
      expect(agentMemory['retrospective']).toBe('local');
    });

    test('只包含 agentModels 中存在的 agent', () => {
      for (const name of Object.keys(agentMemory)) {
        expect(agentModels[name]).toBeDefined();
      }
    });

    test('值必須是合法 memory scope', () => {
      const validScopes = ['user', 'project', 'local'];
      for (const scope of Object.values(agentMemory)) {
        expect(validScopes).toContain(scope);
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

    test('opusplan 對應 high', () => {
      expect(effortLevels['opusplan']).toBe('high');
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

  // Feature A BDD: parallelGroupDefs + postdev 群組（retro-docs-parallel）
  describe('parallelGroupDefs — postdev 群組（BDD Feature A）', () => {
    // Scenario A-1: parallelGroupDefs 包含 postdev 群組
    test('Scenario A-1: parallelGroupDefs 包含 postdev key', () => {
      expect(parallelGroupDefs).toBeDefined();
      expect(typeof parallelGroupDefs).toBe('object');
      expect(Object.keys(parallelGroupDefs)).toContain('postdev');
    });

    // Scenario A-2: 含 RETRO + DOCS 的 6 個 workflow 的 parallelGroups 包含 postdev
    test('Scenario A-2: quick/standard/full/secure/product/product-full 各 workflow 的 parallelGroups 包含 postdev', () => {
      const targetWorkflows = ['quick', 'standard', 'full', 'secure', 'product', 'product-full'];
      for (const wfName of targetWorkflows) {
        expect(workflows[wfName]).toBeDefined();
        expect(Array.isArray(workflows[wfName].parallelGroups)).toBe(true);
        expect(workflows[wfName].parallelGroups).toContain('postdev');
      }
    });

    // Scenario A-3: postdev 群組成員是 RETRO 和 DOCS
    test('Scenario A-3: parallelGroupDefs[postdev] 包含 RETRO 和 DOCS，成員數量為 2', () => {
      const postdev = parallelGroupDefs['postdev'];
      expect(Array.isArray(postdev)).toBe(true);
      expect(postdev).toContain('RETRO');
      expect(postdev).toContain('DOCS');
      expect(postdev.length).toBe(2);
    });
  });

  // Feature 3 BDD: journalDefaults 常數
  describe('journalDefaults — BDD Feature 3', () => {
    // Scenario 3-1
    test('Scenario 3-1: journalDefaults.maxPromptLength 等於 500', () => {
      expect(journalDefaults.maxPromptLength).toBe(500);
    });

    test('Scenario 3-1: journalDefaults.loadTopN 等於 10', () => {
      expect(journalDefaults.loadTopN).toBe(10);
    });

    test('Scenario 3-1: journalDefaults.minResultForGlobal 等於 "pass"', () => {
      expect(journalDefaults.minResultForGlobal).toBe('pass');
    });

    // Scenario 3-2
    test('Scenario 3-2: journalDefaults 是 module.exports 的一部分（可直接解構取得）', () => {
      expect(journalDefaults).toBeDefined();
      expect(typeof journalDefaults).toBe('object');
    });
  });
});
