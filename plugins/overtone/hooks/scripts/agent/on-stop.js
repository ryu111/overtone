#!/usr/bin/env node
'use strict';
/**
 * SubagentStop hook — 記錄 agent 結果 + 提示下一步 + 寫 state + emit timeline
 *
 * 觸發：每個 subagent（Task）結束時
 * 職責：
 *   ✅ 記錄結果到 workflow.json + timeline.jsonl
 *   ✅ 偵測 FAIL/REJECT 並遞增計數器
 *   ✅ 並行群組收斂偵測
 *   ✅ 提示 Main Agent 下一步
 */

const { readFileSync } = require('fs');
const { readState, updateStateAtomic } = require('../../../scripts/lib/state');
const timeline = require('../../../scripts/lib/timeline');
const instinct = require('../../../scripts/lib/instinct');
const { stages, workflows, parallelGroups, retryDefaults } = require('../../../scripts/lib/registry');
const paths = require('../../../scripts/lib/paths');
const parseResult = require('../../../scripts/lib/parse-result');
const { safeReadStdin, safeRun, getSessionId } = require('../../../scripts/lib/hook-utils');

safeRun(() => {
  // ── 從 stdin 讀取 hook input ──

  const input = safeReadStdin();
  const sessionId = getSessionId(input);
  const projectRoot = input.cwd || process.cwd();

  // 取得 agent 資訊
  // Claude Code SubagentStop 傳 agent_type（如 "ot:developer"），需剝除 "ot:" 前綴
  const rawAgentType = (input.agent_type || '').trim();
  const agentName = rawAgentType.startsWith('ot:') ? rawAgentType.slice(3) : rawAgentType;
  const agentOutput = (input.last_assistant_message || '').trim();

  // 無 session 或無 agent 名稱 → 跳過
  if (!sessionId || !agentName) {
    process.stdout.write(JSON.stringify({ result: '' }));
    process.exit(0);
  }

  // ── 辨識 agent 對應的 stage ──

  const agentToStage = {};
  for (const [stageKey, def] of Object.entries(stages)) {
    agentToStage[def.agent] = stageKey;
  }

  const stageKey = agentToStage[agentName];
  if (!stageKey) {
    // 非 Overtone 管理的 agent → 跳過
    process.stdout.write(JSON.stringify({ result: '' }));
    process.exit(0);
  }

  // ── 讀取當前狀態 ──

  const currentState = readState(sessionId);
  if (!currentState) {
    process.stdout.write(JSON.stringify({ result: '' }));
    process.exit(0);
  }

  // ── 解析 agent 結果 ──

  const result = parseResult(agentOutput, stageKey);

  // ── 找到此 agent 對應的 stage key（可能帶編號如 TEST:2）──

  const actualStageKey = findActualStageKey(currentState, stageKey);
  if (!actualStageKey) {
    process.stdout.write(JSON.stringify({ result: '' }));
    process.exit(0);
  }

  // ── 原子化更新：合併 removeActiveAgent + updateStage + failCount/rejectCount（H-2）──

  const updatedState = updateStateAtomic(sessionId, (s) => {
    // 1. 移除 active agent
    delete s.activeAgents[agentName];

    // 2. 更新 stage 狀態
    if (s.stages[actualStageKey]) {
      Object.assign(s.stages[actualStageKey], {
        status: 'completed',
        result: result.verdict,
        completedAt: new Date().toISOString(),
      });

      // 自動推進 currentStage
      const keys = Object.keys(s.stages);
      const nextPending = keys.find((k) => s.stages[k].status === 'pending');
      if (nextPending) s.currentStage = nextPending;
    }

    // 3. 更新 fail/reject 計數
    if (result.verdict === 'fail') {
      s.failCount = (s.failCount || 0) + 1;
    } else if (result.verdict === 'reject') {
      s.rejectCount = (s.rejectCount || 0) + 1;
    }

    return s;
  });

  // ── emit timeline 事件 ──

  // agent:error — 補充事件（result 為 fail 時先 emit，再 emit agent:complete）
  if (result.verdict === 'fail') {
    timeline.emit(sessionId, 'agent:error', {
      agent: agentName,
      stage: actualStageKey,
      reason: result.reason || 'agent 回報 fail',
    });
  }

  timeline.emit(sessionId, 'agent:complete', {
    agent: agentName,
    stage: actualStageKey,
    result: result.verdict,
  });

  timeline.emit(sessionId, 'stage:complete', {
    stage: actualStageKey,
    result: result.verdict,
  });

  // ── agent_performance 觀察記錄 ──
  try {
    const perfTrigger = `${agentName} ${result.verdict} at ${actualStageKey}`;
    const perfAction = result.verdict === 'pass'
      ? `${agentName} 成功完成 ${actualStageKey}`
      : `${agentName} 在 ${actualStageKey} 結果為 ${result.verdict}`;
    instinct.emit(sessionId, 'agent_performance', perfTrigger, perfAction, `agent-${agentName}`);
  } catch {
    // Instinct 觀察失敗不影響主流程
  }

  // ── 自動更新 tasks.md checkbox（若有 specs feature）──
  // 當 stage 完成（非 fail/reject）時，在 tasks.md 中勾選對應的 checkbox

  let tasksCheckboxWarning = null;

  if (result.verdict !== 'fail' && result.verdict !== 'reject' && updatedState.featureName) {
    const { existsSync } = require('fs');
    const { atomicWrite } = require('../../../scripts/lib/utils');

    const tasksPath = paths.project.featureTasks(projectRoot, updatedState.featureName);

    if (existsSync(tasksPath)) {
      try {
        const content = readFileSync(tasksPath, 'utf8');

        // 去掉 :2 等編號，取得 base stage 名稱
        const baseStage = actualStageKey.split(':')[0];
        // 精確匹配 stage 名稱的未勾選 checkbox（行首允許縮排）
        const pattern = new RegExp(`^([ \\t]*- )\\[ \\]( ${baseStage})([ \\t]*)$`, 'm');
        const updated = content.replace(pattern, '$1[x]$2$3');

        if (updated !== content) {
          atomicWrite(tasksPath, updated);
        }
      } catch (err) {
        tasksCheckboxWarning = err.message;
      }
    }
  }

  // ── 產生提示訊息 ──

  const messages = [];

  if (tasksCheckboxWarning) {
    messages.push(`⚠️ tasks.md 勾選更新失敗：${tasksCheckboxWarning}`);
  }

  if (result.verdict === 'fail') {
    if (updatedState.failCount >= retryDefaults.maxRetries) {
      messages.push(`⛔ 已達重試上限（${retryDefaults.maxRetries} 次）。請人工介入。`);
      timeline.emit(sessionId, 'error:fatal', {
        reason: '重試上限',
        failCount: updatedState.failCount,
      });
    } else {
      messages.push(`❌ ${stages[stageKey].emoji} ${stages[stageKey].label}失敗（${updatedState.failCount}/${retryDefaults.maxRetries}）`);
      // D3：若同時有 REVIEW REJECT（rejectCount > 0），輸出整合協調提示
      if (updatedState.rejectCount > 0) {
        messages.push('⚠️ 並行群組雙重失敗（TEST FAIL + REVIEW REJECT）');
        messages.push('⏭️ 協調策略（TEST FAIL > REVIEW REJECT）：委派 DEBUGGER 分析根因 → DEVELOPER 修復（同時帶入 REVIEW reject 原因）→ 再次並行 [REVIEW + TEST]');
      } else {
        messages.push('⏭️ 下一步：委派 DEBUGGER 分析根因 → DEVELOPER 修復 → TESTER 驗證');
      }
      timeline.emit(sessionId, 'stage:retry', {
        stage: actualStageKey,
        failCount: updatedState.failCount,
      });
    }
  } else if (result.verdict === 'reject') {
    if (updatedState.rejectCount >= retryDefaults.maxRetries) {
      messages.push(`⛔ 審查拒絕已達上限（${retryDefaults.maxRetries} 次）。請人工介入。`);
      timeline.emit(sessionId, 'error:fatal', {
        reason: '拒絕上限',
        rejectCount: updatedState.rejectCount,
      });
    } else {
      messages.push(`🔙 審查拒絕（${updatedState.rejectCount}/${retryDefaults.maxRetries}）`);
      // D3：若同時有 TEST FAIL（failCount > 0），提示 TEST FAIL 優先
      if (updatedState.failCount > 0) {
        messages.push('⚠️ 並行群組雙重失敗（TEST FAIL + REVIEW REJECT）');
        messages.push('⏭️ 協調策略（TEST FAIL > REVIEW REJECT）：等待 TEST 結果，以 TEST FAIL 路徑為主（DEBUGGER → DEVELOPER → 再次並行 [REVIEW + TEST]），REVIEW reject 原因一併帶入');
      } else {
        messages.push('⏭️ 下一步：委派 DEVELOPER 修復（帶 reject 原因）→ REVIEWER 再審');
      }
    }
  } else if (result.verdict === 'issues') {
    // 遞增 retroCount
    const withRetro = updateStateAtomic(sessionId, (s) => {
      s.retroCount = (s.retroCount || 0) + 1;
      return s;
    });
    messages.push(`🔁 ${stages[stageKey]?.emoji || ''} ${stages[stageKey]?.label || stageKey}回顧完成：發現改善建議（retroCount: ${withRetro.retroCount}/3）`);
    if (withRetro.retroCount >= 3) {
      messages.push('⛔ 已達迭代上限（3 次），建議繼續完成剩餘 stages（如 DOCS）');
    } else {
      messages.push('💡 可選：觸發 /ot:auto 新一輪優化，或繼續完成剩餘 stages');
    }
  } else {
    // PASS — 檢查並行收斂 + 提示下一步
    messages.push(`✅ ${stages[stageKey].emoji} ${stages[stageKey].label}完成`);
    messages.push(`📊 請更新 TaskList：TaskUpdate status completed（${stages[stageKey].label}）`);

    // Specs 路徑提示（用 featureName 直接定位，避免多 feature 並行時取錯）
    if (updatedState.featureName) {
      try {
        const specsLib = require('../../../scripts/lib/specs');
        const tasksPath = paths.project.featureTasks(projectRoot, updatedState.featureName);
        const tasks = specsLib.readTasksCheckboxes(tasksPath);
        const checked = tasks ? tasks.checked : 0;
        const total = tasks ? tasks.total : 0;
        const taskInfo = total > 0 ? ` (${checked}/${total} tasks)` : '';
        messages.push(`📂 Specs：specs/features/in-progress/${updatedState.featureName}/${taskInfo}`);
      } catch {
        // specs 提示失敗不影響主流程
      }
    }

    // 並行群組收斂偵測
    const convergence = checkParallelConvergence(updatedState);
    if (convergence) {
      messages.push(`🔄 並行群組 ${convergence.group} 全部完成`);
      timeline.emit(sessionId, 'parallel:converge', { group: convergence.group });
    }

    // 提示下一步
    const nextHint = getNextStageHint(updatedState);
    if (nextHint) {
      messages.push(`⏭️ 下一步：${nextHint}`);
    } else {
      // 所有階段完成 — 不在此 emit workflow:complete，由 Stop hook 統一處理
      messages.push('🎉 所有階段已完成！');
      messages.push('📋 建議：委派 planner 規劃下一批工作（或執行 /ot:plan）');
    }
  }

  // 提示 Main Agent 可選呼叫 grader
  if (result.verdict !== 'fail') {
    messages.push(`\n💡 可選：委派 grader agent 評估此階段輸出品質（subagent_type: ot:grader，傳入 STAGE=${actualStageKey} AGENT=${agentName} SESSION_ID=${sessionId}）`);
  }

  process.stdout.write(JSON.stringify({
    result: messages.join('\n'),
  }));
  process.exit(0);
}, { result: '' });

