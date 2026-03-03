'use strict';
/**
 * stop-message-builder.test.js — buildStopMessages 單元測試
 *
 * 覆蓋 BDD spec Feature 1-5（30 scenarios 中的 Unit 部分）：
 *   Feature 1: PASS 路徑（5 scenarios）
 *   Feature 2: FAIL 路徑（3 scenarios）
 *   Feature 3: REJECT 路徑（3 scenarios）
 *   Feature 4: ISSUES 路徑（2 scenarios）
 *   Feature 5: 附加條件（3 scenarios）
 */

const { test, expect, describe } = require('bun:test');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');

const { buildStopMessages } = require(join(SCRIPTS_LIB, 'stop-message-builder'));
const { stages, retryDefaults, parallelGroups } = require(join(SCRIPTS_LIB, 'registry'));

// ── 測試用 ctx 工廠 ──

function makeCtx(overrides = {}) {
  return {
    verdict: 'pass',
    stageKey: 'DEV',
    actualStageKey: 'DEV',
    agentName: 'developer',
    sessionId: 'test-session',
    state: { failCount: 0, rejectCount: 0, retroCount: 0 },
    stages,
    retryDefaults,
    parallelGroups,
    tasksCheckboxWarning: null,
    compactSuggestion: { suggest: false },
    convergence: null,
    nextHint: '委派 tester 執行測試',
    featureName: null,
    projectRoot: '/tmp/test-project',
    specsInfo: null,
    ...overrides,
  };
}

// ════════════════════════════════════════════════════════════════
// Feature 1: PASS 路徑
// ════════════════════════════════════════════════════════════════

