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
const { mkdirSync, rmSync, existsSync, readFileSync } = require('fs');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');
const { makeTmpProject, createCtx, cleanupProject } = require('../helpers/session-factory');

const timeline = require(join(SCRIPTS_LIB, 'timeline'));
const SessionContext = require(join(SCRIPTS_LIB, 'session-context'));
const paths = require(join(SCRIPTS_LIB, 'paths'));

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
  let projectRoot;
  const workflowId = 'wf-test-3-1';
  let ctx;

  beforeEach(() => {
    projectRoot = makeTmpProject('tlmi-s31');
    ctx = createCtx(projectRoot, undefined, workflowId);
    mkdirSync(paths.session.workflowDir(projectRoot, ctx.sessionId, workflowId), { recursive: true });
  });
  afterEach(() => {
    cleanupProject(projectRoot);
  });

  test('事件寫入 workflows/{workflowId}/timeline.jsonl', () => {
    timeline.emitCtx(ctx, 'workflow:start', { wfType: 'standard' });
    const wfTimelinePath = paths.session.workflowTimeline(projectRoot, ctx.sessionId, workflowId);
    expect(existsSync(wfTimelinePath)).toBe(true);
    expect(countLines(wfTimelinePath)).toBe(1);
  });

  test('根層 timeline.jsonl 不受影響', () => {
    const rootTimelinePath = paths.session.timeline(projectRoot, ctx.sessionId);
    const rootBefore = existsSync(rootTimelinePath) ? countLines(rootTimelinePath) : 0;
    timeline.emitCtx(ctx, 'workflow:start', {});
    const rootAfter = existsSync(rootTimelinePath) ? countLines(rootTimelinePath) : 0;
    expect(rootAfter).toBe(rootBefore);
  });

  test('emit 回傳包含正確欄位的事件物件', () => {
    const event = timeline.emitCtx(ctx, 'workflow:start', { extra: 'data' });
    expect(event.type).toBe('workflow:start');
    expect(event.category).toBe('workflow');
    expect(event.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(event.extra).toBe('data');
  });

  test('寫入的事件可用 query 讀回', () => {
    timeline.emitCtx(ctx, 'workflow:start', { wfType: 'standard' });
    const events = timeline.queryCtx(ctx);
    expect(events.length).toBe(1);
    expect(events[0].type).toBe('workflow:start');
    expect(events[0].wfType).toBe('standard');
  });
});

// ════════════════════════════════════════════════════════
// Scenario 3-2: emit 無 workflowId 時 fallback 至根層
// ════════════════════════════════════════════════════════

describe('Scenario 3-2: emit 無 workflowId 時 fallback 至根層', () => {
  let projectRoot;
  let ctxNoWf;

  beforeEach(() => {
    projectRoot = makeTmpProject('tlmi-s32');
    ctxNoWf = createCtx(projectRoot); // workflowId = null
  });
  afterEach(() => {
    cleanupProject(projectRoot);
  });

  test('workflowId 為 null 時寫入根層 timeline.jsonl', () => {
    timeline.emitCtx(ctxNoWf, 'workflow:start', {});
    const rootTimelinePath = paths.session.timeline(projectRoot, ctxNoWf.sessionId);
    expect(existsSync(rootTimelinePath)).toBe(true);
    expect(countLines(rootTimelinePath)).toBe(1);
  });

  test('workflowId 為 null 時不拋錯誤', () => {
    expect(() => timeline.emitCtx(ctxNoWf, 'workflow:start', {})).not.toThrow();
  });

  test('ctx.workflowId 為 null 時寫入根層（等同舊 API 2 參數行為）', () => {
    const ctx = new SessionContext(projectRoot, ctxNoWf.sessionId, null);
    timeline.emitCtx(ctx, 'workflow:start', {});
    const rootTimelinePath = paths.session.timeline(projectRoot, ctx.sessionId);
    expect(existsSync(rootTimelinePath)).toBe(true);
    expect(countLines(rootTimelinePath)).toBe(1);
  });
});

// ════════════════════════════════════════════════════════
// Scenario 3-3: 兩個 workflow 的 timeline 互不影響
// ════════════════════════════════════════════════════════

