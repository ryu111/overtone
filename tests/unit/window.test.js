'use strict';
/**
 * window.test.js — window.js 單元測試
 *
 * 對照 specs/features/in-progress/p3-1-perception/bdd.md 中的
 * listProcesses / listWindows / focusApp / getFrontApp / checkAccessibility 情境。
 */

const { describe, it, expect, afterEach } = require('bun:test');

// ── 路徑 ──
const WINDOW_MODULE = '../../plugins/overtone/scripts/os/window';

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
function makeExecSyncReturns(value) {
  return () => value;
}

function makeExecSyncFail(message = 'command failed') {
  return () => {
    throw new Error(message);
  };
}

function makeExecSyncAccessibilityFail() {
  return () => {
    throw new Error('Not authorized to send Apple events to System Events. (osascript 10004)');
  };
}

// ── listProcesses ──

describe('listProcesses', () => {
  afterEach(() => {
    restorePlatform();
  });

  it('Scenario: 成功列出運行中的進程', () => {
    mockPlatform('darwin');
    const { listProcesses } = require(WINDOW_MODULE);
    const mockOutput = 'Safari\t1234\ttrue\nFinder\t5678\tfalse\n';
    const mockDeps = { execSync: makeExecSyncReturns(mockOutput) };

    const result = listProcesses(mockDeps);

    expect(result.ok).toBe(true);
    expect(Array.isArray(result.processes)).toBe(true);
    expect(result.processes.length).toBe(2);

    const safari = result.processes.find(p => p.name === 'Safari');
    expect(safari).toBeDefined();
    expect(safari.pid).toBe(1234);
    expect(typeof safari.pid).toBe('number');
    expect(typeof safari.name).toBe('string');
  });

  it('Scenario: processes 陣列每個元素包含 pid（number）和 name（string）', () => {
    mockPlatform('darwin');
    const { listProcesses } = require(WINDOW_MODULE);
    const mockOutput = 'Terminal\t9999\tfalse\n';
    const mockDeps = { execSync: makeExecSyncReturns(mockOutput) };

    const result = listProcesses(mockDeps);

    expect(result.ok).toBe(true);
    expect(result.processes[0].pid).toBe(9999);
    expect(result.processes[0].name).toBe('Terminal');
  });

  it('Scenario: 非 macOS 平台時回傳 UNSUPPORTED_PLATFORM', () => {
    mockPlatform('linux');
    const { listProcesses } = require(WINDOW_MODULE);

    const result = listProcesses();

    expect(result.ok).toBe(false);
    expect(result.error).toBe('UNSUPPORTED_PLATFORM');
    expect(result.message).toBe('此功能僅支援 macOS');
  });

  it('Scenario: 非 macOS 平台時不呼叫任何系統指令', () => {
    mockPlatform('linux');
    const { listProcesses } = require(WINDOW_MODULE);
    let called = false;
    const mockDeps = { execSync: () => { called = true; } };

    listProcesses(mockDeps);
    expect(called).toBe(false);
  });

  it('Scenario: osascript 回傳空字串時回傳 OSASCRIPT_PARSE_ERROR', () => {
    mockPlatform('darwin');
    const { listProcesses } = require(WINDOW_MODULE);
    const mockDeps = { execSync: makeExecSyncReturns('') };

    const result = listProcesses(mockDeps);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('OSASCRIPT_PARSE_ERROR');
    expect(result.message).toBeTruthy();
  });

  it('Scenario: osascript 回傳亂碼時回傳 OSASCRIPT_PARSE_ERROR', () => {
    mockPlatform('darwin');
    const { listProcesses } = require(WINDOW_MODULE);
    // 無法解析成 "name\tpid" 格式的亂碼
    const mockDeps = { execSync: makeExecSyncReturns('  \n   \n  ') };

    const result = listProcesses(mockDeps);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('OSASCRIPT_PARSE_ERROR');
  });
});

// ── listWindows ──

