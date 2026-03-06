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
const state = require('./lib/state');

// ── Discovery 模式守衛 ──

/**
 * 檢查當前 workflow 是否為 discovery 模式
 * Discovery 模式下不允許自動寫入佇列（需 --force）
 */
function guardDiscoveryMode(forceFlag) {
  if (forceFlag) return; // --force 跳過檢查
  const sessionId = process.env.CLAUDE_SESSION_ID;
  if (!sessionId) return; // 非 session 環境不檢查
  const wf = state.readState(sessionId);
  if (wf && wf.workflowType === 'discovery') {
    console.error('⛔ Discovery 模式下不允許自動寫入佇列。');
    console.error('   使用者尚未確認方向前，佇列寫入必須由 Main Agent 在使用者確認後執行。');
    console.error('   如需強制寫入，請加上 --force 旗標。');
    process.exit(1);
  }
}

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
  if (!executionQueue.setAutoExecute(projectRoot, true)) {
    console.log('佇列不存在');
    return;
  }
  console.log('✅ 已啟用自動執行');
}

function cmdClear(projectRoot) {
  executionQueue.clearQueue(projectRoot);
  console.log('✅ 佇列已清除');
}

function cmdDedup(projectRoot) {
  const { removed, queue } = executionQueue.dedup(projectRoot);
  if (queue === null) {
    console.log('佇列為空');
    return;
  }
  if (removed === 0) {
    console.log('✅ 無重複項目');
  } else {
    console.log(`✅ 已移除 ${removed} 個重複項目（剩餘 ${queue.items.length} 項）`);
    for (const item of queue.items) {
      const icons = { completed: '✅', in_progress: '🔄', pending: '⬜', failed: '❌' };
      const icon = icons[item.status] || '⬜';
      console.log(`  ${icon} ${item.name}（${item.workflow}）`);
    }
  }
}

function cmdInsert(projectRoot, positional, flags) {
  if (positional.length < 2) {
    console.error('用法：bun scripts/queue.js insert <name> <workflow> --before <anchor> | --after <anchor>');
    process.exit(1);
  }

  const name = positional[0];
  const workflow = positional[1];
  const before = flags['--before'];
  const after = flags['--after'];

  if (before && after) {
    console.error('錯誤：--before 和 --after 互斥，只能指定其中一個');
    process.exit(1);
  }

  if (!before && !after) {
    console.error('錯誤：必須指定 --before <anchor> 或 --after <anchor>');
    process.exit(1);
  }

  const anchor = before || after;
  const position = before ? 'before' : 'after';

  const result = executionQueue.insertItem(projectRoot, name, workflow, anchor, position);

  if (!result.ok) {
    console.log(_formatError(result, name, anchor));
    process.exit(1);
  }

  console.log(`✅ 已插入項目：${name}（${workflow}）— ${position} ${anchor}`);
}

function cmdRemove(projectRoot, positional) {
  if (positional.length < 1) {
    console.error('用法：bun scripts/queue.js remove <name>');
    process.exit(1);
  }

  const name = positional[0];
  const result = executionQueue.removeItem(projectRoot, name);

  if (!result.ok) {
    console.log(_formatError(result, name));
    process.exit(1);
  }

  console.log(`✅ 已刪除項目：${name}`);
}

function cmdMove(projectRoot, positional, flags) {
  if (positional.length < 1) {
    console.error('用法：bun scripts/queue.js move <name> --before <anchor> | --after <anchor>');
    process.exit(1);
  }

  const name = positional[0];
  const before = flags['--before'];
  const after = flags['--after'];

  if (before && after) {
    console.error('錯誤：--before 和 --after 互斥，只能指定其中一個');
    process.exit(1);
  }

  if (!before && !after) {
    console.error('錯誤：必須指定 --before <anchor> 或 --after <anchor>');
    process.exit(1);
  }

  const anchor = before || after;
  const position = before ? 'before' : 'after';

  const result = executionQueue.moveItem(projectRoot, name, anchor, position);

  if (!result.ok) {
    console.log(_formatError(result, name, anchor));
    process.exit(1);
  }

  console.log(`✅ 已移動項目：${name} — ${position} ${anchor}`);
}

function cmdInfo(projectRoot, positional) {
  if (positional.length < 1) {
    console.error('用法：bun scripts/queue.js info <name>');
    process.exit(1);
  }

  const name = positional[0];
  const result = executionQueue.getItem(projectRoot, name);

  if (!result.ok) {
    console.log(_formatError(result, name));
    process.exit(1);
  }

  const { item, index } = result;
  const icons = { completed: '✅', in_progress: '🔄', pending: '⬜', failed: '❌' };
  const icon = icons[item.status] || '⬜';

  console.log(`${icon} ${item.name}（${item.workflow}）— 位置 #${index + 1}`);
  console.log(`  status:    ${item.status}`);
  if (item.startedAt) console.log(`  startedAt: ${item.startedAt}`);
  if (item.completedAt) console.log(`  completedAt: ${item.completedAt}`);
  if (item.failedAt) console.log(`  failedAt:  ${item.failedAt}`);
  if (item.failReason) console.log(`  failReason: ${item.failReason}`);
}

function cmdRetry(projectRoot, positional) {
  if (positional.length < 1) {
    console.error('用法：bun scripts/queue.js retry <name>');
    process.exit(1);
  }

  const name = positional[0];
  const result = executionQueue.retryItem(projectRoot, name);

  if (!result.ok) {
    console.log(_formatError(result, name));
    process.exit(1);
  }

  console.log(`✅ 已重設項目為 pending：${name}`);
}

