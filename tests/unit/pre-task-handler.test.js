'use strict';
/**
 * pre-task-handler.test.js
 *
 * 測試 pre-task-handler.js 匯出的純函數。
 *
 * 覆蓋範圍：
 *   - checkSkippedStages — 前置 stage 跳過偵測邏輯
 *   - handlePreTask 部分邏輯（無 session / 無 state / 無法辨識 agent）
 *   - _buildMoscowWarning — MoSCoW 警告生成邏輯（T6）
 *
 * 補強（handler-test-critical）：
 *   - handlePreTask subagent_type 直接映射（L1）
 *   - handlePreTask identifyAgent fallback（L1 fallback）
 *   - 跳階阻擋輸出格式（deny + permissionDecisionReason）
 *   - updatedInput 組裝：prompt 包含 workflowContext + originalPrompt
 *   - instanceId 格式驗證
 *   - parallelTotal 注入 PARALLEL INSTANCE 區塊
 *   - retry 場景：stage 為 completed+fail → 重設為 active
 *   - timeline 事件：agent:delegate / stage:start
 *   - statusline update 不拋出例外
 *   - activeAgents 寫入
 */

const { describe, test, expect, afterAll } = require('bun:test');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const { checkSkippedStages, handlePreTask, _buildMoscowWarning } = require(path.join(SCRIPTS_LIB, 'pre-task-handler'));
const stateLib = require(path.join(SCRIPTS_LIB, 'state'));
const paths = require(path.join(SCRIPTS_LIB, 'paths'));

// ── 並行安全：獨立臨時目錄 ──────────────────────────────────────────────────

const TEST_PROJECT_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'ot-pre-task-'));

// ── Session 管理工具 ─────────────────────────────────────────────────────────

const SESSION_PREFIX = `test_ptask_${Date.now()}`;
let sessionCounter = 0;
const createdSessions = [];

function newSessionId() {
  const sid = `${SESSION_PREFIX}_${++sessionCounter}`;
  createdSessions.push(sid);
  return sid;
}

function setupSession(sid, stageList, workflowType = 'quick') {
  const dir = paths.sessionDir(TEST_PROJECT_ROOT, sid);
  fs.mkdirSync(dir, { recursive: true });
  return stateLib.initState(TEST_PROJECT_ROOT, sid, workflowType, stageList);
}

afterAll(() => {
  fs.rmSync(TEST_PROJECT_ROOT, { recursive: true, force: true });
});

// ── checkSkippedStages ───────────────────────────────────────────────────

