#!/usr/bin/env node
'use strict';
/**
 * baseline-tracker.js — 效能基線追蹤
 *
 * 跨 session 追蹤工作流效能指標，量化「系統有沒有在進步」。
 *
 * 指標：
 *   - duration: 工作流總耗時（ms）
 *   - retryCount: 重試次數（failCount + rejectCount）
 *   - pass1Rate: 一次通過率（pass@1）
 *   - stageCount: 階段數量
 *   - stageDurations: 各階段耗時（ms）
 *
 * 儲存位置：~/.overtone/global/{projectHash}/baselines.jsonl
 */

const { readFileSync, appendFileSync, existsSync, mkdirSync } = require('fs');
const { dirname } = require('path');
const paths = require('./paths');
const { baselineDefaults } = require('./registry');
const { atomicWrite } = require('./utils');
const state = require('./state');
const timeline = require('./timeline');

// ── 核心 API ──

/**
 * 從 timeline + state 計算當前 session 的效能指標
 *
 * @param {string} sessionId
 * @returns {object|null} 指標物件，無 workflow 時回傳 null
 */
function computeSessionMetrics(sessionId) {
  const currentState = state.readState(sessionId);
  if (!currentState) return null;

  const workflowType = currentState.workflowType;

  // 工作流耗時：workflow:start → workflow:complete
  const wfStart = timeline.latest(sessionId, 'workflow:start');
  const wfComplete = timeline.latest(sessionId, 'workflow:complete');
  let duration = null;
  if (wfStart && wfComplete) {
    duration = new Date(wfComplete.ts).getTime() - new Date(wfStart.ts).getTime();
  }

  // 重試次數
  const retryCount = (currentState.failCount || 0) + (currentState.rejectCount || 0);

  // pass@1 率
  const passResult = timeline.passAtK(sessionId);
  const pass1Rate = passResult.overall.pass1Rate;

  // 階段數量
  const stageCount = Object.keys(currentState.stages).length;

  // 各階段耗時
  const stageDurations = {};
  const stageStarts = timeline.query(sessionId, { type: 'stage:start' });
  const stageCompletes = timeline.query(sessionId, { type: 'stage:complete' });

  for (const complete of stageCompletes) {
    if (!complete.stage) continue;
    // 找對應的 stage:start（同 stage key，最早的）
    const start = stageStarts.find(s => s.stage === complete.stage);
    if (start) {
      stageDurations[complete.stage] = new Date(complete.ts).getTime() - new Date(start.ts).getTime();
    }
  }

  return {
    sessionId,
    workflowType,
    duration,
    retryCount,
    pass1Rate,
    stageCount,
    stageDurations,
  };
}

/**
 * 將 session 效能指標保存到專案全域基線 store
 *
 * @param {string} sessionId
 * @param {string} projectRoot - 專案根目錄
 * @returns {{ saved: boolean, metrics: object|null }}
 */
function saveBaseline(sessionId, projectRoot) {
  const metrics = computeSessionMetrics(sessionId);
  if (!metrics || metrics.duration === null) {
    return { saved: false, metrics: null };
  }

  const record = {
    ts: new Date().toISOString(),
    ...metrics,
  };

  const filePath = paths.global.baselines(projectRoot);
  mkdirSync(dirname(filePath), { recursive: true });
  appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf8');

  // 定期截斷：每次寫入後檢查，超過上限時保留最新的
  _trimIfNeeded(projectRoot);

  return { saved: true, metrics };
}

/**
 * 取得特定 workflowType 的歷史基線（最近 N 筆的平均值）
 *
 * @param {string} projectRoot - 專案根目錄
 * @param {string} workflowType - 工作流類型
 * @param {number} [n] - 取最近幾筆，預設 compareWindowSize
 * @returns {{ avgDuration: number|null, avgRetries: number, avgPass1Rate: number|null, sessionCount: number }}
 */
function getBaseline(projectRoot, workflowType, n) {
  const windowSize = n || baselineDefaults.compareWindowSize;
  const records = _readAll(projectRoot)
    .filter(r => r.workflowType === workflowType)
    .slice(-windowSize);

  if (records.length === 0) {
    return { avgDuration: null, avgRetries: 0, avgPass1Rate: null, sessionCount: 0 };
  }

  const withDuration = records.filter(r => r.duration !== null);
  const withPass1 = records.filter(r => r.pass1Rate !== null);

  const avgDuration = withDuration.length > 0
    ? Math.round(withDuration.reduce((sum, r) => sum + r.duration, 0) / withDuration.length)
    : null;

  const avgRetries = Math.round(
    (records.reduce((sum, r) => sum + (r.retryCount || 0), 0) / records.length) * 100
  ) / 100;

  const avgPass1Rate = withPass1.length > 0
    ? Math.round(
        (withPass1.reduce((sum, r) => sum + r.pass1Rate, 0) / withPass1.length) * 10000
      ) / 10000
    : null;

  return {
    avgDuration,
    avgRetries,
    avgPass1Rate,
    sessionCount: records.length,
  };
}

