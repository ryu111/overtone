'use strict';
// pre-bash-guard.test.js — PreToolUse(Bash) guard 整合測試
//
// 測試危險 OS 命令攔截機制：
//   黑名單命令 → deny、正常命令 → allow
//   邊界情況（空命令、無欄位）→ allow
//   組合命令中含黑名單 → deny

const { test, expect, describe } = require('bun:test');
const { runPreBashGuard, isAllowed } = require('../helpers/hook-runner');

// ── 輔助函式 ──

/**
 * 判斷 guard 輸出是否為 deny
 * @param {object} parsed
 * @returns {boolean}
 */
function isDenied(parsed) {
  return parsed?.hookSpecificOutput?.permissionDecision === 'deny';
}

/**
 * 取得 deny 原因
 * @param {object} parsed
 * @returns {string}
 */
function denyReason(parsed) {
  return parsed?.hookSpecificOutput?.permissionDecisionReason || '';
}

// ────────────────────────────────────────────────────────────────────────────
// 黑名單命令 → deny
// ────────────────────────────────────────────────────────────────────────────

describe('PreBashGuard: 黑名單命令攔擋', () => {

  test('sudo rm -rf / → deny（刪除根目錄）', () => {
    const result = runPreBashGuard({ command: 'sudo rm -rf /' });
    expect(result.exitCode).toBe(0);
    expect(isDenied(result.parsed)).toBe(true);
    expect(denyReason(result.parsed)).toContain('刪除根目錄');
    expect(denyReason(result.parsed)).toContain('sudo rm -rf /');
  });

  test('mkfs /dev/sda → deny（格式化磁碟）', () => {
    const result = runPreBashGuard({ command: 'mkfs /dev/sda' });
    expect(result.exitCode).toBe(0);
    expect(isDenied(result.parsed)).toBe(true);
    expect(denyReason(result.parsed)).toContain('格式化磁碟');
  });

  test('dd if=/dev/zero of=/dev/sda → deny（直接寫入磁碟裝置）', () => {
    const result = runPreBashGuard({ command: 'dd if=/dev/zero of=/dev/sda' });
    expect(result.exitCode).toBe(0);
    expect(isDenied(result.parsed)).toBe(true);
    expect(denyReason(result.parsed)).toContain('直接寫入磁碟裝置');
  });

  test('kill -9 1 → deny（終止 init 進程）', () => {
    const result = runPreBashGuard({ command: 'kill -9 1' });
    expect(result.exitCode).toBe(0);
    expect(isDenied(result.parsed)).toBe(true);
    expect(denyReason(result.parsed)).toContain('終止 init 進程');
  });

  test('killall -9 → deny（強制終止所有進程）', () => {
    const result = runPreBashGuard({ command: 'killall -9' });
    expect(result.exitCode).toBe(0);
    expect(isDenied(result.parsed)).toBe(true);
    expect(denyReason(result.parsed)).toContain('強制終止所有進程');
  });

  test('chmod 777 / → deny（開放根目錄全權限）', () => {
    const result = runPreBashGuard({ command: 'chmod 777 /' });
    expect(result.exitCode).toBe(0);
    expect(isDenied(result.parsed)).toBe(true);
    expect(denyReason(result.parsed)).toContain('開放根目錄全權限');
  });

  test('passwd root → deny（修改 root 密碼）', () => {
    const result = runPreBashGuard({ command: 'passwd root' });
    expect(result.exitCode).toBe(0);
    expect(isDenied(result.parsed)).toBe(true);
    expect(denyReason(result.parsed)).toContain('修改 root 密碼');
  });

  test('visudo → deny（修改 sudoers）', () => {
    const result = runPreBashGuard({ command: 'visudo' });
    expect(result.exitCode).toBe(0);
    expect(isDenied(result.parsed)).toBe(true);
    expect(denyReason(result.parsed)).toContain('修改 sudoers');
  });

  test('iptables -F → deny（清空防火牆規則）', () => {
    const result = runPreBashGuard({ command: 'iptables -F' });
    expect(result.exitCode).toBe(0);
    expect(isDenied(result.parsed)).toBe(true);
    expect(denyReason(result.parsed)).toContain('清空防火牆規則');
  });

  test('ifconfig eth0 down → deny（停用網路介面）', () => {
    const result = runPreBashGuard({ command: 'ifconfig eth0 down' });
    expect(result.exitCode).toBe(0);
    expect(isDenied(result.parsed)).toBe(true);
    expect(denyReason(result.parsed)).toContain('停用網路介面');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 正常命令 → allow
// ────────────────────────────────────────────────────────────────────────────

describe('PreBashGuard: 正常命令放行', () => {

  test('bun test → allow', () => {
    const result = runPreBashGuard({ command: 'bun test' });
    expect(result.exitCode).toBe(0);
    expect(isAllowed(result.parsed)).toBe(true);
  });

  test('node scripts/server.js → allow', () => {
    const result = runPreBashGuard({ command: 'node scripts/server.js' });
    expect(result.exitCode).toBe(0);
    expect(isAllowed(result.parsed)).toBe(true);
  });

  test('ls -la → allow', () => {
    const result = runPreBashGuard({ command: 'ls -la' });
    expect(result.exitCode).toBe(0);
    expect(isAllowed(result.parsed)).toBe(true);
  });

  test('git status → allow', () => {
    const result = runPreBashGuard({ command: 'git status' });
    expect(result.exitCode).toBe(0);
    expect(isAllowed(result.parsed)).toBe(true);
  });

  test('bun plugins/overtone/scripts/os/screenshot.js → allow', () => {
    const result = runPreBashGuard({ command: 'bun plugins/overtone/scripts/os/screenshot.js' });
    expect(result.exitCode).toBe(0);
    expect(isAllowed(result.parsed)).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 邊界情況
// ────────────────────────────────────────────────────────────────────────────

describe('PreBashGuard: 邊界情況', () => {

  test('空 command → allow', () => {
    const result = runPreBashGuard({ command: '' });
    expect(result.exitCode).toBe(0);
    expect(isAllowed(result.parsed)).toBe(true);
  });

  test('無 command 欄位 → allow', () => {
    const result = runPreBashGuard({});
    expect(result.exitCode).toBe(0);
    expect(isAllowed(result.parsed)).toBe(true);
  });

  test('空 tool_input → allow', () => {
    const result = runPreBashGuard(undefined);
    expect(result.exitCode).toBe(0);
    expect(isAllowed(result.parsed)).toBe(true);
  });

  test('deny 訊息包含手動操作提示', () => {
    const result = runPreBashGuard({ command: 'sudo rm -rf /' });
    expect(isDenied(result.parsed)).toBe(true);
    const reason = denyReason(result.parsed);
    expect(reason).toContain('⛔');
    expect(reason).toContain('危險 OS 命令已攔截');
    expect(reason).toContain('CLI 中手動操作');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 組合命令中含黑名單 → deny
// ────────────────────────────────────────────────────────────────────────────

describe('PreBashGuard: 組合命令', () => {

  test('echo hello && sudo rm -rf / → deny（子命令匹配）', () => {
    const result = runPreBashGuard({ command: 'echo hello && sudo rm -rf /' });
    expect(result.exitCode).toBe(0);
    expect(isDenied(result.parsed)).toBe(true);
    expect(denyReason(result.parsed)).toContain('刪除根目錄');
  });

  test('bun test ; mkfs /dev/sda → deny（子命令匹配）', () => {
    const result = runPreBashGuard({ command: 'bun test ; mkfs /dev/sda' });
    expect(result.exitCode).toBe(0);
    expect(isDenied(result.parsed)).toBe(true);
    expect(denyReason(result.parsed)).toContain('格式化磁碟');
  });
});
