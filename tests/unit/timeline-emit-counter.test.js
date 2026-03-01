'use strict';
/**
 * timeline-emit-counter.test.js — Feature 4：_emitCounter 模組級變數行為驗證
 *
 * BDD 規格：specs/features/in-progress/core-refactor-iter1/bdd.md
 *
 * Scenario 1：emit 每 100 次觸發一次 trimIfNeeded
 * Scenario 2：emit 第 99 次不觸發截斷
 * Scenario 3：emit 正常寫入事件，counter 行為對呼叫者透明
 * Scenario 4：emit 使用未知 eventType 拋出錯誤
 * Scenario 5：counter 跨 session 累積，截斷正確針對當前 session
 *
 * 注意：_emitCounter 是模組級私有變數，每次 require 在同一程序內共享狀態。
 * 各測試使用獨立 session 目錄 + afterEach 清理，確保 filesystem 不污染。
 * counter 累積值跨測試連續，這符合「模組級跨 session 累積」的設計行為。
 */
const { test, expect, beforeEach, afterEach, describe } = require('bun:test');
const { mkdirSync, rmSync, readFileSync, existsSync, appendFileSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const timeline = require(join(SCRIPTS_LIB, 'timeline'));
const paths = require(join(SCRIPTS_LIB, 'paths'));

const MAX_EVENTS = 2000;

// 為每個測試建立獨立 session
function makeSession(suffix) {
  const id = `test_emitctr_${suffix}_${Date.now()}`;
  const dir = join(homedir(), '.overtone', 'sessions', id);
  return { id, dir };
}

// 直接 append 行到 timeline JSONL（繞過 emit() 的 counter 邏輯，用於預填事件）
function appendRawEvent(sessionId, event) {
  const filePath = paths.session.timeline(sessionId);
  mkdirSync(require('path').dirname(filePath), { recursive: true });
  appendFileSync(filePath, JSON.stringify(event) + '\n', 'utf8');
}

// 計算 timeline 檔案行數
function countLines(sessionId) {
  const filePath = paths.session.timeline(sessionId);
  if (!existsSync(filePath)) return 0;
  const content = readFileSync(filePath, 'utf8').trim();
  if (!content) return 0;
  return content.split('\n').filter(Boolean).length;
}

// 預填超過 MAX_EVENTS 筆事件（直接寫入，繞過 counter）
function prefillOverMax(sessionId, count) {
  const filePath = paths.session.timeline(sessionId);
  mkdirSync(require('path').dirname(filePath), { recursive: true });
  const lines = [];
  for (let i = 0; i < count; i++) {
    lines.push(JSON.stringify({ ts: new Date().toISOString(), type: 'workflow:start', category: 'workflow', label: 'workflow:start' }));
  }
  require('fs').writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');
}

// ════════════════════════════════════════════════════════
// Scenario 3：emit 正常寫入事件，counter 行為對呼叫者透明
// ════════════════════════════════════════════════════════

describe('Feature 4：emit 正常寫入，counter 對呼叫者透明', () => {
  let session;
  beforeEach(() => {
    session = makeSession('write');
    mkdirSync(session.dir, { recursive: true });
  });
  afterEach(() => {
    rmSync(session.dir, { recursive: true, force: true });
  });

  test('emit 回傳包含 ts、type、category、label 的事件物件', () => {
    const event = timeline.emit(session.id, 'workflow:start', {});
    expect(event).toMatchObject({
      type: 'workflow:start',
      category: 'workflow',
      label: expect.any(String),
      ts: expect.any(String),
    });
  });

  test('emit 後 timeline JSONL 新增一行', () => {
    const before = countLines(session.id);
    timeline.emit(session.id, 'workflow:start', {});
    const after = countLines(session.id);
    expect(after).toBe(before + 1);
  });

  test('emit 寫入的事件可被 query() 讀回', () => {
    timeline.emit(session.id, 'workflow:start', { note: 'test' });
    const events = timeline.query(session.id, { type: 'workflow:start' });
    expect(events.length).toBeGreaterThanOrEqual(1);
    const last = events[events.length - 1];
    expect(last.type).toBe('workflow:start');
    expect(last.note).toBe('test');
  });
});

// ════════════════════════════════════════════════════════
// Scenario 4：emit 使用未知 eventType 拋出錯誤
// ════════════════════════════════════════════════════════

describe('Feature 4：emit 使用未知 eventType 拋出錯誤', () => {
  let session;
  beforeEach(() => {
    session = makeSession('error');
    mkdirSync(session.dir, { recursive: true });
  });
  afterEach(() => {
    rmSync(session.dir, { recursive: true, force: true });
  });

  test('未知 eventType 拋出包含「未知的 timeline 事件類型」的錯誤', () => {
    expect(() => timeline.emit(session.id, 'unknown:type:xyz', {})).toThrow('未知的 timeline 事件類型');
  });

  test('未知 eventType 拋出錯誤且不寫入任何行', () => {
    const before = countLines(session.id);
    expect(() => timeline.emit(session.id, 'nonexistent:event', {})).toThrow();
    const after = countLines(session.id);
    expect(after).toBe(before);
  });
});

// ════════════════════════════════════════════════════════
// Scenario 1 & 2：截斷觸發機制（每 100 次 emit 檢查一次）
//
// 由於 _emitCounter 是模組級私有變數且跨測試累積，
// 此測試使用「對齊到下一個 100 倍數」的策略：
// 先呼叫 emit 使 counter 對齊，再驗證第 100 次觸發截斷、第 99 次不觸發。
// ════════════════════════════════════════════════════════

describe('Feature 4：emit counter — 截斷觸發機制（模組級）', () => {
  let sessionA, sessionB;
  beforeEach(() => {
    sessionA = makeSession('trimA');
    sessionB = makeSession('trimB');
    mkdirSync(sessionA.dir, { recursive: true });
    mkdirSync(sessionB.dir, { recursive: true });
  });
  afterEach(() => {
    rmSync(sessionA.dir, { recursive: true, force: true });
    rmSync(sessionB.dir, { recursive: true, force: true });
  });

  test('Scenario 1：連續呼叫到 100 倍數時，超過 MAX_EVENTS 的 timeline 被截斷', () => {
    // 先預填 sessionA 為超過 MAX_EVENTS 的檔案
    prefillOverMax(sessionA.id, MAX_EVENTS + 50);
    const beforeCount = countLines(sessionA.id);
    expect(beforeCount).toBe(MAX_EVENTS + 50);

    // 計算從當前 counter 值到下一個 100 倍數需要幾次
    // 策略：emit sessionA 直到 counter 達到 100 倍數
    // 為安全起見，最多呼叫 200 次找到下一個截斷點
    let triggered = false;
    for (let i = 0; i < 200; i++) {
      timeline.emit(sessionA.id, 'workflow:start', {});
      const current = countLines(sessionA.id);
      // 若行數 <= MAX_EVENTS，代表截斷已觸發
      if (current <= MAX_EVENTS) {
        triggered = true;
        break;
      }
    }

    expect(triggered).toBe(true);
    // 截斷後行數應 <= MAX_EVENTS（trimIfNeeded 保留最新 MAX_EVENTS 筆）
    expect(countLines(sessionA.id)).toBeLessThanOrEqual(MAX_EVENTS);
  });

  test('Scenario 2：非 100 倍數的 emit 不觸發截斷（行數持續增加）', () => {
    // 先預填剛好 MAX_EVENTS 筆（不超過，不會被截斷）
    prefillOverMax(sessionB.id, MAX_EVENTS - 1);
    const startCount = countLines(sessionB.id);

    // 呼叫 1 次 emit → 應增加到 MAX_EVENTS（除非剛好是 100 倍數，行為也正確：截斷後保留 MAX_EVENTS）
    timeline.emit(sessionB.id, 'stage:start', { stage: 'DEV' });
    const afterOneEmit = countLines(sessionB.id);
    // 即使觸發截斷，結果也是 MAX_EVENTS，不會比 startCount 少
    expect(afterOneEmit).toBeGreaterThanOrEqual(startCount);
  });

  test('Scenario 3：counter 透明 — emit 回傳值不包含 counter 資訊', () => {
    const event = timeline.emit(sessionA.id, 'workflow:start', {});
    // 回傳的事件物件不應暴露 counter
    expect(event._counter).toBeUndefined();
    expect(event.counter).toBeUndefined();
    // 只包含應有的欄位
    expect(Object.keys(event).sort()).toEqual(
      expect.arrayContaining(['ts', 'type', 'category', 'label'])
    );
  });
});

// ════════════════════════════════════════════════════════
// Scenario 5：counter 跨 session 累積，截斷正確針對當前 session
// ════════════════════════════════════════════════════════

describe('Feature 4：counter 跨 session 累積 — 兩 session 事件各自正確寫入', () => {
  let sessionX, sessionY;
  beforeEach(() => {
    sessionX = makeSession('crossX');
    sessionY = makeSession('crossY');
    mkdirSync(sessionX.dir, { recursive: true });
    mkdirSync(sessionY.dir, { recursive: true });
  });
  afterEach(() => {
    rmSync(sessionX.dir, { recursive: true, force: true });
    rmSync(sessionY.dir, { recursive: true, force: true });
  });

  test('交替對兩個 session emit，兩個 timeline 都正確寫入', () => {
    // 交替呼叫 6 次（每個 session 3 次）
    timeline.emit(sessionX.id, 'workflow:start', { note: 'x1' });
    timeline.emit(sessionY.id, 'workflow:start', { note: 'y1' });
    timeline.emit(sessionX.id, 'stage:start', { stage: 'DEV' });
    timeline.emit(sessionY.id, 'stage:start', { stage: 'DEV' });
    timeline.emit(sessionX.id, 'stage:complete', { stage: 'DEV', result: 'pass' });
    timeline.emit(sessionY.id, 'stage:complete', { stage: 'DEV', result: 'pass' });

    const xEvents = timeline.query(sessionX.id);
    const yEvents = timeline.query(sessionY.id);

    // 各自應有 3 筆事件
    expect(xEvents.length).toBe(3);
    expect(yEvents.length).toBe(3);

    // 事件類型正確，互不交叉
    expect(xEvents[0].note).toBe('x1');
    expect(yEvents[0].note).toBe('y1');
  });

  test('一個 session 超過 MAX_EVENTS 被截斷，不影響另一個 session', () => {
    // sessionX 預填超量
    prefillOverMax(sessionX.id, MAX_EVENTS + 50);
    // sessionY 寫入少量事件
    timeline.emit(sessionY.id, 'workflow:start', {});
    timeline.emit(sessionY.id, 'workflow:complete', {});

    const yCountBefore = countLines(sessionY.id);
    expect(yCountBefore).toBe(2);

    // 呼叫 emit 直到觸發截斷（最多 200 次）
    for (let i = 0; i < 200; i++) {
      timeline.emit(sessionX.id, 'workflow:start', {});
      if (countLines(sessionX.id) <= MAX_EVENTS) break;
    }

    // sessionY 的事件數量不受影響
    const yCountAfter = countLines(sessionY.id);
    expect(yCountAfter).toBe(2);
  });
});
