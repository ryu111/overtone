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
 *   13. DAG 依賴核心
 *   14. updateWorkflowId fallback
 *   15. completeByWorkflowId
 */

const { test, expect, describe, afterAll } = require('bun:test');
const { rmSync, existsSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const executionQueue = require(join(SCRIPTS_LIB, 'execution-queue'));
const paths = require(join(SCRIPTS_LIB, 'paths'));
const { atomicWrite } = require(join(SCRIPTS_LIB, 'utils'));

const TIMESTAMP = Date.now();
const TEST_PROJECT = join(homedir(), '.nova', 'test-eq-' + TIMESTAMP);

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

  test('無 in_progress 項目時 fallback 完成第一個 pending', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'Pending', workflow: 'quick' },
    ], 'test');

    // fallback: 找不到 in_progress → 完成第一個 pending
    const success = executionQueue.completeCurrent(TEST_PROJECT);
    expect(success).toBe(true);
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
  test('直接 completeCurrent pending 項目透過 fallback 成功', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'no-advance', workflow: 'quick' },
    ], 'test');

    // 不呼叫 advanceToNext → completeCurrent fallback 找 pending 完成
    const success = executionQueue.completeCurrent(TEST_PROJECT);
    expect(success).toBe(true);
  });

  test('fallback 模式：advance + complete 可完成 pending 項目', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'fallback-item', workflow: 'quick' },
    ], 'test');

    // 模擬 session-stop-handler 的 fallback 邏輯
    if (!executionQueue.completeCurrent(TEST_PROJECT)) {
      executionQueue.advanceToNext(TEST_PROJECT);
      const success = executionQueue.completeCurrent(TEST_PROJECT);
      expect(success).toBe(true);
    }

    // 全部完成後佇列會被自動清理
    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue).toBeNull();
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

    // 全部完成後佇列會被自動清理
    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue).toBeNull();
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
// 8. autoExecute: false（規劃模式）
// ────────────────────────────────────────────────────────────────────────────

describe('writeQueue 支援 autoExecute: false', () => {
  test('autoExecute: false 時 getNext 回傳 null', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'plan-task', workflow: 'quick' },
    ], 'PM Plan', { autoExecute: false });

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.autoExecute).toBe(false);

    const next = executionQueue.getNext(TEST_PROJECT);
    expect(next).toBeNull();
  });

  test('autoExecute: false 時 advanceToNext 回傳 null', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'plan-task-2', workflow: 'standard' },
    ], 'PM Plan', { autoExecute: false });

    const result = executionQueue.advanceToNext(TEST_PROJECT);
    expect(result).toBeNull();

    // 項目仍為 pending
    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items[0].status).toBe('pending');
  });

  test('autoExecute 預設為 true（向後相容）', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'normal-task', workflow: 'quick' },
    ], 'PM Discovery');

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.autoExecute).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 9. appendQueue
// ────────────────────────────────────────────────────────────────────────────

describe('appendQueue 累加到既有佇列', () => {
  test('累加到現有佇列（保留原有項目）', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'first', workflow: 'quick' },
    ], 'PM Discovery');

    executionQueue.appendQueue(TEST_PROJECT, [
      { name: 'second', workflow: 'standard' },
      { name: 'third', workflow: 'quick' },
    ], 'PM Plan');

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items.length).toBe(3);
    expect(queue.items[0].name).toBe('first');
    expect(queue.items[1].name).toBe('second');
    expect(queue.items[2].name).toBe('third');
  });

  test('appendQueue 保留已完成項目', () => {
    // 用 2 個項目確保 completeCurrent 不會自動清理（還有 pending 項目）
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'done-task', workflow: 'quick' },
      { name: 'placeholder', workflow: 'quick' },
    ], 'PM Discovery');
    executionQueue.advanceToNext(TEST_PROJECT);
    executionQueue.completeCurrent(TEST_PROJECT);

    executionQueue.appendQueue(TEST_PROJECT, [
      { name: 'new-task', workflow: 'standard' },
    ], 'PM Plan');

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items.length).toBe(3);
    expect(queue.items[0].status).toBe('completed');
    expect(queue.items[1].status).toBe('pending');
    expect(queue.items[2].status).toBe('pending');
  });

  test('appendQueue 不存在時等同 writeQueue', () => {
    executionQueue.clearQueue(TEST_PROJECT);

    executionQueue.appendQueue(TEST_PROJECT, [
      { name: 'only-task', workflow: 'quick' },
    ], 'PM Plan');

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue).not.toBeNull();
    expect(queue.items.length).toBe(1);
    expect(queue.items[0].name).toBe('only-task');
  });

  test('appendQueue 支援 autoExecute: false', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'existing', workflow: 'quick' },
    ], 'PM Discovery');

    executionQueue.appendQueue(TEST_PROJECT, [
      { name: 'plan-task', workflow: 'standard' },
    ], 'PM Plan', { autoExecute: false });

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.autoExecute).toBe(false);
    expect(queue.items.length).toBe(2);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 10. formatQueueSummary 規劃模式標注
