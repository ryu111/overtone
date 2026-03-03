'use strict';
/**
 * state-helpers.test.js
 * BDD spec: specs/features/in-progress/core-refactor-iter1/bdd-iter2.md
 *
 * Feature F2: findActualStageKey（6 個 scenario）
 * Feature F3: checkParallelConvergence（6 個 scenario）
 * Feature F4: getNextStageHint（7 個 scenario）
 * Feature F5 部分: 介面相容性驗證（簽名一致、parallelGroups 防禦）
 */

const { describe, it, expect } = require('bun:test');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');

const { findActualStageKey, checkParallelConvergence, getNextStageHint } = require(join(SCRIPTS_LIB, 'state'));

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

const qualityGroups = { quality: ['REVIEW', 'TEST'] };
const emptyGroups = {};

// ── Feature F2: findActualStageKey ──

describe('findActualStageKey — 正常路徑', () => {
  it('找到完全匹配且 status 為 active 的 key', () => {
    // GIVEN currentState.stages 包含 { 'TEST': { status: 'active' }, 'TEST:2': { status: 'pending' } }
    // AND baseStage 為 'TEST'
    // WHEN 呼叫 findActualStageKey(currentState, 'TEST')
    // THEN 回傳 'TEST'
    const state = {
      stages: {
        'TEST':   { status: 'active' },
        'TEST:2': { status: 'pending' },
      },
    };
    expect(findActualStageKey(state, 'TEST')).toBe('TEST');
  });

  it('完全匹配已 completed，帶編號且 active 的 key 優先', () => {
    // GIVEN currentState.stages 包含 { 'TEST': { status: 'completed' }, 'TEST:2': { status: 'active' } }
    // WHEN 呼叫 findActualStageKey(currentState, 'TEST')
    // THEN 回傳 'TEST:2'
    const state = {
      stages: {
        'TEST':   { status: 'completed' },
        'TEST:2': { status: 'active' },
      },
    };
    expect(findActualStageKey(state, 'TEST')).toBe('TEST:2');
  });

  it('無 active 時找 pending 作為最後 fallback', () => {
    // GIVEN currentState.stages 包含 { 'TEST': { status: 'completed' }, 'TEST:2': { status: 'pending' } }
    // WHEN 呼叫 findActualStageKey(currentState, 'TEST')
    // THEN 回傳 'TEST:2'
    const state = {
      stages: {
        'TEST':   { status: 'completed' },
        'TEST:2': { status: 'pending' },
      },
    };
    expect(findActualStageKey(state, 'TEST')).toBe('TEST:2');
  });
});

describe('findActualStageKey — 邊界條件與錯誤處理', () => {
  it('baseStage 完全不存在於 stages 時回傳 null', () => {
    // GIVEN currentState.stages 包含 { 'DEV': { status: 'completed' } }
    // AND baseStage 為 'TEST'
    // WHEN 呼叫 findActualStageKey(currentState, 'TEST')
    // THEN 回傳 null
    const state = {
      stages: { 'DEV': { status: 'completed' } },
    };
    expect(findActualStageKey(state, 'TEST')).toBeNull();
  });

  it('所有相關 stage 均為 completed（pass）時回傳 null', () => {
    // GIVEN 所有相關 stage 均已 completed 且 result 為 pass
    // WHEN 呼叫 findActualStageKey
    // THEN 回傳 null（pass 的 stage 不可重做）
    const state = {
      stages: {
        'TEST':   { status: 'completed', result: 'pass' },
        'TEST:2': { status: 'completed', result: 'pass' },
      },
    };
    expect(findActualStageKey(state, 'TEST')).toBeNull();
  });

  it('stages 為空物件時回傳 null 且不拋出例外', () => {
    // GIVEN currentState.stages 為 {}
    // WHEN 呼叫 findActualStageKey(currentState, 'TEST')
    // THEN 回傳 null AND 不拋出例外
    const state = { stages: {} };
    expect(() => findActualStageKey(state, 'TEST')).not.toThrow();
    expect(findActualStageKey(state, 'TEST')).toBeNull();
  });
});