describe('listWindows', () => {
  afterEach(() => {
    restorePlatform();
  });

  it('Scenario: 成功列出指定 App 的 2 個視窗', () => {
    mockPlatform('darwin');
    const { listWindows } = require(WINDOW_MODULE);
    const mockOutput = 'Safari\tGoogle - 台灣\nSafari\tGitHub\n';
    const mockDeps = { execSync: makeExecSyncReturns(mockOutput) };

    const result = listWindows('Safari', mockDeps);

    expect(result.ok).toBe(true);
    expect(Array.isArray(result.windows)).toBe(true);
    expect(result.windows.length).toBe(2);

    const firstWin = result.windows[0];
    expect(typeof firstWin.title).toBe('string');
    expect(typeof firstWin.app).toBe('string');
    expect(firstWin.app).toBe('Safari');
  });

  it('Scenario: 每個視窗元素包含 title 和 app 欄位', () => {
    mockPlatform('darwin');
    const { listWindows } = require(WINDOW_MODULE);
    const mockOutput = 'Terminal\t工作目錄\n';
    const mockDeps = { execSync: makeExecSyncReturns(mockOutput) };

    const result = listWindows('Terminal', mockDeps);

    expect(result.ok).toBe(true);
    expect(result.windows[0].app).toBe('Terminal');
    expect(result.windows[0].title).toBe('工作目錄');
  });

  it('Scenario: Accessibility 未授予時回傳 PERMISSION_DENIED', () => {
    mockPlatform('darwin');
    const { listWindows } = require(WINDOW_MODULE);
    const mockDeps = { execSync: makeExecSyncAccessibilityFail() };

    const result = listWindows('Safari', mockDeps);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('PERMISSION_DENIED');
    expect(result.message).toBeTruthy();
  });

  it('Scenario: Accessibility 未授予時不拋出例外', () => {
    mockPlatform('darwin');
    const { listWindows } = require(WINDOW_MODULE);
    const mockDeps = { execSync: makeExecSyncAccessibilityFail() };

    expect(() => listWindows('Safari', mockDeps)).not.toThrow();
  });

  it('Scenario: osascript 輸出無 tab 分隔時回傳 OSASCRIPT_PARSE_ERROR', () => {
    mockPlatform('darwin');
    const { listWindows } = require(WINDOW_MODULE);
    // 有內容但無 tab — 無法解析
    const mockDeps = { execSync: makeExecSyncReturns('invalid format no tab here') };

    const result = listWindows('Safari', mockDeps);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('OSASCRIPT_PARSE_ERROR');
    expect(result.message).toBeTruthy();
  });

  it('Scenario: osascript 回傳空字串時回傳空陣列（App 無視窗）', () => {
    mockPlatform('darwin');
    const { listWindows } = require(WINDOW_MODULE);
    const mockDeps = { execSync: makeExecSyncReturns('') };

    const result = listWindows('Safari', mockDeps);

    expect(result.ok).toBe(true);
    expect(result.windows).toEqual([]);
  });
});

// ── focusApp ──

describe('focusApp', () => {
  afterEach(() => {
    restorePlatform();
  });

  it('Scenario: 成功將 App 帶到前景', () => {
    mockPlatform('darwin');
    const { focusApp } = require(WINDOW_MODULE);
    const mockDeps = { execSync: makeExecSyncReturns('') };

    const result = focusApp('Safari', mockDeps);

    expect(result.ok).toBe(true);
  });

  it('Scenario: osascript 失敗時回傳 COMMAND_FAILED', () => {
    mockPlatform('darwin');
    const { focusApp } = require(WINDOW_MODULE);
    const mockDeps = { execSync: makeExecSyncFail('No application responds to "NonExistentApp"') };

    const result = focusApp('NonExistentApp', mockDeps);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('COMMAND_FAILED');
    expect(result.message).toBeTruthy();
  });

  it('Scenario: osascript 失敗時不拋出例外', () => {
    mockPlatform('darwin');
    const { focusApp } = require(WINDOW_MODULE);
    const mockDeps = { execSync: makeExecSyncFail() };

    expect(() => focusApp('NonExistentApp', mockDeps)).not.toThrow();
  });
});

// ── getFrontApp ──

describe('getFrontApp', () => {
  afterEach(() => {
    restorePlatform();
  });

  it('Scenario: 成功取得前景 App 和視窗標題', () => {
    mockPlatform('darwin');
    const { getFrontApp } = require(WINDOW_MODULE);
    const mockDeps = { execSync: makeExecSyncReturns('Safari\tGoogle - 台灣') };

    const result = getFrontApp(mockDeps);

    expect(result.ok).toBe(true);
    expect(result.app).toBe('Safari');
    expect(result.window).toBe('Google - 台灣');
  });

  it('Scenario: window 可為 null（App 前景但無視窗標題）', () => {
    mockPlatform('darwin');
    const { getFrontApp } = require(WINDOW_MODULE);
    // 有 App 名稱，tab 後空字串
    const mockDeps = { execSync: makeExecSyncReturns('Finder\t') };

    const result = getFrontApp(mockDeps);

    expect(result.ok).toBe(true);
    expect(result.app).toBe('Finder');
    expect(result.window).toBeNull();
  });

  it('Scenario: osascript 回傳空字串時回傳 OSASCRIPT_PARSE_ERROR', () => {
    mockPlatform('darwin');
    const { getFrontApp } = require(WINDOW_MODULE);
    const mockDeps = { execSync: makeExecSyncReturns('') };

    const result = getFrontApp(mockDeps);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('OSASCRIPT_PARSE_ERROR');
    expect(result.message).toBeTruthy();
  });

  it('Scenario: osascript 回傳格式異常時不拋出例外', () => {
    mockPlatform('darwin');
    const { getFrontApp } = require(WINDOW_MODULE);
    const mockDeps = { execSync: makeExecSyncReturns('') };

    expect(() => getFrontApp(mockDeps)).not.toThrow();
  });
});