// ── 輔助函式 ──

/**
 * 找到 state 中實際的 stage key（處理重複如 TEST → TEST:2）
 */
function findActualStageKey(currentState, baseStage) {
  const stageKeys = Object.keys(currentState.stages);

  // 找正在 active 的
  const active = stageKeys.find(
    (k) => k === baseStage && currentState.stages[k].status === 'active'
  );
  if (active) return active;

  // 找帶編號且 active 的
  const activeNumbered = stageKeys.find(
    (k) => k.startsWith(baseStage + ':') && currentState.stages[k].status === 'active'
  );
  if (activeNumbered) return activeNumbered;

  // 找任何 pending 的（可能還沒標記 active）
  const pending = stageKeys.find(
    (k) => (k === baseStage || k.startsWith(baseStage + ':')) && currentState.stages[k].status === 'pending'
  );
  return pending || null;
}

/**
 * 檢查並行群組是否收斂
 */
function checkParallelConvergence(currentState) {
  for (const [group, members] of Object.entries(parallelGroups)) {
    const stageKeys = Object.keys(currentState.stages);
    const relevantKeys = stageKeys.filter((k) => {
      const base = k.split(':')[0];
      return members.includes(base);
    });

    if (relevantKeys.length < 2) continue;

    const allCompleted = relevantKeys.every(
      (k) => currentState.stages[k].status === 'completed'
    );
    if (allCompleted) return { group };
  }
  return null;
}