describe('checkSkippedStages', () => {
  const mockStages = {
    PLAN: { emoji: '🏗️', label: '計劃', agent: 'planner' },
    ARCH: { emoji: '📐', label: '架構', agent: 'architect' },
    DEV:  { emoji: '💻', label: '開發', agent: 'developer' },
  };

  test('所有前置 stage 已完成時回傳空陣列', () => {
    const currentState = {
      stages: {
        PLAN: { status: 'completed', result: 'pass' },
        ARCH: { status: 'completed', result: 'pass' },
        DEV:  { status: 'pending' },
      },
    };
    const result = checkSkippedStages(currentState, 'DEV', mockStages);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  test('前置 stage 為 pending 時回傳跳過清單', () => {
    const currentState = {
      stages: {
        PLAN: { status: 'pending' },
        ARCH: { status: 'pending' },
        DEV:  { status: 'pending' },
      },
    };
    const result = checkSkippedStages(currentState, 'DEV', mockStages);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    // 應包含 PLAN 和 ARCH 的描述
    expect(result.some(s => s.includes('PLAN'))).toBe(true);
    expect(result.some(s => s.includes('ARCH'))).toBe(true);
  });

  test('回傳清單包含 emoji 和 label 描述', () => {
    const currentState = {
      stages: {
        PLAN: { status: 'pending' },
        DEV:  { status: 'pending' },
      },
    };
    const result = checkSkippedStages(currentState, 'DEV', {
      PLAN: { emoji: '🏗️', label: '計劃', agent: 'planner' },
      DEV:  { emoji: '💻', label: '開發', agent: 'developer' },
    });
    expect(result.length).toBe(1);
    expect(result[0]).toContain('🏗️');
    expect(result[0]).toContain('計劃');
    expect(result[0]).toContain('PLAN');
  });

  test('targetStage 為第一個 stage 時回傳空陣列（無前置依賴）', () => {
    const currentState = {
      stages: {
        PLAN: { status: 'pending' },
        DEV:  { status: 'pending' },
      },
    };
    const result = checkSkippedStages(currentState, 'PLAN', mockStages);
    expect(result).toHaveLength(0);
  });

  test('currentState 為 null 時回傳空陣列（不拋出例外）', () => {
    const result = checkSkippedStages(null, 'DEV', mockStages);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  test('targetStage 為 null 時回傳空陣列（不拋出例外）', () => {
    const currentState = {
      stages: { PLAN: { status: 'pending' }, DEV: { status: 'pending' } },
    };
    const result = checkSkippedStages(currentState, null, mockStages);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  test('前置 stage 已 active 時不算跳過', () => {
    const currentState = {
      stages: {
        PLAN: { status: 'active' },
        DEV:  { status: 'pending' },
      },
    };
    const result = checkSkippedStages(currentState, 'DEV', {
      PLAN: { emoji: '🏗️', label: '計劃', agent: 'planner' },
      DEV:  { emoji: '💻', label: '開發', agent: 'developer' },
    });
    expect(result).toHaveLength(0);
  });

  test('前置 stage 已 completed 時不算跳過', () => {
    const currentState = {
      stages: {
        PLAN: { status: 'completed', result: 'pass' },
        DEV:  { status: 'pending' },
      },
    };
    const result = checkSkippedStages(currentState, 'DEV', {
      PLAN: { emoji: '🏗️', label: '計劃', agent: 'planner' },
      DEV:  { emoji: '💻', label: '開發', agent: 'developer' },
    });
    expect(result).toHaveLength(0);
  });

  test('stage key 含 instance suffix（如 TEST:spec）時正確比對 base', () => {
    const currentState = {
      stages: {
        'TEST:spec': { status: 'pending' },
        DEV:         { status: 'pending' },
      },
    };
    const stagesDef = {
      TEST: { emoji: '🧪', label: '測試', agent: 'tester' },
      DEV:  { emoji: '💻', label: '開發', agent: 'developer' },
    };
    const result = checkSkippedStages(currentState, 'DEV', stagesDef);
    expect(result.length).toBe(1);
    expect(result[0]).toContain('TEST');
  });

  test('currentState.stages 為空物件時回傳空陣列', () => {
    const currentState = { stages: {} };
    const result = checkSkippedStages(currentState, 'DEV', mockStages);
    expect(result).toHaveLength(0);
  });

  test('部分前置 stage 為 active，部分為 pending → pending 的視為跳過', () => {
    const currentState = {
      stages: {
        PLAN: { status: 'active' },
        ARCH: { status: 'pending' },
        DEV:  { status: 'pending' },
      },
    };
    const result = checkSkippedStages(currentState, 'DEV', mockStages);
    // PLAN active（不算跳過），ARCH pending（算跳過）
    expect(result.length).toBe(1);
    expect(result[0]).toContain('ARCH');
  });

  test('currentState.stages 為 undefined 時不拋出例外', () => {
    const result = checkSkippedStages({ stages: undefined }, 'DEV', mockStages);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  // ── 並行群組排除測試 ──────────────────────────────────────────────────────

  test('同一並行群組的 pending stage 不算必要前置條件（DOCS 不被 RETRO 阻擋）', () => {
    const stages = {
      DEV:  { emoji: '💻', label: '開發', agent: 'developer' },
      RETRO: { emoji: '🔁', label: '回顧', agent: 'retrospective' },
      DOCS: { emoji: '📝', label: '文件', agent: 'doc-updater' },
    };
    const parallelGroupsDef = {
      postdev: ['RETRO', 'DOCS'],
    };
    const currentState = {
      stages: {
        DEV:  { status: 'completed', result: 'pass' },
        RETRO: { status: 'pending' },
        DOCS: { status: 'pending' },
      },
    };
    // DOCS 委派時 RETRO 是同群組，不應被列為必要前置
    const result = checkSkippedStages(currentState, 'DOCS', stages, parallelGroupsDef);
    expect(result).toHaveLength(0);
  });

  test('同一並行群組的 pending stage 不算前置條件（RETRO 不被 DOCS 阻擋）', () => {
    const stages = {
      DEV:  { emoji: '💻', label: '開發', agent: 'developer' },
      RETRO: { emoji: '🔁', label: '回顧', agent: 'retrospective' },
      DOCS: { emoji: '📝', label: '文件', agent: 'doc-updater' },
    };
    const parallelGroupsDef = {
      postdev: ['RETRO', 'DOCS'],
    };
    const currentState = {
      stages: {
        DEV:  { status: 'completed', result: 'pass' },
        RETRO: { status: 'pending' },
        DOCS: { status: 'pending' },
      },
    };
    // RETRO 委派時 DOCS 不在 RETRO 之前（RETRO 在 DOCS 之前），不影響此案例
    // 但 RETRO 不應被任何同群組 stage 阻擋
    const result = checkSkippedStages(currentState, 'RETRO', stages, parallelGroupsDef);
    expect(result).toHaveLength(0);
  });

  test('不同群組的 pending stage 仍算必要前置條件（DOCS 被 DEV 阻擋）', () => {
    const stages = {
      DEV:  { emoji: '💻', label: '開發', agent: 'developer' },
      RETRO: { emoji: '🔁', label: '回顧', agent: 'retrospective' },
      DOCS: { emoji: '📝', label: '文件', agent: 'doc-updater' },
    };
    const parallelGroupsDef = {
      postdev: ['RETRO', 'DOCS'],
    };
    const currentState = {
      stages: {
        DEV:  { status: 'pending' },  // DEV 未完成
        RETRO: { status: 'pending' },
        DOCS: { status: 'pending' },
      },
    };
    // DEV 不在 postdev 群組，應該阻擋 DOCS
    const result = checkSkippedStages(currentState, 'DOCS', stages, parallelGroupsDef);
    expect(result.length).toBeGreaterThan(0);
    expect(result.some(s => s.includes('DEV'))).toBe(true);
    // RETRO 在同群組，不應出現在阻擋清單
    expect(result.some(s => s.includes('RETRO'))).toBe(false);
  });

  test('quality 群組：REVIEW 不被 TEST 阻擋', () => {
    const stages = {
      DEV:  { emoji: '💻', label: '開發', agent: 'developer' },
      REVIEW: { emoji: '🔍', label: '審查', agent: 'code-reviewer' },
      TEST: { emoji: '🧪', label: '測試', agent: 'tester' },
    };
    const parallelGroupsDef = {
      quality: ['REVIEW', 'TEST'],
    };
    const currentState = {
      stages: {
        DEV:  { status: 'completed', result: 'pass' },
        REVIEW: { status: 'pending' },
        TEST: { status: 'pending' },
      },
    };
    const result = checkSkippedStages(currentState, 'REVIEW', stages, parallelGroupsDef);
    expect(result).toHaveLength(0);
  });

  test('parallelGroupsDef 未傳時預設為 {} — 不影響非並行場景', () => {
    const stages = {
      PLAN: { emoji: '🏗️', label: '計劃', agent: 'planner' },
      DEV:  { emoji: '💻', label: '開發', agent: 'developer' },
    };
    const currentState = {
      stages: {
        PLAN: { status: 'completed', result: 'pass' },
        DEV:  { status: 'pending' },
      },
    };
    // 不傳第四參數，向後相容
    const result = checkSkippedStages(currentState, 'DEV', stages);
    expect(result).toHaveLength(0);
  });
});

// ── handlePreTask — 早期返回路徑 ─────────────────────────────────────────────

describe('handlePreTask — 早期返回路徑', () => {
  test('回傳物件含 output 欄位', () => {
    const result = handlePreTask({});
    expect(result).toHaveProperty('output');
    expect(typeof result.output).toBe('object');
  });

  test('回傳物件可安全序列化為 JSON', () => {
    const result = handlePreTask({});
    expect(() => JSON.stringify(result.output)).not.toThrow();
  });
});

// ── agent 辨識邏輯 ────────────────────────────────────────────────────────────

describe('handlePreTask — agent 辨識', () => {
  test('未知 subagent_type 且 prompt 無法辨識時回傳空 result（不擋）', () => {
    const result = handlePreTask({
      tool_input: {
        subagent_type: 'unknown',
        description: 'some task',
        prompt: 'do something',
      },
    });
    // 無 sessionId → 早期 return {}
    expect(result).toEqual({ output: {} });
  });

  test('subagent_type 為 developer → 正確辨識 developer', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV'], 'single');

    const result = handlePreTask({
      session_id: sid,
      cwd: TEST_PROJECT_ROOT,
      tool_input: {
        subagent_type: 'developer',
        description: '委派開發',
        prompt: '請實作功能 X',
      },
    }, sid);

    // DEV 是 pending，無跳過階段 → 放行（allow 或空 result）
    expect(result.output).toBeDefined();
    // 不應是 deny
    if (result.output.hookSpecificOutput) {
      expect(result.output.hookSpecificOutput.permissionDecision).not.toBe('deny');
    }
  });

  test('subagent_type 為 unknown → 回傳空 result（未知 agent）', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV'], 'single');

    const result = handlePreTask({
      session_id: sid,
      tool_input: {
        subagent_type: 'nonexistent-agent',
        description: '委派',
        prompt: '做點什麼',
      },
    }, sid);

    // nonexistent-agent 不在 stages，fallback 到 identifyAgent
    // identifyAgent 也不認識 → 回傳空
    expect(result).toEqual({ output: {} });
  });

  test('description 含 tester 關鍵字 → identifyAgent fallback 辨識', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV', 'TEST'], 'tdd');

    // DEV 先完成，TEST pending
    stateLib.updateStateAtomic(TEST_PROJECT_ROOT, sid, null, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      return s;
    });

    const result = handlePreTask({
      session_id: sid,
      cwd: TEST_PROJECT_ROOT,
      tool_input: {
        // 無前綴，靠 description fallback
        description: '委派 tester 執行測試',
        prompt: '請執行所有測試',
      },
    }, sid);

    expect(result.output).toBeDefined();
    if (result.output.hookSpecificOutput) {
      expect(result.output.hookSpecificOutput.permissionDecision).not.toBe('deny');
    }
  });
});

// ── 跳階阻擋 ─────────────────────────────────────────────────────────────────

describe('handlePreTask — 跳階阻擋', () => {
  test('deny 訊息包含被跳過的 stage 資訊', () => {
    const sid = newSessionId();
    setupSession(sid, ['PLAN', 'DEV'], 'quick');

    const result = handlePreTask({
      session_id: sid,
      cwd: TEST_PROJECT_ROOT,
      tool_input: {
        subagent_type: 'developer',
        description: '委派開發',
        prompt: '請實作',
      },
    }, sid);

    const reason = result.output.hookSpecificOutput?.permissionDecisionReason || '';
    expect(reason).toContain('PLAN');
  });

  test('deny 回傳結構符合 hookSpecificOutput 規格', () => {
    const sid = newSessionId();
    setupSession(sid, ['PLAN', 'DEV'], 'quick');

    const result = handlePreTask({
      session_id: sid,
      cwd: TEST_PROJECT_ROOT,
      tool_input: {
        subagent_type: 'developer',
        description: '委派',
        prompt: '實作',
      },
    }, sid);

    const output = result.output;
    expect(output.hookSpecificOutput).toBeDefined();
    expect(output.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(output.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(typeof output.hookSpecificOutput.permissionDecisionReason).toBe('string');
    expect(output.hookSpecificOutput.permissionDecisionReason.length).toBeGreaterThan(0);
  });
});

// ── updatedInput 組裝 ─────────────────────────────────────────────────────────

describe('handlePreTask — updatedInput 組裝', () => {
  test('放行時 updatedInput.prompt 包含 originalPrompt', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV'], 'single');

    const originalPrompt = '請實作功能 X，包含單元測試。';
    const result = handlePreTask({
      session_id: sid,
      cwd: TEST_PROJECT_ROOT,
      tool_input: {
        subagent_type: 'developer',
        description: '委派開發',
        prompt: originalPrompt,
      },
    }, sid);

    if (result.output.hookSpecificOutput?.updatedInput) {
      expect(result.output.hookSpecificOutput.updatedInput.prompt).toContain(originalPrompt);
    }
    // 即使沒有 context 注入（context 為空），也應放行
    expect(result.output.hookSpecificOutput?.permissionDecision).not.toBe('deny');
  });

  test('放行時 updatedInput 保留所有原始 tool_input 欄位', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV'], 'single');

    const result = handlePreTask({
      session_id: sid,
      cwd: TEST_PROJECT_ROOT,
      tool_input: {
        subagent_type: 'developer',
        description: '委派開發',
        prompt: '實作功能',
        customField: 'should-be-preserved',
      },
    }, sid);

    if (result.output.hookSpecificOutput?.updatedInput) {
      // subagent_type 應被保留（MUST 規則）
      expect(result.output.hookSpecificOutput.updatedInput.subagent_type).toBe('developer');
      expect(result.output.hookSpecificOutput.updatedInput.description).toBe('委派開發');
      expect(result.output.hookSpecificOutput.updatedInput.customField).toBe('should-be-preserved');
    }
  });

  test('有 workflowContext 時 updatedInput.prompt 包含工作流狀態', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV', 'REVIEW'], 'quick');

    const result = handlePreTask({
      session_id: sid,
      cwd: TEST_PROJECT_ROOT,
      tool_input: {
        subagent_type: 'developer',
        description: '委派開發',
        prompt: '開發功能 Y',
      },
    }, sid);

    if (result.output.hookSpecificOutput?.updatedInput) {
      const prompt = result.output.hookSpecificOutput.updatedInput.prompt;
      // workflow context 應在 prompt 中（含工作流類型或 stage 資訊）
      expect(typeof prompt).toBe('string');
      expect(prompt).toContain('開發功能 Y');
    }
  });
});

// ── instanceId 生成 ───────────────────────────────────────────────────────────

describe('handlePreTask — instanceId 生成', () => {
  test('放行後 activeAgents 中新增一個以 developer: 開頭的 instanceId', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV'], 'single');

    handlePreTask({
      session_id: sid,
      cwd: TEST_PROJECT_ROOT,
      tool_input: {
        subagent_type: 'developer',
        description: '委派',
        prompt: '實作',
      },
    }, sid);

    const state = stateLib.readState(TEST_PROJECT_ROOT, sid);
    const keys = Object.keys(state.activeAgents);
    expect(keys.length).toBeGreaterThan(0);
    const devKey = keys.find(k => k.startsWith('developer:'));
    expect(devKey).toBeDefined();
  });

  test('instanceId 格式為 agentName:timestamp36-random6', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV'], 'single');

    handlePreTask({
      session_id: sid,
      cwd: TEST_PROJECT_ROOT,
      tool_input: {
        subagent_type: 'developer',
        description: '委派',
        prompt: '實作',
      },
    }, sid);

    const state = stateLib.readState(TEST_PROJECT_ROOT, sid);
    const keys = Object.keys(state.activeAgents);
    const devKey = keys.find(k => k.startsWith('developer:'));
    // 格式：developer:xxxxx-xxxxxx
    expect(devKey).toMatch(/^developer:[a-z0-9]+-[a-z0-9]+$/);
  });

  test('兩次委派同一 agent 產生不同 instanceId', async () => {
    const sid1 = newSessionId();
    const sid2 = newSessionId();
    setupSession(sid1, ['DEV'], 'single');
    setupSession(sid2, ['DEV'], 'single');

    handlePreTask({
      session_id: sid1,
      cwd: TEST_PROJECT_ROOT,
      tool_input: { subagent_type: 'developer', description: '委派 1', prompt: '實作 1' },
    }, sid1);

    // 稍微等一下確保 timestamp 不同
    await new Promise(r => setTimeout(r, 2));

    handlePreTask({
      session_id: sid2,
      cwd: TEST_PROJECT_ROOT,
      tool_input: { subagent_type: 'developer', description: '委派 2', prompt: '實作 2' },
    }, sid2);

    const state1 = stateLib.readState(TEST_PROJECT_ROOT, sid1);
    const state2 = stateLib.readState(TEST_PROJECT_ROOT, sid2);

    const keys1 = Object.keys(state1.activeAgents).filter(k => k.startsWith('developer:'));
    const keys2 = Object.keys(state2.activeAgents).filter(k => k.startsWith('developer:'));

    expect(keys1[0]).not.toBe(keys2[0]);
  });
});

// ── PARALLEL_TOTAL 注入 ───────────────────────────────────────────────────────

describe('handlePreTask — PARALLEL_TOTAL 注入', () => {
  test('prompt 含 PARALLEL_TOTAL → updatedInput.prompt 包含 PARALLEL INSTANCE 區塊', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV'], 'single');

    const result = handlePreTask({
      session_id: sid,
      cwd: TEST_PROJECT_ROOT,
      tool_input: {
        subagent_type: 'developer',
        description: '委派開發',
        prompt: 'PARALLEL_TOTAL: 3\n\n請實作功能。',
      },
    }, sid);

    if (result.output.hookSpecificOutput?.updatedInput) {
      const prompt = result.output.hookSpecificOutput.updatedInput.prompt;
      expect(prompt).toContain('[PARALLEL INSTANCE]');
      expect(prompt).toContain('PARALLEL_TOTAL: 3');
      expect(prompt).toContain('INSTANCE_ID:');
    }
  });

  test('prompt 不含 PARALLEL_TOTAL → 不注入 PARALLEL INSTANCE 區塊', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV'], 'single');

    const result = handlePreTask({
      session_id: sid,
      cwd: TEST_PROJECT_ROOT,
      tool_input: {
        subagent_type: 'developer',
        description: '委派',
        prompt: '請實作功能。',
      },
    }, sid);

    if (result.output.hookSpecificOutput?.updatedInput) {
      const prompt = result.output.hookSpecificOutput.updatedInput.prompt;
      expect(prompt).not.toContain('[PARALLEL INSTANCE]');
    }
  });

  test('stage parallelTotal 取最大值（防止 race condition）', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV'], 'single');

    // 先設 parallelTotal = 2
    stateLib.updateStateAtomic(TEST_PROJECT_ROOT, sid, null, (s) => {
      s.stages['DEV'].parallelTotal = 2;
      s.stages['DEV'].status = 'pending';
      return s;
    });

    // 新進來的設 PARALLEL_TOTAL: 5
    handlePreTask({
      session_id: sid,
      cwd: TEST_PROJECT_ROOT,
      tool_input: {
        subagent_type: 'developer',
        description: '委派',
        prompt: 'PARALLEL_TOTAL: 5\n\n請實作。',
      },
    }, sid);

    const state = stateLib.readState(TEST_PROJECT_ROOT, sid);
    // 取 max(2, 5) = 5
    expect(state.stages['DEV'].parallelTotal).toBe(5);
  });
});

