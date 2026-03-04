'use strict';
/**
 * hook-timing.test.js — Hook 執行計時單元測試
 *
 * 覆蓋：
 *   Feature 1: registry 中 hook:timing 事件定義正確
 *   Feature 2: post-use.js 在正常路徑 emit hook:timing 事件
 *   Feature 3: post-use.js 在 errorGuard 路徑 emit hook:timing（含 errorGuard: true）
 *   Feature 4: on-session-end.js emit hook:timing 事件
 *   Feature 5: hook:timing 事件結構（timeline.emit 直接呼叫驗證）
 *
 * 策略：
 *   - Feature 1: 直接測試 registry timelineEvents 定義
 *   - Feature 2-4: 以子進程執行 hook 腳本，讀取 timeline JSONL 驗證事件寫入
 *   - Feature 5: 直接呼叫 timeline.emit 驗證事件結構
 */

const { describe, test, expect, beforeAll, afterAll } = require('bun:test');
const { spawnSync } = require('child_process');
const { join } = require('path');
const fs = require('fs');
const os = require('os');
const { homedir } = require('os');

const { SCRIPTS_LIB, HOOKS_DIR } = require('../helpers/paths');

// ── Feature 1: registry hook:timing 定義 ──────────────────────────────────

describe('Feature 1: registry 中 hook:timing 事件定義', () => {
  const { timelineEvents } = require(join(SCRIPTS_LIB, 'registry'));

  test('hook:timing 事件存在於 timelineEvents', () => {
    expect(timelineEvents['hook:timing']).toBeDefined();
  });

  test('hook:timing 事件有正確的 label 和 category', () => {
    const def = timelineEvents['hook:timing'];
    expect(def.label).toBe('Hook 計時');
    expect(def.category).toBe('hook');
  });
});

// ── Feature 5: timeline.emit 直接呼叫驗證事件結構 ─────────────────────────

