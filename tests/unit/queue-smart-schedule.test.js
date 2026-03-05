'use strict';
/**
 * queue-smart-schedule.test.js — 佇列智慧排程單元測試
 *
 * 測試面向：
 *   1. dedup：移除重複項目
 *   2. suggestOrder：排序建議
 *   3. applyOrder：套用排序
 *   4. WORKFLOW_ORDER：複雜度常數
 */

const { test, expect, describe, afterAll, beforeEach } = require('bun:test');
const { rmSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const executionQueue = require(join(SCRIPTS_LIB, 'execution-queue'));
const paths = require(join(SCRIPTS_LIB, 'paths'));

const TIMESTAMP = Date.now();
const TEST_PROJECT = join(homedir(), '.overtone', 'test-qss-' + TIMESTAMP);

afterAll(() => {
  rmSync(paths.global.dir(TEST_PROJECT), { recursive: true, force: true });
});

// 每個 test 前清空佇列，確保測試間不互相干擾
beforeEach(() => {
  executionQueue.clearQueue(TEST_PROJECT);
});

// ────────────────────────────────────────────────────────────────────────────
// 1. dedup
// ────────────────────────────────────────────────────────────────────────────

describe('dedup', () => {
  test('無重複項目時 removed 為 0', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'A', workflow: 'quick' },
      { name: 'B', workflow: 'standard' },
    ], 'test');

    const { removed, queue } = executionQueue.dedup(TEST_PROJECT);
    expect(removed).toBe(0);
    expect(queue.items.length).toBe(2);
  });

  test('移除完全重複項目（name + workflow 皆相同）', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'A', workflow: 'quick' },
      { name: 'A', workflow: 'quick' }, // 重複
      { name: 'B', workflow: 'standard' },
    ], 'test');

    const { removed, queue } = executionQueue.dedup(TEST_PROJECT);
    expect(removed).toBe(1);
    expect(queue.items.length).toBe(2);
    expect(queue.items[0].name).toBe('A');
    expect(queue.items[1].name).toBe('B');
  });

  test('name 相同但 workflow 不同時不視為重複', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'A', workflow: 'quick' },
      { name: 'A', workflow: 'standard' }, // 不同 workflow，不算重複
    ], 'test');

    const { removed } = executionQueue.dedup(TEST_PROJECT);
    expect(removed).toBe(0);
  });

  test('保留第一個，移除後續重複項', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'X', workflow: 'quick' },
      { name: 'Y', workflow: 'standard' },
      { name: 'X', workflow: 'quick' }, // 重複，移除
      { name: 'Y', workflow: 'standard' }, // 重複，移除
    ], 'test');

    const { removed, queue } = executionQueue.dedup(TEST_PROJECT);
    expect(removed).toBe(2);
    expect(queue.items.length).toBe(2);
    expect(queue.items[0].name).toBe('X');
    expect(queue.items[1].name).toBe('Y');
  });

  test('移除後佇列持久化到檔案', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'dup', workflow: 'quick' },
      { name: 'dup', workflow: 'quick' },
    ], 'test');

    executionQueue.dedup(TEST_PROJECT);

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items.length).toBe(1);
  });

  test('空佇列時回傳 removed 0 且 queue 為 null', () => {
    const { removed, queue } = executionQueue.dedup(TEST_PROJECT);
    expect(removed).toBe(0);
    expect(queue).toBeNull();
  });

  test('三個相同項目只保留第一個', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'same', workflow: 'single' },
      { name: 'same', workflow: 'single' },
      { name: 'same', workflow: 'single' },
    ], 'test');

    const { removed, queue } = executionQueue.dedup(TEST_PROJECT);
    expect(removed).toBe(2);
    expect(queue.items.length).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. suggestOrder
// ────────────────────────────────────────────────────────────────────────────