// ────────────────────────────────────────────────────────────────────────────

describe('formatQueueSummary 規劃模式標注', () => {
  test('autoExecute: false 時顯示規劃模式標注', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: '規劃任務', workflow: 'standard' },
    ], 'PM Plan', { autoExecute: false });

    const summary = executionQueue.formatQueueSummary(TEST_PROJECT);
    expect(summary).toContain('📋 規劃模式（手動啟動）');
  });

  test('autoExecute: true 時不顯示規劃模式標注', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: '執行任務', workflow: 'quick' },
    ], 'PM Discovery');

    const summary = executionQueue.formatQueueSummary(TEST_PROJECT);
    expect(summary).not.toContain('規劃模式');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 11. DAG 依賴排序（suggestOrder + depends_on）
// ────────────────────────────────────────────────────────────────────────────

describe('suggestOrder — 無依賴時行為不變（回歸測試）', () => {
  test('無 dependsOn 時按 workflow 複雜度排序', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'C', workflow: 'standard' },
      { name: 'A', workflow: 'quick' },
      { name: 'B', workflow: 'single' },
    ], 'test', { skipValidation: true });

    const { suggested, changed, hasCycle } = executionQueue.suggestOrder(TEST_PROJECT);
    expect(hasCycle).toBe(false);
    expect(changed).toBe(true);
    // single < quick < standard
    expect(suggested[0].name).toBe('B');
    expect(suggested[1].name).toBe('A');
    expect(suggested[2].name).toBe('C');
  });

  test('佇列為空時回傳 { suggested: null, changed: false, hasCycle: false }', () => {
    executionQueue.clearQueue(TEST_PROJECT);
    const result = executionQueue.suggestOrder(TEST_PROJECT);
    expect(result.suggested).toBeNull();
    expect(result.changed).toBe(false);
    expect(result.hasCycle).toBe(false);
  });
});

describe('suggestOrder — 有依賴時拓撲排序正確', () => {
  test('dependsOn 項目排在依賴之後', () => {
    // add-auth 依賴 setup-db，setup-db 依賴 init-project
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'add-auth', workflow: 'standard', dependsOn: ['setup-db'] },
      { name: 'init-project', workflow: 'quick' },
      { name: 'setup-db', workflow: 'quick', dependsOn: ['init-project'] },
    ], 'test');

    const { suggested, changed, hasCycle } = executionQueue.suggestOrder(TEST_PROJECT);
    expect(hasCycle).toBe(false);

    const names = suggested.map(i => i.name);
    const initIdx = names.indexOf('init-project');
    const dbIdx = names.indexOf('setup-db');
    const authIdx = names.indexOf('add-auth');
    // init-project 必須在 setup-db 前，setup-db 必須在 add-auth 前
    expect(initIdx).toBeLessThan(dbIdx);
    expect(dbIdx).toBeLessThan(authIdx);
  });

  test('無依賴的項目仍依 workflow 複雜度排在前面', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'feature-b', workflow: 'standard', dependsOn: ['feature-a'] },
      { name: 'standalone', workflow: 'single' },
      { name: 'feature-a', workflow: 'quick' },
    ], 'test');

    const { suggested, hasCycle } = executionQueue.suggestOrder(TEST_PROJECT);
    expect(hasCycle).toBe(false);

    const names = suggested.map(i => i.name);
    // standalone(single) 和 feature-a(quick) 無依賴，排在 feature-b(standard) 前
    expect(names.indexOf('feature-b')).toBeGreaterThan(names.indexOf('feature-a'));
  });
});

