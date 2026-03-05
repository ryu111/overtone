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

  test('sudo rm -rf / → deny（刪除根目錄，有 sudo）', () => {
    const result = runPreBashGuard({ command: 'sudo rm -rf /' });
    expect(result.exitCode).toBe(0);
    expect(isDenied(result.parsed)).toBe(true);
    expect(denyReason(result.parsed)).toContain('刪除根目錄');
    expect(denyReason(result.parsed)).toContain('sudo rm -rf /');
  });

  test('rm -rf / → deny（刪除根目錄，無 sudo）', () => {
    const result = runPreBashGuard({ command: 'rm -rf /' });
    expect(result.exitCode).toBe(0);
    expect(isDenied(result.parsed)).toBe(true);
    expect(denyReason(result.parsed)).toContain('刪除根目錄');
  });

  test('rm -rf /* → deny（刪除根目錄下全部，無 sudo）', () => {
    const result = runPreBashGuard({ command: 'rm -rf /*' });
    expect(result.exitCode).toBe(0);
    expect(isDenied(result.parsed)).toBe(true);
    expect(denyReason(result.parsed)).toContain('刪除根目錄');
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
// P3.6 新增規則 → deny
// ────────────────────────────────────────────────────────────────────────────

describe('PreBashGuard: P3.6 新增黑名單規則（deny）', () => {

  test('sudo tee /etc/hosts → deny（寫入系統設定目錄）', () => {
    const result = runPreBashGuard({ command: 'sudo tee /etc/hosts' });
    expect(result.exitCode).toBe(0);
    expect(isDenied(result.parsed)).toBe(true);
    expect(denyReason(result.parsed)).toContain('寫入系統設定目錄');
  });

  test('sudo chmod -R 777 /Applications → deny（遞迴開放非暫存目錄全權限）', () => {
    const result = runPreBashGuard({ command: 'sudo chmod -R 777 /Applications' });
    expect(result.exitCode).toBe(0);
    expect(isDenied(result.parsed)).toBe(true);
    expect(denyReason(result.parsed)).toContain('遞迴開放非暫存目錄全權限');
  });

  test('osascript delete Finder file → deny（AppleScript 刪除操作）', () => {
    const result = runPreBashGuard({ command: 'osascript -e \'tell application "Finder" to delete file "test"\'' });
    expect(result.exitCode).toBe(0);
    expect(isDenied(result.parsed)).toBe(true);
    expect(denyReason(result.parsed)).toContain('AppleScript 刪除操作');
  });

  test('launchctl unload /Library/LaunchDaemons/com.apple.example.plist → deny（停用系統服務）', () => {
    const result = runPreBashGuard({ command: 'launchctl unload /Library/LaunchDaemons/com.apple.example.plist' });
    expect(result.exitCode).toBe(0);
    expect(isDenied(result.parsed)).toBe(true);
    expect(denyReason(result.parsed)).toContain('停用系統服務');
  });

  test('defaults delete com.apple.finder.plist → deny（修改或刪除系統偏好設定）', () => {
    const result = runPreBashGuard({ command: 'defaults delete com.apple.finder.plist' });
    expect(result.exitCode).toBe(0);
    expect(isDenied(result.parsed)).toBe(true);
    expect(denyReason(result.parsed)).toContain('修改或刪除系統偏好設定');
  });

  test('defaults write NSGlobalDomain key value → deny（修改系統偏好設定）', () => {
    const result = runPreBashGuard({ command: 'defaults write NSGlobalDomain AppleShowAllFiles true' });
    expect(result.exitCode).toBe(0);
    expect(isDenied(result.parsed)).toBe(true);
    expect(denyReason(result.parsed)).toContain('修改或刪除系統偏好設定');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// P3.6 防誤殺 → allow
// ────────────────────────────────────────────────────────────────────────────

describe('PreBashGuard: P3.6 防誤殺（allow）', () => {

  test('sudo tee /tmp/test.conf → allow（暫存目錄排除）', () => {
    const result = runPreBashGuard({ command: 'sudo tee /tmp/test.conf' });
    expect(result.exitCode).toBe(0);
    expect(isAllowed(result.parsed)).toBe(true);
  });

  test('osascript key code 49（不含 delete）→ allow（鍵盤操作放行）', () => {
    const result = runPreBashGuard({ command: 'osascript -e \'tell application "System Events" to key code 49\'' });
    expect(result.exitCode).toBe(0);
    expect(isAllowed(result.parsed)).toBe(true);
  });

  test('sudo chmod -R 777 /tmp/build → allow（暫存目錄排除）', () => {
    const result = runPreBashGuard({ command: 'sudo chmod -R 777 /tmp/build' });
    expect(result.exitCode).toBe(0);
    expect(isAllowed(result.parsed)).toBe(true);
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

  test('sudo rm -rf /tmp/test → allow（一般暫存目錄清理，不應誤殺）', () => {
    const result = runPreBashGuard({ command: 'sudo rm -rf /tmp/test' });
    expect(result.exitCode).toBe(0);
    expect(isAllowed(result.parsed)).toBe(true);
  });

  test('chmod 777 /tmp/script.sh → allow（一般腳本授權，不應誤殺）', () => {
    const result = runPreBashGuard({ command: 'chmod 777 /tmp/script.sh' });
    expect(result.exitCode).toBe(0);
    expect(isAllowed(result.parsed)).toBe(true);
  });

  test('rm -rf /tmp/build → allow（一般建置目錄清理，不應誤殺）', () => {
    const result = runPreBashGuard({ command: 'rm -rf /tmp/build' });
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
