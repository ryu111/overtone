'use strict';
/**
 * stop-message-builder.js — SubagentStop 提示訊息組裝器（純函式）
 *
 * 將 on-stop.js 的 prompt 組裝邏輯提取為純函式，不直接操作 timeline/state/instinct。
 * 副作用（timeline emit、state update）透過回傳值傳遞給呼叫方執行。
 *
 * 導出：
 *   buildStopMessages — 主組裝函式
 */

/**
 * 組裝 SubagentStop 提示訊息。
 *
 * @param {object} ctx
 * @param {string}      ctx.verdict          - 'pass' | 'fail' | 'reject' | 'issues'
 * @param {string}      ctx.stageKey         - registry stage key（如 'DEV'）
 * @param {string}      ctx.actualStageKey   - 實際 stage key（可能含編號如 'TEST:2'）
 * @param {string}      ctx.agentName        - agent 名稱（如 'developer'）
 * @param {string}      ctx.sessionId        - session ID
 * @param {object}      ctx.state            - workflow state（failCount, rejectCount, retroCount...）
 * @param {object}      ctx.stages           - registry.stages（含 emoji、label 等）
 * @param {object}      ctx.retryDefaults    - registry.retryDefaults（含 maxRetries）
 * @param {object}      ctx.parallelGroups   - registry.parallelGroups
 * @param {string|null} ctx.tasksCheckboxWarning - tasks.md 勾選失敗的錯誤訊息
 * @param {object|null} ctx.compactSuggestion  - shouldSuggestCompact 結果
 * @param {object|null} ctx.convergence        - checkParallelConvergence 結果
 * @param {string|null} ctx.nextHint           - getNextStageHint 結果
 * @param {string|null} ctx.featureName        - specs feature 名稱
 * @param {string}      ctx.projectRoot        - 專案根目錄
 * @param {object|null} [ctx.specsInfo]        - { checked, total } 從 specs 讀取的 checkbox 統計
 * @param {object|null} [ctx.scoringConfig]    - registry.scoringConfig（gradedStages + lowScoreThreshold）
 * @param {object|null} [ctx.lastScore]        - ScoreSummary | null（最近 N 筆同 stage 的平均分）
 * @param {string|null} [ctx.workflowType]     - workflow 類型（用於 grader 評分提示）
 *
 * @returns {{
 *   messages: string[],
 *   timelineEvents: Array<{ type: string, data: object }>,
 *   stateUpdates: Array<{ type: string }>
 * }}
 */
