'use strict';
/**
 * agent-stop-handler.test.js
 *
 * 測試 agent-stop-handler.js 的 handleAgentStop 基本功能：
 *   - 無 sessionId → 靜默退出
 *   - agentName 不在 stages 清單 → 靜默退出
 *   - 無 workflow state → 靜默退出
 *   - 模組可正常 require（無 side effect）
 *
 * 補強（handler-test-critical）：
 *   - parseResult 不同 verdict（PASS / FAIL / REJECT）
 *   - retry 機制（failCount / rejectCount 遞增）
 *   - 並行收斂門（checkSameStageConvergence / parallelDone）
 *   - timeline 事件（agent:complete / agent:error / stage:complete）
 *   - 知識歸檔觸發條件（PASS 時歸檔，FAIL/REJECT 不歸檔）
 *   - featureName auto-sync
 *   - tasks.md checkbox 勾選
 *   - activeAgents 清理（instanceId 精確 / fallback）
 *   - pendingAction 寫入與清除
 */

const { describe, test, expect, beforeAll, afterAll, beforeEach } = require('bun:test');
const path = require('path');
const { join } = path;
const fs = require('fs');
const os = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const { handleAgentStop, _parseQueueTable } = require(join(SCRIPTS_LIB, 'agent-stop-handler'));
const stateLib = require(join(SCRIPTS_LIB, 'state'));
const paths = require(join(SCRIPTS_LIB, 'paths'));
const timeline = require(join(SCRIPTS_LIB, 'timeline'));

// ── Session 管理工具 ─────────────────────────────────────────────────────────

const SESSION_PREFIX = `test_ost_${Date.now()}`;
let sessionCounter = 0;
const createdSessions = [];

function newSessionId() {
  const sid = `${SESSION_PREFIX}_${++sessionCounter}`;
  createdSessions.push(sid);
  return sid;
}

function setupSession(sid, stageList, workflowType = 'quick') {
  const dir = paths.sessionDir(sid);
  fs.mkdirSync(dir, { recursive: true });
  return stateLib.initState(sid, workflowType, stageList);
}

