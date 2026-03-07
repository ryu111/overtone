'use strict';
/**
 * system-info.test.js — system-info.js 單元測試
 *
 * 對照 specs/features/in-progress/p3-3-system/bdd.md 中的
 * getCpuUsage / getMemoryInfo / getDiskInfo / getNetworkInfo 情境（共 18 個）。
 */

const { describe, it, expect, afterEach } = require('bun:test');
const { join } = require('path');
const { SCRIPTS_DIR } = require('../helpers/paths');

// ── 路徑 ──
const SYSTEM_INFO_MODULE = join(SCRIPTS_DIR, 'os', 'system-info');

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

// ── Mock 資料 ──

const TOP_OUTPUT = `
Processes: 350 total, 2 running
CPU usage: 12.5% user, 5.3% sys, 82.2% idle
SharedLibs: 450M resident
`.trim();

const TOP_OUTPUT_BAD = `
Processes: 350 total, 2 running
SharedLibs: 450M resident
`.trim();

const SYSCTL_OUTPUT = '17179869184\n';  // 16 GB in bytes

const VM_STAT_OUTPUT = `
Mach Virtual Memory Statistics: (page size of 4096 bytes)
Pages free:                               18311.
Pages active:                            524288.
Pages inactive:                          131072.
Pages speculative:                        12345.
Pages wired down:                        262144.
`.trim();

// vm_stat 行順序對調
const VM_STAT_OUTPUT_REORDERED = `
Mach Virtual Memory Statistics: (page size of 4096 bytes)
Pages wired down:                        262144.
Pages inactive:                          131072.
Pages speculative:                        12345.
Pages active:                            524288.
Pages free:                               18311.
`.trim();

const VM_STAT_OUTPUT_BAD = `
Mach Virtual Memory Statistics: (page size of 4096 bytes)
Some unrelated data.
`.trim();

const DF_OUTPUT = `
Filesystem       Size   Used  Avail Capacity  Mounted on
/dev/disk3s1s1   500G   250G   200G    56%    /
`.trim();

const DF_OUTPUT_DATA = `
Filesystem                Size   Used  Avail Capacity  Mounted on
/dev/disk3s5              500G   100G   200G    34%    /System/Volumes/Data
`.trim();

const DF_OUTPUT_BAD = `
Filesystem       Size   Used  Avail Capacity  Mounted on
`.trim();

const IFCONFIG_OUTPUT = `
lo0: flags=8049<UP,LOOPBACK,RUNNING,MULTICAST> mtu 16384
\tinet 127.0.0.1 netmask 0xff000000
\tinet6 ::1 prefixlen 128
\tinet6 fe80::1%lo0 prefixlen 64 scopeid 0x1
en0: flags=8863<UP,BROADCAST,SMART,RUNNING,SIMPLEX,MULTICAST> mtu 1500
\tinet 192.168.1.100 netmask 0xffffff00 broadcast 192.168.1.255
\tinet6 fe80::1234:5678:abcd:ef01%en0 prefixlen 64 secured scopeid 0x6
\tstatus: active
en1: flags=8822<BROADCAST,SMART,SIMPLEX,MULTICAST> mtu 1500
\tstatus: inactive
`.trim();

// ── getCpuUsage ──