describe('suggestOrder — 循環依賴偵測', () => {
  test('A 依賴 B，B 依賴 A → hasCycle: true，保持原始順序', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'task-a', workflow: 'quick', dependsOn: ['task-b'] },
      { name: 'task-b', workflow: 'quick', dependsOn: ['task-a'] },
    ], 'test', { skipValidation: true });

    const { suggested, hasCycle } = executionQueue.suggestOrder(TEST_PROJECT);
    expect(hasCycle).toBe(true);
    // 回退到 workflow 排序（同類型 workflow 保持相對順序）
    expect(suggested).not.toBeNull();
    expect(suggested.length).toBe(2);
  });

  test('三節點循環 A→B→C→A → hasCycle: true', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'A', workflow: 'quick', dependsOn: ['C'] },
      { name: 'B', workflow: 'quick', dependsOn: ['A'] },
      { name: 'C', workflow: 'quick', dependsOn: ['B'] },
    ], 'test', { skipValidation: true });

    const { hasCycle } = executionQueue.suggestOrder(TEST_PROJECT);
    expect(hasCycle).toBe(true);
  });
});

describe('suggestOrder — 已完成的依賴不影響排序', () => {
  test('依賴目標已 completed，排序視為已滿足', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'setup-db', workflow: 'quick' },
      { name: 'add-auth', workflow: 'standard', dependsOn: ['setup-db'] },
    ], 'test');

    // 將 setup-db 標記為 completed
    executionQueue.advanceToNext(TEST_PROJECT);
    executionQueue.completeCurrent(TEST_PROJECT);

    const { suggested, hasCycle } = executionQueue.suggestOrder(TEST_PROJECT);
    expect(hasCycle).toBe(false);
    // add-auth 可以排在任何位置（依賴已滿足）
    expect(suggested).not.toBeNull();
    const authItem = suggested.find(i => i.name === 'add-auth');
    expect(authItem).toBeDefined();
    expect(authItem.status).toBe('pending');
  });
});

describe('addToQueue（writeQueue + appendQueue）— 保留 dependsOn 欄位', () => {
  test('writeQueue 保留 dependsOn', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'task-a', workflow: 'quick' },
      { name: 'task-b', workflow: 'standard', dependsOn: ['task-a'] },
    ], 'test');

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items[0].dependsOn).toEqual([]);
    expect(queue.items[1].dependsOn).toEqual(['task-a']);
  });

  test('appendQueue 保留 dependsOn', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'base', workflow: 'quick' },
    ], 'test');

    executionQueue.appendQueue(TEST_PROJECT, [
      { name: 'derived', workflow: 'standard', dependsOn: ['base'] },
    ], 'test');

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items[1].dependsOn).toEqual(['base']);
  });

  test('dependsOn 為空陣列時寫入空陣列', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'no-dep', workflow: 'quick', dependsOn: [] },
    ], 'test');

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items[0].dependsOn).toEqual([]);
  });

  test('未宣告 dependsOn 時寫入空陣列（預設值）', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'plain', workflow: 'quick' },
    ], 'test');

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items[0].dependsOn).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 12. 完整流程
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

    // 全部完成 → 佇列自動清理
    expect(executionQueue.getNext(TEST_PROJECT)).toBeNull();
    expect(executionQueue.getCurrent(TEST_PROJECT)).toBeNull();

    // completeCurrent 在最後一個項目完成時自動刪除佇列
    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 13. DAG 依賴核心（BDD Spec 覆蓋）
// ────────────────────────────────────────────────────────────────────────────

/**
 * DAG 測試輔助函式：直接寫入帶有任意狀態和 dependsOn 的佇列
 * @param {object[]} items - [{ name, workflow?, status?, dependsOn? }]
 */
