'use strict';
/**
 * ctx-api-alias.test.js
 * BDD spec: specs/features/in-progress/session-context-architecture-convergence/bdd.md
 *
 * Feature 5: session-factory 測試工廠
 */

require('../helpers/setup');

const { describe, it, expect } = require('bun:test');
const { existsSync } = require('fs');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');

const SessionContext = require(join(SCRIPTS_LIB, 'session-context'));
const state = require(join(SCRIPTS_LIB, 'state'));
const { makeTmpProject, createCtx, setupWorkflow, cleanupProject } = require('../helpers/session-factory');

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
