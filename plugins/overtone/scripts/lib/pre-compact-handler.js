'use strict';
/**
 * pre-compact-handler.js — PreCompact 業務邏輯 handler
 *
 * 從 pre-compact.js hook 提取的純業務邏輯，供薄殼 hook 呼叫。
 * 不呼叫 process.exit() 或 process.stdout.write()，回傳結構化結果。
 */

const { readFileSync } = require('fs');
const state = require('./state');
const timeline = require('./timeline');
const { stages, parallelGroups } = require('./registry');
const { atomicWrite } = require('./utils');
const { buildPendingTasksMessage, buildProgressBar, getSessionId } = require('./hook-utils');
const paths = require('./paths');

const MAX_MESSAGE_LENGTH = 2000;

/**
 * 處理 PreCompact 事件
 * @param {object} input - hook stdin 解析後的物件
 * @returns {{ output: { systemMessage?: string, result: string } }}
 */
function handlePreCompact(input) {
  let sessionId = getSessionId(input);

  // Fallback: 若 stdin 有效但缺 session_id，從 .current-session-id 讀取
  // 空/畸形 JSON（input 無任何欄位）不觸發 fallback
  if (!sessionId && Object.keys(input).length > 0) {
    try {
      sessionId = readFileSync(paths.CURRENT_SESSION_FILE, 'utf8').trim() || null;
    } catch {
      // 靜默
    }
  }

  const projectRoot = input.cwd || process.env.CLAUDE_PROJECT_ROOT || process.cwd();

  // 無 session → 空操作，不阻擋 compaction
  if (!sessionId) {
    return { output: { result: '' } };
  }

  // 讀取 workflow 狀態
  const currentState = state.readState(sessionId);
  if (!currentState) {
    // 無 workflow → 空操作
    return { output: { result: '' } };
  }

  // Claude Code PreCompact stdin 用 trigger 欄位（'auto' | 'manual'）
  // 注意：auto-compact 可能不送 trigger 欄位，所以預設歸類為 auto
  const trigger = input.trigger || input.type || '';
  const isManual = trigger === 'manual';

  // emit timeline 事件（記錄 compaction 發生 + trigger 值供診斷）
  timeline.emit(sessionId, 'session:compact', {
    workflowType: currentState.workflowType,
    currentStage: currentState.currentStage,
    trigger: trigger || '(empty)',
    counted: isManual ? 'manual' : 'auto',
  });

  // 追蹤 compact 計數（auto vs manual）
  const compactCountPath = paths.session.compactCount(sessionId);
  let compactCount = { auto: 0, manual: 0 };
  try {
    const raw = readFileSync(compactCountPath, 'utf8');
    compactCount = JSON.parse(raw);
  } catch {
    // 檔案不存在時從 { auto: 0, manual: 0 } 開始
  }
  if (isManual) {
    compactCount.manual = (compactCount.manual || 0) + 1;
  } else {
    compactCount.auto = (compactCount.auto || 0) + 1;
  }
  atomicWrite(compactCountPath, compactCount);

  // 壓縮後清空 activeAgents（舊 subagent 的 SubagentStop 不會觸發，清除殘留）
  state.updateStateAtomic(sessionId, (s) => { s.activeAgents = {}; return s; });
  currentState.activeAgents = {}; // 同步記憶體物件，讓後續 getNextStageHint 讀到正確狀態

  // ── 組裝 workflow 狀態摘要 ──

  const stageEntries = Object.entries(currentState.stages || {});
  const completed = stageEntries.filter(([, s]) => s.status === 'completed').length;
  const total = stageEntries.length;
  const progressBar = buildProgressBar(stageEntries, stages);
  const stageHint = state.getNextStageHint(currentState, { stages, parallelGroups });

  // ── 未完成任務 ──
  const pendingMsg = buildPendingTasksMessage(projectRoot);

  // ── execution-queue ──
  let queueSummary = null;
  try {
    const executionQueue = require('./execution-queue');
    queueSummary = executionQueue.formatQueueSummary(projectRoot) || null;
  } catch {
    // 佇列載入失敗不阻擋 compaction
  }

  const message = buildCompactMessage({
    currentState,
    progressBar,
    completed,
    total,
    stageHint,
    pendingMsg,
    queueSummary,
    stages,
    parallelGroups,
  });

  return { output: { systemMessage: message, result: '' } };
}