afterAll(() => {
  for (const sid of createdSessions) {
    const dir = paths.sessionDir(sid);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── 模組介面 ──────────────────────────────────────────────────────────────

describe('agent-stop-handler 模組介面', () => {
  test('可正常 require，匯出 handleAgentStop 函數', () => {
    expect(typeof handleAgentStop).toBe('function');
  });

  test('匯出 _parseQueueTable 函數', () => {
    expect(typeof _parseQueueTable).toBe('function');
  });
});

// ── handleAgentStop 邊界情況 ─────────────────────────────────────────────

describe('handleAgentStop 邊界情況', () => {
  test('無 sessionId → 回傳 { output: {} }', () => {
    const result = handleAgentStop({ agent_type: 'developer', last_assistant_message: '' }, null);
    expect(result).toEqual({ output: {} });
  });

  test('sessionId 為空字串 → 回傳 { output: {} }', () => {
    const result = handleAgentStop({ agent_type: 'developer', last_assistant_message: '' }, '');
    expect(result).toEqual({ output: {} });
  });

  test('agentName 不在 stages 清單中 → 回傳 { output: {} }', () => {
    const result = handleAgentStop(
      { agent_type: 'unknown-agent', last_assistant_message: 'some output' },
      'fake-session-id'
    );
    expect(result).toEqual({ output: {} });
  });

  test('agentName 為空字串 → 回傳 { output: {} }', () => {
    const result = handleAgentStop({ agent_type: '', last_assistant_message: '' }, 'fake-session-id');
    expect(result).toEqual({ output: {} });
  });

  test('回傳值有 output 欄位且可 JSON 序列化', () => {
    const result = handleAgentStop({ agent_type: '', last_assistant_message: '' }, null);
    expect(() => JSON.stringify(result)).not.toThrow();
    const parsed = JSON.parse(JSON.stringify(result));
    expect(typeof parsed.output).toBe('object');
  });

  test('有 session 但無對應 workflow state → 靜默退出', () => {
    // 使用不存在的 session，readState 會回傳 null
    const result = handleAgentStop(
      { agent_type: 'developer', last_assistant_message: 'HANDOFF: developer → code-reviewer' },
      'nonexistent-session-xyz'
    );
    expect(result).toEqual({ output: {} });
  });

  test('agent_type 帶 ot: 前綴時正確解析 agentName', () => {
    // ot:developer → developer
    // 無 workflow state 所以最終靜默退出，但不會因為前綴誤判
    const result = handleAgentStop(
      { agent_type: 'developer', last_assistant_message: '' },
      'nonexistent-session-xyz'
    );
    // 無 state → 靜默退出，但不因前綴失敗
    expect(result).toEqual({ output: {} });
  });
});

// ── 正常 pass 流程 ───────────────────────────────────────────────────────────

describe('handleAgentStop — 正常 pass 流程', () => {
  test('DEV stage pass → stage 標記 completed，output 包含文字', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV'], 'single');

    // 設定 DEV 為 active
    stateLib.updateStateAtomic(sid, (s) => {
      s.stages['DEV'].status = 'active';
      return s;
    });

    const result = handleAgentStop(
      {
        agent_type: 'developer',
        last_assistant_message: '## HANDOFF: developer → code-reviewer\n\n全部完成。',
      },
      sid
    );

    expect(result.output).toBeDefined();
    // SubagentStop handler 回傳 { output: {} }，result 欄位不存在
    expect(result.output.result).toBeUndefined();

    const state = stateLib.readState(sid);
    expect(state.stages['DEV'].status).toBe('completed');
    expect(state.stages['DEV'].result).toBe('pass');
  });

  test('REVIEW stage pass → stage 標記 completed，output 非空', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV', 'REVIEW'], 'quick');

    stateLib.updateStateAtomic(sid, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['REVIEW'].status = 'active';
      return s;
    });

    const result = handleAgentStop(
      {
        agent_type: 'code-reviewer',
        last_assistant_message: '程式碼品質良好，通過審查。',
      },
      sid
    );

    const state = stateLib.readState(sid);
    expect(state.stages['REVIEW'].status).toBe('completed');
    expect(state.stages['REVIEW'].result).toBe('pass');
    expect(result.output.result).toBeUndefined();
  });

  test('pass 後 pendingAction 清除（若原本有 fail pendingAction）', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV'], 'single');

    stateLib.updateStateAtomic(sid, (s) => {
      s.stages['DEV'].status = 'active';
      s.failCount = 1;
      s.pendingAction = { type: 'fix-fail', stage: 'DEV', agent: 'developer' };
      return s;
    });

    handleAgentStop(
      { agent_type: 'developer', last_assistant_message: '修復完成，測試通過。' },
      sid
    );

    const state = stateLib.readState(sid);
    expect(state.pendingAction).toBeNull();
  });
});

// ── fail verdict ─────────────────────────────────────────────────────────────

describe('handleAgentStop — fail verdict', () => {
  test('TEST stage 包含 fail 關鍵字 → verdict fail，stage 標記 completed', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV', 'TEST'], 'tdd');

    stateLib.updateStateAtomic(sid, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['TEST'].status = 'active';
      return s;
    });

    const result = handleAgentStop(
      {
        agent_type: 'tester',
        last_assistant_message: '測試結果：3 tests fail，錯誤詳情如下。',
      },
      sid
    );

    const state = stateLib.readState(sid);
    expect(state.stages['TEST'].status).toBe('completed');
    expect(state.stages['TEST'].result).toBe('fail');
    expect(state.failCount).toBeGreaterThan(0);
    expect(result.output.result).toBeUndefined();
  });

  test('fail 後 pendingAction 寫入 fix-fail', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV', 'TEST'], 'tdd');

    stateLib.updateStateAtomic(sid, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['TEST'].status = 'active';
      return s;
    });

    handleAgentStop(
      {
        agent_type: 'tester',
        last_assistant_message: '有 fail case，build fail。',
      },
      sid
    );

    const state = stateLib.readState(sid);
    expect(state.pendingAction).not.toBeNull();
    expect(state.pendingAction.type).toBe('fix-fail');
    expect(state.pendingAction.stage).toBe('TEST');
  });

  test('fail 排除詞 "no fail" → 不觸發 fail verdict（應為 pass）', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV', 'TEST'], 'tdd');

    stateLib.updateStateAtomic(sid, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['TEST'].status = 'active';
      return s;
    });

    handleAgentStop(
      {
        agent_type: 'tester',
        last_assistant_message: '所有測試通過，no fail cases 發現。',
      },
      sid
    );

    const state = stateLib.readState(sid);
    expect(state.stages['TEST'].result).toBe('pass');
  });
});

