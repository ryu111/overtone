#!/usr/bin/env node
'use strict';
// PreToolUse(Bash) guard — 攔截危險的 OS 命令
//
// 觸發：每次 Claude 使用 Bash 工具時
// 職責：
//   偵測黑名單中的危險系統命令，阻擋可能造成不可逆損害的操作
//
// 黑名單規則（19 條）：
//   1. sudo rm -rf /    — 刪除根目錄（有 sudo）
//   2. rm -rf /         — 刪除根目錄（無 sudo）
//   3. mkfs             — 格式化磁碟
//   4. dd if=... of=/dev/ — 直接寫入磁碟裝置
//   5. passwd root      — 修改 root 密碼
//   6. chmod 777 /      — 開放根目錄全權限
//   7. visudo           — 修改 sudoers
//   8. iptables -F      — 清空防火牆規則
//   9. ifconfig ... down — 停用網路介面
//  10. killall -9       — 強制終止所有進程（-9 flag）
//  11. kill -9 1        — 終止 init 進程
//  P3.3 新增：
//  12. killall <name>   — name-based 批量終止進程（無 -9 也危險）
//  13. pkill            — pattern-based 批量終止進程
//  14. kill -9（多 PID）— 一次 kill 多個 PID
//  P3.6 新增：
//  15. sudo tee /etc/   — 寫入系統設定目錄（排除 /tmp）
//  16. sudo chmod -R 777 非暫存目錄 — 遞迴開放非暫存目錄全權限
//  17. osascript.*delete — AppleScript 刪除操作
//  18. launchctl unload — 停用系統服務
//  19. defaults delete / defaults write — 刪除或修改系統偏好設定
//
// 允許：
//   一般開發命令（bun、node、git、ls 等）
//   sudo tee /tmp/...（暫存目錄）
//   sudo chmod -R 777 /tmp/...（暫存目錄）
//   osascript 不含 delete 的操作

const { safeReadStdin, safeRun } = require('../../../scripts/lib/hook-utils');

// 危險命令黑名單
const BLACKLIST = [
  { pattern: /\bsudo\s+rm\s+-rf\s+\/(\s|$|\*)/, label: '刪除根目錄' },
  { pattern: /\brm\s+-rf\s+\/(\s|$|\*)/, label: '刪除根目錄' },
  { pattern: /\bmkfs\b/, label: '格式化磁碟' },
  { pattern: /\bdd\s+if=.*of=\/dev\//, label: '直接寫入磁碟裝置' },
  { pattern: /\bpasswd\s+root\b/, label: '修改 root 密碼' },
  { pattern: /\bchmod\s+777\s+\/(\s|$)/, label: '開放根目錄全權限' },
  { pattern: /\bvisudo\b/, label: '修改 sudoers' },
  { pattern: /\biptables\s+-F\b/, label: '清空防火牆規則' },
  { pattern: /\bifconfig.*down\b/, label: '停用網路介面' },
  { pattern: /\bkillall\s+-9\b/, label: '強制終止所有進程' },
  { pattern: /\bkill\s+-9\s+1\b/, label: '終止 init 進程' },
  // P3.3 新增：擴充 kill 相關危險命令保護
  { pattern: /\bkillall\s+(?!-)\S+/, label: 'name-based 批量終止進程' },
  { pattern: /\bpkill\b/, label: 'pattern-based 批量終止進程' },
  { pattern: /\bkill\s+-9\s+\d+\s+\d+/, label: '批量 kill -9 多個 PID' },
  // P3.6 新增：OS 層危險操作保護
  // sudo tee 寫入系統設定目錄（排除 /tmp 路徑）
  { pattern: /\bsudo\s+tee\s+(?!\/tmp\/)\//, label: '寫入系統設定目錄' },
  // sudo chmod -R 777 非暫存目錄（排除 /tmp 路徑）
  { pattern: /\bsudo\s+chmod\s+-R\s+777\s+(?!\/tmp\/)\//, label: '遞迴開放非暫存目錄全權限' },
  // osascript 含 delete 操作（不含 delete 的放行）
  { pattern: /\bosascript\b.*\bdelete\b/, label: 'AppleScript 刪除操作' },
  // launchctl unload — 停用系統服務
  { pattern: /\blaunchctl\s+unload\b/, label: '停用系統服務' },
  // defaults delete 或 defaults write — 刪除或修改系統偏好設定
  { pattern: /\bdefaults\s+(delete|write)\b/, label: '修改或刪除系統偏好設定' },
];

// ── 入口守衛 ──
if (require.main === module) {
safeRun(() => {
  const input = safeReadStdin();
  const toolInput = input.tool_input || {};
  const command = toolInput.command || '';

  if (!command) {
    // 無命令 → 放行
    process.stdout.write(JSON.stringify({ result: '' }));
    process.exit(0);
  }

  const dangerLabel = checkDangerousCommand(command);
  if (dangerLabel) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: [
          '⛔ 危險 OS 命令已攔截！',
          '',
          `命令：${command}`,
          `類別：${dangerLabel}`,
          '',
          '此操作可能造成不可逆的系統損害。',
          '如確實需要執行，請在 CLI 中手動操作。',
        ].join('\n'),
      },
    }));
    process.exit(0);
  }

  // 不在黑名單 → 放行
  process.stdout.write(JSON.stringify({ result: '' }));
  process.exit(0);
}, { result: '' });
}

/**
 * 檢查命令是否為危險命令
 * @param {string} command - 要檢查的 shell 命令
 * @returns {string|null} 危險類別字串（如 "刪除根目錄"），安全命令回傳 null
 */
function checkDangerousCommand(command) {
  if (!command) return null;
  for (const { pattern, label } of BLACKLIST) {
    if (pattern.test(command)) {
      return label;
    }
  }
  return null;
}

// ── 純函數匯出 ──
module.exports = { checkDangerousCommand };
