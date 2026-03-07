'use strict';
/**
 * notification.test.js — notification.js 單元測試
 *
 * 對照 BDD Scenarios：
 *   1. 僅 title + message → ok
 *   2. 含 subtitle + sound → ok + 包含 subtitle 和 sound name "Default"
 *   3. 不傳 sound → ok + 不包含 sound name
 *   4. title 缺失 → INVALID_ARGUMENT
 *   5. message 缺失 → INVALID_ARGUMENT
 *   6. title 或 message 非 string → INVALID_ARGUMENT
 *   7. osascript 失敗 → COMMAND_FAILED
 *   8. 非 macOS → UNSUPPORTED_PLATFORM
 */

const { describe, it, expect, afterEach } = require('bun:test');
const { join } = require('path');
const { SCRIPTS_DIR } = require('../helpers/paths');

const NOTIFICATION_MODULE = join(SCRIPTS_DIR, 'os', 'notification');

// ── 平台覆寫工具 ──
let originalPlatformDesc;

function mockPlatform(value) {
  originalPlatformDesc = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value, configurable: true });
}

function restorePlatform() {
  if (originalPlatformDesc) {
    Object.defineProperty(process, 'platform', originalPlatformDesc);
  }
}

// ── sendNotification ──

describe('sendNotification', () => {
  afterEach(() => {
    restorePlatform();
  });

  it('Scenario 1: 僅傳 title 和 message → ok，execSync 包含 display notification', () => {
    mockPlatform('darwin');
    const { sendNotification } = require(NOTIFICATION_MODULE);
    let capturedCmd = '';
    const mockExecSync = (cmd) => { capturedCmd = cmd; return ''; };

    const result = sendNotification(
      { title: '測試標題', message: '測試訊息' },
      { execSync: mockExecSync }
    );

    expect(result.ok).toBe(true);
    expect(capturedCmd).toContain('display notification');
    expect(capturedCmd).toContain('測試訊息');
    expect(capturedCmd).toContain('測試標題');
  });

  it('Scenario 2: 含 subtitle 和 sound → ok，指令包含 subtitle 和 sound name "Default"', () => {
    mockPlatform('darwin');
    const { sendNotification } = require(NOTIFICATION_MODULE);
    let capturedCmd = '';
    const mockExecSync = (cmd) => { capturedCmd = cmd; return ''; };

    const result = sendNotification(
      { title: '標題', message: '內文', subtitle: '副標題', sound: true },
      { execSync: mockExecSync }
    );

    expect(result.ok).toBe(true);
    expect(capturedCmd).toContain('subtitle');
    expect(capturedCmd).toContain('sound name "Default"');
  });

  it('Scenario 3: 不傳 sound（預設 false） → ok，指令不包含 sound name', () => {
    mockPlatform('darwin');
    const { sendNotification } = require(NOTIFICATION_MODULE);
    let capturedCmd = '';
    const mockExecSync = (cmd) => { capturedCmd = cmd; return ''; };

    const result = sendNotification(
      { title: '標題', message: '內文' },
      { execSync: mockExecSync }
    );

    expect(result.ok).toBe(true);
    expect(capturedCmd).not.toContain('sound name');
  });

  it('Scenario 3b: sound 明確設為 false → 指令不包含 sound name', () => {
    mockPlatform('darwin');
    const { sendNotification } = require(NOTIFICATION_MODULE);
    let capturedCmd = '';
    const mockExecSync = (cmd) => { capturedCmd = cmd; return ''; };

    const result = sendNotification(
      { title: '標題', message: '內文', sound: false },
      { execSync: mockExecSync }
    );

    expect(result.ok).toBe(true);
    expect(capturedCmd).not.toContain('sound name');
  });

  it('Scenario 4: title 缺失 → INVALID_ARGUMENT，不呼叫 execSync', () => {
    mockPlatform('darwin');
    const { sendNotification } = require(NOTIFICATION_MODULE);
    let called = false;
    const mockExecSync = () => { called = true; };

    const result = sendNotification(
      { message: '內文' },
      { execSync: mockExecSync }
    );

    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_ARGUMENT');
    expect(result.message).toBeTruthy();
    expect(called).toBe(false);
  });

  it('Scenario 5: message 缺失 → INVALID_ARGUMENT，不呼叫 execSync', () => {
    mockPlatform('darwin');
    const { sendNotification } = require(NOTIFICATION_MODULE);
    let called = false;
    const mockExecSync = () => { called = true; };

    const result = sendNotification(
      { title: '標題' },
      { execSync: mockExecSync }
    );

    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_ARGUMENT');
    expect(result.message).toBeTruthy();
    expect(called).toBe(false);
  });

  it('Scenario 6a: title 為數字（非 string） → INVALID_ARGUMENT', () => {
    mockPlatform('darwin');
    const { sendNotification } = require(NOTIFICATION_MODULE);

    const result = sendNotification(
      { title: 123, message: '內文' }
    );

    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_ARGUMENT');
  });

  it('Scenario 6b: message 為 null → INVALID_ARGUMENT', () => {
    mockPlatform('darwin');
    const { sendNotification } = require(NOTIFICATION_MODULE);

    const result = sendNotification(
      { title: '標題', message: null }
    );

    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_ARGUMENT');
  });

  it('Scenario 7: osascript 失敗 → COMMAND_FAILED', () => {
    mockPlatform('darwin');
    const { sendNotification } = require(NOTIFICATION_MODULE);
    const mockExecSync = () => {
      const err = new Error('osascript: execution error');
      err.status = 1;
      throw err;
    };

    const result = sendNotification(
      { title: '標題', message: '內文' },
      { execSync: mockExecSync }
    );

    expect(result.ok).toBe(false);
    expect(result.error).toBe('COMMAND_FAILED');
    expect(result.message).toBeTruthy();
  });

  it('Scenario 7b: osascript 失敗時不拋出例外', () => {
    mockPlatform('darwin');
    const { sendNotification } = require(NOTIFICATION_MODULE);
    const mockExecSync = () => { throw new Error('failed'); };

    expect(() => sendNotification(
      { title: '標題', message: '內文' },
      { execSync: mockExecSync }
    )).not.toThrow();
  });

  it('Scenario 8: 非 macOS 平台 → UNSUPPORTED_PLATFORM', () => {
    mockPlatform('linux');
    const { sendNotification } = require(NOTIFICATION_MODULE);

    const result = sendNotification({ title: '標題', message: '內文' });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('UNSUPPORTED_PLATFORM');
    expect(result.message).toBe('此功能僅支援 macOS');
  });

  it('Scenario 8b: 非 macOS 時不呼叫任何系統指令', () => {
    mockPlatform('win32');
    const { sendNotification } = require(NOTIFICATION_MODULE);
    let called = false;
    const mockExecSync = () => { called = true; };

    sendNotification({ title: '標題', message: '內文' }, { execSync: mockExecSync });
    expect(called).toBe(false);
  });
});

