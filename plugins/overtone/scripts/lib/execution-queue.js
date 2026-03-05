#!/usr/bin/env node
'use strict';
/**
 * execution-queue.js — 執行佇列管理
 *
 * PM Discovery 確認的任務序列寫入佇列，
 * workflow 完成後自動推進到下一項，不需要人為確認。
 *
 * 儲存位置：~/.overtone/global/{projectHash}/execution-queue.json
 *
 * 佇列格式：
 * {
 *   items: [{ name, workflow, status, completedAt? }],
 *   autoExecute: true,
 *   source: "PM Discovery 2026-03-03",
 *   createdAt: "..."
 * }
 */

const { readFileSync, existsSync, mkdirSync } = require('fs');
const { dirname } = require('path');
const paths = require('./paths');
const { atomicWrite } = require('./utils');

/**
 * 讀取執行佇列
 * @param {string} projectRoot
 * @returns {object|null} 佇列物件，不存在時回傳 null
 */
function readQueue(projectRoot) {
  const filePath = _queuePath(projectRoot);
  if (!existsSync(filePath)) return null;

  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * 建立或覆寫執行佇列
 * @param {string} projectRoot
 * @param {object[]} items - [{ name, workflow }]
 * @param {string} source - 來源描述（如 "PM Discovery 2026-03-03"）
 * @param {object} [options] - 選項
 * @param {boolean} [options.autoExecute=true] - 是否自動執行
 * @returns {object} 寫入的佇列
 */
function writeQueue(projectRoot, items, source, options) {
  const autoExecute = options && options.autoExecute === false ? false : true;
  const queue = {
    items: items.map(item => ({
      name: item.name,
      workflow: item.workflow,
      status: 'pending',
    })),
    autoExecute,
    source,
    createdAt: new Date().toISOString(),
  };

  const filePath = _queuePath(projectRoot);
  mkdirSync(dirname(filePath), { recursive: true });
  atomicWrite(filePath, queue);

  return queue;
}

/**
 * 累加到現有執行佇列（保留已完成/進行中的項目）
 * @param {string} projectRoot
 * @param {object[]} items - [{ name, workflow }]
 * @param {string} source - 來源描述
 * @param {object} [options] - 選項
 * @param {boolean} [options.autoExecute=true] - 是否自動執行
 * @returns {object} 寫入的佇列
 */
function appendQueue(projectRoot, items, source, options) {
  const existing = readQueue(projectRoot);
  const autoExecute = options && options.autoExecute === false ? false : true;

  const newItems = items.map(item => ({
    name: item.name,
    workflow: item.workflow,
    status: 'pending',
  }));

  const queue = existing
    ? {
        ...existing,
        items: [...existing.items, ...newItems],
        autoExecute,
        source,
      }
    : {
        items: newItems,
        autoExecute,
        source,
        createdAt: new Date().toISOString(),
      };

  const filePath = _queuePath(projectRoot);
  mkdirSync(dirname(filePath), { recursive: true });
  atomicWrite(filePath, queue);

  return queue;
}

/**
 * 取得佇列中下一個待執行項目
 * @param {string} projectRoot
 * @returns {{ item: object, index: number }|null}
 */
function getNext(projectRoot) {
  const queue = readQueue(projectRoot);
  if (!queue || !queue.autoExecute) return null;

  const index = queue.items.findIndex(i => i.status === 'pending');
  if (index === -1) return null;

  return { item: queue.items[index], index };
}

/**
 * 取得目前正在執行的項目
 * @param {string} projectRoot
 * @returns {{ item: object, index: number }|null}
 */
function getCurrent(projectRoot) {
  const queue = readQueue(projectRoot);
  if (!queue) return null;

  const index = queue.items.findIndex(i => i.status === 'in_progress');
  if (index === -1) return null;

  return { item: queue.items[index], index };
}

/**
 * 將下一個待執行項目標記為 in_progress
 * @param {string} projectRoot
 * @returns {{ item: object, index: number }|null}
 */
function advanceToNext(projectRoot) {
  const queue = readQueue(projectRoot);
  if (!queue || !queue.autoExecute) return null;

  const index = queue.items.findIndex(i => i.status === 'pending');
  if (index === -1) return null;

  queue.items[index].status = 'in_progress';
  queue.items[index].startedAt = new Date().toISOString();

  const filePath = _queuePath(projectRoot);
  atomicWrite(filePath, queue);

  return { item: queue.items[index], index };
}

/**
 * 將目前正在執行的項目標記為完成
 * @param {string} projectRoot
 * @param {string} [name] - 項目名稱（可選，用於驗證）
 * @returns {boolean} 是否成功標記
 */
function completeCurrent(projectRoot, name) {
  const queue = readQueue(projectRoot);
  if (!queue) return false;

  const index = queue.items.findIndex(i => i.status === 'in_progress');
  if (index === -1) return false;

  if (name && queue.items[index].name !== name) return false;

  queue.items[index].status = 'completed';
  queue.items[index].completedAt = new Date().toISOString();

  const filePath = _queuePath(projectRoot);
  atomicWrite(filePath, queue);

  return true;
}

/**
 * 將目前正在執行的項目標記為失敗
 * @param {string} projectRoot
 * @param {string} [reason] - 失敗原因描述（可選）
 * @returns {boolean} 是否成功標記
 */
function failCurrent(projectRoot, reason) {
  const queue = readQueue(projectRoot);
  if (!queue) return false;

  const index = queue.items.findIndex(i => i.status === 'in_progress');
  if (index === -1) return false;

  queue.items[index].status = 'failed';
  queue.items[index].failedAt = new Date().toISOString();
  if (reason) queue.items[index].failReason = reason;

  const filePath = _queuePath(projectRoot);
  atomicWrite(filePath, queue);
  return true;
}

/**
 * 取得佇列摘要（用於 SessionStart systemMessage 注入）
 * @param {string} projectRoot
 * @returns {string} 摘要文字，無佇列時回傳空字串
 */
function formatQueueSummary(projectRoot) {
  const queue = readQueue(projectRoot);
  if (!queue || queue.items.length === 0) return '';

  const completed = queue.items.filter(i => i.status === 'completed').length;
  const total = queue.items.length;
  const current = queue.items.find(i => i.status === 'in_progress');
  const next = queue.items.find(i => i.status === 'pending');

  const planMode = queue.autoExecute === false ? '📋 規劃模式（手動啟動）' : null;
  const lines = [`## 執行佇列（${queue.source}）`, ''];

  if (planMode) {
    lines.push(planMode);
    lines.push('');
  }

  for (const item of queue.items) {
    const icon = item.status === 'completed' ? '✅' : item.status === 'in_progress' ? '🔄' : '⬜';
    lines.push(`${icon} ${item.name}（${item.workflow}）`);
  }

  lines.push('');
  lines.push(`進度：${completed}/${total}`);

  if (current) {
    lines.push(`目前：${current.name}`);
  }

  if (next && !current) {
    lines.push('');
    lines.push(`⛔ 下一項：${next.name}（${next.workflow}）— 直接開始，不要詢問使用者`);
  }

  return lines.join('\n');
}

/**
 * 清除佇列（所有項目完成後或手動清除）
 * @param {string} projectRoot
 */
function clearQueue(projectRoot) {
  const filePath = _queuePath(projectRoot);
  try {
    if (existsSync(filePath)) {
      require('fs').unlinkSync(filePath);
    }
  } catch {
    // 靜默失敗
  }
}

// ── 內部工具 ──

function _queuePath(projectRoot) {
  return require('path').join(
    paths.global.dir(projectRoot),
    'execution-queue.json'
  );
}

module.exports = {
  readQueue,
  writeQueue,
  appendQueue,
  getNext,
  getCurrent,
  advanceToNext,
  completeCurrent,
  failCurrent,
  formatQueueSummary,
  clearQueue,
};