describe('findActualStageKey — retry 場景（completed + fail/reject）', () => {
  it('completed + fail 的 stage 可被找到（retry 安全網）', () => {
    // GIVEN REVIEW stage 已完成但結果為 fail
    // WHEN 呼叫 findActualStageKey(state, 'REVIEW')
    // THEN 回傳 'REVIEW'（允許 retry 覆寫結果）
    const state = {
      stages: {
        'REVIEW': { status: 'completed', result: 'fail' },
      },
    };
    expect(findActualStageKey(state, 'REVIEW')).toBe('REVIEW');
  });

  it('completed + reject 的 stage 可被找到（retry 安全網）', () => {
    // GIVEN REVIEW stage 已完成但結果為 reject
    // WHEN 呼叫 findActualStageKey(state, 'REVIEW')
    // THEN 回傳 'REVIEW'
    const state = {
      stages: {
        'REVIEW': { status: 'completed', result: 'reject' },
      },
    };
    expect(findActualStageKey(state, 'REVIEW')).toBe('REVIEW');
  });

  it('帶編號的 completed + fail stage 可被找到', () => {
    // GIVEN TEST:2 已完成但結果為 fail
    // WHEN 呼叫 findActualStageKey(state, 'TEST')
    // THEN 回傳 'TEST:2'
    const state = {
      stages: {
        'TEST':   { status: 'completed', result: 'pass' },
        'TEST:2': { status: 'completed', result: 'fail' },
      },
    };
    expect(findActualStageKey(state, 'TEST')).toBe('TEST:2');
  });

  it('active/pending 優先於 completed + fail（正常流程優先）', () => {
    // GIVEN TEST 已 fail，但 TEST:2 是 pending
    // WHEN 呼叫 findActualStageKey(state, 'TEST')
    // THEN 回傳 'TEST:2'（pending 優先於 retry candidate）
    const state = {
      stages: {
        'TEST':   { status: 'completed', result: 'fail' },
        'TEST:2': { status: 'pending' },
      },
    };
    expect(findActualStageKey(state, 'TEST')).toBe('TEST:2');
  });

  it('completed + pass 的 stage 不可被 retry 找到', () => {
    // GIVEN REVIEW 已完成且 result 為 pass
    // WHEN 呼叫 findActualStageKey(state, 'REVIEW')
    // THEN 回傳 null（pass 不是 retry candidate）
    const state = {
      stages: {
        'REVIEW': { status: 'completed', result: 'pass' },
      },
    };
    expect(findActualStageKey(state, 'REVIEW')).toBeNull();
  });
});

// ── Feature F3: checkParallelConvergence ──

describe('checkParallelConvergence — 正常路徑', () => {
  it('群組中全部成員均已 completed 時回傳群組名', () => {
    // GIVEN REVIEW + TEST 均 completed，RETRO 為 pending
    // AND parallelGroups 為 { quality: ['REVIEW', 'TEST'] }
    // WHEN 呼叫 checkParallelConvergence
    // THEN 回傳 { group: 'quality' }
    const state = {
      stages: {
        'REVIEW': { status: 'completed' },
        'TEST':   { status: 'completed' },
        'RETRO':  { status: 'pending' },
      },
    };
    expect(checkParallelConvergence(state, qualityGroups)).toEqual({ group: 'quality' });
  });

  it('帶編號的 stage（TEST:2）也計入收斂判斷', () => {
    // GIVEN REVIEW 和 TEST:2 均 completed
    // WHEN 呼叫 checkParallelConvergence（parallelGroups: quality = ['REVIEW', 'TEST']）
    // THEN 回傳 { group: 'quality' }
    const state = {
      stages: {
        'REVIEW': { status: 'completed' },
        'TEST:2': { status: 'completed' },
      },
    };
    expect(checkParallelConvergence(state, qualityGroups)).toEqual({ group: 'quality' });
  });

  it('群組有成員未完成（active）時回傳 null', () => {
    // GIVEN REVIEW completed，TEST active
    // WHEN 呼叫 checkParallelConvergence
    // THEN 回傳 null
    const state = {
      stages: {
        'REVIEW': { status: 'completed' },
        'TEST':   { status: 'active' },
      },
    };
    expect(checkParallelConvergence(state, qualityGroups)).toBeNull();
  });
});

