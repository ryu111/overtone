'use strict';
/**
 * session-spawner.test.js — session-spawner.js 單元測試
 *
 * BDD 覆蓋：Feature 1（Scenario 1-1 到 1-9）
 * 所有測試使用 _deps 注入 mock spawn，不依賴實際 claude CLI。
 */

const { test, expect, describe } = require('bun:test');
const { EventEmitter } = require('events');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');

const { spawnSession, _buildArgs } = require(join(SCRIPTS_LIB, 'session-spawner'));

// ── 工具：建立 mock child process ──

function makeMockChild() {
  const stdout = new EventEmitter();
  const child = {
    pid: 12345,
    stdout,
    _killed: false,
    _killSignal: null,
    _handlers: {},
    kill(signal) {
      this._killed = true;
      this._killSignal = signal;
    },
    on(event, handler) {
      this._handlers[event] = handler;
    },
  };
  return child;
}

/**
 * 建立 mock spawn 函式，回傳固定的 child
 * @param {object} child
 * @returns {Function}
 */
function makeMockSpawn(child) {
  return function mockSpawn(_cmd, _args, _opts) {
    mockSpawn.calls = mockSpawn.calls || [];
    mockSpawn.calls.push({ cmd: _cmd, args: _args, opts: _opts });
    return child;
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Feature 1 — session-spawner.js
// ────────────────────────────────────────────────────────────────────────────

describe('Feature 1: session-spawner.js — Claude Code session 啟動封裝', () => {

  // Scenario 1-1: 成功組裝 claude CLI 參數
  test('Scenario 1-1: _buildArgs 組裝含 --plugin-dir、--output-format、-p 的參數', () => {
    const args = _buildArgs({ cwd: '/proj', pluginDir: '/plugin', timeout: 3600000 });

    expect(args).toContain('-p');
    expect(args).toContain('--plugin-dir');
    expect(args).toContain('/plugin');
    expect(args).toContain('--output-format');
    expect(args).toContain('stream-json');
  });

  // Scenario 1-2: pluginDir 未提供時自動偵測預設值
  test('Scenario 1-2: pluginDir 未提供時回傳參數仍含 --plugin-dir（自動偵測）', () => {
    const args = _buildArgs({ cwd: '/proj' });

    expect(args).toContain('--plugin-dir');

    // 找到 --plugin-dir 後的值
    const idx = args.indexOf('--plugin-dir');
    expect(idx).toBeGreaterThanOrEqual(0);
    const pluginDirValue = args[idx + 1];
    expect(pluginDirValue).toBeTruthy();
    // 自動偵測路徑應包含 plugins/overtone
    expect(pluginDirValue).toContain('plugins/overtone');
  });

  // Scenario 1-3: spawnSession 成功 — stream-json 回傳 success 事件
  test('Scenario 1-3: stream-json success → outcome resolves { status: success, sessionId }', async () => {
    const child = makeMockChild();
    const mockSpawn = makeMockSpawn(child);

    const { outcome } = spawnSession(
      '開始執行 my-feature，workflow: standard',
      { cwd: '/proj', pluginDir: '/plugin', timeout: 5000 },
      { spawn: mockSpawn }
    );

    // 模擬 stream-json success 事件
    process.nextTick(() => {
      child.stdout.emit('data', '{"type":"result","subtype":"success","session_id":"abc-123"}\n');
    });

    const result = await outcome;
    expect(result.status).toBe('success');
    expect(result.sessionId).toBe('abc-123');
  });

  // Scenario 1-4: spawnSession stream-json 回傳 error_max_turns
  test('Scenario 1-4: stream-json error_max_turns → outcome resolves { status: error, errorCode }', async () => {
    const child = makeMockChild();
    const mockSpawn = makeMockSpawn(child);

    const { outcome } = spawnSession(
      'test prompt',
      { cwd: '/proj', pluginDir: '/plugin', timeout: 5000 },
      { spawn: mockSpawn }
    );

    process.nextTick(() => {
      child.stdout.emit('data', '{"type":"result","subtype":"error_max_turns","session_id":"abc-456"}\n');
    });

    const result = await outcome;
    expect(result.status).toBe('error');
    expect(result.sessionId).toBe('abc-456');
    expect(result.errorCode).toBe('error_max_turns');
  });

  // Scenario 1-5: spawnSession stream-json 回傳 error_during_stream
  test('Scenario 1-5: stream-json error_during_stream → outcome resolves { status: error, sessionId: null }', async () => {
    const child = makeMockChild();
    const mockSpawn = makeMockSpawn(child);

    const { outcome } = spawnSession(
      'test prompt',
      { cwd: '/proj', pluginDir: '/plugin', timeout: 5000 },
      { spawn: mockSpawn }
    );

    process.nextTick(() => {
      child.stdout.emit('data', '{"type":"result","subtype":"error_during_stream"}\n');
    });

    const result = await outcome;
    expect(result.status).toBe('error');
    expect(result.sessionId).toBeNull();
    expect(result.errorCode).toBe('error_during_stream');
  });

  // Scenario 1-6: stdout 關閉而未收到 result 事件（crash 情境）
  test('Scenario 1-6: stdout close 未收到 result → outcome resolves { status: crash }', async () => {
    const child = makeMockChild();
    const mockSpawn = makeMockSpawn(child);

    const { outcome } = spawnSession(
      'test prompt',
      { cwd: '/proj', pluginDir: '/plugin', timeout: 5000 },
      { spawn: mockSpawn }
    );

    // 直接 close，不發任何 data
    process.nextTick(() => {
      child.stdout.emit('close');
    });

    const result = await outcome;
    expect(result.status).toBe('crash');
    expect(result.sessionId).toBeNull();
  });

  // Scenario 1-7: spawn timeout 到期
  test('Scenario 1-7: timeout 到期 → outcome resolves { status: timeout }，且 child.kill 被呼叫', async () => {
    const child = makeMockChild();
    const mockSpawn = makeMockSpawn(child);

    // timeout = 50ms（快速觸發）
    const { outcome } = spawnSession(
      'test prompt',
      { cwd: '/proj', pluginDir: '/plugin', timeout: 50 },
      { spawn: mockSpawn }
    );

    // stdout 不 emit 任何事件

    const result = await outcome;
    expect(result.status).toBe('timeout');
    expect(result.sessionId).toBeNull();
    expect(child._killed).toBe(true);
  });

  // Scenario 1-8: stdout 同一 chunk 包含多個 JSON 物件（黏包情境）
  test('Scenario 1-8: 黏包情境 — 一個 chunk 含多個 JSON 行，正確解析 result', async () => {
    const child = makeMockChild();
    const mockSpawn = makeMockSpawn(child);

    const { outcome } = spawnSession(
      'test prompt',
      { cwd: '/proj', pluginDir: '/plugin', timeout: 5000 },
      { spawn: mockSpawn }
    );

    process.nextTick(() => {
      // 一個 chunk 含 init + result 兩筆
      child.stdout.emit('data',
        '{"type":"init","session_id":"s-1"}\n' +
        '{"type":"result","subtype":"success","session_id":"s-1"}\n'
      );
    });

    const result = await outcome;
    expect(result.status).toBe('success');
    expect(result.sessionId).toBe('s-1');
  });

  // Scenario 1-9: 非 darwin 平台
  test('Scenario 1-9: 非 darwin 平台 — spawnSession 正常回傳 { child, outcome } 不拋出例外', () => {
    const child = makeMockChild();
    const mockSpawn = makeMockSpawn(child);

    // spawnSession 不依賴 darwin，不應拋出例外
    let result;
    expect(() => {
      result = spawnSession(
        'test prompt',
        { cwd: '/proj', pluginDir: '/plugin', timeout: 100 },
        { spawn: mockSpawn }
      );
    }).not.toThrow();

    expect(result).toBeTruthy();
    expect(result.child).toBeTruthy();
    expect(result.outcome).toBeInstanceOf(Promise);

    // 清理 timeout
    return result.outcome.catch(() => {});
  });

  // Scenario 1-10: spawned session 設定 OVERTONE_SPAWNED env var
  test('Scenario 1-10: spawn 的 child env 包含 OVERTONE_SPAWNED=1', () => {
    const child = makeMockChild();
    const mockSpawn = makeMockSpawn(child);

    spawnSession('test prompt', { timeout: 50 }, { spawn: mockSpawn });

    expect(mockSpawn.calls).toHaveLength(1);
    const spawnOpts = mockSpawn.calls[0].opts;
    expect(spawnOpts.env).toBeDefined();
    expect(spawnOpts.env.OVERTONE_SPAWNED).toBe('1');

    // 清理
    return child.stdout.emit('close');
  });

  // Scenario 1-11: 敏感 env vars 被過濾
  test('Scenario 1-11: TELEGRAM_BOT_TOKEN 和 TELEGRAM_CHAT_ID 不傳給 child', () => {
    const child = makeMockChild();
    const mockSpawn = makeMockSpawn(child);

    // 設定敏感 env var（測試後還原）
    const origToken = process.env.TELEGRAM_BOT_TOKEN;
    const origChat = process.env.TELEGRAM_CHAT_ID;
    process.env.TELEGRAM_BOT_TOKEN = 'test-secret-token';
    process.env.TELEGRAM_CHAT_ID = 'test-chat-id';

    try {
      spawnSession('test prompt', { timeout: 50 }, { spawn: mockSpawn });

      const spawnOpts = mockSpawn.calls[0].opts;
      expect(spawnOpts.env.TELEGRAM_BOT_TOKEN).toBeUndefined();
      expect(spawnOpts.env.TELEGRAM_CHAT_ID).toBeUndefined();
    } finally {
      // 還原
      if (origToken !== undefined) process.env.TELEGRAM_BOT_TOKEN = origToken;
      else delete process.env.TELEGRAM_BOT_TOKEN;
      if (origChat !== undefined) process.env.TELEGRAM_CHAT_ID = origChat;
      else delete process.env.TELEGRAM_CHAT_ID;
    }

    return child.stdout.emit('close');
  });

  // Scenario 1-12: CLAUDECODE 開頭的環境變數被過濾（防止嵌套 session 偵測誤觸發）
  test('Scenario 1-12: CLAUDECODE_ prefix env vars 不傳給 child', () => {
    const child = makeMockChild();
    const mockSpawn = makeMockSpawn(child);

    const origKeys = {};
    const testVars = {
      CLAUDECODE_SESSION_ID: 'test-session-id',
      CLAUDECODEPID: '99999',
    };
    for (const [k, v] of Object.entries(testVars)) {
      origKeys[k] = process.env[k];
      process.env[k] = v;
    }
    // 確保非 CLAUDECODE 的 env 不被過濾
    const origPath = process.env.PATH;

    try {
      spawnSession('test prompt', { timeout: 50 }, { spawn: mockSpawn });

      const spawnOpts = mockSpawn.calls[0].opts;
      expect(spawnOpts.env.CLAUDECODE_SESSION_ID).toBeUndefined();
      expect(spawnOpts.env.CLAUDECODEPID).toBeUndefined();
      expect(spawnOpts.env.PATH).toBe(origPath);
    } finally {
      for (const [k] of Object.entries(testVars)) {
        if (origKeys[k] !== undefined) process.env[k] = origKeys[k];
        else delete process.env[k];
      }
    }

    return child.stdout.emit('close');
  });
});
