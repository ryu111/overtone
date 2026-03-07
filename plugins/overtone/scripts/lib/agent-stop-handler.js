'use strict';
/**
 * agent-stop-handler.js — SubagentStop hook 業務邏輯
 *
 * 從 agent/on-stop.js 提取的純邏輯模組（Humble Object 模式）。
 * Hook 保持薄殼，此模組負責所有業務決策。
 *
 * 回傳格式：
 *   { output: { result: '...' } }
 */

const { readFileSync, existsSync } = require('fs');
const { execSync } = require('child_process');
const {
  readState,
  updateStateAtomic,
  findActualStageKey,
  checkSameStageConvergence,
  checkParallelConvergence,
  getNextStageHint,
} = require('./state');
const { syncFeatureName } = require('./feature-sync');
const timeline = require('./timeline');
const instinct = require('./knowledge/instinct');
const { stages, parallelGroups, retryDefaults, specsConfig, scoringConfig } = require('./registry');
const paths = require('./paths');
const parseResult = require('./parse-result');
const { shouldSuggestCompact, getStageByAgent } = require('./hook-utils');
const { atomicWrite } = require('./utils');
const { buildStopMessages } = require('./stop-message-builder');
const { archiveKnowledge } = require('./knowledge/knowledge-archiver');
const { createHookTimer } = require('./hook-timing');

/**
 * 主入口：處理 agent stop 事件
 * @param {object} input - hook stdin 輸入（含 agent_type, last_assistant_message 等欄位）
 * @param {string|null} sessionId - 當前 session ID
 * @returns {{ output: object }} 結構化結果
 */