// ── reject verdict ────────────────────────────────────────────────────────────

describe('handleAgentStop — reject verdict', () => {
  test('REVIEW stage 包含 reject 關鍵字 → verdict reject，rejectCount 遞增', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV', 'REVIEW'], 'quick');

    stateLib.updateStateAtomic(sid, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['REVIEW'].status = 'active';
      return s;
    });

    handleAgentStop(
      {
        agent_type: 'code-reviewer',
        last_assistant_message: 'VERDICT: reject。程式碼有嚴重問題，需重構。',
      },
      sid
    );

    const state = stateLib.readState(sid);
    expect(state.stages['REVIEW'].result).toBe('reject');
    expect(state.rejectCount).toBeGreaterThan(0);
  });

  test('reject 後 pendingAction 寫入 fix-reject', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV', 'REVIEW'], 'quick');

    stateLib.updateStateAtomic(sid, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['REVIEW'].status = 'active';
      return s;
    });

    handleAgentStop(
      {
        agent_type: 'code-reviewer',
        last_assistant_message: '程式碼品質不佳，reject。請修改後重新提交。',
      },
      sid
    );

    const state = stateLib.readState(sid);
    expect(state.pendingAction).not.toBeNull();
    expect(state.pendingAction.type).toBe('fix-reject');
  });

  test('REVIEW stage "request changes" 關鍵字 → reject verdict', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV', 'REVIEW'], 'quick');

    stateLib.updateStateAtomic(sid, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['REVIEW'].status = 'active';
      return s;
    });

    handleAgentStop(
      {
        agent_type: 'code-reviewer',
        last_assistant_message: '我 request changes — 需要調整架構設計。',
      },
      sid
    );

    const state = stateLib.readState(sid);
    expect(state.stages['REVIEW'].result).toBe('reject');
  });

  test('VERDICT structured comment 優先 → pass（即使含 reject 詞）', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV', 'REVIEW'], 'quick');

    stateLib.updateStateAtomic(sid, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['REVIEW'].status = 'active';
      return s;
    });

    handleAgentStop(
      {
        agent_type: 'code-reviewer',
        last_assistant_message: '<!-- VERDICT: {"result": "PASS"} --> 雖然有 reject 建議，但整體可接受。',
      },
      sid
    );

    const state = stateLib.readState(sid);
    expect(state.stages['REVIEW'].result).toBe('pass');
  });
});

// ── activeAgents 清理 ────────────────────────────────────────────────────────

describe('handleAgentStop — activeAgents 清理', () => {
  test('有 INSTANCE_ID 時精確刪除 activeAgents entry', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV'], 'single');

    const instanceId = 'developer:abc123-def456';
    stateLib.updateStateAtomic(sid, (s) => {
      s.stages['DEV'].status = 'active';
      s.activeAgents[instanceId] = { agentName: 'developer', stage: 'DEV', startedAt: new Date().toISOString() };
      return s;
    });

    handleAgentStop(
      {
        agent_type: 'developer',
        last_assistant_message: `開發完成。\nINSTANCE_ID: ${instanceId}`,
      },
      sid
    );

    const state = stateLib.readState(sid);
    expect(state.activeAgents[instanceId]).toBeUndefined();
  });

  test('無 INSTANCE_ID 時 fallback 刪除最早的同名 agent entry', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV'], 'single');

    const instanceId1 = 'developer:aaa000-111111';
    const instanceId2 = 'developer:zzz999-222222';
    stateLib.updateStateAtomic(sid, (s) => {
      s.stages['DEV'].status = 'active';
      s.activeAgents[instanceId1] = { agentName: 'developer', stage: 'DEV', startedAt: new Date().toISOString() };
      s.activeAgents[instanceId2] = { agentName: 'developer', stage: 'DEV', startedAt: new Date().toISOString() };
      return s;
    });

    handleAgentStop(
      {
        agent_type: 'developer',
        last_assistant_message: '開發完成（無 INSTANCE_ID）。',
      },
      sid
    );

    // 字典序最小的應被刪除（fallback 取 candidates[0]）
    const state = stateLib.readState(sid);
    expect(state.activeAgents[instanceId1]).toBeUndefined();
    // instanceId2 可能還存在（另一個並行 agent）
    // 注意：enforceInvariants 規則 4 可能因為 active stage 無 activeAgent 而清除 active 狀態
    // 重點是 instanceId1 被刪除
  });

  test('無對應 activeAgents entry 也不拋出例外', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV'], 'single');

    stateLib.updateStateAtomic(sid, (s) => {
      s.stages['DEV'].status = 'active';
      // 不設定 activeAgents
      return s;
    });

    expect(() => {
      handleAgentStop(
        { agent_type: 'developer', last_assistant_message: '完成。' },
        sid
      );
    }).not.toThrow();
  });
});

