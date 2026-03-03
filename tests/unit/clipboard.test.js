'use strict';
/**
 * clipboard.test.js — clipboard.js 單元測試
 *
 * 對照 specs/features/in-progress/p3-3-system/bdd.md 中的
 * readClipboard / writeClipboard 情境。
 */

const { describe, it, expect, afterEach } = require('bun:test');

// ── 路徑 ──
const CLIPBOARD_MODULE = '../../plugins/overtone/scripts/os/clipboard';

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

// ── Mock deps 工具 ──
function makeExecSyncSuccess(output) {
  return () => output;
}

function makeExecSyncFail(msg) {
  return () => { throw new Error(msg); };
}

// ── readClipboard ──

describe('readClipboard', () => {
  afterEach(() => {
    restorePlatform();
  });

  it('Scenario: 成功讀取剪貼簿內容', () => {
    mockPlatform('darwin');
    const { readClipboard } = require(CLIPBOARD_MODULE);
    const mockDeps = { execSync: makeExecSyncSuccess('Hello, World!') };

    const result = readClipboard(mockDeps);

    expect(result.ok).toBe(true);
    expect(result.content).toBe('Hello, World!');
    expect(typeof result.content).toBe('string');
  });

  it('Scenario: 剪貼簿為空時回傳空字串', () => {
    mockPlatform('darwin');
    const { readClipboard } = require(CLIPBOARD_MODULE);
    const mockDeps = { execSync: makeExecSyncSuccess('') };

    const result = readClipboard(mockDeps);

    expect(result.ok).toBe(true);
    expect(result.content).toBe('');
  });

  it('Scenario: pbpaste 執行失敗時回傳 COMMAND_FAILED', () => {
    mockPlatform('darwin');
    const { readClipboard } = require(CLIPBOARD_MODULE);
    const mockDeps = { execSync: makeExecSyncFail('pbpaste error') };

    const result = readClipboard(mockDeps);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('COMMAND_FAILED');
    expect(result.message).toBeTruthy();
  });

  it('Scenario: pbpaste 失敗時不拋出例外', () => {
    mockPlatform('darwin');
    const { readClipboard } = require(CLIPBOARD_MODULE);
    const mockDeps = { execSync: makeExecSyncFail('some failure') };

    expect(() => readClipboard(mockDeps)).not.toThrow();
  });

  it('Scenario: 非 macOS 平台時回傳 UNSUPPORTED_PLATFORM', () => {
    mockPlatform('linux');
    const { readClipboard } = require(CLIPBOARD_MODULE);

    const result = readClipboard();

    expect(result.ok).toBe(false);
    expect(result.error).toBe('UNSUPPORTED_PLATFORM');
    expect(result.message).toBe('此功能僅支援 macOS');
  });

  it('Scenario: 非 macOS 平台時不呼叫任何系統指令', () => {
    mockPlatform('win32');
    const { readClipboard } = require(CLIPBOARD_MODULE);
    let called = false;
    const mockDeps = { execSync: () => { called = true; } };

    readClipboard(mockDeps);
    expect(called).toBe(false);
  });

  it('Scenario: 非 macOS 平台時不拋出例外', () => {
    mockPlatform('win32');
    const { readClipboard } = require(CLIPBOARD_MODULE);

    expect(() => readClipboard()).not.toThrow();
  });
});

// ── writeClipboard ──

describe('writeClipboard', () => {
  afterEach(() => {
    restorePlatform();
  });

  it('Scenario: 成功寫入文字到剪貼簿', () => {
    mockPlatform('darwin');
    const { writeClipboard } = require(CLIPBOARD_MODULE);
    const mockDeps = { execSync: makeExecSyncSuccess('') };

    const result = writeClipboard('測試文字', mockDeps);

    expect(result.ok).toBe(true);
  });

  it('Scenario: 成功寫入時 execSync 收到正確的 input 參數', () => {
    mockPlatform('darwin');
    const { writeClipboard } = require(CLIPBOARD_MODULE);
    let capturedCmd, capturedOpts;
    const mockExecSync = (cmd, opts) => { capturedCmd = cmd; capturedOpts = opts; return ''; };

    writeClipboard('測試文字', { execSync: mockExecSync });

    expect(capturedCmd).toBe('pbcopy');
    expect(capturedOpts).toEqual({ input: '測試文字' });
  });

  it('Scenario: text 為數字時回傳 INVALID_ARGUMENT', () => {
    mockPlatform('darwin');
    const { writeClipboard } = require(CLIPBOARD_MODULE);

    const result = writeClipboard(123);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_ARGUMENT');
    expect(result.message).toBeTruthy();
  });

  it('Scenario: text 為 null 時回傳 INVALID_ARGUMENT', () => {
    mockPlatform('darwin');
    const { writeClipboard } = require(CLIPBOARD_MODULE);

    const result = writeClipboard(null);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_ARGUMENT');
    expect(result.message).toBeTruthy();
  });

  it('Scenario: text 為 undefined 時回傳 INVALID_ARGUMENT', () => {
    mockPlatform('darwin');
    const { writeClipboard } = require(CLIPBOARD_MODULE);

    const result = writeClipboard(undefined);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_ARGUMENT');
    expect(result.message).toBeTruthy();
  });

  it('Scenario: text 型別無效時不執行 pbcopy 指令', () => {
    mockPlatform('darwin');
    const { writeClipboard } = require(CLIPBOARD_MODULE);
    let called = false;
    const mockDeps = { execSync: () => { called = true; } };

    writeClipboard(123, mockDeps);
    expect(called).toBe(false);
  });

  it('Scenario: pbcopy 執行失敗時回傳 COMMAND_FAILED', () => {
    mockPlatform('darwin');
    const { writeClipboard } = require(CLIPBOARD_MODULE);
    const mockDeps = { execSync: makeExecSyncFail('pbcopy error') };

    const result = writeClipboard('some text', mockDeps);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('COMMAND_FAILED');
    expect(result.message).toBeTruthy();
  });

  it('Scenario: pbcopy 失敗時不拋出例外', () => {
    mockPlatform('darwin');
    const { writeClipboard } = require(CLIPBOARD_MODULE);
    const mockDeps = { execSync: makeExecSyncFail('failure') };

    expect(() => writeClipboard('text', mockDeps)).not.toThrow();
  });

  it('Scenario: 非 macOS 平台時回傳 UNSUPPORTED_PLATFORM', () => {
    mockPlatform('linux');
    const { writeClipboard } = require(CLIPBOARD_MODULE);

    const result = writeClipboard('text');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('UNSUPPORTED_PLATFORM');
    expect(result.message).toBe('此功能僅支援 macOS');
  });

  it('Scenario: 非 macOS 平台時不拋出例外', () => {
    mockPlatform('win32');
    const { writeClipboard } = require(CLIPBOARD_MODULE);

    expect(() => writeClipboard('text')).not.toThrow();
  });
});

// ── Module exports 完整性 ──

describe('clipboard.js module exports', () => {
  it('導出 readClipboard 和 writeClipboard', () => {
    const clipboard = require(CLIPBOARD_MODULE);
    expect(typeof clipboard.readClipboard).toBe('function');
    expect(typeof clipboard.writeClipboard).toBe('function');
  });
});
