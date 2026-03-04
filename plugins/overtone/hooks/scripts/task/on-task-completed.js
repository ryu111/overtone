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
const { safeReadStdin, safeRun, hookError, getSessionId } = require('../../../scripts/lib/hook-utils');

const input = safeReadStdin();

safeRun(() => {
  const startTime = Date.now();
  const sessionId = getSessionId(input);
  const subject = input.task_subject || '';

  // 輔助：emit hook:timing（只在有 sessionId 時才寫入，失敗不影響 hook 功能）
  const emitTiming = (extra = {}) => {
    if (!sessionId) return;
    try {
      const timeline = require('../../../scripts/lib/timeline');
      timeline.emit(sessionId, 'hook:timing', {
        hook: 'on-task-completed',
        event: 'TaskCompleted',
        durationMs: Date.now() - startTime,
        ...extra,
      });
    } catch { /* 計時 emit 失敗不影響 hook 功能 */ }
  };

  // 只對 [DEV] stage 的 task 執行品質門檻
  if (!subject.startsWith('[DEV]')) {
    emitTiming();
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
    // 測試通過 → 記錄計時後 exit 0
    emitTiming();
    process.exit(0);
  } catch (err) {
    // 測試失敗 → exit 2 阻擋（計時仍記錄）
    emitTiming({ failed: true });
    const stderr = err.stderr ? err.stderr.toString().slice(-500) : '未知錯誤';
    process.stderr.write(`品質門檻未通過：測試失敗。請修復後再標記 DEV 完成。\n${stderr}`);
    process.exit(2);
  }
}, {});
