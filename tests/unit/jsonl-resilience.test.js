'use strict';
/**
 * jsonl-resilience.test.js — JSONL 損壞行容錯測試
 *
 * BDD 規格：specs/features/in-progress/core-refactor-iter1/bdd-iter3.md
 *
 * Feature A: timeline.query() 損壞行容錯
 * Feature B: timeline.latest() 損壞行容錯
 * Feature C: timeline.count() 損壞行容錯
 * Feature E: instinct._readAll() 損壞行容錯
 *
 * 策略：
 *   - 直接寫入混合有效/無效行的 JSONL 到暫存 session 目錄
 *   - 每個測試建立獨立 session，afterEach 清理
 *   - 不使用 timeline.emit()（會驗證事件類型），改用 appendFileSync 直接寫
 */
const { test, expect, beforeEach, afterEach, describe } = require('bun:test');
const { mkdirSync, rmSync, appendFileSync, writeFileSync } = require('fs');
const { join, dirname } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');
const { makeTmpProject, createCtx, cleanupProject } = require('../helpers/session-factory');

const timeline = require(join(SCRIPTS_LIB, 'timeline'));
const instinct = require(join(SCRIPTS_LIB, 'knowledge/instinct'));
const paths = require(join(SCRIPTS_LIB, 'paths'));

// ── 工具函式 ──

function makeSession(suffix) {
  const projectRoot = makeTmpProject(`ot-resilience-${suffix}`);
  const ctx = createCtx(projectRoot);
  return { projectRoot, ctx };
}

function cleanupSession(session) {
  cleanupProject(session.projectRoot);
}

function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

/** 直接寫入一行到 timeline JSONL（繞過 emit() 驗證） */
function appendRawLine(ctx, line) {
  const filePath = ctx.timelineFile();
  ensureDir(filePath);
  appendFileSync(filePath, line + '\n', 'utf8');
}

/** 直接寫入一個有效事件行 */
function appendEvent(ctx, event) {
  appendRawLine(ctx, JSON.stringify(event));
}

/** 直接寫入一行到 observations JSONL（繞過 instinct.emit() 驗證） */
function appendObsRawLine(sessionId, line) {
  const filePath = paths.session.observations(sessionId);
  ensureDir(filePath);
  appendFileSync(filePath, line + '\n', 'utf8');
}

/** 建立標準 stage:complete 事件 */
function makeStageEvent(stage, result, extra = {}) {
  return {
    ts: new Date().toISOString(),
    type: 'stage:complete',
    category: 'stage',
    label: 'stage:complete',
    stage,
    result,
    ...extra,
  };
}

/** 建立標準 instinct 觀察記錄 */
function makeInstinct(id, tag, type = 'tool_preferences', confidence = 0.3) {
  return {
    id,
    ts: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    type,
    trigger: 'test trigger',
    action: 'test action',
    tag,
    confidence,
    count: 1,
  };
}

// ════════════════════════════════════════════════════════
// Feature A: timeline.query() 損壞行容錯
// ════════════════════════════════════════════════════════

