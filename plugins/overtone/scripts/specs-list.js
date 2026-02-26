#!/usr/bin/env node
'use strict';
/**
 * specs-list.js — 列出所有 feature 及其狀態
 *
 * 用法：node specs-list.js
 */

const { join } = require('path');
const { existsSync } = require('fs');
const specs = require('./lib/specs');

const projectRoot = process.cwd();

const { inProgress, backlog, archived } = specs.listFeatures(projectRoot);

const total = inProgress.length + backlog.length + archived.length;

if (total === 0) {
  console.log('📂 Specs 概覽');
  console.log('');
  console.log('  沒有任何 feature。');
  console.log('');
  console.log('  建立新 feature：node init-workflow.js <workflowType> <sessionId> <featureName>');
  console.log('  建立 backlog：   node specs-backlog.js <featureName> <workflowType>');
  process.exit(0);
}

/**
 * 讀取 feature 的 workflow 類型
 * @param {string} dirPath
 * @returns {string}
 */
function getWorkflow(dirPath) {
  const tasksPath = join(dirPath, 'tasks.md');
  if (!existsSync(tasksPath)) return '';
  const fm = specs.readTasksFrontmatter(tasksPath);
  return fm && fm.workflow ? `[${fm.workflow}]` : '';
}

console.log('📂 Specs 概覽');
console.log('');

// In Progress
console.log(`🟢 In Progress (${inProgress.length})`);
if (inProgress.length === 0) {
  console.log('  （無）');
} else {
  for (const name of inProgress) {
    const dirPath = join(projectRoot, 'specs', 'features', 'in-progress', name);
    const wf = getWorkflow(dirPath);

    // 讀取 checkbox 完成度
    const tasksPath = join(dirPath, 'tasks.md');
    const cb = existsSync(tasksPath) ? specs.readTasksCheckboxes(tasksPath) : null;
    const progress = cb && cb.total > 0 ? ` (${cb.checked}/${cb.total} tasks)` : '';

    console.log(`  • ${name} ${wf}${progress}`);
  }
}

console.log('');

// Backlog
console.log(`🟡 Backlog (${backlog.length})`);
if (backlog.length === 0) {
  console.log('  （無）');
} else {
  for (const name of backlog) {
    const dirPath = join(projectRoot, 'specs', 'features', 'backlog', name);
    const wf = getWorkflow(dirPath);
    console.log(`  • ${name} ${wf}`);
  }
}

console.log('');

// Archived
console.log(`⬛ Archived (${archived.length})`);
if (archived.length === 0) {
  console.log('  （無）');
} else {
  for (const name of archived) {
    console.log(`  • ${name}`);
  }
}

console.log('');
