'use strict';
/**
 * feedback-loop.test.js — 回饋閉環整合測試
 *
 * 測試 pre-task.js 注入 score context 和 on-session-end.js 執行 decay 的端到端行為：
 *   Feature 1: pre-task.js 在有分數時輸出包含 score context
 *   Feature 2: on-session-end.js 執行 instinct decay（靜默不報錯）
 */
const { test, expect, describe, afterAll } = require('bun:test');
const { mkdirSync, rmSync, appendFileSync, existsSync, readFileSync } = require('fs');
const { join } = require('path');
const os = require('os');
const { HOOKS_DIR, SCRIPTS_LIB } = require('../helpers/paths');

// ── 路徑設定 ──

const PRE_TASK_HOOK = join(HOOKS_DIR, 'tool', 'pre-task.js');
const SESSION_END_HOOK = join(HOOKS_DIR, 'session', 'on-session-end.js');

const paths = require(join(SCRIPTS_LIB, 'paths'));
const state = require(join(SCRIPTS_LIB, 'state'));
const scoreEngine = require(join(SCRIPTS_LIB, 'score-engine'));
const { workflows } = require(join(SCRIPTS_LIB, 'registry'));

// ── 輔助函式 ──

/**
 * 執行 pre-task.js hook，回傳解析後的 JSON 輸出
 */