describe('Feature 1: PASS 路徑', () => {
  // Scenario 1-1: PASS 且有 nextHint
  test('Scenario 1-1: PASS + nextHint — 含完成符號和下一步提示', () => {
    const result = buildStopMessages(makeCtx({
      verdict: 'pass',
      nextHint: '委派 tester 執行測試',
    }));

    const joined = result.messages.join('\n');
    expect(joined).toContain('✅');
    expect(joined).toContain('委派 tester 執行測試');
    expect(joined).toContain('TaskList');
    expect(result.timelineEvents).toEqual([]);
    expect(result.stateUpdates).toEqual([]);
  });

  // Scenario 1-2: PASS 且無 nextHint — 所有階段完成
  test('Scenario 1-2: PASS + nextHint=null — 所有階段已完成', () => {
    const result = buildStopMessages(makeCtx({
      verdict: 'pass',
      nextHint: null,
    }));

    const joined = result.messages.join('\n');
    expect(joined).toContain('🎉');
    expect(joined).toContain('所有階段已完成');
    expect(joined).toContain('planner');
    expect(result.timelineEvents).toEqual([]);
  });

  // Scenario 1-3: PASS + featureName — 輸出 specs 路徑
  test('Scenario 1-3: PASS + featureName — 含 specs 路徑', () => {
    const result = buildStopMessages(makeCtx({
      verdict: 'pass',
      featureName: 'my-feature',
      nextHint: '委派 tester',
    }));

    const joined = result.messages.join('\n');
    expect(joined).toContain('specs/features/in-progress/my-feature/');
  });

  // Scenario 1-4: PASS + parallel convergence — emit parallel:converge
  test('Scenario 1-4: PASS + convergence — 含收斂提示且 emit parallel:converge', () => {
    const result = buildStopMessages(makeCtx({
      verdict: 'pass',
      convergence: { group: 'REVIEW+TEST' },
      nextHint: '委派 retro',
    }));

    const joined = result.messages.join('\n');
    expect(joined).toContain('REVIEW+TEST');
    expect(result.timelineEvents).toContainEqual({
      type: 'parallel:converge',
      data: { group: 'REVIEW+TEST' },
    });
  });

  // Scenario 1-5: PASS + compactSuggestion.suggest=true — emit session:compact-suggestion
  test('Scenario 1-5: PASS + compactSuggestion — 含 compact 建議且 emit', () => {
    const result = buildStopMessages(makeCtx({
      verdict: 'pass',
      nextHint: '委派 tester',
      compactSuggestion: { suggest: true, transcriptSize: '6.2MB', reason: '超過閾值' },
    }));

    const joined = result.messages.join('\n');
    expect(joined).toContain('6.2MB');
    expect(joined).toContain('compact');
    expect(result.timelineEvents.some(e => e.type === 'session:compact-suggestion')).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════
// Feature 2: FAIL 路徑
// ════════════════════════════════════════════════════════════════

describe('Feature 2: FAIL 路徑', () => {
  // Scenario 2-1: FAIL 且 failCount 未達上限 — emit stage:retry
  test('Scenario 2-1: FAIL + failCount=1 — 含失敗標記和 DEBUGGER 提示，emit stage:retry', () => {
    const result = buildStopMessages(makeCtx({
      verdict: 'fail',
      stageKey: 'TEST',
      actualStageKey: 'TEST',
      state: { failCount: 1, rejectCount: 0, retroCount: 0 },
    }));

    const joined = result.messages.join('\n');
    expect(joined).toContain('❌');
    expect(joined).toContain('1/3');
    expect(joined.toUpperCase()).toContain('DEBUGGER');
    expect(result.timelineEvents.some(e => e.type === 'stage:retry')).toBe(true);
    expect(result.timelineEvents.some(e => e.type === 'error:fatal')).toBe(false);
  });

  // Scenario 2-2: FAIL 且 failCount 達上限 — emit error:fatal
  test('Scenario 2-2: FAIL + failCount=3（達上限）— 含人工介入，emit error:fatal', () => {
    const result = buildStopMessages(makeCtx({
      verdict: 'fail',
      stageKey: 'TEST',
      state: { failCount: 3, rejectCount: 0, retroCount: 0 },
    }));

    const joined = result.messages.join('\n');
    expect(joined).toContain('⛔');
    expect(joined).toContain('人工介入');
    expect(result.timelineEvents.some(e => e.type === 'error:fatal')).toBe(true);
  });

  // Scenario 2-3: FAIL + rejectCount > 0 — 雙重失敗協調提示
  test('Scenario 2-3: FAIL + rejectCount=1 — 雙重失敗協調提示', () => {
    const result = buildStopMessages(makeCtx({
      verdict: 'fail',
      stageKey: 'TEST',
      state: { failCount: 1, rejectCount: 1, retroCount: 0 },
    }));

    const joined = result.messages.join('\n');
    expect(joined).toMatch(/雙重失敗|協調策略/);
    // 不包含普通的單一路徑 DEBUGGER 提示（只包含協調策略版本）
    expect(joined).toContain('協調策略');
  });
});

// ════════════════════════════════════════════════════════════════
// Feature 3: REJECT 路徑
// ════════════════════════════════════════════════════════════════

describe('Feature 3: REJECT 路徑', () => {
  // Scenario 3-1: REJECT 且 rejectCount 未達上限
  test('Scenario 3-1: REJECT + rejectCount=1 — 含審查拒絕標記和 DEVELOPER 提示', () => {
    const result = buildStopMessages(makeCtx({
      verdict: 'reject',
      stageKey: 'REVIEW',
      actualStageKey: 'REVIEW',
      state: { failCount: 0, rejectCount: 1, retroCount: 0 },
    }));

    const joined = result.messages.join('\n');
    expect(joined).toContain('🔙');
    expect(joined.toUpperCase()).toContain('DEVELOPER');
    // REJECT 不 emit stage:retry
    expect(result.timelineEvents.some(e => e.type === 'stage:retry')).toBe(false);
  });

  // Scenario 3-2: REJECT 且 rejectCount 達上限 — emit error:fatal
  test('Scenario 3-2: REJECT + rejectCount=3（達上限）— 含人工介入，emit error:fatal', () => {
    const result = buildStopMessages(makeCtx({
      verdict: 'reject',
      stageKey: 'REVIEW',
      state: { failCount: 0, rejectCount: 3, retroCount: 0 },
    }));

    const joined = result.messages.join('\n');
    expect(joined).toContain('⛔');
    expect(joined).toContain('人工介入');
    expect(result.timelineEvents.some(e => e.type === 'error:fatal')).toBe(true);
  });

  // Scenario 3-3: REJECT + failCount > 0 — 雙重失敗協調提示
  test('Scenario 3-3: REJECT + failCount=1 — 雙重失敗協調，TEST FAIL 優先', () => {
    const result = buildStopMessages(makeCtx({
      verdict: 'reject',
      stageKey: 'REVIEW',
      state: { failCount: 1, rejectCount: 1, retroCount: 0 },
    }));

    const joined = result.messages.join('\n');
    expect(joined).toMatch(/雙重失敗|協調策略/);
    expect(joined).toContain('協調策略');
  });
});

// ════════════════════════════════════════════════════════════════
// Feature 4: ISSUES 路徑
// ════════════════════════════════════════════════════════════════

describe('Feature 4: ISSUES 路徑', () => {
  // Scenario 4-1: ISSUES + retroCount 遞增
  test('Scenario 4-1: ISSUES + retroCount=0 → 含回顧完成 + 1/3 計數，stateUpdates 有 incrementRetroCount', () => {
    const result = buildStopMessages(makeCtx({
      verdict: 'issues',
      stageKey: 'RETRO',
      state: { failCount: 0, rejectCount: 0, retroCount: 0 },
    }));

    const joined = result.messages.join('\n');
    expect(joined).toContain('回顧完成');
    expect(joined).toContain('1/3');
    expect(joined).toContain('/ot:auto');
    expect(result.stateUpdates.some(u => u.type === 'incrementRetroCount')).toBe(true);
  });

  // Scenario 4-2: ISSUES + retroCount 達上限
  test('Scenario 4-2: ISSUES + retroCount=2（達上限後為 3）— 含迭代上限提示', () => {
    const result = buildStopMessages(makeCtx({
      verdict: 'issues',
      stageKey: 'RETRO',
      state: { failCount: 0, rejectCount: 0, retroCount: 2 },
    }));

    const joined = result.messages.join('\n');
    expect(joined).toContain('已達迭代上限');
    expect(joined).toContain('3/3');
    expect(joined).toContain('剩餘 stages');
  });
});

// ════════════════════════════════════════════════════════════════
// Feature 5: 附加條件場景
// ════════════════════════════════════════════════════════════════

describe('Feature 5: 附加條件', () => {
  // Scenario 5-1: tasksCheckboxWarning — 警告置頂
  test('Scenario 5-1: tasksCheckboxWarning 非空 — 警告出現在訊息最前面', () => {
    const result = buildStopMessages(makeCtx({
      verdict: 'pass',
      tasksCheckboxWarning: 'EACCES: permission denied',
    }));

    const firstMessage = result.messages[0];
    expect(firstMessage).toContain('⚠️');
    expect(firstMessage).toContain('EACCES: permission denied');
  });

  // Scenario 5-2: grader hint 不在 messages 中
  test('Scenario 5-2: PASS + nextHint — messages 不含 grader 字串', () => {
    const result = buildStopMessages(makeCtx({
      verdict: 'pass',
      nextHint: '委派 tester',
    }));

    const joined = result.messages.join('\n');
    expect(joined).not.toContain('grader');
    expect(joined).not.toContain('ot:grader');
    expect(joined).not.toContain('評估此階段輸出品質');
  });

  // Scenario 5-3: compactSuggestion.suggest=false — 無 compact 訊息
  test('Scenario 5-3: compactSuggestion.suggest=false — 無 compact 相關訊息', () => {
    const result = buildStopMessages(makeCtx({
      verdict: 'pass',
      nextHint: '委派 tester',
      compactSuggestion: { suggest: false },
    }));

    const joined = result.messages.join('\n');
    expect(joined).not.toContain('/compact');
    expect(result.timelineEvents.some(e => e.type === 'session:compact-suggestion')).toBe(false);
  });
});
