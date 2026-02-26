#!/usr/bin/env node
'use strict';
/**
 * specs-backlog.js — 在 backlog 建立新 feature
 *
 * 用法：node specs-backlog.js <featureName> <workflowType>
 */

const specs = require('./lib/specs');
const { workflows } = require('./lib/registry');

const featureName = process.argv[2];
const workflowType = process.argv[3];

if (!featureName || !workflowType) {
  process.stderr.write('Usage: node specs-backlog.js <featureName> <workflowType>\n');
  process.stderr.write('  <featureName>  : kebab-case 名稱（如 add-user-auth）\n');
  process.stderr.write(`  <workflowType> : ${Object.keys(workflows).join(' | ')}\n`);
  process.exit(1);
}

if (!workflows[workflowType]) {
  process.stderr.write(`錯誤：未知的 workflow 類型：${workflowType}\n`);
  process.stderr.write(`可用類型：${Object.keys(workflows).join(', ')}\n`);
  process.exit(1);
}

const projectRoot = process.cwd();

try {
  const destPath = specs.createBacklog(projectRoot, featureName, workflowType);
  console.log(`✅ Backlog feature '${featureName}' 已建立`);
  console.log(`   路徑：specs/features/backlog/${featureName}/`);
  console.log(`   Workflow：${workflowType}`);
} catch (err) {
  process.stderr.write(`錯誤：${err.message}\n`);
  process.exit(1);
}
