// @sequential
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
// BDD F2 Scenario 2：pre-task hook 放行 DEV（第一個 stage）
//
// 設計說明：pre-task.js 對 workflow 中第一個 stage 同樣走完整路徑（更新 state + 注入 context）。
// 第一個 stage 不需要守衛（無前置 stage 可跳過），但仍然更新 activeAgents、stage status、
// 以及注入 workflowContext + test-index 摘要。
// ────────────────────────────────────────────────────────────────────────────

describe('BDD F2：pre-task hook 放行 DEV 並更新 state + 記錄 timeline', () => {
  let result;

  beforeAll(() => {
    // DEV 為 pending（init 後的預設狀態）
    // pre-task 對第一個 stage 放行，同時更新 state 和注入 context
    result = runPreTask(SESSION_ID, {
      description: '委派 developer agent 實作功能',
      prompt: '你是 developer，請按規格實作...',
    });
  });

  test('hook 放行（允許委派）', () => {
    const { isAllowed } = require('../helpers/hook-runner');
    expect(isAllowed(result.parsed)).toBe(true);
  });

  test('workflow.json 中 DEV.status 變為 active（由 skill 設定）', () => {
    const ws = state.readState(SESSION_ID);
    expect(ws.stages['DEV'].status).toBe('active');
  });

  test('activeAgents 包含 developer', () => {
    const ws = state.readState(SESSION_ID);
    // activeAgents key 格式為 instanceId（agentName:timestamp36-random6），以 agentName 欄位驗證
    const devEntry = Object.values(ws.activeAgents).find(e => e.agentName === 'developer');
    expect(devEntry).toBeDefined();
    expect(devEntry.agentName).toBe('developer');
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
    result = runSubagentStop(SESSION_ID, 'developer', 'VERDICT: pass 開發完成，功能正常運作');
  });

  test('DEV.status 變為 completed', () => {
    const ws = state.readState(SESSION_ID);
    expect(ws.stages['DEV'].status).toBe('completed');
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

  test('hook output 為空物件（SessionStop schema 無 result 欄位）', () => {
    expect(result.parsed).toEqual({});
  });

  test('workflow 類型為 single', () => {
    const ws = state.readState(SESSION_ID);
    expect(ws.workflowType).toBe('single');
  });
});
