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
const state = require('../../../scripts/lib/state');
const timeline = require('../../../scripts/lib/timeline');
const { stages, workflows, parallelGroups, retryDefaults } = require('../../../scripts/lib/registry');

// ── 從 stdin 讀取 hook input ──

const input = JSON.parse(readFileSync('/dev/stdin', 'utf8'));
const sessionId = process.env.CLAUDE_SESSION_ID || '';

// 取得 agent 資訊
const agentName = (input.subagent_name || '').trim();
const agentOutput = (input.output || '').trim();

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

const currentState = state.readState(sessionId);
if (!currentState) {
  process.stdout.write(JSON.stringify({ result: '' }));
  process.exit(0);
}

// ── 解析 agent 結果 ──

const result = parseResult(agentOutput, stageKey);

// ── 移除 active agent ──

state.removeActiveAgent(sessionId, agentName);

// ── 找到此 agent 對應的 stage key（可能帶編號如 TEST:2）──

const actualStageKey = findActualStageKey(currentState, stageKey);
if (!actualStageKey) {
  process.stdout.write(JSON.stringify({ result: '' }));
  process.exit(0);
}

// ── 更新 stage 狀態 ──

state.updateStage(sessionId, actualStageKey, {
  status: 'completed',
  result: result.verdict,
  completedAt: new Date().toISOString(),
});

// ── emit timeline 事件 ──

timeline.emit(sessionId, 'agent:complete', {
  agent: agentName,
  stage: actualStageKey,
  result: result.verdict,
});

timeline.emit(sessionId, 'stage:complete', {
  stage: actualStageKey,
  result: result.verdict,
});

// ── 處理 FAIL / REJECT ──

const updatedState = state.readState(sessionId);
const messages = [];

if (result.verdict === 'fail') {
  updatedState.failCount = (updatedState.failCount || 0) + 1;
  state.writeState(sessionId, updatedState);

  if (updatedState.failCount >= retryDefaults.maxRetries) {
    messages.push(`⛔ 已達重試上限（${retryDefaults.maxRetries} 次）。請人工介入。`);
    timeline.emit(sessionId, 'error:fatal', {
      reason: '重試上限',
      failCount: updatedState.failCount,
    });
  } else {
    messages.push(`❌ ${stages[stageKey].emoji} ${stages[stageKey].label}失敗（${updatedState.failCount}/${retryDefaults.maxRetries}）`);
    messages.push('⏭️ 下一步：委派 DEBUGGER 分析根因 → DEVELOPER 修復 → TESTER 驗證');
    timeline.emit(sessionId, 'stage:retry', {
      stage: actualStageKey,
      failCount: updatedState.failCount,
    });
  }
} else if (result.verdict === 'reject') {
  updatedState.rejectCount = (updatedState.rejectCount || 0) + 1;
  state.writeState(sessionId, updatedState);

  if (updatedState.rejectCount >= retryDefaults.maxRetries) {
    messages.push(`⛔ 審查拒絕已達上限（${retryDefaults.maxRetries} 次）。請人工介入。`);
    timeline.emit(sessionId, 'error:fatal', {
      reason: '拒絕上限',
      rejectCount: updatedState.rejectCount,
    });
  } else {
    messages.push(`🔙 審查拒絕（${updatedState.rejectCount}/${retryDefaults.maxRetries}）`);
    messages.push('⏭️ 下一步：委派 DEVELOPER 修復（帶 reject 原因）→ REVIEWER 再審');
  }
} else {
  // PASS — 檢查並行收斂 + 提示下一步
  messages.push(`✅ ${stages[stageKey].emoji} ${stages[stageKey].label}完成`);

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
    messages.push('🎉 所有階段已完成！');
    timeline.emit(sessionId, 'workflow:complete', {
      workflowType: updatedState.workflowType,
    });
  }
}

process.stdout.write(JSON.stringify({
  result: messages.join('\n'),
}));

// ── 輔助函式 ──

/**
 * 解析 agent 輸出，判斷結果
 */
function parseResult(output, stageKey) {
  const lower = output.toLowerCase();

  // REVIEWER → PASS / REJECT
  if (stageKey === 'REVIEW' || stageKey === 'SECURITY' || stageKey === 'DB-REVIEW') {
    if (lower.includes('reject') || lower.includes('拒絕')) {
      return { verdict: 'reject' };
    }
    return { verdict: 'pass' };
  }

  // TESTER / QA / E2E → PASS / FAIL
  if (stageKey === 'TEST' || stageKey === 'QA' || stageKey === 'E2E') {
    if (lower.includes('fail') || lower.includes('失敗') || lower.includes('error')) {
      return { verdict: 'fail' };
    }
    return { verdict: 'pass' };
  }

  // BUILD-FIX → PASS / FAIL
  if (stageKey === 'BUILD-FIX') {
    if (lower.includes('fail') || lower.includes('失敗') || lower.includes('error')) {
      return { verdict: 'fail' };
    }
    return { verdict: 'pass' };
  }

  // 其他 → 預設 pass
  return { verdict: 'pass' };
}

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
