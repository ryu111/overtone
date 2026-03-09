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
 *   Feature 6: Grader 強制化
 *   Feature 7: postdev 收斂提示（BDD Feature C，5 scenarios）
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
    expect(joined).toContain('/auto');
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

// ════════════════════════════════════════════════════════════════
// Feature 6: Grader 強制化（BDD Feature 3）
// ════════════════════════════════════════════════════════════════

describe('Feature 6: Grader 強制化 — workflowType 切換用詞', () => {
  // 建立含 scoringConfig 的 ctx，DEV stage 是 gradedStage
  function makeGraderCtx(overrides = {}) {
    return makeCtx({
      stageKey: 'DEV',
      scoringConfig: { gradedStages: ['DEV', 'REVIEW', 'TEST'], lowScoreThreshold: 3.0 },
      ...overrides,
    });
  }

  // Scenario 3-1: standard workflow — MUST 強制用詞
  test('Scenario 3-1: workflowType=standard + DEV PASS — 含 MUST 強制用詞', () => {
    const result = buildStopMessages(makeGraderCtx({
      workflowType: 'standard',
      verdict: 'pass',
    }));

    const joined = result.messages.join('\n');
    expect(joined).toContain('📋 MUST 委派 grader 評分');
    expect(joined).toContain('STAGE=DEV');
    expect(joined).not.toContain('🎯 建議委派 grader 評分');
  });

  // Scenario 3-2: full workflow — MUST 強制用詞
  test('Scenario 3-2: workflowType=full + gradedStage PASS — 含 MUST 強制用詞', () => {
    const result = buildStopMessages(makeGraderCtx({
      workflowType: 'full',
      verdict: 'pass',
    }));

    const joined = result.messages.join('\n');
    expect(joined).toContain('📋 MUST 委派 grader 評分');
  });

  // Scenario 3-3: secure workflow — MUST 強制用詞
  test('Scenario 3-3: workflowType=secure + gradedStage PASS — 含 MUST 強制用詞', () => {
    const result = buildStopMessages(makeGraderCtx({
      workflowType: 'secure',
      verdict: 'pass',
    }));

    const joined = result.messages.join('\n');
    expect(joined).toContain('📋 MUST 委派 grader 評分');
  });

  // Scenario 3-4: product workflow — MUST 強制用詞
  test('Scenario 3-4: workflowType=product + gradedStage PASS — 含 MUST 強制用詞', () => {
    const result = buildStopMessages(makeGraderCtx({
      workflowType: 'product',
      verdict: 'pass',
    }));

    const joined = result.messages.join('\n');
    expect(joined).toContain('📋 MUST 委派 grader 評分');
  });

  // Scenario 3-5: product-full workflow — MUST 強制用詞
  test('Scenario 3-5: workflowType=product-full + gradedStage PASS — 含 MUST 強制用詞', () => {
    const result = buildStopMessages(makeGraderCtx({
      workflowType: 'product-full',
      verdict: 'pass',
    }));

    const joined = result.messages.join('\n');
    expect(joined).toContain('📋 MUST 委派 grader 評分');
  });

  // Scenario 3-6: quick workflow — 建議用詞
  test('Scenario 3-6: workflowType=quick + gradedStage PASS — 含建議用詞，不含 MUST', () => {
    const result = buildStopMessages(makeGraderCtx({
      workflowType: 'quick',
      verdict: 'pass',
    }));

    const joined = result.messages.join('\n');
    expect(joined).toContain('🎯 建議委派 grader 評分');
    expect(joined).not.toContain('MUST 委派 grader');
  });

  // Scenario 3-7: single workflow — 建議用詞
  test('Scenario 3-7: workflowType=single + gradedStage PASS — 含建議用詞', () => {
    const result = buildStopMessages(makeGraderCtx({
      workflowType: 'single',
      verdict: 'pass',
    }));

    const joined = result.messages.join('\n');
    expect(joined).toContain('🎯 建議委派 grader 評分');
  });

  // Scenario 3-8: workflowType=null — 建議用詞（向後相容）
  test('Scenario 3-8: workflowType=null — 含建議用詞，不拋出例外', () => {
    const result = buildStopMessages(makeGraderCtx({
      workflowType: null,
      verdict: 'pass',
    }));

    const joined = result.messages.join('\n');
    expect(joined).toContain('🎯 建議委派 grader 評分');
    expect(result.messages).toBeDefined();
  });

  // Scenario 3-9: 不在 gradedStages 中的 stage — 不產生 grader 訊息
  test('Scenario 3-9: workflowType=standard + DOCS stage（非 gradedStage）— 不含 grader 訊息', () => {
    const result = buildStopMessages(makeCtx({
      stageKey: 'DOCS',
      workflowType: 'standard',
      verdict: 'pass',
      scoringConfig: { gradedStages: ['DEV', 'REVIEW', 'TEST'], lowScoreThreshold: 3.0 },
    }));

    const joined = result.messages.join('\n');
    expect(joined).not.toContain('grader');
    expect(joined).not.toContain('MUST 委派');
    expect(joined).not.toContain('建議委派 grader');
  });

  // Scenario 3-10: FAIL verdict — 不產生 grader 訊息
  test('Scenario 3-10: workflowType=standard + DEV FAIL — 不含 grader 訊息', () => {
    const result = buildStopMessages(makeGraderCtx({
      workflowType: 'standard',
      verdict: 'fail',
      state: { failCount: 1, rejectCount: 0, retroCount: 0 },
    }));

    const joined = result.messages.join('\n');
    expect(joined).not.toContain('grader');
    expect(joined).not.toContain('MUST 委派 grader');
    expect(joined).toContain('DEBUGGER');
  });
});

