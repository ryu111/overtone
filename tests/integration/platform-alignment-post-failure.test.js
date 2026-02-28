'use strict';
/**
 * platform-alignment-post-failure.test.js
 *
 * Feature 1e: PostToolUseFailure hook（post-use-failure.js）
 * BDD 規格：specs/features/in-progress/platform-alignment-phase1/bdd.md
 *
 * 策略：使用 Bun.spawnSync 啟動真實子進程，驗證 hook 端到端行為。
 */

const { describe, test, expect, afterAll } = require('bun:test');
const { join } = require('path');
const { mkdirSync, rmSync, readFileSync } = require('fs');
const { HOOKS_DIR, SCRIPTS_LIB } = require('../helpers/paths');

const HOOK_PATH = join(HOOKS_DIR, 'tool', 'post-use-failure.js');
const paths = require(join(SCRIPTS_LIB, 'paths'));

// ── Session 管理 ──

const SESSION_PREFIX = `test_post_fail_${Date.now()}`;
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
  if (sessionId) {
    envConfig.CLAUDE_SESSION_ID = sessionId;
  }

  const proc = Bun.spawnSync(['node', HOOK_PATH], {
    stdin: Buffer.from(JSON.stringify(input)),
    env: envConfig,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stdout = proc.stdout ? new TextDecoder().decode(proc.stdout) : '';
  const stderr = proc.stderr ? new TextDecoder().decode(proc.stderr) : '';

  return {
    exitCode: proc.exitCode,
    stdout,
    stderr,
    parsed: (() => { try { return JSON.parse(stdout); } catch { return null; } })(),
  };
}

function initSessionDir(sessionId) {
  mkdirSync(paths.sessionDir(sessionId), { recursive: true });
}

function readTimeline(sessionId) {
  try {
    const content = readFileSync(paths.session.timeline(sessionId), 'utf8');
    return content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  } catch {
    return [];
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Feature 1e: PostToolUseFailure hook
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 1e: PostToolUseFailure hook（post-use-failure.js）', () => {

  // Scenario 1e-1: Task 工具失敗時 emit tool:failure 並注入 systemMessage
  describe('Scenario 1e-1: Task 工具失敗時 emit tool:failure + systemMessage', () => {
    test('timeline.jsonl 新增 tool:failure 事件', () => {
      const sessionId = newSessionId();
      initSessionDir(sessionId);

      runHook({
        session_id: sessionId,
        tool_name: 'Task',
        error: 'agent not found: ot:unknown-agent',
        is_interrupt: false,
      }, sessionId);

      const events = readTimeline(sessionId);
      const failureEvent = events.find(e => e.type === 'tool:failure');
      expect(failureEvent).toBeDefined();
    });

    test('tool:failure 事件包含 toolName: Task', () => {
      const sessionId = newSessionId();
      initSessionDir(sessionId);

      runHook({
        session_id: sessionId,
        tool_name: 'Task',
        error: 'agent not found',
        is_interrupt: false,
      }, sessionId);

      const events = readTimeline(sessionId);
      const failureEvent = events.find(e => e.type === 'tool:failure');
      // timeline.emit 將 data 欄位 spread 至頂層
      expect(failureEvent.toolName).toBe('Task');
    });

    test('tool:failure 事件包含 error 欄位', () => {
      const sessionId = newSessionId();
      initSessionDir(sessionId);

      runHook({
        session_id: sessionId,
        tool_name: 'Task',
        error: 'agent not found: ot:unknown-agent',
        is_interrupt: false,
      }, sessionId);

      const events = readTimeline(sessionId);
      const failureEvent = events.find(e => e.type === 'tool:failure');
      // timeline.emit 將 data 欄位 spread 至頂層
      expect(failureEvent.error).toBeDefined();
    });

    test('stdout 包含 result 欄位（systemMessage 文字）', () => {
      const sessionId = newSessionId();
      initSessionDir(sessionId);

      const { parsed } = runHook({
        session_id: sessionId,
        tool_name: 'Task',
        error: 'agent not found: ot:unknown-agent',
        is_interrupt: false,
      }, sessionId);

      expect(parsed).not.toBeNull();
      expect(typeof parsed.result).toBe('string');
      // Task 失敗時應有 systemMessage（非空字串）
      expect(parsed.result.length).toBeGreaterThan(0);
    });

    test('systemMessage 說明 agent 委派失敗並建議重試', () => {
      const sessionId = newSessionId();
      initSessionDir(sessionId);

      const { parsed } = runHook({
        session_id: sessionId,
        tool_name: 'Task',
        error: 'agent not found',
        is_interrupt: false,
      }, sessionId);

      // systemMessage 應包含 Task 失敗相關說明
      expect(parsed.result).toContain('Task');
    });
  });

  // Scenario 1e-2: Write 工具失敗時 emit tool:failure 並注入 systemMessage
  describe('Scenario 1e-2: Write 工具失敗時 emit + systemMessage', () => {
    test('timeline.jsonl 新增 tool:failure 事件', () => {
      const sessionId = newSessionId();
      initSessionDir(sessionId);

      runHook({
        session_id: sessionId,
        tool_name: 'Write',
        error: 'permission denied: /restricted/path',
        is_interrupt: false,
      }, sessionId);

      const events = readTimeline(sessionId);
      const failureEvent = events.find(e => e.type === 'tool:failure');
      expect(failureEvent).toBeDefined();
      // timeline.emit 將 data 欄位 spread 至頂層
      expect(failureEvent.toolName).toBe('Write');
    });

    test('stdout result 包含 systemMessage（非空）', () => {
      const sessionId = newSessionId();
      initSessionDir(sessionId);

      const { parsed } = runHook({
        session_id: sessionId,
        tool_name: 'Write',
        error: 'permission denied',
        is_interrupt: false,
      }, sessionId);

      expect(parsed.result.length).toBeGreaterThan(0);
    });
  });

  // Scenario 1e-3: Edit 工具失敗時行為相同
  describe('Scenario 1e-3: Edit 工具失敗時 emit + systemMessage', () => {
    test('timeline.jsonl 新增 tool:failure 事件', () => {
      const sessionId = newSessionId();
      initSessionDir(sessionId);

      runHook({
        session_id: sessionId,
        tool_name: 'Edit',
        error: 'file not found',
        is_interrupt: false,
      }, sessionId);

      const events = readTimeline(sessionId);
      const failureEvent = events.find(e => e.type === 'tool:failure');
      expect(failureEvent).toBeDefined();
    });

    test('stdout result 包含 systemMessage（非空）', () => {
      const sessionId = newSessionId();
      initSessionDir(sessionId);

      const { parsed } = runHook({
        session_id: sessionId,
        tool_name: 'Edit',
        error: 'file not found',
        is_interrupt: false,
      }, sessionId);

      expect(parsed.result.length).toBeGreaterThan(0);
    });
  });

  // Scenario 1e-4: Bash 工具失敗時只記錄不注入 systemMessage
  describe('Scenario 1e-4: Bash 工具失敗時只記錄不注入 systemMessage', () => {
    test('timeline.jsonl 新增 tool:failure 事件', () => {
      const sessionId = newSessionId();
      initSessionDir(sessionId);

      runHook({
        session_id: sessionId,
        tool_name: 'Bash',
        error: 'command not found: xyz',
        is_interrupt: false,
      }, sessionId);

      const events = readTimeline(sessionId);
      const failureEvent = events.find(e => e.type === 'tool:failure');
      expect(failureEvent).toBeDefined();
    });

    test('stdout result 為空字串（不注入 systemMessage）', () => {
      const sessionId = newSessionId();
      initSessionDir(sessionId);

      const { parsed } = runHook({
        session_id: sessionId,
        tool_name: 'Bash',
        error: 'command not found',
        is_interrupt: false,
      }, sessionId);

      expect(parsed.result).toBe('');
    });
  });

  // Scenario 1e-5: 其他工具失敗時只記錄 Instinct 不 emit timeline
  describe('Scenario 1e-5: Grep 工具失敗時只記錄 Instinct 不 emit timeline', () => {
    test('stdout result 為空字串', () => {
      const sessionId = newSessionId();
      initSessionDir(sessionId);

      const { parsed } = runHook({
        session_id: sessionId,
        tool_name: 'Grep',
        error: 'pattern not found',
        is_interrupt: false,
      }, sessionId);

      expect(parsed.result).toBe('');
    });

    test('timeline.jsonl 不新增 tool:failure 事件（Grep 只記 Instinct）', () => {
      const sessionId = newSessionId();
      initSessionDir(sessionId);

      runHook({
        session_id: sessionId,
        tool_name: 'Grep',
        error: 'pattern not found',
        is_interrupt: false,
      }, sessionId);

      const events = readTimeline(sessionId);
      const failureEvent = events.find(e => e.type === 'tool:failure');
      // Grep 不屬於 CRITICAL_TOOLS 或 Bash，不 emit timeline
      expect(failureEvent).toBeUndefined();
    });
  });

  // Scenario 1e-6: is_interrupt=true 時不記錄
  describe('Scenario 1e-6: is_interrupt=true 時跳過所有記錄', () => {
    test('is_interrupt=true 時 stdout 輸出 { result: "" }', () => {
      const sessionId = newSessionId();
      initSessionDir(sessionId);

      const { parsed } = runHook({
        session_id: sessionId,
        tool_name: 'Task',
        error: 'interrupted',
        is_interrupt: true,
      }, sessionId);

      expect(parsed.result).toBe('');
    });

    test('is_interrupt=true 時 timeline.jsonl 不新增事件', () => {
      const sessionId = newSessionId();
      initSessionDir(sessionId);

      runHook({
        session_id: sessionId,
        tool_name: 'Task',
        error: 'interrupted',
        is_interrupt: true,
      }, sessionId);

      const events = readTimeline(sessionId);
      expect(events.length).toBe(0);
    });
  });

  // Scenario 1e-8: 無 sessionId 時靜默退出
  describe('Scenario 1e-8: 無 sessionId 時靜默退出', () => {
    test('無 session_id 時輸出 { result: "" }', () => {
      const { exitCode, parsed } = runHook(
        { tool_name: 'Task', error: 'some error', is_interrupt: false },
        undefined
      );
      expect(exitCode).toBe(0);
      expect(parsed.result).toBe('');
    });
  });

  // Scenario 1e-9: stdin 為畸形 JSON 時安全退出
  describe('Scenario 1e-9: 畸形 JSON 時安全退出', () => {
    test('畸形 JSON 時輸出 { result: "" } 且 exit 0', () => {
      const envConfig = {
        ...process.env,
        OVERTONE_NO_DASHBOARD: '1',
      };
      delete envConfig.CLAUDE_SESSION_ID;

      const proc = Bun.spawnSync(['node', HOOK_PATH], {
        stdin: Buffer.from('{broken json'),
        env: envConfig,
        stdout: 'pipe',
        stderr: 'pipe',
      });

      const stdout = proc.stdout ? new TextDecoder().decode(proc.stdout) : '';
      const parsed = (() => { try { return JSON.parse(stdout); } catch { return null; } })();

      expect(proc.exitCode).toBe(0);
      expect(parsed).not.toBeNull();
      expect(parsed.result).toBe('');
    });
  });

  // Scenario 1e-10: hooks.json 包含 PostToolUseFailure hook
  describe('Scenario 1e-10: hooks.json 包含 PostToolUseFailure hook', () => {
    test('找到 event 為 PostToolUseFailure 的 hook 設定', () => {
      const hooksJsonPath = join(HOOKS_DIR, '..', 'hooks.json');
      const content = readFileSync(hooksJsonPath, 'utf8');
      const config = JSON.parse(content);
      const failureHook = config.hooks.find(h => h.event === 'PostToolUseFailure');
      expect(failureHook).toBeDefined();
      expect(failureHook.type).toBe('command');
      expect(failureHook.command).toContain('post-use-failure.js');
    });
  });

  // Scenario 1e-12: 任何例外都 fallback 到空 result
  describe('Scenario 1e-12: 例外時 fallback 到 { result: "" }', () => {
    test('exit code 永遠為 0', () => {
      const envConfig = {
        ...process.env,
        OVERTONE_NO_DASHBOARD: '1',
      };
      delete envConfig.CLAUDE_SESSION_ID;

      const proc = Bun.spawnSync(['node', HOOK_PATH], {
        stdin: Buffer.from('null'),
        env: envConfig,
        stdout: 'pipe',
        stderr: 'pipe',
      });

      expect(proc.exitCode).toBe(0);
    });
  });
});
