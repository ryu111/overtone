'use strict';
const { test, expect, beforeEach, afterEach, describe } = require('bun:test');
const { mkdirSync, rmSync, readFileSync, existsSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const TEST_SESSION = `test_instinct_${Date.now()}`;
const SESSION_DIR = join(homedir(), '.overtone', 'sessions', TEST_SESSION);

const instinct = require(join(SCRIPTS_LIB, 'instinct'));
const paths = require(join(SCRIPTS_LIB, 'paths'));

beforeEach(() => {
  mkdirSync(SESSION_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(SESSION_DIR, { recursive: true, force: true });
});

describe('emit — 新建', () => {
  test('建立新 instinct 並回傳完整物件', () => {
    const result = instinct.emit(TEST_SESSION, 'error_resolutions', 'npm install 失敗', '改用 bun', 'npm-bun');
    expect(result.id).toMatch(/^inst_/);
    expect(result.type).toBe('error_resolutions');
    expect(result.tag).toBe('npm-bun');
    expect(result.confidence).toBe(0.3);
    expect(result.count).toBe(1);
  });

  test('新建使用 append（檢查 JSONL 格式）', () => {
    instinct.emit(TEST_SESSION, 'tool_preferences', 'trigger1', 'action1', 'tag-a');
    instinct.emit(TEST_SESSION, 'tool_preferences', 'trigger2', 'action2', 'tag-b');

    const content = readFileSync(paths.session.observations(TEST_SESSION), 'utf8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).tag).toBe('tag-a');
    expect(JSON.parse(lines[1]).tag).toBe('tag-b');
  });
});

describe('emit — 重複（confirm）', () => {
  test('同 tag + type 觸發 confirm（信心 +0.05）', () => {
    instinct.emit(TEST_SESSION, 'error_resolutions', 'trigger1', 'action1', 'dup-tag');
    const result = instinct.emit(TEST_SESSION, 'error_resolutions', 'trigger2', 'action2', 'dup-tag');

    expect(result.confidence).toBe(0.35); // 0.30 + 0.05
    expect(result.count).toBe(2);
    expect(result.trigger).toBe('trigger2'); // 更新為最新
  });

  test('不同 type 不觸發 confirm', () => {
    instinct.emit(TEST_SESSION, 'error_resolutions', 'trigger', 'action', 'same-tag');
    const result = instinct.emit(TEST_SESSION, 'tool_preferences', 'trigger', 'action', 'same-tag');

    expect(result.confidence).toBe(0.3); // 新建，不是 confirm
    expect(result.count).toBe(1);
  });
});

describe('confirm / contradict', () => {
  test('confirm 增加信心 +0.05', () => {
    const original = instinct.emit(TEST_SESSION, 'error_resolutions', 't', 'a', 'conf-tag');
    const confirmed = instinct.confirm(TEST_SESSION, original.id);
    expect(confirmed.confidence).toBe(0.35);
  });

  test('contradict 減少信心 -0.10', () => {
    const original = instinct.emit(TEST_SESSION, 'error_resolutions', 't', 'a', 'contra-tag');
    const contradicted = instinct.contradict(TEST_SESSION, original.id);
    expect(contradicted.confidence).toBe(0.2); // 0.3 - 0.1
  });

  test('信心不超過 1.0', () => {
    const item = instinct.emit(TEST_SESSION, 'error_resolutions', 't', 'a', 'max-tag');
    // 連續 confirm 15 次：0.3 + 15*0.05 = 1.05 → 夾到 1.0
    for (let i = 0; i < 15; i++) {
      instinct.confirm(TEST_SESSION, item.id);
    }
    const result = instinct.query(TEST_SESSION, { tag: 'max-tag' });
    expect(result[0].confidence).toBeLessThanOrEqual(1.0);
  });

  test('信心不低於 0.0', () => {
    const item = instinct.emit(TEST_SESSION, 'error_resolutions', 't', 'a', 'min-tag');
    for (let i = 0; i < 5; i++) {
      instinct.contradict(TEST_SESSION, item.id);
    }
    const result = instinct.query(TEST_SESSION, { tag: 'min-tag' });
    expect(result[0].confidence).toBeGreaterThanOrEqual(0.0);
  });

  test('不存在的 ID 回傳 null', () => {
    expect(instinct.confirm(TEST_SESSION, 'nonexistent')).toBeNull();
    expect(instinct.contradict(TEST_SESSION, 'nonexistent')).toBeNull();
  });
});

describe('query', () => {
  test('依 type 篩選', () => {
    instinct.emit(TEST_SESSION, 'error_resolutions', 't', 'a', 'tag-a');
    instinct.emit(TEST_SESSION, 'tool_preferences', 't', 'a', 'tag-b');

    const errors = instinct.query(TEST_SESSION, { type: 'error_resolutions' });
    expect(errors.length).toBe(1);
    expect(errors[0].tag).toBe('tag-a');
  });

  test('依 minConfidence 篩選', () => {
    const item = instinct.emit(TEST_SESSION, 'error_resolutions', 't', 'a', 'high-conf');
    // Confirm 到 0.7 以上
    for (let i = 0; i < 9; i++) {
      instinct.confirm(TEST_SESSION, item.id);
    }
    instinct.emit(TEST_SESSION, 'error_resolutions', 't', 'a', 'low-conf');

    const high = instinct.query(TEST_SESSION, { minConfidence: 0.7 });
    expect(high.length).toBe(1);
    expect(high[0].tag).toBe('high-conf');
  });
});

describe('prune', () => {
  test('刪除低於 autoDeleteThreshold 的 instinct', () => {
    const item = instinct.emit(TEST_SESSION, 'error_resolutions', 't', 'a', 'prune-tag');
    // 降到 0.1（低於 0.2 autoDeleteThreshold）
    instinct.contradict(TEST_SESSION, item.id); // 0.2
    instinct.contradict(TEST_SESSION, item.id); // 0.1

    const pruned = instinct.prune(TEST_SESSION);
    expect(pruned).toBe(1);

    const remaining = instinct.query(TEST_SESSION);
    expect(remaining.find(i => i.tag === 'prune-tag')).toBeUndefined();
  });
});

describe('getApplicable', () => {
  test('回傳 confidence >= 0.7 的 instinct', () => {
    const item = instinct.emit(TEST_SESSION, 'error_resolutions', 't', 'a', 'applicable-tag');
    // 提升到 0.75
    for (let i = 0; i < 9; i++) {
      instinct.confirm(TEST_SESSION, item.id);
    }
    instinct.emit(TEST_SESSION, 'error_resolutions', 't', 'a', 'not-applicable');

    const applicable = instinct.getApplicable(TEST_SESSION);
    expect(applicable.length).toBe(1);
    expect(applicable[0].tag).toBe('applicable-tag');
  });
});

describe('utils', () => {
  test('空 session 的 query 回傳空陣列', () => {
    expect(instinct.query(TEST_SESSION)).toEqual([]);
  });
});

// ── Feature 1：emit() 飽和閾值 ──

describe('emit — 飽和閾值（confidence >= 1.0）', () => {
  test('信心未達 1.0 時正常追加觀察（0.95 → 1.0）', () => {
    // 手動建立信心 0.95 的記錄
    const item = instinct.emit(TEST_SESSION, 'tool_preferences', 'trigger', 'action', 'saturation-test-1');
    // 連續 confirm 13 次：0.3 + 13*0.05 = 0.95
    for (let i = 0; i < 13; i++) {
      instinct.confirm(TEST_SESSION, item.id);
    }
    const before = instinct.query(TEST_SESSION, { tag: 'saturation-test-1' });
    expect(before[0].confidence).toBe(0.95);

    const obsPath = paths.session.observations(TEST_SESSION);
    const linesBefore = readFileSync(obsPath, 'utf8').trim().split('\n').length;

    // 再 emit 一次（0.95 + 0.05 = 1.0），應該正常追加
    const result = instinct.emit(TEST_SESSION, 'tool_preferences', 'trigger2', 'action2', 'saturation-test-1');
    expect(result.confidence).toBe(1.0);
    expect(result.count).toBe(2);

    // 應該有新增一行
    const linesAfter = readFileSync(obsPath, 'utf8').trim().split('\n').length;
    expect(linesAfter).toBe(linesBefore + 1);
  });

  test('信心已達 1.0 時直接回傳，不再追加', () => {
    // 建立信心已達 1.0 的記錄
    const item = instinct.emit(TEST_SESSION, 'error_resolutions', 'trigger', 'action', 'npm-bun-saturated');
    // 連續 confirm 14 次：0.3 + 14*0.05 = 1.0
    for (let i = 0; i < 14; i++) {
      instinct.confirm(TEST_SESSION, item.id);
    }
    const before = instinct.query(TEST_SESSION, { tag: 'npm-bun-saturated' });
    expect(before[0].confidence).toBe(1.0);

    const obsPath = paths.session.observations(TEST_SESSION);
    const linesBefore = readFileSync(obsPath, 'utf8').trim().split('\n').length;

    // 再 emit 相同 tag + type（信心已達 1.0）
    const result = instinct.emit(TEST_SESSION, 'error_resolutions', 'new-trigger', 'new-action', 'npm-bun-saturated');

    // 應回傳現有物件，confidence 保持 1.0
    expect(result.confidence).toBe(1.0);

    // 行數不應增加
    const linesAfter = readFileSync(obsPath, 'utf8').trim().split('\n').length;
    expect(linesAfter).toBe(linesBefore);
  });

  test('飽和狀態下 count 不遞增', () => {
    const item = instinct.emit(TEST_SESSION, 'agent_performance', 't', 'a', 'saturated-count-test');
    // 調到 1.0
    for (let i = 0; i < 14; i++) {
      instinct.confirm(TEST_SESSION, item.id);
    }
    const before = instinct.query(TEST_SESSION, { tag: 'saturated-count-test' });
    const countBefore = before[0].count;

    // emit 相同 tag + type
    const result = instinct.emit(TEST_SESSION, 'agent_performance', 't2', 'a2', 'saturated-count-test');
    expect(result.count).toBe(countBefore); // count 不遞增
  });

  test('飽和狀態下 lastSeen 不更新（保留衰減能力）', () => {
    const item = instinct.emit(TEST_SESSION, 'workflow_routing', 't', 'a', 'saturated-time-test');
    for (let i = 0; i < 14; i++) {
      instinct.confirm(TEST_SESSION, item.id);
    }
    const before = instinct.query(TEST_SESSION, { tag: 'saturated-time-test' });
    const lastSeenBefore = before[0].lastSeen;

    // emit 相同 tag + type
    const result = instinct.emit(TEST_SESSION, 'workflow_routing', 't2', 'a2', 'saturated-time-test');
    expect(result.lastSeen).toBe(lastSeenBefore); // lastSeen 不更新
  });

  test('飽和後再次 emit 不影響其他不同 tag 的記錄', () => {
    // 建立兩個 tag：npm-bun（會飽和）和 bun-test（不飽和）
    const itemA = instinct.emit(TEST_SESSION, 'error_resolutions', 'tA', 'aA', 'multi-tag-saturated');
    instinct.emit(TEST_SESSION, 'error_resolutions', 'tB', 'aB', 'multi-tag-normal');

    // 把 multi-tag-saturated 調到 1.0
    for (let i = 0; i < 14; i++) {
      instinct.confirm(TEST_SESSION, itemA.id);
    }

    const obsPath = paths.session.observations(TEST_SESSION);
    const linesBefore = readFileSync(obsPath, 'utf8').trim().split('\n').length;

    // emit 已飽和的 tag（不應追加）
    instinct.emit(TEST_SESSION, 'error_resolutions', 't3', 'a3', 'multi-tag-saturated');
    // emit 未飽和的 tag（應正常追加）
    instinct.emit(TEST_SESSION, 'error_resolutions', 't4', 'a4', 'multi-tag-normal');

    const linesAfter = readFileSync(obsPath, 'utf8').trim().split('\n').length;
    // 只有 multi-tag-normal 追加了一行
    expect(linesAfter).toBe(linesBefore + 1);

    // multi-tag-normal 的信心應升至 0.35
    const normalResult = instinct.query(TEST_SESSION, { tag: 'multi-tag-normal' });
    expect(normalResult[0].confidence).toBe(0.35);
  });
});