describe('checkParallelConvergence — 邊界條件與錯誤處理', () => {
  it('相關 stage 不足 2 個時跳過該群組，回傳 null', () => {
    // GIVEN 只有 REVIEW completed，TEST 不存在於 stages
    // AND parallelGroups 為 { quality: ['REVIEW', 'TEST'] }
    // WHEN 呼叫 checkParallelConvergence
    // THEN 回傳 null（relevantKeys.length < 2）
    const state = {
      stages: { 'REVIEW': { status: 'completed' } },
    };
    expect(checkParallelConvergence(state, qualityGroups)).toBeNull();
  });

  it('parallelGroups 為空物件時不觸發任何群組，回傳 null', () => {
    // GIVEN REVIEW + TEST 均 completed
    // AND parallelGroups 為 {}
    // WHEN 呼叫 checkParallelConvergence(state, {})
    // THEN 回傳 null
    const state = {
      stages: {
        'REVIEW': { status: 'completed' },
        'TEST':   { status: 'completed' },
      },
    };
    expect(checkParallelConvergence(state, emptyGroups)).toBeNull();
  });

  it('stages 中無任何群組成員時回傳 null 且不拋出例外', () => {
    // GIVEN stages 只有 DEV，parallelGroups 為 quality: ['REVIEW', 'TEST']
    // WHEN 呼叫 checkParallelConvergence
    // THEN 回傳 null AND 不拋出例外
    const state = {
      stages: { 'DEV': { status: 'completed' } },
    };
    expect(() => checkParallelConvergence(state, qualityGroups)).not.toThrow();
    expect(checkParallelConvergence(state, qualityGroups)).toBeNull();
  });
});

// ── Feature F4: getNextStageHint ──

describe('getNextStageHint — 正常路徑', () => {
  it('有下一個 pending stage 且無 active agent 時提示單步委派', () => {
    // GIVEN currentStage 為 'DOCS'，activeAgents 為空，stages 的 DOCS 為 pending
    // WHEN 呼叫 getNextStageHint(state, { stages: registryStages, parallelGroups: {} })
    // THEN 回傳 '委派 📝 doc-updater（文件）' 格式的字串
    const state = {
      currentStage: 'DOCS',
      activeAgents: {},
      stages: {
        'DEV':  { status: 'completed' },
        'DOCS': { status: 'pending' },
      },
    };
    const hint = getNextStageHint(state, { stages: registryStages, parallelGroups: emptyGroups });
    expect(hint).not.toBeNull();
    expect(hint).toContain('委派');
    expect(hint).toContain('📝');
    expect(hint).toContain('doc-updater');
    expect(hint).toContain('文件');
  });

  it('currentStage 屬於並行群組且有多個連續 pending 成員時提示並行委派', () => {
    // GIVEN currentStage 為 'REVIEW'，REVIEW 和 TEST:2 均 pending
    // AND parallelGroups 包含 quality: ['REVIEW', 'TEST']
    // WHEN 呼叫 getNextStageHint
    // THEN 回傳包含 '並行委派' 且含 REVIEW + TEST emoji/label 的字串
    const state = {
      currentStage: 'REVIEW',
      activeAgents: {},
      stages: {
        'DEV':    { status: 'completed' },
        'REVIEW': { status: 'pending' },
        'TEST:2': { status: 'pending' },
        'RETRO':  { status: 'pending' },
      },
    };
    const hint = getNextStageHint(state, { stages: registryStages, parallelGroups: qualityGroups });
    expect(hint).not.toBeNull();
    expect(hint).toContain('並行委派');
    expect(hint).toContain('🔍');
    expect(hint).toContain('🧪');
  });

  it('仍有 active agent 時提示等待並行完成', () => {
    // GIVEN currentStage 為 'TEST:2'，activeAgents 包含 reviewer
    // WHEN 呼叫 getNextStageHint
    // THEN 回傳 '等待並行 agent 完成：reviewer' 格式的字串
    const state = {
      currentStage: 'TEST:2',
      activeAgents: { reviewer: { stage: 'REVIEW' } },
      stages: {
        'REVIEW': { status: 'active' },
        'TEST:2': { status: 'active' },
      },
    };
    const hint = getNextStageHint(state, { stages: registryStages, parallelGroups: qualityGroups });
    expect(hint).not.toBeNull();
    expect(hint).toContain('等待並行 agent 完成');
    expect(hint).toContain('reviewer');
  });

  it('所有 stage 均已 completed 時回傳 null', () => {
    // GIVEN 所有 stages 均 completed
    // WHEN 呼叫 getNextStageHint
    // THEN 回傳 null
    const state = {
      currentStage: 'DOCS',
      activeAgents: {},
      stages: {
        'DEV':  { status: 'completed' },
        'DOCS': { status: 'completed' },
      },
    };
    expect(getNextStageHint(state, { stages: registryStages, parallelGroups: emptyGroups })).toBeNull();
  });
});

