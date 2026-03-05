'use strict';
/**
 * execution-queue.test.js — 執行佇列單元測試
 *
 * 測試面向：
 *   1. writeQueue + readQueue：寫入與讀取
 *   2. getNext + advanceToNext：推進邏輯
 *   3. completeCurrent：完成標記
 *   4. formatQueueSummary：摘要格式
 *   5. clearQueue：清除
 *   6. 邊界情況
 */

const { test, expect, describe, afterAll } = require('bun:test');
const { rmSync, existsSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const executionQueue = require(join(SCRIPTS_LIB, 'execution-queue'));
const paths = require(join(SCRIPTS_LIB, 'paths'));

const TIMESTAMP = Date.now();
const TEST_PROJECT = join(homedir(), '.overtone', 'test-eq-' + TIMESTAMP);

afterAll(() => {
  rmSync(paths.global.dir(TEST_PROJECT), { recursive: true, force: true });
});

// ────────────────────────────────────────────────────────────────────────────
// 1. writeQueue + readQueue
// ────────────────────────────────────────────────────────────────────────────

describe('writeQueue + readQueue', () => {
  test('寫入後可讀取', () => {
    const items = [
      { name: '效能基線追蹤', workflow: 'quick' },
      { name: '數值評分引擎', workflow: 'standard' },
    ];
    const queue = executionQueue.writeQueue(TEST_PROJECT, items, 'PM Discovery test');

    expect(queue.items.length).toBe(2);
    expect(queue.items[0].status).toBe('pending');
    expect(queue.autoExecute).toBe(true);
    expect(queue.source).toBe('PM Discovery test');

    const read = executionQueue.readQueue(TEST_PROJECT);
    expect(read).not.toBeNull();
    expect(read.items.length).toBe(2);
  });

  test('不存在時回傳 null', () => {
    const read = executionQueue.readQueue('/tmp/no-such-project-' + TIMESTAMP);
    expect(read).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. getNext + advanceToNext
// ────────────────────────────────────────────────────────────────────────────

describe('getNext + advanceToNext', () => {
  test('getNext 回傳第一個 pending 項目', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'A', workflow: 'quick' },
      { name: 'B', workflow: 'standard' },
    ], 'test');

    const next = executionQueue.getNext(TEST_PROJECT);
    expect(next).not.toBeNull();
    expect(next.item.name).toBe('A');
    expect(next.index).toBe(0);
  });

  test('advanceToNext 標記為 in_progress', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'X', workflow: 'quick' },
      { name: 'Y', workflow: 'standard' },
    ], 'test');

    const advanced = executionQueue.advanceToNext(TEST_PROJECT);
    expect(advanced.item.name).toBe('X');

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items[0].status).toBe('in_progress');
    expect(queue.items[0].startedAt).toBeDefined();
    expect(queue.items[1].status).toBe('pending');
  });

  test('所有項目完成後 getNext 回傳 null', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'Done', workflow: 'quick' },
    ], 'test');

    executionQueue.advanceToNext(TEST_PROJECT);
    executionQueue.completeCurrent(TEST_PROJECT);

    const next = executionQueue.getNext(TEST_PROJECT);
    expect(next).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. completeCurrent
// ────────────────────────────────────────────────────────────────────────────

describe('completeCurrent', () => {
  test('標記 in_progress 為 completed', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'Task1', workflow: 'quick' },
      { name: 'Task2', workflow: 'standard' },
    ], 'test');

    executionQueue.advanceToNext(TEST_PROJECT);
    const success = executionQueue.completeCurrent(TEST_PROJECT);
    expect(success).toBe(true);

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items[0].status).toBe('completed');
    expect(queue.items[0].completedAt).toBeDefined();
  });

  test('無 in_progress 項目時回傳 false', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'Pending', workflow: 'quick' },
    ], 'test');

    const success = executionQueue.completeCurrent(TEST_PROJECT);
    expect(success).toBe(false);
  });

  test('指定 name 驗證不匹配時回傳 false', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'RealTask', workflow: 'quick' },
    ], 'test');
    executionQueue.advanceToNext(TEST_PROJECT);

    const success = executionQueue.completeCurrent(TEST_PROJECT, 'WrongName');
    expect(success).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. formatQueueSummary
// ────────────────────────────────────────────────────────────────────────────

describe('formatQueueSummary', () => {
  test('顯示佇列狀態和下一項指示', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: '已完成項', workflow: 'quick' },
      { name: '待執行項', workflow: 'standard' },
    ], 'PM Discovery');

    // 完成第一項
    executionQueue.advanceToNext(TEST_PROJECT);
    executionQueue.completeCurrent(TEST_PROJECT);

    const summary = executionQueue.formatQueueSummary(TEST_PROJECT);
    expect(summary).toContain('執行佇列');
    expect(summary).toContain('✅');
    expect(summary).toContain('⬜');
    expect(summary).toContain('⛔'); // 不要詢問使用者
    expect(summary).toContain('待執行項');
  });

  test('空佇列回傳空字串', () => {
    const summary = executionQueue.formatQueueSummary('/tmp/no-queue-' + TIMESTAMP);
    expect(summary).toBe('');
  });

  test('全部完成時不顯示 ⛔', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'Only', workflow: 'quick' },
    ], 'test');
    executionQueue.advanceToNext(TEST_PROJECT);
    executionQueue.completeCurrent(TEST_PROJECT);

    const summary = executionQueue.formatQueueSummary(TEST_PROJECT);
    expect(summary).not.toContain('⛔');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 5. clearQueue