describe('Feature 5: hook:timing 事件結構（timeline.emit 直接呼叫）', () => {
  const timeline = require(join(SCRIPTS_LIB, 'timeline'));
  const paths = require(join(SCRIPTS_LIB, 'paths'));

  // 使用固定 prefix 讓 afterAll 能精確清理
  const sid = 'hook-timing-struct-' + Date.now().toString(36);

  afterAll(() => {
    const dir = paths.sessionDir(sid);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('emit hook:timing → 事件寫入 timeline.jsonl 且包含必要欄位', () => {
    const startTime = Date.now();

    // 確保 session 目錄存在
    fs.mkdirSync(paths.sessionDir(sid), { recursive: true });

    const evt = timeline.emit(sid, 'hook:timing', {
      hook: 'test-hook',
      event: 'TestEvent',
      durationMs: 42,
    });

    // 驗證回傳的事件物件結構
    expect(evt.type).toBe('hook:timing');
    expect(evt.category).toBe('hook');
    expect(evt.label).toBe('Hook 計時');
    expect(evt.hook).toBe('test-hook');
    expect(evt.event).toBe('TestEvent');
    expect(evt.durationMs).toBe(42);
    expect(typeof evt.ts).toBe('string');

    // 驗證事件確實寫入 JSONL
    const timelinePath = paths.session.timeline(sid);
    expect(fs.existsSync(timelinePath)).toBe(true);
    const lines = fs.readFileSync(timelinePath, 'utf8').split('\n').filter(Boolean);
    const parsedEvents = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const timingEvt = parsedEvents.find((e) => e.type === 'hook:timing' && e.hook === 'test-hook');
    expect(timingEvt).toBeDefined();
    expect(timingEvt.durationMs).toBe(42);
  });
});

// ── 子進程輔助工具 ─────────────────────────────────────────────────────────

/**
 * 建立 overtone session 目錄（寫到真實的 ~/.overtone/sessions/<sid>/）
 * 回傳 sessionId 和清理函式
 */
function createSession(prefix = 'hook-timing-test') {
  const sid = prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const paths = require(join(SCRIPTS_LIB, 'paths'));
  fs.mkdirSync(paths.sessionDir(sid), { recursive: true });
  return sid;
}

function deleteSession(sid) {
  const paths = require(join(SCRIPTS_LIB, 'paths'));
  const dir = paths.sessionDir(sid);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * 執行 hook 腳本（子進程），傳入 stdin JSON
 * 回傳 { stdout, stderr, exitCode, timingEvents }
 */
function runHook(hookPath, stdinData) {
  const result = spawnSync('node', [hookPath], {
    input: JSON.stringify(stdinData),
    encoding: 'utf8',
    timeout: 10000,
    env: {
      ...process.env,
      OVERTONE_NO_DASHBOARD: '1',
    },
  });

  // 讀取 timeline JSONL（路徑由 paths.js 決定）
  const paths = require(join(SCRIPTS_LIB, 'paths'));
  const timelinePath = paths.session.timeline(stdinData.session_id || '');
  let timingEvents = [];
  if (stdinData.session_id && fs.existsSync(timelinePath)) {
    const lines = fs.readFileSync(timelinePath, 'utf8').split('\n').filter(Boolean);
    timingEvents = lines.map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter((e) => e && e.type === 'hook:timing');
  }

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status,
    timingEvents,
  };
}

// ── Feature 2: post-use.js 正常路徑計時 ───────────────────────────────────

describe('Feature 2: post-use.js 正常路徑 emit hook:timing', () => {
  let sid;

  beforeAll(() => { sid = createSession('post-use-normal'); });
  afterAll(() => { deleteSession(sid); });

  test('正常 Bash 工具執行 → 寫入 hook:timing 事件', () => {
    const hookPath = join(HOOKS_DIR, 'tool', 'post-use.js');
    const stdinData = {
      session_id: sid,
      tool_name: 'Bash',
      tool_input: { command: 'ls /tmp' },
      tool_response: { exit_code: 0, stdout: 'file.txt', stderr: '' },
    };

    const { exitCode, timingEvents } = runHook(hookPath, stdinData);

    expect(exitCode).toBe(0);
    expect(timingEvents.length).toBeGreaterThanOrEqual(1);

    const evt = timingEvents[timingEvents.length - 1];
    expect(evt.hook).toBe('post-use');
    expect(evt.event).toBe('PostToolUse');
    expect(typeof evt.durationMs).toBe('number');
    expect(evt.durationMs).toBeGreaterThanOrEqual(0);
    expect(evt.toolName).toBe('Bash');
  });

  test('hook:timing 事件包含 ts / type / category / label 標準欄位', () => {
    const hookPath = join(HOOKS_DIR, 'tool', 'post-use.js');
    const sid2 = createSession('post-use-meta');

    try {
      const stdinData = {
        session_id: sid2,
        tool_name: 'Read',
        tool_input: { file_path: '/tmp/test.txt' },
        tool_response: { content: 'hello' },
      };

      const { timingEvents } = runHook(hookPath, stdinData);

      expect(timingEvents.length).toBeGreaterThanOrEqual(1);
      const evt = timingEvents[timingEvents.length - 1];
      expect(typeof evt.ts).toBe('string');
      expect(evt.type).toBe('hook:timing');
      expect(evt.category).toBe('hook');
      expect(typeof evt.label).toBe('string');
    } finally {
      deleteSession(sid2);
    }
  });
});

// ── Feature 3: post-use.js errorGuard 路徑計時 ────────────────────────────

describe('Feature 3: post-use.js errorGuard 路徑 emit hook:timing', () => {
  let sid;

  beforeAll(() => { sid = createSession('post-use-errguard'); });
  afterAll(() => { deleteSession(sid); });

  test('重大 Bash 錯誤（bun exit 1）→ hook:timing 含 errorGuard: true', () => {
    const hookPath = join(HOOKS_DIR, 'tool', 'post-use.js');
    const stdinData = {
      session_id: sid,
      tool_name: 'Bash',
      tool_input: { command: 'bun run build' },
      tool_response: {
        exit_code: 1,
        stdout: '',
        // 需要 >20 字元的 stderr 才觸發 errorGuard
        stderr: 'error: Cannot find module "missing-pkg" — build failed with significant errors',
      },
    };

    const { timingEvents } = runHook(hookPath, stdinData);

    expect(timingEvents.length).toBeGreaterThanOrEqual(1);
    const evt = timingEvents[timingEvents.length - 1];
    expect(evt.errorGuard).toBe(true);
  });
});

// ── Feature 4: on-session-end.js emit hook:timing ─────────────────────────

describe('Feature 4: on-session-end.js emit hook:timing', () => {
  let sid;

  beforeAll(() => {
    sid = createSession('session-end-timing');
    // 建立 loop.json（stopped: true 避免 emit session:end 觸發額外邏輯）
    const paths = require(join(SCRIPTS_LIB, 'paths'));
    fs.writeFileSync(paths.session.loop(sid), JSON.stringify({ stopped: true }));
  });

  afterAll(() => { deleteSession(sid); });

  test('SessionEnd → 寫入 hook:timing 事件', () => {
    const hookPath = join(HOOKS_DIR, 'session', 'on-session-end.js');
    const stdinData = {
      session_id: sid,
      reason: 'clear',
      cwd: join(homedir(), 'projects', 'test'),
    };

    const { exitCode, timingEvents } = runHook(hookPath, stdinData);

    expect(exitCode).toBe(0);
    expect(timingEvents.length).toBeGreaterThanOrEqual(1);

    const evt = timingEvents[timingEvents.length - 1];
    expect(evt.hook).toBe('on-session-end');
    expect(evt.event).toBe('SessionEnd');
    expect(typeof evt.durationMs).toBe('number');
    expect(evt.durationMs).toBeGreaterThanOrEqual(0);
  });
});
