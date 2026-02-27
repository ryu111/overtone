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

const { readFileSync } = require('fs');
const state = require('../../../scripts/lib/state');
const { stages } = require('../../../scripts/lib/registry');
const identifyAgent = require('../../../scripts/lib/identify-agent');

// ── 從 stdin 讀取 hook input ──

const input = JSON.parse(readFileSync('/dev/stdin', 'utf8'));
const sessionId = input.session_id || process.env.CLAUDE_SESSION_ID || '';

// ── 取得 Task 工具參數 ──

const toolInput = input.tool_input || {};
const description = (toolInput.description || '').toLowerCase();
const prompt = (toolInput.prompt || '').toLowerCase();

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

// ── 辨識目標 agent ──

// 從 description 或 prompt 中識別 agent 名稱
const targetAgent = identifyAgent(description, prompt);
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