describe('Feature A: query() — 損壞行容錯', () => {
  let session;
  beforeEach(() => {
    session = makeSession('qry');
  });
  afterEach(() => {
    cleanupSession(session);
  });

  // Scenario A-1: 正常路徑
  test('Scenario A-1: 混合損壞行與有效行時回傳所有有效事件', () => {
    // 3 筆有效事件，第 2 行為損壞
    appendEvent(session.ctx, makeStageEvent('DEV', 'pass'));
    appendRawLine(session.ctx, '{bad json');
    appendEvent(session.ctx, makeStageEvent('REVIEW', 'pass'));

    const result = timeline.queryCtx(session.ctx);

    // 損壞行被略過，只回傳 2 筆
    expect(result).toHaveLength(2);
    expect(result.every(e => typeof e.type === 'string')).toBe(true);
  });

  // Scenario A-2: 邊界條件 — 全部行均損壞
  test('Scenario A-2: 所有行均損壞時回傳空陣列且不拋出例外', () => {
    appendRawLine(session.ctx, 'CORRUPTED');
    appendRawLine(session.ctx, '!!!');
    appendRawLine(session.ctx, '{bad');

    expect(() => {
      const result = timeline.queryCtx(session.ctx);
      expect(result).toEqual([]);
    }).not.toThrow();
  });

  // Scenario A-3: 邊界條件 — type filter 仍只返回有效且匹配的事件
  test('Scenario A-3: 混合損壞行時 type filter 仍只返回有效且匹配的事件', () => {
    appendEvent(session.ctx, makeStageEvent('DEV', 'pass'));
    appendRawLine(session.ctx, '{invalid json}');
    appendEvent(session.ctx, {
      ts: new Date().toISOString(),
      type: 'workflow:start',
      category: 'workflow',
      label: 'workflow:start',
    });

    const result = timeline.queryCtx(session.ctx, { type: 'stage:complete' });

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('stage:complete');
  });

  // Scenario A-4: 邊界條件 — category filter 仍正確計算
  test('Scenario A-4: 混合損壞行時 category filter 仍正確計算', () => {
    appendEvent(session.ctx, makeStageEvent('DEV', 'pass'));
    appendEvent(session.ctx, makeStageEvent('REVIEW', 'pass'));
    appendRawLine(session.ctx, 'not json at all');
    appendEvent(session.ctx, {
      ts: new Date().toISOString(),
      type: 'workflow:start',
      category: 'workflow',
      label: 'workflow:start',
    });

    const result = timeline.queryCtx(session.ctx, { category: 'stage' });

    expect(result).toHaveLength(2);
  });

  // Scenario A-5: 快速路徑（只有 limit）遇到損壞行
  test('Scenario A-5: 快速路徑（僅 limit）遇到損壞行時仍正確回傳', () => {
    // 5 行：前 2 行有效、第 3 行損壞、後 2 行有效
    appendEvent(session.ctx, makeStageEvent('DEV', 'fail'));
    appendEvent(session.ctx, makeStageEvent('DEV', 'pass'));
    appendRawLine(session.ctx, '{corrupted');
    appendEvent(session.ctx, makeStageEvent('REVIEW', 'pass'));
    appendEvent(session.ctx, makeStageEvent('TEST', 'pass'));

    // limit:3 快速路徑：取最後 3 行（1 損壞 + 2 有效），解析後 map+filter → 2 筆
    const result = timeline.queryCtx(session.ctx, { limit: 3 });

    expect(result).toHaveLength(2);
    expect(() => timeline.queryCtx(session.ctx, { limit: 3 })).not.toThrow();
  });
});

// ════════════════════════════════════════════════════════
// Feature B: timeline.latest() 損壞行容錯
// ════════════════════════════════════════════════════════

describe('Feature B: latest() — 損壞行容錯', () => {
  let session;
  beforeEach(() => {
    session = makeSession('lat');
  });
  afterEach(() => {
    cleanupSession(session);
  });

  // Scenario B-1: 最後一行損壞時回退至上一筆有效匹配事件
  test('Scenario B-1: 最後一行損壞時回退至上一筆有效匹配事件', () => {
    appendEvent(session.ctx, makeStageEvent('DEV', 'pass'));
    appendRawLine(session.ctx, '{corrupted json');

    const result = timeline.latestCtx(session.ctx, 'stage:complete');

    expect(result).not.toBeNull();
    expect(result.type).toBe('stage:complete');
  });

  // Scenario B-2: 目標事件後方有多行損壞，仍能反向找到
  test('Scenario B-2: 目標事件後方有多行損壞 JSON，仍能反向找到目標', () => {
    appendEvent(session.ctx, makeStageEvent('DEV', 'pass'));
    appendRawLine(session.ctx, 'bad1');
    appendRawLine(session.ctx, 'bad2');
    appendRawLine(session.ctx, 'bad3');

    const result = timeline.latestCtx(session.ctx, 'stage:complete');

    expect(result).not.toBeNull();
    expect(result.type).toBe('stage:complete');
  });

  // Scenario B-3: 全部行均損壞時回傳 null
  test('Scenario B-3: 全部行均損壞時回傳 null 且不拋出例外', () => {
    appendRawLine(session.ctx, 'CORRUPTED');
    appendRawLine(session.ctx, '{bad');
    appendRawLine(session.ctx, '!!!');

    expect(() => {
      const result = timeline.latestCtx(session.ctx, 'stage:complete');
      expect(result).toBeNull();
    }).not.toThrow();
  });

  // Scenario B-4: 有效事件夾在損壞行之間時仍可找到
  test('Scenario B-4: 有效事件夾在損壞行之間時仍可找到（反向掃描）', () => {
    appendRawLine(session.ctx, 'bad-first-line');
    appendEvent(session.ctx, makeStageEvent('DEV', 'pass'));
    appendRawLine(session.ctx, 'bad-middle-line');
    appendEvent(session.ctx, {
      ts: new Date().toISOString(),
      type: 'workflow:complete',
      category: 'workflow',
      label: 'workflow:complete',
    });

    // 反向掃描：workflow:complete 型別不匹配跳過，bad-middle-line 損壞跳過，stage:complete 匹配
    const result = timeline.latestCtx(session.ctx, 'stage:complete');

    expect(result).not.toBeNull();
    expect(result.type).toBe('stage:complete');
  });
});

