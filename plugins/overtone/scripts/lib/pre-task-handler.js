'use strict';
/**
 * pre-task-handler.js — PreToolUse(Task) hook 業務邏輯處理器
 *
 * 薄殼模式：hook 只做 I/O，handler 做所有業務邏輯。
 *
 * 職責：
 *   ✅ 辨識目標 agent（subagent_type 優先 + fallback）
 *   ✅ 檢查跳過必要前置階段
 *   ✅ 記錄 agent 委派狀態（state + statusline + timeline）
 *   ✅ 組裝 updatedInput（注入 workflow context + skill + gap + globalObs + score + failure + testIndex）
 *   ❌ 不呼叫 process.exit()
 *   ❌ 不讀取 stdin / 不寫 stdout
 */

const path = require('path');
const state = require('./state');
const { stages, parallelGroups, globalInstinctDefaults, scoringConfig } = require('./registry');
const identifyAgent = require('./identify-agent');
const { buildWorkflowContext, buildSkillContext, getSessionId, getStageByAgent } = require('./hook-utils');
const { buildTestIndex } = require('../test-index');
const { detectKnowledgeGaps } = require('./knowledge-gap-detector');
const { createHookTimer } = require('./hook-timing');

/**
 * 檢查目標 stage 之前是否有未完成的必要前置階段
 * @param {object|null} currentState - workflow 狀態物件（含 stages 屬性）
 * @param {string} targetStage - 目標 stage 名稱（如 "DEV"）
 * @param {object} stagesDef - stages 定義物件（registry 的 stages）
 * @returns {string[]} 被跳過的 stage 描述字串陣列（空陣列表示無跳過）
 */
function checkSkippedStages(currentState, targetStage, stagesDef) {
  if (!currentState || !currentState.stages) return [];
  if (!targetStage) return [];

  const stageKeys = Object.keys(currentState.stages);
  const targetIdx = stageKeys.findIndex((k) => {
    const base = k.split(':')[0];
    return base === targetStage;
  });

  // targetIdx <= 0 時（第一個 stage 或找不到），回傳空陣列
  if (targetIdx <= 0) return [];

  const skippedStages = [];
  for (let i = 0; i < targetIdx; i++) {
    const key = stageKeys[i];
    const stageState = currentState.stages[key];

    // 已完成或已在執行中的不算跳過
    if (stageState.status === 'completed' || stageState.status === 'active') {
      continue;
    }

    // pending 的前置階段 = 被跳過
    const base = key.split(':')[0];
    const def = stagesDef[base];
    if (def) {
      skippedStages.push(`${def.emoji} ${def.label}（${key}）`);
    }
  }

  return skippedStages;
}

/**
 * 處理 PreToolUse(Task) hook 的核心業務邏輯
 *
 * @param {object} input - hook input 物件（已從 stdin 解析）
 * @param {string} [sessionIdOverride] - 可選，覆寫從 input 取得的 sessionId（主要供測試用）
 * @returns {{ output: object }} 結構化結果，output 可直接序列化為 JSON 輸出
 */
