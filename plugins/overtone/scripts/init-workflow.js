#!/usr/bin/env node
'use strict';
/**
 * init-workflow.js — 初始化 workflow 狀態
 *
 * 用法：node init-workflow.js <workflowType> [sessionId] [featureName]
 *
 * 從 registry.js 取得 workflow 的 stage 清單，
 * 呼叫 state.initState() 建立 workflow.json，
 * 並 emit workflow:start timeline 事件。
 *
 * 若提供 featureName，且 workflow 有對應 specs 設定，
 * 會同時初始化 specs feature 目錄並 emit specs:init 事件。
 *
 * 注意：sessionId 可省略。若省略（或空字串），會嘗試從
 * ~/.overtone/.current-session-id 讀取。
 * 這是為了支援 Skill 中的 Bash 工具呼叫環境（沒有 CLAUDE_SESSION_ID 環境變數）。
 */

const { workflows, specsConfig } = require('./lib/registry');
const state = require('./lib/state');
const timeline = require('./lib/timeline');

let [workflowType, sessionId, featureName] = process.argv.slice(2);

// 若 sessionId 為空，從共享文件讀取（Bash 工具環境無 CLAUDE_SESSION_ID）
if (!sessionId) {
  try {
    const { readFileSync } = require('fs');
    const { CURRENT_SESSION_FILE } = require('./lib/paths');
    sessionId = readFileSync(CURRENT_SESSION_FILE, 'utf8').trim();
  } catch {
    // 找不到共享文件，嘗試 fallback
  }
}

// Fallback：從 sessions/ 目錄找最近有 active workflow 的 session
if (!sessionId) {
  try {
    const { readdirSync, statSync, existsSync } = require('fs');
    const { join } = require('path');
    const { SESSIONS_DIR } = require('./lib/paths');
    if (existsSync(SESSIONS_DIR)) {
      const entries = readdirSync(SESSIONS_DIR)
        .map((name) => ({ name, mtime: statSync(join(SESSIONS_DIR, name)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
      // 取最近修改的 session（最可能是當前 session）
      if (entries.length > 0) sessionId = entries[0].name;
    }
  } catch {
    // 找不到任何 session，sessionId 維持空字串
  }
}

if (!workflowType || !sessionId) {
  console.error('用法：node init-workflow.js <workflowType> [sessionId] [featureName]');
  console.error('注意：sessionId 可省略，會自動從 ~/.overtone/.current-session-id 讀取');
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

// ── 執行佇列推進（pending → in_progress）──
// 只在佇列中沒有 in_progress 項目時才推進（避免重複推進）
try {
  const executionQueue = require('./lib/execution-queue');
  const current = executionQueue.getCurrent(process.cwd());
  if (!current) {
    const next = executionQueue.getNext(process.cwd());
    if (next) {
      executionQueue.advanceToNext(process.cwd());
    }
  }
} catch (err) {
  console.error(`⚠️ 佇列推進失敗：${err.message}`);
}

// 輸出結果
const stageLabels = Object.keys(newState.stages).join(' → ');
console.log(`✅ 工作流已初始化：${workflow.label}（${workflowType}）`);
console.log(`📋 Stages：${stageLabels}`);
if (featureName) {
  console.log(`🏷️  Feature：${featureName}`);
}