/**
 * 將當前 session 指標與歷史基線比較
 *
 * @param {string} sessionId
 * @param {string} projectRoot
 * @returns {object|null} 比較結果，無法比較時回傳 null
 */
function compareToBaseline(sessionId, projectRoot) {
  const metrics = computeSessionMetrics(sessionId);
  if (!metrics || metrics.duration === null) return null;

  const baseline = getBaseline(projectRoot, metrics.workflowType);
  if (baseline.sessionCount === 0) return null;

  const result = {
    workflowType: metrics.workflowType,
    sessionCount: baseline.sessionCount,
    current: metrics,
    baseline,
    comparison: {},
  };

  // 耗時比較（負 delta 代表進步）
  if (baseline.avgDuration !== null) {
    const durationDelta = metrics.duration - baseline.avgDuration;
    const durationPct = Math.round((durationDelta / baseline.avgDuration) * 10000) / 100;
    result.comparison.duration = {
      current: metrics.duration,
      baseline: baseline.avgDuration,
      deltaMs: durationDelta,
      deltaPct: durationPct,
      improved: durationDelta < 0,
    };
  }

  // 重試比較（負 delta 代表進步）
  const retryDelta = metrics.retryCount - baseline.avgRetries;
  result.comparison.retries = {
    current: metrics.retryCount,
    baseline: baseline.avgRetries,
    delta: Math.round(retryDelta * 100) / 100,
    improved: retryDelta < 0,
  };

  // pass@1 比較（正 delta 代表進步）
  if (baseline.avgPass1Rate !== null && metrics.pass1Rate !== null) {
    const pass1Delta = metrics.pass1Rate - baseline.avgPass1Rate;
    const pass1Pct = Math.round((pass1Delta / baseline.avgPass1Rate) * 10000) / 100;
    result.comparison.pass1Rate = {
      current: metrics.pass1Rate,
      baseline: baseline.avgPass1Rate,
      deltaPct: pass1Pct,
      improved: pass1Delta > 0,
    };
  }

  return result;
}

// ── 趨勢分析常數 ──
const TREND_THRESHOLD = 0.05;   // 5% 變化門檻
const MIN_TREND_RECORDS = 4;    // 最少需要 4 筆才能分析趨勢

/**
 * 計算特定 workflowType 的效能趨勢
 *
 * 演算法：將最近 N 筆（N >= 4）分成前半和後半，
 * 比較平均 duration 和 pass1Rate。
 * duration 下降 = improving；上升 = degrading
 * pass1Rate 上升 = improving；下降 = degrading
 * 變化 < 5% = stagnant
 *
 * @param {string} projectRoot
 * @param {string} workflowType
 * @returns {{ direction: 'improving'|'stagnant'|'degrading', details: { duration: string, pass1Rate: string }, sessionCount: number }|null}
 *    null when < 4 records available
 */
function computeBaselineTrend(projectRoot, workflowType) {
  const windowSize = baselineDefaults.compareWindowSize;
  const records = _readAll(projectRoot)
    .filter(r => r.workflowType === workflowType)
    .slice(-windowSize);

  if (records.length < MIN_TREND_RECORDS) return null;

  const mid = Math.floor(records.length / 2);
  const firstHalf = records.slice(0, mid);
  const secondHalf = records.slice(mid);

  // ── duration 趨勢（下降 = improving）──
  const avgDuration = (arr) => {
    const valid = arr.filter(r => r.duration !== null);
    if (valid.length === 0) return null;
    return valid.reduce((sum, r) => sum + r.duration, 0) / valid.length;
  };

  const dur1 = avgDuration(firstHalf);
  const dur2 = avgDuration(secondHalf);
  let durationTrend = 'stagnant';
  let durationStr = '穩定';
  if (dur1 !== null && dur2 !== null && dur1 > 0) {
    const change = (dur2 - dur1) / dur1; // 負 = 下降 = improving
    if (change < -TREND_THRESHOLD) {
      durationTrend = 'improving';
      durationStr = '改善';
    } else if (change > TREND_THRESHOLD) {
      durationTrend = 'degrading';
      durationStr = '退步';
    }
  }

  // ── pass1Rate 趨勢（上升 = improving）──
  const avgPass1Rate = (arr) => {
    const valid = arr.filter(r => r.pass1Rate !== null);
    if (valid.length === 0) return null;
    return valid.reduce((sum, r) => sum + r.pass1Rate, 0) / valid.length;
  };

  const p1 = avgPass1Rate(firstHalf);
  const p2 = avgPass1Rate(secondHalf);
  let pass1Trend = 'stagnant';
  let pass1Str = '穩定';
  if (p1 !== null && p2 !== null && p1 > 0) {
    const change = (p2 - p1) / p1; // 正 = 上升 = improving
    if (change > TREND_THRESHOLD) {
      pass1Trend = 'improving';
      pass1Str = '改善';
    } else if (change < -TREND_THRESHOLD) {
      pass1Trend = 'degrading';
      pass1Str = '退步';
    }
  }

  // ── 總體方向（多數指標決定）──
  const improvingCount = [durationTrend, pass1Trend].filter(t => t === 'improving').length;
  const degradingCount = [durationTrend, pass1Trend].filter(t => t === 'degrading').length;

  let direction;
  if (improvingCount > degradingCount) {
    direction = 'improving';
  } else if (degradingCount > improvingCount) {
    direction = 'degrading';
  } else {
    direction = 'stagnant';
  }

  return {
    direction,
    details: { duration: durationStr, pass1Rate: pass1Str },
    sessionCount: records.length,
  };
}

