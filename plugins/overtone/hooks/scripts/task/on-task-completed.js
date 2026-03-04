#!/usr/bin/env node
'use strict';
/**
 * TaskCompleted hook — 品質門檻（預留擴充點）
 *
 * 觸發：Task 被標記完成時
 * 職責：
 *   ✅ 所有 task → 直接放行（記錄 hook:timing）
 *
 * 設計說明：
 *   bun test 全量執行需 58s，超過 45s timeout，導致 100% 假失敗。
 *   DEV agent 自身停止條件已包含「測試通過」，此 hook 不再重複執行 bun test。
 *   保留 hook 結構作為未來可掛其他快速品質檢查的擴充點。
 *
 * Exit code 語義：
 *   0 → 允許完成
 *   2 → 阻擋完成，stderr 告知失敗原因（目前不使用）
 */

const { safeReadStdin, safeRun, getSessionId } = require('../../../scripts/lib/hook-utils');

// ── 入口守衛 ──
if (require.main === module) {
const input = safeReadStdin();

safeRun(() => {
  const startTime = Date.now();
  const sessionId = getSessionId(input);

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

  // 所有 task 直接放行，記錄計時
  emitTiming();
  process.exit(0);
}, {});
}

// ── 純函數匯出（Phase 2 會填入）──
module.exports = {};
