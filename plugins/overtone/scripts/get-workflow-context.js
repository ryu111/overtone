#!/usr/bin/env node
'use strict';
/**
 * get-workflow-context.js — 輸出當前 workflow 狀態純文字
 *
 * 供 auto/SKILL.md 中的 !`command` 動態注入使用。
 * 執行環境沒有 CLAUDE_SESSION_ID，從共享文件讀取 sessionId。
 */

const { readFileSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');

// 路徑常數（不 require paths.js，避免相對路徑問題）
const OVERTONE_HOME = join(homedir(), '.overtone');
const CURRENT_SESSION_FILE = join(OVERTONE_HOME, '.current-session-id');

// 讀取 sessionId — !`command` 環境沒有 CLAUDE_SESSION_ID，從共享文件讀取
function readCurrentSessionId() {
  try {
    return readFileSync(CURRENT_SESSION_FILE, 'utf8').trim();
  } catch {
    return '';
  }
}

const sessionId = readCurrentSessionId();

if (!sessionId) {
  process.stdout.write('尚未啟動工作流。\n');
  process.exit(0);
}

// 讀取 workflow state
const state = require('./lib/state');
const ws = state.readState(sessionId);

if (!ws || !ws.currentStage) {
  process.stdout.write('尚未啟動工作流。\n');
  process.exit(0);
}

const { currentStage, stages, workflowType, failCount, rejectCount } = ws;

// 格式化 stage 進度
const stageStatus = Object.entries(stages)
  .map(([k, v]) => {
    const icon = v.status === 'completed' ? '✅' : v.status === 'active' ? '⏳' : '⬜';
    return `${icon} ${k}`;
  })
  .join(' → ');

const lines = [
  `工作流：${workflowType}`,
  `進度：${stageStatus}`,
  `目前階段：${currentStage}`,
];

if (failCount > 0) lines.push(`失敗次數：${failCount}/3`);
if (rejectCount > 0) lines.push(`拒絕次數：${rejectCount}/3`);

// 活躍 feature
try {
  const specs = require('./lib/specs');
  const projectRoot = process.env.CLAUDE_PROJECT_ROOT || process.cwd();
  const active = specs.getActiveFeature(projectRoot);
  if (active) {
    const checked = active.tasks ? active.tasks.checked : 0;
    const total = active.tasks ? active.tasks.total : 0;
    const taskInfo = total > 0 ? `（${checked}/${total} tasks 完成）` : '';
    lines.push(`活躍 Feature：${active.name}${taskInfo}`);
  }
} catch {
  // 靜默忽略，feature 資訊非必要
}

process.stdout.write(lines.join('\n') + '\n');
process.exit(0);