// ════════════════════════════════════════════════════════════════
// Feature 7: postdev 收斂提示（BDD Feature C）
// ════════════════════════════════════════════════════════════════

describe('Feature 7: postdev 收斂提示', () => {
  // 建立 postdev 收斂場景的 ctx 工廠
  function makePostdevCtx(retroResult, retroCount, overrides = {}) {
    return makeCtx({
      verdict: 'pass',
      stageKey: 'DOCS',
      actualStageKey: 'DOCS',
      agentName: 'documenter',
      convergence: { group: 'postdev' },
      nextHint: null,
      state: {
        failCount: 0,
        rejectCount: 0,
        retroCount,
        stages: {
          RETRO: { status: 'completed', result: retroResult },
          DOCS: { status: 'completed', result: 'pass' },
        },
      },
      ...overrides,
    });
  }

  // Scenario C-1: RETRO pass + DOCS pass — 無 issues 提示
  test('Scenario C-1: RETRO result=pass — 收斂後不含 issues 提示', () => {
    const result = buildStopMessages(makePostdevCtx('pass', 0));

    const joined = result.messages.join('\n');
    expect(joined).toContain('postdev');
    expect(joined).not.toContain('RETRO 回顧發現改善建議');
    expect(joined).not.toContain('可選：觸發');
  });

  // Scenario C-2: RETRO issues + DOCS pass + retroCount=1 — 含 issues 提示
  test('Scenario C-2: RETRO result=issues + retroCount=1 — 含改善建議提示和可選操作', () => {
    const result = buildStopMessages(makePostdevCtx('issues', 1));

    const joined = result.messages.join('\n');
    expect(joined).toContain('RETRO 回顧發現改善建議（retroCount: 1/3）');
    expect(joined).toContain('可選：觸發 /auto 新一輪優化，或標記工作流完成');
    expect(joined).not.toContain('已達迭代上限');
  });

  // Scenario C-3: DOCS 先完成（convergence=null）— 無收斂提示
  test('Scenario C-3: convergence=null（群組未收斂）— 無 postdev 提示', () => {
    const result = buildStopMessages(makeCtx({
      verdict: 'pass',
      stageKey: 'DOCS',
      convergence: null,
      nextHint: null,
      state: {
        failCount: 0,
        rejectCount: 0,
        retroCount: 0,
        stages: {
          RETRO: { status: 'in_progress' },
          DOCS: { status: 'completed', result: 'pass' },
        },
      },
    }));

    const joined = result.messages.join('\n');
    expect(joined).not.toContain('postdev');
    expect(joined).not.toContain('RETRO 回顧發現改善建議');
  });

  // Scenario C-4: RETRO 先完成（convergence=null）— 無收斂提示；DOCS 後完成觸發收斂
  test('Scenario C-4: RETRO 先完成後 DOCS 觸發收斂 — 收斂後含 issues 提示', () => {
    // RETRO 先完成，尚未收斂
    const retroResult = buildStopMessages(makeCtx({
      verdict: 'issues',
      stageKey: 'RETRO',
      convergence: null,
      state: { failCount: 0, rejectCount: 0, retroCount: 0 },
    }));
    expect(retroResult.messages.join('\n')).not.toContain('postdev');

    // DOCS 後完成，觸發收斂
    const docsResult = buildStopMessages(makePostdevCtx('issues', 1));
    const joined = docsResult.messages.join('\n');
    expect(joined).toContain('RETRO 回顧發現改善建議');
  });

  // Scenario C-5: retroCount=3（達上限）— 顯示上限訊息
  test('Scenario C-5: RETRO result=issues + retroCount=3 — 含上限訊息，不含可選提示', () => {
    const result = buildStopMessages(makePostdevCtx('issues', 3));

    const joined = result.messages.join('\n');
    expect(joined).toContain('RETRO 回顧發現改善建議（retroCount: 3/3）');
    expect(joined).toContain('已達迭代上限（3 次），工作流完成');
    expect(joined).not.toContain('可選：觸發 /auto');
  });
});