function makeDAGQueue(items) {
  const queueItems = items.map(i => ({
    name: i.name,
    workflow: i.workflow || 'quick',
    status: i.status || 'pending',
    dependsOn: i.dependsOn || [],
    ...(i.startedAt ? { startedAt: i.startedAt } : {}),
    ...(i.completedAt ? { completedAt: i.completedAt } : {}),
    ...(i.failedAt ? { failedAt: i.failedAt } : {}),
    ...(i.failReason ? { failReason: i.failReason } : {}),
  }));
  const filePath = join(paths.global.dir(TEST_PROJECT), 'execution-queue.json');
  atomicWrite(filePath, {
    items: queueItems,
    autoExecute: true,
    source: 'DAG test',
    createdAt: new Date().toISOString(),
  });
}

// ── Feature: 基本 dependsOn 宣告與 getNext 行為 ──

describe('DAG — 基本 dependsOn 與 getNext 行為', () => {
  test('無 dependsOn 的 item 可直接取得', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'task-a', workflow: 'quick' },
    ], 'test');

    const next = executionQueue.getNext(TEST_PROJECT);
    expect(next).not.toBeNull();
    expect(next.item.name).toBe('task-a');
  });

  test('dependsOn 全部 completed 時 item 變為 ready', () => {
    makeDAGQueue([
      { name: 'task-a', status: 'completed' },
      { name: 'task-b', status: 'pending', dependsOn: ['task-a'] },
    ]);

    const next = executionQueue.getNext(TEST_PROJECT);
    expect(next).not.toBeNull();
    expect(next.item.name).toBe('task-b');
  });

  test('dependsOn 尚有 pending 時 item 被阻擋', () => {
    makeDAGQueue([
      { name: 'task-a', status: 'pending' },
      { name: 'task-b', status: 'pending', dependsOn: ['task-a'] },
    ]);

    const next = executionQueue.getNext(TEST_PROJECT);
    expect(next).not.toBeNull();
    expect(next.item.name).toBe('task-a');
  });

  test('dependsOn 尚有 in_progress 時 item 被阻擋，無其他 ready item 則回傳 null', () => {
    makeDAGQueue([
      { name: 'task-a', status: 'in_progress' },
      { name: 'task-b', status: 'pending', dependsOn: ['task-a'] },
    ]);

    const next = executionQueue.getNext(TEST_PROJECT);
    expect(next).toBeNull();
  });
});

// ── Feature: 環偵測 ──

describe('DAG — 環偵測', () => {
  test('直接循環（A 依賴 B，B 依賴 A）丟出 Error 且佇列不寫入', () => {
    executionQueue.clearQueue(TEST_PROJECT);
    expect(() => {
      executionQueue.writeQueue(TEST_PROJECT, [
        { name: 'A', workflow: 'quick', dependsOn: ['B'] },
        { name: 'B', workflow: 'quick', dependsOn: ['A'] },
      ], 'test');
    }).toThrow('循環依賴');

    // 佇列不應被寫入
    expect(executionQueue.readQueue(TEST_PROJECT)).toBeNull();
  });

  test('間接循環（A→B→C→A）丟出 Error', () => {
    expect(() => {
      executionQueue.writeQueue(TEST_PROJECT, [
        { name: 'A', workflow: 'quick', dependsOn: ['C'] },
        { name: 'B', workflow: 'quick', dependsOn: ['A'] },
        { name: 'C', workflow: 'quick', dependsOn: ['B'] },
      ], 'test');
    }).toThrow('循環依賴');
  });

  test('無循環的菱形依賴正常通過', () => {
    expect(() => {
      executionQueue.writeQueue(TEST_PROJECT, [
        { name: 'A', workflow: 'quick' },
        { name: 'B', workflow: 'quick', dependsOn: ['A'] },
        { name: 'C', workflow: 'quick', dependsOn: ['A'] },
        { name: 'D', workflow: 'quick', dependsOn: ['B', 'C'] },
      ], 'test');
    }).not.toThrow();
  });
});

