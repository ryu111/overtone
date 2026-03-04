'use strict';
/**
 * pre-task-handler.test.js
 *
 * 測試 pre-task-handler.js 匯出的純函數。
 *
 * 覆蓋範圍：
 *   - checkSkippedStages — 前置 stage 跳過偵測邏輯
 *   - handlePreTask 部分邏輯（無 session / 無 state / 無法辨識 agent）
 */

const { describe, test, expect } = require('bun:test');
const path = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');

const { checkSkippedStages, handlePreTask } = require(path.join(SCRIPTS_LIB, 'pre-task-handler'));

// ── checkSkippedStages ───────────────────────────────────────────────────

describe('checkSkippedStages', () => {
  const mockStages = {
    PLAN: { emoji: '🏗️', label: '計劃', agent: 'planner' },
    ARCH: { emoji: '📐', label: '架構', agent: 'architect' },
    DEV:  { emoji: '💻', label: '開發', agent: 'developer' },
  };

  test('所有前置 stage 已完成時回傳空陣列', () => {
    const currentState = {
      stages: {
        PLAN: { status: 'completed', result: 'pass' },
        ARCH: { status: 'completed', result: 'pass' },
        DEV:  { status: 'pending' },
      },
    };
    const result = checkSkippedStages(currentState, 'DEV', mockStages);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  test('前置 stage 為 pending 時回傳跳過清單', () => {
    const currentState = {
      stages: {
        PLAN: { status: 'pending' },
        ARCH: { status: 'pending' },
        DEV:  { status: 'pending' },
      },
    };
    const result = checkSkippedStages(currentState, 'DEV', mockStages);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    // 應包含 PLAN 和 ARCH 的描述
    expect(result.some(s => s.includes('PLAN'))).toBe(true);
    expect(result.some(s => s.includes('ARCH'))).toBe(true);
  });

  test('回傳清單包含 emoji 和 label 描述', () => {
    const currentState = {
      stages: {
        PLAN: { status: 'pending' },
        DEV:  { status: 'pending' },
      },
    };
    const result = checkSkippedStages(currentState, 'DEV', {
      PLAN: { emoji: '🏗️', label: '計劃', agent: 'planner' },
      DEV:  { emoji: '💻', label: '開發', agent: 'developer' },
    });
    expect(result.length).toBe(1);
    expect(result[0]).toContain('🏗️');
    expect(result[0]).toContain('計劃');
    expect(result[0]).toContain('PLAN');
  });

  test('targetStage 為第一個 stage 時回傳空陣列（無前置依賴）', () => {
    const currentState = {
      stages: {
        PLAN: { status: 'pending' },
        DEV:  { status: 'pending' },
      },
    };
    const result = checkSkippedStages(currentState, 'PLAN', mockStages);
    expect(result).toHaveLength(0);
  });

  test('currentState 為 null 時回傳空陣列（不拋出例外）', () => {
    const result = checkSkippedStages(null, 'DEV', mockStages);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  test('targetStage 為 null 時回傳空陣列（不拋出例外）', () => {
    const currentState = {
      stages: { PLAN: { status: 'pending' }, DEV: { status: 'pending' } },
    };
    const result = checkSkippedStages(currentState, null, mockStages);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  test('前置 stage 已 active 時不算跳過', () => {
    const currentState = {
      stages: {
        PLAN: { status: 'active' },
        DEV:  { status: 'pending' },
      },
    };
    const result = checkSkippedStages(currentState, 'DEV', {
      PLAN: { emoji: '🏗️', label: '計劃', agent: 'planner' },
      DEV:  { emoji: '💻', label: '開發', agent: 'developer' },
    });
    expect(result).toHaveLength(0);
  });

  test('前置 stage 已 completed 時不算跳過', () => {
    const currentState = {
      stages: {
        PLAN: { status: 'completed', result: 'pass' },
        DEV:  { status: 'pending' },
      },
    };
    const result = checkSkippedStages(currentState, 'DEV', {
      PLAN: { emoji: '🏗️', label: '計劃', agent: 'planner' },
      DEV:  { emoji: '💻', label: '開發', agent: 'developer' },
    });
    expect(result).toHaveLength(0);
  });

  test('stage key 含 instance suffix（如 TEST:spec）時正確比對 base', () => {
    const currentState = {
      stages: {
        'TEST:spec': { status: 'pending' },
        DEV:         { status: 'pending' },
      },
    };
    const stagesDef = {
      TEST: { emoji: '🧪', label: '測試', agent: 'tester' },
      DEV:  { emoji: '💻', label: '開發', agent: 'developer' },
    };
    const result = checkSkippedStages(currentState, 'DEV', stagesDef);
    expect(result.length).toBe(1);
    expect(result[0]).toContain('TEST');
  });

  test('currentState.stages 為空物件時回傳空陣列', () => {
    const currentState = { stages: {} };
    const result = checkSkippedStages(currentState, 'DEV', mockStages);
    expect(result).toHaveLength(0);
  });
});

// ── handlePreTask — 無 session / 無 state / 無法辨識 agent ────────────────

describe('handlePreTask — 早期返回路徑', () => {
  test('無 session 時回傳 { output: { result: \'\' } }', () => {
    const result = handlePreTask({});
    expect(result).toEqual({ output: { result: '' } });
  });

  test('sessionId 為空字串時回傳空 result', () => {
    const result = handlePreTask({ session_id: '' });
    expect(result).toEqual({ output: { result: '' } });
  });

  test('回傳物件含 output 欄位', () => {
    const result = handlePreTask({});
    expect(result).toHaveProperty('output');
    expect(typeof result.output).toBe('object');
  });

  test('回傳物件可安全序列化為 JSON', () => {
    const result = handlePreTask({});
    expect(() => JSON.stringify(result.output)).not.toThrow();
  });
});

// ── agent 辨識邏輯 ────────────────────────────────────────────────────────

describe('handlePreTask — agent 辨識', () => {
  test('未知 subagent_type 且 prompt 無法辨識時回傳空 result（不擋）', () => {
    // 沒有 sessionId 會在更早 return，所以此測試主要驗證「不拋出例外」
    const result = handlePreTask({
      tool_input: {
        subagent_type: 'unknown',
        description: 'some task',
        prompt: 'do something',
      },
    });
    // 無 sessionId → 早期 return { result: '' }
    expect(result).toEqual({ output: { result: '' } });
  });
});