function handleAgentStop(input, sessionId) {
  const projectRoot = input.cwd || process.cwd();
  const hookTimer = createHookTimer();
  const rawAgentType = (input.agent_type || '').trim();
  const agentName = rawAgentType.startsWith('ot:') ? rawAgentType.slice(3) : rawAgentType;
  const agentOutput = (input.last_assistant_message || '').trim();

  // 無 session 或 agent 名稱 → 靜默退出
  if (!sessionId || !agentName) {
    return { output: { result: '' } };
  }

  // 辨識 stage
  const stageKey = getStageByAgent(agentName, stages);
  if (!stageKey) {
    return { output: { result: '' } };
  }

  const currentState = readState(sessionId);
  if (!currentState) {
    return { output: { result: '' } };
  }

  const result = parseResult(agentOutput, stageKey);

  // 解析 instanceId（從 agentOutput regex）— 提前到 findActualStageKey 之前
  const instanceIdMatch = agentOutput.match(/INSTANCE_ID:\s*(\S+)/);
  let resolvedInstanceId = instanceIdMatch?.[1] || null;

  // activeAgents cleanup — 不依賴 actualStageKey，提前執行確保即使 early exit 也能清除殘留
  updateStateAtomic(sessionId, (s) => {
    if (resolvedInstanceId && s.activeAgents[resolvedInstanceId]) {
      delete s.activeAgents[resolvedInstanceId];
    } else {
      // fallback：找最早登記的同名 instance（timestamp36 可字典序排序）
      const candidates = Object.keys(s.activeAgents || {})
        .filter((k) => (s.activeAgents[k]?.agentName || k.split(':')[0]) === agentName)
        .sort();
      const fallbackKey = candidates[0] || null;
      if (fallbackKey) {
        resolvedInstanceId = fallbackKey;
        delete s.activeAgents[fallbackKey];
      }
    }
    return s;
  });

  // emit agent:complete（即使沒有 stage 對應也要記錄）
  timeline.emit(sessionId, 'agent:complete', { agent: agentName, stage: stageKey, result: result.verdict, instanceId: resolvedInstanceId });

  // 原子化更新 state（含收斂門邏輯）
  // 方向 B 修復：findActualStageKey 移入 callback 內，使用最新 state 避免 TOCTOU 競爭
  let resolvedActualStageKey = null;
  let isConvergedOrFailed = false;
  let finalResult = result.verdict;

  const updatedState = updateStateAtomic(sessionId, (s) => {
    // 在 callback 內用最新 state 解析 actualStageKey，避免 TOCTOU 競爭條件
    resolvedActualStageKey = findActualStageKey(s, stageKey);
    if (!resolvedActualStageKey) {
      // 後到者補位：找 completed+pass 的 stage（先到者已完成場景）
      resolvedActualStageKey = Object.keys(s.stages).find(
        (k) => (k === stageKey || k.startsWith(stageKey + ':')) &&
          s.stages[k].status === 'completed' && s.stages[k].result === 'pass'
      ) || null;
    }
    if (!resolvedActualStageKey) return s; // 安全 early exit，不修改 state

    const actualStageKey = resolvedActualStageKey;
    if (s.stages[actualStageKey]) {
      const entry = s.stages[actualStageKey];

      // stage 已經 completed（先前有 agent fail/pass 觸發收斂）→ 只做 cleanup
      if (entry.status === 'completed') {
        // 仍遞增 parallelDone 做記錄
        entry.parallelDone = (entry.parallelDone || 0) + 1;
        return s;
      }

      // 遞增 parallelDone
      entry.parallelDone = (entry.parallelDone || 0) + 1;

      if (result.verdict === 'fail' || result.verdict === 'reject') {
        // 任一 fail/reject → 立即標記 stage fail
        Object.assign(entry, { status: 'completed', result: result.verdict, completedAt: new Date().toISOString() });
        const nextPending = Object.keys(s.stages).find((k) => s.stages[k].status === 'pending');
        if (nextPending) s.currentStage = nextPending;
        isConvergedOrFailed = true;
        finalResult = result.verdict;
      } else if (result.verdict === 'issues') {
        // RETRO issues → stage 完成，result='issues'，視為收斂（不阻擋後續 stage）
        Object.assign(entry, { status: 'completed', result: 'issues', completedAt: new Date().toISOString() });
        const nextPending = Object.keys(s.stages).find((k) => s.stages[k].status === 'pending');
        if (nextPending) s.currentStage = nextPending;
        isConvergedOrFailed = true;
        finalResult = 'issues';
      } else if (checkSameStageConvergence(entry)) {
        // 全部 pass + 已收斂
        Object.assign(entry, { status: 'completed', result: 'pass', completedAt: new Date().toISOString() });
        const nextPending = Object.keys(s.stages).find((k) => s.stages[k].status === 'pending');
        if (nextPending) s.currentStage = nextPending;
        isConvergedOrFailed = true;
        finalResult = 'pass';
      }
      // 未收斂的 pass：stage 維持 active，不跳轉 currentStage
    }

    if (result.verdict === 'fail') s.failCount = (s.failCount || 0) + 1;
    else if (result.verdict === 'reject') s.rejectCount = (s.rejectCount || 0) + 1;

    // 寫入結構化 pendingAction（確保 context 壓縮後仍可恢復決策）
    if (result.verdict === 'fail') {
      s.pendingAction = {
        type: 'fix-fail',
        stage: actualStageKey,
        agent: agentName,
        reason: result.reason || null,
        count: s.failCount,
        createdAt: new Date().toISOString(),
      };
    } else if (result.verdict === 'reject') {
      s.pendingAction = {
        type: 'fix-reject',
        stage: actualStageKey,
        agent: agentName,
        reason: result.reason || null,
        count: s.rejectCount,
        createdAt: new Date().toISOString(),
      };
    } else if (result.verdict === 'pass' && s.pendingAction) {
      // 修復成功，清除 pendingAction
      s.pendingAction = null;
    }

    return s;
  });

  // statusline 狀態：pop agent（在 early exit 之前，避免並行 agent 殘留）
  // 優先用 resolvedActualStageKey（精確匹配 TEST:2 等編號 key），fallback 用 stageKey（base key）
  const statuslineState = require('./statusline-state');
  statuslineState.update(sessionId, 'agent:stop', { stageKey: resolvedActualStageKey || stageKey });

  if (!resolvedActualStageKey) {
    return { output: { result: '' } };
  }

  // 為後續邏輯提供別名（與舊變數名稱相容）
  const actualStageKey = resolvedActualStageKey;

  // 記錄失敗到全域 store（跨 session 失敗模式追蹤）
  const failureTracker = (() => { try { return require('./failure-tracker'); } catch { return null; } })();
  if (failureTracker) {
    if (result.verdict === 'fail' || result.verdict === 'reject') {
      try {
        failureTracker.recordFailure(projectRoot, {
          ts: new Date().toISOString(),
          sessionId,
          workflowType: currentState.workflowType,
          stage: actualStageKey,
          agent: agentName,
          verdict: result.verdict,
          retryAttempt: (result.verdict === 'fail' ? (updatedState.failCount || 1) : (updatedState.rejectCount || 1)),
          reason: result.reason || null,
        });
      } catch { /* 靜默 — 記錄失敗不影響主流程 */ }
    } else if (result.verdict === 'pass' && ((updatedState.failCount || 0) > 0 || (updatedState.rejectCount || 0) > 0)) {
      // stage 最終 pass 且本 session 曾有失敗 → 記錄 resolved，過濾之前的 fail
      try {
        failureTracker.recordResolution(projectRoot, {
          ts: new Date().toISOString(),
          sessionId,
          stage: actualStageKey,
        });
      } catch { /* 靜默 */ }
    }
  }

  // emit timeline
  if (result.verdict === 'fail') {
    timeline.emit(sessionId, 'agent:error', { agent: agentName, stage: actualStageKey, reason: result.reason || 'agent 回報 fail' });
  }
  // stage:complete 只在收斂（全部 pass）或 fail/reject 時 emit（agent:complete 已在上方提前 emit）
  if (isConvergedOrFailed) {
    timeline.emit(sessionId, 'stage:complete', { stage: actualStageKey, result: finalResult });

    // PM stage 完成時，自動解析輸出中的佇列表格並寫入 execution-queue
    if (stageKey === 'PM' && finalResult === 'pass') {
      try {
        const queueItems = _parseQueueTable(agentOutput);
        if (queueItems.length > 0) {
          const executionQueue = require('./execution-queue');
          executionQueue.writeQueue(projectRoot, queueItems, `PM Discovery ${new Date().toISOString().slice(0, 10)}`);
          timeline.emit(sessionId, 'queue:auto-write', { count: queueItems.length, source: 'PM' });
        }
      } catch { /* 靜默 — 佇列寫入失敗不影響主流程 */ }
    }
  }

  // agent_performance instinct
  try {
    const trigger = `${agentName} ${result.verdict} at ${actualStageKey}`;
    const action = result.verdict === 'pass' ? `${agentName} 成功完成 ${actualStageKey}` : `${agentName} 在 ${actualStageKey} 結果為 ${result.verdict}`;
    instinct.emit(sessionId, 'agent_performance', trigger, action, `agent-${agentName}`);
  } catch { /* 靜默 */ }

  // featureName auto-sync（僅限有 specs 文件的 workflow）
  if (!updatedState.featureName && projectRoot && specsConfig[currentState.workflowType]?.length > 0) {
    const synced = syncFeatureName(projectRoot, sessionId);
    if (synced) updatedState.featureName = synced;
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
      const specsLib = require('./specs');
      const tasks = specsLib.readTasksCheckboxes(paths.project.featureTasks(projectRoot, updatedState.featureName));
      if (tasks && tasks.total > 0) specsInfo = { checked: tasks.checked, total: tasks.total };
    } catch { /* 靜默 */ }
  }

  // 取得上一次同 stage 的分數摘要（靜默失敗不影響主流程）
  let lastScore = null;
  try {
    const scoreEngine = require('./score-engine');
    if (scoringConfig.gradedStages.includes(stageKey)) {
      lastScore = scoreEngine.getScoreSummary(projectRoot, stageKey);
    }
  } catch { /* 靜默 */ }

  // 計算影響範圍（DEV PASS 時才執行，整個邏輯包在 try/catch 靜默降級）
  let impactSummary = null;
  if (stageKey === 'DEV' && result.verdict === 'pass') {
    try {
      impactSummary = _computeImpactSummary(projectRoot);
    } catch { /* 靜默降級 */ }
  }

  const buildResult = buildStopMessages({
    verdict: result.verdict, stageKey, actualStageKey, agentName, sessionId,
    state: updatedState, stages, retryDefaults, parallelGroups,
    tasksCheckboxWarning, compactSuggestion, convergence, nextHint,
    featureName: updatedState.featureName, projectRoot, specsInfo,
    scoringConfig, lastScore, workflowType: updatedState.workflowType,
    impactSummary,
  });

  // 執行 builder 回傳的副作用
  for (const evt of buildResult.timelineEvents) timeline.emit(sessionId, evt.type, evt.data);
  for (const upd of buildResult.stateUpdates) {
    if (upd.type === 'incrementRetroCount') {
      updateStateAtomic(sessionId, (s) => { s.retroCount = (s.retroCount || 0) + 1; return s; });
    } else if (upd.type === 'emitQualitySignal') {
      try {
        const trigger = `${upd.agentName} 歷史平均 ${upd.avgOverall.toFixed(2)} at ${upd.stageKey}`;
        const action = `${upd.stageKey} 品質低於閾值 ${upd.threshold}，建議加強產出品質`;
        instinct.emit(sessionId, 'quality_signal', trigger, action, `quality-${upd.agentName}`);
      } catch { /* 靜默 */ }
    }
  }

  // 知識歸檔
  if (result.verdict !== 'fail' && result.verdict !== 'reject') {
    archiveKnowledge(agentOutput.slice(0, 3000), { agentName, actualStageKey, projectRoot, sessionId });
  }

  // TTS fire-and-forget — 不阻擋主流程
  try {
    const ttsStrategy = require('./tts-strategy');
    const ttsConfig = ttsStrategy.readTtsConfig();
    if (ttsConfig.enabled) {
      const eventKey = (result.verdict === 'fail' || result.verdict === 'reject') ? 'agent:error' : 'agent:complete';
      if (ttsStrategy.shouldSpeak(eventKey, ttsConfig.level)) {
        const args = ttsStrategy.buildSpeakArgs(eventKey, { stage: stageKey }, ttsConfig);
        if (args) require('../os/tts').speakBackground(args.text, args.opts);
      }
    }
  } catch { /* TTS 錯誤不影響主流程 */ }

  // hook:timing — 記錄 SubagentStop 執行耗時
  hookTimer.emit(sessionId, 'on-stop', 'SubagentStop', { agent: agentName, verdict: result.verdict });

  return { output: { result: buildResult.messages.join('\n') } };
}

