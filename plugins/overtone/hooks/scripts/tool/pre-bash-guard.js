#!/usr/bin/env node
'use strict';
// PreToolUse(Bash) guard — 攔截危險的 OS 命令
//
// 觸發：每次 Claude 使用 Bash 工具時
// 職責：
//   偵測黑名單中的危險系統命令，阻擋可能造成不可逆損害的操作
//
// 黑名單規則（11 條）：
//   1. sudo rm -rf /    — 刪除根目錄（有 sudo）
//   2. rm -rf /         — 刪除根目錄（無 sudo）
//   3. mkfs             — 格式化磁碟
//   4. dd if=... of=/dev/ — 直接寫入磁碟裝置
//   5. passwd root      — 修改 root 密碼
//   6. chmod 777 /      — 開放根目錄全權限
//   7. visudo           — 修改 sudoers
//   8. iptables -F      — 清空防火牆規則
//   9. ifconfig ... down — 停用網路介面
//  10. killall -9       — 強制終止所有進程
//  11. kill -9 1        — 終止 init 進程
//
// 允許：
//   一般開發命令（bun、node、git、ls 等）

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
];

safeRun(() => {
  const input = safeReadStdin();
  const toolInput = input.tool_input || {};
  const command = toolInput.command || '';

  if (!command) {
    // 無命令 → 放行
    process.stdout.write(JSON.stringify({ result: '' }));
    process.exit(0);
  }

  // 檢查是否匹配黑名單
  for (const { pattern, label } of BLACKLIST) {
    if (pattern.test(command)) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: [
            '⛔ 危險 OS 命令已攔截！',
            '',
            `命令：${command}`,
            `類別：${label}`,
            '',
            '此操作可能造成不可逆的系統損害。',
            '如確實需要執行，請在 CLI 中手動操作。',
          ].join('\n'),
        },
      }));
      process.exit(0);
    }
  }

  // 不在黑名單 → 放行
  process.stdout.write(JSON.stringify({ result: '' }));
  process.exit(0);
}, { result: '' });
