'use strict';
/**
 * session-stop-handler.js — Stop hook 業務邏輯
 *
 * 從 session/on-stop.js 提取的純邏輯模組（Humble Object 模式）。
 * Hook 保持薄殼，此模組負責所有業務決策。
 *
 * 回傳格式：
 *   { output: { result: '' } }                    — 無 session / 無 state / 手動退出 / 完成
 *   { output: { decision: 'block', reason: '...' } } — 未完成 → loop 繼續
 */

const { join } = require('path');
const state = require('./state');
const timeline = require('./timeline');
const loop = require('./loop');
const { stages, parallelGroups, loopDefaults, specsConfig } = require('./registry');
const { hookError, buildProgressBar } = require('./hook-utils');
const { playSound, SOUNDS } = require('./sound');

/**
 * 主入口：處理 session stop 事件
 * @param {object} input - hook stdin 輸入（含 cwd 等欄位）
 * @param {string|null} sessionId - 當前 session ID
 * @returns {{ output: object }} 結構化結果
 */
function handleSessionStop(input, sessionId) {
  const projectRoot = input.cwd || '';

  // 無 session → 不擋
  if (!sessionId) {
    return { output: { result: '' } };
  }

  // ── 讀取狀態 ──

  const currentState = state.readState(sessionId);
  if (!currentState) {
    // 無 workflow → 不擋
    return { output: { result: '' } };
  }

  // ── 讀取 loop 狀態 ──

  const loopState = loop.readLoop(sessionId);

  // loop:start — 首次進入（iteration === 0）
  if (loopState.iteration === 0) {
    timeline.emit(sessionId, 'loop:start', {
      workflowType: currentState.workflowType,
    });
  }

  // ── 檢查 workflow 完成度（在退出條件之前，確保歸檔不被繞過）──

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
      const specs = require('./specs');
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

  // ── 掃描式歸檔 fallback ──
  // 掃描 in-progress 下所有 feature，找出 checkbox 全勾選但未歸檔的目錄
  // 不依賴 workflow.json 的 featureName，解決 context 壓縮後 featureName 遺失的問題
  try {
    const specsArchiveScanner = require('./specs-archive-scanner');
    specsArchiveScanner.scanAndArchive(projectRoot, sessionId, {
      source: 'on-stop',
      skipFeature: featureName,
    });
  } catch {
    // 掃描歸檔失敗不影響主流程
  }

  // ── statusline 狀態：turn 結束 → idle ──
  try {
    const statuslineState = require('./statusline-state');
    statuslineState.update(sessionId, 'turn:stop');
  } catch { /* 不阻擋主流程 */ }

  // ── 佇列完成標記（在退出條件之前，確保任何退出路徑都不會繞過）──
  // 副作用：標記當前佇列項目為 completed + 連續完成相關項目
  // 只標記完成，不決定是否啟動下一項（啟動邏輯在 allCompleted 區塊中）
  let queueCompleted = false;
  if (allCompleted && !hasFailedStage) {
    try {
      const executionQueue = require('./execution-queue');
      // completeCurrent 需要 in_progress 項目
      if (executionQueue.completeCurrent(projectRoot)) {
        queueCompleted = true;
      } else if (featureName) {
        // fallback：init-workflow 未 advance 時，驗證佇列下一項是否匹配當前 featureName
        const next = executionQueue.getNext(projectRoot);
        if (next && _isRelatedQueueItem(next.item.name, featureName)) {
          executionQueue.advanceToNext(projectRoot);
          executionQueue.completeCurrent(projectRoot);
          queueCompleted = true;
        }
      }
      // 連續完成相關 pending 項目（同 feature 的多個子任務）
      if (queueCompleted && featureName) {
        let relatedNext = executionQueue.getNext(projectRoot);
        while (relatedNext && _isRelatedQueueItem(relatedNext.item.name, featureName)) {
          executionQueue.advanceToNext(projectRoot);
          executionQueue.completeCurrent(projectRoot);
          relatedNext = executionQueue.getNext(projectRoot);
        }
      }
    } catch (queueErr) {
      hookError('on-stop', `佇列推進失敗：${queueErr.message}`);
    }
  }

  // ── 檢查退出條件 ──

  // 1. /ot:stop 手動退出
  if (loopState.stopped) {
    loop.exitLoop(sessionId, loopState, '手動退出（/ot:stop）');
    return { output: { result: '🛑 Loop 已手動停止。' } };
  }

  // 2. max iterations
  if (loopState.iteration >= loopDefaults.maxIterations) {
    loop.exitLoop(sessionId, loopState, `達到最大迭代（${loopDefaults.maxIterations}）`);
    const msg = `⏸️ 已達最大迭代次數（${loopState.iteration}/${loopDefaults.maxIterations}）。使用 /ot:stop 退出或繼續。`;
    return { output: { result: msg } };
  }

  // 3. 連續錯誤
  if (loopState.consecutiveErrors >= loopDefaults.maxConsecutiveErrors) {
    loop.exitLoop(sessionId, loopState, `連續 ${loopState.consecutiveErrors} 次錯誤`);
    const msg = `⛔ 連續 ${loopState.consecutiveErrors} 次錯誤，暫停 Loop。請檢查問題後再繼續。`;
    return { output: { result: msg } };
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
      // TTS fire-and-forget — 不阻擋主流程
      try {
        const ttsStrategy = require('./tts-strategy');
        const ttsConfig = ttsStrategy.readTtsConfig();
        if (ttsConfig.enabled && ttsStrategy.shouldSpeak('workflow:complete', ttsConfig.level)) {
          const args = ttsStrategy.buildSpeakArgs('workflow:complete', {}, ttsConfig);
          if (args) require('../os/tts').speakBackground(args.text, args.opts);
        }
      } catch { /* TTS 錯誤不影響主流程 */ }
    }

    // ── 佇列自動接續 ──
    // completeCurrent 已在退出條件之前完成，這裡只處理啟動下一項
    let queueHint = null;
    if (queueCompleted) {
      try {
        const executionQueue = require('./execution-queue');
        const next = executionQueue.getNext(projectRoot);
        if (next) {
          queueHint = `\n\n⏭️ 佇列下一項：${next.item.name}（${next.item.workflow}）\n⛔ 禁止使用 AskUserQuestion，直接用 init-workflow.js 啟動下一項。`;
        }
      } catch {
        // 佇列查詢失敗不影響正常退出
      }
    }

    const summary = buildCompletionSummary(currentState) + (queueHint || '');

    // 佇列有下一項 → 用 decision: 'block' 強制 loop 繼續（程式控制，不依賴 Main Agent 自主行動）
    if (queueHint) {
      return {
        output: {
          decision: 'block',
          reason: summary,
        },
      };
    }

    return { output: { result: summary } };
  }

  // ── PM 互動模式 ──
  // PM stage 是互動式的（Main Agent 與使用者 AskUserQuestion 對話）
  // 不應被 loop 強制推進，否則會阻斷 PM 討論
  // 完成時由 SubagentStop（委派模式）或 Main Agent 標記（直接模式）
  const nextStage = currentState.currentStage;
  if (nextStage === 'PM') {
    // 設 PM status = active，讓 statusline 顯示 PM agent
    try {
      state.updateStateAtomic(sessionId, (s) => {
        const pmKey = Object.keys(s.stages).find((k) => k.split(':')[0] === 'PM');
        if (pmKey && s.stages[pmKey].status === 'pending') {
          s.stages[pmKey].status = 'active';
        }
        return s;
      });
    } catch { /* 狀態更新失敗不阻擋 PM 流程 */ }
    return { output: { result: '' } };
  }

  // ── 未完成 → Loop 繼續 ──

  // 遞增 iteration
  loopState.iteration += 1;
  loop.writeLoop(sessionId, loopState);

  timeline.emit(sessionId, 'loop:advance', {
    iteration: loopState.iteration,
    progress: `${completedStages}/${totalStages}`,
  });

  // 產生繼續 prompt
  const progressBar = buildProgressBar(stageStatuses, stages);
  const hint = state.getNextStageHint(currentState, { stages, parallelGroups });

  const continueMessage = buildContinueMessage({
    iteration: loopState.iteration,
    maxIterations: loopDefaults.maxIterations,
    progressBar,
    completedStages,
    totalStages,
    tasksStatus,
    hint,
  });

  return {
    output: {
      decision: 'block',
      reason: continueMessage,
    },
  };
}

