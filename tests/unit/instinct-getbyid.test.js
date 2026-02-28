'use strict';
/**
 * instinct-getbyid.test.js — Instinct.getById() 方法測試
 *
 * 測試情境：
 *   1. emit 後 getById 可取回正確 instinct
 *   2. 不存在的 ID 回傳 null
 *   3. 空 / 不存在 session 回傳 null
 *   4. 多個 instinct 中精確取回指定 ID
 */
const { test, expect, beforeEach, afterEach, describe } = require('bun:test');
const { mkdirSync, rmSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const instinct = require(join(SCRIPTS_LIB, 'instinct'));

// 每個 describe 使用獨立 session，避免測試間污染
function makeSession(suffix) {
  const id = `test_getbyid_${suffix}_${Date.now()}`;
  const dir = join(homedir(), '.overtone', 'sessions', id);
  return { id, dir };
}

// ════════════════════════════════════════════════════════
// Scenario 1：emit 後 getById 可取回正確 instinct
// ════════════════════════════════════════════════════════
describe('getById — 取得存在的 instinct', () => {
  let session;
  beforeEach(() => {
    session = makeSession('found');
    mkdirSync(session.dir, { recursive: true });
  });
  afterEach(() => {
    rmSync(session.dir, { recursive: true, force: true });
  });

  test('emit 後可用回傳的 ID 取回完整 instinct', () => {
    const emitted = instinct.emit(
      session.id,
      'tool_preferences',
      'user always uses bun',
      'prefer bun over npm',
      'npm-bun'
    );

    const found = instinct.getById(session.id, emitted.id);

    expect(found).not.toBeNull();
    expect(found.id).toBe(emitted.id);
    expect(found.tag).toBe('npm-bun');
    expect(found.type).toBe('tool_preferences');
    expect(found.confidence).toBe(emitted.confidence);
  });

  test('回傳的物件包含完整欄位（id, ts, lastSeen, type, trigger, action, tag, confidence, count）', () => {
    const emitted = instinct.emit(
      session.id,
      'user_corrections',
      'user corrected a mistake',
      'avoid this pattern',
      'correction-pattern'
    );

    const found = instinct.getById(session.id, emitted.id);

    expect(found).toHaveProperty('id');
    expect(found).toHaveProperty('ts');
    expect(found).toHaveProperty('lastSeen');
    expect(found).toHaveProperty('type');
    expect(found).toHaveProperty('trigger');
    expect(found).toHaveProperty('action');
    expect(found).toHaveProperty('tag');
    expect(found).toHaveProperty('confidence');
    expect(found).toHaveProperty('count');
  });
});

// ════════════════════════════════════════════════════════
// Scenario 2：不存在的 ID 回傳 null
// ════════════════════════════════════════════════════════
describe('getById — 不存在的 ID 回傳 null', () => {
  let session;
  beforeEach(() => {
    session = makeSession('notfound');
    mkdirSync(session.dir, { recursive: true });
  });
  afterEach(() => {
    rmSync(session.dir, { recursive: true, force: true });
  });

  test('session 有 instinct 但指定 ID 不存在 → 回傳 null', () => {
    instinct.emit(session.id, 'tool_preferences', 'trigger', 'action', 'some-tag');

    const result = instinct.getById(session.id, 'inst_nonexistent_0000');

    expect(result).toBeNull();
  });

  test('完全隨機的 ID 字串 → 回傳 null', () => {
    instinct.emit(session.id, 'error_resolutions', 'trigger', 'action', 'error-tag');

    const result = instinct.getById(session.id, 'inst_does_not_exist');

    expect(result).toBeNull();
  });
});

// ════════════════════════════════════════════════════════
// Scenario 3：空 / 不存在 session 回傳 null
// ════════════════════════════════════════════════════════
describe('getById — 空或不存在 session 回傳 null', () => {
  let session;
  beforeEach(() => {
    session = makeSession('empty');
    mkdirSync(session.dir, { recursive: true });
  });
  afterEach(() => {
    rmSync(session.dir, { recursive: true, force: true });
  });

  test('session 不存在（observations 檔案不存在）→ 回傳 null', () => {
    const nonExistentSession = `test_getbyid_ghost_${Date.now()}`;

    const result = instinct.getById(nonExistentSession, 'inst_any_id');

    expect(result).toBeNull();
  });

  test('session 存在但無任何 instinct → 回傳 null', () => {
    // session 目錄已建立但沒有 observations 檔案
    const result = instinct.getById(session.id, 'inst_any_id');

    expect(result).toBeNull();
  });
});

// ════════════════════════════════════════════════════════
// Scenario 4：多個 instinct 中精確取回指定 ID
// ════════════════════════════════════════════════════════
describe('getById — 多個 instinct 中精確取回', () => {
  let session;
  beforeEach(() => {
    session = makeSession('multi');
    mkdirSync(session.dir, { recursive: true });
  });
  afterEach(() => {
    rmSync(session.dir, { recursive: true, force: true });
  });

  test('多個 instinct 中，getById 只回傳精確匹配的那一個', () => {
    const a = instinct.emit(session.id, 'tool_preferences', 'trigger-a', 'action-a', 'tag-alpha');
    const b = instinct.emit(session.id, 'user_corrections', 'trigger-b', 'action-b', 'tag-beta');
    const c = instinct.emit(session.id, 'error_resolutions', 'trigger-c', 'action-c', 'tag-gamma');

    const foundA = instinct.getById(session.id, a.id);
    const foundB = instinct.getById(session.id, b.id);
    const foundC = instinct.getById(session.id, c.id);

    expect(foundA).not.toBeNull();
    expect(foundA.id).toBe(a.id);
    expect(foundA.tag).toBe('tag-alpha');

    expect(foundB).not.toBeNull();
    expect(foundB.id).toBe(b.id);
    expect(foundB.tag).toBe('tag-beta');

    expect(foundC).not.toBeNull();
    expect(foundC.id).toBe(c.id);
    expect(foundC.tag).toBe('tag-gamma');
  });

  test('confirm 更新後 getById 取到最新版本', () => {
    const emitted = instinct.emit(
      session.id,
      'repeated_workflows',
      'trigger',
      'action',
      'workflow-pattern'
    );
    const originalConfidence = emitted.confidence;

    instinct.confirm(session.id, emitted.id);

    const found = instinct.getById(session.id, emitted.id);

    expect(found).not.toBeNull();
    expect(found.confidence).toBeGreaterThan(originalConfidence);
  });

  test('ID prefix 相似但不同 → 各自精確匹配，不混淆', () => {
    // 確保即使 ID 有相似前綴也能精確比對
    const first = instinct.emit(session.id, 'tool_preferences', 'trigger-1', 'action-1', 'prefix-test-1');
    const second = instinct.emit(session.id, 'tool_preferences', 'trigger-2', 'action-2', 'prefix-test-2');

    // 用第一個的 ID 查詢，不應取到第二個
    const result = instinct.getById(session.id, first.id);
    expect(result.id).toBe(first.id);
    expect(result.id).not.toBe(second.id);
    expect(result.tag).toBe('prefix-test-1');
  });
});
