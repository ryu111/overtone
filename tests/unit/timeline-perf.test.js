'use strict';
/**
 * timeline-perf.test.js — timeline.js latest() 與 query() 效能優化測試
 *
 * 測試情境：
 *   1. latest() 反向掃描結果與全量 query 一致
 *   2. latest() 找不到時回傳 null
 *   3. query() limit 快速路徑（無 type/category）結果正確
 *   4. query() 有 type + limit 時走完整路徑，結果正確
 */
const { test, expect, beforeEach, afterEach, describe } = require('bun:test');
const { mkdirSync, rmSync, appendFileSync, writeFileSync, existsSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const timeline = require(join(SCRIPTS_LIB, 'timeline'));
const paths = require(join(SCRIPTS_LIB, 'paths'));

// 為每個測試建立獨立 session
function makeSession(suffix) {
  const id = `test_tlperf_${suffix}_${Date.now()}`;
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
// Scenario 1：latest() 反向掃描與全量 query 結果一致
// ════════════════════════════════════════════════════════
describe('latest() — 反向掃描正確性', () => {
  let session;
  beforeEach(() => {
    session = makeSession('latest');
    mkdirSync(session.dir, { recursive: true });
  });
  afterEach(() => {
    rmSync(session.dir, { recursive: true, force: true });
  });

  test('單筆 stage:complete → latest() 回傳該筆，type 正確', () => {
    appendEvent(session.id, makeEvent('stage:complete', 'stage', { stage: 'DEV', result: 'pass' }));

    const result = timeline.latest(session.id, 'stage:complete');
    expect(result).not.toBeNull();
    expect(result.type).toBe('stage:complete');
    expect(result.stage).toBe('DEV');
    expect(result.result).toBe('pass');
  });

  test('多筆相同 type → latest() 回傳最後一筆', () => {
    appendEvent(session.id, makeEvent('stage:complete', 'stage', { stage: 'DEV', result: 'fail', ts: '2026-01-01T00:00:00.000Z' }));
    appendEvent(session.id, makeEvent('stage:complete', 'stage', { stage: 'DEV', result: 'pass', ts: '2026-01-01T00:01:00.000Z' }));
    appendEvent(session.id, makeEvent('stage:complete', 'stage', { stage: 'REVIEW', result: 'pass', ts: '2026-01-01T00:02:00.000Z' }));

    const result = timeline.latest(session.id, 'stage:complete');
    expect(result).not.toBeNull();
    // 應回傳最後一筆：REVIEW pass
    expect(result.stage).toBe('REVIEW');
    expect(result.result).toBe('pass');
  });

  test('混合 type 時 latest() 跳過不匹配的行', () => {
    appendEvent(session.id, makeEvent('workflow:start', 'workflow'));
    appendEvent(session.id, makeEvent('stage:start', 'stage', { stage: 'DEV' }));
    appendEvent(session.id, makeEvent('agent:delegate', 'agent', { agent: 'developer' }));
    appendEvent(session.id, makeEvent('stage:complete', 'stage', { stage: 'DEV', result: 'pass' }));
    appendEvent(session.id, makeEvent('workflow:complete', 'workflow'));

    const result = timeline.latest(session.id, 'stage:complete');
    expect(result).not.toBeNull();
    expect(result.type).toBe('stage:complete');
    expect(result.stage).toBe('DEV');
  });

  test('latest() 結果與 query({ type, limit: 1 }) 一致', () => {
    appendEvent(session.id, makeEvent('stage:complete', 'stage', { stage: 'DEV', result: 'fail' }));
    appendEvent(session.id, makeEvent('agent:done', 'agent'));
    appendEvent(session.id, makeEvent('stage:complete', 'stage', { stage: 'REVIEW', result: 'pass' }));

    const fromLatest = timeline.latest(session.id, 'stage:complete');
    const fromQuery = timeline.query(session.id, { type: 'stage:complete', limit: 1 });

    expect(fromLatest).not.toBeNull();
    expect(fromQuery.length).toBe(1);
    // 兩者應指向相同的事件
    expect(fromLatest.type).toBe(fromQuery[0].type);
    expect(fromLatest.stage).toBe(fromQuery[0].stage);
    expect(fromLatest.result).toBe(fromQuery[0].result);
  });
});

// ════════════════════════════════════════════════════════
// Scenario 2：latest() 找不到時回傳 null
// ════════════════════════════════════════════════════════
describe('latest() — null 情境', () => {
  let session;
  beforeEach(() => {
    session = makeSession('null');
    mkdirSync(session.dir, { recursive: true });
  });
  afterEach(() => {
    rmSync(session.dir, { recursive: true, force: true });
  });

  test('無匹配 type 時回傳 null', () => {
    appendEvent(session.id, makeEvent('workflow:start', 'workflow'));
    appendEvent(session.id, makeEvent('stage:start', 'stage', { stage: 'DEV' }));

    const result = timeline.latest(session.id, 'workflow:complete');
    expect(result).toBeNull();
  });

  test('timeline 檔案不存在時回傳 null', () => {
    const result = timeline.latest(session.id, 'stage:complete');
    expect(result).toBeNull();
  });

  test('timeline 檔案存在但為空時回傳 null', () => {
    const filePath = paths.session.timeline(session.id);
    mkdirSync(require('path').dirname(filePath), { recursive: true });
    writeFileSync(filePath, '', 'utf8');

    const result = timeline.latest(session.id, 'stage:complete');
    expect(result).toBeNull();
  });
});

// ════════════════════════════════════════════════════════
// Scenario 3：query() limit 快速路徑（無 type/category）
// ════════════════════════════════════════════════════════
describe('query() — limit 快速路徑', () => {
  let session;
  beforeEach(() => {
    session = makeSession('limit');
    mkdirSync(session.dir, { recursive: true });

    // 寫入 5 筆不同 type 事件
    appendEvent(session.id, makeEvent('workflow:start', 'workflow'));
    appendEvent(session.id, makeEvent('stage:start', 'stage', { stage: 'DEV' }));
    appendEvent(session.id, makeEvent('agent:delegate', 'agent', { agent: 'developer' }));
    appendEvent(session.id, makeEvent('agent:complete', 'agent', { agent: 'developer' }));
    appendEvent(session.id, makeEvent('workflow:complete', 'workflow'));
  });
  afterEach(() => {
    rmSync(session.dir, { recursive: true, force: true });
  });

  test('limit:2 無 type/category → 回傳最後 2 筆', () => {
    const result = timeline.query(session.id, { limit: 2 });
    expect(result.length).toBe(2);
    expect(result[0].type).toBe('agent:complete');
    expect(result[1].type).toBe('workflow:complete');
  });

  test('limit:1 無 type/category → 回傳最後 1 筆', () => {
    const result = timeline.query(session.id, { limit: 1 });
    expect(result.length).toBe(1);
    expect(result[0].type).toBe('workflow:complete');
  });

  test('limit 超過總數 → 回傳所有事件', () => {
    const result = timeline.query(session.id, { limit: 100 });
    expect(result.length).toBe(5);
  });

  test('limit:0 視為 falsy → 回傳所有事件（不走快速路徑）', () => {
    // filter.limit = 0 is falsy，不走快速路徑，也不做 slice
    const result = timeline.query(session.id, { limit: 0 });
    expect(result.length).toBe(5);
  });

  test('limit 快速路徑結果與完整路徑一致', () => {
    // 完整路徑：先全量解析再 slice
    // 快速路徑：先 slice 再解析
    // 兩者應得到相同結果
    const fastPath = timeline.query(session.id, { limit: 3 });
    // 驗證順序和型態
    expect(fastPath.length).toBe(3);
    expect(fastPath[0].type).toBe('agent:delegate');
    expect(fastPath[1].type).toBe('agent:complete');
    expect(fastPath[2].type).toBe('workflow:complete');
  });
});

// ════════════════════════════════════════════════════════
// Scenario 4：query() type + limit 走完整路徑
// ════════════════════════════════════════════════════════
describe('query() — type + limit 完整路徑', () => {
  let session;
  beforeEach(() => {
    session = makeSession('type-limit');
    mkdirSync(session.dir, { recursive: true });

    // 寫入多筆，包含多個 stage:complete
    appendEvent(session.id, makeEvent('workflow:start', 'workflow'));
    appendEvent(session.id, makeEvent('stage:complete', 'stage', { stage: 'DEV', result: 'fail' }));
    appendEvent(session.id, makeEvent('stage:complete', 'stage', { stage: 'DEV', result: 'pass' }));
    appendEvent(session.id, makeEvent('stage:complete', 'stage', { stage: 'REVIEW', result: 'pass' }));
    appendEvent(session.id, makeEvent('workflow:complete', 'workflow'));
  });
  afterEach(() => {
    rmSync(session.dir, { recursive: true, force: true });
  });

  test('type + limit:1 → 回傳最後一筆匹配的 stage:complete', () => {
    const result = timeline.query(session.id, { type: 'stage:complete', limit: 1 });
    expect(result.length).toBe(1);
    expect(result[0].type).toBe('stage:complete');
    expect(result[0].stage).toBe('REVIEW');
    expect(result[0].result).toBe('pass');
  });

  test('type + limit:2 → 回傳最後 2 筆匹配的 stage:complete', () => {
    const result = timeline.query(session.id, { type: 'stage:complete', limit: 2 });
    expect(result.length).toBe(2);
    expect(result[0].stage).toBe('DEV');
    expect(result[0].result).toBe('pass');
    expect(result[1].stage).toBe('REVIEW');
  });

  test('category + limit:1 走完整路徑，回傳最後 1 筆 workflow 事件', () => {
    const result = timeline.query(session.id, { category: 'workflow', limit: 1 });
    expect(result.length).toBe(1);
    expect(result[0].type).toBe('workflow:complete');
  });

  test('type 不存在 + limit → 回傳空陣列', () => {
    const result = timeline.query(session.id, { type: 'nonexistent:type', limit: 5 });
    expect(result).toEqual([]);
  });

  test('type:stage:complete 無 limit → 回傳所有 3 筆', () => {
    const result = timeline.query(session.id, { type: 'stage:complete' });
    expect(result.length).toBe(3);
  });
});
