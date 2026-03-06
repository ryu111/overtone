'use strict';
/**
 * pre-compact-handler.test.js — buildCompactMessage 純函數測試
 */

const { describe, it, expect } = require('bun:test');
const { buildCompactMessage } = require('../../plugins/overtone/scripts/lib/pre-compact-handler');

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

  it('Scenario 17: 包含「/ot:auto」參考提示', () => {
    const result = buildCompactMessage({
      currentState: { workflowType: 'quick', currentStage: 'DEV' },
      progressBar: '',
      completed: 0,
      total: 2,
      stageHint: null,
      pendingMsg: null,
      queueSummary: null,
    });
    expect(result).toContain('/ot:auto');
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
const stateLibPc = require('../../plugins/overtone/scripts/lib/state');
const pathsPc = require('../../plugins/overtone/scripts/lib/paths');
const { handlePreCompact } = require('../../plugins/overtone/scripts/lib/pre-compact-handler');

function makePcSession(suffix) {
  const id = `test_pch_${suffix}_${Date.now()}`;
  return { id, dir: joinPc(homedirPc(), '.overtone', 'sessions', id) };
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

  itI('無 sessionId 且 input 為空物件 → 回傳 result: ""', () => {
    const result = handlePreCompact({});
    expectI(result.output.result).toBe('');
  });

  itI('有 sessionId 但無 workflow state → 回傳 result: ""', () => {
    const result = handlePreCompact({ session_id: sess.id });
    expectI(result.output.result).toBe('');
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
});