function handlePreTask(input, sessionIdOverride) {
  const sessionId = sessionIdOverride || getSessionId(input);
  const hookTimer = createHookTimer();

  // ── 取得 Task 工具參數 ──

  const toolInput = input.tool_input || {};

  // 無 session → 不擋
  if (!sessionId) {
    return { output: { result: '' } };
  }

  const currentState = state.readState(sessionId);
  if (!currentState) {
    return { output: { result: '' } };
  }

  // ── 辨識目標 agent（L1：優先使用 subagent_type 確定性映射）──

  // L1：subagent_type 直接映射（確定性，零誤判）
  // 格式：ot:<agentName>（如 ot:developer、ot:planner）
  const subagentType = (toolInput.subagent_type || '').trim();
  let targetAgent = null;

  if (subagentType.startsWith('ot:')) {
    const candidate = subagentType.slice(3);
    const isKnown = Object.values(stages).some((d) => d.agent === candidate);
    if (isKnown) {
      targetAgent = candidate;
    }
  }

  // L3：衝突偵測（subagent_type vs identifyAgent）
  // 若兩者不一致，emit timeline warning 供事後分析
  if (targetAgent && subagentType.startsWith('ot:')) {
    const description = (toolInput.description || '').toLowerCase();
    const prompt = (toolInput.prompt || '').toLowerCase();
    const regexResult = identifyAgent(description, prompt);
    if (regexResult && regexResult !== targetAgent) {
      const timeline = require('./timeline');
      timeline.emit(sessionId, 'system:warning', {
        type: 'identify-agent-conflict',
        subagentType: targetAgent,
        regexResult: regexResult,
        description: toolInput.description,
      });
    }
  }

  // L1 fallback：從 desc/prompt 識別（非 ot: 前綴場景）
  if (!targetAgent) {
    const description = (toolInput.description || '').toLowerCase();
    const prompt = (toolInput.prompt || '').toLowerCase();
    targetAgent = identifyAgent(description, prompt);
  }

  if (!targetAgent) {
    // 無法辨識 → 不擋（可能是非 Overtone agent）
    return { output: { result: '' } };
  }

  // 找到此 agent 對應的 stage
  const targetStage = getStageByAgent(targetAgent, stages);

  if (!targetStage) {
    return { output: { result: '' } };
  }

  // ── 檢查是否跳過必要前置階段 ──

  const stageKeys = Object.keys(currentState.stages);
  const skippedStages = checkSkippedStages(currentState, targetStage, stages);

  // 輔助：emit hook:timing（只在有 sessionId 時才寫入，失敗不影響 hook 功能）
  const emitPreTaskTiming = (extra = {}) =>
    hookTimer.emit(sessionId, 'pre-task', 'PreToolUse', { agent: targetAgent, ...extra });

  if (skippedStages.length > 0) {
    // 有被跳過的必要階段 → 阻擋
    const message = [
      `⛔ 不可跳過必要階段！`,
      `目標：${stages[targetStage].emoji} ${stages[targetStage].label}`,
      `尚未完成的前置階段：`,
      ...skippedStages.map((s) => `  - ${s}`),
      '',
      '請先完成前置階段再繼續。',
    ].join('\n');

    emitPreTaskTiming({ denied: true });
    return {
      output: {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: message,
        },
      },
    };
  }

  // ── 通過 — 記錄 agent 委派（原子操作：setActiveAgent + updateStage）+ 組裝 updatedInput ──

  const actualKey = stageKeys.find((k) => {
    const base = k.split(':')[0];
    if (base !== targetStage) return false;
    const st = currentState.stages[k];
    // pending → 正常委派；completed + fail/reject → retry 委派
    return st.status === 'pending' || (st.status === 'completed' && (st.result === 'fail' || st.result === 'reject'));
  });

  // 生成 instanceId（agentName:timestamp36-random6）
  const instanceId = `${targetAgent}:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  // 從 prompt 解析 PARALLEL_TOTAL
  const parallelTotalMatch = (toolInput.prompt || '').match(/PARALLEL_TOTAL:\s*(\d+)/);
  const parallelTotal = parallelTotalMatch ? parseInt(parallelTotalMatch[1], 10) : null;

  state.updateStateAtomic(sessionId, (s) => {
    // instanceId 為 key，寫入 agentName 欄位
    s.activeAgents[instanceId] = {
      agentName: targetAgent,
      stage: targetStage,
      startedAt: new Date().toISOString(),
    };
    if (actualKey && s.stages[actualKey]) {
      // retry：清除舊結果，重設為 active
      if (s.stages[actualKey].result === 'fail' || s.stages[actualKey].result === 'reject') {
        delete s.stages[actualKey].result;
        delete s.stages[actualKey].completedAt;
        delete s.stages[actualKey].parallelDone;
        delete s.stages[actualKey].parallelTotal;
      }
      s.stages[actualKey].status = 'active';
      if (parallelTotal !== null && !isNaN(parallelTotal)) {
        // 取 max 防止並行 pre-task race condition
        s.stages[actualKey].parallelTotal = Math.max(s.stages[actualKey].parallelTotal || 0, parallelTotal);
      }
    }
    return s;
  });

  // statusline 狀態：push agent
  const statuslineState = require('./statusline-state');
  statuslineState.update(sessionId, 'agent:start', { stageKey: actualKey || targetStage });

  const timeline = require('./timeline');

  // stage:start — 只在 stage 從 pending 變為 active 時才 emit
  if (actualKey && currentState.stages[actualKey].status === 'pending') {
    timeline.emit(sessionId, 'stage:start', {
      stage: actualKey,
      agent: targetAgent,
    });
  }

  // parallel:start — 當此 stage 是某並行群組中第一個被委派的成員時 emit
  if (actualKey) {
    const base = actualKey.split(':')[0];
    for (const [groupName, members] of Object.entries(parallelGroups)) {
      if (!members.includes(base)) continue;

      // 檢查同群組的其他 stage 是否都還是 pending（即此為第一個被委派的）
      const allStageKeys = Object.keys(currentState.stages);
      const groupStageKeys = allStageKeys.filter((k) => {
        const b = k.split(':')[0];
        return members.includes(b) && k !== actualKey;
      });
      const allOthersPending = groupStageKeys.length > 0
        && groupStageKeys.every((k) => currentState.stages[k].status === 'pending');

      if (allOthersPending) {
        timeline.emit(sessionId, 'parallel:start', {
          group: groupName,
          members,
          firstAgent: targetAgent,
        });
      }
      break;
    }
  }

  timeline.emit(sessionId, 'agent:delegate', {
    agent: targetAgent,
    stage: targetStage,
  });

  // ── 組裝 updatedInput（注入 workflow context + skill context + gap warnings + test-index 摘要）──

  const projectRoot = input.cwd || process.cwd();
  const context = buildWorkflowContext(sessionId, projectRoot);

  // test-index 摘要：只對 tester 和 developer 注入
  const TEST_INDEX_AGENTS = ['tester', 'developer'];
  let testIndexSummary = '';
  if (targetAgent && TEST_INDEX_AGENTS.includes(targetAgent)) {
    const testsDir = path.join(projectRoot, 'tests');
    testIndexSummary = buildTestIndex(testsDir);
  }

  // skill context 注入（try/catch 靜默降級）
  let skillContextStr = null;
  try {
    const pluginRoot = path.join(projectRoot, 'plugins', 'overtone');
    skillContextStr = buildSkillContext(targetAgent, pluginRoot);
  } catch { /* 靜默降級 — skill context 失敗不影響主流程 */ }

  // gap detection（try/catch 靜默降級）
  let gapWarnings = null;
  try {
    const pluginRoot = path.join(projectRoot, 'plugins', 'overtone');
    const agentMdPath = path.join(pluginRoot, 'agents', `${targetAgent}.md`);
    let agentSkills = [];
    try {
      const matter = require('gray-matter');
      const { readFileSync, existsSync } = require('fs');
      if (existsSync(agentMdPath)) {
        const agentContent = readFileSync(agentMdPath, 'utf8');
        const parsed = matter(agentContent);
        agentSkills = Array.isArray(parsed.data.skills) ? parsed.data.skills : [];
      }
    } catch { /* 靜默 */ }

    const originalPromptForGap = toolInput.prompt || '';
    const gaps = detectKnowledgeGaps(originalPromptForGap, agentSkills);
    if (gaps.length > 0) {
      const gapLines = gaps.map(g =>
        `- ${g.domain}（命中詞：${g.matchedKeywords.slice(0, 3).join('、')}）`
      );
      gapWarnings = `[知識缺口提示]\n可能有用的知識 domain（agent 尚未具備）：\n${gapLines.join('\n')}\n建議參考對應的 SKILL.md references。`;
    }
  } catch { /* 靜默降級 — gap detection 失敗不影響主流程 */ }

  // 全域觀察注入 subagent（前 5 條高信心觀察，最多 500 字）
  let globalObsContext = null;
  try {
    const globalInstinct = require('./global-instinct');
    const topObs = globalInstinct.queryGlobal(projectRoot, {
      limit: Math.min(globalInstinctDefaults.loadTopN, 5),
    });
    if (topObs.length > 0) {
      const lines = topObs.map(o => `- [${o.tag}] ${o.action}`);
      const text = lines.join('\n');
      // 限制 500 字避免 prompt 過長
      globalObsContext = `[跨 Session 知識記憶]\n${text.slice(0, 500)}`;
    }
  } catch { /* 靜默降級 — 全域觀察注入失敗不影響主流程 */ }

  // score context 注入（try/catch 靜默降級）
  let scoreContext = null;
  try {
    // 只對 gradedStages 的 agent 注入
    if (scoringConfig && scoringConfig.gradedStages.includes(targetStage)) {
      const scoreEngine = require('./score-engine');
      const summary = scoreEngine.getScoreSummary(projectRoot, targetStage);
      if (summary.sessionCount > 0) {
        // 找最低分維度
        const dims = [
          { name: 'clarity', val: summary.avgClarity },
          { name: 'completeness', val: summary.avgCompleteness },
          { name: 'actionability', val: summary.avgActionability },
        ];
        const lowest = dims.reduce((a, b) => (a.val <= b.val ? a : b));

        scoreContext = [
          `[品質歷史 — ${targetAgent}@${targetStage}（${summary.sessionCount} 筆）]`,
          `  clarity: ${summary.avgClarity.toFixed(2)}/5.0`,
          `  completeness: ${summary.avgCompleteness.toFixed(2)}/5.0`,
          `  actionability: ${summary.avgActionability.toFixed(2)}/5.0`,
          `  overall: ${summary.avgOverall.toFixed(2)}/5.0`,
          summary.avgOverall < scoringConfig.lowScoreThreshold
            ? `⚠️ 歷史平均分偏低，建議特別注意品質。重點提升 ${lowest.name}。`
            : `💡 歷史最低維度：${lowest.name}（${lowest.val.toFixed(2)}），可優先關注。`,
        ].join('\n');
      }
    }
  } catch { /* 靜默降級 — score context 失敗不影響主流程 */ }

  // failure warnings 注入（try/catch 靜默降級）
  let failureWarning = null;
  try {
    const failureTracker = require('./failure-tracker');
    failureWarning = failureTracker.formatFailureWarnings(projectRoot, targetStage);
  } catch { /* 靜默降級 — failure warning 失敗不影響主流程 */ }

  const hasContext = !!context;
  const hasSkillContext = !!skillContextStr;
  const hasGapWarnings = !!gapWarnings;
  const hasTestIndex = !!testIndexSummary;
  const hasScoreContext = !!scoreContext;
  const hasFailureWarning = !!failureWarning;
  const hasGlobalObs = !!globalObsContext;
  // 僅在有 parallelTotal 時注入 PARALLEL INSTANCE 區塊
  const hasParallelInstance = parallelTotal !== null && !isNaN(parallelTotal);

  if (hasContext || hasSkillContext || hasGapWarnings || hasTestIndex || hasScoreContext || hasFailureWarning || hasGlobalObs || hasParallelInstance) {
    const originalPrompt = toolInput.prompt || '';

    // 組裝順序：[PARALLEL INSTANCE] → workflowContext → skillContext → gapWarnings → globalObs → scoreContext → failureWarning → testIndex → originalPrompt
    const parts = [];
    if (hasParallelInstance) {
      parts.push([
        '[PARALLEL INSTANCE]',
        `INSTANCE_ID: ${instanceId}`,
        `PARALLEL_TOTAL: ${parallelTotal}`,
        '（agent 回覆末尾請附上 INSTANCE_ID: ' + instanceId + '）',
      ].join('\n'));
    }
    if (hasContext) {
      parts.push(context);
    }
    if (hasSkillContext) {
      parts.push(skillContextStr);
    }
    if (hasGapWarnings) {
      parts.push(gapWarnings);
    }
    if (hasGlobalObs) {
      parts.push(globalObsContext);
    }
    if (hasScoreContext) {
      parts.push(scoreContext);
    }
    if (hasFailureWarning) {
      parts.push(failureWarning);
    }
    if (hasTestIndex) {
      parts.push(testIndexSummary);
    }
    parts.push(originalPrompt);

    const newPrompt = parts.join('\n\n---\n\n');

    // 📋 MUST 保留所有原始 tool input 欄位（subagent_type 等），只更新 prompt
    const updatedToolInput = { ...toolInput, prompt: newPrompt };
    emitPreTaskTiming();
    return {
      output: {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
          updatedInput: updatedToolInput,
        },
      },
    };
  }

  emitPreTaskTiming();
  return { output: { result: '' } };
}

module.exports = { handlePreTask, checkSkippedStages };