// ── Feature: 引用驗證（不存在的 name）──

describe('DAG — 引用驗證', () => {
  test('dependsOn 引用不存在的 item name 時驗證失敗', () => {
    expect(() => {
      executionQueue.writeQueue(TEST_PROJECT, [
        { name: 'task-b', workflow: 'quick', dependsOn: ['non-existent'] },
      ], 'test');
    }).toThrow(/依賴項不存在.*non-existent/);
  });

  test('dependsOn 為非陣列型別時驗證失敗', () => {
    expect(() => {
      executionQueue.writeQueue(TEST_PROJECT, [
        { name: 'task-a', workflow: 'quick', dependsOn: 'task-b' },
      ], 'test');
    }).toThrow('dependsOn 必須是陣列');
  });

  test('dependsOn 為空陣列時正常通過', () => {
    expect(() => {
      executionQueue.writeQueue(TEST_PROJECT, [
        { name: 'task-a', workflow: 'quick', dependsOn: [] },
      ], 'test');
    }).not.toThrow();
  });
});

// ── Feature: 依賴感知排程（多 ready item 的 FIFO 偏好）──

describe('DAG — 依賴感知排程（FIFO）', () => {
  test('多個 ready item 時回傳 index 最小的（FIFO）', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'task-a', workflow: 'quick' },
      { name: 'task-b', workflow: 'quick' },
      { name: 'task-c', workflow: 'quick' },
    ], 'test');

    const next = executionQueue.getNext(TEST_PROJECT);
    expect(next.item.name).toBe('task-a');
  });

  test('前面的 item 被阻擋時跳過，取第一個 ready item', () => {
    // task-a 依賴 task-x（已被移除或不存在佇列中），task-b 無依賴
    makeDAGQueue([
      { name: 'task-a', status: 'pending', dependsOn: ['task-x'] },
      { name: 'task-b', status: 'pending', dependsOn: [] },
    ]);

    const next = executionQueue.getNext(TEST_PROJECT);
    expect(next).not.toBeNull();
    expect(next.item.name).toBe('task-b');
  });

  test('advanceToNext 標記第一個 ready item 為 in_progress', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'task-a', workflow: 'quick' },
      { name: 'task-b', workflow: 'quick', dependsOn: ['task-a'] },
    ], 'test');

    const advanced = executionQueue.advanceToNext(TEST_PROJECT);
    expect(advanced.item.name).toBe('task-a');

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items[0].status).toBe('in_progress');
    expect(queue.items[1].status).toBe('pending');
  });
});

// ── Feature: 失敗傳播（上游 failed 阻擋下游）──

describe('DAG — 失敗傳播', () => {
  test('上游 failed 時下游 pending 被永遠阻擋，回傳 null', () => {
    makeDAGQueue([
      { name: 'task-a', status: 'failed' },
      { name: 'task-b', status: 'pending', dependsOn: ['task-a'] },
    ]);

    const next = executionQueue.getNext(TEST_PROJECT);
    expect(next).toBeNull();
  });

  test('多重依賴中只要有一個 failed 就阻擋', () => {
    makeDAGQueue([
      { name: 'task-a', status: 'completed' },
      { name: 'task-b', status: 'failed' },
      { name: 'task-c', status: 'pending', dependsOn: ['task-a', 'task-b'] },
    ]);

    const next = executionQueue.getNext(TEST_PROJECT);
    expect(next).toBeNull();
  });

  test('間接失敗傳播（A failed → B blocked → C blocked）', () => {
    makeDAGQueue([
      { name: 'task-a', status: 'failed' },
      { name: 'task-b', status: 'pending', dependsOn: ['task-a'] },
      { name: 'task-c', status: 'pending', dependsOn: ['task-b'] },
    ]);

    const next = executionQueue.getNext(TEST_PROJECT);
    expect(next).toBeNull();
  });
});

// ── Feature: retryItem 解除阻擋 ──

