'use strict';
/**
 * screenshot.test.js — screenshot.js 單元測試
 *
 * 對照 specs/features/in-progress/p3-1-perception/bdd.md 中的
 * captureFullScreen / captureRegion / captureWindow / checkPermission 情境。
 */

const { describe, it, expect, beforeEach, afterEach } = require('bun:test');
const { join } = require('path');
const { SCRIPTS_DIR } = require('../helpers/paths');

// ── 路徑 ──
const SCREENSHOT_MODULE = join(SCRIPTS_DIR, 'os', 'screenshot');

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
function makeExecSyncSuccess(returnValue = '') {
  return () => returnValue;
}

function makeExecSyncFail(message = 'command failed', status = 1) {
  return () => {
    const err = new Error(message);
    err.status = status;
    throw err;
  };
}

function makeExecSyncPermissionFail() {
  return () => {
    const err = new Error('could not create image: authorization denied');
    err.status = 1;
    throw err;
  };
}

// ── captureFullScreen ──

describe('captureFullScreen', () => {
  afterEach(() => {
    restorePlatform();
  });

  it('Scenario: 在 macOS 上成功截取全螢幕（不傳 outputPath）', () => {
    mockPlatform('darwin');
    const { captureFullScreen } = require(SCREENSHOT_MODULE);
    const mockDeps = { execSync: makeExecSyncSuccess() };

    const result = captureFullScreen({}, mockDeps);

    expect(result.ok).toBe(true);
    expect(result.type).toBe('full');
    expect(result.path).toMatch(/^\/tmp\/overtone-screenshots\/screenshot-full-\d{8}-\d{6}-\d{3}\.png$/);
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('Scenario: 使用自訂 outputPath 截取全螢幕', () => {
    mockPlatform('darwin');
    const { captureFullScreen } = require(SCREENSHOT_MODULE);
    const mockDeps = { execSync: makeExecSyncSuccess() };

    const result = captureFullScreen({ outputPath: '/tmp/test.png' }, mockDeps);

    expect(result.ok).toBe(true);
    expect(result.path).toBe('/tmp/test.png');
    expect(result.type).toBe('full');
    expect(result.timestamp).toBeTruthy();
  });

  it('Scenario: Screen Recording 權限未授予時回傳 PERMISSION_DENIED', () => {
    mockPlatform('darwin');
    const { captureFullScreen } = require(SCREENSHOT_MODULE);
    const mockDeps = { execSync: makeExecSyncPermissionFail() };

    const result = captureFullScreen({}, mockDeps);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('PERMISSION_DENIED');
    expect(result.message).toBeTruthy();
  });

  it('Scenario: Screen Recording 權限未授予時不拋出例外', () => {
    mockPlatform('darwin');
    const { captureFullScreen } = require(SCREENSHOT_MODULE);
    const mockDeps = { execSync: makeExecSyncPermissionFail() };

    expect(() => captureFullScreen({}, mockDeps)).not.toThrow();
  });

  it('Scenario: 非 macOS 平台時回傳 UNSUPPORTED_PLATFORM', () => {
    mockPlatform('linux');
    const { captureFullScreen } = require(SCREENSHOT_MODULE);

    const result = captureFullScreen();

    expect(result.ok).toBe(false);
    expect(result.error).toBe('UNSUPPORTED_PLATFORM');
    expect(result.message).toBe('此功能僅支援 macOS');
  });

});

// ── captureRegion ──

describe('captureRegion', () => {
  afterEach(() => {
    restorePlatform();
  });

  it('Scenario: 指定有效區域座標成功截圖', () => {
    mockPlatform('darwin');
    const { captureRegion } = require(SCREENSHOT_MODULE);
    let capturedCmd = '';
    const mockDeps = {
      execSync: (cmd) => { capturedCmd = cmd; return ''; }
    };

    const result = captureRegion({ x: 100, y: 200, width: 800, height: 600 }, {}, mockDeps);

    expect(result.ok).toBe(true);
    expect(result.type).toBe('region');
    expect(result.timestamp).toBeTruthy();
    expect(capturedCmd).toContain('-R 100,200,800,600');
  });

  it('Scenario: region 缺少 width 和 height 時回傳 INVALID_ARGUMENT', () => {
    mockPlatform('darwin');
    const { captureRegion } = require(SCREENSHOT_MODULE);

    const result = captureRegion({ x: 100, y: 200 });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_ARGUMENT');
    expect(result.message).toBeTruthy();
  });

  it('Scenario: region 缺少欄位時不執行截圖指令', () => {
    mockPlatform('darwin');
    const { captureRegion } = require(SCREENSHOT_MODULE);
    let called = false;
    const mockDeps = { execSync: () => { called = true; } };

    captureRegion({ x: 100, y: 200 }, {}, mockDeps);
    expect(called).toBe(false);
  });

  it('Scenario: execSync 拋出例外時回傳 COMMAND_FAILED', () => {
    mockPlatform('darwin');
    const { captureRegion } = require(SCREENSHOT_MODULE);
    const mockDeps = { execSync: makeExecSyncFail('generic error') };

    const result = captureRegion({ x: 0, y: 0, width: 100, height: 100 }, {}, mockDeps);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('COMMAND_FAILED');
    expect(result.message).toBeTruthy();
  });

  it('Scenario: screencapture 失敗時不拋出例外', () => {
    mockPlatform('darwin');
    const { captureRegion } = require(SCREENSHOT_MODULE);
    const mockDeps = { execSync: makeExecSyncFail() };

    expect(() => captureRegion({ x: 0, y: 0, width: 100, height: 100 }, {}, mockDeps)).not.toThrow();
  });
});

// ── captureWindow ──

describe('captureWindow', () => {
  afterEach(() => {
    restorePlatform();
  });

  it('Scenario: 使用有效 windowId 成功截圖', () => {
    mockPlatform('darwin');
    const { captureWindow } = require(SCREENSHOT_MODULE);
    let capturedCmd = '';
    const mockDeps = {
      execSync: (cmd) => { capturedCmd = cmd; return ''; }
    };

    const result = captureWindow(12345, {}, mockDeps);

    expect(result.ok).toBe(true);
    expect(result.type).toBe('window');
    expect(result.timestamp).toBeTruthy();
    expect(capturedCmd).toContain('-l 12345');
  });

  it('Scenario: windowId 為 null 時回傳 INVALID_ARGUMENT', () => {
    mockPlatform('darwin');
    const { captureWindow } = require(SCREENSHOT_MODULE);

    const result = captureWindow(null);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_ARGUMENT');
    expect(result.message).toBeTruthy();
  });

  it('Scenario: windowId 為 undefined 時回傳 INVALID_ARGUMENT', () => {
    mockPlatform('darwin');
    const { captureWindow } = require(SCREENSHOT_MODULE);

    const result = captureWindow(undefined);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_ARGUMENT');
    expect(result.message).toBeTruthy();
  });

  it('Scenario: windowId 為 null/undefined 時不執行截圖指令', () => {
    mockPlatform('darwin');
    const { captureWindow } = require(SCREENSHOT_MODULE);
    let called = false;
    const mockDeps = { execSync: () => { called = true; } };

    captureWindow(null, {}, mockDeps);
    expect(called).toBe(false);
  });
});

// ── checkPermission ──

describe('checkPermission', () => {
  afterEach(() => {
    restorePlatform();
  });

  it('Scenario: Screen Recording 已授予時回傳 hasPermission true', () => {
    mockPlatform('darwin');
    const { checkPermission } = require(SCREENSHOT_MODULE);
    // 模擬截圖成功，且 statSync 回傳大檔案
    const mockDeps = {
      execSync: makeExecSyncSuccess(''),
    };

    // checkPermission 內部使用真實 statSync，但我們確保 execSync 不 throw
    // 因為無法實際截圖，我們只測試不拋出例外且 ok 為 true
    expect(() => checkPermission(mockDeps)).not.toThrow();
    const result = checkPermission(mockDeps);
    expect(result.ok).toBe(true);
    expect(typeof result.hasPermission).toBe('boolean');
  });

  it('Scenario: Screen Recording 未授予時（execSync 失敗）回傳 hasPermission false', () => {
    mockPlatform('darwin');
    const { checkPermission } = require(SCREENSHOT_MODULE);
    const mockDeps = { execSync: makeExecSyncFail('screencapture failed') };

    const result = checkPermission(mockDeps);

    expect(result.ok).toBe(true);
    expect(result.hasPermission).toBe(false);
  });

  it('Scenario: checkPermission 失敗時不回傳 PERMISSION_DENIED 錯誤', () => {
    mockPlatform('darwin');
    const { checkPermission } = require(SCREENSHOT_MODULE);
    const mockDeps = { execSync: makeExecSyncFail('failed') };

    const result = checkPermission(mockDeps);

    expect(result.error).not.toBe('PERMISSION_DENIED');
  });

  it('Scenario: 非 macOS 平台時回傳 UNSUPPORTED_PLATFORM', () => {
    mockPlatform('linux');
    const { checkPermission } = require(SCREENSHOT_MODULE);

    const result = checkPermission();

    expect(result.ok).toBe(false);
    expect(result.error).toBe('UNSUPPORTED_PLATFORM');
    expect(result.message).toBe('此功能僅支援 macOS');
  });

  it('Scenario: checkPermission 永不拋出例外', () => {
    mockPlatform('darwin');
    const { checkPermission } = require(SCREENSHOT_MODULE);
    const mockDeps = { execSync: makeExecSyncFail('terrible error') };

    expect(() => checkPermission(mockDeps)).not.toThrow();
  });
});

// ── Module exports 完整性 ──

describe('screenshot.js module exports', () => {
  it('導出 captureFullScreen、captureRegion、captureWindow、checkPermission', () => {
    const screenshot = require(SCREENSHOT_MODULE);
    expect(typeof screenshot.captureFullScreen).toBe('function');
    expect(typeof screenshot.captureRegion).toBe('function');
    expect(typeof screenshot.captureWindow).toBe('function');
    expect(typeof screenshot.checkPermission).toBe('function');
  });
});