// ── sanitize 跳脫驗證（透過 sendNotification 間接測試）──

describe('sendNotification — sanitize 跳脫', () => {
  afterEach(() => {
    restorePlatform();
  });

  it('title 含雙引號時應被跳脫為 \\"', () => {
    mockPlatform('darwin');
    const { sendNotification } = require(NOTIFICATION_MODULE);
    let capturedCmd = '';
    const mockExecSync = (cmd) => { capturedCmd = cmd; return ''; };

    sendNotification(
      { title: 'say "hello"', message: '內文' },
      { execSync: mockExecSync }
    );

    // 雙引號應被跳脫
    expect(capturedCmd).toContain('\\"hello\\"');
  });

  it('message 含反斜線時應被跳脫為 \\\\', () => {
    mockPlatform('darwin');
    const { sendNotification } = require(NOTIFICATION_MODULE);
    let capturedCmd = '';
    const mockExecSync = (cmd) => { capturedCmd = cmd; return ''; };

    sendNotification(
      { title: '標題', message: 'path\\to\\file' },
      { execSync: mockExecSync }
    );

    // 反斜線應被雙重跳脫
    expect(capturedCmd).toContain('path\\\\to\\\\file');
  });
});

// ── Module exports 完整性 ──

describe('notification.js module exports', () => {
  it('導出 sendNotification 函式', () => {
    const notification = require(NOTIFICATION_MODULE);
    expect(typeof notification.sendNotification).toBe('function');
  });
});