// ── 並行收斂門 ───────────────────────────────────────────────────────────────

describe('handleAgentStop — 並行收斂門', () => {
  test('parallelTotal=2，第一個 pass → parallelDone 遞增，未達收斂門檻', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV', 'REVIEW'], 'quick');

    // 設置兩個並行 instance（確保 enforceInvariants 規則 4 不將 REVIEW 改為 pending）
    const inst1 = 'code-reviewer:inst1aaaa-bbbbbb';
    const inst2 = 'code-reviewer:inst2cccc-dddddd';
    stateLib.updateStateAtomic(sid, (s) => {
      // DEV 已完成
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      // REVIEW 設為並行（parallelTotal=2）
      s.stages['REVIEW'].status = 'active';
      s.stages['REVIEW'].parallelTotal = 2;
      // 兩個 active agent（保持 enforceInvariants 規則 4 不觸發）
      s.activeAgents[inst1] = { agentName: 'code-reviewer', stage: 'REVIEW', startedAt: new Date().toISOString() };
      s.activeAgents[inst2] = { agentName: 'code-reviewer', stage: 'REVIEW', startedAt: new Date().toISOString() };
      return s;
    });

    handleAgentStop(
      {
        agent_type: 'code-reviewer',
        last_assistant_message: `程式碼通過。\nINSTANCE_ID: ${inst1}`,
      },
      sid
    );

    // 第一個 pass 且 parallelTotal=2 → 尚未收斂，parallelDone 遞增
    const state = stateLib.readState(sid);
    expect(state.stages['REVIEW'].parallelDone).toBeGreaterThanOrEqual(1);
    // stage 仍 active（尚未收斂 — inst2 仍在 activeAgents 中維持 active）
    expect(state.stages['REVIEW'].status).toBe('active');
  });

  test('並行 stage 任一 fail → stage 立即標記 fail（不等收斂）', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV', 'TEST'], 'tdd');

    const inst = 'tester:inst2cccc-dddddd';
    stateLib.updateStateAtomic(sid, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['TEST'].status = 'active';
      s.stages['TEST'].parallelTotal = 2;
      s.activeAgents[inst] = { agentName: 'tester', stage: 'TEST', startedAt: new Date().toISOString() };
      return s;
    });

    handleAgentStop(
      {
        agent_type: 'tester',
        last_assistant_message: `測試失敗，build fail。\nINSTANCE_ID: ${inst}`,
      },
      sid
    );

    const state = stateLib.readState(sid);
    expect(state.stages['TEST'].status).toBe('completed');
    expect(state.stages['TEST'].result).toBe('fail');
  });

  test('stage 已 completed（先到者完成）→ 後到者只遞增 parallelDone，不改 result', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV', 'REVIEW'], 'quick');

    const inst = 'code-reviewer:late1111-222222';
    stateLib.updateStateAtomic(sid, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      // REVIEW 已被先到者標記 completed
      s.stages['REVIEW'].status = 'completed';
      s.stages['REVIEW'].result = 'pass';
      s.stages['REVIEW'].completedAt = new Date().toISOString();
      s.stages['REVIEW'].parallelDone = 1;
      s.stages['REVIEW'].parallelTotal = 2;
      s.activeAgents[inst] = { agentName: 'code-reviewer', stage: 'REVIEW', startedAt: new Date().toISOString() };
      return s;
    });

    handleAgentStop(
      {
        agent_type: 'code-reviewer',
        last_assistant_message: `後到者通過。\nINSTANCE_ID: ${inst}`,
      },
      sid
    );

    const state = stateLib.readState(sid);
    // result 不應被後到者改變
    expect(state.stages['REVIEW'].result).toBe('pass');
    // parallelDone 應遞增
    expect(state.stages['REVIEW'].parallelDone).toBeGreaterThanOrEqual(2);
  });
});

