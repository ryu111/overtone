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
const { SCRIPTS_LIB } = require('../helpers/paths');
const { runSubagentStop } = require('../helpers/hook-runner');
const { atomicWrite } = require(join(SCRIPTS_LIB, 'utils'));

const paths = require(join(SCRIPTS_LIB, 'paths'));
const state = require(join(SCRIPTS_LIB, 'state'));
const { workflows } = require(join(SCRIPTS_LIB, 'registry'));

// ── session 管理 ──

const SESSION_PREFIX = `test_stale_cleanup_${Date.now()}`;
let counter = 0;
const createdSessions = [];

function newSessionId() {
  return `${SESSION_PREFIX}_${++counter}`;
}

afterAll(() => {
  for (const sid of createdSessions) {
    rmSync(paths.sessionDir(sid), { recursive: true, force: true });
  }
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
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'quick', workflows['quick'].stages);

    const instanceId = 'developer:stale001-retropatch';

    // 模擬 DEV 已 completed+pass，但 activeAgents 有殘留 entry
    state.updateStateAtomic(sessionId, (s) => {
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
    runSubagentStop(sessionId, 'ot:developer', `VERDICT: pass 修補完成\n\nINSTANCE_ID: ${instanceId}`);

    const ws = state.readState(sessionId);
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
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'quick', workflows['quick'].stages);

    // aaaa 字典序 < bbbb
    state.updateStateAtomic(sessionId, (s) => {
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
    runSubagentStop(sessionId, 'ot:developer', 'VERDICT: pass 修補完成（無 INSTANCE_ID）');

    const ws = state.readState(sessionId);
    // aaaa 被清除（字典序最小），bbbb 保留
    expect(ws.activeAgents['developer:aaaa01-stale']).toBeUndefined();
    expect(ws.activeAgents['developer:bbbb02-stale']).toBeDefined();
  });

  // 場景：active-agent.json 應在 activeAgents 清空後刪除
  test('Scenario SCA-3: DEV completed+pass，activeAgents cleanup 後只剩 0 entry → active-agent.json 被刪除', () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'quick', workflows['quick'].stages);

    const instanceId = 'developer:solo001-stale';
    const activeAgentPath = paths.session.activeAgent(sessionId);

    // 寫入 active-agent.json（模擬 pre-task 寫入）
    atomicWrite(activeAgentPath, { agent: 'developer', startedAt: new Date().toISOString() });

    state.updateStateAtomic(sessionId, (s) => {
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
    runSubagentStop(sessionId, 'ot:developer', `VERDICT: pass\n\nINSTANCE_ID: ${instanceId}`);

    const ws = state.readState(sessionId);
    // activeAgents 已清空
    expect(ws.activeAgents[instanceId]).toBeUndefined();
    // active-agent.json 應被刪除（cleanup 後 activeAgents 為空）
    expect(existsSync(activeAgentPath)).toBe(false);
  });

  // 場景：並行場景 — activeAgents 仍有其他 entry，active-agent.json 應保留
  test('Scenario SCA-4: DEV active 並行 2 個，第 1 個到達但 DEV stage 已因 fail 被 completed → active-agent.json 保留（仍有其他 entry）', () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'quick', workflows['quick'].stages);

    const activeAgentPath = paths.session.activeAgent(sessionId);
    atomicWrite(activeAgentPath, { agent: 'developer', startedAt: new Date().toISOString() });

    state.updateStateAtomic(sessionId, (s) => {
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

    // 第 1 個 instance 的 on-stop（DEV 已 completed+fail → findActualStageKey 仍能找到，這個場景測試 active-agent.json 保留）
    runSubagentStop(sessionId, 'ot:developer', 'VERDICT: pass inst1\n\nINSTANCE_ID: developer:first001-inst');

    const ws = state.readState(sessionId);
    // first001 被清除
    expect(ws.activeAgents['developer:first001-inst']).toBeUndefined();
    // second002 仍在（尚未完成）
    expect(ws.activeAgents['developer:second002-inst']).toBeDefined();
    // active-agent.json 應保留（仍有 second002 在 activeAgents 中）
    expect(existsSync(activeAgentPath)).toBe(true);

    // 清理
    try { require('fs').rmSync(activeAgentPath); } catch { /* 靜默 */ }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature: getNextStageHint TTL 過濾
// ────────────────────────────────────────────────────────────────────────────

describe('getNextStageHint — TTL 過濾殘留 activeAgents', () => {

  const { getNextStageHint } = require(join(SCRIPTS_LIB, 'state'));
  const { stages, parallelGroups } = require(join(SCRIPTS_LIB, 'registry'));

  test('Scenario TTL-GNH-1: 過期 activeAgents（無 active stage + 超過 30 分鐘）→ 不阻擋 hint', () => {
    const expiredTime = new Date(Date.now() - 31 * 60 * 1000).toISOString(); // 31 分鐘前

    const staleState = {
      currentStage: 'REVIEW',
      stages: {
        DEV:    { status: 'completed', result: 'pass' },
        REVIEW: { status: 'pending' },
      },
      activeAgents: {
        // DEV 已 completed（無 active stage），entry 超過 30 分鐘 → 過期
        'developer:stale001-xxxx': {
          agentName: 'developer',
          stage: 'DEV',
          startedAt: expiredTime,
        },
      },
    };

    const hint = getNextStageHint(staleState, { stages, parallelGroups });
    // 過期 entry 不阻擋 hint，應返回下一步提示
    expect(hint).not.toBeNull();
    // 不應是「等待並行 agent 完成」
    expect(hint).not.toContain('等待並行 agent 完成');
    // 應包含 REVIEW 相關提示
    expect(hint).toContain('code-reviewer');
  });

  test('Scenario TTL-GNH-2: 新鮮 activeAgents（5 分鐘內）且無 active stage → 仍阻擋 hint（TTL 未過期）', () => {
    const freshTime = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 分鐘前

    const freshState = {
      currentStage: 'REVIEW',
      stages: {
        DEV:    { status: 'completed', result: 'pass' },
        REVIEW: { status: 'pending' },
      },
      activeAgents: {
        'developer:fresh001-xxxx': {
          agentName: 'developer',
          stage: 'DEV',
          startedAt: freshTime,
        },
      },
    };

    const hint = getNextStageHint(freshState, { stages, parallelGroups });
    // TTL 未過期，entry 仍有效 → 阻擋 hint
    expect(hint).not.toBeNull();
    expect(hint).toContain('等待並行 agent 完成');
    expect(hint).toContain('developer');
  });

  test('Scenario TTL-GNH-3: active stage 對應的 activeAgents entry → 永不過期，仍阻擋 hint', () => {
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
          startedAt: veryOldTime, // 很舊，但 stage 仍 active
        },
      },
    };

    const hint = getNextStageHint(activeStageState, { stages, parallelGroups });
    // 有 active stage 對應 → 永不過期，仍阻擋 hint
    expect(hint).not.toBeNull();
    expect(hint).toContain('等待並行 agent 完成');
    expect(hint).toContain('developer');
  });
});