// ════════════════════════════════════════════════════════
// Feature C: timeline.count() 損壞行容錯
// ════════════════════════════════════════════════════════

describe('Feature C: count() — 損壞行容錯', () => {
  let session;
  beforeEach(() => {
    session = makeSession('cnt');
  });
  afterEach(() => {
    cleanupSession(session);
  });

  // Scenario C-1: 無 filter 模式 — 損壞行計入行數（不解析 JSON）
  test('Scenario C-1: 無 filter — 損壞行計入行數（行計數模式）', () => {
    appendEvent(session.ctx, makeStageEvent('DEV', 'pass'));
    appendEvent(session.ctx, makeStageEvent('REVIEW', 'pass'));
    appendRawLine(session.ctx, '{corrupted json');

    // 無 filter → 不解析 JSON，只計行數，損壞行也計入
    const result = timeline.countCtx(session.ctx);

    expect(result).toBe(3);
    expect(() => timeline.countCtx(session.ctx)).not.toThrow();
  });

  // Scenario C-2: type filter 模式 — 損壞行被略過
  test('Scenario C-2: type filter — 損壞行被 catch 跳過，只計有效且匹配的事件', () => {
    appendEvent(session.ctx, makeStageEvent('DEV', 'pass'));
    appendEvent(session.ctx, makeStageEvent('REVIEW', 'pass'));
    appendRawLine(session.ctx, '{bad json');
    appendEvent(session.ctx, {
      ts: new Date().toISOString(),
      type: 'workflow:start',
      category: 'workflow',
      label: 'workflow:start',
    });

    const result = timeline.countCtx(session.ctx, { type: 'stage:complete' });

    expect(result).toBe(2);
  });

  // Scenario C-3: 邊界條件 — 全部行損壞，type filter 回傳 0
  test('Scenario C-3: 全部行均損壞時，type filter 模式回傳 0 且不拋出例外', () => {
    appendRawLine(session.ctx, 'CORRUPTED');
    appendRawLine(session.ctx, '{bad');
    appendRawLine(session.ctx, '!!!');

    expect(() => {
      const result = timeline.countCtx(session.ctx, { type: 'stage:complete' });
      expect(result).toBe(0);
    }).not.toThrow();
  });

  // Scenario C-4: 邊界條件 — 全部行損壞，category filter 回傳 0
  test('Scenario C-4: 全部行均損壞時，category filter 模式回傳 0 且不拋出例外', () => {
    appendRawLine(session.ctx, 'bad1');
    appendRawLine(session.ctx, 'bad2');

    expect(() => {
      const result = timeline.countCtx(session.ctx, { category: 'stage' });
      expect(result).toBe(0);
    }).not.toThrow();
  });
});

// ════════════════════════════════════════════════════════
// Feature E: instinct._readAll() 損壞行容錯
// ════════════════════════════════════════════════════════

