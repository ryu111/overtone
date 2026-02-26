#!/usr/bin/env node
'use strict';
/**
 * specs-resume.js — 恢復 feature（backlog → in-progress）
 *
 * 用法：node specs-resume.js <featureName>
 */

const { join } = require('path');
const { existsSync, mkdirSync } = require('fs');
const specs = require('./lib/specs');

const featureName = process.argv[2];

if (!featureName) {
  process.stderr.write('Usage: node specs-resume.js <featureName>\n');
  process.stderr.write('  將 backlog feature 恢復至 in-progress\n');
  process.exit(1);
}

const projectRoot = process.cwd();
const srcPath = specs.backlogFeaturePath(projectRoot, featureName);

// 確認在 backlog
if (!existsSync(srcPath)) {
  process.stderr.write(`錯誤：Feature '${featureName}' 不在 backlog 中\n`);
  process.exit(1);
}

// 檢查是否已有其他 in-progress feature（警告不阻擋）
const existing = specs.listFeatures(projectRoot).inProgress;
if (existing.length > 0) {
  console.warn(`⚠️  警告：已有其他 in-progress feature（${existing.join(', ')}）`);
  console.warn('   同時有多個 in-progress feature 可能造成混亂，建議先暫停現有 feature。');
  console.warn('   繼續執行...');
}

const destPath = specs.featurePath(projectRoot, featureName);

try {
  mkdirSync(specs.inProgressDir(projectRoot), { recursive: true });
  specs.moveDir(srcPath, destPath);

  // 更新 frontmatter
  const tasksPath = join(destPath, 'tasks.md');
  if (existsSync(tasksPath)) {
    specs.updateTasksFrontmatter(tasksPath, { status: 'in-progress' });
  }

  console.log(`✅ Feature '${featureName}' 已恢復至 in-progress`);
  console.log(`   路徑：specs/features/in-progress/${featureName}/`);
} catch (err) {
  process.stderr.write(`錯誤：${err.message}\n`);
  process.exit(1);
}
