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

// ── 從 stdin 讀取 hook input ──

const input = JSON.parse(readFileSync('/dev/stdin', 'utf8'));
const sessionId = process.env.CLAUDE_SESSION_ID || '';

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
    decision: 'block',
    reason: message,
  }));
  process.exit(0);
}

// ── 通過 — 記錄 agent 委派 ──

state.setActiveAgent(sessionId, targetAgent, targetStage);

const timeline = require('../../../scripts/lib/timeline');
timeline.emit(sessionId, 'agent:delegate', {
  agent: targetAgent,
  stage: targetStage,
});

// 更新 stage 狀態為 active
const actualKey = stageKeys.find((k) => {
  const base = k.split(':')[0];
  return base === targetStage && currentState.stages[k].status === 'pending';
});
if (actualKey) {
  state.updateStage(sessionId, actualKey, { status: 'active' });
}

process.stdout.write(JSON.stringify({ result: '' }));

// ── 輔助函式 ──

/**
 * 從 Task 描述/prompt 中識別 Overtone agent
 */
function identifyAgent(desc, prmt) {
  const combined = ` ${desc} ${prmt} `;
  const agentNames = Object.values(stages).map((d) => d.agent);

  // 精確匹配 agent 名稱（完整詞邊界）
  for (const name of agentNames) {
    const pattern = new RegExp(`\\b${name.replace(/-/g, '[-\\s]')}\\b`, 'i');
    if (pattern.test(combined)) return name;
  }

  // 別名匹配（使用 word boundary 避免誤判）
  const aliases = {
    'review(?:er)?': 'code-reviewer',
    'test(?:er|ing)?': 'tester',
    'debug(?:ger|ging)?': 'debugger',
    'plan(?:ner|ning)?': 'planner',
    'architect(?:ure)?': 'architect',
    'design(?:er)?': 'designer',
    'develop(?:er|ment)?': 'developer',
    'security': 'security-reviewer',
    'database|db.?review': 'database-reviewer',
    'e2e': 'e2e-runner',
    'build.?(?:fix|error|resolve)': 'build-error-resolver',
    'refactor|clean.?(?:up|code)': 'refactor-cleaner',
    'doc(?:s|umentation)?\\s*(?:updat|sync)': 'doc-updater',
    '\\bqa\\b': 'qa',
  };

  for (const [pattern, agent] of Object.entries(aliases)) {
    const regex = new RegExp(`\\b${pattern}\\b`, 'i');
    if (regex.test(combined)) return agent;
  }

  return null;
}