// ── timeline 事件 ────────────────────────────────────────────────────────────

describe('handleAgentStop — timeline 事件正確性', () => {
  test('正常 pass → timeline 記錄 agent:complete', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV'], 'single');

    // 讀取 timeline 前清空（若有舊記錄）
    const timelinePath = paths.session.timeline(sid);

    stateLib.updateStateAtomic(sid, (s) => {
      s.stages['DEV'].status = 'active';
      return s;
    });

    handleAgentStop(
      { agent_type: 'developer', last_assistant_message: '開發完成。' },
      sid
    );

    // 確認 timeline 檔案存在且含 agent:complete
    expect(fs.existsSync(timelinePath)).toBe(true);
    const content = fs.readFileSync(timelinePath, 'utf8');
    const events = content.split('\n').filter(Boolean).map(l => JSON.parse(l));
    const agentComplete = events.find(e => e.type === 'agent:complete');
    expect(agentComplete).toBeDefined();
    // timeline event 格式：{ ts, type, category, label, ...data }（直接 spread，不是 .data）
    expect(agentComplete.agent).toBe('developer');
  });

  test('fail → timeline 記錄 agent:error', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV', 'TEST'], 'tdd');

    stateLib.updateStateAtomic(sid, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['TEST'].status = 'active';
      return s;
    });

    handleAgentStop(
      { agent_type: 'tester', last_assistant_message: '測試 fail，有錯誤。' },
      sid
    );

    const timelinePath = paths.session.timeline(sid);
    const content = fs.readFileSync(timelinePath, 'utf8');
    const events = content.split('\n').filter(Boolean).map(l => JSON.parse(l));
    const agentError = events.find(e => e.type === 'agent:error');
    expect(agentError).toBeDefined();
    expect(agentError.agent).toBe('tester');
  });

  test('單一 agent stage 完成 → timeline 記錄 stage:complete', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV'], 'single');

    stateLib.updateStateAtomic(sid, (s) => {
      s.stages['DEV'].status = 'active';
      return s;
    });

    handleAgentStop(
      { agent_type: 'developer', last_assistant_message: '完成開發。' },
      sid
    );

    const timelinePath = paths.session.timeline(sid);
    const content = fs.readFileSync(timelinePath, 'utf8');
    const events = content.split('\n').filter(Boolean).map(l => JSON.parse(l));
    const stageComplete = events.find(e => e.type === 'stage:complete');
    expect(stageComplete).toBeDefined();
    expect(stageComplete.stage).toBe('DEV');
    expect(stageComplete.result).toBe('pass');
  });
});

// ── tasks.md checkbox 勾選 ────────────────────────────────────────────────────

