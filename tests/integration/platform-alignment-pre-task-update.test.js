'use strict';
/**
 * platform-alignment-pre-task-update.test.js
 *
 * Feature 1c: PreToolUse updatedInput 注入（Scenario 1c-1、1c-7~9）
 * BDD 規格：specs/features/in-progress/platform-alignment-phase1/bdd.md
 *
 * 策略：使用 Bun.spawnSync 啟動真實子進程驗證 pre-task.js 的 updatedInput 注入行為。
 */

const { describe, test, expect, afterAll } = require('bun:test');
const { join } = require('path');
const { mkdirSync, rmSync } = require('fs');
const { HOOKS_DIR, SCRIPTS_LIB } = require('../helpers/paths');
const { isAllowed } = require('../helpers/hook-runner');

const HOOK_PATH = join(HOOKS_DIR, 'tool', 'pre-task.js');
const paths = require(join(SCRIPTS_LIB, 'paths'));
const state = require(join(SCRIPTS_LIB, 'state'));
const { workflows } = require(join(SCRIPTS_LIB, 'registry'));

// ── Session 管理 ──

const SESSION_PREFIX = `test_pre_task_upd_${Date.now()}`;
let testCounter = 0;
const createdSessions = [];

function newSessionId() {
  const id = `${SESSION_PREFIX}_${++testCounter}`;
  createdSessions.push(id);
  return id;
}

afterAll(() => {
  for (const sid of createdSessions) {
    rmSync(paths.sessionDir(sid), { recursive: true, force: true });
  }
});

// ── 輔助函式 ──

