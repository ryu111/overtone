'use strict';
/**
 * session-end-handler.js — SessionEnd hook 業務邏輯
 *
 * 從 session/on-session-end.js 提取的純邏輯模組（Humble Object 模式）。
 * Hook 保持薄殼，此模組負責所有業務決策。
 *
 * 回傳格式：
 *   { output: { result: '' } }
 */

const { unlinkSync, writeFileSync, existsSync } = require('fs');
const paths = require('./paths');
const timeline = require('./timeline');
const { hookError } = require('./hook-utils');
const { runCleanup } = require('./session-cleanup');
const { createHookTimer } = require('./hook-timing');

/**
 * 主入口：處理 session end 事件
 * @param {object} input - hook stdin 輸入（含 reason 等欄位）
 * @param {string|null} sessionId - 當前 session ID
 * @returns {{ output: object }} 結構化結果
 */
function handleSessionEnd(input, sessionId) {
  // 無 sessionId → 靜默退出
  if (!sessionId) {
    return { output: { result: '' } };
  }

  const hookTimer = createHookTimer();
  const reason = input.reason || 'other';

  // ── 讀取 loop.json 狀態 ──

  const loopPath = paths.session.loop(sessionId);
  let loopStopped = false;

  try {
    if (existsSync(loopPath)) {
      const loopData = JSON.parse(require('fs').readFileSync(loopPath, 'utf8'));
      loopStopped = loopData.stopped === true;
    }
  } catch {
    // 讀取失敗視為未 stopped
    loopStopped = false;
  }

  // ── 1. 若 Stop hook 尚未處理，emit session:end ──

  if (!loopStopped) {
    try {
      timeline.emit(sessionId, 'session:end', { reason });
    } catch (err) {
      hookError('on-session-end', `emit session:end 失敗：${err.message || String(err)}`);
    }
  }

  // ── 2. 重置 loop.json（簡單寫入 stopped: true，保留其他欄位）──

  try {
    if (existsSync(loopPath)) {
      let loopData = {};
      try {
        loopData = JSON.parse(require('fs').readFileSync(loopPath, 'utf8'));
      } catch {
        // 讀取失敗用空物件
      }
      loopData.stopped = true;
      writeFileSync(loopPath, JSON.stringify(loopData, null, 2), 'utf8');
    }
  } catch (err) {
    hookError('on-session-end', `重置 loop.json 失敗：${err.message || String(err)}`);
  }

  // ── 3b. 全域畢業（graduate）──
  // 將高信心 session 觀察升至全域 store，不影響其他清理步驟

  const projectRoot = process.env.CLAUDE_PROJECT_ROOT || process.cwd();

  try {
    const globalInstinct = require('./global-instinct');
    const result = globalInstinct.graduate(sessionId, projectRoot);
    if (result.graduated > 0 || result.merged > 0) {
      process.stderr.write(
        `[overtone/on-session-end] 知識畢業：${result.graduated} 新增，${result.merged} 合併\n`
      );
    }
  } catch (err) {
    hookError('on-session-end', `global-instinct.graduate 失敗：${err.message || String(err)}`);
  }

  // ── 3b2. Session 層觀察衰減 ──
  // 對超過 7 天未更新的 session 觀察降低信心值

  try {
    const instinct = require('./instinct');
    const { decayed, pruned } = instinct.decay(sessionId);
    if (decayed > 0 || pruned > 0) {
      process.stderr.write(
        `[overtone/on-session-end] 觀察衰減：${decayed} 筆降權，${pruned} 筆刪除\n`
      );
    }
  } catch (err) {
    hookError('on-session-end', `instinct.decay 失敗：${err.message || String(err)}`);
  }

  // ── 3b3. 觀察效果反饋（時間序列學習）──
  // 比對品質趨勢，反向更新被注入觀察的 confidence

  try {
    const currentState = require('./state').readState(sessionId);
    const appliedIds = currentState?.appliedObservationIds;

    if (appliedIds && appliedIds.length > 0) {
      const baselineTracker = require('./baseline-tracker');
      const scoreEngine = require('./score-engine');
      const { scoringConfig, globalInstinctDefaults: gid } = require('./registry');

      // 判斷 baseline trend
      const workflowType = currentState.workflowType;
      const bTrend = workflowType ? baselineTracker.computeBaselineTrend(projectRoot, workflowType) : null;

      // 取第一個有資料的 graded stage 的 score trend
      let sTrend = null;
      for (const stage of (scoringConfig.gradedStages || [])) {
        const t = scoreEngine.computeScoreTrend(projectRoot, stage);
        if (t) { sTrend = t; break; }
      }

      const isImproving = (bTrend?.direction === 'improving') || (sTrend?.direction === 'improving');
      const isDegrading = (bTrend?.direction === 'degrading') && (sTrend?.direction === 'degrading');

      if (isImproving || isDegrading) {
        const globalInstinct = require('./global-instinct');
        const delta = isImproving ? gid.feedbackBoost : gid.feedbackPenalty;
        const updated = globalInstinct.adjustConfidenceByIds(projectRoot, appliedIds, delta);
        if (updated > 0) {
          process.stderr.write(
            `[overtone/on-session-end] 觀察效果反饋：${updated} 筆 ${isImproving ? '提升' : '下降'} confidence（${delta > 0 ? '+' : ''}${delta}）\n`
          );
        }
      }
    }
  } catch (err) {
    hookError('on-session-end', `觀察效果反饋失敗：${err.message || String(err)}`);
  }

  // ── 3c. 效能基線保存 ──
  // 若 workflow 已完成，記錄效能指標供跨 session 追蹤

  try {
    const baselineTracker = require('./baseline-tracker');
    const { saved, metrics } = baselineTracker.saveBaseline(sessionId, projectRoot);
    if (saved) {
      const durationSec = metrics.duration ? Math.round(metrics.duration / 1000) : '?';
      process.stderr.write(
        `[overtone/on-session-end] 效能基線：${metrics.workflowType} ${durationSec}s，pass@1 ${metrics.pass1Rate ?? 'N/A'}\n`
      );
    }
  } catch (err) {
    hookError('on-session-end', `baseline-tracker.saveBaseline 失敗：${err.message || String(err)}`);
  }

  // ── 3d. Session 摘要自動產生 ──
  // 非關鍵功能，失敗時靜默降級，不影響其他清理步驟

  try {
    const sessionDigest = require('./session-digest');
    const digest = sessionDigest.generateDigest(sessionId, projectRoot);
    sessionDigest.appendDigest(projectRoot, digest);
    process.stderr.write(
      `[overtone/on-session-end] session 摘要已寫入：${digest.totalEvents} 個事件，工作流 ${digest.workflowType || 'unknown'}\n`
    );
  } catch (err) {
    hookError('on-session-end', `session-digest 產生失敗：${err.message || String(err)}`);
  }

  // ── 3. 清理 .current-session-id ──

  try {
    if (existsSync(paths.CURRENT_SESSION_FILE)) {
      unlinkSync(paths.CURRENT_SESSION_FILE);
    }
  } catch (err) {
    hookError('on-session-end', `清理 .current-session-id 失敗：${err.message || String(err)}`);
  }

  // ── 4. 清理過期 session 目錄和 orphan 暫存檔 ──

  try {
    const cleanupReport = runCleanup(sessionId);
    const totalCleaned = cleanupReport.sessions.cleaned + cleanupReport.orphanFiles.cleaned + cleanupReport.globalDirs.cleaned;
    if (totalCleaned > 0) {
      process.stderr.write(
        `[overtone/on-session-end] 清理完成：刪除 ${cleanupReport.sessions.cleaned} 個過期 session、${cleanupReport.orphanFiles.cleaned} 個暫存檔、${cleanupReport.globalDirs.cleaned} 個全域目錄\n`
      );
    }
    if (cleanupReport.sessions.errors.length > 0 || cleanupReport.orphanFiles.errors.length > 0 || cleanupReport.globalDirs.errors.length > 0) {
      const allErrors = [...cleanupReport.sessions.errors, ...cleanupReport.orphanFiles.errors, ...cleanupReport.globalDirs.errors];
      hookError('on-session-end', `清理時發生錯誤：${allErrors.join('; ')}`);
    }
  } catch (err) {
    hookError('on-session-end', `runCleanup 失敗：${err.message || String(err)}`);
  }

  // hook:timing — 記錄 SessionEnd 執行耗時
  hookTimer.emit(sessionId, 'on-session-end', 'SessionEnd');

  return { output: { result: '' } };
}

module.exports = { handleSessionEnd };
