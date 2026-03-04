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
    expect(result).toContain('禁止詢問使用者');
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
});
