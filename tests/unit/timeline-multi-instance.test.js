'use strict';
/**
 * timeline-multi-instance.test.js — Feature 3: timeline.js 多實例隔離
 *
 * BDD 規格：specs/features/in-progress/workflow-multi-instance/bdd.md
 *
 * Scenario 3-1: emit 帶 workflowId 寫入新路徑
 * Scenario 3-2: emit 無 workflowId 時 fallback 至根層
 * Scenario 3-3: 兩個 workflow 的 timeline 互不影響
 * Scenario 3-4: query 帶 workflowId 只查對應 timeline
 */
const { test, expect, beforeEach, afterEach, describe } = require('bun:test');
const { mkdirSync, rmSync, existsSync, readFileSync, appendFileSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const { mkdtempSync } = require('fs');
const { tmpdir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const timeline = require(join(SCRIPTS_LIB, 'timeline'));
const paths = require(join(SCRIPTS_LIB, 'paths'));

// 建立獨立的 session（prefix test_ 以免被 cleanupOldSessions 清除）
function makeSession(suffix) {
  const id = `test_tlmi_${suffix}_${Date.now()}`;
  const dir = join(homedir(), '.overtone', 'sessions', id);
  return { id, dir };
}

// 建立 workflow 目錄結構
function makeWorkflowDir(session, workflowId) {
  const wfDir = paths.session.workflowDir(session.id, workflowId);
  mkdirSync(wfDir, { recursive: true });
  return wfDir;
}

// 計算 timeline 檔案行數
function countLines(filePath) {
  if (!existsSync(filePath)) return 0;
  const content = readFileSync(filePath, 'utf8').trim();
  if (!content) return 0;
  return content.split('\n').filter(Boolean).length;
}

// ════════════════════════════════════════════════════════
// Scenario 3-1: emit 帶 workflowId 寫入新路徑
// ════════════════════════════════════════════════════════

describe('Scenario 3-1: emit 帶 workflowId 寫入新路徑', () => {
  let session;
  const workflowId = 'wf-test-3-1';

  beforeEach(() => {
    session = makeSession('s31');
    mkdirSync(session.dir, { recursive: true });
    makeWorkflowDir(session, workflowId);
  });
  afterEach(() => {
    rmSync(session.dir, { recursive: true, force: true });
  });

  test('事件寫入 workflows/{workflowId}/timeline.jsonl', () => {
    timeline.emit(session.id, workflowId, 'workflow:start', { wfType: 'standard' });
    const wfTimelinePath = paths.session.workflowTimeline(session.id, workflowId);
    expect(existsSync(wfTimelinePath)).toBe(true);
    expect(countLines(wfTimelinePath)).toBe(1);
  });

  test('根層 timeline.jsonl 不受影響', () => {
    const rootTimelinePath = paths.session.timeline(session.id);
    const rootBefore = existsSync(rootTimelinePath) ? countLines(rootTimelinePath) : 0;
    timeline.emit(session.id, workflowId, 'workflow:start', {});
    const rootAfter = existsSync(rootTimelinePath) ? countLines(rootTimelinePath) : 0;
    expect(rootAfter).toBe(rootBefore);
  });

  test('emit 回傳包含正確欄位的事件物件', () => {
    const event = timeline.emit(session.id, workflowId, 'workflow:start', { extra: 'data' });
    expect(event.type).toBe('workflow:start');
    expect(event.category).toBe('workflow');
    expect(event.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(event.extra).toBe('data');
  });

  test('寫入的事件可用 query 讀回', () => {
    timeline.emit(session.id, workflowId, 'workflow:start', { wfType: 'standard' });
    const events = timeline.query(session.id, workflowId);
    expect(events.length).toBe(1);
    expect(events[0].type).toBe('workflow:start');
    expect(events[0].wfType).toBe('standard');
  });
});

// ════════════════════════════════════════════════════════
// Scenario 3-2: emit 無 workflowId 時 fallback 至根層
// ════════════════════════════════════════════════════════

describe('Scenario 3-2: emit 無 workflowId 時 fallback 至根層', () => {
  let session;

  beforeEach(() => {
    session = makeSession('s32');
    mkdirSync(session.dir, { recursive: true });
  });
  afterEach(() => {
    rmSync(session.dir, { recursive: true, force: true });
  });

  test('workflowId 為 null 時寫入根層 timeline.jsonl', () => {
    timeline.emit(session.id, null, 'workflow:start', {});
    const rootTimelinePath = paths.session.timeline(session.id);
    expect(existsSync(rootTimelinePath)).toBe(true);
    expect(countLines(rootTimelinePath)).toBe(1);
  });

  test('workflowId 為 null 時不拋錯誤', () => {
    expect(() => timeline.emit(session.id, null, 'workflow:start', {})).not.toThrow();
  });

  test('舊 API（2 參數）仍寫入根層', () => {
    timeline.emit(session.id, 'workflow:start', {});
    const rootTimelinePath = paths.session.timeline(session.id);
    expect(existsSync(rootTimelinePath)).toBe(true);
    expect(countLines(rootTimelinePath)).toBe(1);
  });
});

// ════════════════════════════════════════════════════════
// Scenario 3-3: 兩個 workflow 的 timeline 互不影響
// ════════════════════════════════════════════════════════

describe('Scenario 3-3: 兩個 workflow 的 timeline 互不影響', () => {
  let session;
  const workflowIdA = 'wf-A-test-3-3';
  const workflowIdB = 'wf-B-test-3-3';

  beforeEach(() => {
    session = makeSession('s33');
    mkdirSync(session.dir, { recursive: true });
    makeWorkflowDir(session, workflowIdA);
    makeWorkflowDir(session, workflowIdB);
  });
  afterEach(() => {
    rmSync(session.dir, { recursive: true, force: true });
  });

  test('對 A emit 3 筆，對 B emit 2 筆，query 各自正確', () => {
    timeline.emit(session.id, workflowIdA, 'workflow:start', { wf: 'A' });
    timeline.emit(session.id, workflowIdA, 'stage:start', { stage: 'DEV' });
    timeline.emit(session.id, workflowIdA, 'stage:complete', { stage: 'DEV', result: 'pass' });

    timeline.emit(session.id, workflowIdB, 'workflow:start', { wf: 'B' });
    timeline.emit(session.id, workflowIdB, 'workflow:complete', { wf: 'B' });

    const eventsA = timeline.query(session.id, workflowIdA);
    const eventsB = timeline.query(session.id, workflowIdB);

    expect(eventsA.length).toBe(3);
    expect(eventsB.length).toBe(2);
  });

  test('A 的事件不出現在 B 的 query 結果', () => {
    timeline.emit(session.id, workflowIdA, 'workflow:start', { marker: 'only-in-A' });
    timeline.emit(session.id, workflowIdB, 'workflow:start', { marker: 'only-in-B' });

    const eventsB = timeline.query(session.id, workflowIdB);
    expect(eventsB.every(e => e.marker !== 'only-in-A')).toBe(true);
  });

  test('B 的事件不出現在 A 的 query 結果', () => {
    timeline.emit(session.id, workflowIdA, 'workflow:start', { marker: 'only-in-A' });
    timeline.emit(session.id, workflowIdB, 'workflow:start', { marker: 'only-in-B' });

    const eventsA = timeline.query(session.id, workflowIdA);
    expect(eventsA.every(e => e.marker !== 'only-in-B')).toBe(true);
  });
});

// ════════════════════════════════════════════════════════
// Scenario 3-4: query 帶 workflowId 只查對應 timeline
// ════════════════════════════════════════════════════════

describe('Scenario 3-4: query 帶 workflowId 只查對應 timeline', () => {
  let session;
  const workflowId = 'wf-test-3-4';

  beforeEach(() => {
    session = makeSession('s34');
    mkdirSync(session.dir, { recursive: true });
    makeWorkflowDir(session, workflowId);

    // 預填 workflow timeline：5 筆
    for (let i = 0; i < 5; i++) {
      timeline.emit(session.id, workflowId, 'workflow:start', { seq: i });
    }
    // 預填根層 timeline：3 筆（舊格式）
    timeline.emit(session.id, 'workflow:start', {});
    timeline.emit(session.id, 'workflow:complete', {});
    timeline.emit(session.id, 'stage:start', { stage: 'DEV' });
  });
  afterEach(() => {
    rmSync(session.dir, { recursive: true, force: true });
  });

  test('query 帶 workflowId 回傳 5 筆（新路徑事件）', () => {
    const events = timeline.query(session.id, workflowId);
    expect(events.length).toBe(5);
  });

  test('query 帶 workflowId 不混入根層舊事件', () => {
    const events = timeline.query(session.id, workflowId);
    // workflow timeline 的事件有 seq 欄位，根層沒有
    expect(events.every(e => e.seq !== undefined)).toBe(true);
  });

  test('query 不帶 workflowId（舊 API）回傳根層 3 筆', () => {
    const events = timeline.query(session.id);
    expect(events.length).toBe(3);
  });

  test('query 帶 workflowId 支援 filter', () => {
    const events = timeline.query(session.id, workflowId, { type: 'workflow:start' });
    expect(events.length).toBe(5);
    expect(events.every(e => e.type === 'workflow:start')).toBe(true);
  });
});
