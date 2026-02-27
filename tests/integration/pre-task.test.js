'use strict';
/**
 * pre-task.test.js — PreToolUse(Task) hook 整合測試
 *
 * 測試完整的 pre-task.js 流程：
 *   stdin 輸入 → 辨識 agent → 檢查前置 stage → 阻擋或放行
 *
 * 策略：使用 Bun.spawn 啟動真實子進程，驗證端到端行為。
 */

const { test, expect, describe, afterAll } = require('bun:test');
const { mkdirSync, rmSync } = require('fs');
const { join } = require('path');
const { HOOKS_DIR, SCRIPTS_LIB } = require('../helpers/paths');

// ── 路徑設定 ──

const HOOK_PATH = join(HOOKS_DIR, 'tool', 'pre-task.js');

const paths = require(join(SCRIPTS_LIB, 'paths'));
const state = require(join(SCRIPTS_LIB, 'state'));
const { workflows } = require(join(SCRIPTS_LIB, 'registry'));

// ── 輔助函式 ──

/**
 * 執行 pre-task.js hook，回傳解析後的 JSON 輸出
 * @param {object} input - hook 的 stdin 輸入
 * @param {string|undefined} sessionId - CLAUDE_SESSION_ID 環境變數，undefined 代表刪除
 * @returns {Promise<object>} 解析後的 JSON
 */
async function runHook(input, sessionId) {
  const envConfig = sessionId !== undefined
    ? { ...process.env, CLAUDE_SESSION_ID: sessionId }
    : (() => { const e = { ...process.env }; delete e.CLAUDE_SESSION_ID; return e; })();

  const proc = Bun.spawn(['node', HOOK_PATH], {
    stdin: Buffer.from(JSON.stringify(input)),
    env: envConfig,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const output = await new Response(proc.stdout).text();
  await proc.exited;
  return JSON.parse(output);
}

// ── 各測試的獨立 sessionId ──

const SESSION_PREFIX = `test_pre_task_${Date.now()}`;
let testCounter = 0;

function newSessionId() {
  return `${SESSION_PREFIX}_${++testCounter}`;
}

// ── 清理所有測試 session ──

const createdSessions = [];

afterAll(() => {
  for (const sid of createdSessions) {
    const dir = paths.sessionDir(sid);
    rmSync(dir, { recursive: true, force: true });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 1：目標 stage 的前置 stage 已全部完成時允許通過
// ────────────────────────────────────────────────────────────────────────────

describe('場景 1：前置 stage 已完成 → 允許通過', () => {
  test('DEV completed → 委派 code-reviewer → result 為空字串', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    // 初始化 quick workflow（DEV → REVIEW → TEST → RETRO）
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    const stageList = workflows['quick'].stages;
    state.initState(sessionId, 'quick', stageList);

    // 將 DEV 設為 completed
    state.updateStateAtomic(sessionId, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      return s;
    });

    // 以指向 code-reviewer（REVIEW stage）的 prompt 啟動 hook
    const result = await runHook(
      {
        session_id: sessionId,
        tool_name: 'Task',
        tool_input: {
          prompt: '委派 code-reviewer agent: 審查程式碼品質',
        },
      },
      sessionId
    );

    // 允許通過：result 為空字串
    expect(result.result).toBe('');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 2：前置必要 stage 尚未完成時阻擋並回傳警告
// ────────────────────────────────────────────────────────────────────────────

describe('場景 2：前置 stage 未完成 → 阻擋並警告', () => {
  test('DEV pending → 委派 code-reviewer → 阻擋，警告含 DEV stage 名稱', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    // 初始化 quick workflow，DEV 保持 pending（預設）
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    const stageList = workflows['quick'].stages;
    state.initState(sessionId, 'quick', stageList);

    // 以指向 code-reviewer 的 prompt 啟動 hook
    const result = await runHook(
      {
        session_id: sessionId,
        tool_name: 'Task',
        tool_input: {
          prompt: '委派 code-reviewer agent: 審查程式碼',
        },
      },
      sessionId
    );

    // 阻擋：hookSpecificOutput.permissionDecision = 'deny'
    expect(result.hookSpecificOutput).toBeDefined();
    expect(result.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(result.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(typeof result.hookSpecificOutput.permissionDecisionReason).toBe('string');
    expect(result.hookSpecificOutput.permissionDecisionReason.length).toBeGreaterThan(0);

    // 警告訊息應提及被跳過的 stage（DEV）
    expect(result.hookSpecificOutput.permissionDecisionReason).toContain('DEV');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 3：無法辨識的 agent_type 時允許通過
// ────────────────────────────────────────────────────────────────────────────

describe('場景 3：無法辨識的 agent → 允許通過', () => {
  test('完全未知的 agent 描述 → result 為空字串（不阻擋）', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    // 初始化任意 workflow state
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'quick', workflows['quick'].stages);

    // 描述中包含完全未知的 agent 名稱
    const result = await runHook(
      {
        session_id: sessionId,
        tool_name: 'Task',
        tool_input: {
          prompt: '委派 totally-unknown-xyz-agent: 執行某些任務',
        },
      },
      sessionId
    );

    // 無法辨識 → 不阻擋
    expect(result.result).toBe('');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 4：無 session_id 時允許通過
// ────────────────────────────────────────────────────────────────────────────

describe('場景 4：無 session_id → 靜默放行', () => {
  test('stdin 無 session_id 且無環境變數 → result 為空字串', async () => {
    // 不傳 sessionId（刪除環境變數）、stdin 中也無 session_id
    const result = await runHook(
      {
        tool_name: 'Task',
        tool_input: {
          prompt: '委派 code-reviewer agent: 任意任務',
        },
      },
      undefined
    );

    // 無 session → 靜默放行
    expect(result.result).toBe('');
  });
});
