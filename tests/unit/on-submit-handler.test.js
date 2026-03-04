'use strict';
/**
 * on-submit-handler.test.js — buildSystemMessage 純函數測試
 */

const { describe, it, expect } = require('bun:test');
const { buildSystemMessage } = require('../../plugins/overtone/scripts/lib/on-submit-handler');
const { workflows } = require('../../plugins/overtone/scripts/lib/registry');

describe('buildSystemMessage', () => {
  it('Scenario 1: validWorkflowOverride 有效時回傳指定 workflow 指引', () => {
    const result = buildSystemMessage({
      validWorkflowOverride: 'quick',
      currentState: null,
      activeFeatureContext: '',
      workflows,
    });
    expect(result).toContain('quick');
    expect(result).toContain('/ot:quick');
    expect(result).toContain('MUST 依照 workflow command 指引委派 agent');
  });

  it('Scenario 2: 有進行中 workflow 時回傳狀態摘要', () => {
    const result = buildSystemMessage({
      validWorkflowOverride: null,
      currentState: { currentStage: 'DEV', workflowType: 'quick' },
      activeFeatureContext: '',
      workflows,
    });
    expect(result).toContain('工作流進行中：quick（DEV）');
    expect(result).toContain('/ot:auto');
  });

  it('Scenario 3: activeFeatureContext 在有 workflow 時也要包含', () => {
    const result = buildSystemMessage({
      validWorkflowOverride: null,
      currentState: { currentStage: 'DEV', workflowType: 'quick' },
      activeFeatureContext: '📂 活躍 Feature：my-feature',
      workflows,
    });
    expect(result).toContain('my-feature');
  });

  it('Scenario 4: 無進行中 workflow 時回傳 /ot:auto 引導訊息', () => {
    const result = buildSystemMessage({
      validWorkflowOverride: null,
      currentState: null,
      activeFeatureContext: '',
      workflows,
    });
    expect(result).toContain('/ot:auto 工作流選擇器');
    expect(result).toContain('18 個 workflow 模板');
  });

  it('Scenario 5: activeFeatureContext 在無 workflow 時也包含', () => {
    const result = buildSystemMessage({
      validWorkflowOverride: null,
      currentState: null,
      activeFeatureContext: '📂 活躍 Feature：test-feature',
      workflows,
    });
    expect(result).toContain('test-feature');
  });

  it('Scenario 6: currentState 有 currentStage 才視為進行中', () => {
    // currentState 存在但無 currentStage → 應回傳 /ot:auto 引導
    const result = buildSystemMessage({
      validWorkflowOverride: null,
      currentState: { workflowType: 'quick' }, // 無 currentStage
      activeFeatureContext: '',
      workflows,
    });
    expect(result).toContain('/ot:auto 工作流選擇器');
  });

  it('Scenario 7: opts 為 null 時回傳預設 /ot:auto 引導', () => {
    const result = buildSystemMessage(null);
    expect(result).toContain('/ot:auto 工作流選擇器');
  });
});
