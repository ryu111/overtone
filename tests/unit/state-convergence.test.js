'use strict';
/**
 * state-convergence.test.js
 * BDD spec: specs/features/in-progress/parallel-convergence-gate/bdd.md
 *
 * Feature 1: checkSameStageConvergence（6 個 Scenario）
 * Feature 4: findActualStageKey 並行場景（3 個 Scenario）
 * Feature 5: getNextStageHint activeAgents instanceId 格式適配（3 個 Scenario）
 */

const { describe, it, expect } = require('bun:test');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');

const { checkSameStageConvergence, findActualStageKey, getNextStageHint } = require(join(SCRIPTS_LIB, 'state'));

// registry stages 子集（供 getNextStageHint 測試使用）
const registryStages = {
  PLAN:   { label: '計畫',   emoji: '📋', agent: 'planner' },
  ARCH:   { label: '架構',   emoji: '🏗️', agent: 'architect' },
  DEV:    { label: '開發',   emoji: '💻', agent: 'developer' },
  REVIEW: { label: '審查',   emoji: '🔍', agent: 'code-reviewer' },
  TEST:   { label: '測試',   emoji: '🧪', agent: 'tester' },
  RETRO:  { label: '回顧',   emoji: '🔁', agent: 'retrospective' },
  DOCS:   { label: '文件',   emoji: '📝', agent: 'doc-updater' },
};

const emptyGroups = {};

// ── Feature 1: checkSameStageConvergence ──

describe('checkSameStageConvergence', () => {
  it('Scenario 1-1: parallelTotal 未設定時視為已收斂（單 agent 向後相容）', () => {
    // GIVEN stageEntry 不含 parallelTotal 欄位
    // WHEN 呼叫 checkSameStageConvergence
    // THEN 回傳 true
    const entry = { status: 'active', parallelDone: 0 };
    expect(checkSameStageConvergence(entry)).toBe(true);
  });

  it('Scenario 1-2: parallelDone 小於 parallelTotal 時未收斂', () => {
    // GIVEN parallelTotal = 3，parallelDone = 1
    // WHEN 呼叫 checkSameStageConvergence
    // THEN 回傳 false
    const entry = { status: 'active', parallelTotal: 3, parallelDone: 1 };
    expect(checkSameStageConvergence(entry)).toBe(false);
  });

  it('Scenario 1-3: parallelDone 等於 parallelTotal 時已收斂', () => {
    // GIVEN parallelTotal = 3，parallelDone = 3
    // WHEN 呼叫 checkSameStageConvergence
    // THEN 回傳 true
    const entry = { status: 'active', parallelTotal: 3, parallelDone: 3 };
    expect(checkSameStageConvergence(entry)).toBe(true);
  });

  it('Scenario 1-4: parallelDone 大於 parallelTotal 時已收斂（防禦性）', () => {
    // GIVEN parallelTotal = 2，parallelDone = 3
    // WHEN 呼叫 checkSameStageConvergence
    // THEN 回傳 true（parallelDone >= parallelTotal 一律視為收斂）
    const entry = { status: 'active', parallelTotal: 2, parallelDone: 3 };
    expect(checkSameStageConvergence(entry)).toBe(true);
  });

  it('Scenario 1-5: stageEntry 為 null 時回傳 true 且不拋出例外', () => {
    // GIVEN stageEntry 為 null
    // THEN 回傳 true 且不拋出例外
    expect(() => checkSameStageConvergence(null)).not.toThrow();
    expect(checkSameStageConvergence(null)).toBe(true);
  });

  it('Scenario 1-6: stageEntry 為 undefined 時回傳 true 且不拋出例外', () => {
    // GIVEN stageEntry 為 undefined
    // THEN 回傳 true 且不拋出例外
    expect(() => checkSameStageConvergence(undefined)).not.toThrow();
    expect(checkSameStageConvergence(undefined)).toBe(true);
  });
});

// ── Feature 4: findActualStageKey 並行場景 ──

