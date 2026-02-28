#!/usr/bin/env node
'use strict';
/**
 * PreToolUse(Task) hook — 擋跳過必要階段
 *
 * 觸發：每次 Main Agent 呼叫 Task 工具時
 * 職責：
 *   ✅ 檢查是否跳過了 workflow 中必要的前置階段
 *   ❌ 不擋順序調整（Main Agent 可能有好理由）
 *   ❌ 不擋 Main Agent 自己寫碼（由 Skill 引導）
 *
 * 決策 1.4：只擋「跳過必要階段」
 */

const state = require('../../../scripts/lib/state');
const { stages } = require('../../../scripts/lib/registry');
const identifyAgent = require('../../../scripts/lib/identify-agent');
const { safeReadStdin, safeRun } = require('../../../scripts/lib/hook-utils');

safeRun(() => {
  // ── 從 stdin 讀取 hook input ──

  const input = safeReadStdin();
  const sessionId = input.session_id || process.env.CLAUDE_SESSION_ID || '';

  // ── 取得 Task 工具參數 ──

  const toolInput = input.tool_input || {};

  // 無 session → 不擋
  if (!sessionId) {
    process.stdout.write(JSON.stringify({ result: '' }));
    process.exit(0);
  }

  const currentState = state.readState(sessionId);
  if (!currentState) {
    process.stdout.write(JSON.stringify({ result: '' }));
    process.exit(0);
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
      const timeline = require('../../../scripts/lib/timeline');
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
    process.stdout.write(JSON.stringify({ result: '' }));
    process.exit(0);
  }

  // 找到此 agent 對應的 stage
  const targetStage = Object.entries(stages).find(
    ([, def]) => def.agent === targetAgent
  )?.[0];

  if (!targetStage) {
    process.stdout.write(JSON.stringify({ result: '' }));
    process.exit(0);
  }

  // ── 檢查是否跳過必要前置階段 ──

  const stageKeys = Object.keys(currentState.stages);
  const targetIdx = stageKeys.findIndex((k) => {
    const base = k.split(':')[0];
    return base === targetStage;
  });

  if (targetIdx <= 0) {
    // 第一個 stage 或找不到 → 不擋
    process.stdout.write(JSON.stringify({ result: '' }));
    process.exit(0);
  }

  // 檢查目標 stage 之前是否有未完成的必要階段
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
    const def = stages[base];
    if (def) {
      skippedStages.push(`${def.emoji} ${def.label}（${key}）`);
    }
  }

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

    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: message,
      },
    }));
    process.exit(0);
  }

  // ── 通過 — 記錄 agent 委派（原子操作：setActiveAgent + updateStage）──

  const actualKey = stageKeys.find((k) => {
    const base = k.split(':')[0];
    return base === targetStage && currentState.stages[k].status === 'pending';
  });

  state.updateStateAtomic(sessionId, (s) => {
    s.activeAgents[targetAgent] = {
      stage: targetStage,
      startedAt: new Date().toISOString(),
    };
    if (actualKey && s.stages[actualKey]) {
      s.stages[actualKey].status = 'active';
    }
    return s;
  });

  const timeline = require('../../../scripts/lib/timeline');
  timeline.emit(sessionId, 'agent:delegate', {
    agent: targetAgent,
    stage: targetStage,
  });

  process.stdout.write(JSON.stringify({ result: '' }));
  process.exit(0);
}, { result: '' });