/**
 * 組裝壓縮恢復訊息
 * @param {object} ctx
 * @param {object|null} ctx.currentState - workflow 狀態物件
 * @param {string} ctx.progressBar - 進度條字串
 * @param {number} ctx.completed - 已完成 stage 數
 * @param {number} ctx.total - 總 stage 數
 * @param {string|null} ctx.stageHint - 目前階段提示
 * @param {string|null} ctx.pendingMsg - 未完成任務訊息
 * @param {string|null} ctx.queueSummary - 執行佇列摘要
 * @param {object} ctx.stages - stages 定義物件（registry）
 * @param {object} ctx.parallelGroups - parallelGroups 定義物件（registry）
 * @param {number} [ctx.MAX_MESSAGE_LENGTH] - 截斷上限（預設 2000）
 * @returns {string} systemMessage 字串
 */
function buildCompactMessage(ctx) {
  const {
    currentState,
    progressBar = '',
    completed = 0,
    total = 0,
    stageHint = null,
    pendingMsg = null,
    queueSummary = null,
    MAX_MESSAGE_LENGTH: maxLen = MAX_MESSAGE_LENGTH,
  } = ctx || {};

  const lines = [];
  lines.push('[Overtone 狀態恢復（compact 後）]');

  if (currentState) {
    lines.push(`工作流：${currentState.workflowType}`);
    lines.push(`進度：${progressBar} (${completed}/${total})`);
    if (stageHint) {
      lines.push(`目前階段：${stageHint}`);
    }
    if (currentState.failCount > 0) {
      lines.push(`失敗次數：${currentState.failCount}/3`);
    }
    if (currentState.rejectCount > 0) {
      lines.push(`拒絕次數：${currentState.rejectCount}/3`);
    }
    if (currentState.featureName) {
      lines.push(`Feature：${currentState.featureName}`);
    }

    // 結構化待執行動作（確保 context 壓縮後不遺失 reject/fail 的修復指令）
    if (currentState.pendingAction) {
      const pa = currentState.pendingAction;
      lines.push('');
      if (pa.type === 'fix-reject') {
        lines.push(`⚠️ 待執行：REVIEW 被拒絕（${pa.count}/3），必須委派 DEVELOPER 修復後重新 REVIEW`);
        if (pa.reason) lines.push(`拒絕原因：${pa.reason}`);
        lines.push('📋 MUST：委派 developer agent（帶入拒絕原因）→ 修復完成後委派 code-reviewer 再審');
      } else if (pa.type === 'fix-fail') {
        lines.push(`⚠️ 待執行：${pa.stage} 失敗（${pa.count}/3），必須委派 DEBUGGER 診斷後 DEVELOPER 修復`);
        if (pa.reason) lines.push(`失敗原因：${pa.reason}`);
        lines.push('📋 MUST：委派 debugger agent 分析根因 → developer 修復 → tester 驗證');
      }
    }
  }

  if (pendingMsg) {
    lines.push('');
    lines.push(pendingMsg);
  }

  if (queueSummary) {
    lines.push('');
    lines.push(queueSummary);
  }

  lines.push('');
  lines.push('⛔ 禁止使用 AskUserQuestion。工作流進行中，直接依照目前階段繼續執行，不要停下來詢問使用者任何問題。');
  lines.push('如需查看工作流指引，請使用 /ot:auto。');

  let message = lines.join('\n');
  if (message.length > maxLen) {
    message = message.slice(0, maxLen - 50) + '\n... (已截斷，完整狀態請查看 workflow.json)';
  }

  return message;
}

module.exports = { handlePreCompact, buildCompactMessage };
