'use strict';
/**
 * platform-alignment-session-end.test.js
 *
 * Feature 1d: SessionEnd hook（on-session-end.js）
 * BDD 規格：specs/features/in-progress/platform-alignment-phase1/bdd.md
 *
 * 策略：使用 Bun.spawnSync 啟動真實子進程，驗證 hook 端到端行為。
 */

const { describe, test, expect, afterAll } = require('bun:test');
const { join } = require('path');
const { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } = require('fs');
const { HOOKS_DIR, SCRIPTS_LIB } = require('../helpers/paths');

const HOOK_PATH = join(HOOKS_DIR, 'session', 'on-session-end.js');
const paths = require(join(SCRIPTS_LIB, 'paths'));
const timeline = require(join(SCRIPTS_LIB, 'timeline'));

// ── Session 管理 ──

const SESSION_PREFIX = `test_session_end_${Date.now()}`;
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
  // 刪除既有環境變數
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

function writeLoopJson(sessionId, data) {
  writeFileSync(paths.session.loop(sessionId), JSON.stringify(data, null, 2), 'utf8');
}

function readLoopJson(sessionId) {
  try {
    return JSON.parse(readFileSync(paths.session.loop(sessionId), 'utf8'));
  } catch {
    return null;
  }
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
// Feature 1d: SessionEnd hook
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 1d: SessionEnd hook（on-session-end.js）', () => {

  // Scenario 1d-1: 正常 session 結束時 emit session:end 事件
  describe('Scenario 1d-1: 正常結束時 emit session:end 事件', () => {
    test('timeline.jsonl 新增 session:end 事件', () => {
      const sessionId = newSessionId();
      initSessionDir(sessionId);
      writeLoopJson(sessionId, { stopped: false, iterations: 2 });

      const { exitCode } = runHook(
        { session_id: sessionId, reason: 'prompt_input_exit' },
        sessionId
      );

      expect(exitCode).toBe(0);
      const events = readTimeline(sessionId);
      const sessionEndEvent = events.find(e => e.type === 'session:end');
      expect(sessionEndEvent).toBeDefined();
    });

    test('session:end 事件包含 reason: prompt_input_exit', () => {
      const sessionId = newSessionId();
      initSessionDir(sessionId);
      writeLoopJson(sessionId, { stopped: false });

      runHook({ session_id: sessionId, reason: 'prompt_input_exit' }, sessionId);

      const events = readTimeline(sessionId);
      const sessionEndEvent = events.find(e => e.type === 'session:end');
      expect(sessionEndEvent).toBeDefined();
      // timeline.emit 將 data 欄位 spread 至頂層，reason 直接在事件物件上
      expect(sessionEndEvent.reason).toBe('prompt_input_exit');
    });

    test('session:end 事件包含有效的 ts（ISO 8601 格式）', () => {
      const sessionId = newSessionId();
      initSessionDir(sessionId);
      writeLoopJson(sessionId, { stopped: false });

      runHook({ session_id: sessionId, reason: 'prompt_input_exit' }, sessionId);

      const events = readTimeline(sessionId);
      const sessionEndEvent = events.find(e => e.type === 'session:end');
      expect(sessionEndEvent).toBeDefined();
      // ISO 8601 格式：包含 T 和 Z 或時區偏移
      expect(sessionEndEvent.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  // Scenario 1d-2: emit 後重置 loop.json 為 stopped: true
  describe('Scenario 1d-2: hook 執行後 loop.json stopped 為 true', () => {
    test('loop.json stopped 欄位被設為 true', () => {
      const sessionId = newSessionId();
      initSessionDir(sessionId);
      writeLoopJson(sessionId, { stopped: false, iterations: 3 });

      runHook({ session_id: sessionId, reason: 'prompt_input_exit' }, sessionId);

      const loopData = readLoopJson(sessionId);
      expect(loopData).not.toBeNull();
      expect(loopData.stopped).toBe(true);
    });

    test('loop.json 其他欄位（iterations）不被清除', () => {
      const sessionId = newSessionId();
      initSessionDir(sessionId);
      writeLoopJson(sessionId, { stopped: false, iterations: 5 });

      runHook({ session_id: sessionId, reason: 'prompt_input_exit' }, sessionId);

      const loopData = readLoopJson(sessionId);
      expect(loopData.iterations).toBe(5);
    });
  });

  // Scenario 1d-3: loop.json stopped=true 時跳過 session:end emit
  describe('Scenario 1d-3: stopped=true 時不重複 emit session:end', () => {
    test('loop.json 已為 stopped:true 時不新增 session:end 事件', () => {
      const sessionId = newSessionId();
      initSessionDir(sessionId);
      writeLoopJson(sessionId, { stopped: true });

      runHook({ session_id: sessionId, reason: 'prompt_input_exit' }, sessionId);

      const events = readTimeline(sessionId);
      const sessionEndEvents = events.filter(e => e.type === 'session:end');
      expect(sessionEndEvents.length).toBe(0);
    });
  });

  // Scenario 1d-5: clear reason 正常執行清理
  describe('Scenario 1d-5: clear reason 觸發時正常清理', () => {
    test('reason=clear 時 emit session:end 事件', () => {
      const sessionId = newSessionId();
      initSessionDir(sessionId);
      writeLoopJson(sessionId, { stopped: false });

      runHook({ session_id: sessionId, reason: 'clear' }, sessionId);

      const events = readTimeline(sessionId);
      const sessionEndEvent = events.find(e => e.type === 'session:end');
      expect(sessionEndEvent).toBeDefined();
      // timeline.emit 將 data 欄位 spread 至頂層
      expect(sessionEndEvent.reason).toBe('clear');
    });

    test('reason=clear 時 loop.json 被設為 stopped: true', () => {
      const sessionId = newSessionId();
      initSessionDir(sessionId);
      writeLoopJson(sessionId, { stopped: false });

      runHook({ session_id: sessionId, reason: 'clear' }, sessionId);

      const loopData = readLoopJson(sessionId);
      expect(loopData.stopped).toBe(true);
    });
  });

  // Scenario 1d-6: logout reason 正常執行清理
  describe('Scenario 1d-6: logout reason 觸發時正常清理', () => {
    test('reason=logout 時執行標準清理流程', () => {
      const sessionId = newSessionId();
      initSessionDir(sessionId);
      writeLoopJson(sessionId, { stopped: false });

      const { exitCode, parsed } = runHook(
        { session_id: sessionId, reason: 'logout' },
        sessionId
      );

      expect(exitCode).toBe(0);
      expect(parsed).not.toBeNull();
      expect(typeof parsed.result).toBe('string');
    });
  });

  // Scenario 1d-7: 無 sessionId 時靜默退出
  describe('Scenario 1d-7: 無 sessionId 時靜默退出', () => {
    test('stdin 無 session_id 且無環境變數時輸出 { result: "" }', () => {
      // 不設定 sessionId 環境變數
      const { exitCode, parsed } = runHook(
        { reason: 'prompt_input_exit' },
        undefined
      );
      expect(exitCode).toBe(0);
      expect(parsed.result).toBe('');
    });

    test('process exit code 為 0', () => {
      const { exitCode } = runHook({ reason: 'prompt_input_exit' }, undefined);
      expect(exitCode).toBe(0);
    });
  });

  // Scenario 1d-8: stdin 為畸形 JSON 時安全退出
  describe('Scenario 1d-8: 畸形 JSON 時安全退出', () => {
    test('畸形 JSON 時輸出 { result: "" }', () => {
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

  // Scenario 1d-9: loop.json 不存在時跳過重置並繼續
  describe('Scenario 1d-9: loop.json 不存在時跳過重置', () => {
    test('無 loop.json 時 hook 正常執行不拋錯', () => {
      const sessionId = newSessionId();
      initSessionDir(sessionId);
      // 不建立 loop.json

      const { exitCode, parsed } = runHook(
        { session_id: sessionId, reason: 'prompt_input_exit' },
        sessionId
      );

      expect(exitCode).toBe(0);
      expect(parsed.result).toBe('');
    });

    test('無 loop.json 時 emit session:end 仍正常執行', () => {
      const sessionId = newSessionId();
      initSessionDir(sessionId);
      // 不建立 loop.json（stopped 預設視為 false）

      runHook({ session_id: sessionId, reason: 'prompt_input_exit' }, sessionId);

      // session:end 應仍被 emit（因無 loop.json 等同 stopped=false）
      const events = readTimeline(sessionId);
      const sessionEndEvent = events.find(e => e.type === 'session:end');
      expect(sessionEndEvent).toBeDefined();
    });
  });

  // Scenario 1d-10: hooks.json 包含 SessionEnd hook
  describe('Scenario 1d-10: hooks.json 包含 SessionEnd hook', () => {
    test('找到 event 為 SessionEnd 的 hook 設定', () => {
      const hooksJsonPath = join(HOOKS_DIR, '..', 'hooks.json');
      const content = readFileSync(hooksJsonPath, 'utf8');
      const config = JSON.parse(content);
      const sessionEndHook = config.hooks.find(h => h.event === 'SessionEnd');
      expect(sessionEndHook).toBeDefined();
      expect(sessionEndHook.type).toBe('command');
      expect(sessionEndHook.command).toContain('on-session-end.js');
    });
  });

  // Scenario 1d-11: 任何例外都 fallback 到空 result
  describe('Scenario 1d-11: 例外時 fallback 到 { result: "" }', () => {
    test('exit code 永遠為 0', () => {
      // 使用畸形 JSON 觸發錯誤路徑
      const envConfig = {
        ...process.env,
        OVERTONE_NO_DASHBOARD: '1',
      };
      delete envConfig.CLAUDE_SESSION_ID;

      const proc = Bun.spawnSync(['node', HOOK_PATH], {
        stdin: Buffer.from('{"broken":'),
        env: envConfig,
        stdout: 'pipe',
        stderr: 'pipe',
      });

      expect(proc.exitCode).toBe(0);
    });
  });
});
