#!/usr/bin/env node
'use strict';
/**
 * SubagentStop hook — 記錄 agent 結果 + 提示下一步 + 寫 state + emit timeline
 *
 * 觸發：每個 subagent（Task）結束時
 * 職責：記錄結果、偵測 FAIL/REJECT、並行收斂、提示下一步
 */

const { readFileSync, existsSync, unlinkSync } = require('fs');
const { readState, updateStateAtomic, findActualStageKey, checkParallelConvergence, getNextStageHint, setFeatureName } = require('../../../scripts/lib/state');
const timeline = require('../../../scripts/lib/timeline');
const instinct = require('../../../scripts/lib/instinct');
const { stages, parallelGroups, retryDefaults, specsConfig } = require('../../../scripts/lib/registry');
const paths = require('../../../scripts/lib/paths');
const parseResult = require('../../../scripts/lib/parse-result');
const { safeReadStdin, safeRun, getSessionId, shouldSuggestCompact } = require('../../../scripts/lib/hook-utils');
const { atomicWrite } = require('../../../scripts/lib/utils');
const { buildStopMessages } = require('../../../scripts/lib/stop-message-builder');
const { archiveKnowledge } = require('../../../scripts/lib/knowledge-archiver');

if (require.main === module) {
safeRun(() => {
  const input = safeReadStdin();
  const sessionId = getSessionId(input);
  const projectRoot = input.cwd || process.cwd();
  const rawAgentType = (input.agent_type || '').trim();
  const agentName = rawAgentType.startsWith('ot:') ? rawAgentType.slice(3) : rawAgentType;
  const agentOutput = (input.last_assistant_message || '').trim();
  const exit0 = (msg = '') => { process.stdout.write(JSON.stringify({ result: msg })); process.exit(0); };

  if (!sessionId || !agentName) return exit0();

  // 清除 active agent 追蹤
  try { unlinkSync(paths.session.activeAgent(sessionId)); } catch { /* 靜默 */ }

  // 辨識 stage
  const agentToStage = {};
  for (const [k, def] of Object.entries(stages)) agentToStage[def.agent] = k;
  const stageKey = agentToStage[agentName];
  if (!stageKey) return exit0();

  const currentState = readState(sessionId);
  if (!currentState) return exit0();

  const result = parseResult(agentOutput, stageKey);
  const actualStageKey = findActualStageKey(currentState, stageKey);
  if (!actualStageKey) return exit0();

  // 原子化更新 state
  const updatedState = updateStateAtomic(sessionId, (s) => {
    delete s.activeAgents[agentName];
    if (s.stages[actualStageKey]) {
      Object.assign(s.stages[actualStageKey], { status: 'completed', result: result.verdict, completedAt: new Date().toISOString() });
      const nextPending = Object.keys(s.stages).find((k) => s.stages[k].status === 'pending');
      if (nextPending) s.currentStage = nextPending;
    }
    if (result.verdict === 'fail') s.failCount = (s.failCount || 0) + 1;
    else if (result.verdict === 'reject') s.rejectCount = (s.rejectCount || 0) + 1;
    return s;
  });

  // emit timeline
  if (result.verdict === 'fail') {
    timeline.emit(sessionId, 'agent:error', { agent: agentName, stage: actualStageKey, reason: result.reason || 'agent 回報 fail' });
  }
  timeline.emit(sessionId, 'agent:complete', { agent: agentName, stage: actualStageKey, result: result.verdict });
  timeline.emit(sessionId, 'stage:complete', { stage: actualStageKey, result: result.verdict });

  // agent_performance instinct
  try {
    const trigger = `${agentName} ${result.verdict} at ${actualStageKey}`;
    const action = result.verdict === 'pass' ? `${agentName} 成功完成 ${actualStageKey}` : `${agentName} 在 ${actualStageKey} 結果為 ${result.verdict}`;
    instinct.emit(sessionId, 'agent_performance', trigger, action, `agent-${agentName}`);
  } catch { /* 靜默 */ }

  // featureName auto-sync（僅限有 specs 文件的 workflow）
  if (!updatedState.featureName && projectRoot && specsConfig[currentState.workflowType]?.length > 0) {
    try {
      const specs = require('../../../scripts/lib/specs');
      const af = specs.getActiveFeature(projectRoot);
      if (af) { setFeatureName(sessionId, af.name); updatedState.featureName = af.name; }
    } catch { /* 靜默 */ }
  }

  // tasks.md checkbox
  let tasksCheckboxWarning = null;
  if (result.verdict !== 'fail' && result.verdict !== 'reject' && updatedState.featureName) {
    const tasksPath = paths.project.featureTasks(projectRoot, updatedState.featureName);
    if (existsSync(tasksPath)) {
      try {
        const content = readFileSync(tasksPath, 'utf8');
        const baseStage = actualStageKey.split(':')[0];
        const updated = content.replace(new RegExp(`^([ \\t]*- )\\[ \\]( ${baseStage})([ \\t]*)$`, 'm'), '$1[x]$2$3');
        if (updated !== content) atomicWrite(tasksPath, updated);
      } catch (err) { tasksCheckboxWarning = err.message; }
    }
  }

  // 準備 builder 輸入
  const convergence = checkParallelConvergence(updatedState, parallelGroups);
  const nextHint = getNextStageHint(updatedState, { stages, parallelGroups });
  const compactSuggestion = nextHint
    ? shouldSuggestCompact({ transcriptPath: input.transcript_path || null, sessionId })
    : { suggest: false };

  let specsInfo = null;
  if (updatedState.featureName && result.verdict !== 'fail' && result.verdict !== 'reject') {
    try {
      const specsLib = require('../../../scripts/lib/specs');
      const tasks = specsLib.readTasksCheckboxes(paths.project.featureTasks(projectRoot, updatedState.featureName));
      if (tasks && tasks.total > 0) specsInfo = { checked: tasks.checked, total: tasks.total };
    } catch { /* 靜默 */ }
  }

  const buildResult = buildStopMessages({
    verdict: result.verdict, stageKey, actualStageKey, agentName, sessionId,
    state: updatedState, stages, retryDefaults, parallelGroups,
    tasksCheckboxWarning, compactSuggestion, convergence, nextHint,
    featureName: updatedState.featureName, projectRoot, specsInfo,
  });

  // 執行 builder 回傳的副作用
  for (const evt of buildResult.timelineEvents) timeline.emit(sessionId, evt.type, evt.data);
  for (const upd of buildResult.stateUpdates) {
    if (upd.type === 'incrementRetroCount') {
      updateStateAtomic(sessionId, (s) => { s.retroCount = (s.retroCount || 0) + 1; return s; });
    }
  }

  // 知識歸檔
  if (result.verdict !== 'fail' && result.verdict !== 'reject') {
    archiveKnowledge(agentOutput.slice(0, 3000), { agentName, actualStageKey, projectRoot, sessionId });
  }

  exit0(buildResult.messages.join('\n'));
}, { result: '' });
}

module.exports = {};