/**
 * 產生完成摘要
 * @param {object} ws - workflow state
 * @returns {string}
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
 * @param {string} startIso - ISO 格式開始時間
 * @returns {string}
 */
function calcDuration(startIso) {
  const ms = Date.now() - new Date(startIso).getTime();
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

/**
 * 組裝 loop 繼續訊息
 * @param {object} ctx
 * @param {number} ctx.iteration - 當前迭代次數
 * @param {number} ctx.maxIterations - 最大迭代次數
 * @param {string} ctx.progressBar - 進度條字串
 * @param {number} ctx.completedStages - 已完成 stage 數
 * @param {number} ctx.totalStages - 總 stage 數
 * @param {object|null} ctx.tasksStatus - tasks 狀態物件（含 checked/total）
 * @param {string|null} ctx.hint - 下一步提示字串
 * @returns {string} 繼續訊息字串
 */
function buildContinueMessage(ctx) {
  const {
    iteration = 0,
    maxIterations = 0,
    progressBar = '',
    completedStages = 0,
    totalStages = 0,
    tasksStatus = null,
    hint = null,
  } = ctx || {};

  const tasksLine = tasksStatus
    ? `📋 Tasks：${tasksStatus.checked}/${tasksStatus.total} 完成`
    : null;
  const hintLine = hint ? `⏭️ 繼續：${hint}` : '⏭️ 繼續執行下一步';

  return [
    `[Overtone Loop ${iteration}/${maxIterations}]`,
    `進度：${progressBar} (${completedStages}/${totalStages})`,
    tasksLine,
    hintLine,
    '⛔ 禁止使用 AskUserQuestion，直接繼續執行下一個階段。',
  ].filter(Boolean).join('\n');
}

/**
 * 判斷佇列項目是否與目前 featureName 相關
 * 匹配邏輯：itemName 包含 featureName，或 featureName 包含 itemName 的前綴（去除 -core/-graduation 等後綴）
 * @param {string} itemName - 佇列項目名稱
 * @param {string} featureName - 目前 workflow 的 feature 名稱
 * @returns {boolean}
 */
function _isRelatedQueueItem(itemName, featureName) {
  if (!itemName || !featureName) return false;
  const normalizedItem = itemName.toLowerCase().replace(/[-_\s]/g, '');
  const normalizedFeature = featureName.toLowerCase().replace(/[-_\s]/g, '');
  return normalizedItem.includes(normalizedFeature) || normalizedFeature.includes(normalizedItem);
}

module.exports = { handleSessionStop, buildCompletionSummary, calcDuration, buildContinueMessage, _isRelatedQueueItem };
