#!/usr/bin/env node
'use strict';
/**
 * queue.js — 執行佇列 CLI
 *
 * 用法：
 *   bun scripts/queue.js add <name> <workflow> [<name> <workflow> ...]  新增項目（覆寫）
 *   bun scripts/queue.js append <name> <workflow> [...]                 累加到現有佇列
 *   bun scripts/queue.js list                                          列出佇列狀態
 *   bun scripts/queue.js clear                                         清除佇列
 *   bun scripts/queue.js enable-auto                                   啟用自動執行
 *
 * 選項：
 *   --project-root <path>   指定專案根目錄（預設 cwd）
 *   --source <desc>         來源描述（add/append 時使用，預設 "CLI"）
 *   --no-auto               寫入規劃模式佇列（autoExecute: false）
 */

const path = require('path');
const executionQueue = require('./lib/execution-queue');

// ── 子命令 ──

function cmdAdd(projectRoot, pairs, source, options) {
  if (pairs.length === 0 || pairs.length % 2 !== 0) {
    console.error('用法：bun scripts/queue.js add <name> <workflow> [<name> <workflow> ...]');
    process.exit(1);
  }

  const items = [];
  for (let i = 0; i < pairs.length; i += 2) {
    items.push({ name: pairs[i], workflow: pairs[i + 1] });
  }

  const queue = executionQueue.writeQueue(projectRoot, items, source, options);
  const modeLabel = options && options.autoExecute === false ? '（規劃模式）' : '';
  console.log(`✅ 已建立佇列${modeLabel}（${items.length} 項）`);
  for (const item of queue.items) {
    console.log(`  ⬜ ${item.name}（${item.workflow}）`);
  }
}

function cmdAppend(projectRoot, pairs, source, options) {
  if (pairs.length === 0 || pairs.length % 2 !== 0) {
    console.error('用法：bun scripts/queue.js append <name> <workflow> [<name> <workflow> ...]');
    process.exit(1);
  }

  const items = [];
  for (let i = 0; i < pairs.length; i += 2) {
    items.push({ name: pairs[i], workflow: pairs[i + 1] });
  }

  const queue = executionQueue.appendQueue(projectRoot, items, source, options);
  const modeLabel = options && options.autoExecute === false ? '（規劃模式）' : '';
  console.log(`✅ 已加入佇列${modeLabel}（新增 ${items.length} 項，共 ${queue.items.length} 項）`);
  for (const item of items) {
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
  const modeLabel = queue.autoExecute === false ? ' — 📋 規劃模式（手動啟動）' : '';

  console.log(`佇列（${queue.source}）— ${completed}/${queue.items.length} 完成${failed ? `，${failed} 失敗` : ''}${modeLabel}`);
  console.log('');

  for (const item of queue.items) {
    const icon = icons[item.status] || '⬜';
    const extra = item.failReason ? ` — ${item.failReason}` : '';
    console.log(`  ${icon} ${item.name}（${item.workflow}）${extra}`);
  }
}

function cmdEnableAuto(projectRoot) {
  const queue = executionQueue.readQueue(projectRoot);
  if (!queue) {
    console.log('佇列不存在');
    return;
  }

  queue.autoExecute = true;
  const filePath = require('path').join(
    require('./lib/paths').global.dir(projectRoot),
    'execution-queue.json'
  );
  require('./lib/utils').atomicWrite(filePath, queue);
  console.log('✅ 已啟用自動執行');
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

  // 解析 --no-auto
  const noAutoIdx = args.indexOf('--no-auto');
  const options = noAutoIdx !== -1 ? { autoExecute: false } : { autoExecute: true };

  // 過濾掉 option 參數，取得 positional args
  const optionKeys = ['--project-root', '--source', '--no-auto'];
  const positional = args.slice(1).filter((arg, i, arr) => {
    if (optionKeys.includes(arg)) return false;
    if (i > 0 && (arr[i - 1] === '--project-root' || arr[i - 1] === '--source')) return false;
    return true;
  });

  switch (command) {
    case 'add':
      cmdAdd(projectRoot, positional, source, options);
      break;
    case 'append':
      cmdAppend(projectRoot, positional, source, options);
      break;
    case 'list':
      cmdList(projectRoot);
      break;
    case 'clear':
      cmdClear(projectRoot);
      break;
    case 'enable-auto':
      cmdEnableAuto(projectRoot);
      break;
    default:
      console.log('用法：bun scripts/queue.js <add|append|list|clear|enable-auto> [options]');
      console.log('');
      console.log('子命令：');
      console.log('  add <name> <workflow> [...]   新增項目到佇列（覆寫）');
      console.log('  append <name> <workflow> [...] 累加到現有佇列');
      console.log('  list                          列出佇列狀態');
      console.log('  clear                         清除佇列');
      console.log('  enable-auto                   啟用自動執行（規劃模式 → 執行模式）');
      console.log('');
      console.log('選項：');
      console.log('  --project-root <path>   指定專案根目錄（預設 cwd）');
      console.log('  --source <desc>         來源描述（add/append 時使用，預設 "CLI"）');
      console.log('  --no-auto               寫入規劃模式佇列（autoExecute: false）');
      process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, _cmdAdd: cmdAdd, _cmdAppend: cmdAppend, _cmdList: cmdList, _cmdClear: cmdClear, _cmdEnableAuto: cmdEnableAuto };
