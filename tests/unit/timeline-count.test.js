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
const { SCRIPTS_LIB } = require('../helpers/paths');
const { makeTmpProject, createCtx, cleanupProject } = require('../helpers/session-factory');

const timeline = require(join(SCRIPTS_LIB, 'timeline'));

// 為每個測試建立獨立 session
function makeSession(suffix) {
  const projectRoot = makeTmpProject(`ot-tlcount-${suffix}`);
  const ctx = createCtx(projectRoot);
  return { projectRoot, ctx };
}

function cleanupSession(session) {
  cleanupProject(session.projectRoot);
}

// 直接 append 一行到 timeline JSONL（繞過 emit() 的 counter 邏輯）
function appendEvent(ctx, event) {
  const filePath = ctx.timelineFile();
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
  });
  afterEach(() => {
    cleanupSession(session);
  });

  test('單筆事件 → 回傳 1', () => {
    appendEvent(session.ctx, makeEvent('workflow:start', 'workflow'));
    expect(timeline.countCtx(session.ctx)).toBe(1);
  });

  test('多筆不同 type 事件 → 回傳總行數', () => {
    appendEvent(session.ctx, makeEvent('workflow:start', 'workflow'));
    appendEvent(session.ctx, makeEvent('stage:start', 'stage', { stage: 'DEV' }));
    appendEvent(session.ctx, makeEvent('agent:delegate', 'agent', { agent: 'developer' }));
    appendEvent(session.ctx, makeEvent('agent:complete', 'agent', { agent: 'developer' }));
    appendEvent(session.ctx, makeEvent('stage:complete', 'stage', { stage: 'DEV', result: 'pass' }));
    appendEvent(session.ctx, makeEvent('workflow:complete', 'workflow'));
    expect(timeline.countCtx(session.ctx)).toBe(6);
  });

  test('空 filter 物件 → 與無 filter 結果相同', () => {
    appendEvent(session.ctx, makeEvent('stage:complete', 'stage', { stage: 'DEV', result: 'pass' }));
    appendEvent(session.ctx, makeEvent('workflow:complete', 'workflow'));
    expect(timeline.countCtx(session.ctx, {})).toBe(2);
  });
});

// ════════════════════════════════════════════════════════
// Scenario 2：按 type 計數
// ════════════════════════════════════════════════════════
describe('count() — 按 type 篩選', () => {
  let session;
  beforeEach(() => {
    session = makeSession('type');

    appendEvent(session.ctx, makeEvent('workflow:start', 'workflow'));
    appendEvent(session.ctx, makeEvent('stage:complete', 'stage', { stage: 'DEV', result: 'fail' }));
    appendEvent(session.ctx, makeEvent('stage:complete', 'stage', { stage: 'DEV', result: 'pass' }));
    appendEvent(session.ctx, makeEvent('stage:complete', 'stage', { stage: 'REVIEW', result: 'pass' }));
    appendEvent(session.ctx, makeEvent('workflow:complete', 'workflow'));
  });
  afterEach(() => {
    cleanupSession(session);
  });

  test('type:stage:complete → 回傳 3', () => {
    expect(timeline.countCtx(session.ctx, { type: 'stage:complete' })).toBe(3);
  });

  test('type:workflow:start → 回傳 1', () => {
    expect(timeline.countCtx(session.ctx, { type: 'workflow:start' })).toBe(1);
  });

  test('type 不存在 → 回傳 0', () => {
    expect(timeline.countCtx(session.ctx, { type: 'nonexistent:type' })).toBe(0);
  });
});