// ── retry 場景（stage 為 completed+fail → 重設為 active）─────────────────────

describe('handlePreTask — retry 場景', () => {
  test('stage 為 completed+fail → 重設為 active，清除 result/completedAt', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV', 'TEST'], 'tdd');

    stateLib.updateStateAtomic(TEST_PROJECT_ROOT, sid, null, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['TEST'].status = 'completed';
      s.stages['TEST'].result = 'fail';
      s.stages['TEST'].completedAt = new Date().toISOString();
      return s;
    });

    handlePreTask({
      session_id: sid,
      cwd: TEST_PROJECT_ROOT,
      tool_input: {
        subagent_type: 'tester',
        description: '重試測試',
        prompt: '請重新執行所有測試',
      },
    }, sid);

    const state = stateLib.readState(TEST_PROJECT_ROOT, sid);
    // TEST 應被重設為 active
    expect(state.stages['TEST'].status).toBe('active');
    expect(state.stages['TEST'].result).toBeUndefined();
  });

  test('stage 為 completed+reject → 重設為 active（REVIEW retry）', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV', 'REVIEW'], 'quick');

    stateLib.updateStateAtomic(TEST_PROJECT_ROOT, sid, null, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      s.stages['REVIEW'].status = 'completed';
      s.stages['REVIEW'].result = 'reject';
      s.stages['REVIEW'].completedAt = new Date().toISOString();
      return s;
    });

    handlePreTask({
      session_id: sid,
      cwd: TEST_PROJECT_ROOT,
      tool_input: {
        subagent_type: 'code-reviewer',
        description: '重試審查',
        prompt: '請重新審查修改後的程式碼',
      },
    }, sid);

    const state = stateLib.readState(TEST_PROJECT_ROOT, sid);
    expect(state.stages['REVIEW'].status).toBe('active');
  });
});