describe('DAG — retryItem 解除阻擋', () => {
  test('retryItem 將 failed 改回 pending，下游解除阻擋', () => {
    makeDAGQueue([
      { name: 'task-a', status: 'failed' },
      { name: 'task-b', status: 'pending', dependsOn: ['task-a'] },
    ]);

    const result = executionQueue.retryItem(TEST_PROJECT, 'task-a');
    expect(result.ok).toBe(true);

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items[0].status).toBe('pending');

    // task-a 現在是 pending，getNext 應回傳 task-a
    const next = executionQueue.getNext(TEST_PROJECT);
    expect(next).not.toBeNull();
    expect(next.item.name).toBe('task-a');
  });

  test('retryItem 完成後上游 completed，下游自動解鎖', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'task-a', workflow: 'quick' },
      { name: 'task-b', workflow: 'quick', dependsOn: ['task-a'] },
    ], 'test');

    // 完成 task-a
    executionQueue.advanceToNext(TEST_PROJECT);
    executionQueue.completeCurrent(TEST_PROJECT);

    // task-b 應解鎖
    const next = executionQueue.getNext(TEST_PROJECT);
    expect(next).not.toBeNull();
    expect(next.item.name).toBe('task-b');
  });

  test('retryItem 對不存在的 item name 不丟出例外', () => {
    makeDAGQueue([{ name: 'task-a' }]);

    expect(() => {
      executionQueue.retryItem(TEST_PROJECT, 'non-existent');
    }).not.toThrow();
  });
});

// ── Feature: appendQueue 跨批次引用 ──

describe('DAG — appendQueue 跨批次引用', () => {
  test('新 item 可依賴既有佇列中的 item', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'task-a', workflow: 'quick' },
    ], 'test');

    expect(() => {
      executionQueue.appendQueue(TEST_PROJECT, [
        { name: 'task-b', workflow: 'quick', dependsOn: ['task-a'] },
      ], 'test');
    }).not.toThrow();

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items[1].dependsOn).toEqual(['task-a']);
  });

  test('新 item 引用不存在的 item（跨批次）時驗證失敗', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'task-a', workflow: 'quick' },
    ], 'test');

    expect(() => {
      executionQueue.appendQueue(TEST_PROJECT, [
        { name: 'task-b', workflow: 'quick', dependsOn: ['non-existent'] },
      ], 'test');
    }).toThrow('依賴項不存在');
  });

  test('既有 item 的 dependsOn 不被修改（不支援回顧引用）', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'task-a', workflow: 'quick' },
    ], 'test');

    executionQueue.appendQueue(TEST_PROJECT, [
      { name: 'task-b', workflow: 'quick' },
    ], 'test');

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items[0].dependsOn).toEqual([]);
  });

  test('跨批次新 item 形成環時丟出 Error', () => {
    // 初始寫入 task-a，dependsOn 為空
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'task-a', workflow: 'quick' },
    ], 'test');

    // 手動設定 task-a 有依賴（模擬跨批次形成環的情況）
    const queueFile = join(paths.global.dir(TEST_PROJECT), 'execution-queue.json');
    const queueData = require('fs').readFileSync(queueFile, 'utf8');
    const queueObj = JSON.parse(queueData);
    queueObj.items[0].dependsOn = ['task-c'];
    atomicWrite(queueFile, queueObj);

    // 新加 task-b(→task-a) 和 task-c(→task-b)，形成 task-a→task-c→task-b→task-a 環
    expect(() => {
      executionQueue.appendQueue(TEST_PROJECT, [
        { name: 'task-b', workflow: 'quick', dependsOn: ['task-a'] },
        { name: 'task-c', workflow: 'quick', dependsOn: ['task-b'] },
      ], 'test');
    }).toThrow('循環依賴');
  });
});

// ── Feature: readQueue 舊格式向後相容 ──

