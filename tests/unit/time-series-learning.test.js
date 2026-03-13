'use strict';
/**
 * time-series-learning.test.js — 時間序列學習單元測試
 *
 * 覆蓋功能：
 *   Feature 1: adjustConfidenceByIds（7 個 Scenario）
 *   Feature 2: 品質反饋邏輯（3 個 Scenario）
 *   Feature 3: appliedObservationIds 存入 session state（1 個 Scenario）
 */

const { test, expect, describe, beforeEach, afterEach } = require('bun:test');
const { mkdirSync, rmSync, appendFileSync, readFileSync, existsSync } = require('fs');
const os = require('os');
const path = require('path');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');

const globalInstinct = require(join(SCRIPTS_LIB, 'knowledge/global-instinct'));
const paths = require(join(SCRIPTS_LIB, 'paths'));

// ── 輔助工具 ──

function makeTmpProject(suffix = '') {
  const dir = path.join(os.tmpdir(), `ot-tsl-test-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeObs(overrides = {}) {
  const id = `inst_tsl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  return {
    id,
    ts: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    type: 'tool_preferences',
    trigger: '測試觸發條件',
    action: '測試建議行動',
    tag: `tag-${id}`,
    confidence: 0.8,
    count: 1,
    globalTs: new Date().toISOString(),
    ...overrides,
  };
}

/** 直接將觀察寫到全域 store */
function writeGlobalObs(projectRoot, obs) {
  const filePath = paths.global.observations(projectRoot);
  mkdirSync(path.dirname(filePath), { recursive: true });
  appendFileSync(filePath, JSON.stringify(obs) + '\n', 'utf8');
}

// ════════════════════════════════════════════════════════════════════
// Feature 1: adjustConfidenceByIds
// ════════════════════════════════════════════════════════════════════

describe('Feature 1: adjustConfidenceByIds', () => {
  let projectRoot;

  beforeEach(() => {
    projectRoot = makeTmpProject('adj');
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  test('Scenario 1-1: 正確調整指定 ID 的 confidence', () => {
    const obs = makeObs({ confidence: 0.5 });
    writeGlobalObs(projectRoot, obs);

    const updated = globalInstinct.adjustConfidenceByIds(projectRoot, [obs.id], 0.1);

    expect(updated).toBe(1);
    const records = globalInstinct.queryGlobal(projectRoot, {});
    expect(records[0].confidence).toBeCloseTo(0.6, 4);
  });

  test('Scenario 1-2: 不影響不在 ID 列表中的觀察', () => {
    const obsA = makeObs({ confidence: 0.5, tag: 'aaa', type: 'tool_preferences' });
    const obsB = makeObs({ confidence: 0.5, tag: 'bbb', type: 'tool_preferences' });
    writeGlobalObs(projectRoot, obsA);
    writeGlobalObs(projectRoot, obsB);

    globalInstinct.adjustConfidenceByIds(projectRoot, [obsA.id], 0.1);

    const records = globalInstinct.queryGlobal(projectRoot, {});
    const bRecord = records.find(r => r.id === obsB.id);
    expect(bRecord).toBeDefined();
    expect(bRecord.confidence).toBeCloseTo(0.5, 4);
  });

  test('Scenario 1-3: confidence clamp 到上限 1', () => {
    const obs = makeObs({ confidence: 0.95 });
    writeGlobalObs(projectRoot, obs);

    globalInstinct.adjustConfidenceByIds(projectRoot, [obs.id], 0.2);

    const records = globalInstinct.queryGlobal(projectRoot, {});
    expect(records[0].confidence).toBe(1);
  });

  test('Scenario 1-3b: confidence clamp 到下限 0', () => {
    const obs = makeObs({ confidence: 0.1 });
    writeGlobalObs(projectRoot, obs);

    globalInstinct.adjustConfidenceByIds(projectRoot, [obs.id], -0.5);

    const records = globalInstinct.queryGlobal(projectRoot, {});
    expect(records[0].confidence).toBe(0);
  });

  test('Scenario 1-4: 空 ID 列表回傳 0，不修改資料', () => {
    const obs = makeObs({ confidence: 0.5 });
    writeGlobalObs(projectRoot, obs);

    const updated = globalInstinct.adjustConfidenceByIds(projectRoot, [], 0.1);

    expect(updated).toBe(0);
    const records = globalInstinct.queryGlobal(projectRoot, {});
    expect(records[0].confidence).toBeCloseTo(0.5, 4);
  });

  test('Scenario 1-5: delta=0 回傳 0，不修改資料', () => {
    const obs = makeObs({ confidence: 0.5 });
    writeGlobalObs(projectRoot, obs);

    const updated = globalInstinct.adjustConfidenceByIds(projectRoot, [obs.id], 0);

    expect(updated).toBe(0);
  });

  test('Scenario 1-6: ID 不存在時不報錯，回傳 0', () => {
    const obs = makeObs({ confidence: 0.5 });
    writeGlobalObs(projectRoot, obs);

    let updated;
    expect(() => {
      updated = globalInstinct.adjustConfidenceByIds(projectRoot, ['non-existent-id-xyz'], 0.1);
    }).not.toThrow();
    expect(updated).toBe(0);
  });

  test('Scenario 1-7: 4 位小數精度', () => {
    const obs = makeObs({ confidence: 0.5 });
    writeGlobalObs(projectRoot, obs);

    globalInstinct.adjustConfidenceByIds(projectRoot, [obs.id], 0.02);

    const records = globalInstinct.queryGlobal(projectRoot, {});
    // 0.5 + 0.02 = 0.52，不應有浮點數精度問題
    expect(records[0].confidence).toBe(0.52);
    // 驗證不超過 4 位小數
    const confStr = records[0].confidence.toString();
    const decimals = confStr.includes('.') ? confStr.split('.')[1].length : 0;
    expect(decimals).toBeLessThanOrEqual(4);
  });
});

// ════════════════════════════════════════════════════════════════════
// Feature 2: 品質反饋邏輯（靜態分析）
// ════════════════════════════════════════════════════════════════════

describe('Feature 2: 品質反饋邏輯（靜態分析）', () => {
  const { readFileSync } = require('fs');
  const { SCRIPTS_LIB } = require('../helpers/paths');
  // thin wrapper化後，業務邏輯在 session-end-handler.js
  const sessionEndSrc = readFileSync(join(SCRIPTS_LIB, 'session-end-handler.js'), 'utf8');

  test('Scenario 2-1: improving 條件觸發 feedbackBoost', () => {
    expect(sessionEndSrc).toContain('isImproving');
    expect(sessionEndSrc).toContain('feedbackBoost');
    expect(sessionEndSrc).toContain("'improving'");
  });

  test('Scenario 2-2: degrading 條件觸發 feedbackPenalty', () => {
    expect(sessionEndSrc).toContain('isDegrading');
    expect(sessionEndSrc).toContain('feedbackPenalty');
    expect(sessionEndSrc).toContain("'degrading'");
  });

  test('Scenario 2-3: stagnant 時不呼叫 adjustConfidenceByIds（只有 improving 或 isDegrading 才呼叫）', () => {
    // 驗證有 isImproving || isDegrading 守衛條件，而非無條件呼叫
    expect(sessionEndSrc).toContain('if (isImproving || isDegrading)');
    expect(sessionEndSrc).toContain('adjustConfidenceByIds');
  });
});

// ════════════════════════════════════════════════════════════════════
// Feature 3: appliedObservationIds 存入 session state
// ════════════════════════════════════════════════════════════════════

describe('Feature 3: appliedObservationIds 存入 session state（靜態分析）', () => {
  const { readFileSync } = require('fs');
  const { SCRIPTS_LIB } = require('../helpers/paths');
  // thin wrapper化後，業務邏輯在 session-start-handler.js
  const sessionStartSrc = readFileSync(join(SCRIPTS_LIB, 'session-start-handler.js'), 'utf8');

  test('Scenario 3-1: on-start.js 在注入全域觀察後記錄 appliedObservationIds', () => {
    expect(sessionStartSrc).toContain('appliedObservationIds');
    expect(sessionStartSrc).toContain('updateStateAtomic');
  });
});