describe('Feature E: instinct._readAll() — 損壞行容錯', () => {
  let session;
  // 注意：instinct 使用 sessionId 而非 ctx（instinct 尚未遷移到 Ctx API）
  // 因此使用全域 sessions 路徑下的獨立測試 session
  const { homedir } = require('os');
  let sessionId;

  beforeEach(() => {
    session = makeSession('obs');
    // instinct 使用全域路徑，需要有唯一的 session id 前綴避免與其他測試衝突
    sessionId = `test_resilience_obs_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const sessionDir = join(homedir(), '.nova', 'sessions', sessionId);
    mkdirSync(sessionDir, { recursive: true });
  });
  afterEach(() => {
    cleanupSession(session);
    const sessionDir = join(homedir(), '.nova', 'sessions', sessionId);
    rmSync(sessionDir, { recursive: true, force: true });
  });

  // Scenario E-1: 正常路徑 — 混合損壞行與有效記錄時回傳所有有效 instinct
  test('Scenario E-1: 混合損壞行與有效記錄時回傳所有有效 instinct', () => {
    appendObsRawLine(sessionId, '{bad corrupted line');
    appendObsRawLine(sessionId, JSON.stringify(makeInstinct('A', 'npm-bun')));
    appendObsRawLine(sessionId, JSON.stringify(makeInstinct('B', 'bun-test')));

    const result = instinct.query(sessionId);

    expect(result).toHaveLength(2);
    expect(() => instinct.query(sessionId)).not.toThrow();
  });

  // Scenario E-2: 邊界條件 — 全部行均損壞時回傳空陣列
  test('Scenario E-2: 全部行均損壞時回傳空陣列且不拋出例外', () => {
    appendObsRawLine(sessionId, 'CORRUPTED');
    appendObsRawLine(sessionId, '{bad');
    appendObsRawLine(sessionId, '!!!');

    expect(() => {
      const result = instinct.query(sessionId);
      expect(result).toEqual([]);
    }).not.toThrow();
  });

  // Scenario E-3: 損壞行夾在有效記錄中間，同 id 合併邏輯仍正確運作
  test('Scenario E-3: 損壞行夾在有效記錄中間，同 id 合併（後者覆蓋前者）仍正確', () => {
    const instA_v1 = makeInstinct('id-A', 'npm-bun', 'tool_preferences', 0.3);
    const instA_v2 = { ...instA_v1, confidence: 0.7, count: 2 };

    appendObsRawLine(sessionId, JSON.stringify(instA_v1));
    appendObsRawLine(sessionId, '{corrupted in between');
    appendObsRawLine(sessionId, JSON.stringify(instA_v2));

    const result = instinct.query(sessionId);

    // 同 id 合併，只有 1 筆
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('id-A');
    // 後者覆蓋前者，confidence 為最後一筆的值
    expect(result[0].confidence).toBe(0.7);
  });

  // Scenario E-4: 損壞行不觸發 auto-compact 的誤判（有效唯一條目計算正確）
  test('Scenario E-4: 損壞行不計入有效 items，auto-compact 條件判斷正確', () => {
    // 2 筆唯一有效記錄（id A 和 B）+ 3 行損壞
    appendObsRawLine(sessionId, JSON.stringify(makeInstinct('id-A', 'npm-bun')));
    appendObsRawLine(sessionId, JSON.stringify(makeInstinct('id-B', 'bun-test')));
    appendObsRawLine(sessionId, 'bad1');
    appendObsRawLine(sessionId, 'bad2');
    appendObsRawLine(sessionId, 'bad3');

    // 原始行數 5，merged.length = 2，lines.length(5) > merged.length * 2(4) → true，觸發壓縮
    // 壓縮後 observations.jsonl 應只剩 2 行（2 筆唯一 instinct）
    const result = instinct.query(sessionId);

    // 只有 2 筆有效 instinct
    expect(result).toHaveLength(2);
    expect(result.map(r => r.id).sort()).toEqual(['id-A', 'id-B']);
  });
});
