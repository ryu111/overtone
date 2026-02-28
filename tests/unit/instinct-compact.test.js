'use strict';
/**
 * instinct-compact.test.js — instinct.js _readAll() auto-compact 行為測試
 *
 * 測試情境：
 *   1. JSONL 同 id 行數超過唯一條目 2 倍時，_readAll() 後自動觸發壓縮
 *   2. 壓縮後資料完整性不變（合併結果相同）
 *   3. 行數未超過閾值時不觸發壓縮
 *   4. 空檔案不觸發壓縮
 */
const { test, expect, beforeEach, afterEach, describe } = require('bun:test');
const { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const instinct = require(join(SCRIPTS_LIB, 'instinct'));
const paths = require(join(SCRIPTS_LIB, 'paths'));

// 每個 describe 使用獨立 session，避免測試間污染
function makeSession(suffix) {
  const id = `test_compact_${suffix}_${Date.now()}`;
  const dir = join(homedir(), '.overtone', 'sessions', id);
  return { id, dir };
}

// 直接寫 JSONL 內容到 observations 檔案，繞過 instinct API
function writeObservations(sessionId, lines) {
  const filePath = paths.session.observations(sessionId);
  mkdirSync(require('path').dirname(filePath), { recursive: true });
  writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');
}

// 讀取 observations 檔案中的行數
function countLines(sessionId) {
  const filePath = paths.session.observations(sessionId);
  if (!existsSync(filePath)) return 0;
  return readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean).length;
}

