'use strict';
/**
 * ctx-api-alias.test.js
 * BDD spec: specs/features/in-progress/session-context-architecture-convergence/bdd.md
 *
 * Feature 4: alias 行為完全等同 Ctx API（Phase 3 過渡期）
 * Feature 5: session-factory 測試工廠
 */

require('../helpers/setup');

const { describe, it, expect, beforeEach, afterEach } = require('bun:test');
const { mkdirSync, existsSync, rmSync } = require('fs');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');

const SessionContext = require(join(SCRIPTS_LIB, 'session-context'));
const state = require(join(SCRIPTS_LIB, 'state'));
const timeline = require(join(SCRIPTS_LIB, 'timeline'));
const { makeTmpProject, createCtx, setupWorkflow, cleanupProject } = require('../helpers/session-factory');

// ── Feature 4: alias 行為完全等同 Ctx API ──

describe('Feature 4: state alias 行為', () => {
  let projectRoot;

  beforeEach(() => {
    projectRoot = makeTmpProject('ot-alias-test');
  });

  afterEach(() => {
    cleanupProject(projectRoot);
  });

  it('Scenario 4-1: state.readState(ctx) 與 state.readStateCtx(ctx) 回傳相同結果', () => {
    // GIVEN state.readState 支援接受 SessionContext（alias 行為）
    // AND 一個已存在的 workflow.json
    const ctx = createCtx(projectRoot);
    state.initStateCtx(ctx, 'quick', ['DEV', 'REVIEW']);

    // WHEN 分別呼叫 state.readState(ctx) 和 state.readStateCtx(ctx)
    const viaAlias = state.readState(ctx);
    const viaCtx = state.readStateCtx(ctx);

    // THEN 兩者回傳值的 JSON.stringify 完全相同
    expect(JSON.stringify(viaAlias)).toBe(JSON.stringify(viaCtx));
  });

  it('Scenario 4-2: state.initState(ctx, ...) 與 state.initStateCtx(ctx, ...) 產生相同初始 state', () => {
    // GIVEN state.initState 支援接受 SessionContext（alias 行為）
    const ctxA = createCtx(projectRoot, 'sess-init-a');
    const ctxB = createCtx(projectRoot, 'sess-init-b');

    // WHEN 分別呼叫兩種 API
    const stateA = state.initState(ctxA, 'quick', ['DEV']);
    const stateB = state.initStateCtx(ctxB, 'quick', ['DEV']);

    // THEN 兩者回傳的 state 結構相同（排除時間戳和 sessionId）
    expect(stateA.workflowType).toBe(stateB.workflowType);
    expect(JSON.stringify(stateA.stages)).toBe(JSON.stringify(stateB.stages));
    expect(stateA.currentStage).toBe(stateB.currentStage);
  });

  it('Scenario 4-3: timeline.emit(ctx, ...) 與 timeline.emitCtx(ctx, ...) 寫入相同格式', () => {
    // GIVEN timeline.emit 支援接受 SessionContext（alias 行為）
    const ctxA = createCtx(projectRoot, 'sess-emit-a');
    const ctxB = createCtx(projectRoot, 'sess-emit-b');

    // WHEN 分別呼叫兩種 API
    const eventA = timeline.emit(ctxA, 'stage:start', { agentName: 'developer', stage: 'DEV' });
    const eventB = timeline.emitCtx(ctxB, 'stage:start', { agentName: 'developer', stage: 'DEV' });

    // THEN 兩者寫入的事件結構相同（排除 ts）
    expect(eventA.type).toBe(eventB.type);
    expect(eventA.category).toBe(eventB.category);
    expect(eventA.agentName).toBe(eventB.agentName);
    expect(eventA.stage).toBe(eventB.stage);
  });

  it('Scenario 4-4: state.readState 接受 ctx 物件（alias 路徑）', () => {
    // GIVEN state.readState 支援接受 SessionContext
    // AND 已存在的 workflow.json
    const ctx = createCtx(projectRoot);
    state.initStateCtx(ctx, 'quick', ['DEV']);

    // WHEN 用 ctx 物件呼叫 state.readState
    const result = state.readState(ctx);

    // THEN 正確回傳 state（不回傳 null，不拋出例外）
    expect(result).not.toBeNull();
    expect(result.workflowType).toBe('quick');
  });
});

// ── Feature 5: session-factory 測試工廠 ──

