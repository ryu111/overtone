'use strict';
/**
 * single-workflow.test.js — BDD F2：single workflow 完整狀態機 E2E 測試
 *
 * 驗證 single workflow（只有 DEV 一個 stage）的完整生命週期：
 *   on-start → init-workflow → pre-task(developer) → on-stop(developer PASS) → session/on-stop
 */

const { test, expect, describe, beforeAll, afterAll } = require('bun:test');
const { existsSync, rmSync } = require('fs');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');
const { runOnStart, runInitWorkflow, runPreTask, runSubagentStop, runSessionStop } = require('../helpers/hook-runner');

const paths   = require(join(SCRIPTS_LIB, 'paths'));
const state   = require(join(SCRIPTS_LIB, 'state'));
const timeline = require(join(SCRIPTS_LIB, 'timeline'));

// 跨 describe 共用的唯一 sessionId
const SESSION_ID = `e2e-single-${Date.now()}`;

afterAll(() => {
  rmSync(paths.sessionDir(SESSION_ID), { recursive: true, force: true });
});

// ────────────────────────────────────────────────────────────────────────────
// BDD F2 Scenario 1：初始化 single workflow 建立正確的 state 結構
// ────────────────────────────────────────────────────────────────────────────

describe('BDD F2：初始化 single workflow 建立正確的 state 結構', () => {
  let startResult;
  let initResult;

  beforeAll(() => {
    startResult = runOnStart(SESSION_ID);
    initResult = runInitWorkflow('single', SESSION_ID);
  });

  test('on-start.js exit code 為 0', () => {
    expect(startResult.exitCode).toBe(0);
  });

  test('init-workflow.js exit code 為 0', () => {
    expect(initResult.exitCode).toBe(0);
  });

  test('workflow.json 存在', () => {
    expect(existsSync(paths.session.workflow(SESSION_ID))).toBe(true);
  });

  test('workflowType 為 single', () => {
    const ws = state.readState(SESSION_ID);
    expect(ws).not.toBeNull();
    expect(ws.workflowType).toBe('single');
  });

  test('stages 包含 DEV，狀態為 pending', () => {
    const ws = state.readState(SESSION_ID);
    expect(ws.stages).toHaveProperty('DEV');
    expect(ws.stages['DEV'].status).toBe('pending');
  });

  test('activeAgents 為空物件', () => {
    const ws = state.readState(SESSION_ID);
    expect(ws.activeAgents).toEqual({});
  });
});

// ────────────────────────────────────────────────────────────────────────────
// BDD F2 Scenario 2：pre-task hook 放行 DEV（第一個 stage 直接放行，不更新 state）
//
// 設計說明：pre-task.js 對 workflow 中第一個 stage 採用「放行但不更新」策略（L71-75）。
// 第一個 stage 不需要守衛（無前置 stage），直接輸出 result=''，不寫 activeAgents 或 state。
// 手動設定 DEV 為 active 並記錄 timeline，模擬 /ot:auto skill 的行為。
// ────────────────────────────────────────────────────────────────────────────

describe('BDD F2：pre-task hook 放行 DEV，手動設為 active 並記錄 timeline', () => {
  let result;

  beforeAll(() => {
    // DEV 為 pending（init 後的預設狀態）
    // pre-task 對第一個 stage 放行（不更新 state），這是預期設計
    result = runPreTask(SESSION_ID, {
      description: '委派 developer agent 實作功能',
      prompt: '你是 developer，請按規格實作...',
    });

    // 手動模擬 /ot:auto skill 設定第一個 stage 為 active（實際環境由 skill 處理）
    state.updateStateAtomic(SESSION_ID, (s) => {
      s.stages['DEV'].status = 'active';
      s.activeAgents['developer'] = { stage: 'DEV', startedAt: new Date().toISOString() };
      return s;
    });
    timeline.emit(SESSION_ID, 'agent:delegate', { agent: 'developer', stage: 'DEV' });
  });

  test('hook 回傳 result 為空字串（放行）', () => {
    expect(result.parsed?.result).toBe('');
  });

  test('workflow.json 中 DEV.status 變為 active（由 skill 設定）', () => {
    const ws = state.readState(SESSION_ID);
    expect(ws.stages['DEV'].status).toBe('active');
  });

  test('activeAgents 包含 developer', () => {
    const ws = state.readState(SESSION_ID);
    expect(ws.activeAgents).toHaveProperty('developer');
  });

  test('timeline.jsonl 包含 agent:delegate 事件，stage 為 DEV', () => {
    const events = timeline.query(SESSION_ID, { type: 'agent:delegate' });
    expect(events.length).toBeGreaterThan(0);
    const last = events[events.length - 1];
    expect(last.agent).toBe('developer');
    expect(last.stage).toBe('DEV');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// BDD F2 Scenario 3：on-stop hook 將 DEV stage 標記完成並發出 timeline 事件
// ────────────────────────────────────────────────────────────────────────────

describe('BDD F2：on-stop hook 將 DEV stage 標記完成並發出 timeline 事件', () => {
  let result;

  beforeAll(() => {
    // DEV 為 active（Scenario 2 後的狀態）
    result = runSubagentStop(SESSION_ID, 'ot:developer', 'VERDICT: pass 開發完成，功能正常運作');
  });

  test('hook 回傳 result 含 ✅', () => {
    expect(result.parsed?.result).toContain('✅');
  });

  test('workflow.json 中 DEV.status 變為 completed', () => {
    const ws = state.readState(SESSION_ID);
    expect(ws.stages['DEV'].status).toBe('completed');
  });

  test('timeline.jsonl 包含 agent:complete 事件，agent 為 developer，stage 為 DEV', () => {
    const events = timeline.query(SESSION_ID, { type: 'agent:complete' });
    expect(events.length).toBeGreaterThan(0);
    const last = events[events.length - 1];
    expect(last.agent).toBe('developer');
    expect(last.stage).toBe('DEV');
  });

  test('timeline.jsonl 包含 stage:complete 事件，stage 為 DEV', () => {
    const events = timeline.query(SESSION_ID, { type: 'stage:complete' });
    expect(events.length).toBeGreaterThan(0);
    const last = events[events.length - 1];
    expect(last.stage).toBe('DEV');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// BDD F2 Scenario 4：所有 stage 完成後 session on-stop 輸出完成摘要
// ────────────────────────────────────────────────────────────────────────────

describe('BDD F2：所有 stage 完成後 session on-stop 輸出完成摘要', () => {
  let result;

  beforeAll(() => {
    // DEV 已 completed（Scenario 3 後的狀態）
    result = runSessionStop(SESSION_ID, '任意完成訊息');
  });

  test('hook exit code 為 0', () => {
    expect(result.exitCode).toBe(0);
  });

  test('result 含工作流完成', () => {
    expect(result.parsed?.result).toContain('工作流完成');
  });

  test('result 含 single', () => {
    expect(result.parsed?.result).toContain('single');
  });
});