function _formatError(result, name, anchor) {
  switch (result.error) {
    case 'QUEUE_NOT_FOUND':
      return '佇列不存在';
    case 'ITEM_NOT_FOUND':
      return `找不到項目：${name}`;
    case 'ANCHOR_NOT_FOUND':
      return `找不到定位項目：${anchor}`;
    case 'INVALID_STATUS':
      return `無法操作 ${result.status} 狀態的項目：${name}`;
    case 'IN_PROGRESS_CONFLICT':
      return `目前有項目正在執行中（${result.conflictName}），請等待完成後再重試`;
    case 'SELF_ANCHOR':
      return `來源和定位項目不可相同：${name}`;
    default:
      return `錯誤：${result.error}`;
  }
}

function cmdSuggestOrder(projectRoot, applyFlag) {
  const { suggested, changed } = executionQueue.suggestOrder(projectRoot);
  if (suggested === null) {
    console.log('佇列為空');
    return;
  }
  if (!changed) {
    console.log('✅ 佇列順序已是最佳排列');
    return;
  }

  console.log('建議排序（由簡到繁）：');
  console.log('');
  for (const item of suggested) {
    const icons = { completed: '✅', in_progress: '🔄', pending: '⬜', failed: '❌' };
    const icon = icons[item.status] || '⬜';
    console.log(`  ${icon} ${item.name}（${item.workflow}）`);
  }

  if (applyFlag) {
    executionQueue.applyOrder(projectRoot, suggested);
    console.log('');
    console.log('✅ 已套用建議排序');
  } else {
    console.log('');
    console.log('提示：加上 --apply 旗標可套用此排序');
  }
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

  // 解析 --apply / --force
  const applyFlag = args.includes('--apply');
  const forceFlag = args.includes('--force');

  // 解析 --before 和 --after
  const beforeIdx = args.indexOf('--before');
  const beforeValue = beforeIdx !== -1 && args[beforeIdx + 1] ? args[beforeIdx + 1] : null;
  const afterIdx = args.indexOf('--after');
  const afterValue = afterIdx !== -1 && args[afterIdx + 1] ? args[afterIdx + 1] : null;
  const flags = { '--before': beforeValue, '--after': afterValue };

  // 過濾掉 option 參數，取得 positional args
  const optionKeys = ['--project-root', '--source', '--no-auto', '--apply', '--before', '--after', '--force'];
  const valueOptions = ['--project-root', '--source', '--before', '--after'];
  const positional = args.slice(1).filter((arg, i, arr) => {
    if (optionKeys.includes(arg)) return false;
    if (i > 0 && valueOptions.includes(arr[i - 1])) return false;
    return true;
  });

  switch (command) {
    case 'add':
      guardDiscoveryMode(forceFlag);
      cmdAdd(projectRoot, positional, source, options);
      break;
    case 'append':
      guardDiscoveryMode(forceFlag);
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
    case 'dedup':
      cmdDedup(projectRoot);
      break;
    case 'suggest-order':
      cmdSuggestOrder(projectRoot, applyFlag);
      break;
    case 'insert':
      cmdInsert(projectRoot, positional, flags);
      break;
    case 'remove':
      cmdRemove(projectRoot, positional);
      break;
    case 'move':
      cmdMove(projectRoot, positional, flags);
      break;
    case 'info':
      cmdInfo(projectRoot, positional);
      break;
    case 'retry':
      cmdRetry(projectRoot, positional);
      break;
    default:
      console.log('用法：bun scripts/queue.js <add|append|list|clear|enable-auto|dedup|suggest-order|insert|remove|move|info|retry> [options]');
      console.log('');
      console.log('子命令：');
      console.log('  add <name> <workflow> [...]         新增項目到佇列（覆寫）');
      console.log('  append <name> <workflow> [...]      累加到現有佇列');
      console.log('  list                               列出佇列狀態');
      console.log('  clear                              清除佇列');
      console.log('  enable-auto                        啟用自動執行（規劃模式 → 執行模式）');
      console.log('  dedup                              移除重複項目（name + workflow 相同）');
      console.log('  suggest-order                      顯示建議執行順序（由簡到繁）');
      console.log('  insert <name> <workflow> --before|--after <anchor>  插入新項目到指定位置');
      console.log('  remove <name>                      刪除 pending/failed 項目');
      console.log('  move <name> --before|--after <anchor>  移動項目到指定位置');
      console.log('  info <name>                        查詢項目詳細資訊');
      console.log('  retry <name>                       將 failed 項目重設為 pending');
      console.log('');
      console.log('選項：');
      console.log('  --project-root <path>   指定專案根目錄（預設 cwd）');
      console.log('  --source <desc>         來源描述（add/append 時使用，預設 "CLI"）');
      console.log('  --no-auto               寫入規劃模式佇列（autoExecute: false）');
      console.log('  --apply                 套用建議排序（僅 suggest-order 有效）');
      console.log('  --before <anchor>       在指定項目之前（insert/move 使用）');
      console.log('  --after <anchor>        在指定項目之後（insert/move 使用）');
      console.log('  --force                 強制寫入（跳過 discovery 模式檢查）');
      process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, _cmdAdd: cmdAdd, _cmdAppend: cmdAppend, _cmdList: cmdList, _cmdClear: cmdClear, _cmdEnableAuto: cmdEnableAuto, _cmdDedup: cmdDedup, _cmdSuggestOrder: cmdSuggestOrder, _cmdInsert: cmdInsert, _cmdRemove: cmdRemove, _cmdMove: cmdMove, _cmdInfo: cmdInfo, _cmdRetry: cmdRetry, _formatError };