// ════════════════════════════════════════════════════════════════
// Feature 8: impactSummary 注入（DEV PASS）
// ════════════════════════════════════════════════════════════════

describe('Feature 8: impactSummary 注入', () => {
  // Scenario 8-1: DEV PASS + impactSummary 存在 — 含影響範圍提醒
  test('Scenario 8-1: DEV PASS + impactSummary — 訊息包含影響範圍分析區塊', () => {
    const summary = '修改了 3 個檔案。\n- agents/developer.md（被 scripts/lib/state.js 影響）\n💡 建議執行 bun scripts/impact.js <path> 確認完整影響範圍\n💡 檢查是否有 hardcoded 數值需要同步更新';
    const result = buildStopMessages(makeCtx({
      verdict: 'pass',
      stageKey: 'DEV',
      impactSummary: summary,
      nextHint: '委派 tester',
    }));

    const joined = result.messages.join('\n');
    expect(joined).toContain('🔍 影響範圍分析：');
    expect(joined).toContain('修改了 3 個檔案');
    expect(joined).toContain('hardcoded 數值');
  });

  // Scenario 8-2: DEV PASS + impactSummary=null — 無影響範圍區塊
  test('Scenario 8-2: DEV PASS + impactSummary=null — 不包含影響範圍區塊', () => {
    const result = buildStopMessages(makeCtx({
      verdict: 'pass',
      stageKey: 'DEV',
      impactSummary: null,
      nextHint: '委派 tester',
    }));

    const joined = result.messages.join('\n');
    expect(joined).not.toContain('🔍 影響範圍分析：');
  });

  // Scenario 8-3: 非 DEV stage PASS + impactSummary 存在 — 不注入（只限 DEV）
  test('Scenario 8-3: REVIEW PASS + impactSummary — 不包含影響範圍區塊', () => {
    const summary = '修改了 2 個檔案。';
    const result = buildStopMessages(makeCtx({
      verdict: 'pass',
      stageKey: 'REVIEW',
      impactSummary: summary,
      nextHint: '委派 retro',
    }));

    const joined = result.messages.join('\n');
    expect(joined).not.toContain('🔍 影響範圍分析：');
  });

  // Scenario 8-4: DEV FAIL + impactSummary 存在 — 不注入（只限 PASS）
  test('Scenario 8-4: DEV FAIL + impactSummary — 不包含影響範圍區塊', () => {
    const summary = '修改了 1 個檔案。';
    const result = buildStopMessages(makeCtx({
      verdict: 'fail',
      stageKey: 'DEV',
      impactSummary: summary,
      state: { failCount: 1, rejectCount: 0, retroCount: 0 },
    }));

    const joined = result.messages.join('\n');
    expect(joined).not.toContain('🔍 影響範圍分析：');
  });

  // Scenario 8-5: DEV PASS + impactSummary 在 nextHint 之前出現
  test('Scenario 8-5: DEV PASS + impactSummary — 影響範圍區塊出現在 nextHint 之前', () => {
    const summary = '修改了 2 個檔案。\n💡 建議執行 bun scripts/impact.js';
    const result = buildStopMessages(makeCtx({
      verdict: 'pass',
      stageKey: 'DEV',
      impactSummary: summary,
      nextHint: '委派 tester 執行測試',
    }));

    const joined = result.messages.join('\n');
    const impactIdx = joined.indexOf('🔍 影響範圍分析：');
    const nextHintIdx = joined.indexOf('⏭️ 下一步：');
    expect(impactIdx).toBeGreaterThanOrEqual(0);
    expect(nextHintIdx).toBeGreaterThan(impactIdx);
  });
});