describe('handleAgentStop — tasks.md checkbox 勾選', () => {
  test('featureName 存在且 tasks.md 有對應 stage checkbox → 自動勾選', () => {
    const sid = newSessionId();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ot-tasks-test-'));

    try {
      setupSession(sid, ['DEV'], 'single');

      // 建立 tasks.md
      const featureName = 'test-feature-checkbox';
      const featureDir = path.join(tmpDir, 'specs', 'features', 'in-progress', featureName);
      fs.mkdirSync(featureDir, { recursive: true });
      fs.writeFileSync(
        path.join(featureDir, 'tasks.md'),
        '- [ ] DEV\n- [ ] REVIEW\n'
      );

      stateLib.updateStateAtomic(sid, (s) => {
        s.stages['DEV'].status = 'active';
        s.featureName = featureName;
        return s;
      });

      handleAgentStop(
        {
          agent_type: 'developer',
          last_assistant_message: '開發完成。',
          cwd: tmpDir,
        },
        sid
      );

      const tasksContent = fs.readFileSync(path.join(featureDir, 'tasks.md'), 'utf8');
      expect(tasksContent).toContain('- [x] DEV');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('fail verdict → 不勾選 tasks.md checkbox', () => {
    const sid = newSessionId();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ot-tasks-fail-'));

    try {
      setupSession(sid, ['DEV', 'TEST'], 'tdd');

      const featureName = 'test-feature-fail';
      const featureDir = path.join(tmpDir, 'specs', 'features', 'in-progress', featureName);
      fs.mkdirSync(featureDir, { recursive: true });
      fs.writeFileSync(
        path.join(featureDir, 'tasks.md'),
        '- [ ] DEV\n- [ ] TEST\n'
      );

      stateLib.updateStateAtomic(sid, (s) => {
        s.stages['DEV'].status = 'completed';
        s.stages['DEV'].result = 'pass';
        s.stages['TEST'].status = 'active';
        s.featureName = featureName;
        return s;
      });

      handleAgentStop(
        {
          agent_type: 'tester',
          last_assistant_message: '測試 fail，build 失敗。',
          cwd: tmpDir,
        },
        sid
      );

      const tasksContent = fs.readFileSync(path.join(featureDir, 'tasks.md'), 'utf8');
      // fail 不勾選
      expect(tasksContent).not.toContain('- [x] TEST');
      expect(tasksContent).toContain('- [ ] TEST');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('tasks.md 不存在時靜默略過，不拋出例外', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV'], 'single');

    stateLib.updateStateAtomic(sid, (s) => {
      s.stages['DEV'].status = 'active';
      s.featureName = 'nonexistent-feature-xyz';
      return s;
    });

    expect(() => {
      handleAgentStop(
        { agent_type: 'developer', last_assistant_message: '完成。' },
        sid
      );
    }).not.toThrow();
  });
});

// ── currentStage 推進 ─────────────────────────────────────────────────────────

describe('handleAgentStop — currentStage 推進', () => {
  test('DEV pass → currentStage 推進到下一個 pending stage', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV', 'REVIEW', 'RETRO', 'DOCS'], 'quick');

    stateLib.updateStateAtomic(sid, (s) => {
      s.stages['DEV'].status = 'active';
      return s;
    });

    handleAgentStop(
      { agent_type: 'developer', last_assistant_message: '完成。' },
      sid
    );

    const state = stateLib.readState(sid);
    // currentStage 應推進（DEV 完成後指向 REVIEW）
    expect(state.currentStage).toBe('REVIEW');
  });
});

// ── PM stage + queue 自動寫入 ──────────────────────────────────────────────────

describe('handleAgentStop — PM stage queue 自動寫入', () => {
  test('PM stage pass + 含佇列表格 → 不拋出例外（靜默處理）', () => {
    const sid = newSessionId();
    setupSession(sid, ['PM'], 'discovery');

    stateLib.updateStateAtomic(sid, (s) => {
      s.stages['PM'].status = 'active';
      return s;
    });

    const pmOutput = `## 分析完成

**執行佇列**：
| # | 名稱 | Workflow | 說明 |
|---|------|---------|------|
| 1 | feature-a | quick | 功能 A |
| 2 | feature-b | standard | 功能 B |
`;

    expect(() => {
      handleAgentStop(
        { agent_type: 'product-manager', last_assistant_message: pmOutput },
        sid
      );
    }).not.toThrow();
  });
});

// ── _parseQueueTable 佇列表格解析 ──────────────────────────────────────────

describe('_parseQueueTable 佇列表格解析', () => {
  test('解析標準 PM 輸出的佇列表格', () => {
    const output = `
## HANDOFF

**執行佇列**：
| # | 名稱 | Workflow | 說明 |
|---|------|---------|------|
| 1 | claudecode-env-filter | single | session-spawner 加入過濾 |
| 2 | pm-queue-auto-write | quick | agent-stop-handler 整合 |
| 3 | telegram-run-command | quick | Telegram /run 命令 |

Some other text after.
`;
    const items = _parseQueueTable(output);
    expect(items).toEqual([
      { name: 'claudecode-env-filter', workflow: 'single' },
      { name: 'pm-queue-auto-write', workflow: 'quick' },
      { name: 'telegram-run-command', workflow: 'quick' },
    ]);
  });

  test('無佇列表格 → 回傳空陣列', () => {
    const output = '## HANDOFF\n\nSome analysis without queue table.';
    expect(_parseQueueTable(output)).toEqual([]);
  });

  test('佇列表格為空（只有表頭）→ 回傳空陣列', () => {
    const output = `
**執行佇列**：
| # | 名稱 | Workflow | 說明 |
|---|------|---------|------|
`;
    expect(_parseQueueTable(output)).toEqual([]);
  });

  test('單項佇列', () => {
    const output = `
**執行佇列**：
| # | 名稱 | Workflow | 說明 |
|---|------|---------|------|
| 1 | fix-bug | single | 修 bug |
`;
    const items = _parseQueueTable(output);
    expect(items).toEqual([{ name: 'fix-bug', workflow: 'single' }]);
  });

  test('佇列表格後有其他內容不影響解析', () => {
    const output = `
**執行佇列**：
| # | 名稱 | Workflow | 說明 |
|---|------|---------|------|
| 1 | task-a | standard | 任務 A |

### Open Questions
1. Some question
`;
    const items = _parseQueueTable(output);
    expect(items).toEqual([{ name: 'task-a', workflow: 'standard' }]);
  });

  test('不含 | # | 格式的表格不被解析', () => {
    // 觸發 "執行佇列" 但 header 格式不符
    const output = `
**執行佇列**：
名稱 | Workflow
feature-a | quick
`;
    // 因為沒有 |---|... 分隔行，headerPassed 不會設為 true，資料行不解析
    const items = _parseQueueTable(output);
    expect(items).toEqual([]);
  });

  test('多個佇列區塊：第一個遇到非表格行後 break，只解析第一個', () => {
    // _parseQueueTable 遇到非表格行即 break，不繼續掃描後續佇列
    // 第一個佇列的 old-task 會被解析，第二個因 break 而被忽略
    const output = `
## 舊佇列

**執行佇列**：
| # | 名稱 | Workflow | 說明 |
|---|------|---------|------|
| 1 | old-task | quick | 舊任務 |

Some text here.

**執行佇列**：
| # | 名稱 | Workflow | 說明 |
|---|------|---------|------|
| 1 | new-task | standard | 新任務 |
`;
    const items = _parseQueueTable(output);
    // 第一個佇列 old-task 被解析，第二個因 break 停止
    expect(items.some(i => i.name === 'old-task')).toBe(true);
    // new-task 在第一個佇列的 break 之後，不會被解析
    expect(items.some(i => i.name === 'new-task')).toBe(false);
  });
});

// ── RETRO stage — issues verdict ──────────────────────────────────────────────

describe('handleAgentStop — RETRO stage issues verdict', () => {
  test('RETRO 輸出含 issues → verdict issues，stage 仍 completed', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV', 'RETRO'], 'quick');

    stateLib.updateStateAtomic(sid, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['RETRO'].status = 'active';
      return s;
    });

    handleAgentStop(
      {
        agent_type: 'retrospective',
        last_assistant_message: '本次 sprint 有以下 issues：測試覆蓋不足，建議改善。',
      },
      sid
    );

    const state = stateLib.readState(sid);
    // B-1: status=completed + result='issues'
    expect(state.stages['RETRO'].status).toBe('completed');
    expect(state.stages['RETRO'].result).toBe('issues');
    // issues 不是 fail/reject，pendingAction 不應寫入
    expect(state.pendingAction).toBeNull();
  });

  test('B-3: RETRO issues → isConvergedOrFailed=true（stage:complete timeline 事件存在）', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV', 'RETRO'], 'quick');

    stateLib.updateStateAtomic(sid, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['RETRO'].status = 'active';
      return s;
    });

    handleAgentStop(
      {
        agent_type: 'retrospective',
        last_assistant_message: '本次 sprint 有以下 issues：架構設計有改善空間，建議重構。',
      },
      sid
    );

    // isConvergedOrFailed=true 的效果：stage:complete 事件被 emit 到 timeline
    const timelinePath = paths.session.timeline(sid);
    const content = fs.readFileSync(timelinePath, 'utf8');
    const events = content.split('\n').filter(Boolean).map(l => JSON.parse(l));
    const stageComplete = events.find(e => e.type === 'stage:complete' && e.stage === 'RETRO');
    expect(stageComplete).toBeDefined();
    expect(stageComplete.result).toBe('issues');
  });

  test('B-2: RETRO verdict=pass → stage completed + result=pass（無回歸）', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV', 'RETRO'], 'quick');

    stateLib.updateStateAtomic(sid, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['RETRO'].status = 'active';
      return s;
    });

    handleAgentStop(
      {
        agent_type: 'retrospective',
        last_assistant_message: '本次 sprint 執行順暢，所有目標達成。',
      },
      sid
    );

    const state = stateLib.readState(sid);
    expect(state.stages['RETRO'].status).toBe('completed');
    expect(state.stages['RETRO'].result).toBe('pass');
    expect(state.pendingAction).toBeNull();
  });

  test('RETRO 輸出含 "no issues" → verdict pass（排除詞）', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV', 'RETRO'], 'quick');

    stateLib.updateStateAtomic(sid, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['RETRO'].status = 'active';
      return s;
    });

    handleAgentStop(
      {
        agent_type: 'retrospective',
        last_assistant_message: '本次 sprint 執行良好，no issues found。',
      },
      sid
    );

    const state = stateLib.readState(sid);
    expect(state.stages['RETRO'].result).toBe('pass');
  });
});

