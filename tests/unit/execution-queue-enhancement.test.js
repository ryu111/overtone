'use strict';
/**
 * execution-queue-enhancement.test.js — 佇列細粒度操作函式單元測試
 *
 * 測試面向：
 *   1. insertItem：anchor 前後插入
 *   2. removeItem：刪除 pending/failed，拒絕 completed/in_progress
 *   3. moveItem：移動 pending/failed，拒絕 completed/in_progress/self-anchor
 *   4. getItem：查詢單一項目完整資訊
 *   5. retryItem：failed → pending，清除 failedAt/failReason/startedAt
 */

const { test, expect, describe, beforeEach, afterAll } = require('bun:test');
const { rmSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const executionQueue = require(join(SCRIPTS_LIB, 'execution-queue'));
const paths = require(join(SCRIPTS_LIB, 'paths'));
const { atomicWrite } = require(join(SCRIPTS_LIB, 'utils'));

const TIMESTAMP = Date.now();
const TEST_PROJECT = join(homedir(), '.overtone', 'test-eq-enh-' + TIMESTAMP);
const NO_QUEUE_PROJECT = join(homedir(), '.overtone', 'test-eq-enh-noq-' + TIMESTAMP);

afterAll(() => {
  rmSync(paths.global.dir(TEST_PROJECT), { recursive: true, force: true });
});

// ── 輔助函式 ──

function makeQueue(items) {
  executionQueue.writeQueue(TEST_PROJECT, items.map(i => ({ name: i.name, workflow: i.workflow || 'standard' })), 'test');
  // 手動設定 status
  const queue = executionQueue.readQueue(TEST_PROJECT);
  for (let i = 0; i < items.length; i++) {
    if (items[i].status && items[i].status !== 'pending') {
      queue.items[i].status = items[i].status;
      if (items[i].failedAt) queue.items[i].failedAt = items[i].failedAt;
      if (items[i].failReason) queue.items[i].failReason = items[i].failReason;
      if (items[i].startedAt) queue.items[i].startedAt = items[i].startedAt;
      if (items[i].completedAt) queue.items[i].completedAt = items[i].completedAt;
    }
  }
  const filePath = require('path').join(paths.global.dir(TEST_PROJECT), 'execution-queue.json');
  atomicWrite(filePath, queue);
  return queue;
}

function names(projectRoot) {
  return executionQueue.readQueue(projectRoot).items.map(i => i.name);
}

// ────────────────────────────────────────────────────────────────────────────
// 1. insertItem
// ────────────────────────────────────────────────────────────────────────────

describe('insertItem', () => {
  test('在 anchor 之前插入新項目', () => {
    makeQueue([{ name: 'task-a' }, { name: 'task-b' }, { name: 'task-c' }]);
    const result = executionQueue.insertItem(TEST_PROJECT, 'task-new', 'standard', 'task-b', 'before');
    expect(result).toEqual({ ok: true });
    expect(names(TEST_PROJECT)).toEqual(['task-a', 'task-new', 'task-b', 'task-c']);

    const queue = executionQueue.readQueue(TEST_PROJECT);
    const newItem = queue.items.find(i => i.name === 'task-new');
    expect(newItem.status).toBe('pending');
    expect(newItem.workflow).toBe('standard');
  });

  test('在 anchor 之後插入新項目', () => {
    makeQueue([{ name: 'task-a' }, { name: 'task-b' }, { name: 'task-c' }]);
    const result = executionQueue.insertItem(TEST_PROJECT, 'task-new', 'quick', 'task-b', 'after');
    expect(result).toEqual({ ok: true });
    expect(names(TEST_PROJECT)).toEqual(['task-a', 'task-b', 'task-new', 'task-c']);
  });

  test('插入到第一個項目之前', () => {
    makeQueue([{ name: 'task-a' }, { name: 'task-b' }]);
    const result = executionQueue.insertItem(TEST_PROJECT, 'task-new', 'standard', 'task-a', 'before');
    expect(result).toEqual({ ok: true });
    expect(names(TEST_PROJECT)).toEqual(['task-new', 'task-a', 'task-b']);
  });

  test('佇列不存在時回傳 QUEUE_NOT_FOUND', () => {
    const result = executionQueue.insertItem(NO_QUEUE_PROJECT, 'task-new', 'standard', 'task-a', 'before');
    expect(result).toEqual({ ok: false, error: 'QUEUE_NOT_FOUND' });
  });

  test('anchor 不存在時回傳 ANCHOR_NOT_FOUND', () => {
    makeQueue([{ name: 'task-a' }, { name: 'task-b' }]);
    const result = executionQueue.insertItem(TEST_PROJECT, 'task-new', 'standard', 'task-nonexistent', 'before');
    expect(result).toEqual({ ok: false, error: 'ANCHOR_NOT_FOUND' });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. removeItem
// ────────────────────────────────────────────────────────────────────────────

describe('removeItem', () => {
  test('刪除 pending 項目', () => {
    makeQueue([{ name: 'task-a' }, { name: 'task-b' }, { name: 'task-c' }]);
    const result = executionQueue.removeItem(TEST_PROJECT, 'task-b');
    expect(result).toEqual({ ok: true });
    expect(names(TEST_PROJECT)).toEqual(['task-a', 'task-c']);
  });

  test('刪除 failed 項目', () => {
    makeQueue([
      { name: 'task-a', status: 'completed' },
      { name: 'task-b', status: 'failed' },
      { name: 'task-c' },
    ]);
    const result = executionQueue.removeItem(TEST_PROJECT, 'task-b');
    expect(result).toEqual({ ok: true });
    expect(names(TEST_PROJECT)).toEqual(['task-a', 'task-c']);
  });

  test('嘗試刪除 completed 項目回傳 INVALID_STATUS，佇列不變', () => {
    makeQueue([{ name: 'task-a', status: 'completed' }, { name: 'task-b' }]);
    const result = executionQueue.removeItem(TEST_PROJECT, 'task-a');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_STATUS');
    expect(names(TEST_PROJECT)).toEqual(['task-a', 'task-b']);
  });

  test('嘗試刪除 in_progress 項目回傳 INVALID_STATUS', () => {
    makeQueue([{ name: 'task-a', status: 'in_progress' }, { name: 'task-b' }]);
    const result = executionQueue.removeItem(TEST_PROJECT, 'task-a');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_STATUS');
  });

  test('項目不存在時回傳 ITEM_NOT_FOUND', () => {
    makeQueue([{ name: 'task-a' }]);
    const result = executionQueue.removeItem(TEST_PROJECT, 'task-nonexistent');
    expect(result).toEqual({ ok: false, error: 'ITEM_NOT_FOUND' });
  });

  test('佇列不存在時回傳 QUEUE_NOT_FOUND', () => {
    const result = executionQueue.removeItem(NO_QUEUE_PROJECT, 'task-a');
    expect(result).toEqual({ ok: false, error: 'QUEUE_NOT_FOUND' });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. moveItem
// ────────────────────────────────────────────────────────────────────────────

describe('moveItem', () => {
  test('將 pending 項目移動到另一個項目之前', () => {
    makeQueue([{ name: 'task-a' }, { name: 'task-b' }, { name: 'task-c' }]);
    const result = executionQueue.moveItem(TEST_PROJECT, 'task-c', 'task-a', 'before');
    expect(result).toEqual({ ok: true });
    expect(names(TEST_PROJECT)).toEqual(['task-c', 'task-a', 'task-b']);
  });

  test('將 failed 項目移動到 anchor 之後', () => {
    makeQueue([
      { name: 'task-a' },
      { name: 'task-b', status: 'failed' },
      { name: 'task-c' },
    ]);
    const result = executionQueue.moveItem(TEST_PROJECT, 'task-b', 'task-c', 'after');
    expect(result).toEqual({ ok: true });
    expect(names(TEST_PROJECT)).toEqual(['task-a', 'task-c', 'task-b']);
  });

  test('嘗試移動 completed 項目回傳 INVALID_STATUS', () => {
    makeQueue([{ name: 'task-a', status: 'completed' }, { name: 'task-b' }]);
    const result = executionQueue.moveItem(TEST_PROJECT, 'task-a', 'task-b', 'before');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_STATUS');
  });

  test('嘗試移動 in_progress 項目回傳 INVALID_STATUS', () => {
    makeQueue([{ name: 'task-a', status: 'in_progress' }, { name: 'task-b' }]);
    const result = executionQueue.moveItem(TEST_PROJECT, 'task-a', 'task-b', 'after');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_STATUS');
  });

  test('name 與 anchor 相同時回傳 SELF_ANCHOR', () => {
    makeQueue([{ name: 'task-a' }, { name: 'task-b' }]);
    const result = executionQueue.moveItem(TEST_PROJECT, 'task-a', 'task-a', 'before');
    expect(result).toEqual({ ok: false, error: 'SELF_ANCHOR' });
  });

  test('anchor 不存在時回傳 ANCHOR_NOT_FOUND', () => {
    makeQueue([{ name: 'task-a' }, { name: 'task-b' }]);
    const result = executionQueue.moveItem(TEST_PROJECT, 'task-a', 'task-nonexistent', 'after');
    expect(result).toEqual({ ok: false, error: 'ANCHOR_NOT_FOUND' });
  });

  test('要移動的項目不存在時回傳 ITEM_NOT_FOUND', () => {
    makeQueue([{ name: 'task-a' }, { name: 'task-b' }]);
    const result = executionQueue.moveItem(TEST_PROJECT, 'task-nonexistent', 'task-b', 'before');
    expect(result).toEqual({ ok: false, error: 'ITEM_NOT_FOUND' });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. getItem
// ────────────────────────────────────────────────────────────────────────────

describe('getItem', () => {
  test('查詢存在的項目，回傳完整欄位與 index', () => {
    makeQueue([
      { name: 'task-a', status: 'completed' },
      { name: 'task-b', status: 'in_progress' },
      { name: 'task-c' },
    ]);
    const result = executionQueue.getItem(TEST_PROJECT, 'task-b');
    expect(result.ok).toBe(true);
    expect(result.item.name).toBe('task-b');
    expect(result.item.status).toBe('in_progress');
    expect(result.index).toBe(1);
  });

  test('查詢 failed 項目，回傳 failReason', () => {
    makeQueue([{ name: 'task-a', status: 'failed', failedAt: '2026-01-01T00:00:00.000Z', failReason: 'timeout' }]);
    const result = executionQueue.getItem(TEST_PROJECT, 'task-a');
    expect(result.ok).toBe(true);
    expect(result.item.status).toBe('failed');
    expect(result.item.failReason).toBe('timeout');
    expect(result.item.failedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(result.index).toBe(0);
  });

  test('項目不存在時回傳 ITEM_NOT_FOUND', () => {
    makeQueue([{ name: 'task-a' }]);
    const result = executionQueue.getItem(TEST_PROJECT, 'task-nonexistent');
    expect(result).toEqual({ ok: false, error: 'ITEM_NOT_FOUND' });
  });

  test('佇列不存在時回傳 QUEUE_NOT_FOUND', () => {
    const result = executionQueue.getItem(NO_QUEUE_PROJECT, 'task-a');
    expect(result).toEqual({ ok: false, error: 'QUEUE_NOT_FOUND' });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 5. retryItem
// ────────────────────────────────────────────────────────────────────────────

describe('retryItem', () => {
  test('成功將 failed 項目重設為 pending，清除所有失敗欄位', () => {
    makeQueue([{
      name: 'task-a',
      status: 'failed',
      failedAt: '2026-01-01T00:00:00.000Z',
      failReason: 'timeout',
      startedAt: '2025-12-31T23:00:00.000Z',
    }]);
    const result = executionQueue.retryItem(TEST_PROJECT, 'task-a');
    expect(result).toEqual({ ok: true });

    const queue = executionQueue.readQueue(TEST_PROJECT);
    const item = queue.items[0];
    expect(item.status).toBe('pending');
    expect('failedAt' in item).toBe(false);
    expect('failReason' in item).toBe(false);
    expect('startedAt' in item).toBe(false);
  });

  test('有 in_progress 項目時阻擋 retry，回傳 IN_PROGRESS_CONFLICT', () => {
    makeQueue([
      { name: 'task-a', status: 'in_progress' },
      { name: 'task-b', status: 'failed' },
    ]);
    const result = executionQueue.retryItem(TEST_PROJECT, 'task-b');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('IN_PROGRESS_CONFLICT');
    expect(result.conflictName).toBe('task-a');
  });

  test('嘗試 retry 非 failed 項目（pending）回傳 INVALID_STATUS', () => {
    makeQueue([{ name: 'task-a' }]);
    const result = executionQueue.retryItem(TEST_PROJECT, 'task-a');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_STATUS');
  });

  test('嘗試 retry completed 項目回傳 INVALID_STATUS', () => {
    makeQueue([{ name: 'task-a', status: 'completed' }]);
    const result = executionQueue.retryItem(TEST_PROJECT, 'task-a');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_STATUS');
  });

  test('項目不存在時回傳 ITEM_NOT_FOUND', () => {
    makeQueue([{ name: 'task-a', status: 'failed' }]);
    const result = executionQueue.retryItem(TEST_PROJECT, 'task-nonexistent');
    expect(result).toEqual({ ok: false, error: 'ITEM_NOT_FOUND' });
  });

  test('佇列不存在時回傳 QUEUE_NOT_FOUND', () => {
    const result = executionQueue.retryItem(NO_QUEUE_PROJECT, 'task-a');
    expect(result).toEqual({ ok: false, error: 'QUEUE_NOT_FOUND' });
  });
});
