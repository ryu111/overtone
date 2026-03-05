'use strict';
/**
 * on-submit-handler.test.js — buildSystemMessage 純函數測試 + intent_journal 記錄測試
 *
 * Feature 4 BDD 測試：intent_journal emit 行為
 */

const { describe, it, test, expect, beforeEach, afterEach } = require('bun:test');
const { mkdirSync, rmSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const { buildSystemMessage, handleOnSubmit } = require('../../plugins/overtone/scripts/lib/on-submit-handler');
const { workflows } = require('../../plugins/overtone/scripts/lib/registry');
const { SCRIPTS_LIB } = require('../helpers/paths');
const instinct = require(join(SCRIPTS_LIB, 'knowledge/instinct'));

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

// ════════════════════════════════════════════════════════
// Feature 4: intent_journal 記錄（handleOnSubmit）
// ════════════════════════════════════════════════════════

function makeSession(suffix) {
  const id = `test_submit_j_${suffix}_${Date.now()}`;
  const dir = join(homedir(), '.overtone', 'sessions', id);
  return { id, dir };
}

describe('Feature 4: intent_journal 記錄（handleOnSubmit）', () => {
  let session;

  beforeEach(() => {
    session = makeSession('f4');
    mkdirSync(session.dir, { recursive: true });
  });

  afterEach(() => {
    rmSync(session.dir, { recursive: true, force: true });
  });

  // Scenario 4-1
  test('Scenario 4-1: 有進行中工作流時記錄 intent_journal，action 含工作流類型', () => {
    handleOnSubmit({
      session_id: session.id,
      prompt: '幫我寫一個登入頁面',
      cwd: process.cwd(),
    });

    const journals = instinct.query(session.id, { type: 'intent_journal' });
    expect(journals.length).toBeGreaterThanOrEqual(1);
    const j = journals[journals.length - 1];
    expect(j.trigger).toBe('幫我寫一個登入頁面');
    expect(j.sessionResult).toBe('pending');
    expect(j.tag).toMatch(/^journal-/);
  });

  // Scenario 4-2
  test('Scenario 4-2: 無進行中工作流時 action 含「無進行中工作流」', () => {
    handleOnSubmit({
      session_id: session.id,
      prompt: '查詢 session 列表',
      cwd: process.cwd(),
    });

    const journals = instinct.query(session.id, { type: 'intent_journal' });
    expect(journals.length).toBeGreaterThanOrEqual(1);
    const j = journals[journals.length - 1];
    expect(j.action).toContain('無進行中工作流');
    expect(j.sessionResult).toBe('pending');
  });

  // Scenario 4-3
  test('Scenario 4-3: prompt 超過 500 字時截斷至 500 字', () => {
    const longPrompt = 'A'.repeat(800);

    handleOnSubmit({
      session_id: session.id,
      prompt: longPrompt,
      cwd: process.cwd(),
    });

    const journals = instinct.query(session.id, { type: 'intent_journal' });
    expect(journals.length).toBeGreaterThanOrEqual(1);
    const j = journals[journals.length - 1];
    expect(j.trigger.length).toBeLessThanOrEqual(500);
    expect(j.trigger).toBe('A'.repeat(500));
  });

  // Scenario 4-4
  test('Scenario 4-4: prompt 為空字串時記錄 "(empty prompt)"', () => {
    handleOnSubmit({
      session_id: session.id,
      prompt: '',
      cwd: process.cwd(),
    });

    const journals = instinct.query(session.id, { type: 'intent_journal' });
    expect(journals.length).toBeGreaterThanOrEqual(1);
    const j = journals[journals.length - 1];
    expect(j.trigger).toBe('(empty prompt)');
  });

  // Scenario 4-5
  test('Scenario 4-5: 同 session 兩次 prompt 產生兩筆獨立記錄（skipDedup=true）', async () => {
    handleOnSubmit({
      session_id: session.id,
      prompt: '第一次 prompt',
      cwd: process.cwd(),
    });
    // 稍微延遲讓 Date.now() 產生不同的 tag
    await new Promise(r => setTimeout(r, 2));
    handleOnSubmit({
      session_id: session.id,
      prompt: '第一次 prompt', // 相同 prompt
      cwd: process.cwd(),
    });

    const journals = instinct.query(session.id, { type: 'intent_journal' });
    expect(journals.length).toBeGreaterThanOrEqual(2);
    // 每筆記錄 id 獨立（skipDedup=true 建立新記錄）
    const ids = journals.map(j => j.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(journals.length);
  });

  // Scenario 4-6
  test('Scenario 4-6: /ot: 指令不記錄 intent_journal', () => {
    handleOnSubmit({
      session_id: session.id,
      prompt: '/ot:auto',
      cwd: process.cwd(),
    });

    const journals = instinct.query(session.id, { type: 'intent_journal' });
    expect(journals).toHaveLength(0);
  });
});