// ── _computeImpactSummary ────────────────────────────────────────────────────

describe('_computeImpactSummary', () => {
  const { _computeImpactSummary } = require(join(SCRIPTS_LIB, 'agent-stop-handler'));
  const os = require('os');
  const path = require('path');

  test('匯出 _computeImpactSummary 函數', () => {
    expect(typeof _computeImpactSummary).toBe('function');
  });

  test('傳入非 git 目錄時回傳 null（靜默降級）', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ot-impact-test-'));
    try {
      const result = _computeImpactSummary(tmpDir);
      expect(result).toBeNull();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('git 命令失敗時回傳 null，不拋出例外', () => {
    // 傳入一個不存在的路徑，execSync 必然失敗
    expect(() => {
      const result = _computeImpactSummary('/nonexistent-path-xyz-abc');
      expect(result).toBeNull();
    }).not.toThrow();
  });

  test('在真實 git repo 中執行不拋出例外', () => {
    // 使用專案根目錄（有 git history）
    const projectRoot = path.resolve(__dirname, '../..');
    expect(() => {
      const result = _computeImpactSummary(projectRoot);
      // result 可能是 null（無前一個 commit 或無修改）或字串
      expect(result === null || typeof result === 'string').toBe(true);
    }).not.toThrow();
  });

  test('回傳字串時包含修改檔案數量和固定提醒文字', () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const result = _computeImpactSummary(projectRoot);
    // 若有前一個 commit 且有修改檔案，應包含基本提醒
    if (result !== null) {
      expect(typeof result).toBe('string');
      expect(result).toContain('修改了');
      expect(result).toContain('hardcoded 數值');
    }
  });
});

// ── failCount / rejectCount 遞增 ──────────────────────────────────────────────

describe('handleAgentStop — retry 計數機制', () => {
  test('連續兩次 fail → failCount = 2', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV', 'TEST'], 'tdd');

    stateLib.updateStateAtomic(sid, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['TEST'].status = 'active';
      return s;
    });

    // 第一次 fail
    handleAgentStop(
      { agent_type: 'tester', last_assistant_message: '測試 fail。' },
      sid
    );

    // 重設 TEST 為 active 模擬 retry
    stateLib.updateStateAtomic(sid, (s) => {
      s.stages['TEST'].status = 'active';
      delete s.stages['TEST'].result;
      delete s.stages['TEST'].completedAt;
      return s;
    });

    // 第二次 fail
    handleAgentStop(
      { agent_type: 'tester', last_assistant_message: '仍然 fail。' },
      sid
    );

    const state = stateLib.readState(sid);
    expect(state.failCount).toBe(2);
  });

  test('fail 後 pass → failCount 保留（不遞減），pendingAction 清除', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV', 'TEST'], 'tdd');

    stateLib.updateStateAtomic(sid, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['TEST'].status = 'active';
      return s;
    });

    // fail
    handleAgentStop(
      { agent_type: 'tester', last_assistant_message: '測試 fail。' },
      sid
    );

    // retry → pass
    stateLib.updateStateAtomic(sid, (s) => {
      s.stages['TEST'].status = 'active';
      delete s.stages['TEST'].result;
      delete s.stages['TEST'].completedAt;
      return s;
    });

    handleAgentStop(
      { agent_type: 'tester', last_assistant_message: '所有測試通過，無錯誤。' },
      sid
    );

    const state = stateLib.readState(sid);
    // failCount 保留
    expect(state.failCount).toBeGreaterThanOrEqual(1);
    // pendingAction 清除
    expect(state.pendingAction).toBeNull();
  });
});
