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

  if (next) {
    lines.push('');
    lines.push(`⛔ 下一項：${next.name}（${next.workflow}）— 禁止使用 AskUserQuestion，直接用 init-workflow.js 啟動`);
  }

  return lines.join('\n');
}

/**
 * 設定佇列的 autoExecute 狀態
 * @param {string} projectRoot
 * @param {boolean} value - 新的 autoExecute 值
 * @returns {boolean} 是否成功設定
 */
function setAutoExecute(projectRoot, value) {
  const queue = readQueue(projectRoot);
  if (!queue) return false;

  queue.autoExecute = !!value;
  const filePath = _queuePath(projectRoot);
  atomicWrite(filePath, queue);
  return true;
}

/**
 * 去除佇列中完全重複的項目（name + workflow 皆相同）
 * 保留每組重複項目的第一個，移除後續重複項。
 * 已完成/進行中的項目若與後續項目重複，後續項目會被移除。
 * @param {string} projectRoot
 * @returns {{ removed: number, queue: object|null }} 移除筆數和更新後的佇列
 */
function dedup(projectRoot) {
  const queue = readQueue(projectRoot);
  if (!queue) return { removed: 0, queue: null };

  const seen = new Set();
  const deduped = [];
  let removed = 0;

  for (const item of queue.items) {
    const key = `${item.name}::${item.workflow}`;
    if (seen.has(key)) {
      removed++;
    } else {
      seen.add(key);
      deduped.push(item);
    }
  }

  if (removed === 0) return { removed: 0, queue };

  queue.items = deduped;
  const filePath = _queuePath(projectRoot);
  atomicWrite(filePath, queue);

  return { removed, queue };
}

/**
 * workflow 複雜度排序權重
 * 複雜度從低到高：single < quick < standard < full
 */
const WORKFLOW_ORDER = { single: 0, quick: 1, standard: 2, full: 3 };

/**
 * 根據 workflow 複雜度提供排序建議（不修改佇列）
 * 同 workflow 類型內保持原始相對順序（穩定排序）。
 * 不影響已完成/進行中的項目（維持在原位）。
 * @param {string} projectRoot
 * @returns {{ suggested: object[]|null, changed: boolean }} 建議順序和是否有變動
 */
function suggestOrder(projectRoot) {
  const queue = readQueue(projectRoot);
  if (!queue) return { suggested: null, changed: false };

  // 分離已完成/進行中與待執行項目
  const settled = [];   // completed / in_progress — 保留位置
  const pending = [];   // pending — 參與排序

  for (const item of queue.items) {
    if (item.status === 'pending') {
      pending.push(item);
    } else {
      settled.push(item);
    }
  }

  // 穩定排序 pending 項目（使用 index 保持同 workflow 的相對順序）
  const sortedPending = pending
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => {
      const wa = WORKFLOW_ORDER[a.item.workflow] ?? 99;
      const wb = WORKFLOW_ORDER[b.item.workflow] ?? 99;
      if (wa !== wb) return wa - wb;
      return a.idx - b.idx;
    })
    .map(({ item }) => item);

  // 重組：settled 項目保持原位，pending 項目以排序後順序填入
  const suggested = [];
  let pendingIdx = 0;
  for (const item of queue.items) {
    if (item.status === 'pending') {
      suggested.push(sortedPending[pendingIdx++]);
    } else {
      suggested.push(item);
    }
  }

  // 判斷是否有實際變動
  const changed = suggested.some((item, i) => item !== queue.items[i]);

  return { suggested, changed };
}

/**
 * 套用排序建議到佇列（修改檔案）
 * @param {string} projectRoot
 * @param {object[]} suggested - suggestOrder 回傳的 suggested 陣列
 * @returns {boolean} 是否成功套用
 */
function applyOrder(projectRoot, suggested) {
  const queue = readQueue(projectRoot);
  if (!queue) return false;

  queue.items = suggested;
  const filePath = _queuePath(projectRoot);
  atomicWrite(filePath, queue);
  return true;
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
  setAutoExecute,
  clearQueue,
  dedup,
  suggestOrder,
  applyOrder,
  WORKFLOW_ORDER,
};