describe('getCpuUsage', () => {
  afterEach(() => {
    restorePlatform();
  });

  it('Scenario 1: macOS 成功 → ok + cpu { user, sys, idle } 浮點數', () => {
    mockPlatform('darwin');
    const { getCpuUsage } = require(SYSTEM_INFO_MODULE);
    const result = getCpuUsage({ execSync: makeExecSyncSuccess(TOP_OUTPUT) });

    expect(result.ok).toBe(true);
    expect(result.cpu).toBeDefined();
    expect(result.cpu.user).toBe(12.5);
    expect(result.cpu.sys).toBe(5.3);
    expect(result.cpu.idle).toBe(82.2);
    expect(typeof result.cpu.user).toBe('number');
    expect(typeof result.cpu.sys).toBe('number');
    expect(typeof result.cpu.idle).toBe('number');
  });

  it('Scenario 2: top 輸出異常 → PARSE_ERROR', () => {
    mockPlatform('darwin');
    const { getCpuUsage } = require(SYSTEM_INFO_MODULE);
    const result = getCpuUsage({ execSync: makeExecSyncSuccess(TOP_OUTPUT_BAD) });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('PARSE_ERROR');
    expect(result.message).toBeTruthy();
  });

  it('Scenario 2: top 輸出異常時不拋出例外', () => {
    mockPlatform('darwin');
    const { getCpuUsage } = require(SYSTEM_INFO_MODULE);
    expect(() => getCpuUsage({ execSync: makeExecSyncSuccess(TOP_OUTPUT_BAD) })).not.toThrow();
  });

  it('Scenario 3: top 失敗 → COMMAND_FAILED', () => {
    mockPlatform('darwin');
    const { getCpuUsage } = require(SYSTEM_INFO_MODULE);
    const result = getCpuUsage({ execSync: makeExecSyncFail('command not found') });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('COMMAND_FAILED');
    expect(result.message).toBeTruthy();
  });

  it('Scenario 3: top 失敗時不拋出例外', () => {
    mockPlatform('darwin');
    const { getCpuUsage } = require(SYSTEM_INFO_MODULE);
    expect(() => getCpuUsage({ execSync: makeExecSyncFail('error') })).not.toThrow();
  });

  it('Scenario 4: 非 macOS → UNSUPPORTED_PLATFORM', () => {
    mockPlatform('linux');
    const { getCpuUsage } = require(SYSTEM_INFO_MODULE);
    const result = getCpuUsage();

    expect(result.ok).toBe(false);
    expect(result.error).toBe('UNSUPPORTED_PLATFORM');
    expect(result.message).toBe('此功能僅支援 macOS');
  });

  it('Scenario 4: 非 macOS 時不呼叫任何系統指令', () => {
    mockPlatform('win32');
    const { getCpuUsage } = require(SYSTEM_INFO_MODULE);
    let called = false;
    getCpuUsage({ execSync: () => { called = true; } });
    expect(called).toBe(false);
  });

  it('Scenario 4: 非 macOS 時不拋出例外', () => {
    mockPlatform('win32');
    const { getCpuUsage } = require(SYSTEM_INFO_MODULE);
    expect(() => getCpuUsage()).not.toThrow();
  });
});

// ── getMemoryInfo ──