describe('Feature 5: session-factory', () => {
  it('Scenario 5-1: makeTmpProject 建立獨立隔離目錄', () => {
    // GIVEN 呼叫 makeTmpProject() 兩次
    const projectA = makeTmpProject();
    const projectB = makeTmpProject();
    try {
      // WHEN 比較兩個回傳路徑
      // THEN 兩個路徑不同（互相隔離）
      expect(projectA).not.toBe(projectB);
      // AND 兩個目錄都實際存在於 tmpdir
      expect(existsSync(projectA)).toBe(true);
      expect(existsSync(projectB)).toBe(true);
    } finally {
      cleanupProject(projectA);
      cleanupProject(projectB);
    }
  });

  it('Scenario 5-2: createCtx 建立有效的 SessionContext', () => {
    // GIVEN projectRoot = makeTmpProject() 的回傳值
    const projectRoot = makeTmpProject();
    try {
      // WHEN 呼叫 createCtx(projectRoot)
      const ctx = createCtx(projectRoot);

      // THEN 回傳的 ctx 是 SessionContext 實例
      expect(ctx).toBeInstanceOf(SessionContext);
      // AND ctx.sessionDir() 對應的目錄存在
      expect(existsSync(ctx.sessionDir())).toBe(true);
    } finally {
      cleanupProject(projectRoot);
    }
  });

  it('Scenario 5-3: createCtx 不指定 sessionId 時自動產生唯一 ID', () => {
    // GIVEN 同一 projectRoot 呼叫 createCtx() 兩次
    const projectRoot = makeTmpProject();
    try {
      const ctxA = createCtx(projectRoot);
      const ctxB = createCtx(projectRoot);

      // WHEN 比較兩次回傳的 ctx.sessionId
      // THEN 兩個 sessionId 不同
      expect(ctxA.sessionId).not.toBe(ctxB.sessionId);
    } finally {
      cleanupProject(projectRoot);
    }
  });

  it('Scenario 5-4: setupWorkflow 與直接呼叫 initStateCtx 產生相同結果', () => {
    // GIVEN 相同的 workflowType 和 stageList
    const projectRoot = makeTmpProject();
    try {
      const ctxA = createCtx(projectRoot, 'sess-setup-a');
      const ctxB = createCtx(projectRoot, 'sess-setup-b');
      const workflowType = 'quick';
      const stageList = ['DEV', 'REVIEW'];

      // WHEN 分別用兩種方式初始化
      const stateA = setupWorkflow(ctxA, workflowType, stageList);
      const stateB = state.initStateCtx(ctxB, workflowType, stageList);

      // THEN 兩者回傳的 state 物件結構完全相同（排除時間戳和 sessionId）
      expect(JSON.stringify(stateA.stages)).toBe(JSON.stringify(stateB.stages));
      expect(stateA.currentStage).toBe(stateB.currentStage);
      expect(stateA.workflowType).toBe(stateB.workflowType);
    } finally {
      cleanupProject(projectRoot);
    }
  });

  it('Scenario 5-5: cleanupProject 清理後目錄不存在', () => {
    // GIVEN projectRoot = makeTmpProject() 且目錄存在
    const projectRoot = makeTmpProject();
    expect(existsSync(projectRoot)).toBe(true);

    // WHEN 呼叫 cleanupProject(projectRoot)
    cleanupProject(projectRoot);

    // THEN 對應目錄不再存在於 filesystem
    expect(existsSync(projectRoot)).toBe(false);
  });

  it('Scenario 5-6: cleanupProject 傳入 null 時不崩潰', () => {
    // GIVEN cleanupProject 被呼叫且參數為 null
    // WHEN 執行 cleanupProject(null)
    // THEN 函式不拋出例外
    expect(() => cleanupProject(null)).not.toThrow();
    expect(() => cleanupProject(undefined)).not.toThrow();
  });

  it('Scenario 5-7: setupWorkflow 回傳的 state 可被後續 readStateCtx 讀取', () => {
    // GIVEN ctx = createCtx(projectRoot)
    const projectRoot = makeTmpProject();
    try {
      const ctx = createCtx(projectRoot);

      // AND setupWorkflow 已執行
      const initialState = setupWorkflow(ctx, 'standard', ['PLAN', 'DEV', 'REVIEW']);

      // WHEN 呼叫 state.readStateCtx(ctx)
      const readBack = state.readStateCtx(ctx);

      // THEN 讀回的 state 與 setupWorkflow 回傳值的 stages、currentStage 一致
      expect(readBack).not.toBeNull();
      expect(JSON.stringify(readBack.stages)).toBe(JSON.stringify(initialState.stages));
      expect(readBack.currentStage).toBe(initialState.currentStage);
    } finally {
      cleanupProject(projectRoot);
    }
  });
});