// ════════════════════════════════════════════════════════
// Scenario 3：按 category 計數
// ════════════════════════════════════════════════════════
describe('count() — 按 category 篩選', () => {
  let session;
  beforeEach(() => {
    session = makeSession('category');

    appendEvent(session.ctx, makeEvent('workflow:start', 'workflow'));
    appendEvent(session.ctx, makeEvent('stage:start', 'stage', { stage: 'DEV' }));
    appendEvent(session.ctx, makeEvent('agent:delegate', 'agent', { agent: 'developer' }));
    appendEvent(session.ctx, makeEvent('agent:complete', 'agent', { agent: 'developer' }));
    appendEvent(session.ctx, makeEvent('stage:complete', 'stage', { stage: 'DEV', result: 'pass' }));
    appendEvent(session.ctx, makeEvent('workflow:complete', 'workflow'));
  });
  afterEach(() => {
    cleanupSession(session);
  });

  test('category:workflow → 回傳 2（start + complete）', () => {
    expect(timeline.countCtx(session.ctx, { category: 'workflow' })).toBe(2);
  });

  test('category:stage → 回傳 2（start + complete）', () => {
    expect(timeline.countCtx(session.ctx, { category: 'stage' })).toBe(2);
  });

  test('category:agent → 回傳 2（delegate + complete）', () => {
    expect(timeline.countCtx(session.ctx, { category: 'agent' })).toBe(2);
  });

  test('category 不存在 → 回傳 0', () => {
    expect(timeline.countCtx(session.ctx, { category: 'nonexistent' })).toBe(0);
  });
});

// ════════════════════════════════════════════════════════
// Scenario 4：空檔案 / 不存在檔案 → 回傳 0
// ════════════════════════════════════════════════════════
describe('count() — 邊界情境', () => {
  let session;
  beforeEach(() => {
    session = makeSession('edge');
  });
  afterEach(() => {
    cleanupSession(session);
  });

  test('timeline 檔案不存在 → 回傳 0', () => {
    expect(timeline.countCtx(session.ctx)).toBe(0);
  });

  test('timeline 檔案存在但為空 → 回傳 0', () => {
    const filePath = session.ctx.timelineFile();
    mkdirSync(require('path').dirname(filePath), { recursive: true });
    writeFileSync(filePath, '', 'utf8');
    expect(timeline.countCtx(session.ctx)).toBe(0);
  });

  test('空檔案 + type filter → 回傳 0', () => {
    const filePath = session.ctx.timelineFile();
    mkdirSync(require('path').dirname(filePath), { recursive: true });
    writeFileSync(filePath, '', 'utf8');
    expect(timeline.countCtx(session.ctx, { type: 'stage:complete' })).toBe(0);
  });

  test('檔案不存在 + category filter → 回傳 0', () => {
    expect(timeline.countCtx(session.ctx, { category: 'workflow' })).toBe(0);
  });
});

// ════════════════════════════════════════════════════════
// Scenario 5：同時有 type + category
// ════════════════════════════════════════════════════════
describe('count() — type + category 同時篩選', () => {
  let session;
  beforeEach(() => {
    session = makeSession('both');

    appendEvent(session.ctx, makeEvent('workflow:start', 'workflow'));
    appendEvent(session.ctx, makeEvent('stage:start', 'stage', { stage: 'DEV' }));
    appendEvent(session.ctx, makeEvent('stage:complete', 'stage', { stage: 'DEV', result: 'fail' }));
    appendEvent(session.ctx, makeEvent('stage:complete', 'stage', { stage: 'DEV', result: 'pass' }));
    appendEvent(session.ctx, makeEvent('stage:complete', 'stage', { stage: 'REVIEW', result: 'pass' }));
    appendEvent(session.ctx, makeEvent('workflow:complete', 'workflow'));
  });
  afterEach(() => {
    cleanupSession(session);
  });

  test('type:stage:complete + category:stage → 回傳 3', () => {
    expect(timeline.countCtx(session.ctx, { type: 'stage:complete', category: 'stage' })).toBe(3);
  });

  test('type:stage:start + category:stage → 回傳 1', () => {
    expect(timeline.countCtx(session.ctx, { type: 'stage:start', category: 'stage' })).toBe(1);
  });

  test('type:stage:complete + category:workflow → type 與 category 不匹配 → 回傳 0', () => {
    // stage:complete 的 category 是 stage，不是 workflow
    expect(timeline.countCtx(session.ctx, { type: 'stage:complete', category: 'workflow' })).toBe(0);
  });

  test('type:workflow:start + category:workflow → 回傳 1', () => {
    expect(timeline.countCtx(session.ctx, { type: 'workflow:start', category: 'workflow' })).toBe(1);
  });
});
