#!/usr/bin/env node
'use strict';
/**
 * impact.js — 依賴圖 CLI 入口
 *
 * 用法：bun scripts/impact.js <path> [--deps] [--json]
 *
 *   <path>    查詢路徑（相對於 plugin root 或絕對路徑）
 *   --deps    顯示正向依賴（getDependencies），預設顯示受影響元件（getImpacted）
 *   --json    JSON 格式輸出
 */

const { join, resolve, relative } = require('path');
const { buildGraph } = require('./lib/dependency-graph');

// ── 參數解析 ──

const args = process.argv.slice(2);
const flags = args.filter(a => a.startsWith('--'));
const positional = args.filter(a => !a.startsWith('--'));
const inputPath = positional[0];
const showDeps = flags.includes('--deps');
const jsonOutput = flags.includes('--json');

if (!inputPath) {
  process.stderr.write('用法：bun scripts/impact.js <path> [--deps] [--json]\n');
  process.stderr.write('\n');
  process.stderr.write('  <path>    查詢路徑（相對於 plugin root 或絕對路徑）\n');
  process.stderr.write('  --deps    顯示正向依賴\n');
  process.stderr.write('  --json    JSON 格式輸出\n');
  process.exit(1);
}

// ── pluginRoot 偵測 ──
// impact.js 位於 plugins/overtone/scripts/，pluginRoot 為上一層
const pluginRoot = join(__dirname, '..');

// ── 路徑正規化 ──
// 支援三種輸入：
// 1. 相對於 plugin root（skills/testing/SKILL.md）→ 直接使用
// 2. 絕對路徑 → dependency-graph.js 內部會自動轉換
// 3. 相對於 CWD → resolve 後轉 plugin-relative
let queryPath = inputPath;
if (!inputPath.startsWith('/')) {
  const absFromCwd = resolve(process.cwd(), inputPath);
  const relFromPlugin = relative(pluginRoot, absFromCwd);
  if (!relFromPlugin.startsWith('..')) {
    queryPath = relFromPlugin;
  }
}

// ── 執行查詢 ──

let graph;
try {
  graph = buildGraph(pluginRoot);
} catch (err) {
  process.stderr.write(`錯誤：${err.message}\n`);
  process.exit(1);
}

if (showDeps) {
  // --deps 模式：顯示正向依賴
  const deps = graph.getDependencies(queryPath);

  if (jsonOutput) {
    process.stdout.write(JSON.stringify(deps) + '\n');
  } else {
    process.stdout.write(`查詢：${queryPath}\n\n`);
    if (deps.length === 0) {
      process.stdout.write(`依賴（0）\n`);
    } else {
      process.stdout.write(`依賴（${deps.length}）：\n`);
      for (const dep of deps) {
        process.stdout.write(`  ${dep}\n`);
      }
    }
  }
} else {
  // 預設模式：顯示受影響元件
  const result = graph.getImpacted(queryPath);

  if (jsonOutput) {
    process.stdout.write(JSON.stringify(result) + '\n');
  } else {
    process.stdout.write(`查詢：${result.path}\n\n`);
    if (result.impacted.length === 0) {
      process.stdout.write(`受影響元件（0）\n`);
    } else {
      process.stdout.write(`受影響元件（${result.impacted.length}）：\n`);
      for (const item of result.impacted) {
        const typeLabel = `[${item.type}]`.padEnd(10);
        process.stdout.write(`  ${typeLabel} ${item.path}`);
        if (item.reason) {
          process.stdout.write(`（${item.reason}）`);
        }
        process.stdout.write('\n');
      }
    }
  }
}
