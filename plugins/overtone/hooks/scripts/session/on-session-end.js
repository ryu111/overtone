#!/usr/bin/env node
'use strict';
/**
 * SessionEnd hook — Session 結束清理
 *
 * 觸發：session 結束時（clear、logout、prompt_input_exit、other）
 * 職責：
 *   ✅ 若 Stop hook 尚未處理（loop.json stopped=false），emit session:end timeline 事件
 *   ✅ 重置 loop.json 為 stopped: true
 *   ✅ 清理 ~/.overtone/.current-session-id
 *
 * 注意：若 Stop hook 已處理正常退出（stopped=true），跳過 session:end emit，避免重複。
 */

const { unlinkSync, writeFileSync, existsSync } = require('fs');
const paths = require('../../../scripts/lib/paths');
const timeline = require('../../../scripts/lib/timeline');
const { safeReadStdin, safeRun, getSessionId, hookError } = require('../../../scripts/lib/hook-utils');
const { runCleanup } = require('../../../scripts/lib/session-cleanup');

safeRun(() => {
  const input = safeReadStdin();
  const sessionId = getSessionId(input);

  // 無 sessionId → 靜默退出
  if (!sessionId) {
    process.stdout.write(JSON.stringify({ result: '' }));
    process.exit(0);
  }

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
    const globalInstinct = require('../../../scripts/lib/global-instinct');
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
    const instinct = require('../../../scripts/lib/instinct');
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
    const currentState = require('../../../scripts/lib/state').readState(sessionId);
    const appliedIds = currentState?.appliedObservationIds;

    if (appliedIds && appliedIds.length > 0) {
      const baselineTracker = require('../../../scripts/lib/baseline-tracker');
      const scoreEngine = require('../../../scripts/lib/score-engine');
      const { scoringConfig, globalInstinctDefaults: gid } = require('../../../scripts/lib/registry');

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
        const globalInstinct = require('../../../scripts/lib/global-instinct');
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
    const baselineTracker = require('../../../scripts/lib/baseline-tracker');
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

  process.stdout.write(JSON.stringify({ result: '' }));
  process.exit(0);
}, { result: '' });
