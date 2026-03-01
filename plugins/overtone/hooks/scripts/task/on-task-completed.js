#!/usr/bin/env node
'use strict';
/**
 * TaskCompleted hook — 品質門檻硬阻擋
 *
 * 觸發：Task 被標記完成時
 * 職責：
 *   ✅ [DEV] task → 執行 bun test 驗證
 *   ✅ 其他 task → 直接放行
 *
 * Exit code 語義：
 *   0 → 允許完成
 *   2 → 阻擋完成，stderr 告知失敗原因
 */

const { execSync } = require('child_process');
const { safeReadStdin, safeRun, hookError } = require('../../../scripts/lib/hook-utils');

const input = safeReadStdin();

safeRun(() => {
  const subject = input.task_subject || '';

  // 只對 [DEV] stage 的 task 執行品質門檻
  if (!subject.startsWith('[DEV]')) {
    process.exit(0);  // 非 DEV task，直接放行
  }

  // 執行 bun test
  try {
    const projectRoot = input.cwd || process.env.CLAUDE_PROJECT_ROOT || process.cwd();
    execSync('bun test', {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 45000,  // 45 秒超時
    });
    // 測試通過 → exit 0
    process.exit(0);
  } catch (err) {
    // 測試失敗 → exit 2 阻擋
    const stderr = err.stderr ? err.stderr.toString().slice(-500) : '未知錯誤';
    process.stderr.write(`品質門檻未通過：測試失敗。請修復後再標記 DEV 完成。\n${stderr}`);
    process.exit(2);
  }
}, {});