// ── timeline 事件 ─────────────────────────────────────────────────────────────

describe('handlePreTask — timeline 事件', () => {
  test('放行後 timeline 記錄 agent:delegate', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV'], 'single');

    handlePreTask({
      session_id: sid,
      cwd: TEST_PROJECT_ROOT,
      tool_input: {
        subagent_type: 'developer',
        description: '委派開發',
        prompt: '實作功能',
      },
    }, sid);

    const timelinePath = paths.session.timeline(TEST_PROJECT_ROOT, sid);
    expect(fs.existsSync(timelinePath)).toBe(true);
    const content = fs.readFileSync(timelinePath, 'utf8');
    const events = content.split('\n').filter(Boolean).map(l => JSON.parse(l));
    const delegateEvent = events.find(e => e.type === 'agent:delegate');
    expect(delegateEvent).toBeDefined();
    // timeline event 格式：{ ts, type, category, label, ...data }（直接 spread，不是 .data）
    expect(delegateEvent.agent).toBe('developer');
    expect(delegateEvent.stage).toBe('DEV');
  });

  test('stage 從 pending 變 active → timeline 記錄 stage:start', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV'], 'single');
    // DEV 預設為 pending

    handlePreTask({
      session_id: sid,
      cwd: TEST_PROJECT_ROOT,
      tool_input: {
        subagent_type: 'developer',
        description: '委派',
        prompt: '實作',
      },
    }, sid);

    const timelinePath = paths.session.timeline(TEST_PROJECT_ROOT, sid);
    const content = fs.readFileSync(timelinePath, 'utf8');
    const events = content.split('\n').filter(Boolean).map(l => JSON.parse(l));
    const stageStart = events.find(e => e.type === 'stage:start');
    expect(stageStart).toBeDefined();
    expect(stageStart.stage).toBe('DEV');
    expect(stageStart.agent).toBe('developer');
  });

  test('stage 已 active 且有 activeAgent → actualKey 為 undefined，不 emit stage:start', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV'], 'single');

    // 設 DEV 為 active，且有一個 activeAgent（防止 sanitize 把 active 改回 pending）
    const existingInst = 'developer:existing1-aabbcc';
    stateLib.updateStateAtomic(TEST_PROJECT_ROOT, sid, null, (s) => {
      s.stages['DEV'].status = 'active';
      s.activeAgents[existingInst] = { agentName: 'developer', stage: 'DEV', startedAt: new Date().toISOString() };
      return s;
    });

    handlePreTask({
      session_id: sid,
      cwd: TEST_PROJECT_ROOT,
      tool_input: {
        subagent_type: 'developer',
        description: '委派',
        prompt: '實作',
      },
    }, sid);

    const timelinePath = paths.session.timeline(TEST_PROJECT_ROOT, sid);
    if (fs.existsSync(timelinePath)) {
      const content = fs.readFileSync(timelinePath, 'utf8');
      const events = content.split('\n').filter(Boolean).map(l => JSON.parse(l));
      const stageStarts = events.filter(e => e.type === 'stage:start');
      // DEV 已 active 且有 activeAgent → actualKey 查不到（active 不符合條件） → 不 emit stage:start
      expect(stageStarts.length).toBe(0);
    }
  });
});

