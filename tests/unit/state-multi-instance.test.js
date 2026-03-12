'use strict';
/**
 * state-multi-instance.test.js
 * BDD spec: specs/features/in-progress/workflow-multi-instance/bdd.md
 *
 * Feature 2: state.js 多實例隔離
 *
 * Scenario 2-1: readState 帶 workflowId 讀新路徑
 * Scenario 2-2: readState 帶 workflowId 但新路徑不存在時回傳 null
 * Scenario 2-3: readState 無 workflowId 時 fallback 至舊路徑
 * Scenario 2-4: readState 兩者皆不存在時回傳 null
 * Scenario 2-5: initState 寫入 workflowId 欄位
 * Scenario 2-6: updateStage 更新正確 workflow 的 state
 * Scenario 2-7: sanitize 帶 workflowId 修復正確 workflow
 * Scenario 2-8: enforceInvariants 從 state.workflowId 取得路徑
 *
 * 相容性測試：
 * Compat-1: readState 舊 API（無 workflowId）向後相容
 * Compat-2: initState 舊 API（無 workflowId）向後相容
 * Compat-3: updateStateAtomic 舊 API（無 workflowId）向後相容
 * Compat-4: setFeatureName 舊 API（無 workflowId）向後相容
 * Compat-5: sanitize 舊 API（無 workflowId）向後相容
 */

