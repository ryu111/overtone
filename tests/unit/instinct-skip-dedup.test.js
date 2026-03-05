'use strict';
/**
 * instinct-skip-dedup.test.js — skipDedup + extraFields 行為測試
 *
 * 覆蓋 BDD Feature 1 + 2：
 *   Feature 1: skipDedup 機制（instinct.emit options）
 *   Feature 2: extraFields 機制（instinct.emit options）
 */
const { test, expect, beforeEach, afterEach, describe } = require('bun:test');
const { mkdirSync, rmSync, existsSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const instinct = require(join(SCRIPTS_LIB, 'knowledge/instinct'));

// ── 輔助工具 ──

function makeSession(suffix) {
  const id = `test_skipdedup_${suffix}_${Date.now()}`;
  const dir = join(homedir(), '.overtone', 'sessions', id);
  return { id, dir };
}

// ════════════════════════════════════════════════════════
// Feature 1: skipDedup 機制
// ════════════════════════════════════════════════════════

describe('Feature 1: skipDedup 機制', () => {
  let session;

  beforeEach(() => {
    session = makeSession('f1');
    mkdirSync(session.dir, { recursive: true });
  });

  afterEach(() => {
    rmSync(session.dir, { recursive: true, force: true });
  });

  // Scenario 1-1
  test('Scenario 1-1: skipDedup=true 時每次呼叫建立獨立記錄', () => {
    const tag = 'journal-abc';
    const type = 'intent_journal';

    instinct.emit(session.id, type, '第一次 prompt', 'action1', tag, { skipDedup: true });
    instinct.emit(session.id, type, '第二次 prompt', 'action2', tag, { skipDedup: true });

    const results = instinct.query(session.id, { type });
    expect(results).toHaveLength(2);
    // 確認兩筆都是獨立物件（不是同一 id）
    expect(results[0].id).not.toBe(results[1].id);
  });

  // Scenario 1-2
  test('Scenario 1-2: emit 不帶 options 時維持原有 tag+type 去重行為', () => {
    const tag = 'pref-x';
    const type = 'tool_preferences';

    instinct.emit(session.id, type, 'first trigger', 'action', tag);
    // 先取得初始 confidence
    const before = instinct.query(session.id, { tag, type })[0];
    const beforeConf = before.confidence;

    instinct.emit(session.id, type, 'second trigger', 'action updated', tag);

    const results = instinct.query(session.id, { tag, type });
    expect(results).toHaveLength(1);
    // confidence 應已更新（+0.05 confirm boost）
    expect(results[0].confidence).toBeGreaterThan(beforeConf);
  });

  // Scenario 1-3
  test('Scenario 1-3: emit 帶 options={} 時行為等同於不帶 options（向後相容）', () => {
    const tag = 'tag-test-1-3';
    const type = 'tool_preferences';

    instinct.emit(session.id, type, 'first', 'action', tag, {});
    instinct.emit(session.id, type, 'second', 'action', tag, {});

    const results = instinct.query(session.id, { tag, type });
    expect(results).toHaveLength(1);
  });

  // Scenario 1-4
  test('Scenario 1-4: emit 帶 skipDedup=false 時行為等同於不帶 options（明確關閉去重）', () => {
    const tag = 'tag-test-1-4';
    const type = 'tool_preferences';

    instinct.emit(session.id, type, 'first', 'action', tag, { skipDedup: false });
    instinct.emit(session.id, type, 'second', 'action', tag, { skipDedup: false });

    const results = instinct.query(session.id, { tag, type });
    expect(results).toHaveLength(1);
  });
});

// ════════════════════════════════════════════════════════
// Feature 2: extraFields 機制
// ════════════════════════════════════════════════════════

describe('Feature 2: extraFields 機制', () => {
  let session;

  beforeEach(() => {
    session = makeSession('f2');
    mkdirSync(session.dir, { recursive: true });
  });

  afterEach(() => {
    rmSync(session.dir, { recursive: true, force: true });
  });

  // Scenario 2-1
  test('Scenario 2-1: emit 帶 extraFields 時新建記錄包含額外欄位', () => {
    const tag = `journal-${Date.now().toString(36)}`;
    const record = instinct.emit(
      session.id,
      'intent_journal',
      '幫我寫一個登入頁面',
      '工作流：standard',
      tag,
      { skipDedup: true, extraFields: { sessionResult: 'pending', workflowType: 'standard' } }
    );

    expect(record.sessionResult).toBe('pending');
    expect(record.workflowType).toBe('standard');
    // 標準欄位仍正確
    expect(record.id).toBeDefined();
    expect(record.ts).toBeDefined();
    expect(record.type).toBe('intent_journal');
    expect(record.trigger).toBe('幫我寫一個登入頁面');
    expect(record.action).toBe('工作流：standard');
    expect(record.tag).toBe(tag);
    expect(typeof record.confidence).toBe('number');
    expect(record.count).toBe(1);
  });

  // Scenario 2-2
  test('Scenario 2-2: extraFields 不影響已存在記錄的去重邏輯（skipDedup=false）', () => {
    const tag = 'tag-test-2-2';
    const type = 'tool_preferences';

    instinct.emit(session.id, type, 'first', 'action', tag);
    instinct.emit(session.id, type, 'second', 'action', tag, { extraFields: { foo: 'bar' } });

    const results = instinct.query(session.id, { tag, type });
    expect(results).toHaveLength(1);
  });

  // Scenario 2-3
  test('Scenario 2-3: emit 不帶 extraFields 時新建記錄不含多餘欄位', () => {
    const tag = `tag-no-extra-${Date.now().toString(36)}`;
    const record = instinct.emit(
      session.id,
      'tool_preferences',
      '測試 trigger',
      '測試 action',
      tag
    );

    expect(record.sessionResult).toBeUndefined();
    expect(record.workflowType).toBeUndefined();
  });
});
