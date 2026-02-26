#!/usr/bin/env node
'use strict';
/**
 * specs-pause.js — 暫停 feature（in-progress → backlog）
 *
 * 用法：node specs-pause.js <featureName>
 */

const { join } = require('path');
const { existsSync, mkdirSync } = require('fs');
const specs = require('./lib/specs');

const featureName = process.argv[2];

if (!featureName) {
  process.stderr.write('Usage: node specs-pause.js <featureName>\n');
  process.stderr.write('  暫停 in-progress feature，移至 backlog\n');
  process.exit(1);
}

const projectRoot = process.cwd();
const srcPath = specs.featurePath(projectRoot, featureName);

// 確認在 in-progress
if (!existsSync(srcPath)) {
  process.stderr.write(`錯誤：Feature '${featureName}' 不在 in-progress 中\n`);
  process.exit(1);
}

const destPath = specs.backlogFeaturePath(projectRoot, featureName);

// 確認 backlog 中不存在（允許覆蓋原本的，但為安全起見先警告）
if (existsSync(destPath)) {
  process.stderr.write(`錯誤：Feature '${featureName}' 在 backlog 中已存在\n`);
  process.exit(1);
}

try {
  // 移動目錄
  mkdirSync(specs.backlogDir(projectRoot), { recursive: true });
  specs.moveDir(srcPath, destPath);

  // 更新 frontmatter
  const tasksPath = join(destPath, 'tasks.md');
  if (existsSync(tasksPath)) {
    specs.updateTasksFrontmatter(tasksPath, { status: 'backlog' });
  }

  console.log(`✅ Feature '${featureName}' 已暫停並移至 backlog`);
  console.log(`   路徑：specs/features/backlog/${featureName}/`);
} catch (err) {
  process.stderr.write(`錯誤：${err.message}\n`);
  process.exit(1);
}