const { describe, it, expect, afterEach } = require('bun:test');
const { join } = require('path');
const { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, mkdtempSync } = require('fs');
const { tmpdir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const state = require(join(SCRIPTS_LIB, 'state'));
const SessionContext = require(join(SCRIPTS_LIB, 'session-context'));
const paths = require(join(SCRIPTS_LIB, 'paths'));
const timeline = require(join(SCRIPTS_LIB, 'timeline'));

// ── session 管理（並行安全：每個 test 有獨立 projectRoot）──

const SESSION_PREFIX = `test_multiinst_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
let counter = 0;
let currentProjectRoot = null;

afterEach(() => {
  if (currentProjectRoot) {
    rmSync(currentProjectRoot, { recursive: true, force: true });
    currentProjectRoot = null;
  }
});

function newSession() {
  const projectRoot = mkdtempSync(join(tmpdir(), 'state-multi-'));
  currentProjectRoot = projectRoot;
  const sid = `${SESSION_PREFIX}_${++counter}`;
  mkdirSync(paths.sessionDir(projectRoot, sid), { recursive: true });
  return { projectRoot, sid };
}

function newWorkflowId() {
  return `wf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

// ────────────────────────────────────────────────────────────────────────────
// Feature 2: state.js 多實例隔離
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 2: state.js 多實例隔離', () => {

  it('Scenario 2-1: readState 帶 workflowId 讀新路徑', () => {
    // GIVEN 磁碟上存在 workflows/{workflowId}/workflow.json 且內含有效 state
    const { projectRoot, sid } = newSession();
    const workflowId = newWorkflowId();

    // 手動建立新路徑的 state 檔案
    const workflowDir = paths.session.workflowDir(projectRoot, sid, workflowId);
    mkdirSync(workflowDir, { recursive: true });
    const mockState = {
      sessionId: sid,
      workflowId,
      workflowType: 'standard',
      currentStage: 'DEV',
      stages: { DEV: { status: 'pending', result: null } },
      activeAgents: {},
    };
    writeFileSync(paths.session.workflowFile(projectRoot, sid, workflowId), JSON.stringify(mockState));

    // WHEN 呼叫 readState(projectRoot, sessionId, workflowId)
    const result = state.readStateCtx(new SessionContext(projectRoot, sid, workflowId));

    // THEN 回傳對應的 state 物件
    expect(result).not.toBeNull();
    expect(result.workflowId).toBe(workflowId);
    expect(result.sessionId).toBe(sid);
    expect(result.workflowType).toBe('standard');
  });

  it('Scenario 2-2: readState 帶 workflowId 但新路徑不存在時回傳 null', () => {
    // GIVEN workflows/{workflowId}/workflow.json 不存在
    const { projectRoot, sid } = newSession();
    const workflowId = newWorkflowId();

    // WHEN 呼叫 readState(projectRoot, sessionId, workflowId)
    const result = state.readStateCtx(new SessionContext(projectRoot, sid, workflowId));

    // THEN 回傳 null
    expect(result).toBeNull();
  });

  it('Scenario 2-3: readState 無 workflowId 時 fallback 至舊路徑', () => {
    // GIVEN 磁碟上僅存在根層 workflow.json（舊格式）
    const { projectRoot, sid } = newSession();

    const oldState = {
      sessionId: sid,
      workflowType: 'quick',
      currentStage: 'DEV',
      stages: { DEV: { status: 'pending', result: null } },
      activeAgents: {},
    };
    writeFileSync(paths.session.workflow(projectRoot, sid), JSON.stringify(oldState));

    // WHEN 呼叫 readState(projectRoot, sessionId, null)
    const result = state.readStateCtx(new SessionContext(projectRoot, sid, null));

    // THEN 回傳根層 workflow.json 的 state 物件，不拋出錯誤
    expect(result).not.toBeNull();
    expect(result.workflowType).toBe('quick');
    expect(result.sessionId).toBe(sid);
  });

  it('Scenario 2-4: readState 兩者皆不存在時回傳 null', () => {
    // GIVEN workflows/{workflowId}/workflow.json 和根層 workflow.json 均不存在
    const { projectRoot, sid } = newSession();

    // WHEN 呼叫 readState(projectRoot, sessionId, null)
    const result = state.readStateCtx(new SessionContext(projectRoot, sid, null));

    // THEN 回傳 null
    expect(result).toBeNull();
  });

  it('Scenario 2-5: initState 寫入 workflowId 欄位', () => {
    // GIVEN sessionId 與 workflowId 均為有效字串
    const { projectRoot, sid } = newSession();
    const workflowId = newWorkflowId();

    // WHEN 呼叫 initState(projectRoot, sessionId, workflowId, "standard", ["DEV", "TEST"], {})
    const result = state.initStateCtx(new SessionContext(projectRoot, sid, workflowId), 'standard', ['DEV', 'TEST'], {});

    // THEN 在 workflows/{workflowId}/workflow.json 建立 state 檔案
    const stateFilePath = paths.session.workflowFile(projectRoot, sid, workflowId);
    expect(existsSync(stateFilePath)).toBe(true);

    // AND state 物件的 workflowId 欄位等於傳入的 workflowId
    expect(result.workflowId).toBe(workflowId);

    // AND state 物件的 sessionId 欄位等於傳入的 sessionId
    expect(result.sessionId).toBe(sid);

    // 驗證磁碟上的檔案也有正確欄位
    const diskState = JSON.parse(readFileSync(stateFilePath, 'utf8'));
    expect(diskState.workflowId).toBe(workflowId);
    expect(diskState.sessionId).toBe(sid);
  });

  it('Scenario 2-6: updateStage 更新正確 workflow 的 state', () => {
    // GIVEN 磁碟上同時存在兩個 workflow 的 state（workflowId-A 與 workflowId-B）
    const { projectRoot, sid } = newSession();
    const workflowIdA = newWorkflowId();
    const workflowIdB = newWorkflowId();

    // 建立 workflowA
    state.initStateCtx(new SessionContext(projectRoot, sid, workflowIdA), 'standard', ['DEV', 'REVIEW'], {});
    // 建立 workflowB
    state.initStateCtx(new SessionContext(projectRoot, sid, workflowIdB), 'quick', ['DEV', 'REVIEW'], {});

    // WHEN 呼叫 updateStage(projectRoot, sessionId, workflowId-A, "DEV", { status: "completed" })
    state.updateStageCtx(new SessionContext(projectRoot, sid, workflowIdA), 'DEV', { status: 'completed', result: 'pass' });

    // THEN workflowId-A 的 workflow.json 中 DEV stage 狀態為 completed
    const stateA = state.readStateCtx(new SessionContext(projectRoot, sid, workflowIdA));
    expect(stateA.stages['DEV'].status).toBe('completed');

    // AND workflowId-B 的 workflow.json 未被修改
    const stateB = state.readStateCtx(new SessionContext(projectRoot, sid, workflowIdB));
    expect(stateB.stages['DEV'].status).toBe('pending');
  });

  it('Scenario 2-7: sanitize 帶 workflowId 修復正確 workflow', () => {
    // GIVEN workflows/{workflowId}/workflow.json 存在但 state 不一致
    const { projectRoot, sid } = newSession();
    const workflowId = newWorkflowId();

    // 建立包含不一致狀態的 state（有 completedAt 但 status 不是 completed）
    state.initStateCtx(new SessionContext(projectRoot, sid, workflowId), 'quick', ['DEV', 'REVIEW'], {});
    const brokenState = {
      ...state.readStateCtx(new SessionContext(projectRoot, sid, workflowId)),
      stages: {
        DEV: {
          status: 'active', // 應為 completed，但被錯誤設定
          result: 'pass',
          completedAt: new Date().toISOString(), // 有 completedAt → 應修復為 completed
        },
        REVIEW: { status: 'pending', result: null },
      },
    };
    // 直接寫入不一致的 state
    writeFileSync(
      paths.session.workflowFile(projectRoot, sid, workflowId),
      JSON.stringify(brokenState)
    );

    // WHEN 呼叫 sanitize(projectRoot, sessionId, workflowId)
    const result = state.sanitizeCtx(new SessionContext(projectRoot, sid, workflowId));

    // THEN 回傳 { fixed, state } 物件
    expect(result).not.toBeNull();
    expect(Array.isArray(result.fixed)).toBe(true);

    // AND 修復套用至正確的 workflows/{workflowId}/workflow.json
    const repairedState = state.readStateCtx(new SessionContext(projectRoot, sid, workflowId));
    expect(repairedState.stages['DEV'].status).toBe('completed');
  });

  it('Scenario 2-8: enforceInvariants 從 state.workflowId 取得路徑（使用舊全域 timeline 路徑）', () => {
    // GIVEN state 物件包含 workflowId 欄位
    const { projectRoot, sid } = newSession();
    const workflowId = newWorkflowId();

    // 建立 workflow state
    state.initStateCtx(new SessionContext(projectRoot, sid, workflowId), 'quick', ['DEV', 'REVIEW'], {});

    // 注入孤兒 activeAgent（會觸發 enforceInvariants 產生 violations → emit timeline）
    const currentSt = state.readStateCtx(new SessionContext(projectRoot, sid, workflowId));
    currentSt.activeAgents['tester:orphan_999'] = {
      agentName: 'tester',
      stage: 'TEST:999', // 孤兒（不存在於 stages）
      startedAt: new Date().toISOString(),
    };
    writeFileSync(
      paths.session.workflowFile(projectRoot, sid, workflowId),
      JSON.stringify(currentSt)
    );

    // WHEN 透過 updateStateAtomic 觸發 enforceInvariants（會 emit system:warning）
    state.updateStateAtomicCtx(new SessionContext(projectRoot, sid, workflowId), (s) => s);

    // NOTE: enforceInvariants 使用新 API（有 projectRoot）呼叫 timeline.emit，
    // 因此 warning 寫入 per-project timeline 路徑。
    const workflowTimelinePath = paths.session.workflowTimeline(projectRoot, sid, workflowId);
    expect(existsSync(workflowTimelinePath)).toBe(true);

    // 讀取 timeline 確認有 system:warning 事件
    const timelineContent = readFileSync(workflowTimelinePath, 'utf8');
    const events = timelineContent.trim().split('\n').map(l => JSON.parse(l));
    const warnings = events.filter(e => e.type === 'system:warning');
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[warnings.length - 1].source).toBe('state-invariant');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 向後相容性測試（舊 API 不傳 projectRoot）
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 2: 向後相容性（舊 API 不傳 projectRoot）', () => {

  // 保護 get-workflow-context.js 呼叫路徑
  it('Compat-1: readState 舊 API 仍可讀取根層 workflow.json', () => {
    // 使用全域 sessions 目錄（舊 API）
    const { SESSIONS_DIR } = paths;
    const sid = `compat_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    mkdirSync(join(SESSIONS_DIR, sid), { recursive: true });
    try {
      const oldState = { sessionId: sid, workflowType: 'quick', currentStage: null, stages: {}, activeAgents: {} };
      writeFileSync(paths.session.workflow(sid), JSON.stringify(oldState));

      // 舊 API：不傳 projectRoot
      const result = state.readState(sid);
      expect(result).not.toBeNull();
      expect(result.workflowType).toBe('quick');
    } finally {
      rmSync(join(SESSIONS_DIR, sid), { recursive: true, force: true });
    }
  });

});
