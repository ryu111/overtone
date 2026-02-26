#!/usr/bin/env node
'use strict';
/**
 * init-workflow.js — 初始化 workflow 狀態
 *
 * 用法：node init-workflow.js <workflowType> <sessionId> [featureName]
 *
 * 從 registry.js 取得 workflow 的 stage 清單，
 * 呼叫 state.initState() 建立 workflow.json，
 * 並 emit workflow:start timeline 事件。
 *
 * 若提供 featureName，且 workflow 有對應 specs 設定，
 * 會同時初始化 specs feature 目錄並 emit specs:init 事件。
 */

const { workflows, specsConfig } = require('./lib/registry');
const state = require('./lib/state');
const timeline = require('./lib/timeline');

const [workflowType, sessionId, featureName] = process.argv.slice(2);

if (!workflowType || !sessionId) {
  console.error('用法：node init-workflow.js <workflowType> <sessionId> [featureName]');
  process.exit(1);
}

const workflow = workflows[workflowType];
if (!workflow) {
  console.error(`未知的 workflow 類型：${workflowType}`);
  console.error(`可用類型：${Object.keys(workflows).join(', ')}`);
  process.exit(1);
}

// 若提供 featureName，先驗證並初始化 specs feature 目錄
let specsFeaturePath = null;
if (featureName) {
  const specs = require('./lib/specs');

  // 不合法的 featureName 直接中止
  if (!specs.isValidFeatureName(featureName)) {
    console.error(`無效的 feature 名稱：「${featureName}」（必須為 kebab-case，如 add-user-auth）`);
    process.exit(1);
  }

  const workflowSpecs = specsConfig[workflowType] || [];
  if (workflowSpecs.length > 0) {
    const projectRoot = process.cwd();
    try {
      specsFeaturePath = specs.initFeatureDir(projectRoot, featureName, workflowType);
      console.log(`📂 Specs feature 已建立：specs/features/in-progress/${featureName}/`);
    } catch (err) {
      // specs 失敗不阻擋主流程
      process.stderr.write(`⚠️  Specs 初始化警告：${err.message}\n`);
    }
  }
}

// 初始化 workflow 狀態
const newState = state.initState(sessionId, workflowType, workflow.stages, {
  featureName: featureName || null,
});

// 記錄 timeline 事件
timeline.emit(sessionId, 'workflow:start', {
  workflowType,
  stages: workflow.stages,
});

// 若有 specs feature，emit specs:init 事件
if (featureName && specsFeaturePath) {
  timeline.emit(sessionId, 'specs:init', {
    featureName,
    featurePath: specsFeaturePath,
    workflowType,
  });
}

// 輸出結果
const stageLabels = Object.keys(newState.stages).join(' → ');
console.log(`✅ 工作流已初始化：${workflow.label}（${workflowType}）`);
console.log(`📋 Stages：${stageLabels}`);
if (featureName) {
  console.log(`🏷️  Feature：${featureName}`);
}