// ════════════════════════════════════════════════════════
// Scenario 1：同 id 行數超過唯一條目 2 倍 → 觸發壓縮
// ════════════════════════════════════════════════════════
describe('auto-compact — 觸發壓縮', () => {
  let session;
  beforeEach(() => {
    session = makeSession('trigger');
    mkdirSync(session.dir, { recursive: true });
  });
  afterEach(() => {
    rmSync(session.dir, { recursive: true, force: true });
  });

  test('3 個唯一 id，各有 3 行（共 9 行）超過閾值 6 → 壓縮至 3 行', () => {
    // 3 個 id，每個 3 行（lines = 9，threshold = 3 * 2 = 6）
    const items = [
      { id: 'inst_aaa', tag: 'a', confidence: 0.3, count: 1, ts: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T00:00:00.000Z', type: 'error_resolutions', trigger: 't1', action: 'a1' },
      { id: 'inst_aaa', tag: 'a', confidence: 0.35, count: 2, ts: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T00:01:00.000Z', type: 'error_resolutions', trigger: 't2', action: 'a2' },
      { id: 'inst_aaa', tag: 'a', confidence: 0.4, count: 3, ts: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T00:02:00.000Z', type: 'error_resolutions', trigger: 't3', action: 'a3' },
      { id: 'inst_bbb', tag: 'b', confidence: 0.3, count: 1, ts: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T00:00:00.000Z', type: 'tool_preferences', trigger: 'tb1', action: 'ab1' },
      { id: 'inst_bbb', tag: 'b', confidence: 0.35, count: 2, ts: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T00:01:00.000Z', type: 'tool_preferences', trigger: 'tb2', action: 'ab2' },
      { id: 'inst_bbb', tag: 'b', confidence: 0.4, count: 3, ts: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T00:02:00.000Z', type: 'tool_preferences', trigger: 'tb3', action: 'ab3' },
      { id: 'inst_ccc', tag: 'c', confidence: 0.3, count: 1, ts: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T00:00:00.000Z', type: 'user_corrections', trigger: 'tc1', action: 'ac1' },
      { id: 'inst_ccc', tag: 'c', confidence: 0.35, count: 2, ts: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T00:01:00.000Z', type: 'user_corrections', trigger: 'tc2', action: 'ac2' },
      { id: 'inst_ccc', tag: 'c', confidence: 0.4, count: 3, ts: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T00:02:00.000Z', type: 'user_corrections', trigger: 'tc3', action: 'ac3' },
    ];
    writeObservations(session.id, items.map(i => JSON.stringify(i)));

    // 觸發 _readAll()（透過 query()）
    instinct.query(session.id);

    // 壓縮後應只剩 3 行（每個唯一 id 的最新版本）
    expect(countLines(session.id)).toBe(3);
  });

  test('2 個唯一 id，各有 4 行（共 8 行）超過閾值 4 → 觸發壓縮', () => {
    const buildItem = (id, tag, type, confidence, n) => ({
      id, tag, type, confidence, count: n,
      ts: '2026-01-01T00:00:00.000Z',
      lastSeen: `2026-01-01T00:0${n}:00.000Z`,
      trigger: `t${n}`, action: `a${n}`,
    });

    const lines = [
      buildItem('inst_x1', 'x', 'error_resolutions', 0.3, 1),
      buildItem('inst_x1', 'x', 'error_resolutions', 0.35, 2),
      buildItem('inst_x1', 'x', 'error_resolutions', 0.4, 3),
      buildItem('inst_x1', 'x', 'error_resolutions', 0.45, 4),
      buildItem('inst_x2', 'y', 'tool_preferences', 0.3, 1),
      buildItem('inst_x2', 'y', 'tool_preferences', 0.35, 2),
      buildItem('inst_x2', 'y', 'tool_preferences', 0.4, 3),
      buildItem('inst_x2', 'y', 'tool_preferences', 0.45, 4),
    ];
    writeObservations(session.id, lines.map(i => JSON.stringify(i)));

    instinct.query(session.id);

    expect(countLines(session.id)).toBe(2);
  });
});

// ════════════════════════════════════════════════════════
// Scenario 2：壓縮後資料完整性不變
// ════════════════════════════════════════════════════════
describe('auto-compact — 資料完整性', () => {
  let session;
  beforeEach(() => {
    session = makeSession('integrity');
    mkdirSync(session.dir, { recursive: true });
  });
  afterEach(() => {
    rmSync(session.dir, { recursive: true, force: true });
  });

  test('壓縮後每個 id 保留最新版本（最後一行覆蓋）', () => {
    const items = [
      { id: 'inst_d1', tag: 'd', confidence: 0.3, count: 1, ts: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T00:00:00.000Z', type: 'error_resolutions', trigger: 'old', action: 'old' },
      { id: 'inst_d1', tag: 'd', confidence: 0.35, count: 2, ts: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T00:01:00.000Z', type: 'error_resolutions', trigger: 'mid', action: 'mid' },
      { id: 'inst_d1', tag: 'd', confidence: 0.9, count: 3, ts: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T00:02:00.000Z', type: 'error_resolutions', trigger: 'latest', action: 'latest' },
      { id: 'inst_d2', tag: 'e', confidence: 0.5, count: 2, ts: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T00:00:00.000Z', type: 'tool_preferences', trigger: 'e-old', action: 'e-old' },
      { id: 'inst_d2', tag: 'e', confidence: 0.7, count: 3, ts: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T00:01:00.000Z', type: 'tool_preferences', trigger: 'e-latest', action: 'e-latest' },
      { id: 'inst_d3', tag: 'f', confidence: 0.3, count: 1, ts: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T00:00:00.000Z', type: 'user_corrections', trigger: 'f1', action: 'f1' },
      // 6 行，3 個 id → threshold = 3*2=6，剛好等於，不觸發壓縮。再多一行讓 7 > 6
      { id: 'inst_d1', tag: 'd', confidence: 0.95, count: 4, ts: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T00:03:00.000Z', type: 'error_resolutions', trigger: 'newest', action: 'newest' },
    ];
    writeObservations(session.id, items.map(i => JSON.stringify(i)));

    const result = instinct.query(session.id);

    // 壓縮後行數
    expect(countLines(session.id)).toBe(3);

    // 確認每個 id 保留最新版本
    const d1 = result.find(i => i.id === 'inst_d1');
    expect(d1).toBeDefined();
    expect(d1.confidence).toBe(0.95);
    expect(d1.trigger).toBe('newest');
    expect(d1.count).toBe(4);

    const d2 = result.find(i => i.id === 'inst_d2');
    expect(d2).toBeDefined();
    expect(d2.confidence).toBe(0.7);
    expect(d2.trigger).toBe('e-latest');

    const d3 = result.find(i => i.id === 'inst_d3');
    expect(d3).toBeDefined();
    expect(d3.confidence).toBe(0.3);
  });

  test('壓縮後再次 query 結果與壓縮前一致', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      id: `inst_q${i % 3}`,
      tag: `q${i % 3}`,
      type: 'error_resolutions',
      confidence: 0.3 + i * 0.05,
      count: i + 1,
      ts: '2026-01-01T00:00:00.000Z',
      lastSeen: `2026-01-01T00:${String(i).padStart(2, '0')}:00.000Z`,
      trigger: `t${i}`,
      action: `a${i}`,
    }));
    writeObservations(session.id, items.map(i => JSON.stringify(i)));

    const beforeCompact = instinct.query(session.id);
    // 第一次 query 觸發壓縮
    const afterCompact = instinct.query(session.id);

    // 結果應相同（轉成 id→item Map 比較）
    const toMap = arr => Object.fromEntries(arr.map(i => [i.id, i]));
    expect(toMap(afterCompact)).toEqual(toMap(beforeCompact));
  });
});

// ════════════════════════════════════════════════════════
// Scenario 3：行數未超過閾值時不觸發壓縮
// ════════════════════════════════════════════════════════
describe('auto-compact — 不觸發情境', () => {
  let session;
  beforeEach(() => {
    session = makeSession('no-trigger');
    mkdirSync(session.dir, { recursive: true });
  });
  afterEach(() => {
    rmSync(session.dir, { recursive: true, force: true });
  });

  test('3 個唯一 id，共 6 行（等於 3*2 閾值）→ 不觸發壓縮', () => {
    // lines.length = 6，merged.length * 2 = 6 → 6 > 6 is false，不壓縮
    const items = [
      { id: 'inst_n1', tag: 'n1', confidence: 0.3, count: 1, ts: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T00:00:00.000Z', type: 'error_resolutions', trigger: 't', action: 'a' },
      { id: 'inst_n1', tag: 'n1', confidence: 0.35, count: 2, ts: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T00:01:00.000Z', type: 'error_resolutions', trigger: 't2', action: 'a2' },
      { id: 'inst_n2', tag: 'n2', confidence: 0.3, count: 1, ts: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T00:00:00.000Z', type: 'tool_preferences', trigger: 't', action: 'a' },
      { id: 'inst_n2', tag: 'n2', confidence: 0.35, count: 2, ts: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T00:01:00.000Z', type: 'tool_preferences', trigger: 't2', action: 'a2' },
      { id: 'inst_n3', tag: 'n3', confidence: 0.3, count: 1, ts: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T00:00:00.000Z', type: 'user_corrections', trigger: 't', action: 'a' },
      { id: 'inst_n3', tag: 'n3', confidence: 0.35, count: 2, ts: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T00:01:00.000Z', type: 'user_corrections', trigger: 't2', action: 'a2' },
    ];
    writeObservations(session.id, items.map(i => JSON.stringify(i)));

    instinct.query(session.id);

    // 行數保持不變（6 行）
    expect(countLines(session.id)).toBe(6);
  });

  test('每個 id 只有一行（無重複）→ 不觸發壓縮', () => {
    const items = [
      { id: 'inst_o1', tag: 'o1', confidence: 0.3, count: 1, ts: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T00:00:00.000Z', type: 'error_resolutions', trigger: 't', action: 'a' },
      { id: 'inst_o2', tag: 'o2', confidence: 0.4, count: 1, ts: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T00:00:00.000Z', type: 'tool_preferences', trigger: 't', action: 'a' },
      { id: 'inst_o3', tag: 'o3', confidence: 0.5, count: 1, ts: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T00:00:00.000Z', type: 'user_corrections', trigger: 't', action: 'a' },
    ];
    writeObservations(session.id, items.map(i => JSON.stringify(i)));

    instinct.query(session.id);

    expect(countLines(session.id)).toBe(3);
  });
});

// ════════════════════════════════════════════════════════
// Scenario 4：空檔案不觸發壓縮
// ════════════════════════════════════════════════════════
describe('auto-compact — 邊界情境', () => {
  let session;
  beforeEach(() => {
    session = makeSession('edge');
    mkdirSync(session.dir, { recursive: true });
  });
  afterEach(() => {
    rmSync(session.dir, { recursive: true, force: true });
  });

  test('observations 檔案不存在 → 回傳空陣列，不建立檔案', () => {
    const result = instinct.query(session.id);
    expect(result).toEqual([]);
    expect(existsSync(paths.session.observations(session.id))).toBe(false);
  });

  test('observations 檔案存在但為空 → 回傳空陣列，檔案不被修改', () => {
    const filePath = paths.session.observations(session.id);
    mkdirSync(require('path').dirname(filePath), { recursive: true });
    writeFileSync(filePath, '', 'utf8');

    const result = instinct.query(session.id);
    expect(result).toEqual([]);
    // 空檔案 merged.length = 0，條件 merged.length > 0 不成立，不寫回
    expect(readFileSync(filePath, 'utf8')).toBe('');
  });

  test('單一唯一 id，1 行 → 不觸發壓縮（1 > 1*2 is false）', () => {
    const items = [
      { id: 'inst_s1', tag: 's1', confidence: 0.3, count: 1, ts: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T00:00:00.000Z', type: 'error_resolutions', trigger: 't', action: 'a' },
    ];
    writeObservations(session.id, items.map(i => JSON.stringify(i)));

    instinct.query(session.id);

    expect(countLines(session.id)).toBe(1);
  });
});
