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

const { describe, it, expect, afterAll } = require('bun:test');
const { join } = require('path');
const { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } = require('fs');
const { SCRIPTS_LIB } = require('../helpers/paths');

const state = require(join(SCRIPTS_LIB, 'state'));
const paths = require(join(SCRIPTS_LIB, 'paths'));
const timeline = require(join(SCRIPTS_LIB, 'timeline'));

// ── session 管理（並行安全：每個 session 獨立目錄）──

const SESSION_PREFIX = `test_multiinst_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
let counter = 0;
const createdSessions = [];

function newSessionId() {
  const sid = `${SESSION_PREFIX}_${++counter}`;
  createdSessions.push(sid);
  return sid;
}

function newWorkflowId() {
  return `wf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

afterAll(() => {
  for (const sid of createdSessions) {
    rmSync(paths.sessionDir(sid), { recursive: true, force: true });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Feature 2: state.js 多實例隔離
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 2: state.js 多實例隔離', () => {

  it('Scenario 2-1: readState 帶 workflowId 讀新路徑', () => {
    // GIVEN 磁碟上存在 workflows/{workflowId}/workflow.json 且內含有效 state
    const sessionId = newSessionId();
    const workflowId = newWorkflowId();
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });

    // 手動建立新路徑的 state 檔案
    const workflowDir = paths.session.workflowDir(sessionId, workflowId);
    mkdirSync(workflowDir, { recursive: true });
    const mockState = {
      sessionId,
      workflowId,
      workflowType: 'standard',
      currentStage: 'DEV',
      stages: { DEV: { status: 'pending', result: null } },
      activeAgents: {},
    };
    writeFileSync(paths.session.workflowFile(sessionId, workflowId), JSON.stringify(mockState));

    // WHEN 呼叫 readState(sessionId, workflowId)
    const result = state.readState(sessionId, workflowId);

    // THEN 回傳對應的 state 物件
    expect(result).not.toBeNull();
    expect(result.workflowId).toBe(workflowId);
    expect(result.sessionId).toBe(sessionId);
    expect(result.workflowType).toBe('standard');
  });

  it('Scenario 2-2: readState 帶 workflowId 但新路徑不存在時回傳 null', () => {
    // GIVEN workflows/{workflowId}/workflow.json 不存在
    const sessionId = newSessionId();
    const workflowId = newWorkflowId();
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });

    // WHEN 呼叫 readState(sessionId, workflowId)
    const result = state.readState(sessionId, workflowId);

    // THEN 回傳 null
    expect(result).toBeNull();
  });

  it('Scenario 2-3: readState 無 workflowId 時 fallback 至舊路徑', () => {
    // GIVEN 磁碟上僅存在根層 workflow.json（舊格式）
    const sessionId = newSessionId();
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });

    const oldState = {
      sessionId,
      workflowType: 'quick',
      currentStage: 'DEV',
      stages: { DEV: { status: 'pending', result: null } },
      activeAgents: {},
    };
    writeFileSync(paths.session.workflow(sessionId), JSON.stringify(oldState));

    // WHEN 呼叫 readState(sessionId, null)
    const result = state.readState(sessionId, null);

    // THEN 回傳根層 workflow.json 的 state 物件，不拋出錯誤
    expect(result).not.toBeNull();
    expect(result.workflowType).toBe('quick');
    expect(result.sessionId).toBe(sessionId);
  });

  it('Scenario 2-4: readState 兩者皆不存在時回傳 null', () => {
    // GIVEN workflows/{workflowId}/workflow.json 和根層 workflow.json 均不存在
    const sessionId = newSessionId();
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });

    // WHEN 呼叫 readState(sessionId, null)
    const result = state.readState(sessionId, null);

    // THEN 回傳 null
    expect(result).toBeNull();
  });

  it('Scenario 2-5: initState 寫入 workflowId 欄位', () => {
    // GIVEN sessionId 與 workflowId 均為有效字串
    const sessionId = newSessionId();
    const workflowId = newWorkflowId();
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });

    // WHEN 呼叫 initState(sessionId, workflowId, "standard", ["DEV", "TEST"], {})
    const result = state.initState(sessionId, workflowId, 'standard', ['DEV', 'TEST'], {});

    // THEN 在 workflows/{workflowId}/workflow.json 建立 state 檔案
    const stateFilePath = paths.session.workflowFile(sessionId, workflowId);
    expect(existsSync(stateFilePath)).toBe(true);

    // AND state 物件的 workflowId 欄位等於傳入的 workflowId
    expect(result.workflowId).toBe(workflowId);

    // AND state 物件的 sessionId 欄位等於傳入的 sessionId
    expect(result.sessionId).toBe(sessionId);

    // 驗證磁碟上的檔案也有正確欄位
    const diskState = JSON.parse(readFileSync(stateFilePath, 'utf8'));
    expect(diskState.workflowId).toBe(workflowId);
    expect(diskState.sessionId).toBe(sessionId);
  });

  it('Scenario 2-6: updateStage 更新正確 workflow 的 state', () => {
    // GIVEN 磁碟上同時存在兩個 workflow 的 state（workflowId-A 與 workflowId-B）
    const sessionId = newSessionId();
    const workflowIdA = newWorkflowId();
    const workflowIdB = newWorkflowId();
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });

    // 建立 workflowA
    state.initState(sessionId, workflowIdA, 'standard', ['DEV', 'REVIEW'], {});
    // 建立 workflowB
    state.initState(sessionId, workflowIdB, 'quick', ['DEV', 'REVIEW'], {});

    // WHEN 呼叫 updateStage(sessionId, workflowId-A, "DEV", { status: "completed" })
    state.updateStage(sessionId, workflowIdA, 'DEV', { status: 'completed', result: 'pass' });

    // THEN workflowId-A 的 workflow.json 中 DEV stage 狀態為 completed
    const stateA = state.readState(sessionId, workflowIdA);
    expect(stateA.stages['DEV'].status).toBe('completed');

    // AND workflowId-B 的 workflow.json 未被修改
    const stateB = state.readState(sessionId, workflowIdB);
    expect(stateB.stages['DEV'].status).toBe('pending');
  });

  it('Scenario 2-7: sanitize 帶 workflowId 修復正確 workflow', () => {
    // GIVEN workflows/{workflowId}/workflow.json 存在但 state 不一致
    const sessionId = newSessionId();
    const workflowId = newWorkflowId();
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });

    // 建立包含不一致狀態的 state（有 completedAt 但 status 不是 completed）
    state.initState(sessionId, workflowId, 'quick', ['DEV', 'REVIEW'], {});
    const brokenState = {
      ...state.readState(sessionId, workflowId),
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
      paths.session.workflowFile(sessionId, workflowId),
      JSON.stringify(brokenState)
    );

    // WHEN 呼叫 sanitize(sessionId, workflowId)
    const result = state.sanitize(sessionId, workflowId);

    // THEN 回傳 { fixed, state } 物件
    expect(result).not.toBeNull();
    expect(Array.isArray(result.fixed)).toBe(true);

    // AND 修復套用至正確的 workflows/{workflowId}/workflow.json
    const repairedState = state.readState(sessionId, workflowId);
    expect(repairedState.stages['DEV'].status).toBe('completed');
  });

  it('Scenario 2-8: enforceInvariants 從 state.workflowId 取得路徑', () => {
    // GIVEN state 物件包含 workflowId 欄位
    const sessionId = newSessionId();
    const workflowId = newWorkflowId();
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });

    // 建立 workflow state
    state.initState(sessionId, workflowId, 'quick', ['DEV', 'REVIEW'], {});

    // 注入孤兒 activeAgent（會觸發 enforceInvariants 產生 violations → emit timeline）
    const currentSt = state.readState(sessionId, workflowId);
    currentSt.activeAgents['tester:orphan_999'] = {
      agentName: 'tester',
      stage: 'TEST:999', // 孤兒（不存在於 stages）
      startedAt: new Date().toISOString(),
    };
    writeFileSync(
      paths.session.workflowFile(sessionId, workflowId),
      JSON.stringify(currentSt)
    );

    // WHEN 透過 updateStateAtomic 觸發 enforceInvariants（會 emit system:warning）
    state.updateStateAtomic(sessionId, workflowId, (s) => s);

    // THEN timeline.emit 使用 state.workflowId 寫入正確的 workflow 層級 timeline
    const workflowTimelinePath = paths.session.workflowTimeline(sessionId, workflowId);
    expect(existsSync(workflowTimelinePath)).toBe(true);

    // 讀取 timeline 確認有 system:warning 事件
    const timelineContent = readFileSync(workflowTimelinePath, 'utf8');
    const events = timelineContent.trim().split('\n').map(l => JSON.parse(l));
    const warnings = events.filter(e => e.type === 'system:warning');
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[warnings.length - 1].source).toBe('state-invariant');

    // AND 根層 timeline 不含此 warning（寫到了正確路徑）
    const rootTimelinePath = paths.session.timeline(sessionId);
    if (existsSync(rootTimelinePath)) {
      const rootContent = readFileSync(rootTimelinePath, 'utf8');
      const rootEvents = rootContent.trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
      const rootWarnings = rootEvents.filter(e => e.type === 'system:warning' && e.source === 'state-invariant');
      expect(rootWarnings.length).toBe(0);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 向後相容性測試
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 2: 向後相容性（舊 API 不傳 workflowId）', () => {

  it('Compat-1: readState 舊 API 仍可讀取根層 workflow.json', () => {
    const sessionId = newSessionId();
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });

    const oldState = { sessionId, workflowType: 'quick', currentStage: null, stages: {}, activeAgents: {} };
    writeFileSync(paths.session.workflow(sessionId), JSON.stringify(oldState));

    // 舊 API：不傳 workflowId
    const result = state.readState(sessionId);
    expect(result).not.toBeNull();
    expect(result.workflowType).toBe('quick');
  });

  it('Compat-2: initState 舊 API（不傳 workflowId）建立根層 workflow.json', () => {
    const sessionId = newSessionId();
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });

    // 舊 API：initState(sessionId, workflowType, stageList, options)
    const result = state.initState(sessionId, 'standard', ['DEV', 'REVIEW'], { featureName: 'test-feature' });

    // THEN 在根層建立 workflow.json（無 workflowId 子目錄）
    expect(existsSync(paths.session.workflow(sessionId))).toBe(true);

    // 回傳 state 的 workflowId 為 null（舊格式）
    expect(result.workflowId).toBeNull();
    expect(result.featureName).toBe('test-feature');
    expect(result.workflowType).toBe('standard');

    // stages 正確建立
    expect(Object.keys(result.stages)).toContain('DEV');
    expect(Object.keys(result.stages)).toContain('REVIEW');
  });

  it('Compat-3: updateStateAtomic 舊 API（modifier 為第二參數）正常執行', () => {
    const sessionId = newSessionId();
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });

    // 先用舊 API 建立 state
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW'], {});

    // 舊 API：updateStateAtomic(sessionId, modifier)
    // 使用 failCount 而非 stage status（避免觸發孤兒 active stage 守衛）
    state.updateStateAtomic(sessionId, (s) => {
      s.failCount = 42;
      return s;
    });

    const result = state.readState(sessionId);
    expect(result.failCount).toBe(42);
  });

  it('Compat-4: setFeatureName 舊 API（name 為第二參數）正常執行', () => {
    const sessionId = newSessionId();
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });

    state.initState(sessionId, 'quick', ['DEV'], {});

    // 舊 API：setFeatureName(sessionId, name)
    state.setFeatureName(sessionId, 'my-feature');

    const result = state.readState(sessionId);
    expect(result.featureName).toBe('my-feature');
  });

  it('Compat-5: sanitize 舊 API（不傳 workflowId）修復根層 workflow.json', () => {
    const sessionId = newSessionId();
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });

    state.initState(sessionId, 'quick', ['DEV', 'REVIEW'], {});

    // 注入不一致狀態
    const s = state.readState(sessionId);
    s.stages['DEV'].status = 'active';
    s.stages['DEV'].completedAt = new Date().toISOString();
    writeFileSync(paths.session.workflow(sessionId), JSON.stringify(s));

    // 舊 API：sanitize(sessionId) 不傳 workflowId
    const result = state.sanitize(sessionId);

    expect(result).not.toBeNull();
    expect(result.fixed.length).toBeGreaterThan(0);

    const repaired = state.readState(sessionId);
    expect(repaired.stages['DEV'].status).toBe('completed');
  });
});
