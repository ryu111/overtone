#!/usr/bin/env node
'use strict';
/**
 * PostToolUseFailure hook — 工具失敗監控
 *
 * 觸發：工具在平台層級失敗時（工具無法執行，非應用層級錯誤）
 * 職責：
 *   ✅ is_interrupt=true → 跳過（使用者手動中斷，非系統錯誤）
 *   ✅ emit tool:failure timeline 事件
 *   ✅ 記錄 Instinct 觀察（type: error_resolutions）
 *   ✅ 重大失敗（Task, Write, Edit）→ 注入 systemMessage 提示 Main Agent
 *   ✅ 其他 tool → 只記錄不提示
 *
 * 與 PostToolUse 的關係：互斥。PostToolUseFailure 在工具平台層級失敗時觸發，
 * PostToolUse 在工具成功完成後觸發（Bash exit code 非零是應用層級失敗）。
 */

const timeline = require('../../../scripts/lib/timeline');
const instinct = require('../../../scripts/lib/instinct');
const { safeReadStdin, safeRun, getSessionId, hookError } = require('../../../scripts/lib/hook-utils');

// 重大失敗工具清單（需要注入 systemMessage）
const CRITICAL_TOOLS = ['Task', 'Write', 'Edit'];

if (require.main === module) safeRun(() => {
  const input = safeReadStdin();
  const sessionId = getSessionId(input);

  // 無 sessionId → 靜默退出
  if (!sessionId) {
    process.stdout.write(JSON.stringify({ result: '' }));
    process.exit(0);
  }

  const toolName = input.tool_name || '';
  const error = input.error || '';
  const isInterrupt = input.is_interrupt === true;

  // is_interrupt=true → 使用者手動中斷，非系統錯誤，不記錄
  if (isInterrupt) {
    process.stdout.write(JSON.stringify({ result: '' }));
    process.exit(0);
  }

  // 錯誤摘要（最多 120 字元）
  const errorSummary = error.slice(0, 120);

  // ── 1. emit tool:failure timeline 事件（Task、Write、Edit、Bash 才 emit）──

  const shouldEmitTimeline = CRITICAL_TOOLS.includes(toolName) || toolName === 'Bash';

  if (shouldEmitTimeline) {
    try {
      timeline.emit(sessionId, 'tool:failure', {
        toolName,
        error: errorSummary,
      });
    } catch (err) {
      hookError('post-use-failure', `emit tool:failure 失敗：${err.message || String(err)}`);
    }
  }

  // ── 2. 記錄 Instinct 觀察（error_resolutions）──

  try {
    instinct.emit(
      sessionId,
      'error_resolutions',
      `${toolName} 工具失敗：${errorSummary}`,
      `偵測到 ${toolName} 平台層級失敗`,
      `tool-failure-${toolName.toLowerCase()}`
    );
  } catch (err) {
    hookError('post-use-failure', `Instinct emit 失敗：${err.message || String(err)}`);
  }

  // ── 3. 重大失敗 → 注入 systemMessage ──

  if (CRITICAL_TOOLS.includes(toolName)) {
    let message;
    if (toolName === 'Task') {
      message = [
        `[Overtone 工具失敗] agent 委派失敗（Task 工具無法執行）`,
        `錯誤：${errorSummary}`,
        '',
        '📋 建議處理：',
        '  1. 確認 subagent_type 是否為合法的 Overtone agent 名稱',
        '  2. 重試委派，或調整任務範圍後重試',
        '  3. 若持續失敗，請人工介入診斷',
      ].join('\n');
    } else {
      // Write 或 Edit
      message = [
        `[Overtone 工具失敗] 檔案操作失敗（${toolName} 工具無法執行）`,
        `錯誤：${errorSummary}`,
        '',
        '📋 建議處理：',
        '  1. 確認目標路徑是否存在且有寫入權限',
        '  2. 確認磁碟空間是否足夠',
        '  3. 調整檔案路徑後重試',
      ].join('\n');
    }

    process.stdout.write(JSON.stringify({ result: message }));
    process.exit(0);
  }

  // 其他 tool（Bash、Grep 等）→ 只記錄，不注入 systemMessage
  process.stdout.write(JSON.stringify({ result: '' }));
  process.exit(0);
}, { result: '' });
