#!/usr/bin/env node
'use strict';
/**
 * Stop hook — Loop 迴圈 + 完成度檢查 + Dashboard 通知
 *
 * 觸發：Claude 要結束回覆時
 * 職責：
 *   ✅ 檢查 workflow 完成度
 *   ✅ Loop 模式：未完成時 block + 重注入 prompt
 *   ✅ 退出條件：checkbox 全完成 / /ot:stop / max iterations / 連續錯誤
 *   ✅ emit timeline 事件
 *   ✅ Dashboard 通知（Phase 4 佔位）
 */

const { readFileSync, writeFileSync, mkdirSync } = require('fs');
const { dirname } = require('path');
const paths = require('../../../scripts/lib/paths');
const state = require('../../../scripts/lib/state');
const timeline = require('../../../scripts/lib/timeline');
const { stages, loopDefaults } = require('../../../scripts/lib/registry');

// ── 從 stdin 讀取 hook input ──

const input = JSON.parse(readFileSync('/dev/stdin', 'utf8'));
const sessionId = process.env.CLAUDE_SESSION_ID || '';
const stopReason = (input.stop_reason || '').trim();

// 無 session → 不擋
if (!sessionId) {
  process.stdout.write(JSON.stringify({ result: '' }));
  process.exit(0);
}

// ── 讀取狀態 ──

const currentState = state.readState(sessionId);
if (!currentState) {
  // 無 workflow → 不擋
  process.stdout.write(JSON.stringify({ result: '' }));
  process.exit(0);
}

// ── 讀取 loop 狀態 ──

const loopState = readLoopState(sessionId);

// ── 檢查退出條件 ──

// 1. /ot:stop 手動退出
if (loopState.stopped) {
  exitLoop(sessionId, loopState, '手動退出（/ot:stop）');
  process.stdout.write(JSON.stringify({ result: '🛑 Loop 已手動停止。' }));
  process.exit(0);
}

// 2. max iterations
if (loopState.iteration >= loopDefaults.maxIterations) {
  exitLoop(sessionId, loopState, `達到最大迭代（${loopDefaults.maxIterations}）`);
  const msg = `⏸️ 已達最大迭代次數（${loopState.iteration}/${loopDefaults.maxIterations}）。使用 /ot:stop 退出或繼續。`;
  process.stdout.write(JSON.stringify({ result: msg }));
  process.exit(0);
}

// 3. 連續錯誤
if (loopState.consecutiveErrors >= loopDefaults.maxConsecutiveErrors) {
  exitLoop(sessionId, loopState, `連續 ${loopState.consecutiveErrors} 次錯誤`);
  const msg = `⛔ 連續 ${loopState.consecutiveErrors} 次錯誤，暫停 Loop。請檢查問題後再繼續。`;
  process.stdout.write(JSON.stringify({ result: msg }));
  process.exit(0);
}

// ── 檢查 workflow 完成度 ──

const stageStatuses = Object.entries(currentState.stages);
const totalStages = stageStatuses.length;
const completedStages = stageStatuses.filter(([, s]) => s.status === 'completed').length;
const allCompleted = completedStages === totalStages;

// 4. 全部完成 → 允許退出
if (allCompleted) {
  exitLoop(sessionId, loopState, '工作流完成');

  const summary = buildCompletionSummary(currentState);
  timeline.emit(sessionId, 'workflow:complete', {
    workflowType: currentState.workflowType,
    duration: calcDuration(currentState.createdAt),
  });

  process.stdout.write(JSON.stringify({
    result: summary,
  }));
  process.exit(0);
}

// ── 未完成 → Loop 繼續 ──

// 遞增 iteration
loopState.iteration += 1;
writeLoopState(sessionId, loopState);

timeline.emit(sessionId, 'loop:advance', {
  iteration: loopState.iteration,
  progress: `${completedStages}/${totalStages}`,
});

// 產生繼續 prompt
const nextStage = currentState.currentStage;
const base = nextStage ? nextStage.split(':')[0] : null;
const def = base ? stages[base] : null;

const progressBar = stageStatuses.map(([k, s]) => {
  const b = k.split(':')[0];
  const icon = s.status === 'completed' ? '✅' : s.status === 'active' ? '⏳' : '⬜';
  return `${icon}${stages[b]?.emoji || ''}`;
}).join('');

const continueMessage = [
  `[Overtone Loop ${loopState.iteration}/${loopDefaults.maxIterations}]`,
  `進度：${progressBar} (${completedStages}/${totalStages})`,
  def ? `⏭️ 繼續：委派 ${def.emoji} ${def.agent}（${def.label}）` : '⏭️ 繼續執行下一步',
  '⛔ 禁止詢問使用者，直接繼續執行。',
].join('\n');

process.stdout.write(JSON.stringify({
  decision: 'block',
  reason: continueMessage,
}));

// ── 輔助函式 ──

/**
 * 讀取 loop.json
 */
function readLoopState(sid) {
  const filePath = paths.session.loop(sid);
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    // 初始 loop 狀態
    const initial = {
      iteration: 0,
      stopped: false,
      consecutiveErrors: 0,
      startedAt: new Date().toISOString(),
    };
    writeLoopState(sid, initial);
    return initial;
  }
}

/**
 * 寫入 loop.json
 */
function writeLoopState(sid, loopData) {
  const filePath = paths.session.loop(sid);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(loopData, null, 2) + '\n', 'utf8');
}

/**
 * 結束 loop
 */
function exitLoop(sid, loopData, reason) {
  loopData.stopped = true;
  loopData.stoppedAt = new Date().toISOString();
  loopData.stopReason = reason;
  writeLoopState(sid, loopData);

  timeline.emit(sid, 'loop:complete', {
    iteration: loopData.iteration,
    reason,
  });
}

/**
 * 產生完成摘要
 */
function buildCompletionSummary(ws) {
  const stageResults = Object.entries(ws.stages).map(([k, s]) => {
    const base = k.split(':')[0];
    const def = stages[base];
    const icon = s.result === 'pass' ? '✅' : s.result === 'fail' ? '❌' : s.result === 'reject' ? '🔙' : '⬜';
    return `  ${icon} ${def?.emoji || ''} ${def?.label || k}`;
  });

  return [
    `🎉 工作流完成！（${ws.workflowType}）`,
    '',
    ...stageResults,
    '',
    ws.failCount > 0 ? `⚠️ 失敗重試：${ws.failCount} 次` : '',
    ws.rejectCount > 0 ? `⚠️ 審查拒絕：${ws.rejectCount} 次` : '',
    `⏱️ 耗時：${calcDuration(ws.createdAt)}`,
  ].filter(Boolean).join('\n');
}

/**
 * 計算經過時間
 */
function calcDuration(startIso) {
  const ms = Date.now() - new Date(startIso).getTime();
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}
