#!/usr/bin/env node
'use strict';
/**
 * queue.js — 執行佇列 CLI
 *
 * 用法：
 *   bun scripts/queue.js add <name> <workflow> [<name> <workflow> ...]  新增項目
 *   bun scripts/queue.js list                                          列出佇列狀態
 *   bun scripts/queue.js clear                                         清除佇列
 *
 * 選項：
 *   --project-root <path>   指定專案根目錄（預設 cwd）
 *   --source <desc>         來源描述（add 時使用，預設 "CLI"）
 */

const path = require('path');
const executionQueue = require('./lib/execution-queue');

// ── 子命令 ──

function cmdAdd(projectRoot, pairs, source) {
  if (pairs.length === 0 || pairs.length % 2 !== 0) {
    console.error('用法：bun scripts/queue.js add <name> <workflow> [<name> <workflow> ...]');
    process.exit(1);
  }

  const items = [];
  for (let i = 0; i < pairs.length; i += 2) {
    items.push({ name: pairs[i], workflow: pairs[i + 1] });
  }

  const queue = executionQueue.writeQueue(projectRoot, items, source);
  console.log(`✅ 已建立佇列（${items.length} 項）`);
  for (const item of queue.items) {
    console.log(`  ⬜ ${item.name}（${item.workflow}）`);
  }
}

function cmdList(projectRoot) {
  const queue = executionQueue.readQueue(projectRoot);
  if (!queue || queue.items.length === 0) {
    console.log('佇列為空');
    return;
  }

  const icons = { completed: '✅', in_progress: '🔄', pending: '⬜', failed: '❌' };
  const completed = queue.items.filter(i => i.status === 'completed').length;
  const failed = queue.items.filter(i => i.status === 'failed').length;

  console.log(`佇列（${queue.source}）— ${completed}/${queue.items.length} 完成${failed ? `，${failed} 失敗` : ''}`);
  console.log('');

  for (const item of queue.items) {
    const icon = icons[item.status] || '⬜';
    const extra = item.failReason ? ` — ${item.failReason}` : '';
    console.log(`  ${icon} ${item.name}（${item.workflow}）${extra}`);
  }
}

function cmdClear(projectRoot) {
  executionQueue.clearQueue(projectRoot);
  console.log('✅ 佇列已清除');
}

// ── CLI 入口 ──

function main(argv) {
  const args = argv || process.argv.slice(2);
  const command = args[0];

  // 解析 --project-root
  const prIdx = args.indexOf('--project-root');
  const projectRoot = prIdx !== -1 && args[prIdx + 1]
    ? path.resolve(args[prIdx + 1])
    : process.cwd();

  // 解析 --source
  const srcIdx = args.indexOf('--source');
  const source = srcIdx !== -1 && args[srcIdx + 1]
    ? args[srcIdx + 1]
    : 'CLI';

  // 過濾掉 option 參數，取得 positional args
  const positional = args.slice(1).filter((_, i, arr) => {
    if (arr[i] === '--project-root' || arr[i] === '--source') return false;
    if (i > 0 && (arr[i - 1] === '--project-root' || arr[i - 1] === '--source')) return false;
    return true;
  });

  switch (command) {
    case 'add':
      cmdAdd(projectRoot, positional, source);
      break;
    case 'list':
      cmdList(projectRoot);
      break;
    case 'clear':
      cmdClear(projectRoot);
      break;
    default:
      console.log('用法：bun scripts/queue.js <add|list|clear> [options]');
      console.log('');
      console.log('子命令：');
      console.log('  add <name> <workflow> [...]   新增項目到佇列');
      console.log('  list                          列出佇列狀態');
      console.log('  clear                         清除佇列');
      console.log('');
      console.log('選項：');
      console.log('  --project-root <path>   指定專案根目錄（預設 cwd）');
      console.log('  --source <desc>         來源描述（add 時使用，預設 "CLI"）');
      process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, _cmdAdd: cmdAdd, _cmdList: cmdList, _cmdClear: cmdClear };