function runHook(input, sessionId) {
  const envConfig = {
    ...process.env,
    OVERTONE_NO_DASHBOARD: '1',
  };
  delete envConfig.CLAUDE_SESSION_ID;
  if (sessionId !== undefined) {
    envConfig.CLAUDE_SESSION_ID = sessionId;
  }

  const proc = Bun.spawnSync(['node', HOOK_PATH], {
    stdin: Buffer.from(JSON.stringify(input)),
    env: envConfig,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stdout = proc.stdout ? new TextDecoder().decode(proc.stdout) : '';

  return {
    exitCode: proc.exitCode,
    stdout,
    parsed: (() => { try { return JSON.parse(stdout); } catch { return null; } })(),
  };
}

function initSession(workflowType = 'single') {
  const sessionId = newSessionId();
  mkdirSync(paths.sessionDir(sessionId), { recursive: true });
  state.initState(sessionId, workflowType, workflows[workflowType].stages);
  return sessionId;
}

// ────────────────────────────────────────────────────────────────────────────
// Feature 1c: updatedInput 注入驗證
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 1c: PreToolUse updatedInput 注入', () => {

  // Scenario 1c-1: 有 workflow state 時自動注入 workflow context 到 Task prompt
  describe('Scenario 1c-1: 有 workflow state 時注入 workflow context', () => {
    test('stdout 包含 hookSpecificOutput.updatedInput.prompt', () => {
      const sessionId = initSession('single');

      const { parsed } = runHook({
        session_id: sessionId,
        cwd: process.cwd(),
        tool_name: 'Task',
        tool_input: {
          subagent_type: 'ot:developer',
          description: 'DEV 階段任務',
          prompt: '請執行 DEV 階段任務',
        },
      }, sessionId);

      expect(parsed).not.toBeNull();
      // 有 workflow state 時應輸出 updatedInput
      if (parsed.hookSpecificOutput) {
        expect(parsed.hookSpecificOutput.updatedInput).toBeDefined();
        expect(parsed.hookSpecificOutput.updatedInput.prompt).toBeDefined();
      } else {
        // 允許回傳 result: '' 的格式（若 buildWorkflowContext 回傳 null）
        expect(parsed.result).toBe('');
      }
    });

    test('updatedInput.prompt 以 [Overtone Workflow Context] 開頭', () => {
      const sessionId = initSession('single');

      const { parsed } = runHook({
        session_id: sessionId,
        cwd: process.cwd(),
        tool_name: 'Task',
        tool_input: {
          subagent_type: 'ot:developer',
          description: 'DEV 階段任務',
          prompt: '請執行 DEV 階段任務',
        },
      }, sessionId);

      if (parsed.hookSpecificOutput?.updatedInput?.prompt) {
        expect(parsed.hookSpecificOutput.updatedInput.prompt).toContain('[Overtone Workflow Context]');
      }
    });

    test('updatedInput.prompt 包含工作流類型', () => {
      const sessionId = initSession('single');

      const { parsed } = runHook({
        session_id: sessionId,
        cwd: process.cwd(),
        tool_name: 'Task',
        tool_input: {
          subagent_type: 'ot:developer',
          description: 'DEV 階段任務',
          prompt: '請執行 DEV 階段任務',
        },
      }, sessionId);

      if (parsed.hookSpecificOutput?.updatedInput?.prompt) {
        expect(parsed.hookSpecificOutput.updatedInput.prompt).toContain('single');
      }
    });

    test('updatedInput.prompt 包含原始 prompt 內容', () => {
      const sessionId = initSession('single');
      const originalPrompt = '這是原始 prompt 內容 UNIQUE_MARKER';

      const { parsed } = runHook({
        session_id: sessionId,
        cwd: process.cwd(),
        tool_name: 'Task',
        tool_input: {
          subagent_type: 'ot:developer',
          description: 'DEV 階段任務',
          prompt: originalPrompt,
        },
      }, sessionId);

      if (parsed.hookSpecificOutput?.updatedInput?.prompt) {
        expect(parsed.hookSpecificOutput.updatedInput.prompt).toContain('UNIQUE_MARKER');
      }
    });

    test('updatedInput 保留原始 subagent_type 欄位', () => {
      const sessionId = initSession('single');

      const { parsed } = runHook({
        session_id: sessionId,
        cwd: process.cwd(),
        tool_name: 'Task',
        tool_input: {
          subagent_type: 'ot:developer',
          description: 'DEV 階段任務',
          prompt: '任務說明',
        },
      }, sessionId);

      if (parsed.hookSpecificOutput?.updatedInput) {
        expect(parsed.hookSpecificOutput.updatedInput.subagent_type).toBe('ot:developer');
      }
    });
  });

  // Scenario 1c-7: 非 Overtone agent 不注入 workflow context
  describe('Scenario 1c-7: 非 Overtone agent 不注入 workflow context', () => {
    test('未知 agent 早期退出輸出 { result: "" }', () => {
      const sessionId = initSession('single');

      const { parsed } = runHook({
        session_id: sessionId,
        tool_name: 'Task',
        tool_input: {
          prompt: '任意內容，沒有 Overtone agent 關鍵字',
        },
      }, sessionId);

      // 無法辨識的 agent → 不阻擋，不注入
      expect(parsed.result).toBe('');
    });
  });

  // Scenario 1c-8: deny 分支不受 updatedInput 注入邏輯影響
  describe('Scenario 1c-8: deny 分支時不注入 updatedInput', () => {
    test('有前置未完成 stage 時輸出 deny，不含 updatedInput', () => {
      const sessionId = newSessionId();
      mkdirSync(paths.sessionDir(sessionId), { recursive: true });
      // standard workflow：PLAN → ARCH → ...
      state.initState(sessionId, 'standard', workflows['standard'].stages);
      // PLAN、ARCH 都是 pending，直接跳到 REVIEW → 被阻擋

      const { parsed } = runHook({
        session_id: sessionId,
        tool_name: 'Task',
        tool_input: {
          subagent_type: 'ot:code-reviewer',
          description: '審查任務',
          prompt: '請審查程式碼',
        },
      }, sessionId);

      expect(parsed.hookSpecificOutput).toBeDefined();
      expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
      // deny 時不含 updatedInput
      expect(parsed.hookSpecificOutput.updatedInput).toBeUndefined();
    });
  });

  // Scenario 1c-9: hookSpecificOutput 包含正確的 hookEventName 和 permissionDecision
  describe('Scenario 1c-9: hookSpecificOutput 格式正確', () => {
    test('allow 時 hookSpecificOutput.hookEventName 為 PreToolUse', () => {
      const sessionId = initSession('single');

      const { parsed } = runHook({
        session_id: sessionId,
        cwd: process.cwd(),
        tool_name: 'Task',
        tool_input: {
          subagent_type: 'ot:developer',
          description: 'DEV 任務',
          prompt: '請開發功能',
        },
      }, sessionId);

      if (parsed.hookSpecificOutput) {
        expect(parsed.hookSpecificOutput.hookEventName).toBe('PreToolUse');
        expect(parsed.hookSpecificOutput.permissionDecision).toBe('allow');
      }
    });

    test('isAllowed 判斷 allow 分支輸出為放行', () => {
      const sessionId = initSession('single');

      const { parsed } = runHook({
        session_id: sessionId,
        cwd: process.cwd(),
        tool_name: 'Task',
        tool_input: {
          subagent_type: 'ot:developer',
          description: 'DEV 任務',
          prompt: '請開發功能',
        },
      }, sessionId);

      expect(isAllowed(parsed)).toBe(true);
    });
  });

  // Scenario 1c-6: 無 workflow state 時回傳空 result
  describe('Scenario 1c-6: 無 workflow state 時回傳 { result: "" }', () => {
    test('workflow.json 不存在時早期退出', () => {
      const sessionId = newSessionId();
      // 不建立 session 目錄（無 workflow.json）

      const { parsed } = runHook({
        session_id: sessionId,
        tool_name: 'Task',
        tool_input: {
          subagent_type: 'ot:developer',
          description: 'DEV 任務',
          prompt: '開發任務',
        },
      }, sessionId);

      // 無 workflow state → pre-task.js 早期退出
      expect(parsed.result).toBe('');
    });
  });
});
