#!/usr/bin/env node
'use strict';
/**
 * PreCompact hook — 在 context 壓縮前注入工作流狀態恢復訊息
 *
 * 觸發：Claude Code 即將壓縮 context window 時
 * 職責：
 *   ✅ 讀取 workflow.json 組裝狀態摘要
 *   ✅ 讀取 specs 活躍 feature 的未完成任務
 *   ✅ 輸出 systemMessage 讓壓縮後的 Main Agent 能恢復工作
 *   ✅ emit session:compact timeline 事件
 *   ✅ 任何失敗 fallback { result: '' }（不阻擋 compaction）
 */

const { readFileSync } = require('fs');
const state = require('../../../scripts/lib/state');
const timeline = require('../../../scripts/lib/timeline');
const { stages } = require('../../../scripts/lib/registry');
const { atomicWrite } = require('../../../scripts/lib/utils');
const { safeReadStdin, safeRun, buildPendingTasksMessage, buildProgressBar, getSessionId } = require('../../../scripts/lib/hook-utils');
const paths = require('../../../scripts/lib/paths');

const MAX_MESSAGE_LENGTH = 2000;

safeRun(() => {
  const input = safeReadStdin();
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
    process.stdout.write(JSON.stringify({ result: '' }));
    process.exit(0);
  }

  // 讀取 workflow 狀態
  const currentState = state.readState(sessionId);
  if (!currentState) {
    // 無 workflow → 空操作
    process.stdout.write(JSON.stringify({ result: '' }));
    process.exit(0);
  }

  // emit timeline 事件（記錄 compaction 發生）
  timeline.emit(sessionId, 'session:compact', {
    workflowType: currentState.workflowType,
    currentStage: currentState.currentStage,
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
  // Claude Code PreCompact stdin 用 trigger 欄位（'auto' | 'manual'）
  const trigger = input.trigger || input.type || '';
  if (trigger === 'auto') {
    compactCount.auto = (compactCount.auto || 0) + 1;
  } else {
    compactCount.manual = (compactCount.manual || 0) + 1;
  }
  atomicWrite(compactCountPath, compactCount);

  // ── 組裝 workflow 狀態摘要 ──

  const lines = [];
  lines.push('[Overtone 狀態恢復（compact 後）]');

  // workflow type
  lines.push(`工作流：${currentState.workflowType}`);

  // 進度條
  const stageEntries = Object.entries(currentState.stages || {});
  const completed = stageEntries.filter(([, s]) => s.status === 'completed').length;
  const total = stageEntries.length;
  const progressBar = buildProgressBar(stageEntries, stages);
  lines.push(`進度：${progressBar} (${completed}/${total})`);

  // 目前階段
  if (currentState.currentStage) {
    const base = currentState.currentStage.split(':')[0];
    const def = stages[base];
    lines.push(`目前階段：${def?.emoji || ''} ${def?.label || currentState.currentStage}`);
  }

  // fail/reject 計數（僅大於 0 時顯示）
  if (currentState.failCount > 0) {
    lines.push(`失敗次數：${currentState.failCount}/3`);
  }
  if (currentState.rejectCount > 0) {
    lines.push(`拒絕次數：${currentState.rejectCount}/3`);
  }

  // 活躍 agents（僅有時顯示）
  const activeAgents = Object.entries(currentState.activeAgents || {});
  if (activeAgents.length > 0) {
    const agentList = activeAgents.map(([name, info]) => `${name}（${info.stage}）`).join(', ');
    lines.push(`活躍 Agents：${agentList}`);
  }

  // featureName（若 workflow.json 有記錄）
  if (currentState.featureName) {
    lines.push(`Feature：${currentState.featureName}`);
  }

  // ── 未完成任務（共用函式，specs 讀取失敗時靜默跳過）──
  const pendingMsg = buildPendingTasksMessage(projectRoot);
  if (pendingMsg) {
    lines.push('');
    lines.push(pendingMsg);
  }

  // ── 行動指引 ──
  lines.push('');
  lines.push('⛔ 禁止詢問使用者「我該繼續嗎？」，直接依照目前階段繼續執行。');
  lines.push('如需查看工作流指引，請使用 /ot:auto。');

  // ── 截斷保護（2000 字元上限）──
  let message = lines.join('\n');
  if (message.length > MAX_MESSAGE_LENGTH) {
    message = message.slice(0, MAX_MESSAGE_LENGTH - 50) + '\n... (已截斷，完整狀態請查看 workflow.json)';
  }

  process.stdout.write(JSON.stringify({
    systemMessage: message,
    result: '',
  }));
  process.exit(0);
}, { result: '' });
