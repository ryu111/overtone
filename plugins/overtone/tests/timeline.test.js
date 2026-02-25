'use strict';
const { test, expect, beforeEach, afterEach, describe } = require('bun:test');
const { mkdirSync, rmSync, appendFileSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');

const timeline = require('../scripts/lib/timeline');
const paths = require('../scripts/lib/paths');

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