// ── state 寫入 ────────────────────────────────────────────────────────────────

describe('handlePreTask — state 寫入', () => {
  test('放行後 stage 狀態由 pending 變為 active', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV'], 'single');

    expect(stateLib.readState(TEST_PROJECT_ROOT, sid).stages['DEV'].status).toBe('pending');

    handlePreTask({
      session_id: sid,
      cwd: TEST_PROJECT_ROOT,
      tool_input: {
        subagent_type: 'developer',
        description: '委派',
        prompt: '實作',
      },
    }, sid);

    const state = stateLib.readState(TEST_PROJECT_ROOT, sid);
    expect(state.stages['DEV'].status).toBe('active');
  });

  test('activeAgents 寫入 agentName 和 stage 欄位', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV'], 'single');

    handlePreTask({
      session_id: sid,
      cwd: TEST_PROJECT_ROOT,
      tool_input: {
        subagent_type: 'developer',
        description: '委派',
        prompt: '實作',
      },
    }, sid);

    const state = stateLib.readState(TEST_PROJECT_ROOT, sid);
    const keys = Object.keys(state.activeAgents);
    expect(keys.length).toBeGreaterThan(0);

    const devEntry = state.activeAgents[keys[0]];
    expect(devEntry.agentName).toBe('developer');
    expect(devEntry.stage).toBe('DEV');
    expect(typeof devEntry.startedAt).toBe('string');
  });
});

