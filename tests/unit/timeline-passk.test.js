'use strict';
/**
 * timeline-passk.test.js — timeline.passAtK() 獨立行為測試
 *
 * BDD 規格：specs/features/in-progress/core-refactor-iter1/bdd-iter3.md
 *
 * Feature D: timeline.passAtK() 獨立行為測試
 *
 * Scenario D-1: 單一 stage 第一次嘗試即 pass
 * Scenario D-2: 單一 stage 前兩次 fail，第三次 pass（pass@3 成立）
 * Scenario D-3: 多個 stage 混合結果，overall 統計正確
 * Scenario D-4: 無任何 stage:complete 事件時優雅回傳
 * Scenario D-5: timeline 檔案不存在時優雅回傳
 * Scenario D-6: 單一 stage 只有 1 次嘗試時 passConsecutive3 為 null
 * Scenario D-7: stage 事件沒有 stage 欄位時被忽略
 * Scenario D-8: passConsecutive3 在有 3 次或以上且最後 3 次全 pass 時為 true
 *
 * 策略：
 *   - 直接 appendFileSync 寫入 stage:complete 事件（繞過 timeline.emit() 的 registry 驗證）
 *   - 每個測試建立獨立 session，afterEach 清理
 */
const { test, expect, beforeEach, afterEach, describe } = require('bun:test');
const { mkdirSync, rmSync, appendFileSync } = require('fs');
const { join, dirname } = require('path');
const { homedir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const timeline = require(join(SCRIPTS_LIB, 'timeline'));
const paths = require(join(SCRIPTS_LIB, 'paths'));

// ── 工具函式 ──

function makeSession(suffix) {
  const id = `test_passk_${suffix}_${Date.now()}`;
  const dir = join(homedir(), '.overtone', 'sessions', id);
  return { id, dir };
}

/** 直接 append 一筆 stage:complete 事件到 timeline JSONL */
function appendStageComplete(sessionId, stage, result, ts) {
  const filePath = paths.session.timeline(sessionId);
  mkdirSync(dirname(filePath), { recursive: true });
  const event = {
    ts: ts || new Date().toISOString(),
    type: 'stage:complete',
    category: 'stage',
    label: 'stage:complete',
    stage,
    result,
  };
  appendFileSync(filePath, JSON.stringify(event) + '\n', 'utf8');
}

/** 直接 append 其他類型事件 */
function appendEvent(sessionId, event) {
  const filePath = paths.session.timeline(sessionId);
  mkdirSync(dirname(filePath), { recursive: true });
  appendFileSync(filePath, JSON.stringify(event) + '\n', 'utf8');
}

// ════════════════════════════════════════════════════════
// Scenario D-1: 單一 stage 第一次嘗試即 pass
// ════════════════════════════════════════════════════════

describe('passAtK() — Scenario D-1: 單一 stage 第一次即 pass', () => {
  let session;
  beforeEach(() => {
    session = makeSession('d1');
    mkdirSync(session.dir, { recursive: true });
    appendStageComplete(session.id, 'DEV', 'pass');
  });
  afterEach(() => {
    rmSync(session.dir, { recursive: true, force: true });
  });

  test('pass1 為 true', () => {
    const result = timeline.passAtK(session.id);
    expect(result.stages.DEV.pass1).toBe(true);
  });

  test('pass3 為 true', () => {
    const result = timeline.passAtK(session.id);
    expect(result.stages.DEV.pass3).toBe(true);
  });

  test('passConsecutive3 為 null（嘗試次數 < 3）', () => {
    const result = timeline.passAtK(session.id);
    expect(result.stages.DEV.passConsecutive3).toBeNull();
  });

  test('overall.stageCount 為 1', () => {
    const result = timeline.passAtK(session.id);
    expect(result.overall.stageCount).toBe(1);
  });

  test('overall.pass1Count 為 1', () => {
    const result = timeline.passAtK(session.id);
    expect(result.overall.pass1Count).toBe(1);
  });

  test('overall.pass1Rate 為 1.0', () => {
    const result = timeline.passAtK(session.id);
    expect(result.overall.pass1Rate).toBe(1.0);
  });
});

// ════════════════════════════════════════════════════════
// Scenario D-2: 單一 stage 前兩次 fail，第三次 pass
// ════════════════════════════════════════════════════════

describe('passAtK() — Scenario D-2: 前兩次 fail，第三次 pass', () => {
  let session;
  beforeEach(() => {
    session = makeSession('d2');
    mkdirSync(session.dir, { recursive: true });
    // 依時間順序（ts 遞增）寫入
    appendStageComplete(session.id, 'DEV', 'fail', '2026-01-01T00:00:00.000Z');
    appendStageComplete(session.id, 'DEV', 'fail', '2026-01-01T00:01:00.000Z');
    appendStageComplete(session.id, 'DEV', 'pass', '2026-01-01T00:02:00.000Z');
  });
  afterEach(() => {
    rmSync(session.dir, { recursive: true, force: true });
  });

  test('pass1 為 false（第一次 fail）', () => {
    const result = timeline.passAtK(session.id);
    expect(result.stages.DEV.pass1).toBe(false);
  });

  test('pass3 為 true（前 3 次中有 pass）', () => {
    const result = timeline.passAtK(session.id);
    expect(result.stages.DEV.pass3).toBe(true);
  });

  test('passConsecutive3 為 false（最後 3 筆 [fail, fail, pass] 不全 pass）', () => {
    // 恰好 3 次嘗試，n >= 3，passConsecutive3 = attempts.slice(-3).every(pass) = false
    const result = timeline.passAtK(session.id);
    expect(result.stages.DEV.passConsecutive3).toBe(false);
  });

  test('attempts 長度為 3', () => {
    const result = timeline.passAtK(session.id);
    expect(result.stages.DEV.attempts).toHaveLength(3);
  });
});

// ════════════════════════════════════════════════════════
// Scenario D-3: 多個 stage 混合結果，overall 統計正確
// ════════════════════════════════════════════════════════

describe('passAtK() — Scenario D-3: 多個 stage 混合結果', () => {
  let session;
  beforeEach(() => {
    session = makeSession('d3');
    mkdirSync(session.dir, { recursive: true });
    // DEV：1 筆 pass（pass1=true, pass3=true）
    appendStageComplete(session.id, 'DEV', 'pass', '2026-01-01T00:00:00.000Z');
    // REVIEW：fail 後 pass（pass1=false, pass3=true）
    appendStageComplete(session.id, 'REVIEW', 'fail', '2026-01-01T00:01:00.000Z');
    appendStageComplete(session.id, 'REVIEW', 'pass', '2026-01-01T00:02:00.000Z');
    // TEST：3 筆 fail（pass1=false, pass3=false）
    appendStageComplete(session.id, 'TEST', 'fail', '2026-01-01T00:03:00.000Z');
    appendStageComplete(session.id, 'TEST', 'fail', '2026-01-01T00:04:00.000Z');
    appendStageComplete(session.id, 'TEST', 'fail', '2026-01-01T00:05:00.000Z');
  });
  afterEach(() => {
    rmSync(session.dir, { recursive: true, force: true });
  });

  test('overall.stageCount 為 3', () => {
    const result = timeline.passAtK(session.id);
    expect(result.overall.stageCount).toBe(3);
  });

  test('overall.pass1Count 為 1', () => {
    const result = timeline.passAtK(session.id);
    expect(result.overall.pass1Count).toBe(1);
  });

  test('overall.pass3Count 為 2', () => {
    const result = timeline.passAtK(session.id);
    expect(result.overall.pass3Count).toBe(2);
  });

  test('overall.pass1Rate 約為 0.3333', () => {
    const result = timeline.passAtK(session.id);
    expect(result.overall.pass1Rate).toBeCloseTo(0.3333, 4);
  });

  test('overall.pass3Rate 約為 0.6667', () => {
    const result = timeline.passAtK(session.id);
    expect(result.overall.pass3Rate).toBeCloseTo(0.6667, 4);
  });

  test('DEV pass1=true, pass3=true', () => {
    const result = timeline.passAtK(session.id);
    expect(result.stages.DEV.pass1).toBe(true);
    expect(result.stages.DEV.pass3).toBe(true);
  });

  test('REVIEW pass1=false, pass3=true', () => {
    const result = timeline.passAtK(session.id);
    expect(result.stages.REVIEW.pass1).toBe(false);
    expect(result.stages.REVIEW.pass3).toBe(true);
  });

  test('TEST pass1=false, pass3=false', () => {
    const result = timeline.passAtK(session.id);
    expect(result.stages.TEST.pass1).toBe(false);
    expect(result.stages.TEST.pass3).toBe(false);
  });
});

// ════════════════════════════════════════════════════════
// Scenario D-4: 無任何 stage:complete 事件
// ════════════════════════════════════════════════════════

describe('passAtK() — Scenario D-4: 無 stage:complete 事件', () => {
  let session;
  beforeEach(() => {
    session = makeSession('d4');
    mkdirSync(session.dir, { recursive: true });
    // 只有 workflow:start 和 workflow:complete，無 stage:complete
    appendEvent(session.id, {
      ts: new Date().toISOString(),
      type: 'workflow:start',
      category: 'workflow',
      label: 'workflow:start',
    });
    appendEvent(session.id, {
      ts: new Date().toISOString(),
      type: 'workflow:complete',
      category: 'workflow',
      label: 'workflow:complete',
    });
  });
  afterEach(() => {
    rmSync(session.dir, { recursive: true, force: true });
  });

  test('overall.stageCount 為 0', () => {
    const result = timeline.passAtK(session.id);
    expect(result.overall.stageCount).toBe(0);
  });

  test('overall.pass1Rate 為 null', () => {
    const result = timeline.passAtK(session.id);
    expect(result.overall.pass1Rate).toBeNull();
  });

  test('overall.pass3Rate 為 null', () => {
    const result = timeline.passAtK(session.id);
    expect(result.overall.pass3Rate).toBeNull();
  });

  test('stages 為空物件 {}', () => {
    const result = timeline.passAtK(session.id);
    expect(result.stages).toEqual({});
  });
});

// ════════════════════════════════════════════════════════
// Scenario D-5: timeline 檔案不存在時優雅回傳
// ════════════════════════════════════════════════════════

describe('passAtK() — Scenario D-5: timeline 檔案不存在', () => {
  let session;
  beforeEach(() => {
    session = makeSession('d5');
    // 故意不建立目錄，讓 timeline 檔案不存在
  });
  afterEach(() => {
    // 清理（若存在）
    rmSync(session.dir, { recursive: true, force: true });
  });

  test('不拋出例外', () => {
    expect(() => timeline.passAtK(session.id)).not.toThrow();
  });

  test('overall.stageCount 為 0', () => {
    const result = timeline.passAtK(session.id);
    expect(result.overall.stageCount).toBe(0);
  });

  test('overall.pass1Rate 為 null', () => {
    const result = timeline.passAtK(session.id);
    expect(result.overall.pass1Rate).toBeNull();
  });
});

// ════════════════════════════════════════════════════════
// Scenario D-6: 單一 stage 只有 1 次嘗試時 passConsecutive3 為 null
// ════════════════════════════════════════════════════════

describe('passAtK() — Scenario D-6: 單一 stage 只有 1 次嘗試', () => {
  let session;
  beforeEach(() => {
    session = makeSession('d6');
    mkdirSync(session.dir, { recursive: true });
    appendStageComplete(session.id, 'DEV', 'pass');
  });
  afterEach(() => {
    rmSync(session.dir, { recursive: true, force: true });
  });

  test('passConsecutive3 為 null（n < 3）', () => {
    const result = timeline.passAtK(session.id);
    expect(result.stages.DEV.passConsecutive3).toBeNull();
  });

  test('pass1 為 true', () => {
    const result = timeline.passAtK(session.id);
    expect(result.stages.DEV.pass1).toBe(true);
  });
});

// ════════════════════════════════════════════════════════
// Scenario D-7: stage 事件沒有 stage 欄位時被忽略
// ════════════════════════════════════════════════════════

describe('passAtK() — Scenario D-7: stage 事件缺少 stage 欄位', () => {
  let session;
  beforeEach(() => {
    session = makeSession('d7');
    mkdirSync(session.dir, { recursive: true });
    // 直接寫入沒有 stage 欄位的 stage:complete 事件
    appendEvent(session.id, {
      ts: new Date().toISOString(),
      type: 'stage:complete',
      category: 'stage',
      label: 'stage:complete',
      result: 'pass',
      // 故意不加 stage 欄位
    });
  });
  afterEach(() => {
    rmSync(session.dir, { recursive: true, force: true });
  });

  test('overall.stageCount 為 0（沒有 stage 欄位的事件被 if (!e.stage) continue 跳過）', () => {
    const result = timeline.passAtK(session.id);
    expect(result.overall.stageCount).toBe(0);
  });

  test('stages 為空物件 {}', () => {
    const result = timeline.passAtK(session.id);
    expect(result.stages).toEqual({});
  });
});

// ════════════════════════════════════════════════════════
// Scenario D-8: passConsecutive3 在有 3 次或以上且最後 3 次全 pass 時為 true
// ════════════════════════════════════════════════════════

describe('passAtK() — Scenario D-8: 最後 3 次全 pass', () => {
  let session;
  beforeEach(() => {
    session = makeSession('d8');
    mkdirSync(session.dir, { recursive: true });
    // 4 筆：fail → pass → pass → pass
    appendStageComplete(session.id, 'DEV', 'fail', '2026-01-01T00:00:00.000Z');
    appendStageComplete(session.id, 'DEV', 'pass', '2026-01-01T00:01:00.000Z');
    appendStageComplete(session.id, 'DEV', 'pass', '2026-01-01T00:02:00.000Z');
    appendStageComplete(session.id, 'DEV', 'pass', '2026-01-01T00:03:00.000Z');
  });
  afterEach(() => {
    rmSync(session.dir, { recursive: true, force: true });
  });

  test('passConsecutive3 為 true（最後 3 筆均為 pass）', () => {
    const result = timeline.passAtK(session.id);
    expect(result.stages.DEV.passConsecutive3).toBe(true);
  });

  test('pass3 為 true（前 3 筆中 index=1 已是 pass）', () => {
    const result = timeline.passAtK(session.id);
    expect(result.stages.DEV.pass3).toBe(true);
  });

  test('pass1 為 false（第一次 fail）', () => {
    const result = timeline.passAtK(session.id);
    expect(result.stages.DEV.pass1).toBe(false);
  });

  test('attempts 長度為 4', () => {
    const result = timeline.passAtK(session.id);
    expect(result.stages.DEV.attempts).toHaveLength(4);
  });
});
