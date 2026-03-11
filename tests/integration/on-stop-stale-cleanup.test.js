'use strict';
/**
 * on-stop-stale-cleanup.test.js
 * BDD spec: specs/features/in-progress/statusline-stale-agent/
 *
 * 測試根因修復：findActualStageKey 回傳 null 時的 cleanup 行為
 *
 * 場景：RETRO 修補委派 developer → DEV stage 已 completed+pass
 *   → findActualStageKey 找不到合適的 DEV entry → 舊程式碼 early exit 跳過 cleanup
 *   → 修復後：early exit 前應已清除 activeAgents entry 和 active-agent.json
 */

const { test, expect, describe, afterAll } = require('bun:test');
const { mkdirSync, rmSync, existsSync } = require('fs');
const { join } = require('path');
const os = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');
const { runSubagentStop } = require('../helpers/hook-runner');
const { atomicWrite } = require(join(SCRIPTS_LIB, 'utils'));

const paths = require(join(SCRIPTS_LIB, 'paths'));
const state = require(join(SCRIPTS_LIB, 'state'));
const { workflows } = require(join(SCRIPTS_LIB, 'registry'));

// ── 測試隔離：per-project API 需要獨立的 projectRoot
const TEST_PROJECT_ROOT = join(os.tmpdir(), `overtone-stale-cleanup-test-${Date.now()}`);

// ── session 管理 ──

const SESSION_PREFIX = `test_stale_cleanup_${Date.now()}`;
let counter = 0;
const createdSessions = [];

function newSessionId() {
  return `${SESSION_PREFIX}_${++counter}`;
}

afterAll(() => {
  // 清理 per-project 測試目錄
  rmSync(join(TEST_PROJECT_ROOT, '.nova'), { recursive: true, force: true });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature: on-stop early exit 前執行 activeAgents cleanup
// ────────────────────────────────────────────────────────────────────────────

describe('on-stop stale agent cleanup — findActualStageKey null 時', () => {

  // 場景：DEV stage 已 completed+pass，RETRO 修補時又啟動一個 developer
  // → findActualStageKey('DEV') 回傳 null（無 active/pending/failed DEV entry）
  // → on-stop 舊版 early exit → activeAgents 殘留
  // 修復後：early exit 前應清除對應的 activeAgents entry
  test('Scenario SCA-1: DEV stage completed+pass 後補發 developer → activeAgents entry 仍應被清除', () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);
    mkdirSync(paths.sessionDir(TEST_PROJECT_ROOT, sessionId), { recursive: true });
    state.initState(TEST_PROJECT_ROOT, sessionId, 'quick', workflows['quick'].stages);

    const instanceId = 'developer:stale001-retropatch';

    // 模擬 DEV 已 completed+pass，但 activeAgents 有殘留 entry
    state.updateStateAtomic(TEST_PROJECT_ROOT, sessionId, null, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['REVIEW'].status = 'pending';
      // 模擬 RETRO 修補時的 developer instanceId 殘留
      s.activeAgents[instanceId] = {
        agentName: 'developer',
        stage: 'DEV',
        startedAt: new Date().toISOString(),
      };
      return s;
    });

    // 觸發 on-stop（帶 INSTANCE_ID）— findActualStageKey 會找不到 active DEV
    runSubagentStop(sessionId, 'developer', `VERDICT: pass 修補完成\n\nINSTANCE_ID: ${instanceId}`, { cwd: TEST_PROJECT_ROOT });

    const ws = state.readState(TEST_PROJECT_ROOT, sessionId);
    // activeAgents entry 應被清除（即使 findActualStageKey 回傳 null）
    expect(ws.activeAgents[instanceId]).toBeUndefined();
    // DEV stage 結果不應被改變（仍 completed+pass）
    expect(ws.stages['DEV'].status).toBe('completed');
    expect(ws.stages['DEV'].result).toBe('pass');
  });

  // 場景：無 INSTANCE_ID，fallback 清除字典序最小的同名 entry
  test('Scenario SCA-2: DEV completed+pass 後補發 developer（無 INSTANCE_ID）→ fallback 清除最早 entry', () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);
    mkdirSync(paths.sessionDir(TEST_PROJECT_ROOT, sessionId), { recursive: true });
    state.initState(TEST_PROJECT_ROOT, sessionId, 'quick', workflows['quick'].stages);

    // aaaa 字典序 < bbbb
    state.updateStateAtomic(TEST_PROJECT_ROOT, sessionId, null, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.activeAgents['developer:aaaa01-stale'] = {
        agentName: 'developer',
        stage: 'DEV',
        startedAt: new Date().toISOString(),
      };
      s.activeAgents['developer:bbbb02-stale'] = {
        agentName: 'developer',
        stage: 'DEV',
        startedAt: new Date().toISOString(),
      };
      return s;
    });

    // 不含 INSTANCE_ID → fallback 清除字典序最小的 key
    runSubagentStop(sessionId, 'developer', 'VERDICT: pass 修補完成（無 INSTANCE_ID）', { cwd: TEST_PROJECT_ROOT });

    const ws = state.readState(TEST_PROJECT_ROOT, sessionId);
    // aaaa 被清除（字典序最小），bbbb 保留
    expect(ws.activeAgents['developer:aaaa01-stale']).toBeUndefined();
    expect(ws.activeAgents['developer:bbbb02-stale']).toBeDefined();
  });

  // 場景：on-stop 執行後 activeAgents entry 被清除（workflow.json 是唯一信號源）
  test('Scenario SCA-3: DEV completed+pass，on-stop 執行後 activeAgents entry 被清除', () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);
    mkdirSync(paths.sessionDir(TEST_PROJECT_ROOT, sessionId), { recursive: true });
    state.initState(TEST_PROJECT_ROOT, sessionId, 'quick', workflows['quick'].stages);

    const instanceId = 'developer:solo001-stale';

    state.updateStateAtomic(TEST_PROJECT_ROOT, sessionId, null, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      // 只有一個殘留 entry
      s.activeAgents[instanceId] = {
        agentName: 'developer',
        stage: 'DEV',
        startedAt: new Date().toISOString(),
      };
      return s;
    });

    // 執行 on-stop
    runSubagentStop(sessionId, 'developer', `VERDICT: pass\n\nINSTANCE_ID: ${instanceId}`, { cwd: TEST_PROJECT_ROOT });

    const ws = state.readState(TEST_PROJECT_ROOT, sessionId);
    // activeAgents entry 已被清除
    expect(ws.activeAgents[instanceId]).toBeUndefined();
    // active-agent.json 不再由 on-stop 管理（已移除），不需驗證
  });

  // 場景：並行場景 — 第 1 個完成後 activeAgents 仍有第 2 個 entry
  test('Scenario SCA-4: DEV active 並行 2 個，第 1 個 on-stop 後 activeAgents 清除 first001，second002 仍在', () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);
    mkdirSync(paths.sessionDir(TEST_PROJECT_ROOT, sessionId), { recursive: true });
    state.initState(TEST_PROJECT_ROOT, sessionId, 'quick', workflows['quick'].stages);

    state.updateStateAtomic(TEST_PROJECT_ROOT, sessionId, null, (s) => {
      // DEV 已 completed（因某 agent fail 觸發）
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'fail';
      s.stages['DEV'].parallelTotal = 2;
      s.stages['DEV'].parallelDone = 1;
      // 還有另一個 instance 的 activeAgents entry（第 2 個尚未完成 on-stop）
      s.activeAgents['developer:first001-inst'] = {
        agentName: 'developer',
        stage: 'DEV',
        startedAt: new Date().toISOString(),
      };
      s.activeAgents['developer:second002-inst'] = {
        agentName: 'developer',
        stage: 'DEV',
        startedAt: new Date().toISOString(),
      };
      return s;
    });

    // 第 1 個 instance 的 on-stop
    runSubagentStop(sessionId, 'developer', 'VERDICT: pass inst1\n\nINSTANCE_ID: developer:first001-inst', { cwd: TEST_PROJECT_ROOT });

    const ws = state.readState(TEST_PROJECT_ROOT, sessionId);
    // first001 被清除
    expect(ws.activeAgents['developer:first001-inst']).toBeUndefined();
    // second002 仍在（尚未完成）
    expect(ws.activeAgents['developer:second002-inst']).toBeDefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature: getNextStageHint activeAgents 阻擋邏輯