describe('suggestOrder', () => {
  test('空佇列時回傳 suggested null', () => {
    const { suggested, changed } = executionQueue.suggestOrder(TEST_PROJECT);
    expect(suggested).toBeNull();
    expect(changed).toBe(false);
  });

  test('已是最佳順序時 changed 為 false', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'A', workflow: 'single' },
      { name: 'B', workflow: 'quick' },
      { name: 'C', workflow: 'standard' },
      { name: 'D', workflow: 'full' },
    ], 'test');

    const { suggested, changed } = executionQueue.suggestOrder(TEST_PROJECT);
    expect(changed).toBe(false);
    expect(suggested.length).toBe(4);
  });

  test('依複雜度排序（full 排最後）', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'heavy', workflow: 'full' },
      { name: 'light', workflow: 'single' },
    ], 'test');

    const { suggested, changed } = executionQueue.suggestOrder(TEST_PROJECT);
    expect(changed).toBe(true);
    expect(suggested[0].name).toBe('light');
    expect(suggested[1].name).toBe('heavy');
  });

  test('standard 排在 quick 之後', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'std', workflow: 'standard' },
      { name: 'qk', workflow: 'quick' },
    ], 'test');

    const { suggested } = executionQueue.suggestOrder(TEST_PROJECT);
    expect(suggested[0].name).toBe('qk');
    expect(suggested[1].name).toBe('std');
  });

  test('同 workflow 內保持原始相對順序（穩定排序）', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'std-1', workflow: 'standard' },
      { name: 'std-2', workflow: 'standard' },
      { name: 'qk-1', workflow: 'quick' },
      { name: 'std-3', workflow: 'standard' },
    ], 'test');

    const { suggested } = executionQueue.suggestOrder(TEST_PROJECT);
    // quick 排在前
    expect(suggested[0].name).toBe('qk-1');
    // standard 保持原始順序：1, 2, 3
    expect(suggested[1].name).toBe('std-1');
    expect(suggested[2].name).toBe('std-2');
    expect(suggested[3].name).toBe('std-3');
  });

  test('不修改佇列檔案（只建議）', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'full-task', workflow: 'full' },
      { name: 'quick-task', workflow: 'quick' },
    ], 'test');

    executionQueue.suggestOrder(TEST_PROJECT);

    // 讀取原始佇列，確認未被修改
    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items[0].name).toBe('full-task');
    expect(queue.items[1].name).toBe('quick-task');
  });

  test('completed/in_progress 項目不參與排序（維持原位）', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'done', workflow: 'full' },
      { name: 'pending-std', workflow: 'standard' },
      { name: 'pending-qk', workflow: 'quick' },
    ], 'test');

    // 模擬第一項已完成
    executionQueue.advanceToNext(TEST_PROJECT);
    executionQueue.completeCurrent(TEST_PROJECT);

    const { suggested } = executionQueue.suggestOrder(TEST_PROJECT);
    // 已完成的 'done' 保持在 index 0
    expect(suggested[0].name).toBe('done');
    // pending 的 quick 排在 standard 前
    expect(suggested[1].name).toBe('pending-qk');
    expect(suggested[2].name).toBe('pending-std');
  });

  test('未知 workflow 類型排在最後', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'unknown', workflow: 'custom-wf' },
      { name: 'simple', workflow: 'single' },
    ], 'test');

    const { suggested } = executionQueue.suggestOrder(TEST_PROJECT);
    expect(suggested[0].name).toBe('simple');
    expect(suggested[1].name).toBe('unknown');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. applyOrder
// ────────────────────────────────────────────────────────────────────────────

describe('applyOrder', () => {
  test('套用建議排序後佇列順序改變', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'full-task', workflow: 'full' },
      { name: 'quick-task', workflow: 'quick' },
    ], 'test');

    const { suggested } = executionQueue.suggestOrder(TEST_PROJECT);
    executionQueue.applyOrder(TEST_PROJECT, suggested);

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items[0].name).toBe('quick-task');
    expect(queue.items[1].name).toBe('full-task');
  });

  test('佇列不存在時回傳 false', () => {
    const result = executionQueue.applyOrder(TEST_PROJECT, []);
    expect(result).toBe(false);
  });

  test('套用後可正常繼續推進', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'std', workflow: 'standard' },
      { name: 'qk', workflow: 'quick' },
    ], 'test');

    const { suggested } = executionQueue.suggestOrder(TEST_PROJECT);
    executionQueue.applyOrder(TEST_PROJECT, suggested);

    const next = executionQueue.getNext(TEST_PROJECT);
    expect(next.item.name).toBe('qk');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. WORKFLOW_ORDER 常數
// ────────────────────────────────────────────────────────────────────────────

describe('WORKFLOW_ORDER', () => {
  test('包含四個標準 workflow 類型', () => {
    const { WORKFLOW_ORDER } = executionQueue;
    expect(WORKFLOW_ORDER).toBeDefined();
    expect(typeof WORKFLOW_ORDER.single).toBe('number');
    expect(typeof WORKFLOW_ORDER.quick).toBe('number');
    expect(typeof WORKFLOW_ORDER.standard).toBe('number');
    expect(typeof WORKFLOW_ORDER.full).toBe('number');
  });

  test('複雜度遞增順序正確（single < quick < standard < full）', () => {
    const { WORKFLOW_ORDER } = executionQueue;
    expect(WORKFLOW_ORDER.single).toBeLessThan(WORKFLOW_ORDER.quick);
    expect(WORKFLOW_ORDER.quick).toBeLessThan(WORKFLOW_ORDER.standard);
    expect(WORKFLOW_ORDER.standard).toBeLessThan(WORKFLOW_ORDER.full);
  });
});