// ── checkAccessibility ──

describe('checkAccessibility', () => {
  afterEach(() => {
    restorePlatform();
  });

  it('Scenario: Accessibility 已授予時回傳 hasPermission true', () => {
    mockPlatform('darwin');
    const { checkAccessibility } = require(WINDOW_MODULE);
    // osascript 成功執行 → 有權限
    const mockDeps = { execSync: makeExecSyncReturns('5') };

    const result = checkAccessibility(mockDeps);

    expect(result.ok).toBe(true);
    expect(result.hasPermission).toBe(true);
  });

  it('Scenario: Accessibility 未授予時回傳 hasPermission false', () => {
    mockPlatform('darwin');
    const { checkAccessibility } = require(WINDOW_MODULE);
    const mockDeps = { execSync: makeExecSyncAccessibilityFail() };

    const result = checkAccessibility(mockDeps);

    expect(result.ok).toBe(true);
    expect(result.hasPermission).toBe(false);
  });

  it('Scenario: 非 macOS 平台時回傳 UNSUPPORTED_PLATFORM', () => {
    mockPlatform('linux');
    const { checkAccessibility } = require(WINDOW_MODULE);

    const result = checkAccessibility();

    expect(result.ok).toBe(false);
    expect(result.error).toBe('UNSUPPORTED_PLATFORM');
    expect(result.message).toBe('此功能僅支援 macOS');
  });

  it('Scenario: checkAccessibility 永不拋出例外', () => {
    mockPlatform('darwin');
    const { checkAccessibility } = require(WINDOW_MODULE);
    const mockDeps = { execSync: makeExecSyncFail('terrible error') };

    expect(() => checkAccessibility(mockDeps)).not.toThrow();
  });
});

// ── sanitizeAppName（via listWindows / focusApp）──

describe('sanitizeAppName — AppleScript injection 防護', () => {
  afterEach(() => {
    restorePlatform();
  });

  it('Scenario: listWindows 傳入含雙引號的 appName 不拋出例外', () => {
    mockPlatform('darwin');
    const { listWindows } = require(WINDOW_MODULE);
    // 記錄實際傳給 execSync 的 script 內容
    let capturedScript = '';
    const mockDeps = {
      execSync: (cmd) => {
        capturedScript = cmd;
        return ''; // 空輸出 → ok({ windows: [] })
      },
    };

    // 含雙引號的 appName（injection payload）
    expect(() => listWindows('Test"App', mockDeps)).not.toThrow();
    // 確認 script 中的雙引號已被跳脫（\\"），而非原始的 "
    expect(capturedScript).toContain('\\"');
  });

  it('Scenario: focusApp 傳入含雙引號的 appName 不拋出例外', () => {
    mockPlatform('darwin');
    const { focusApp } = require(WINDOW_MODULE);
    let capturedScript = '';
    const mockDeps = {
      execSync: (cmd) => {
        capturedScript = cmd;
      },
    };

    // 含雙引號的 appName（injection payload）
    expect(() => focusApp('Test"App', mockDeps)).not.toThrow();
    // 確認 script 中的雙引號已被跳脫
    expect(capturedScript).toContain('\\"');
  });

  it('Scenario: sanitization 正確跳脫反斜線', () => {
    mockPlatform('darwin');
    const { focusApp } = require(WINDOW_MODULE);
    let capturedScript = '';
    const mockDeps = {
      execSync: (cmd) => {
        capturedScript = cmd;
      },
    };

    // 含反斜線的 appName
    expect(() => focusApp('App\\Name', mockDeps)).not.toThrow();
    // 反斜線應被跳脫為 \\
    expect(capturedScript).toContain('\\\\');
  });
});

// ── Module exports 完整性 ──

describe('window.js module exports', () => {
  it('導出 listProcesses、listWindows、focusApp、getFrontApp、checkAccessibility', () => {
    const windowModule = require(WINDOW_MODULE);
    expect(typeof windowModule.listProcesses).toBe('function');
    expect(typeof windowModule.listWindows).toBe('function');
    expect(typeof windowModule.focusApp).toBe('function');
    expect(typeof windowModule.getFrontApp).toBe('function');
    expect(typeof windowModule.checkAccessibility).toBe('function');
  });
});