function buildStopMessages(ctx) {
  const {
    verdict,
    stageKey,
    actualStageKey,
    agentName,
    sessionId,
    state,
    stages,
    retryDefaults,
    tasksCheckboxWarning,
    compactSuggestion,
    convergence,
    nextHint,
    featureName,
    specsInfo,
    scoringConfig,
    lastScore,
    workflowType,
  } = ctx;

  const messages = [];
  const timelineEvents = [];
  const stateUpdates = [];

  // ── 警告（置頂）──
  if (tasksCheckboxWarning) {
    messages.push(`⚠️ tasks.md 勾選更新失敗：${tasksCheckboxWarning}`);
  }

  // ── 按 verdict 分支 ──

  if (verdict === 'fail') {
    if (state.failCount >= retryDefaults.maxRetries) {
      messages.push(`⛔ 已達重試上限（${retryDefaults.maxRetries} 次）。請人工介入。`);
      timelineEvents.push({
        type: 'error:fatal',
        data: { reason: '重試上限', failCount: state.failCount },
      });
    } else {
      messages.push(`❌ ${stages[stageKey].emoji} ${stages[stageKey].label}失敗（${state.failCount}/${retryDefaults.maxRetries}）`);
      if (state.rejectCount > 0) {
        // D3：雙重失敗協調提示
        messages.push('⚠️ 並行群組雙重失敗（TEST FAIL + REVIEW REJECT）');
        messages.push('⏭️ 協調策略（TEST FAIL > REVIEW REJECT）：委派 DEBUGGER 分析根因 → DEVELOPER 修復（同時帶入 REVIEW reject 原因）→ 再次並行 [REVIEW + TEST]');
      } else {
        messages.push('⏭️ 下一步：委派 DEBUGGER 分析根因 → DEVELOPER 修復 → TESTER 驗證');
      }
      timelineEvents.push({
        type: 'stage:retry',
        data: { stage: actualStageKey, failCount: state.failCount },
      });
    }

  } else if (verdict === 'reject') {
    if (state.rejectCount >= retryDefaults.maxRetries) {
      messages.push(`⛔ 審查拒絕已達上限（${retryDefaults.maxRetries} 次）。請人工介入。`);
      timelineEvents.push({
        type: 'error:fatal',
        data: { reason: '拒絕上限', rejectCount: state.rejectCount },
      });
    } else {
      messages.push(`🔙 審查拒絕（${state.rejectCount}/${retryDefaults.maxRetries}）`);
      if (state.failCount > 0) {
        // D3：雙重失敗（REJECT + 已有 FAIL），TEST FAIL 優先
        messages.push('⚠️ 並行群組雙重失敗（TEST FAIL + REVIEW REJECT）');
        messages.push('⏭️ 協調策略（TEST FAIL > REVIEW REJECT）：等待 TEST 結果，以 TEST FAIL 路徑為主（DEBUGGER → DEVELOPER → 再次並行 [REVIEW + TEST]），REVIEW reject 原因一併帶入');
      } else {
        messages.push('⏭️ 下一步：委派 DEVELOPER 修復（帶 reject 原因）→ REVIEWER 再審');
      }
      // REJECT 不 emit stage:retry
    }

  } else if (verdict === 'issues') {
    // RETRO ISSUES — retroCount 遞增由呼叫方執行
    stateUpdates.push({ type: 'incrementRetroCount' });
    const newRetroCount = (state.retroCount || 0) + 1;
    messages.push(`🔁 ${stages[stageKey]?.emoji || ''} ${stages[stageKey]?.label || stageKey}回顧完成：發現改善建議（retroCount: ${newRetroCount}/3）`);
    if (newRetroCount >= 3) {
      messages.push('⛔ 已達迭代上限（3 次），建議繼續完成剩餘 stages（如 DOCS）');
    } else {
      messages.push('💡 可選：觸發 /ot:auto 新一輪優化，或繼續完成剩餘 stages');
    }

  } else {
    // PASS
    messages.push(`✅ ${stages[stageKey].emoji} ${stages[stageKey].label}完成`);
    messages.push(`📊 請更新 TaskList：TaskUpdate status completed（${stages[stageKey].label}）`);

    // Specs 路徑提示
    if (featureName) {
      const taskInfo = specsInfo && specsInfo.total > 0
        ? ` (${specsInfo.checked}/${specsInfo.total} tasks)`
        : '';
      messages.push(`📂 Specs：specs/features/in-progress/${featureName}/${taskInfo}`);
    }

    // 並行群組收斂偵測
    if (convergence) {
      messages.push(`🔄 並行群組 ${convergence.group} 全部完成`);
      timelineEvents.push({
        type: 'parallel:converge',
        data: { group: convergence.group },
      });
    }

    // 評分建議（在 gradedStages 中的 stage PASS 時插入）
    if (scoringConfig && scoringConfig.gradedStages.includes(stageKey)) {
      const workflowHint = workflowType ? ` WORKFLOW_TYPE=${workflowType}` : '';
      messages.push(`🎯 建議委派 grader 評分：STAGE=${stageKey} AGENT=${agentName} SESSION_ID=${sessionId}${workflowHint}`);

      // 低分警告（若有上一次分數且嚴格低於閾值）
      if (lastScore && lastScore.avgOverall !== null && lastScore.avgOverall < scoringConfig.lowScoreThreshold) {
        messages.push(`⚠️ ${stageKey} 歷史平均分偏低（${lastScore.avgOverall.toFixed(2)}/5.0），建議關注品質`);
        stateUpdates.push({
          type: 'emitQualitySignal',
          agentName,
          stageKey,
          avgOverall: lastScore.avgOverall,
          threshold: scoringConfig.lowScoreThreshold,
        });
      }
    }

    // 提示下一步
    if (nextHint) {
      messages.push(`⏭️ 下一步：${nextHint}`);

      // Compact 建議（只在非最後 stage 時觸發）
      if (compactSuggestion && compactSuggestion.suggest) {
        messages.push(`\n💾 transcript 已達 ${compactSuggestion.transcriptSize}，建議在繼續下一個 stage 前執行 /compact 壓縮 context。`);
        timelineEvents.push({
          type: 'session:compact-suggestion',
          data: {
            transcriptSize: compactSuggestion.transcriptSize,
            reason: compactSuggestion.reason,
            stage: actualStageKey,
            agent: agentName,
          },
        });
      }
    } else {
      // 所有階段完成
      messages.push('🎉 所有階段已完成！');
      messages.push('📋 建議：委派 planner 規劃下一批工作（或執行 /ot:plan）');
    }
  }

  return { messages, timelineEvents, stateUpdates };
}

module.exports = { buildStopMessages };