describe('DAG — readQueue 舊格式向後相容', () => {
  test('舊格式 item 不含 dependsOn 欄位，讀取後自動補齊為空陣列', () => {
    // 直接寫入不含 dependsOn 的舊格式
    const queueFile = join(paths.global.dir(TEST_PROJECT), 'execution-queue.json');
    atomicWrite(queueFile, {
      items: [{ name: 'old-task', workflow: 'quick', status: 'pending' }],
      autoExecute: true,
      source: 'old',
      createdAt: new Date().toISOString(),
    });

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items[0].dependsOn).toEqual([]);
  });

  test('舊格式 item 混有部分含 dependsOn、部分不含', () => {
    const queueFile = join(paths.global.dir(TEST_PROJECT), 'execution-queue.json');
    atomicWrite(queueFile, {
      items: [
        { name: 'task-with-dep', workflow: 'quick', status: 'pending', dependsOn: ['task-x'] },
        { name: 'task-no-dep', workflow: 'quick', status: 'pending' },
      ],
      autoExecute: true,
      source: 'old',
      createdAt: new Date().toISOString(),
    });

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items[0].dependsOn).toEqual(['task-x']);
    expect(queue.items[1].dependsOn).toEqual([]);
  });

  test('舊格式 item 透過 getNext 仍可正常取得（視為無依賴）', () => {
    const queueFile = join(paths.global.dir(TEST_PROJECT), 'execution-queue.json');
    atomicWrite(queueFile, {
      items: [{ name: 'old-task', workflow: 'quick', status: 'pending' }],
      autoExecute: true,
      source: 'old',
      createdAt: new Date().toISOString(),
    });

    const next = executionQueue.getNext(TEST_PROJECT);
    expect(next).not.toBeNull();
    expect(next.item.name).toBe('old-task');
  });
});

// ── Feature: 無 dependsOn 的 item 行為不變（回歸保護）──

describe('DAG — 無 dependsOn 的 item 回歸保護', () => {
  test('全無依賴的佇列維持原有 FIFO 順序', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'task-1', workflow: 'quick' },
      { name: 'task-2', workflow: 'quick' },
      { name: 'task-3', workflow: 'quick' },
    ], 'test');

    // 第一次 advanceToNext + completeCurrent
    executionQueue.advanceToNext(TEST_PROJECT);
    executionQueue.completeCurrent(TEST_PROJECT);
    expect(executionQueue.getNext(TEST_PROJECT).item.name).toBe('task-2');

    executionQueue.advanceToNext(TEST_PROJECT);
    executionQueue.completeCurrent(TEST_PROJECT);
    expect(executionQueue.getNext(TEST_PROJECT).item.name).toBe('task-3');
  });

  test('writeQueue 寫入無 dependsOn 的 item 時不報錯，讀回 dependsOn 為空陣列', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'task-a', workflow: 'quick' },
    ], 'test');

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items[0].dependsOn).toEqual([]);
  });

  test('無依賴的 item 不受其他 item 的 failed 狀態影響', () => {
    makeDAGQueue([
      { name: 'task-a', status: 'failed' },
      { name: 'task-b', status: 'pending', dependsOn: [] },
    ]);

    const next = executionQueue.getNext(TEST_PROJECT);
    expect(next).not.toBeNull();
    expect(next.item.name).toBe('task-b');
  });
});

// ── Feature 14: updateWorkflowId fallback ────────────────────────────────────