describe('getNextStageHint — 邊界條件', () => {
  it('currentStage 為 null 時立即回傳 null', () => {
    // GIVEN currentStage 為 null
    // WHEN 呼叫 getNextStageHint
    // THEN 回傳 null
    const state = {
      currentStage: null,
      activeAgents: {},
      stages: {},
    };
    expect(getNextStageHint(state, { stages: registryStages, parallelGroups: emptyGroups })).toBeNull();
  });

  it('currentStage 的 base 不在 registry stages 時回傳通用提示', () => {
    // GIVEN currentStage 為 'UNKNOWN-STAGE'
    // AND stages 包含 'UNKNOWN-STAGE': pending
    // WHEN 呼叫 getNextStageHint
    // THEN 回傳 '執行 UNKNOWN-STAGE' 格式的字串
    const state = {
      currentStage: 'UNKNOWN-STAGE',
      activeAgents: {},
      stages: { 'UNKNOWN-STAGE': { status: 'pending' } },
    };
    const hint = getNextStageHint(state, { stages: registryStages, parallelGroups: emptyGroups });
    expect(hint).not.toBeNull();
    expect(hint).toContain('執行 UNKNOWN-STAGE');
  });
});

describe('getNextStageHint — 錯誤處理', () => {
  it('並行群組只有 1 個連續 pending 成員時退化為單步委派', () => {
    // GIVEN currentStage 為 'REVIEW'，TEST:2 已 completed（非 pending）
    // AND parallelGroups quality: ['REVIEW', 'TEST']
    // WHEN 呼叫 getNextStageHint
    // THEN 回傳單步委派格式（parallelCandidates.length 為 1，不觸發並行提示）
    const state = {
      currentStage: 'REVIEW',
      activeAgents: {},
      stages: {
        'REVIEW': { status: 'pending' },
        'TEST:2': { status: 'completed' },
      },
    };
    const hint = getNextStageHint(state, { stages: registryStages, parallelGroups: qualityGroups });
    expect(hint).not.toBeNull();
    expect(hint).not.toContain('並行委派');
    expect(hint).toContain('委派');
    expect(hint).toContain('🔍');
  });
});

// ── Feature F5: 介面相容性驗證（state.js 函式簽名） ──

describe('介面相容性 — state.js 函式簽名', () => {
  it('findActualStageKey 參數位置與型別與 on-stop.js 呼叫方式一致', () => {
    // GIVEN on-stop.js 原本以 findActualStageKey(currentState, stageKey) 呼叫
    // WHEN state.js export findActualStageKey(currentState, baseStage)
    // THEN 參數位置與型別完全一致，回傳符合預期
    const state = { stages: { 'DEV': { status: 'active' } } };
    // 直接以 on-stop.js 的呼叫方式驗證，不應拋出例外
    expect(() => findActualStageKey(state, 'DEV')).not.toThrow();
    expect(findActualStageKey(state, 'DEV')).toBe('DEV');
  });

  it('checkParallelConvergence 缺少 parallelGroups 時若傳 undefined 應拋出例外（呼叫端必須更新）', () => {
    // GIVEN on-stop.js 原本呼叫 checkParallelConvergence(updatedState)（不傳第二參數）
    // WHEN 提取後簽名為 checkParallelConvergence(currentState, parallelGroups)
    // THEN 若呼叫舊簽名（缺少 parallelGroups）parallelGroups 為 undefined
    //      Object.entries(undefined) 會拋錯 → 代表呼叫端必須更新為新簽名
    const state = { stages: { 'REVIEW': { status: 'completed' } } };
    expect(() => checkParallelConvergence(state, undefined)).toThrow();
  });

  it('getNextStageHint 若 options 完整傳入不拋出例外', () => {
    // GIVEN on-stop.js 呼叫端已更新為傳入 { stages, parallelGroups }
    // WHEN getNextStageHint(state, { stages, parallelGroups })
    // THEN 正常運作，不拋出例外
    const state = {
      currentStage: 'DEV',
      activeAgents: {},
      stages: { 'DEV': { status: 'pending' } },
    };
    expect(() => getNextStageHint(state, { stages: registryStages, parallelGroups: emptyGroups })).not.toThrow();
  });
});
