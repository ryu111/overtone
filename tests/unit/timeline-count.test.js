'use strict';
/**
 * timeline-count.test.js — timeline.js count() 函式測試
 *
 * 測試情境：
 *   1. 無 filter → 只計行數（不解析 JSON）
 *   2. 按 type 計數
 *   3. 按 category 計數
 *   4. 空檔案 / 不存在檔案 → 回傳 0
 *   5. 同時有 type + category
 */
const { test, expect, beforeEach, afterEach, describe } = require('bun:test');
const { mkdirSync, rmSync, appendFileSync, writeFileSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const timeline = require(join(SCRIPTS_LIB, 'timeline'));
const paths = require(join(SCRIPTS_LIB, 'paths'));

// 為每個測試建立獨立 session
function makeSession(suffix) {
  const id = `test_tlcount_${suffix}_${Date.now()}`;
  const dir = join(homedir(), '.overtone', 'sessions', id);
  return { id, dir };
}

// 直接 append 一行到 timeline JSONL（繞過 emit() 的 counter 邏輯）
function appendEvent(sessionId, event) {
  const filePath = paths.session.timeline(sessionId);
  mkdirSync(require('path').dirname(filePath), { recursive: true });
  appendFileSync(filePath, JSON.stringify(event) + '\n', 'utf8');
}

// 建立測試事件物件
function makeEvent(type, category, extra = {}) {
  return { ts: new Date().toISOString(), type, category, label: type, ...extra };
}

// ════════════════════════════════════════════════════════
// Scenario 1：無 filter → 計算所有行數
// ════════════════════════════════════════════════════════
describe('count() — 無 filter', () => {
  let session;
  beforeEach(() => {
    session = makeSession('nofilter');
    mkdirSync(session.dir, { recursive: true });
  });
  afterEach(() => {
    rmSync(session.dir, { recursive: true, force: true });
  });

  test('單筆事件 → 回傳 1', () => {
    appendEvent(session.id, makeEvent('workflow:start', 'workflow'));
    expect(timeline.count(session.id)).toBe(1);
  });

  test('多筆不同 type 事件 → 回傳總行數', () => {
    appendEvent(session.id, makeEvent('workflow:start', 'workflow'));
    appendEvent(session.id, makeEvent('stage:start', 'stage', { stage: 'DEV' }));
    appendEvent(session.id, makeEvent('agent:delegate', 'agent', { agent: 'developer' }));
    appendEvent(session.id, makeEvent('agent:complete', 'agent', { agent: 'developer' }));
    appendEvent(session.id, makeEvent('stage:complete', 'stage', { stage: 'DEV', result: 'pass' }));
    appendEvent(session.id, makeEvent('workflow:complete', 'workflow'));
    expect(timeline.count(session.id)).toBe(6);
  });

  test('空 filter 物件 → 與無 filter 結果相同', () => {
    appendEvent(session.id, makeEvent('stage:complete', 'stage', { stage: 'DEV', result: 'pass' }));
    appendEvent(session.id, makeEvent('workflow:complete', 'workflow'));
    expect(timeline.count(session.id, {})).toBe(2);
  });
});

// ════════════════════════════════════════════════════════
// Scenario 2：按 type 計數
// ════════════════════════════════════════════════════════
describe('count() — 按 type 篩選', () => {
  let session;
  beforeEach(() => {
    session = makeSession('type');
    mkdirSync(session.dir, { recursive: true });

    appendEvent(session.id, makeEvent('workflow:start', 'workflow'));
    appendEvent(session.id, makeEvent('stage:complete', 'stage', { stage: 'DEV', result: 'fail' }));
    appendEvent(session.id, makeEvent('stage:complete', 'stage', { stage: 'DEV', result: 'pass' }));
    appendEvent(session.id, makeEvent('stage:complete', 'stage', { stage: 'REVIEW', result: 'pass' }));
    appendEvent(session.id, makeEvent('workflow:complete', 'workflow'));
  });
  afterEach(() => {
    rmSync(session.dir, { recursive: true, force: true });
  });

  test('type:stage:complete → 回傳 3', () => {
    expect(timeline.count(session.id, { type: 'stage:complete' })).toBe(3);
  });

  test('type:workflow:start → 回傳 1', () => {
    expect(timeline.count(session.id, { type: 'workflow:start' })).toBe(1);
  });

  test('type 不存在 → 回傳 0', () => {
    expect(timeline.count(session.id, { type: 'nonexistent:type' })).toBe(0);
  });
});

// ════════════════════════════════════════════════════════
// Scenario 3：按 category 計數
// ════════════════════════════════════════════════════════
describe('count() — 按 category 篩選', () => {
  let session;
  beforeEach(() => {
    session = makeSession('category');
    mkdirSync(session.dir, { recursive: true });

    appendEvent(session.id, makeEvent('workflow:start', 'workflow'));
    appendEvent(session.id, makeEvent('stage:start', 'stage', { stage: 'DEV' }));
    appendEvent(session.id, makeEvent('agent:delegate', 'agent', { agent: 'developer' }));
    appendEvent(session.id, makeEvent('agent:complete', 'agent', { agent: 'developer' }));
    appendEvent(session.id, makeEvent('stage:complete', 'stage', { stage: 'DEV', result: 'pass' }));
    appendEvent(session.id, makeEvent('workflow:complete', 'workflow'));
  });
  afterEach(() => {
    rmSync(session.dir, { recursive: true, force: true });
  });

  test('category:workflow → 回傳 2（start + complete）', () => {
    expect(timeline.count(session.id, { category: 'workflow' })).toBe(2);
  });

  test('category:stage → 回傳 2（start + complete）', () => {
    expect(timeline.count(session.id, { category: 'stage' })).toBe(2);
  });

  test('category:agent → 回傳 2（delegate + complete）', () => {
    expect(timeline.count(session.id, { category: 'agent' })).toBe(2);
  });

  test('category 不存在 → 回傳 0', () => {
    expect(timeline.count(session.id, { category: 'nonexistent' })).toBe(0);
  });
});

// ════════════════════════════════════════════════════════
// Scenario 4：空檔案 / 不存在檔案 → 回傳 0
// ════════════════════════════════════════════════════════
describe('count() — 邊界情境', () => {
  let session;
  beforeEach(() => {
    session = makeSession('edge');
    mkdirSync(session.dir, { recursive: true });
  });
  afterEach(() => {
    rmSync(session.dir, { recursive: true, force: true });
  });

  test('timeline 檔案不存在 → 回傳 0', () => {
    expect(timeline.count(session.id)).toBe(0);
  });

  test('timeline 檔案存在但為空 → 回傳 0', () => {
    const filePath = paths.session.timeline(session.id);
    mkdirSync(require('path').dirname(filePath), { recursive: true });
    writeFileSync(filePath, '', 'utf8');
    expect(timeline.count(session.id)).toBe(0);
  });

  test('空檔案 + type filter → 回傳 0', () => {
    const filePath = paths.session.timeline(session.id);
    mkdirSync(require('path').dirname(filePath), { recursive: true });
    writeFileSync(filePath, '', 'utf8');
    expect(timeline.count(session.id, { type: 'stage:complete' })).toBe(0);
  });

  test('檔案不存在 + category filter → 回傳 0', () => {
    expect(timeline.count(session.id, { category: 'workflow' })).toBe(0);
  });
});

// ════════════════════════════════════════════════════════
// Scenario 5：同時有 type + category
// ════════════════════════════════════════════════════════
describe('count() — type + category 同時篩選', () => {
  let session;
  beforeEach(() => {
    session = makeSession('both');
    mkdirSync(session.dir, { recursive: true });

    appendEvent(session.id, makeEvent('workflow:start', 'workflow'));
    appendEvent(session.id, makeEvent('stage:start', 'stage', { stage: 'DEV' }));
    appendEvent(session.id, makeEvent('stage:complete', 'stage', { stage: 'DEV', result: 'fail' }));
    appendEvent(session.id, makeEvent('stage:complete', 'stage', { stage: 'DEV', result: 'pass' }));
    appendEvent(session.id, makeEvent('stage:complete', 'stage', { stage: 'REVIEW', result: 'pass' }));
    appendEvent(session.id, makeEvent('workflow:complete', 'workflow'));
  });
  afterEach(() => {
    rmSync(session.dir, { recursive: true, force: true });
  });

  test('type:stage:complete + category:stage → 回傳 3', () => {
    expect(timeline.count(session.id, { type: 'stage:complete', category: 'stage' })).toBe(3);
  });

  test('type:stage:start + category:stage → 回傳 1', () => {
    expect(timeline.count(session.id, { type: 'stage:start', category: 'stage' })).toBe(1);
  });

  test('type:stage:complete + category:workflow → type 與 category 不匹配 → 回傳 0', () => {
    // stage:complete 的 category 是 stage，不是 workflow
    expect(timeline.count(session.id, { type: 'stage:complete', category: 'workflow' })).toBe(0);
  });

  test('type:workflow:start + category:workflow → 回傳 1', () => {
    expect(timeline.count(session.id, { type: 'workflow:start', category: 'workflow' })).toBe(1);
  });
});