describe('updateWorkflowId — fallback 行為', () => {
  test('名稱精確比對成功時正常寫入 workflowId', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'feature-a', workflow: 'quick' },
    ], 'test');

    const result = executionQueue.updateWorkflowId(TEST_PROJECT, 'feature-a', 'wf-001');
    expect(result.ok).toBe(true);

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items[0].workflowId).toBe('wf-001');
  });

  test('名稱不匹配時 fallback 到 in_progress 項目', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: '中文功能名稱', workflow: 'quick' },
    ], 'test');
    // 手動將項目標記為 in_progress
    const queueFile = require('path').join(paths.global.dir(TEST_PROJECT), 'execution-queue.json');
    const q = executionQueue.readQueue(TEST_PROJECT);
    q.items[0].status = 'in_progress';
    atomicWrite(queueFile, q);

    // 傳入英文名稱（不匹配）
    const result = executionQueue.updateWorkflowId(TEST_PROJECT, 'english-feature-name', 'wf-002');
    expect(result.ok).toBe(true);

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items[0].workflowId).toBe('wf-002');
  });

  test('名稱不匹配且無 in_progress 時 fallback 到第一個 pending', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: '中文功能名稱', workflow: 'quick' },
    ], 'test');

    const result = executionQueue.updateWorkflowId(TEST_PROJECT, 'english-feature-name', 'wf-003');
    expect(result.ok).toBe(true);

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items[0].workflowId).toBe('wf-003');
  });

  test('佇列不存在時回傳 QUEUE_NOT_FOUND', () => {
    const result = executionQueue.updateWorkflowId(
      '/tmp/no-queue-proj-' + Date.now(),
      'any-name',
      'wf-x'
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe('QUEUE_NOT_FOUND');
  });

  test('無任何 pending/in_progress 項目時回傳 ITEM_NOT_FOUND', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'completed-task', workflow: 'quick' },
    ], 'test');
    // 手動標記為 completed
    const queueFile = require('path').join(paths.global.dir(TEST_PROJECT), 'execution-queue.json');
    const q = executionQueue.readQueue(TEST_PROJECT);
    q.items[0].status = 'completed';
    atomicWrite(queueFile, q);

    const result = executionQueue.updateWorkflowId(TEST_PROJECT, 'english-name', 'wf-y');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('ITEM_NOT_FOUND');
  });
});

// ── Feature 15: completeByWorkflowId ─────────────────────────────────────────

describe('completeByWorkflowId', () => {
  test('依 workflowId 精確找到項目並標記完成', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'feature-x', workflow: 'quick' },
      { name: 'feature-y', workflow: 'quick' },
    ], 'test');

    // 先用 updateWorkflowId 綁定 workflowId
    executionQueue.updateWorkflowId(TEST_PROJECT, 'feature-x', 'wf-100');

    const ok = executionQueue.completeByWorkflowId(TEST_PROJECT, 'wf-100');
    expect(ok).toBe(true);

    const queue = executionQueue.readQueue(TEST_PROJECT);
    expect(queue.items[0].status).toBe('completed');
    expect(queue.items[0].completedAt).toBeDefined();
    expect(queue.items[1].status).toBe('pending');
  });

  test('workflowId 不存在時回傳 false', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'feature-z', workflow: 'quick' },
    ], 'test');

    const ok = executionQueue.completeByWorkflowId(TEST_PROJECT, 'wf-nonexistent');
    expect(ok).toBe(false);
  });

  test('workflowId 為 null/undefined 時回傳 false', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'feature-w', workflow: 'quick' },
    ], 'test');

    expect(executionQueue.completeByWorkflowId(TEST_PROJECT, null)).toBe(false);
    expect(executionQueue.completeByWorkflowId(TEST_PROJECT, undefined)).toBe(false);
  });

  test('已 completed 的項目不重複標記', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'feature-v', workflow: 'quick' },
    ], 'test');
    executionQueue.updateWorkflowId(TEST_PROJECT, 'feature-v', 'wf-200');

    // 第一次完成
    executionQueue.completeByWorkflowId(TEST_PROJECT, 'wf-200');
    // 第二次呼叫回傳 false（已完成）
    const ok = executionQueue.completeByWorkflowId(TEST_PROJECT, 'wf-200');
    expect(ok).toBe(false);
  });

  test('全部完成時佇列檔案自動刪除', () => {
    executionQueue.writeQueue(TEST_PROJECT, [
      { name: 'single-task', workflow: 'quick' },
    ], 'test');
    executionQueue.updateWorkflowId(TEST_PROJECT, 'single-task', 'wf-300');

    executionQueue.completeByWorkflowId(TEST_PROJECT, 'wf-300');

    // 佇列檔案應已被刪除
    const queueFile = require('path').join(paths.global.dir(TEST_PROJECT), 'execution-queue.json');
    expect(require('fs').existsSync(queueFile)).toBe(false);
  });

  test('佇列不存在時回傳 false', () => {
    const ok = executionQueue.completeByWorkflowId(
      '/tmp/no-queue-proj2-' + Date.now(),
      'wf-xxx'
    );
    expect(ok).toBe(false);
  });
});