describe('Scenario 3-3: 兩個 workflow 的 timeline 互不影響', () => {
  let projectRoot;
  const workflowIdA = 'wf-A-test-3-3';
  const workflowIdB = 'wf-B-test-3-3';
  let ctxA, ctxB;

  beforeEach(() => {
    projectRoot = makeTmpProject('tlmi-s33');
    const sessionId = `test-tlmi-s33-${Date.now()}`;
    mkdirSync(paths.sessionDir(projectRoot, sessionId), { recursive: true });
    mkdirSync(paths.session.workflowDir(projectRoot, sessionId, workflowIdA), { recursive: true });
    mkdirSync(paths.session.workflowDir(projectRoot, sessionId, workflowIdB), { recursive: true });
    ctxA = new SessionContext(projectRoot, sessionId, workflowIdA);
    ctxB = new SessionContext(projectRoot, sessionId, workflowIdB);
  });
  afterEach(() => {
    cleanupProject(projectRoot);
  });

  test('對 A emit 3 筆，對 B emit 2 筆，query 各自正確', () => {
    timeline.emitCtx(ctxA, 'workflow:start', { wf: 'A' });
    timeline.emitCtx(ctxA, 'stage:start', { stage: 'DEV' });
    timeline.emitCtx(ctxA, 'stage:complete', { stage: 'DEV', result: 'pass' });

    timeline.emitCtx(ctxB, 'workflow:start', { wf: 'B' });
    timeline.emitCtx(ctxB, 'workflow:complete', { wf: 'B' });

    const eventsA = timeline.queryCtx(ctxA);
    const eventsB = timeline.queryCtx(ctxB);

    expect(eventsA.length).toBe(3);
    expect(eventsB.length).toBe(2);
  });

  test('A 的事件不出現在 B 的 query 結果', () => {
    timeline.emitCtx(ctxA, 'workflow:start', { marker: 'only-in-A' });
    timeline.emitCtx(ctxB, 'workflow:start', { marker: 'only-in-B' });

    const eventsB = timeline.queryCtx(ctxB);
    expect(eventsB.every(e => e.marker !== 'only-in-A')).toBe(true);
  });

  test('B 的事件不出現在 A 的 query 結果', () => {
    timeline.emitCtx(ctxA, 'workflow:start', { marker: 'only-in-A' });
    timeline.emitCtx(ctxB, 'workflow:start', { marker: 'only-in-B' });

    const eventsA = timeline.queryCtx(ctxA);
    expect(eventsA.every(e => e.marker !== 'only-in-B')).toBe(true);
  });
});

// ════════════════════════════════════════════════════════
// Scenario 3-4: query 帶 workflowId 只查對應 timeline
// ════════════════════════════════════════════════════════

describe('Scenario 3-4: query 帶 workflowId 只查對應 timeline', () => {
  let projectRoot;
  const workflowId = 'wf-test-3-4';
  let ctxWf, ctxNoWf;

  beforeEach(() => {
    projectRoot = makeTmpProject('tlmi-s34');
    const sessionId = `test-tlmi-s34-${Date.now()}`;
    mkdirSync(paths.sessionDir(projectRoot, sessionId), { recursive: true });
    mkdirSync(paths.session.workflowDir(projectRoot, sessionId, workflowId), { recursive: true });
    ctxWf = new SessionContext(projectRoot, sessionId, workflowId);
    ctxNoWf = new SessionContext(projectRoot, sessionId, null);

    // 預填 workflow timeline：5 筆
    for (let i = 0; i < 5; i++) {
      timeline.emitCtx(ctxWf, 'workflow:start', { seq: i });
    }
    // 預填根層 timeline：3 筆（舊格式，用 ctxNoWf 模擬）
    timeline.emitCtx(ctxNoWf, 'workflow:start', {});
    timeline.emitCtx(ctxNoWf, 'workflow:complete', {});
    timeline.emitCtx(ctxNoWf, 'stage:start', { stage: 'DEV' });
  });
  afterEach(() => {
    cleanupProject(projectRoot);
  });

  test('query 帶 workflowId 回傳 5 筆（新路徑事件）', () => {
    const events = timeline.queryCtx(ctxWf);
    expect(events.length).toBe(5);
  });

  test('query 帶 workflowId 不混入根層舊事件', () => {
    const events = timeline.queryCtx(ctxWf);
    // workflow timeline 的事件有 seq 欄位，根層沒有
    expect(events.every(e => e.seq !== undefined)).toBe(true);
  });

  test('query 不帶 workflowId（ctxNoWf）回傳根層 3 筆', () => {
    const events = timeline.queryCtx(ctxNoWf);
    expect(events.length).toBe(3);
  });

  test('query 帶 workflowId 支援 filter', () => {
    const events = timeline.queryCtx(ctxWf, { type: 'workflow:start' });
    expect(events.length).toBe(5);
    expect(events.every(e => e.type === 'workflow:start')).toBe(true);
  });
});