/**
 * 計算最近一次 commit 的影響範圍摘要
 * 用於 DEV PASS 後提醒 Main Agent 同步相關元件
 * @param {string} projectRoot - 專案根目錄
 * @returns {string} 影響範圍摘要字串
 */
function _computeImpactSummary(projectRoot) {
  // 取得最近一次 commit 修改的檔案清單
  let changedFiles = [];
  try {
    const stdout = execSync('git diff --name-only HEAD~1', {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    changedFiles = stdout.trim().split('\n').filter(Boolean);
  } catch {
    // git 命令失敗（如沒有前一個 commit）→ 靜默降級
    return null;
  }

  if (changedFiles.length === 0) return null;

  const fileCount = changedFiles.length;
  const lines = [];

  // 對 plugin 相關檔案查詢受影響元件
  // 支援兩種路徑格式：
  //   1. 開發環境（git diff 輸出）：plugins/overtone/agents/xxx.md
  //   2. 全域環境（~/.claude/ 下）：agents/xxx.md（無 plugins/overtone/ 前綴）
  const PLUGIN_SUBTREE = 'plugins/overtone/';
  const pluginFiles = changedFiles.filter(f =>
    f.includes(PLUGIN_SUBTREE) ||
    /^(agents|skills|hooks|commands|scripts\/lib)\//.test(f)
  );
  const impactedEntries = [];

  if (pluginFiles.length > 0) {
    try {
      const path = require('path');
      const { buildGraph } = require('./dependency-graph');
      // pluginRoot 從此模組位置推算（scripts/lib/ 的上兩層）
      const pluginRoot = path.resolve(__dirname, '..', '..');
      const graph = buildGraph(pluginRoot);

      for (const relPath of pluginFiles) {
        // 統一轉為相對於 pluginRoot 的路徑（去掉 plugins/overtone/ 前綴）
        const pluginRelPath = relPath.includes(PLUGIN_SUBTREE)
          ? relPath.replace(/^.*plugins\/overtone\//, '')
          : relPath;
        const impacted = graph.getImpacted(pluginRelPath);
        for (const item of impacted) {
          impactedEntries.push({ source: pluginRelPath, file: item.file });
        }
      }
    } catch { /* 靜默 — dependency-graph 失敗不影響其餘邏輯 */ }
  }

  lines.push(`修改了 ${fileCount} 個檔案。`);

  if (impactedEntries.length > 0) {
    lines.push('以下元件可能需要同步更新：');
    // 去重（同一個 file 可能被多個 source 影響）
    const seen = new Set();
    for (const { source, file } of impactedEntries) {
      const key = file;
      if (!seen.has(key)) {
        seen.add(key);
        lines.push(`- ${file}（被 ${source} 影響）`);
      }
    }
  }

  lines.push('💡 建議在 REVIEW 前執行 `bun scripts/impact.js <path>` 確認完整影響範圍');
  lines.push('💡 檢查是否有 hardcoded 數值（如計數、路徑、常數）需要同步更新');

  return lines.join('\n');
}

/**
 * 從 PM agent 輸出解析執行佇列表格
 * 格式：| # | 名稱 | Workflow | 說明 |
 * @param {string} text - agent 輸出文字
 * @returns {Array<{name: string, workflow: string}>}
 */
function _parseQueueTable(text) {
  // 搜尋以「執行佇列」開頭的區塊，然後匹配 Markdown 表格行
  const lines = text.split('\n');
  let inQueue = false;
  let headerPassed = false;
  const items = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // 偵測佇列區塊開始（支援多種標記格式）
    if (/執行佇列/.test(trimmed)) {
      inQueue = true;
      headerPassed = false;
      continue;
    }

    if (!inQueue) continue;

    // 跳過表頭行（含 # | 名稱 | Workflow）
    if (/\|\s*#\s*\|/.test(trimmed)) {
      continue;
    }

    // 跳過分隔行 |---|
    if (/^\|[\s\-|]+\|$/.test(trimmed)) {
      headerPassed = true;
      continue;
    }

    // 資料行：| 1 | name | workflow | desc |
    if (headerPassed && trimmed.startsWith('|')) {
      const cells = trimmed.split('|').map(c => c.trim()).filter(Boolean);
      if (cells.length >= 3) {
        const name = cells[1];
        const workflow = cells[2];
        if (name && workflow && !/^[-\s]+$/.test(name)) {
          items.push({ name, workflow });
        }
      }
      continue;
    }

    // 非表格行且已經在佇列區塊 → 結束
    if (headerPassed && !trimmed.startsWith('|') && trimmed.length > 0) {
      break;
    }
  }

  return items;
}

module.exports = { handleAgentStop, _parseQueueTable, _computeImpactSummary };