describe('findActualStageKey — 並行場景', () => {
  it('Scenario 4-1: stage active 且 parallelDone 小於 parallelTotal 時仍可被找到', () => {
    // GIVEN stages.DEV 為 { status: active, parallelTotal: 3, parallelDone: 1 }
    // WHEN 呼叫 findActualStageKey(state, DEV)
    // THEN 回傳 DEV（active stage 在並行未收斂時仍可被找到）
    const state = {
      stages: {
        DEV: { status: 'active', parallelTotal: 3, parallelDone: 1 },
      },
    };
    expect(findActualStageKey(state, 'DEV')).toBe('DEV');
  });

  it('Scenario 4-2: stage active 且 parallelDone 等於 parallelTotal 時仍可被找到', () => {
    // GIVEN stages.DEV 為 { status: active, parallelTotal: 3, parallelDone: 3 }
    // WHEN 呼叫 findActualStageKey(state, DEV)
    // THEN 回傳 DEV（active stage 不因 parallelDone 數值而失效）
    const state = {
      stages: {
        DEV: { status: 'active', parallelTotal: 3, parallelDone: 3 },
      },
    };
    expect(findActualStageKey(state, 'DEV')).toBe('DEV');
  });

  it('Scenario 4-3: stage completed + fail（並行場景）時仍可被找到（後續 instance cleanup 路徑）', () => {
    // GIVEN stages.DEV 為 { status: completed, result: fail, parallelTotal: 3, parallelDone: 1 }
    // WHEN 呼叫 findActualStageKey(state, DEV)
    // THEN 回傳 DEV（後續到達的 instance 的 on-stop 仍能找到此 stage 做 cleanup）
    const state = {
      stages: {
        DEV: { status: 'completed', result: 'fail', parallelTotal: 3, parallelDone: 1 },
      },
    };
    expect(findActualStageKey(state, 'DEV')).toBe('DEV');
  });
});

// ── Feature 5: getNextStageHint activeAgents instanceId 格式適配 ──

describe('getNextStageHint — instanceId 格式適配', () => {
  it('Scenario 5-1: activeAgents 使用 instanceId 為 key 時 hint 顯示 agentName 而非 instanceId', () => {
    // GIVEN activeAgents 為 { developer:m3xap2k-f7r9qz: { agentName: developer, ... } }
    // WHEN 呼叫 getNextStageHint
    // THEN hint 含 developer，不含完整的 instanceId
    const state = {
      currentStage: 'DEV',
      activeAgents: {
        'developer:m3xap2k-f7r9qz': { agentName: 'developer', stage: 'DEV', startedAt: '2026-01-01T00:00:00Z' },
      },
      stages: {
        DEV: { status: 'active' },
      },
    };
    const hint = getNextStageHint(state, { stages: registryStages, parallelGroups: emptyGroups });
    expect(hint).not.toBeNull();
    expect(hint).toContain('developer');
    expect(hint).not.toContain('developer:m3xap2k-f7r9qz');
  });

  it('Scenario 5-2: 多個相同 agentName 的 instanceId 時 hint 只顯示一次 agentName（去重）', () => {
    // GIVEN activeAgents 包含 developer:inst1、developer:inst2、developer:inst3
    // WHEN 呼叫 getNextStageHint
    // THEN hint 只顯示一次 developer（去重）
    const state = {
      currentStage: 'DEV',
      activeAgents: {
        'developer:aaa001-xxxx': { agentName: 'developer', stage: 'DEV', startedAt: '2026-01-01T00:00:00Z' },
        'developer:bbb002-yyyy': { agentName: 'developer', stage: 'DEV', startedAt: '2026-01-01T00:00:01Z' },
        'developer:ccc003-zzzz': { agentName: 'developer', stage: 'DEV', startedAt: '2026-01-01T00:00:02Z' },
      },
      stages: {
        DEV: { status: 'active', parallelTotal: 3, parallelDone: 0 },
      },
    };
    const hint = getNextStageHint(state, { stages: registryStages, parallelGroups: emptyGroups });
    expect(hint).not.toBeNull();
    expect(hint).toContain('developer');
    // 只出現一次（去重後）：計算出現次數
    const count = (hint.match(/developer/g) || []).length;
    expect(count).toBe(1);
  });

  it('Scenario 5-3: 無 agentName 欄位時 fallback 到 instanceId 冒號前半段', () => {
    // GIVEN activeAgents 中有 developer:m3xap2k-f7r9qz，entry 不含 agentName 欄位
    // WHEN 呼叫 getNextStageHint
    // THEN hint 包含 developer（從 key.split(":")[0] 取得）
    const state = {
      currentStage: 'DEV',
      activeAgents: {
        'developer:m3xap2k-f7r9qz': { stage: 'DEV', startedAt: '2026-01-01T00:00:00Z' },
      },
      stages: {
        DEV: { status: 'active' },
      },
    };
    const hint = getNextStageHint(state, { stages: registryStages, parallelGroups: emptyGroups });
    expect(hint).not.toBeNull();
    expect(hint).toContain('developer');
    expect(hint).not.toContain('developer:m3xap2k-f7r9qz');
  });
});
