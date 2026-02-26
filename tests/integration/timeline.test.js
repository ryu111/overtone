'use strict';
const { test, expect, beforeEach, afterEach, describe } = require('bun:test');
const { mkdirSync, rmSync, appendFileSync, readFileSync, existsSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const timeline = require(join(SCRIPTS_LIB, 'timeline'));
const paths = require(join(SCRIPTS_LIB, 'paths'));

// 使用獨立的測試 session ID 避免污染
const TEST_SESSION = `test_timeline_${Date.now()}`;
const SESSION_DIR = join(homedir(), '.overtone', 'sessions', TEST_SESSION);

// 輔助函式：直接寫入假的 stage:complete 事件到 JSONL
function writeEvent(sessionId, stage, result, ts) {
  const filePath = paths.session.timeline(sessionId);
  mkdirSync(require('path').dirname(filePath), { recursive: true });
  const event = JSON.stringify({
    ts: ts || new Date().toISOString(),
    type: 'stage:complete',
    category: 'stage',
    label: '階段完成',
    stage,
    result,
  });
  appendFileSync(filePath, event + '\n', 'utf8');
}

// 輔助函式：寫入非 stage:complete 事件
function writeOtherEvent(sessionId, type, extraData) {
  const filePath = paths.session.timeline(sessionId);
  mkdirSync(require('path').dirname(filePath), { recursive: true });
  const event = JSON.stringify({
    ts: new Date().toISOString(),
    type,
    category: 'workflow',
    label: type,
    ...extraData,
  });
  appendFileSync(filePath, event + '\n', 'utf8');
}

beforeEach(() => {
  mkdirSync(SESSION_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(SESSION_DIR, { recursive: true, force: true });
});

// ─────────────────────────────────────────────
// emit() 測試
// ─────────────────────────────────────────────
describe('emit()', () => {
  let sessionId;
  let sessionDir;

  beforeEach(() => {
    sessionId = `test_emit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    sessionDir = join(homedir(), '.overtone', 'sessions', sessionId);
    mkdirSync(sessionDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(sessionDir, { recursive: true, force: true });
  });

  // Scenario: 正常寫入後用 query 讀回
  test('正常寫入後 query 能讀回同一筆事件', () => {
    timeline.emit(sessionId, 'workflow:start', { workflowType: 'single' });
    const events = timeline.query(sessionId);
    expect(events.length).toBe(1);
    expect(events[0].type).toBe('workflow:start');
    expect(events[0].workflowType).toBe('single');
  });

  // Scenario: 事件格式驗證 — ts / type / category 欄位
  test('寫入的事件包含 ts、type、category 欄位', () => {
    const returned = timeline.emit(sessionId, 'stage:start', { stage: 'DEV' });
    // 回傳值驗證
    expect(typeof returned.ts).toBe('string');
    expect(new Date(returned.ts).toString()).not.toBe('Invalid Date');
    expect(returned.type).toBe('stage:start');
    expect(returned.category).toBe('stage');
    // 讀回 JSONL 的原始行驗證
    const filePath = paths.session.timeline(sessionId);
    const raw = readFileSync(filePath, 'utf8').trim();
    const parsed = JSON.parse(raw);
    expect(parsed.ts).toBe(returned.ts);
    expect(parsed.type).toBe('stage:start');
    expect(parsed.category).toBe('stage');
  });

  // Scenario: 未知事件類型應拋錯
  test('未知的 eventType 應拋出 Error', () => {
    expect(() => {
      timeline.emit(sessionId, 'totally:unknown:event');
    }).toThrow('未知的 timeline 事件類型：totally:unknown:event');
  });

  // Scenario: 多次 emit — 事件依序追加，query 回傳正確數量
  test('多次 emit 後 query 回傳正確數量', () => {
    timeline.emit(sessionId, 'workflow:start');
    timeline.emit(sessionId, 'stage:start',    { stage: 'DEV' });
    timeline.emit(sessionId, 'agent:delegate', { agent: 'developer' });
    timeline.emit(sessionId, 'stage:complete', { stage: 'DEV', result: 'pass' });
    timeline.emit(sessionId, 'workflow:complete');

    const events = timeline.query(sessionId);
    expect(events.length).toBe(5);
    // 順序應與寫入一致
    expect(events[0].type).toBe('workflow:start');
    expect(events[4].type).toBe('workflow:complete');
  });
});

// ─────────────────────────────────────────────
// query() 測試
// ─────────────────────────────────────────────
describe('query()', () => {
  let sessionId;
  let sessionDir;

  beforeEach(() => {
    sessionId = `test_query_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    sessionDir = join(homedir(), '.overtone', 'sessions', sessionId);
    mkdirSync(sessionDir, { recursive: true });

    // 預先寫入一組混合事件供各測試共用
    timeline.emit(sessionId, 'workflow:start');
    timeline.emit(sessionId, 'stage:start',    { stage: 'DEV' });
    timeline.emit(sessionId, 'stage:complete', { stage: 'DEV', result: 'pass' });
    timeline.emit(sessionId, 'agent:delegate', { agent: 'developer' });
    timeline.emit(sessionId, 'agent:complete', { agent: 'developer' });
    timeline.emit(sessionId, 'workflow:complete');
  });

  afterEach(() => {
    rmSync(sessionDir, { recursive: true, force: true });
  });

  // Scenario: 無 filter — 回傳所有事件
  test('無 filter 時回傳所有事件', () => {
    const events = timeline.query(sessionId);
    expect(events.length).toBe(6);
  });

  // Scenario: type filter — 只回傳指定 type 的事件
  test('type filter 只回傳指定類型事件', () => {
    const agentEvents = timeline.query(sessionId, { type: 'agent:delegate' });
    expect(agentEvents.length).toBe(1);
    expect(agentEvents[0].type).toBe('agent:delegate');
    expect(agentEvents[0].agent).toBe('developer');

    const stageEvents = timeline.query(sessionId, { type: 'stage:complete' });
    expect(stageEvents.length).toBe(1);
    expect(stageEvents[0].type).toBe('stage:complete');
  });

  // Scenario: category filter — 只回傳指定 category 的事件
  test('category filter 只回傳指定分類事件', () => {
    const workflowEvents = timeline.query(sessionId, { category: 'workflow' });
    expect(workflowEvents.length).toBe(2);
    workflowEvents.forEach((e) => expect(e.category).toBe('workflow'));

    const stageEvents = timeline.query(sessionId, { category: 'stage' });
    expect(stageEvents.length).toBe(2);
    stageEvents.forEach((e) => expect(e.category).toBe('stage'));

    const agentEvents = timeline.query(sessionId, { category: 'agent' });
    expect(agentEvents.length).toBe(2);
  });

  // Scenario: limit — 回傳最多 N 筆（從最新開始）
  test('limit 回傳最後 N 筆事件', () => {
    const last2 = timeline.query(sessionId, { limit: 2 });
    expect(last2.length).toBe(2);
    // 最後兩筆應是 agent:complete 與 workflow:complete
    expect(last2[0].type).toBe('agent:complete');
    expect(last2[1].type).toBe('workflow:complete');
  });

  // Scenario: 不存在的 session — 回傳空陣列
  test('不存在的 session 回傳空陣列', () => {
    const events = timeline.query('nonexistent_session_xyz_999');
    expect(events).toEqual([]);
  });
});

// ─────────────────────────────────────────────
// latest() 測試
// ─────────────────────────────────────────────
describe('latest()', () => {
  let sessionId;
  let sessionDir;

  beforeEach(() => {
    sessionId = `test_latest_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    sessionDir = join(homedir(), '.overtone', 'sessions', sessionId);
    mkdirSync(sessionDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(sessionDir, { recursive: true, force: true });
  });

  // Scenario: 有匹配事件 — 回傳最新一筆
  test('有匹配事件時回傳最新一筆', () => {
    timeline.emit(sessionId, 'stage:complete', { stage: 'DEV', result: 'fail' });
    timeline.emit(sessionId, 'stage:complete', { stage: 'DEV', result: 'pass' });

    const result = timeline.latest(sessionId, 'stage:complete');
    expect(result).not.toBeNull();
    expect(result.type).toBe('stage:complete');
    // latest() 用 limit:1 取最後一筆，應為最後寫入的 pass
    expect(result.result).toBe('pass');
  });

  // Scenario: 無匹配事件 — 回傳 null
  test('無匹配事件時回傳 null', () => {
    timeline.emit(sessionId, 'workflow:start');
    const result = timeline.latest(sessionId, 'workflow:complete');
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────
// passAtK() 測試（原有，保留不動）
// ─────────────────────────────────────────────
describe('passAtK()', () => {
  // Scenario: 空 timeline — 無任何 stage:complete 事件
  test('空 timeline — stages 為 {} 且 overall rates 為 null', () => {
    const result = timeline.passAtK(TEST_SESSION);
    expect(result.sessionId).toBe(TEST_SESSION);
    expect(result.stages).toEqual({});
    expect(result.overall.stageCount).toBe(0);
    expect(result.overall.pass1Rate).toBeNull();
    expect(result.overall.pass3Rate).toBeNull();
    expect(typeof result.computed).toBe('string');
  });

  // Scenario: 單一 stage，首次嘗試即 pass
  test('單一 stage，首次嘗試 pass — pass1/pass3 均為 true，passConsecutive3 為 null', () => {
    writeEvent(TEST_SESSION, 'DEV', 'pass', '2026-02-26T00:00:00.000Z');

    const result = timeline.passAtK(TEST_SESSION);
    expect(result.stages.DEV).toBeDefined();
    expect(result.stages.DEV.attempts.length).toBe(1);
    expect(result.stages.DEV.attempts[0].result).toBe('pass');
    expect(result.stages.DEV.pass1).toBe(true);
    expect(result.stages.DEV.pass3).toBe(true);
    expect(result.stages.DEV.passConsecutive3).toBeNull();
    expect(result.overall.stageCount).toBe(1);
    expect(result.overall.pass1Rate).toBe(1.0);
    expect(result.overall.pass3Rate).toBe(1.0);
  });

  // Scenario: 單一 stage，第一次 fail 後第二次 pass
  test('單一 stage，fail 後 pass — pass1 false，pass3 true，passConsecutive3 null', () => {
    writeEvent(TEST_SESSION, 'DEV', 'fail', '2026-02-26T00:00:00.000Z');
    writeEvent(TEST_SESSION, 'DEV', 'pass', '2026-02-26T00:01:00.000Z');

    const result = timeline.passAtK(TEST_SESSION);
    expect(result.stages.DEV.attempts.length).toBe(2);
    expect(result.stages.DEV.pass1).toBe(false);
    expect(result.stages.DEV.pass3).toBe(true);
    expect(result.stages.DEV.passConsecutive3).toBeNull();
    expect(result.overall.pass1Rate).toBe(0);
    expect(result.overall.pass3Rate).toBe(1.0);
  });

  // Scenario: 單一 stage，連續 fail 超過三次仍未 pass
  test('單一 stage，四次全 fail — pass3 false，passConsecutive3 false', () => {
    writeEvent(TEST_SESSION, 'TEST', 'fail', '2026-02-26T00:00:00.000Z');
    writeEvent(TEST_SESSION, 'TEST', 'fail', '2026-02-26T00:01:00.000Z');
    writeEvent(TEST_SESSION, 'TEST', 'fail', '2026-02-26T00:02:00.000Z');
    writeEvent(TEST_SESSION, 'TEST', 'fail', '2026-02-26T00:03:00.000Z');

    const result = timeline.passAtK(TEST_SESSION);
    expect(result.stages.TEST.attempts.length).toBe(4);
    expect(result.stages.TEST.pass1).toBe(false);
    expect(result.stages.TEST.pass3).toBe(false);
    expect(result.stages.TEST.passConsecutive3).toBe(false);
    expect(result.overall.pass1Rate).toBe(0);
    expect(result.overall.pass3Rate).toBe(0);
  });

  // Scenario: 多個 stage，混合結果（含 TEST:2 key 分離計算）
  test('多個 stage 混合結果 — TEST 與 TEST:2 各自計算', () => {
    writeEvent(TEST_SESSION, 'DEV',    'pass', '2026-02-26T00:00:00.000Z');
    writeEvent(TEST_SESSION, 'TEST',   'fail', '2026-02-26T00:01:00.000Z');
    writeEvent(TEST_SESSION, 'TEST',   'pass', '2026-02-26T00:02:00.000Z');
    writeEvent(TEST_SESSION, 'TEST:2', 'fail', '2026-02-26T00:03:00.000Z');

    const result = timeline.passAtK(TEST_SESSION);
    expect(Object.keys(result.stages)).toEqual(expect.arrayContaining(['DEV', 'TEST', 'TEST:2']));
    expect(result.stages.DEV.pass1).toBe(true);
    expect(result.stages.TEST.pass1).toBe(false);
    expect(result.stages.TEST.pass3).toBe(true);
    expect(result.stages['TEST:2'].pass1).toBe(false);
    expect(result.stages['TEST:2'].pass3).toBe(false);
    expect(result.overall.stageCount).toBe(3);
    // pass1Count = 1（只有 DEV），pass1Rate = 1/3
    expect(result.overall.pass1Count).toBe(1);
    expect(result.overall.pass1Rate).toBeCloseTo(0.3333, 3);
    // pass3Count = 2（DEV + TEST），pass3Rate = 2/3
    expect(result.overall.pass3Count).toBe(2);
    expect(result.overall.pass3Rate).toBeCloseTo(0.6667, 3);
  });

  // Scenario: passConsecutive3 = true — 三次全 pass
  test('passConsecutive3 true — 三次全 pass', () => {
    writeEvent(TEST_SESSION, 'REVIEW', 'pass', '2026-02-26T00:00:00.000Z');
    writeEvent(TEST_SESSION, 'REVIEW', 'pass', '2026-02-26T00:01:00.000Z');
    writeEvent(TEST_SESSION, 'REVIEW', 'pass', '2026-02-26T00:02:00.000Z');

    const result = timeline.passAtK(TEST_SESSION);
    expect(result.stages.REVIEW.attempts.length).toBe(3);
    expect(result.stages.REVIEW.pass1).toBe(true);
    expect(result.stages.REVIEW.pass3).toBe(true);
    expect(result.stages.REVIEW.passConsecutive3).toBe(true);
  });

  // Scenario: passConsecutive3 = false — 最後一次 fail
  test('passConsecutive3 false — 四次後最後一次 fail', () => {
    writeEvent(TEST_SESSION, 'REVIEW', 'pass', '2026-02-26T00:00:00.000Z');
    writeEvent(TEST_SESSION, 'REVIEW', 'pass', '2026-02-26T00:01:00.000Z');
    writeEvent(TEST_SESSION, 'REVIEW', 'pass', '2026-02-26T00:02:00.000Z');
    writeEvent(TEST_SESSION, 'REVIEW', 'fail', '2026-02-26T00:03:00.000Z');

    const result = timeline.passAtK(TEST_SESSION);
    expect(result.stages.REVIEW.passConsecutive3).toBe(false);
    expect(result.stages.REVIEW.pass1).toBe(true);
    expect(result.stages.REVIEW.pass3).toBe(true);
  });

  // Scenario: 非 stage:complete 事件應被忽略
  test('非 stage:complete 事件被忽略', () => {
    writeOtherEvent(TEST_SESSION, 'workflow:start');
    writeOtherEvent(TEST_SESSION, 'heartbeat');
    writeOtherEvent(TEST_SESSION, 'stage:retry', { stage: 'DEV', failCount: 1 });
    writeEvent(TEST_SESSION, 'DEV', 'pass', '2026-02-26T00:00:00.000Z');
    writeOtherEvent(TEST_SESSION, 'agent:handoff');

    const result = timeline.passAtK(TEST_SESSION);
    expect(result.stages.DEV).toBeDefined();
    expect(result.stages.DEV.attempts.length).toBe(1);
    expect(result.stages.DEV.pass1).toBe(true);
    expect(result.overall.stageCount).toBe(1);
  });

  // 回傳格式驗證
  test('回傳物件包含必要欄位', () => {
    writeEvent(TEST_SESSION, 'DEV', 'pass', '2026-02-26T00:00:00.000Z');

    const result = timeline.passAtK(TEST_SESSION);
    expect(result.sessionId).toBe(TEST_SESSION);
    expect(typeof result.computed).toBe('string');
    expect(new Date(result.computed).toString()).not.toBe('Invalid Date');
    expect(typeof result.stages).toBe('object');
    expect(typeof result.overall).toBe('object');
    expect(typeof result.overall.stageCount).toBe('number');
    expect(typeof result.overall.pass1Count).toBe('number');
    expect(typeof result.overall.pass3Count).toBe('number');
  });
});