describe('getMemoryInfo', () => {
  afterEach(() => {
    restorePlatform();
  });

  // 建立同時 mock sysctl 和 vm_stat 的 execSync
  function makeMemoryExecSync({ sysctlOk = true, vmstatOk = true, vmstatOutput = VM_STAT_OUTPUT } = {}) {
    let callCount = 0;
    return (cmd) => {
      callCount++;
      if (cmd.includes('sysctl')) {
        if (!sysctlOk) throw new Error('sysctl failed');
        return SYSCTL_OUTPUT;
      }
      if (cmd.includes('vm_stat')) {
        if (!vmstatOk) throw new Error('vm_stat failed');
        return vmstatOutput;
      }
      throw new Error(`unexpected command: ${cmd}`);
    };
  }

  it('Scenario 1: macOS 成功 → ok + memory { totalMB, freeMB, wiredMB, activeMB, inactiveMB }', () => {
    mockPlatform('darwin');
    const { getMemoryInfo } = require(SYSTEM_INFO_MODULE);
    const result = getMemoryInfo({ execSync: makeMemoryExecSync() });

    expect(result.ok).toBe(true);
    expect(result.memory).toBeDefined();
    expect(typeof result.memory.totalMB).toBe('number');
    expect(typeof result.memory.freeMB).toBe('number');
    expect(typeof result.memory.wiredMB).toBe('number');
    expect(typeof result.memory.activeMB).toBe('number');
    expect(typeof result.memory.inactiveMB).toBe('number');
    // 所有欄位皆為非負數
    expect(result.memory.totalMB).toBeGreaterThanOrEqual(0);
    expect(result.memory.freeMB).toBeGreaterThanOrEqual(0);
    expect(result.memory.wiredMB).toBeGreaterThanOrEqual(0);
    expect(result.memory.activeMB).toBeGreaterThanOrEqual(0);
    expect(result.memory.inactiveMB).toBeGreaterThanOrEqual(0);
  });

  it('Scenario 1: freeMB 等於 Pages free × 4096 / 1048576', () => {
    mockPlatform('darwin');
    const { getMemoryInfo } = require(SYSTEM_INFO_MODULE);
    const result = getMemoryInfo({ execSync: makeMemoryExecSync() });

    // Pages free: 18311, freeMB = 18311 * 4096 / 1048576
    const expectedFreeMB = (18311 * 4096) / 1048576;
    expect(result.ok).toBe(true);
    expect(result.memory.freeMB).toBeCloseTo(expectedFreeMB, 5);
  });

  it('Scenario 2: vm_stat 行順序對調仍正確解析', () => {
    mockPlatform('darwin');
    const { getMemoryInfo } = require(SYSTEM_INFO_MODULE);
    const result = getMemoryInfo({
      execSync: makeMemoryExecSync({ vmstatOutput: VM_STAT_OUTPUT_REORDERED }),
    });

    expect(result.ok).toBe(true);
    expect(result.memory).toBeDefined();
    // 解析結果應與正常順序相同
    const expectedFreeMB = (18311 * 4096) / 1048576;
    expect(result.memory.freeMB).toBeCloseTo(expectedFreeMB, 5);
  });

  it('Scenario 3: vm_stat 格式異常 → PARSE_ERROR', () => {
    mockPlatform('darwin');
    const { getMemoryInfo } = require(SYSTEM_INFO_MODULE);
    const result = getMemoryInfo({
      execSync: makeMemoryExecSync({ vmstatOutput: VM_STAT_OUTPUT_BAD }),
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('PARSE_ERROR');
    expect(result.message).toBeTruthy();
  });

  it('Scenario 3: vm_stat 格式異常時不拋出例外', () => {
    mockPlatform('darwin');
    const { getMemoryInfo } = require(SYSTEM_INFO_MODULE);
    expect(() => getMemoryInfo({
      execSync: makeMemoryExecSync({ vmstatOutput: VM_STAT_OUTPUT_BAD }),
    })).not.toThrow();
  });

  it('Scenario 4: vm_stat 失敗 → COMMAND_FAILED', () => {
    mockPlatform('darwin');
    const { getMemoryInfo } = require(SYSTEM_INFO_MODULE);
    const result = getMemoryInfo({
      execSync: makeMemoryExecSync({ vmstatOk: false }),
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('COMMAND_FAILED');
    expect(result.message).toBeTruthy();
  });

  it('Scenario 4: vm_stat 失敗時不拋出例外', () => {
    mockPlatform('darwin');
    const { getMemoryInfo } = require(SYSTEM_INFO_MODULE);
    expect(() => getMemoryInfo({
      execSync: makeMemoryExecSync({ vmstatOk: false }),
    })).not.toThrow();
  });

  it('Scenario 5: 非 macOS → UNSUPPORTED_PLATFORM', () => {
    mockPlatform('linux');
    const { getMemoryInfo } = require(SYSTEM_INFO_MODULE);
    const result = getMemoryInfo();

    expect(result.ok).toBe(false);
    expect(result.error).toBe('UNSUPPORTED_PLATFORM');
    expect(result.message).toBe('此功能僅支援 macOS');
  });

  it('Scenario 5: 非 macOS 時不拋出例外', () => {
    mockPlatform('win32');
    const { getMemoryInfo } = require(SYSTEM_INFO_MODULE);
    expect(() => getMemoryInfo()).not.toThrow();
  });
});

// ── getDiskInfo ──

describe('getDiskInfo', () => {
  afterEach(() => {
    restorePlatform();
  });

  it('Scenario 1: 不傳 mountPoint 查詢根目錄 → ok + disks 陣列', () => {
    mockPlatform('darwin');
    const { getDiskInfo } = require(SYSTEM_INFO_MODULE);
    const result = getDiskInfo(undefined, { execSync: makeExecSyncSuccess(DF_OUTPUT) });

    expect(result.ok).toBe(true);
    expect(Array.isArray(result.disks)).toBe(true);
    expect(result.disks.length).toBeGreaterThanOrEqual(1);

    const disk = result.disks[0];
    expect(typeof disk.device).toBe('string');
    expect(typeof disk.mountPoint).toBe('string');
    expect(typeof disk.totalGB).toBe('number');
    expect(typeof disk.usedGB).toBe('number');
    expect(typeof disk.availableGB).toBe('number');
    expect(typeof disk.usedPercent).toBe('number');
  });

  it('Scenario 1: disks[0] 欄位值正確', () => {
    mockPlatform('darwin');
    const { getDiskInfo } = require(SYSTEM_INFO_MODULE);
    const result = getDiskInfo(undefined, { execSync: makeExecSyncSuccess(DF_OUTPUT) });

    expect(result.ok).toBe(true);
    const disk = result.disks[0];
    expect(disk.device).toBe('/dev/disk3s1s1');
    expect(disk.mountPoint).toBe('/');
    expect(disk.totalGB).toBeCloseTo(500, 0);
    expect(disk.usedGB).toBeCloseTo(250, 0);
    expect(disk.availableGB).toBeCloseTo(200, 0);
    expect(disk.usedPercent).toBe(56);
  });

  it('Scenario 2: 指定 mountPoint → ok + 正確 mountPoint', () => {
    mockPlatform('darwin');
    const { getDiskInfo } = require(SYSTEM_INFO_MODULE);
    const result = getDiskInfo('/System/Volumes/Data', { execSync: makeExecSyncSuccess(DF_OUTPUT_DATA) });

    expect(result.ok).toBe(true);
    expect(result.disks[0].mountPoint).toBe('/System/Volumes/Data');
  });

  it('Scenario 3: df 輸出只有 header → PARSE_ERROR', () => {
    mockPlatform('darwin');
    const { getDiskInfo } = require(SYSTEM_INFO_MODULE);
    const result = getDiskInfo(undefined, { execSync: makeExecSyncSuccess(DF_OUTPUT_BAD) });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('PARSE_ERROR');
    expect(result.message).toBeTruthy();
  });

  it('Scenario 3: df 格式異常時不拋出例外', () => {
    mockPlatform('darwin');
    const { getDiskInfo } = require(SYSTEM_INFO_MODULE);
    expect(() => getDiskInfo(undefined, { execSync: makeExecSyncSuccess(DF_OUTPUT_BAD) })).not.toThrow();
  });

  it('Scenario 4: df 失敗 → COMMAND_FAILED', () => {
    mockPlatform('darwin');
    const { getDiskInfo } = require(SYSTEM_INFO_MODULE);
    const result = getDiskInfo(undefined, { execSync: makeExecSyncFail('df error') });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('COMMAND_FAILED');
    expect(result.message).toBeTruthy();
  });

  it('Scenario 4: df 失敗時不拋出例外', () => {
    mockPlatform('darwin');
    const { getDiskInfo } = require(SYSTEM_INFO_MODULE);
    expect(() => getDiskInfo(undefined, { execSync: makeExecSyncFail('error') })).not.toThrow();
  });

  it('Scenario 5: 非 macOS → UNSUPPORTED_PLATFORM', () => {
    mockPlatform('linux');
    const { getDiskInfo } = require(SYSTEM_INFO_MODULE);
    const result = getDiskInfo();

    expect(result.ok).toBe(false);
    expect(result.error).toBe('UNSUPPORTED_PLATFORM');
    expect(result.message).toBe('此功能僅支援 macOS');
  });

  it('Scenario 5: 非 macOS 時不拋出例外', () => {
    mockPlatform('win32');
    const { getDiskInfo } = require(SYSTEM_INFO_MODULE);
    expect(() => getDiskInfo()).not.toThrow();
  });
});

// ── getNetworkInfo ──

describe('getNetworkInfo', () => {
  afterEach(() => {
    restorePlatform();
  });

  it('Scenario 1: macOS 成功 → ok + interfaces 含 name/status/ipv4', () => {
    mockPlatform('darwin');
    const { getNetworkInfo } = require(SYSTEM_INFO_MODULE);
    const result = getNetworkInfo({ execSync: makeExecSyncSuccess(IFCONFIG_OUTPUT) });

    expect(result.ok).toBe(true);
    expect(Array.isArray(result.interfaces)).toBe(true);
    expect(result.interfaces.length).toBeGreaterThan(0);

    // en0 應為 active 且含 ipv4
    const en0 = result.interfaces.find(i => i.name === 'en0');
    expect(en0).toBeDefined();
    expect(en0.status).toBe('active');
    expect(en0.ipv4).toBe('192.168.1.100');
  });

  it('Scenario 1: 每個介面含 name（string）和 status（active|inactive|unknown）', () => {
    mockPlatform('darwin');
    const { getNetworkInfo } = require(SYSTEM_INFO_MODULE);
    const result = getNetworkInfo({ execSync: makeExecSyncSuccess(IFCONFIG_OUTPUT) });

    expect(result.ok).toBe(true);
    for (const iface of result.interfaces) {
      expect(typeof iface.name).toBe('string');
      expect(['active', 'inactive', 'unknown']).toContain(iface.status);
    }
  });

  it('Scenario 1: en1 應為 inactive 且無 ipv4', () => {
    mockPlatform('darwin');
    const { getNetworkInfo } = require(SYSTEM_INFO_MODULE);
    const result = getNetworkInfo({ execSync: makeExecSyncSuccess(IFCONFIG_OUTPUT) });

    const en1 = result.interfaces.find(i => i.name === 'en1');
    expect(en1).toBeDefined();
    expect(en1.status).toBe('inactive');
    expect(en1.ipv4).toBeUndefined();
  });

  it('Scenario 2: ifconfig 輸出空字串 → PARSE_ERROR', () => {
    mockPlatform('darwin');
    const { getNetworkInfo } = require(SYSTEM_INFO_MODULE);
    const result = getNetworkInfo({ execSync: makeExecSyncSuccess('') });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('PARSE_ERROR');
    expect(result.message).toBeTruthy();
  });

  it('Scenario 2: ifconfig 格式異常時不拋出例外', () => {
    mockPlatform('darwin');
    const { getNetworkInfo } = require(SYSTEM_INFO_MODULE);
    expect(() => getNetworkInfo({ execSync: makeExecSyncSuccess('') })).not.toThrow();
  });

  it('Scenario 3: ifconfig 失敗 → COMMAND_FAILED', () => {
    mockPlatform('darwin');
    const { getNetworkInfo } = require(SYSTEM_INFO_MODULE);
    const result = getNetworkInfo({ execSync: makeExecSyncFail('ifconfig error') });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('COMMAND_FAILED');
    expect(result.message).toBeTruthy();
  });

  it('Scenario 3: ifconfig 失敗時不拋出例外', () => {
    mockPlatform('darwin');
    const { getNetworkInfo } = require(SYSTEM_INFO_MODULE);
    expect(() => getNetworkInfo({ execSync: makeExecSyncFail('error') })).not.toThrow();
  });

  it('Scenario 4: 非 macOS → UNSUPPORTED_PLATFORM', () => {
    mockPlatform('linux');
    const { getNetworkInfo } = require(SYSTEM_INFO_MODULE);
    const result = getNetworkInfo();

    expect(result.ok).toBe(false);
    expect(result.error).toBe('UNSUPPORTED_PLATFORM');
    expect(result.message).toBe('此功能僅支援 macOS');
  });

  it('Scenario 4: 非 macOS 時不拋出例外', () => {
    mockPlatform('win32');
    const { getNetworkInfo } = require(SYSTEM_INFO_MODULE);
    expect(() => getNetworkInfo()).not.toThrow();
  });
});

// ── Module exports 完整性 ──

describe('system-info.js module exports', () => {
  it('導出 getCpuUsage、getMemoryInfo、getDiskInfo、getNetworkInfo', () => {
    const systemInfo = require(SYSTEM_INFO_MODULE);
    expect(typeof systemInfo.getCpuUsage).toBe('function');
    expect(typeof systemInfo.getMemoryInfo).toBe('function');
    expect(typeof systemInfo.getDiskInfo).toBe('function');
    expect(typeof systemInfo.getNetworkInfo).toBe('function');
  });
});