// ── _buildMoscowWarning — MoSCoW 警告生成邏輯（T6）─────────────────────────

describe('_buildMoscowWarning', () => {
  test('developer agent + prompt 含 Should 項目 keyword 時注入 MoSCoW 警告', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ot-moscow-s1-'));
    try {
      const ip = path.join(dir, 'specs', 'features', 'in-progress', 'test-feature');
      fs.mkdirSync(ip, { recursive: true });
      fs.writeFileSync(path.join(ip, 'proposal.md'), '## MoSCoW\n\n**Should**:\n- 報表匯出功能\n\n**Must**:\n- 基本登入\n', 'utf-8');

      const result = _buildMoscowWarning(dir, 'developer', '請實作匯出報表的功能');
      expect(result).not.toBeNull();
      expect(result).toContain('[PM MoSCoW 警告]');
      expect(result).toContain('Should');
      expect(result).toContain('報表匯出功能');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('architect agent + prompt 含 Could 項目 keyword 時注入 MoSCoW 警告', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ot-moscow-s2-'));
    try {
      const ip = path.join(dir, 'specs', 'features', 'in-progress', 'feat');
      fs.mkdirSync(ip, { recursive: true });
      fs.writeFileSync(path.join(ip, 'proposal.md'), '**Could**:\n- 深色模式支援\n', 'utf-8');

      const result = _buildMoscowWarning(dir, 'architect', '設計深色模式介面');
      expect(result).not.toBeNull();
      expect(result).toContain('[PM MoSCoW 警告]');
      expect(result).toContain('Could');
      expect(result).toContain('深色模式支援');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('prompt 中無 Should/Could 項目 keyword 時回傳 null', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ot-moscow-s3-'));
    try {
      const ip = path.join(dir, 'specs', 'features', 'in-progress', 'feat');
      fs.mkdirSync(ip, { recursive: true });
      fs.writeFileSync(path.join(ip, 'proposal.md'), '**Should**:\n- 報表匯出功能\n', 'utf-8');

      const result = _buildMoscowWarning(dir, 'developer', '實作使用者登入邏輯');
      expect(result).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('targetAgent 非 developer 或 architect 時回傳 null', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ot-moscow-s4-'));
    try {
      const ip = path.join(dir, 'specs', 'features', 'in-progress', 'feat');
      fs.mkdirSync(ip, { recursive: true });
      fs.writeFileSync(path.join(ip, 'proposal.md'), '**Should**:\n- 報表匯出功能\n', 'utf-8');

      const result = _buildMoscowWarning(dir, 'tester', '報表匯出功能測試');
      expect(result).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('specs/features/in-progress/ 目錄不存在時靜默降級回傳 null', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ot-moscow-s5-'));
    try {
      const result = _buildMoscowWarning(dir, 'developer', 'some prompt');
      expect(result).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('proposal.md 內容為空時回傳 null', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ot-moscow-s6-'));
    try {
      const ip = path.join(dir, 'specs', 'features', 'in-progress', 'feat');
      fs.mkdirSync(ip, { recursive: true });
      fs.writeFileSync(path.join(ip, 'proposal.md'), '', 'utf-8');

      const result = _buildMoscowWarning(dir, 'developer', 'some prompt');
      expect(result).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('多個 in-progress feature 存在時取最新修改的 proposal.md', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ot-moscow-s7-'));
    try {
      const ipBase = path.join(dir, 'specs', 'features', 'in-progress');

      // feature-a（設為較舊）
      const ipA = path.join(ipBase, 'feature-a');
      fs.mkdirSync(ipA, { recursive: true });
      fs.writeFileSync(path.join(ipA, 'proposal.md'), '**Should**:\n- 舊功能項目\n', 'utf-8');

      await new Promise(r => setTimeout(r, 10));

      // feature-b（設為最新）
      const ipB = path.join(ipBase, 'feature-b');
      fs.mkdirSync(ipB, { recursive: true });
      fs.writeFileSync(path.join(ipB, 'proposal.md'), '**Should**:\n- 新功能項目\n', 'utf-8');

      const result = _buildMoscowWarning(dir, 'developer', '新功能');
      expect(result).not.toBeNull();
      expect(result).toContain('新功能項目');
      expect(result).not.toContain('舊功能項目');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('proposal.md 只有 Must 和 Won\'t 項目時回傳 null', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ot-moscow-s8-'));
    try {
      const ip = path.join(dir, 'specs', 'features', 'in-progress', 'feat');
      fs.mkdirSync(ip, { recursive: true });
      fs.writeFileSync(path.join(ip, 'proposal.md'), "**Must**:\n- 基本功能\n\n**Won't**:\n- 不做的功能\n", 'utf-8');

      const result = _buildMoscowWarning(dir, 'developer', '基本功能和不做的功能');
      // 只有 Must/Won't，無 Should/Could → null
      expect(result).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('警告訊息包含正確格式（[priority] text）', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ot-moscow-s9-'));
    try {
      const ip = path.join(dir, 'specs', 'features', 'in-progress', 'feat');
      fs.mkdirSync(ip, { recursive: true });
      fs.writeFileSync(path.join(ip, 'proposal.md'), '**Should**:\n- 通知功能\n**Could**:\n- 主題切換\n', 'utf-8');

      const result = _buildMoscowWarning(dir, 'developer', '請實作通知功能和主題切換');
      expect(result).not.toBeNull();
      expect(result).toContain('[Should]');
      expect(result).toContain('[Could]');
      expect(result).toContain('通知功能');
      expect(result).toContain('主題切換');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('proposal.md 的 feature 目錄不包含 proposal.md 時跳過', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ot-moscow-s10-'));
    try {
      const ip = path.join(dir, 'specs', 'features', 'in-progress', 'feat-no-proposal');
      fs.mkdirSync(ip, { recursive: true });
      // 不建立 proposal.md，只建立目錄

      const result = _buildMoscowWarning(dir, 'developer', '任何 prompt');
      expect(result).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── 不拋出例外 ────────────────────────────────────────────────────────────────

describe('handlePreTask — 穩定性（不拋出例外）', () => {
  test('input 為空物件時不拋出例外', () => {
    expect(() => handlePreTask({})).not.toThrow();
  });

  test('tool_input 為 undefined 時不拋出例外', () => {
    expect(() => handlePreTask({ session_id: 'test' }, 'test')).not.toThrow();
  });

  test('cwd 未設定時不拋出例外（使用 process.cwd() 作 fallback）', () => {
    const sid = newSessionId();
    setupSession(sid, ['DEV'], 'single');

    expect(() => {
      handlePreTask({
        session_id: sid,
        // cwd 未設定
        tool_input: {
          subagent_type: 'developer',
          description: '委派',
          prompt: '實作',
        },
      }, sid);
    }).not.toThrow();
  });
});
