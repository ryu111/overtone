#!/usr/bin/env node
'use strict';
/**
 * init-workflow.js — 初始化 workflow 狀態
 *
 * 用法：node init-workflow.js <workflowType> <sessionId>
 *
 * 從 registry.js 取得 workflow 的 stage 清單，
 * 呼叫 state.initState() 建立 workflow.json，
 * 並 emit workflow:start timeline 事件。
 */

const { workflows } = require('./lib/registry');
const state = require('./lib/state');
const timeline = require('./lib/timeline');

const [workflowType, sessionId] = process.argv.slice(2);

if (!workflowType || !sessionId) {
  console.error('用法：node init-workflow.js <workflowType> <sessionId>');
  process.exit(1);
}

const workflow = workflows[workflowType];
if (!workflow) {
  console.error(`未知的 workflow 類型：${workflowType}`);
  console.error(`可用類型：${Object.keys(workflows).join(', ')}`);
  process.exit(1);
}

// 初始化 workflow 狀態
const newState = state.initState(sessionId, workflowType, workflow.stages);

// 記錄 timeline 事件
timeline.emit(sessionId, 'workflow:start', {
  workflowType,
  stages: workflow.stages,
});

// 輸出結果
const stageLabels = Object.keys(newState.stages).join(' → ');
console.log(`✅ 工作流已初始化：${workflow.label}（${workflowType}）`);
console.log(`📋 Stages：${stageLabels}`);
