'use strict';
/**
 * process.test.js — process.js 單元測試
 *
 * 對照 specs/features/in-progress/p3-3-system/bdd.md 中
 * listProcesses / startProcess / killProcess 的 17 個情境。
 */

const { describe, it, expect, afterEach } = require('bun:test');
const { join } = require('path');
const { SCRIPTS_DIR } = require('../helpers/paths');

// ── 路徑 ──
const PROCESS_MODULE = join(SCRIPTS_DIR, 'os', 'process');

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
function makeExecSyncSuccess(output = '') {
  return () => output;
}

function makeExecSyncFail(msg = 'command failed') {
  return () => { throw new Error(msg); };
}

function makeSpawnSuccess(pid = 12345) {
  return () => ({ pid, unref: () => {} });
}

function makeSpawnFail(msg = 'spawn failed') {
  return () => { throw new Error(msg); };
}

// ── ps 輸出範例 ──
const PS_OUTPUT = `  PID COMM             %CPU  %MEM STARTED
  123 bash              0.1   0.5 10:00
  456 node             25.3   2.1 10:05
  789 vim               0.0   0.3 Mon 01`;

const PS_OUTPUT_HEADER_ONLY = `  PID COMM             %CPU  %MEM STARTED`;

// ── listProcesses ──

describe('listProcesses', () => {
  afterEach(() => {
    restorePlatform();
  });

  it('Scenario 1: macOS 上成功列出所有執行中的 Process', () => {
    mockPlatform('darwin');
    const { listProcesses } = require(PROCESS_MODULE);
    const result = listProcesses({ execSync: makeExecSyncSuccess(PS_OUTPUT) });

    expect(result.ok).toBe(true);
    expect(Array.isArray(result.processes)).toBe(true);
    expect(result.processes.length).toBeGreaterThan(0);

    const first = result.processes[0];
    expect(typeof first.pid).toBe('number');
    expect(typeof first.name).toBe('string');
    expect(typeof first.cpu).toBe('number');
    expect(typeof first.mem).toBe('number');
    expect(typeof first.started).toBe('string');

    // 驗證實際解析值
    expect(first.pid).toBe(123);
    expect(first.name).toBe('bash');
    expect(first.cpu).toBe(0.1);
    expect(first.mem).toBe(0.5);
    expect(first.started).toBe('10:00');
  });

  it('Scenario 2: ps 指令執行失敗時回傳 COMMAND_FAILED', () => {
    mockPlatform('darwin');
    const { listProcesses } = require(PROCESS_MODULE);
    const result = listProcesses({ execSync: makeExecSyncFail('ps command error') });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('COMMAND_FAILED');
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('Scenario 2: ps 失敗時不拋出例外', () => {
    mockPlatform('darwin');
    const { listProcesses } = require(PROCESS_MODULE);
    expect(() => listProcesses({ execSync: makeExecSyncFail() })).not.toThrow();
  });

  it('Scenario 3: ps 輸出只有 header 行時回傳 PARSE_ERROR', () => {
    mockPlatform('darwin');
    const { listProcesses } = require(PROCESS_MODULE);
    const result = listProcesses({ execSync: makeExecSyncSuccess(PS_OUTPUT_HEADER_ONLY) });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('PARSE_ERROR');
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('Scenario 3: PARSE_ERROR 時不拋出例外', () => {
    mockPlatform('darwin');
    const { listProcesses } = require(PROCESS_MODULE);
    expect(() => listProcesses({ execSync: makeExecSyncSuccess(PS_OUTPUT_HEADER_ONLY) })).not.toThrow();
  });

  it('Scenario 4: 非 macOS 平台時回傳 UNSUPPORTED_PLATFORM', () => {
    mockPlatform('linux');
    const { listProcesses } = require(PROCESS_MODULE);
    const result = listProcesses();

    expect(result.ok).toBe(false);
    expect(result.error).toBe('UNSUPPORTED_PLATFORM');
    expect(result.message).toBe('此功能僅支援 macOS');
  });

  it('Scenario 4: 非 macOS 時不呼叫任何系統指令', () => {
    mockPlatform('linux');
    const { listProcesses } = require(PROCESS_MODULE);
    let called = false;
    listProcesses({ execSync: () => { called = true; } });
    expect(called).toBe(false);
  });

  it('Scenario 4: 非 macOS 時不拋出例外', () => {
    mockPlatform('win32');
    const { listProcesses } = require(PROCESS_MODULE);
    expect(() => listProcesses()).not.toThrow();
  });
});

// ── startProcess ──

describe('startProcess', () => {
  afterEach(() => {
    restorePlatform();
  });

  it('Scenario 1: 使用有效指令成功啟動 Process', () => {
    mockPlatform('darwin');
    const { startProcess } = require(PROCESS_MODULE);
    const result = startProcess('node', ['--version'], { spawn: makeSpawnSuccess(12345) });

    expect(result.ok).toBe(true);
    expect(result.pid).toBe(12345);
    expect(Number.isInteger(result.pid)).toBe(true);
    expect(result.pid).toBeGreaterThan(0);
  });

  it('Scenario 2: command 為空字串時回傳 INVALID_ARGUMENT', () => {
    mockPlatform('darwin');
    const { startProcess } = require(PROCESS_MODULE);
    const result = startProcess('');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_ARGUMENT');
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('Scenario 2: command 空字串時不執行 spawn', () => {
    mockPlatform('darwin');
    const { startProcess } = require(PROCESS_MODULE);
    let called = false;
    startProcess('', [], { spawn: () => { called = true; return { pid: 1, unref: () => {} }; } });
    expect(called).toBe(false);
  });

  it('Scenario 3: command 為 null 時回傳 INVALID_ARGUMENT', () => {
    mockPlatform('darwin');
    const { startProcess } = require(PROCESS_MODULE);
    const result = startProcess(null);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_ARGUMENT');
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('Scenario 3: command 為 undefined 時回傳 INVALID_ARGUMENT', () => {
    mockPlatform('darwin');
    const { startProcess } = require(PROCESS_MODULE);
    const result = startProcess(undefined);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_ARGUMENT');
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('Scenario 3: command 為 null/undefined 時不執行 spawn', () => {
    mockPlatform('darwin');
    const { startProcess } = require(PROCESS_MODULE);
    let called = false;
    startProcess(null, [], { spawn: () => { called = true; return { pid: 1, unref: () => {} }; } });
    expect(called).toBe(false);
  });

  it('Scenario 4: spawn 執行失敗時回傳 COMMAND_FAILED', () => {
    mockPlatform('darwin');
    const { startProcess } = require(PROCESS_MODULE);
    const result = startProcess('nonexistent-command', [], { spawn: makeSpawnFail('spawn error') });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('COMMAND_FAILED');
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('Scenario 4: spawn 失敗時不拋出例外', () => {
    mockPlatform('darwin');
    const { startProcess } = require(PROCESS_MODULE);
    expect(() => startProcess('cmd', [], { spawn: makeSpawnFail() })).not.toThrow();
  });

  it('Scenario 5: 非 macOS 平台時回傳 UNSUPPORTED_PLATFORM', () => {
    mockPlatform('linux');
    const { startProcess } = require(PROCESS_MODULE);
    const result = startProcess('ls');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('UNSUPPORTED_PLATFORM');
    expect(result.message).toBe('此功能僅支援 macOS');
  });

  it('Scenario 5: 非 macOS 時不拋出例外', () => {
    mockPlatform('win32');
    const { startProcess } = require(PROCESS_MODULE);
    expect(() => startProcess('ls')).not.toThrow();
  });
});

// ── killProcess ──

describe('killProcess', () => {
  afterEach(() => {
    restorePlatform();
  });

  it('Scenario 1: 使用有效 PID 成功終止 Process', () => {
    mockPlatform('darwin');
    const { killProcess } = require(PROCESS_MODULE);
    const result = killProcess(9999, 'SIGTERM', { execSync: makeExecSyncSuccess() });

    expect(result.ok).toBe(true);
  });

  it('Scenario 2: 使用 SIGKILL signal 成功終止 Process', () => {
    mockPlatform('darwin');
    const { killProcess } = require(PROCESS_MODULE);
    const result = killProcess(9999, 'SIGKILL', { execSync: makeExecSyncSuccess() });

    expect(result.ok).toBe(true);
  });

  it('Scenario 2: SIGKILL 時確認指令包含正確 signal', () => {
    mockPlatform('darwin');
    const { killProcess } = require(PROCESS_MODULE);
    let capturedCmd = '';
    killProcess(9999, 'SIGKILL', { execSync: (cmd) => { capturedCmd = cmd; } });
    expect(capturedCmd).toContain('SIGKILL');
    expect(capturedCmd).toContain('9999');
  });

  it('Scenario 3: PID 為 0 時回傳 INVALID_ARGUMENT', () => {
    mockPlatform('darwin');
    const { killProcess } = require(PROCESS_MODULE);
    const result = killProcess(0);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_ARGUMENT');
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('Scenario 3: PID 為 0 時不執行任何 kill 指令', () => {
    mockPlatform('darwin');
    const { killProcess } = require(PROCESS_MODULE);
    let called = false;
    killProcess(0, 'SIGTERM', { execSync: () => { called = true; } });
    expect(called).toBe(false);
  });

  it('Scenario 4: PID 為 1 時回傳 INVALID_ARGUMENT', () => {
    mockPlatform('darwin');
    const { killProcess } = require(PROCESS_MODULE);
    const result = killProcess(1);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_ARGUMENT');
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('Scenario 4: PID 為 1 時不執行任何 kill 指令', () => {
    mockPlatform('darwin');
    const { killProcess } = require(PROCESS_MODULE);
    let called = false;
    killProcess(1, 'SIGTERM', { execSync: () => { called = true; } });
    expect(called).toBe(false);
  });

  it('Scenario 5: PID 等於自身 PID 時回傳 INVALID_ARGUMENT（拒絕自殺）', () => {
    mockPlatform('darwin');
    const { killProcess } = require(PROCESS_MODULE);
    const result = killProcess(process.pid);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_ARGUMENT');
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('Scenario 5: 自身 PID 時不執行任何 kill 指令', () => {
    mockPlatform('darwin');
    const { killProcess } = require(PROCESS_MODULE);
    let called = false;
    killProcess(process.pid, 'SIGTERM', { execSync: () => { called = true; } });
    expect(called).toBe(false);
  });

  it('Scenario 6: 使用非白名單 signal（SIGUSR1）時回傳 INVALID_ARGUMENT', () => {
    mockPlatform('darwin');
    const { killProcess } = require(PROCESS_MODULE);
    const result = killProcess(9999, 'SIGUSR1');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_ARGUMENT');
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('Scenario 6: 非白名單 signal 時不執行任何 kill 指令', () => {
    mockPlatform('darwin');
    const { killProcess } = require(PROCESS_MODULE);
    let called = false;
    killProcess(9999, 'SIGUSR1', { execSync: () => { called = true; } });
    expect(called).toBe(false);
  });

  it('Scenario 7: kill 指令執行失敗時回傳 COMMAND_FAILED', () => {
    mockPlatform('darwin');
    const { killProcess } = require(PROCESS_MODULE);
    const result = killProcess(9999, 'SIGTERM', { execSync: makeExecSyncFail('kill failed') });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('COMMAND_FAILED');
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('Scenario 7: kill 失敗時不拋出例外', () => {
    mockPlatform('darwin');
    const { killProcess } = require(PROCESS_MODULE);
    expect(() => killProcess(9999, 'SIGTERM', { execSync: makeExecSyncFail() })).not.toThrow();
  });

  it('Scenario 8: 非 macOS 平台時回傳 UNSUPPORTED_PLATFORM', () => {
    mockPlatform('linux');
    const { killProcess } = require(PROCESS_MODULE);
    const result = killProcess(9999);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('UNSUPPORTED_PLATFORM');
    expect(result.message).toBe('此功能僅支援 macOS');
  });

  it('Scenario 8: 非 macOS 時不拋出例外', () => {
    mockPlatform('win32');
    const { killProcess } = require(PROCESS_MODULE);
    expect(() => killProcess(9999)).not.toThrow();
  });
});

// ── Module exports 完整性 ──

describe('process.js module exports', () => {
  it('導出 listProcesses、startProcess、killProcess', () => {
    const proc = require(PROCESS_MODULE);
    expect(typeof proc.listProcesses).toBe('function');
    expect(typeof proc.startProcess).toBe('function');
    expect(typeof proc.killProcess).toBe('function');
  });
});