// ────────────────────────────────────────────────────────────────────────────

describe('clearQueue', () => {
  test('清除後 readQueue 回傳 null', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'ToDelete', workflow: 'quick' },
    ], 'test');

    executionQueue.clearQueue(TEST_PROJECT);

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue).toBeNull();
  });

  test('清除不存在的佇列不崩潰', () => {
    expect(() => {
      executionQueue.clearQueue('/tmp/nonexistent-' + TIMESTAMP);
    }).not.toThrow();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 6. 完整流程
// ────────────────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────────────────
// 6. 防禦性推進（修復 init-workflow 未 advance 場景）
// ────────────────────────────────────────────────────────────────────────────

describe('防禦性推進：completeCurrent fallback', () => {
  test('直接 completeCurrent pending 項目回傳 false', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'no-advance', workflow: 'quick' },
    ], 'test');

    // 不呼叫 advanceToNext → completeCurrent 應失敗
    const success = executionQueue.completeCurrent(TEST_PROJECT);
    expect(success).toBe(false);

    // 項目仍為 pending
    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items[0].status).toBe('pending');
  });

  test('fallback 模式：advance + complete 可完成 pending 項目', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'fallback-item', workflow: 'quick' },
    ], 'test');

    // 模擬 session-stop-handler 的 fallback 邏輯
    if (!executionQueue.completeCurrent(TEST_PROJECT)) {
      executionQueue.advanceToNext(TEST_PROJECT);
      executionQueue.completeCurrent(TEST_PROJECT);
    }

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items[0].status).toBe('completed');
    expect(queue.items[0].completedAt).toBeDefined();
  });

  test('fallback 模式：多項佇列只完成第一個 pending', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'first', workflow: 'quick' },
      { name: 'second', workflow: 'standard' },
    ], 'test');

    // fallback 推進
    if (!executionQueue.completeCurrent(TEST_PROJECT)) {
      executionQueue.advanceToNext(TEST_PROJECT);
      executionQueue.completeCurrent(TEST_PROJECT);
    }

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items[0].status).toBe('completed');
    expect(queue.items[1].status).toBe('pending');
  });

  test('正常流程（已 advance）不觸發 fallback', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'normal', workflow: 'quick' },
    ], 'test');

    executionQueue.advanceToNext(TEST_PROJECT);

    // completeCurrent 直接成功，不需要 fallback
    const success = executionQueue.completeCurrent(TEST_PROJECT);
    expect(success).toBe(true);

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items[0].status).toBe('completed');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 7. workflow type 不匹配時仍可推進佇列（修復 init-workflow 無條件推進）
// ────────────────────────────────────────────────────────────────────────────

describe('workflow type 不匹配時仍可推進佇列', () => {
  test('佇列項目為 quick，啟動 standard workflow 時仍可推進', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'prompt-journal', workflow: 'quick' },
    ], 'PM Discovery');

    // 模擬 init-workflow 新邏輯：無條件推進
    const next = executionQueue.getNext(TEST_PROJECT);
    if (next) {
      executionQueue.advanceToNext(TEST_PROJECT);
    }

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items[0].status).toBe('in_progress');
  });

  test('佇列項目為 standard，啟動 quick workflow 時仍可推進', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'exec-queue-fix', workflow: 'standard' },
    ], 'PM Discovery');

    // 無條件推進（不檢查 workflow type）
    const next = executionQueue.getNext(TEST_PROJECT);
    if (next) {
      executionQueue.advanceToNext(TEST_PROJECT);
    }

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items[0].status).toBe('in_progress');
  });

  test('無 pending 項目時不崩潰', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'already-done', workflow: 'quick' },
    ], 'test');
    executionQueue.advanceToNext(TEST_PROJECT);
    executionQueue.completeCurrent(TEST_PROJECT);

    // 所有項目已完成，推進應靜默不崩潰
    const next = executionQueue.getNext(TEST_PROJECT);
    expect(next).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 8. 完整流程
// ────────────────────────────────────────────────────────────────────────────

describe('完整流程（8）', () => {
  test('3 項佇列完整推進', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'A', workflow: 'quick' },
      { name: 'B', workflow: 'standard' },
      { name: 'C', workflow: 'quick' },
    ], 'test-full');

    // 推進 A
    executionQueue.advanceToNext(TEST_PROJECT);
    expect(executionQueue.getCurrent(TEST_PROJECT).item.name).toBe('A');
    executionQueue.completeCurrent(TEST_PROJECT);

    // 推進 B
    executionQueue.advanceToNext(TEST_PROJECT);
    expect(executionQueue.getCurrent(TEST_PROJECT).item.name).toBe('B');
    executionQueue.completeCurrent(TEST_PROJECT);

    // 推進 C
    executionQueue.advanceToNext(TEST_PROJECT);
    expect(executionQueue.getCurrent(TEST_PROJECT).item.name).toBe('C');
    executionQueue.completeCurrent(TEST_PROJECT);

    // 全部完成
    expect(executionQueue.getNext(TEST_PROJECT)).toBeNull();
    expect(executionQueue.getCurrent(TEST_PROJECT)).toBeNull();

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items.every(i => i.status === 'completed')).toBe(true);
  });
});
