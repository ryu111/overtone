'use strict';
/**
 * queue-workflowid.test.js — 佇列 workflowId 整合單元測試
 *
 * 測試面向：
 *   C: updateWorkflowId API — 回寫 workflowId 到佇列項目
 *   D: failCurrent name 精確匹配 — 第三個 name 參數
 *   E: _isRelatedQueueItem 精確匹配 — 改用 === 取代 includes()
 *
 * 注意：這些測試在功能未實作前應為紅燈（failing）。
 */

const { test, expect, describe, afterEach } = require('bun:test');
const { mkdtempSync, rmSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const executionQueue = require(join(SCRIPTS_LIB, 'execution-queue'));
const sessionStopHandler = require(join(SCRIPTS_LIB, 'session-stop-handler'));

// ── 測試目錄隔離 ──

let testDir;

afterEach(() => {
  if (testDir) {
    rmSync(testDir, { recursive: true, force: true });
    testDir = null;
  }
});

function freshTestDir() {
  testDir = mkdtempSync(join(tmpdir(), 'queue-wfid-'));
  return testDir;
}

// ────────────────────────────────────────────────────────────────────────────
// Feature C: updateWorkflowId API
// ────────────────────────────────────────────────────────────────────────────

describe('Feature C: updateWorkflowId — 回寫 workflowId 到佇列項目', () => {

  test('C-1: 成功回寫 workflowId 到 in_progress 佇列項目', () => {
    const projectRoot = freshTestDir();
    executionQueue.writeQueue(projectRoot, [
      { name: 'feature-a', workflow: 'quick' },
    ], 'test');
    executionQueue.advanceToNext(projectRoot);

    const result = executionQueue.updateWorkflowId(projectRoot, 'feature-a', 'wf-123');

    expect(result.ok).toBe(true);
    const queue = executionQueue.readQueue(projectRoot);
    expect(queue.items[0].workflowId).toBe('wf-123');
  });

  test('C-2: 成功回寫 workflowId 到 pending 佇列項目', () => {
    const projectRoot = freshTestDir();
    executionQueue.writeQueue(projectRoot, [
      { name: 'feature-b', workflow: 'standard' },
    ], 'test');

    const result = executionQueue.updateWorkflowId(projectRoot, 'feature-b', 'wf-456');

    expect(result.ok).toBe(true);
    const queue = executionQueue.readQueue(projectRoot);
    expect(queue.items[0].workflowId).toBe('wf-456');
  });

  test('C-3: 佇列不存在時回傳 QUEUE_NOT_FOUND', () => {
    const projectRoot = freshTestDir();
    // 不建立任何佇列

    const result = executionQueue.updateWorkflowId(projectRoot, 'feature-a', 'wf-123');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('QUEUE_NOT_FOUND');
  });

  test('C-4: 佇列項目不存在時回傳 ITEM_NOT_FOUND', () => {
    const projectRoot = freshTestDir();
    executionQueue.writeQueue(projectRoot, [
      { name: 'feature-a', workflow: 'quick' },
    ], 'test');

    const result = executionQueue.updateWorkflowId(projectRoot, 'nonexistent', 'wf-123');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('ITEM_NOT_FOUND');
  });

  test('C-5: 其他佇列項目的 workflowId 不受影響', () => {
    const projectRoot = freshTestDir();
    executionQueue.writeQueue(projectRoot, [
      { name: 'feature-a', workflow: 'quick' },
      { name: 'feature-b', workflow: 'standard' },
    ], 'test');

    executionQueue.updateWorkflowId(projectRoot, 'feature-a', 'wf-123');

    const queue = executionQueue.readQueue(projectRoot);
    expect(queue.items[0].workflowId).toBe('wf-123');
    expect(queue.items[1].workflowId).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature D: failCurrent name 精確匹配
// ────────────────────────────────────────────────────────────────────────────

describe('Feature D: failCurrent — name 精確匹配（第三個參數）', () => {

  test('D-1: 提供正確 name 時成功標記失敗', () => {
    const projectRoot = freshTestDir();
    executionQueue.writeQueue(projectRoot, [
      { name: 'feature-a', workflow: 'quick' },
    ], 'test');
    executionQueue.advanceToNext(projectRoot);

    const result = executionQueue.failCurrent(projectRoot, 'some reason', 'feature-a');

    expect(result).toBe(true);
    const queue = executionQueue.readQueue(projectRoot);
    expect(queue.items[0].status).toBe('failed');
    expect(queue.items[0].failReason).toBe('some reason');
  });

  test('D-2: 提供錯誤 name 時回傳 false，不修改 status', () => {
    const projectRoot = freshTestDir();
    executionQueue.writeQueue(projectRoot, [
      { name: 'feature-a', workflow: 'quick' },
    ], 'test');
    executionQueue.advanceToNext(projectRoot);

    const result = executionQueue.failCurrent(projectRoot, 'reason', 'wrong-name');

    expect(result).toBe(false);
    const queue = executionQueue.readQueue(projectRoot);
    expect(queue.items[0].status).toBe('in_progress');
  });

  test('D-3: 不提供 name 時向後相容（匹配任何 in_progress）', () => {
    const projectRoot = freshTestDir();
    executionQueue.writeQueue(projectRoot, [
      { name: 'feature-a', workflow: 'quick' },
    ], 'test');
    executionQueue.advanceToNext(projectRoot);

    const result = executionQueue.failCurrent(projectRoot, 'reason');

    expect(result).toBe(true);
    const queue = executionQueue.readQueue(projectRoot);
    expect(queue.items[0].status).toBe('failed');
  });

  test('D-4: 無 in_progress 項目時回傳 false', () => {
    const projectRoot = freshTestDir();
    executionQueue.writeQueue(projectRoot, [
      { name: 'feature-a', workflow: 'quick' },
    ], 'test');
    // 不 advance，保持 pending

    const result = executionQueue.failCurrent(projectRoot, 'reason', 'feature-a');

    expect(result).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature E: _isRelatedQueueItem 精確匹配
// ────────────────────────────────────────────────────────────────────────────

describe('Feature E: _isRelatedQueueItem — 精確匹配（=== 取代 includes）', () => {
  const { _isRelatedQueueItem } = sessionStopHandler;

  test('E-1: 相同名稱（normalize 後）匹配成功', () => {
    expect(_isRelatedQueueItem('auth-feature', 'auth-feature')).toBe(true);
  });

  test('E-2: 大小寫不同但 normalize 後相同時匹配成功', () => {
    // 'Auth-Feature' → normalize → 'authfeature'
    // 'auth_feature' → normalize → 'authfeature'
    expect(_isRelatedQueueItem('Auth-Feature', 'auth_feature')).toBe(true);
  });

  test('E-3: 子字串關係不再匹配（精確匹配修復）', () => {
    // 'auth' normalize → 'auth'
    // 'oauth-refactor' normalize → 'oauthrefactor'
    // 舊邏輯：'oauthrefactor'.includes('auth') → true（false positive）
    // 新邏輯：'auth' !== 'oauthrefactor' → false
    expect(_isRelatedQueueItem('auth', 'oauth-refactor')).toBe(false);
  });

  test('E-4: 舊邏輯的 false positive 案例：new-kuji vs kuji', () => {
    // 'new-kuji' normalize → 'newkuji'
    // 'kuji' normalize → 'kuji'
    // 舊邏輯：'newkuji'.includes('kuji') → true（false positive）
    // 新邏輯：'newkuji' !== 'kuji' → false
    expect(_isRelatedQueueItem('new-kuji', 'kuji')).toBe(false);
  });

  test('E-5: itemName 為空字串時回傳 false', () => {
    expect(_isRelatedQueueItem('', 'feature-a')).toBe(false);
  });

  test('E-5b: featureName 為空字串時回傳 false', () => {
    expect(_isRelatedQueueItem('feature-a', '')).toBe(false);
  });

  test('E-6: 完全相同名稱匹配成功', () => {
    expect(_isRelatedQueueItem('queue-workflowid-integration', 'queue-workflowid-integration')).toBe(true);
  });

  test('E-extra: 前綴不匹配（item 比 feature 短）', () => {
    // 'kuji' !== 'newkuji'
    expect(_isRelatedQueueItem('kuji', 'new-kuji')).toBe(false);
  });
});
