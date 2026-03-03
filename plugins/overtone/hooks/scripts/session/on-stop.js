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
 *   ✅ Dashboard 通知（透過 timeline emit → SSE file watcher 推送）
 */

const { join } = require('path');
const state = require('../../../scripts/lib/state');
const timeline = require('../../../scripts/lib/timeline');
const loop = require('../../../scripts/lib/loop');
const { stages, loopDefaults, specsConfig } = require('../../../scripts/lib/registry');
const { safeReadStdin, safeRun, hookError, buildProgressBar, getSessionId } = require('../../../scripts/lib/hook-utils');
const { playSound, SOUNDS } = require('../../../scripts/lib/sound'); // 只用 HERO

safeRun(() => {
  // ── 從 stdin 讀取 hook input ──

  const input = safeReadStdin();
  const sessionId = getSessionId(input);
  const projectRoot = input.cwd || '';

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

  const loopState = loop.readLoop(sessionId);

  // loop:start — 首次進入（iteration === 0）
  if (loopState.iteration === 0) {
    timeline.emit(sessionId, 'loop:start', {
      workflowType: currentState.workflowType,
    });
  }

  // ── 檢查 workflow 完成度（在退出條件之前，確保歸檔不被繞過） ──

  const stageStatuses = Object.entries(currentState.stages);
  const totalStages = stageStatuses.length;
  const completedStages = stageStatuses.filter(([, s]) => s.status === 'completed').length;
  const allStagesCompleted = completedStages === totalStages;

  // tasks.md 完成度（用 featureName 直接定位，避免多 feature 並行時取錯）
  const featureName = currentState.featureName || null;
  const tasksStatus = projectRoot ? loop.readTasksStatus(projectRoot, featureName) : null;
  const allCompleted = allStagesCompleted && (tasksStatus === null || tasksStatus.allChecked);

  // tasksStatus null 診斷警告
  if (tasksStatus === null && specsConfig[currentState.workflowType]?.length > 0 && featureName && projectRoot) {
    hookError('on-stop', `診斷：${featureName} tasks.md 不存在或無法讀取，無法驗證 specs 完成度`);
    timeline.emit(sessionId, 'specs:tasks-missing', { featureName, workflowType: currentState.workflowType });
  }

  // Specs 自動歸檔：workflow 完成且無失敗 stage 時，無論退出原因都先歸檔
  const hasFailedStage = allCompleted ? stageStatuses.some(([, s]) => s.result === 'fail') : false;
  if (allCompleted && !hasFailedStage && featureName) {
    try {
      const specs = require('../../../scripts/lib/specs');
      const tasksPath = join(specs.featurePath(projectRoot, featureName), 'tasks.md');
      const frontmatter = specs.readTasksFrontmatter(tasksPath);
      const taskWorkflow = frontmatter?.workflow;
      if (taskWorkflow && taskWorkflow !== currentState.workflowType) {
        hookError('on-stop', `警告：tasks.md workflow（${taskWorkflow}）與當前 workflow（${currentState.workflowType}）不匹配，跳過歸檔`);
        timeline.emit(sessionId, 'specs:archive-skipped', {
          featureName,
          reason: 'workflow-mismatch',
          tasksWorkflow: taskWorkflow,
          stateWorkflow: currentState.workflowType,
        });
      } else {
        const archivePath = specs.archiveFeature(projectRoot, featureName);
        timeline.emit(sessionId, 'specs:archive', { featureName, archivePath });
      }
    } catch (archErr) {
      hookError('on-stop', `警告：歸檔失敗 — ${archErr.message}`);
    }
  }

  // ── 檢查退出條件 ──

  // 1. /ot:stop 手動退出
  if (loopState.stopped) {
    loop.exitLoop(sessionId, loopState, '手動退出（/ot:stop）');
    process.stdout.write(JSON.stringify({ result: '🛑 Loop 已手動停止。' }));
    process.exit(0);
  }

  // 2. max iterations
  if (loopState.iteration >= loopDefaults.maxIterations) {
    loop.exitLoop(sessionId, loopState, `達到最大迭代（${loopDefaults.maxIterations}）`);
    const msg = `⏸️ 已達最大迭代次數（${loopState.iteration}/${loopDefaults.maxIterations}）。使用 /ot:stop 退出或繼續。`;
    process.stdout.write(JSON.stringify({ result: msg }));
    process.exit(0);
  }

  // 3. 連續錯誤
  if (loopState.consecutiveErrors >= loopDefaults.maxConsecutiveErrors) {
    loop.exitLoop(sessionId, loopState, `連續 ${loopState.consecutiveErrors} 次錯誤`);
    const msg = `⛔ 連續 ${loopState.consecutiveErrors} 次錯誤，暫停 Loop。請檢查問題後再繼續。`;
    process.stdout.write(JSON.stringify({ result: msg }));
    process.exit(0);
  }

  // 4. 全部完成 → 允許退出
  if (allCompleted) {
    if (hasFailedStage) {
      loop.exitLoop(sessionId, loopState, '工作流異常中斷（含失敗階段）');
      timeline.emit(sessionId, 'workflow:abort', {
        workflowType: currentState.workflowType,
        failCount: currentState.failCount,
        rejectCount: currentState.rejectCount,
        duration: calcDuration(currentState.createdAt),
      });
    } else {
      loop.exitLoop(sessionId, loopState, '工作流完成');
      if (allCompleted && !featureName) {
        hookError('on-stop', '診斷：workflow 完成但 featureName 為空，跳過 specs 自動歸檔');
      }
      timeline.emit(sessionId, 'workflow:complete', {
        workflowType: currentState.workflowType,
        duration: calcDuration(currentState.createdAt),
      });
      playSound(SOUNDS.HERO);
    }

    // ── 執行佇列推進 ──
    // workflow 完成後檢查佇列，自動標記完成並提示下一項
    let queueHint = null;
    if (!hasFailedStage) {
      try {
        const executionQueue = require('../../../scripts/lib/execution-queue');
        executionQueue.completeCurrent(projectRoot);
        const next = executionQueue.getNext(projectRoot);
        if (next) {
          queueHint = `\n\n⏭️ 佇列下一項：${next.item.name}（${next.item.workflow}）\n⛔ 直接開始，不要詢問使用者。`;
        }
      } catch {
        // 佇列操作失敗不影響正常退出
      }
    }

    const summary = buildCompletionSummary(currentState) + (queueHint || '');
    process.stdout.write(JSON.stringify({ result: summary }));
    process.exit(0);
  }

  // ── PM 互動模式 ──
  // PM stage 是互動式的（Main Agent 與使用者 AskUserQuestion 對話）
  // 不應被 loop 強制推進，否則會阻斷 PM 討論
  // 完成時由 SubagentStop（委派模式）或 Main Agent 標記（直接模式）
  const nextStage = currentState.currentStage;
  if (nextStage === 'PM') {
    process.stdout.write(JSON.stringify({ result: '' }));
    process.exit(0);
  }

  // ── 未完成 → Loop 繼續 ──

  // 遞增 iteration
  loopState.iteration += 1;
  loop.writeLoop(sessionId, loopState);

  timeline.emit(sessionId, 'loop:advance', {
    iteration: loopState.iteration,
    progress: `${completedStages}/${totalStages}`,
  });

  // 產生繼續 prompt（nextStage 已在上方 PM 互動模式檢查時定義）
  const base = nextStage ? nextStage.split(':')[0] : null;
  const def = base ? stages[base] : null;

  const progressBar = buildProgressBar(stageStatuses, stages);

  const tasksLine = tasksStatus
    ? `📋 Tasks：${tasksStatus.checked}/${tasksStatus.total} 完成`
    : null;

  const continueMessage = [
    `[Overtone Loop ${loopState.iteration}/${loopDefaults.maxIterations}]`,
    `進度：${progressBar} (${completedStages}/${totalStages})`,
    tasksLine,
    def ? `⏭️ 繼續：委派 ${def.emoji} ${def.agent}（${def.label}）` : '⏭️ 繼續執行下一步',
    '⛔ 禁止詢問使用者，直接繼續執行。',
  ].filter(Boolean).join('\n');

  process.stdout.write(JSON.stringify({
    decision: 'block',
    reason: continueMessage,
  }));
  process.exit(0);
}, { result: '' });

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
    ws.failCount > 0 ? `⚠️ 失敗重試：${ws.failCount} 次` : null,
    ws.rejectCount > 0 ? `⚠️ 審查拒絕：${ws.rejectCount} 次` : null,
    `⏱️ 耗時：${calcDuration(ws.createdAt)}`,
  ].filter(line => line != null).join('\n');
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
