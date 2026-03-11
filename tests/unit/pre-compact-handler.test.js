'use strict';
/**
 * pre-compact-handler.test.js — buildCompactMessage 純函數測試
 */

const { describe, it, expect } = require('bun:test');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');
const { buildCompactMessage } = require(join(SCRIPTS_LIB, 'pre-compact-handler'));

describe('buildCompactMessage', () => {
  it('Scenario 1: 基本狀態摘要包含必要欄位', () => {
    const result = buildCompactMessage({
      currentState: { workflowType: 'quick', currentStage: 'DEV', failCount: 0, rejectCount: 0 },
      progressBar: '✅💻',
      completed: 1,
      total: 4,
      stageHint: null,
      pendingMsg: null,
      queueSummary: null,
    });
    expect(result).toContain('Overtone 狀態恢復（compact 後）');
    expect(result).toContain('工作流：quick');
    expect(result).toContain('進度：✅💻 (1/4)');
    expect(result).toContain('禁止使用 AskUserQuestion');
  });

  it('Scenario 2: stageHint 不為 null 時包含在輸出', () => {
    const result = buildCompactMessage({
      currentState: { workflowType: 'standard', currentStage: 'REVIEW' },
      progressBar: '',
      completed: 2,
      total: 5,
      stageHint: '目前執行 REVIEW 階段',
      pendingMsg: null,
      queueSummary: null,
    });
    expect(result).toContain('目前執行 REVIEW 階段');
  });

  it('Scenario 3: failCount > 0 時顯示失敗次數', () => {
    const result = buildCompactMessage({
      currentState: { workflowType: 'quick', currentStage: 'DEV', failCount: 2, rejectCount: 0 },
      progressBar: '',
      completed: 1,
      total: 3,
      stageHint: null,
      pendingMsg: null,
      queueSummary: null,
    });
    expect(result).toContain('失敗次數：2/3');
  });

  it('Scenario 4: rejectCount > 0 時顯示拒絕次數', () => {
    const result = buildCompactMessage({
      currentState: { workflowType: 'quick', currentStage: 'REVIEW', failCount: 0, rejectCount: 1 },
      progressBar: '',
      completed: 2,
      total: 4,
      stageHint: null,
      pendingMsg: null,
      queueSummary: null,
    });
    expect(result).toContain('拒絕次數：1/3');
  });

  it('Scenario 5: featureName 存在時顯示 Feature', () => {
    const result = buildCompactMessage({
      currentState: { workflowType: 'quick', currentStage: 'DEV', featureName: 'my-feature' },
      progressBar: '',
      completed: 1,
      total: 2,
      stageHint: null,
      pendingMsg: null,
      queueSummary: null,
    });
    expect(result).toContain('Feature：my-feature');
  });

  it('Scenario 6: pendingMsg 存在時包含在輸出', () => {
    const result = buildCompactMessage({
      currentState: { workflowType: 'quick', currentStage: 'DEV' },
      progressBar: '',
      completed: 0,
      total: 2,
      stageHint: null,
      pendingMsg: '## 未完成任務\n- 實作登入功能',
      queueSummary: null,
    });
    expect(result).toContain('未完成任務');
    expect(result).toContain('實作登入功能');
  });

  it('Scenario 7: queueSummary 存在時包含在輸出', () => {
    const result = buildCompactMessage({
      currentState: { workflowType: 'quick', currentStage: 'DEV' },
      progressBar: '',
      completed: 0,
      total: 2,
      stageHint: null,
      pendingMsg: null,
      queueSummary: '執行佇列：2 個待執行項目',
    });
    expect(result).toContain('執行佇列');
  });

  it('Scenario 8: 訊息超過 MAX_MESSAGE_LENGTH 時截斷', () => {
    const longMsg = 'x'.repeat(3000);
    const result = buildCompactMessage({
      currentState: { workflowType: 'quick', currentStage: 'DEV' },
      progressBar: '',
      completed: 0,
      total: 1,
      stageHint: null,
      pendingMsg: longMsg,
      queueSummary: null,
      MAX_MESSAGE_LENGTH: 2000,
    });
    expect(result.length).toBeLessThanOrEqual(2000);
    expect(result).toContain('已截斷');
  });

  it('Scenario 9: ctx 為 null/undefined 時不拋出例外', () => {
    expect(() => buildCompactMessage(null)).not.toThrow();
    expect(() => buildCompactMessage(undefined)).not.toThrow();
  });

  it('Scenario 10: currentState 為 null 時只輸出標頭和禁止訊息', () => {
    const result = buildCompactMessage({
      currentState: null,
      progressBar: '',
      completed: 0,
      total: 0,
      stageHint: null,
      pendingMsg: null,
      queueSummary: null,
    });
    expect(result).toContain('Overtone 狀態恢復（compact 後）');
    expect(result).toContain('禁止使用 AskUserQuestion');
    expect(result).not.toContain('工作流：');
  });

  it('Scenario 11: failCount 為 0 時不顯示失敗次數', () => {
    const result = buildCompactMessage({
      currentState: { workflowType: 'quick', currentStage: 'DEV', failCount: 0, rejectCount: 0 },
      progressBar: '',
      completed: 1,
      total: 4,
      stageHint: null,
      pendingMsg: null,
      queueSummary: null,
    });
    expect(result).not.toContain('失敗次數');
  });

  it('Scenario 12: rejectCount 為 0 時不顯示拒絕次數', () => {
    const result = buildCompactMessage({
      currentState: { workflowType: 'quick', currentStage: 'DEV', failCount: 0, rejectCount: 0 },
      progressBar: '',
      completed: 1,
      total: 4,
      stageHint: null,
      pendingMsg: null,
      queueSummary: null,
    });
    expect(result).not.toContain('拒絕次數');
  });

  it('Scenario 13: featureName 為 null 時不顯示 Feature 行', () => {
    const result = buildCompactMessage({
      currentState: { workflowType: 'quick', currentStage: 'DEV', featureName: null },
      progressBar: '',
      completed: 1,
      total: 2,
      stageHint: null,
      pendingMsg: null,
      queueSummary: null,
    });
    expect(result).not.toContain('Feature：');
  });

  it('Scenario 14: pendingAction type=fix-reject 時顯示待執行指示', () => {
    const result = buildCompactMessage({
      currentState: {
        workflowType: 'quick',
        currentStage: 'DEV',
        pendingAction: { type: 'fix-reject', count: 2, reason: '缺少測試' },
      },
      progressBar: '',
      completed: 1,
      total: 4,
      stageHint: null,
      pendingMsg: null,
      queueSummary: null,
    });
    // type 值不直接顯示，但拒絕相關訊息和 DEVELOPER 指示要在
    expect(result).toContain('缺少測試');
    expect(result).toContain('DEVELOPER');
    expect(result).toContain('待執行');
  });

  it('Scenario 15: pendingAction type=fix-fail 時顯示 DEBUGGER 指示', () => {
    const result = buildCompactMessage({
      currentState: {
        workflowType: 'quick',
        currentStage: 'DEV',
        pendingAction: { type: 'fix-fail', count: 1, stage: 'TEST', reason: 'test failed' },
      },
      progressBar: '',
      completed: 1,
      total: 4,
      stageHint: null,
      pendingMsg: null,
      queueSummary: null,
    });
    expect(result).toContain('DEBUGGER');
    expect(result).toContain('test failed');
  });

  it('Scenario 16: pendingAction 無 reason 時不拋出', () => {
    expect(() => buildCompactMessage({
      currentState: {
        workflowType: 'quick',
        pendingAction: { type: 'fix-reject', count: 1 },
      },
      progressBar: '',
      completed: 0,
      total: 2,
      stageHint: null,
      pendingMsg: null,
      queueSummary: null,
    })).not.toThrow();
  });

  it('Scenario 17: 包含「/auto」參考提示', () => {
    const result = buildCompactMessage({
      currentState: { workflowType: 'quick', currentStage: 'DEV' },
      progressBar: '',
      completed: 0,
      total: 2,
      stageHint: null,
      pendingMsg: null,
      queueSummary: null,
    });
    expect(result).toContain('/auto');
  });

  it('Scenario 18: 回傳字串型別', () => {
    const result = buildCompactMessage({
      currentState: { workflowType: 'standard', currentStage: 'REVIEW' },
      progressBar: '✅💻',
      completed: 2,
      total: 6,
      stageHint: '目前執行 REVIEW',
      pendingMsg: '未完成：1 項',
      queueSummary: '佇列：1 個項目',
    });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('Scenario 19: 自訂 MAX_MESSAGE_LENGTH 截斷', () => {
    const result = buildCompactMessage({
      currentState: { workflowType: 'quick', currentStage: 'DEV' },
      progressBar: '',
      completed: 0,
      total: 1,
      stageHint: null,
      pendingMsg: 'x'.repeat(500),
      queueSummary: null,
      MAX_MESSAGE_LENGTH: 300,
    });
    expect(result.length).toBeLessThanOrEqual(300);
    expect(result).toContain('已截斷');
  });

  it('Scenario 20: stageHint 為 null 時不顯示「目前階段」行', () => {
    const result = buildCompactMessage({
      currentState: { workflowType: 'quick', currentStage: 'DEV' },
      progressBar: '',
      completed: 0,
      total: 2,
      stageHint: null,
      pendingMsg: null,
      queueSummary: null,
    });
    expect(result).not.toContain('目前階段：');
  });
});

// ── handlePreCompact 整合測試 ─────────────────────────────────────────────────

const { describe: describeI, it: itI, expect: expectI, beforeEach, afterEach } = require('bun:test');
const fsPc = require('fs');
const { homedir: homedirPc } = require('os');
const { join: joinPc } = require('path');
const stateLibPc = require(join(SCRIPTS_LIB, 'state'));
const pathsPc = require(join(SCRIPTS_LIB, 'paths'));
const { handlePreCompact } = require(join(SCRIPTS_LIB, 'pre-compact-handler'));

function makePcSession(suffix) {
  const id = `test_pch_${suffix}_${Date.now()}`;
  return { id, dir: joinPc(homedirPc(), '.nova', 'sessions', id) };
}

describeI('handlePreCompact', () => {
  let sess;

  beforeEach(() => {
    sess = makePcSession(`s${Date.now().toString(36)}`);
    fsPc.mkdirSync(sess.dir, { recursive: true });
  });

  afterEach(() => {
    fsPc.rmSync(sess.dir, { recursive: true, force: true });
  });

  itI('無 sessionId 且 input 為空物件 → 回傳空 output', () => {
    const result = handlePreCompact({});
    expectI(result.output).toEqual({});
  });

  itI('有 sessionId 但無 workflow state → 回傳空 output', () => {
    const result = handlePreCompact({ session_id: sess.id });
    expectI(result.output).toEqual({});
  });

  itI('有 workflow state → 回傳 systemMessage', () => {
    stateLibPc.initState(sess.id, 'quick', ['DEV', 'REVIEW']);
    const result = handlePreCompact({ session_id: sess.id, cwd: '/tmp' });
    expectI(result.output).toHaveProperty('systemMessage');
    expectI(result.output.systemMessage).toContain('Overtone 狀態恢復');
  });

  itI('auto trigger → compact-count.json auto 遞增', () => {
    stateLibPc.initState(sess.id, 'quick', ['DEV']);
    handlePreCompact({ session_id: sess.id, trigger: 'auto', cwd: '/tmp' });
    const compactPath = pathsPc.session.compactCount(sess.id);
    const counts = JSON.parse(fsPc.readFileSync(compactPath, 'utf8'));
    expectI(counts.auto).toBe(1);
    expectI(counts.manual).toBe(0);
  });

  itI('manual trigger → compact-count.json manual 遞增', () => {
    stateLibPc.initState(sess.id, 'quick', ['DEV']);
    handlePreCompact({ session_id: sess.id, trigger: 'manual', cwd: '/tmp' });
    const compactPath = pathsPc.session.compactCount(sess.id);
    const counts = JSON.parse(fsPc.readFileSync(compactPath, 'utf8'));
    expectI(counts.manual).toBe(1);
    expectI(counts.auto).toBe(0);
  });

  itI('多次 auto compact → 計數累積', () => {
    stateLibPc.initState(sess.id, 'quick', ['DEV']);
    handlePreCompact({ session_id: sess.id, trigger: 'auto', cwd: '/tmp' });
    handlePreCompact({ session_id: sess.id, trigger: 'auto', cwd: '/tmp' });
    const compactPath = pathsPc.session.compactCount(sess.id);
    const counts = JSON.parse(fsPc.readFileSync(compactPath, 'utf8'));
    expectI(counts.auto).toBe(2);
  });

  itI('compact 後 activeAgents 被清空', () => {
    stateLibPc.initState(sess.id, 'quick', ['DEV']);
    // 先寫入一個 activeAgent
    stateLibPc.updateStateAtomic(sess.id, (s) => {
      s.activeAgents['inst_test'] = { stage: 'DEV', agentName: 'developer' };
      return s;
    });
    handlePreCompact({ session_id: sess.id, trigger: 'auto', cwd: '/tmp' });
    const st = stateLibPc.readState(sess.id);
    expectI(Object.keys(st.activeAgents)).toHaveLength(0);
  });

  itI('compact 後 active stage（無 completedAt）被標回 pending', () => {
    stateLibPc.initState(sess.id, 'quick', ['DEV', 'REVIEW']);
    // 手動將 DEV stage 設為 active（模擬 agent 執行中）
    stateLibPc.updateStateAtomic(sess.id, (s) => {
      if (s.stages && s.stages.DEV) {
        s.stages.DEV.status = 'active';
        delete s.stages.DEV.completedAt;
      }
      return s;
    });
    handlePreCompact({ session_id: sess.id, trigger: 'auto', cwd: '/tmp' });
    const st = stateLibPc.readState(sess.id);
    expectI(st.stages.DEV.status).toBe('pending');
  });

  itI('compact 後 active stage 有 completedAt 者不改（enforceInvariants 負責）', () => {
    stateLibPc.initState(sess.id, 'quick', ['DEV', 'REVIEW']);
    // 手動將 DEV stage 設為 active 但有 completedAt（極端邊界情況）
    stateLibPc.updateStateAtomic(sess.id, (s) => {
      if (s.stages && s.stages.DEV) {
        s.stages.DEV.status = 'active';
        s.stages.DEV.completedAt = new Date().toISOString();
      }
      return s;
    });
    handlePreCompact({ session_id: sess.id, trigger: 'auto', cwd: '/tmp' });
    const st = stateLibPc.readState(sess.id);
    // 有 completedAt 的 active stage 不被 pre-compact 改回 pending
    // enforceInvariants 稍後會把它標為 completed
    expectI(st.stages.DEV.status).not.toBe('pending');
  });

});

// ── Feature A: detectFrequencyAnomaly 純函式 ─────────────────────────────────

const { describe: describeA, it: itA, expect: expectA } = require('bun:test');
const { detectFrequencyAnomaly, COMPACT_FREQ_WINDOW_MS, COMPACT_FREQ_THRESHOLD } =
  require(join(SCRIPTS_LIB, 'pre-compact-handler'));

describeA('detectFrequencyAnomaly', () => {
  function recent(offsetMs = 0) {
    return new Date(Date.now() - offsetMs).toISOString();
  }

  itA('Scenario A-1: 空陣列時不回報異常', () => {
    const result = detectFrequencyAnomaly([], 300000, 3);
    expectA(result).toEqual({ anomaly: false, autoCount: 0 });
  });

  itA('Scenario A-2: 窗口內次數未達門檻時不回報異常', () => {
    const timestamps = [recent(60000), recent(30000)]; // 2 個，在 5 分鐘內
    const result = detectFrequencyAnomaly(timestamps, 300000, 3);
    expectA(result).toEqual({ anomaly: false, autoCount: 2 });
  });

  itA('Scenario A-3: 窗口內次數達到門檻時回報異常', () => {
    const timestamps = [recent(180000), recent(120000), recent(60000)]; // 3 個
    const result = detectFrequencyAnomaly(timestamps, 300000, 3);
    expectA(result).toEqual({ anomaly: true, autoCount: 3 });
  });

  itA('Scenario A-4: 超過門檻次數時 autoCount 正確反映實際數量', () => {
    const timestamps = [recent(240000), recent(180000), recent(120000), recent(60000), recent(10000)];
    const result = detectFrequencyAnomaly(timestamps, 300000, 3);
    expectA(result).toEqual({ anomaly: true, autoCount: 5 });
  });

  itA('Scenario A-5: 窗口外的時間戳不計入判斷', () => {
    const timestamps = [
      recent(600000), // 10 分鐘前（窗口外）
      recent(120000), // 2 分鐘前（窗口內）
      recent(60000),  // 1 分鐘前（窗口內）
    ];
    const result = detectFrequencyAnomaly(timestamps, 300000, 3);
    expectA(result).toEqual({ anomaly: false, autoCount: 2 });
  });

  itA('Scenario A-6: NaN 時間戳自動被過濾不影響計數', () => {
    const timestamps = [
      'invalid-date',
      recent(120000),
      recent(60000),
    ];
    const result = detectFrequencyAnomaly(timestamps, 300000, 3);
    expectA(result).toEqual({ anomaly: false, autoCount: 2 });
  });

  itA('COMPACT_FREQ_WINDOW_MS 為 5 分鐘（300000ms）', () => {
    expectA(COMPACT_FREQ_WINDOW_MS).toBe(300000);
  });

  itA('COMPACT_FREQ_THRESHOLD 為 3', () => {
    expectA(COMPACT_FREQ_THRESHOLD).toBe(3);
  });
});

// ── Feature B: autoTimestamps 追蹤 ───────────────────────────────────────────

const { describe: describeB, it: itB, expect: expectB, beforeEach: beforeEachB, afterEach: afterEachB } = require('bun:test');
const fsPc2 = require('fs');
const { homedir: homedirPc2 } = require('os');
const { join: joinPc2 } = require('path');
const stateLibPc2 = require(join(SCRIPTS_LIB, 'state'));
const pathsPc2 = require(join(SCRIPTS_LIB, 'paths'));

function makePcSession2(suffix) {
  const id = `test_pch2_${suffix}_${Date.now()}`;
  return { id, dir: joinPc2(homedirPc2(), '.nova', 'sessions', id) };
}

describeB('autoTimestamps 追蹤', () => {
  let sess2;

  beforeEachB(() => {
    sess2 = makePcSession2(`b${Date.now().toString(36)}`);
    fsPc2.mkdirSync(sess2.dir, { recursive: true });
  });

  afterEachB(() => {
    fsPc2.rmSync(sess2.dir, { recursive: true, force: true });
  });

  itB('Scenario B-1: 首次 auto-compact 寫入 autoTimestamps', () => {
    stateLibPc2.initState(sess2.id, 'quick', ['DEV']);
    handlePreCompact({ session_id: sess2.id, trigger: 'auto', cwd: '/tmp' });
    const compactPath = pathsPc2.session.compactCount(sess2.id);
    const counts = JSON.parse(fsPc2.readFileSync(compactPath, 'utf8'));
    expectB(Array.isArray(counts.autoTimestamps)).toBe(true);
    expectB(counts.autoTimestamps.length).toBe(1);
    // 驗證是合法 ISO 8601
    expectB(new Date(counts.autoTimestamps[0]).getTime()).toBeGreaterThan(0);
  });

  itB('Scenario B-2: 舊格式 compact-count.json 向後相容', () => {
    stateLibPc2.initState(sess2.id, 'quick', ['DEV']);
    // 寫入舊格式（無 autoTimestamps）
    const compactPath = pathsPc2.session.compactCount(sess2.id);
    fsPc2.writeFileSync(compactPath, JSON.stringify({ auto: 5, manual: 2 }));
    let threw = false;
    try {
      handlePreCompact({ session_id: sess2.id, trigger: 'auto', cwd: '/tmp' });
    } catch {
      threw = true;
    }
    expectB(threw).toBe(false);
    const counts = JSON.parse(fsPc2.readFileSync(compactPath, 'utf8'));
    expectB(Array.isArray(counts.autoTimestamps)).toBe(true);
    expectB(counts.auto).toBe(6);
    expectB(counts.manual).toBe(2);
  });

  itB('Scenario B-3: autoTimestamps 超過 20 筆時 FIFO 截斷', () => {
    stateLibPc2.initState(sess2.id, 'quick', ['DEV']);
    // 寫入已有 20 筆的 autoTimestamps
    const compactPath = pathsPc2.session.compactCount(sess2.id);
    const old20 = Array.from({ length: 20 }, (_, i) =>
      new Date(Date.now() - (20 - i) * 60000).toISOString()
    );
    fsPc2.writeFileSync(compactPath, JSON.stringify({ auto: 20, manual: 0, autoTimestamps: old20 }));
    handlePreCompact({ session_id: sess2.id, trigger: 'auto', cwd: '/tmp' });
    const counts = JSON.parse(fsPc2.readFileSync(compactPath, 'utf8'));
    expectB(counts.autoTimestamps.length).toBe(20);
    // 最新的在末尾（時間最大）
    const last = new Date(counts.autoTimestamps[19]).getTime();
    const first = new Date(counts.autoTimestamps[0]).getTime();
    expectB(last).toBeGreaterThan(first);
  });

  itB('Scenario B-4: manual compact 不寫入 autoTimestamps', () => {
    stateLibPc2.initState(sess2.id, 'quick', ['DEV']);
    const compactPath = pathsPc2.session.compactCount(sess2.id);
    fsPc2.writeFileSync(compactPath, JSON.stringify({ auto: 0, manual: 0, autoTimestamps: [] }));
    handlePreCompact({ session_id: sess2.id, trigger: 'manual', cwd: '/tmp' });
    const counts = JSON.parse(fsPc2.readFileSync(compactPath, 'utf8'));
    expectB(counts.autoTimestamps.length).toBe(0);
    expectB(counts.manual).toBe(1);
  });
});

// ── Feature C: timeline event emit ───────────────────────────────────────────

const { describe: describeC, it: itC, expect: expectC, beforeEach: beforeEachC, afterEach: afterEachC } = require('bun:test');
const fsPc3 = require('fs');
const { homedir: homedirPc3 } = require('os');
const { join: joinPc3 } = require('path');
const stateLibPc3 = require(join(SCRIPTS_LIB, 'state'));
const pathsPc3 = require(join(SCRIPTS_LIB, 'paths'));

function makePcSession3(suffix) {
  const id = `test_pch3_${suffix}_${Date.now()}`;
  return { id, dir: joinPc3(homedirPc3(), '.nova', 'sessions', id) };
}

describeC('Feature C: timeline event emit', () => {
  let sess3;

  beforeEachC(() => {
    sess3 = makePcSession3(`c${Date.now().toString(36)}`);
    fsPc3.mkdirSync(sess3.dir, { recursive: true });
  });

  afterEachC(() => {
    fsPc3.rmSync(sess3.dir, { recursive: true, force: true });
  });

  itC('Scenario C-1: 偵測到頻率異常時 emit quality:compact-frequency 事件', () => {
    stateLibPc3.initState(sess3.id, 'quick', ['DEV']);
    const compactPath = pathsPc3.session.compactCount(sess3.id);
    // 寫入 3 筆最近 autoTimestamps（已達門檻）
    const timestamps = [
      new Date(Date.now() - 180000).toISOString(),
      new Date(Date.now() - 120000).toISOString(),
      new Date(Date.now() - 60000).toISOString(),
    ];
    fsPc3.writeFileSync(compactPath, JSON.stringify({ auto: 3, manual: 0, autoTimestamps: timestamps }));
    // 第 4 次 auto-compact，加入後達到 4 筆 → 異常
    handlePreCompact({ session_id: sess3.id, trigger: 'auto', cwd: '/tmp' });
    // 驗證 timeline.jsonl 包含 quality:compact-frequency
    const timelinePath = joinPc3(sess3.dir, 'timeline.jsonl');
    const lines = fsPc3.readFileSync(timelinePath, 'utf8').trim().split('\n');
    const qualityEvents = lines
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter((e) => e && e.type === 'quality:compact-frequency');
    expectC(qualityEvents.length).toBeGreaterThan(0);
    const ev = qualityEvents[0];
    // timeline.emit 用 ...data 展開，欄位直接在 event 頂層
    expectC(typeof ev.autoCount).toBe('number');
    expectC(ev.windowMs).toBe(COMPACT_FREQ_WINDOW_MS);
    expectC(ev.threshold).toBe(COMPACT_FREQ_THRESHOLD);
    expectC(typeof ev.windowStartIso).toBe('string');
  });

  itC('Scenario C-2: 未達異常門檻時不 emit 事件', () => {
    stateLibPc3.initState(sess3.id, 'quick', ['DEV']);
    const compactPath = pathsPc3.session.compactCount(sess3.id);
    // 只有 1 筆 autoTimestamps（未達門檻 3）
    const timestamps = [new Date(Date.now() - 60000).toISOString()];
    fsPc3.writeFileSync(compactPath, JSON.stringify({ auto: 1, manual: 0, autoTimestamps: timestamps }));
    handlePreCompact({ session_id: sess3.id, trigger: 'auto', cwd: '/tmp' });
    const timelinePath = joinPc3(sess3.dir, 'timeline.jsonl');
    let qualityEvents = [];
    try {
      const lines = fsPc3.readFileSync(timelinePath, 'utf8').trim().split('\n');
      qualityEvents = lines
        .map((l) => { try { return JSON.parse(l); } catch { return null; } })
        .filter((e) => e && e.type === 'quality:compact-frequency');
    } catch { /* 可能 timeline 只含其他事件 */ }
    expectC(qualityEvents.length).toBe(0);
  });

  itC('Scenario C-3: pre-compact-handler 的頻率 emit 包在 try/catch 內（原始碼驗證）', () => {
    // 驗證 pre-compact-handler.js 的頻率 emit 包在 try/catch 中
    // 此為靜態驗證：讀取原始碼確認 try/catch 包覆
    const { SCRIPTS_LIB: _SCRIPTS_LIB } = require('../helpers/paths');
    const handlerPath = joinPc3(_SCRIPTS_LIB, 'pre-compact-handler.js');
    const src = fsPc3.readFileSync(handlerPath).toString();
    // 確認 quality:compact-frequency emit 被包在 try/catch 內
    expectC(src).toContain('quality:compact-frequency');
    expectC(src).toContain('// emit 失敗不阻擋 compaction');
  });
});