// ────────────────────────────────────────────────────────────────────────────

describe('getNextStageHint — activeAgents 阻擋邏輯（TTL 已移除，改由不變量守衛清除孤兒）', () => {

  const { getNextStageHint } = require(join(SCRIPTS_LIB, 'state'));
  const { stages, parallelGroups } = require(join(SCRIPTS_LIB, 'registry'));

  test('Scenario GNH-1: activeAgents 有合法 entry（stage 存在）→ 阻擋 hint（等待 agent 完成）', () => {
    const freshTime = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 分鐘前

    const stateWithActive = {
      currentStage: 'REVIEW',
      stages: {
        DEV:    { status: 'completed', result: 'pass' },
        REVIEW: { status: 'pending' },
      },
      activeAgents: {
        // DEV stage 存在（不是孤兒），entry 合法 → 阻擋 hint
        'developer:valid001-xxxx': {
          agentName: 'developer',
          stage: 'DEV',
          startedAt: freshTime,
        },
      },
    };

    const hint = getNextStageHint(stateWithActive, { stages, parallelGroups });
    // 有合法 activeAgents entry → 阻擋 hint
    expect(hint).not.toBeNull();
    expect(hint).toContain('等待並行 agent 完成');
    expect(hint).toContain('developer');
  });

  test('Scenario GNH-2: activeAgents 為空 → 不阻擋 hint，返回下一步提示', () => {
    const emptyState = {
      currentStage: 'REVIEW',
      stages: {
        DEV:    { status: 'completed', result: 'pass' },
        REVIEW: { status: 'pending' },
      },
      activeAgents: {},
    };

    const hint = getNextStageHint(emptyState, { stages, parallelGroups });
    // activeAgents 為空 → 不阻擋，返回下一步提示
    expect(hint).not.toBeNull();
    expect(hint).not.toContain('等待並行 agent 完成');
    expect(hint).toContain('code-reviewer');
  });

  test('Scenario GNH-3: active stage 對應的 activeAgents entry → 仍阻擋 hint', () => {
    const veryOldTime = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 60 分鐘前

    const activeStageState = {
      currentStage: 'DEV',
      stages: {
        DEV: { status: 'active' }, // DEV 仍 active
      },
      activeAgents: {
        'developer:old001-xxxx': {
          agentName: 'developer',
          stage: 'DEV',
          startedAt: veryOldTime, // 很舊，但 stage 仍 active → entry 合法
        },
      },
    };

    const hint = getNextStageHint(activeStageState, { stages, parallelGroups });
    // 有 active stage 對應 → entry 合法，仍阻擋 hint
    expect(hint).not.toBeNull();
    expect(hint).toContain('等待並行 agent 完成');
    expect(hint).toContain('developer');
  });
});