async function runPreTask(input, sessionId) {
  const envConfig = sessionId !== undefined
    ? { ...process.env, CLAUDE_SESSION_ID: sessionId }
    : (() => { const e = { ...process.env }; delete e.CLAUDE_SESSION_ID; return e; })();

  const proc = Bun.spawn(['node', PRE_TASK_HOOK], {
    stdin: Buffer.from(JSON.stringify(input)),
    env: envConfig,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const output = await new Response(proc.stdout).text();
  await proc.exited;
  return JSON.parse(output);
}

/**
 * 執行 on-session-end.js hook，回傳輸出和 exit code
 */
async function runSessionEnd(input, sessionId) {
  const envConfig = sessionId !== undefined
    ? { ...process.env, CLAUDE_SESSION_ID: sessionId }
    : (() => { const e = { ...process.env }; delete e.CLAUDE_SESSION_ID; return e; })();

  const proc = Bun.spawn(['node', SESSION_END_HOOK], {
    stdin: Buffer.from(JSON.stringify(input)),
    env: envConfig,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const output = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { output, stderr, exitCode };
}

// ── 各測試的獨立 sessionId 和 projectRoot ──

const SESSION_PREFIX = `test_fl_${Date.now()}`;
let testCounter = 0;

function newSessionId() {
  return `${SESSION_PREFIX}_${++testCounter}`;
}

function makeTmpProject(label = '') {
  const dir = join(os.tmpdir(), `ot-fl-it-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ── 清理所有測試 session ──

const createdSessions = [];
const createdProjects = [];

afterAll(() => {
  for (const sid of createdSessions) {
    const dir = paths.sessionDir(sid);
    rmSync(dir, { recursive: true, force: true });
  }
  for (const proj of createdProjects) {
    rmSync(proj, { recursive: true, force: true });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Feature 1: pre-task.js 在有 DEV 分數時，updatedInput.prompt 含 score context
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 1: pre-task.js 注入 score context', () => {
  test('Scenario 1-1: DEV stage 有歷史分數時，updatedInput.prompt 含品質歷史', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);
    const tmpProject = makeTmpProject('scores');
    createdProjects.push(tmpProject);

    // 初始化 quick workflow
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    const quickWorkflow = workflows['quick'];
    state.initState(sessionId, 'quick', quickWorkflow.stages);

    // 寫入 DEV 分數記錄
    const record = {
      ts: new Date().toISOString(),
      sessionId: 'prev_session',
      workflowType: 'quick',
      stage: 'DEV',
      agent: 'developer',
      scores: { clarity: 4, completeness: 3, actionability: 5 },
      overall: 4.0,
    };
    scoreEngine.saveScore(tmpProject, record);

    const input = {
      tool_input: {
        subagent_type: 'developer',
        description: 'delegate to developer',
        prompt: '實作新功能',
      },
      cwd: tmpProject,
    };

    const result = await runPreTask(input, sessionId);

    // 應該通過且有 updatedInput
    const hookOutput = result.hookSpecificOutput;
    expect(hookOutput).toBeDefined();
    expect(hookOutput.permissionDecision).toBe('allow');
    expect(hookOutput.updatedInput).toBeDefined();
    expect(hookOutput.updatedInput.prompt).toContain('[品質歷史 — developer@DEV（1 筆）]');
    expect(hookOutput.updatedInput.prompt).toContain('clarity: 4.00/5.0');
    expect(hookOutput.updatedInput.prompt).toContain('completeness: 3.00/5.0');
    expect(hookOutput.updatedInput.prompt).toContain('actionability: 5.00/5.0');
  });

  test('Scenario 1-2: 無分數時，prompt 不含品質歷史', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);
    const tmpProject = makeTmpProject('no-scores');
    createdProjects.push(tmpProject);

    // 初始化 quick workflow
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    const quickWorkflow = workflows['quick'];
    state.initState(sessionId, 'quick', quickWorkflow.stages);

    const input = {
      tool_input: {
        subagent_type: 'developer',
        description: 'delegate to developer',
        prompt: '實作新功能',
      },
      cwd: tmpProject,
    };

    const result = await runPreTask(input, sessionId);

    // 允許通過（可能有或沒有 updatedInput，但不含品質歷史）
    const hookOutput = result.hookSpecificOutput;
    if (hookOutput && hookOutput.updatedInput) {
      expect(hookOutput.updatedInput.prompt).not.toContain('[品質歷史');
    } else {
      // 無 updatedInput 也表示沒有注入 score context
      expect(result.result).toBeDefined();
    }
  });

  test('Scenario 1-3: score context 不影響 subagent_type 欄位', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);
    const tmpProject = makeTmpProject('preserve-fields');
    createdProjects.push(tmpProject);

    // 初始化 quick workflow
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    const quickWorkflow = workflows['quick'];
    state.initState(sessionId, 'quick', quickWorkflow.stages);

    // 寫入分數
    scoreEngine.saveScore(tmpProject, {
      ts: new Date().toISOString(),
      sessionId: 'prev_session',
      workflowType: 'quick',
      stage: 'DEV',
      agent: 'developer',
      scores: { clarity: 3, completeness: 3, actionability: 3 },
      overall: 3.0,
    });

    const input = {
      tool_input: {
        subagent_type: 'developer',
        description: 'delegate to developer',
        prompt: '實作新功能',
      },
      cwd: tmpProject,
    };

    const result = await runPreTask(input, sessionId);

    const hookOutput = result.hookSpecificOutput;
    if (hookOutput && hookOutput.updatedInput) {
      // 重要：subagent_type 不應被移除
      expect(hookOutput.updatedInput.subagent_type).toBe('developer');
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Feature 2: on-session-end.js 執行 instinct decay 不報錯
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 2: on-session-end.js 執行 instinct decay', () => {
  test('Scenario 2-1: 有 sessionId 的 session 執行結束時 exitCode 為 0', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    // 建立 session 目錄（模擬 session 存在）
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });

    const input = { reason: 'other' };

    const { output, exitCode } = await runSessionEnd(input, sessionId);

    expect(exitCode).toBe(0);

    // 輸出應為合法 JSON
    const parsed = JSON.parse(output);
    expect(parsed).toBeDefined();
  });

  test('Scenario 2-2: session 有 instinct 觀察時，decay 執行後仍成功退出', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    // 建立 session 目錄
    const sessionDir = paths.sessionDir(sessionId);
    mkdirSync(sessionDir, { recursive: true });

    // 寫入一筆最近的 instinct 觀察（信心 0.5，最近更新）
    const obsPath = paths.session.observations(sessionId);
    const obs = {
      id: `inst_${Date.now().toString(36)}_abcd`,
      ts: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      type: 'tool_preferences',
      trigger: '測試觸發條件',
      action: '測試建議行動',
      tag: 'test-tag',
      confidence: 0.5,
      count: 1,
    };
    appendFileSync(obsPath, JSON.stringify(obs) + '\n', 'utf8');

    const input = { reason: 'other' };

    const { output, exitCode } = await runSessionEnd(input, sessionId);

    expect(exitCode).toBe(0);

    const parsed = JSON.parse(output);
    expect(parsed).toBeDefined();
  });

  test('Scenario 2-3: 無 sessionId 時 decay 不執行，hook 直接返回', async () => {
    const input = { reason: 'other' };

    const envConfig = (() => {
      const e = { ...process.env };
      delete e.CLAUDE_SESSION_ID;
      return e;
    })();

    const proc = Bun.spawn(['node', SESSION_END_HOOK], {
      stdin: Buffer.from(JSON.stringify(input)),
      env: envConfig,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);

    const parsed = JSON.parse(output);
    expect(parsed).toBeDefined();
  });
});