/**
 * 根據當前狀態提示下一步
 *
 * 只有 currentStage 所在的並行群組才會觸發並行提示。
 * 例如 standard 的 [REVIEW + TEST:2] 只在 DEV 完成後才建議並行。
 */
function getNextStageHint(currentState) {
  const nextStage = currentState.currentStage;
  if (!nextStage) return null;

  // D2：若仍有 active agent，不推進到下一步，提示等待
  const activeAgentKeys = Object.keys(currentState.activeAgents || {});
  if (activeAgentKeys.length > 0) {
    return `等待並行 agent 完成：${activeAgentKeys.join(', ')}`;
  }

  const allCompleted = Object.values(currentState.stages).every(
    (s) => s.status === 'completed'
  );
  if (allCompleted) return null;

  const base = nextStage.split(':')[0];
  const def = stages[base];
  if (!def) return `執行 ${nextStage}`;

  // 只檢查 currentStage 所在的並行群組
  const stageKeys = Object.keys(currentState.stages);
  const nextIdx = stageKeys.indexOf(nextStage);

  for (const [, members] of Object.entries(parallelGroups)) {
    if (!members.includes(base)) continue;

    // 從 currentStage 開始，找連續的 pending 且屬於同群組的 stages
    const parallelCandidates = [];
    for (let i = nextIdx; i < stageKeys.length; i++) {
      const k = stageKeys[i];
      const b = k.split(':')[0];
      if (currentState.stages[k].status !== 'pending') break;
      if (members.includes(b)) {
        parallelCandidates.push(k);
      } else {
        break;
      }
    }

    if (parallelCandidates.length > 1) {
      const labels = parallelCandidates.map((k) => {
        const b = k.split(':')[0];
        return stages[b]?.emoji + ' ' + (stages[b]?.label || k);
      });
      return `並行委派 ${labels.join(' + ')}`;
    }
  }

  return `委派 ${def.emoji} ${def.agent}（${def.label}）`;
}