/**
 * 產生人類可讀的基線摘要文字（用於 SessionStart 注入）
 *
 * @param {string} projectRoot
 * @param {string} [workflowType] - 特定 workflow 類型，省略則顯示所有有記錄的類型
 * @returns {string} Markdown 格式摘要
 */
function formatBaselineSummary(projectRoot, workflowType) {
  const records = _readAll(projectRoot);
  if (records.length === 0) return '';

  // 收集所有 workflowType
  const types = workflowType
    ? [workflowType]
    : [...new Set(records.map(r => r.workflowType))];

  const lines = [];
  for (const wt of types) {
    const bl = getBaseline(projectRoot, wt);
    if (bl.sessionCount === 0) continue;

    const durationStr = bl.avgDuration !== null
      ? `${Math.round(bl.avgDuration / 1000)}s`
      : 'N/A';
    const pass1Str = bl.avgPass1Rate !== null
      ? `${Math.round(bl.avgPass1Rate * 100)}%`
      : 'N/A';

    // 趨勢箭頭
    const trend = computeBaselineTrend(projectRoot, wt);
    const trendStr = trend
      ? (trend.direction === 'improving' ? ' ↑ 進步中' : trend.direction === 'degrading' ? ' ↓ 退步中' : ' → 穩定')
      : '';

    lines.push(
      `- ${wt}（${bl.sessionCount} 次）：平均 ${durationStr}，重試 ${bl.avgRetries}，pass@1 ${pass1Str}${trendStr}`
    );
  }

  return lines.length > 0
    ? '效能基線（歷史平均）：\n' + lines.join('\n')
    : '';
}

// ── 低層工具 ──

/**
 * 讀取所有基線記錄
 * @param {string} projectRoot
 * @returns {object[]}
 */
function _readAll(projectRoot) {
  const filePath = paths.global.baselines(projectRoot);
  if (!existsSync(filePath)) return [];

  let content;
  try {
    content = readFileSync(filePath, 'utf8').trim();
  } catch {
    return [];
  }
  if (!content) return [];

  return content.split('\n')
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

/**
 * 截斷超過上限的記錄（按 workflowType 分組保留最新的 maxRecordsPerType 筆）
 * @param {string} projectRoot
 */
function _trimIfNeeded(projectRoot) {
  const filePath = paths.global.baselines(projectRoot);
  const records = _readAll(projectRoot);
  if (records.length === 0) return;

  // 按 workflowType 分組
  const byType = {};
  for (const r of records) {
    if (!byType[r.workflowType]) byType[r.workflowType] = [];
    byType[r.workflowType].push(r);
  }

  // 檢查是否有任何 type 超過上限
  let needsTrim = false;
  for (const group of Object.values(byType)) {
    if (group.length > baselineDefaults.maxRecordsPerType) {
      needsTrim = true;
      break;
    }
  }

  if (!needsTrim) return;

  // 重寫：每種 type 只保留最新的 maxRecordsPerType 筆
  const trimmed = [];
  for (const group of Object.values(byType)) {
    trimmed.push(...group.slice(-baselineDefaults.maxRecordsPerType));
  }

  // 按 ts 排序維持時間順序
  trimmed.sort((a, b) => new Date(a.ts) - new Date(b.ts));
  const content = trimmed.map(r => JSON.stringify(r)).join('\n');
  atomicWrite(filePath, content ? content + '\n' : '');
}

module.exports = {
  computeSessionMetrics,
  saveBaseline,
  getBaseline,
  compareToBaseline,
  computeBaselineTrend,
  formatBaselineSummary,
};
