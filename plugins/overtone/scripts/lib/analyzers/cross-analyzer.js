#!/usr/bin/env node
'use strict';
/**
 * cross-analyzer.js — 跨資料源交叉分析
 *
 * 將 timeline、failures、scores 等獨立資料源關聯起來，
 * 提供更深層的分析洞察。
 *
 * API 使用 dependency injection 模式（與 data.js 的 _getDeps() 一致），便於測試。
 */

// ── 分析函式 ──

/**
 * 失敗熱點分析
 *
 * 關聯 failure-patterns 和 timeline 資料，
 * 找出最常失敗的 stage + agent 組合。
 *
 * @param {object} deps - { failureTracker, timeline }
 * @param {string} projectRoot
 * @returns {{
 *   hotspots: Array<{ stage: string, agent: string, count: number, lastFailedAt: string|null }>,
 *   totalFailures: number
 * }}
 */
function analyzeFailureHotspot(deps, projectRoot) {
  const { failureTracker } = deps;

  let patterns;
  try {
    patterns = failureTracker.getFailurePatterns(projectRoot);
  } catch {
    return { hotspots: [], totalFailures: 0 };
  }

  if (!patterns || patterns.totalFailures === 0) {
    return { hotspots: [], totalFailures: 0 };
  }

  // 讀取原始失敗記錄，取得 stage+agent 組合的 lastFailedAt
  let rawRecords = [];
  try {
    rawRecords = failureTracker._readAll
      ? failureTracker._readAll(projectRoot)
      : _extractRawFromPatterns(patterns);
  } catch {
    rawRecords = [];
  }

  // 按 stage+agent 組合聚合
  const pairMap = {};
  for (const r of rawRecords) {
    if (!r.stage || !r.agent) continue;
    const key = `${r.stage}::${r.agent}`;
    if (!pairMap[key]) {
      pairMap[key] = { stage: r.stage, agent: r.agent, count: 0, lastFailedAt: null };
    }
    pairMap[key].count++;
    // 更新最近失敗時間
    if (r.ts) {
      if (!pairMap[key].lastFailedAt || r.ts > pairMap[key].lastFailedAt) {
        pairMap[key].lastFailedAt = r.ts;
      }
    }
  }

  // 若沒有原始記錄但有 topPattern，以 patterns 資料建立基本輸出
  if (rawRecords.length === 0 && patterns.topPattern) {
    const { stage, agent, count } = patterns.topPattern;
    return {
      hotspots: [{ stage, agent, count, lastFailedAt: null }],
      totalFailures: patterns.totalFailures,
    };
  }

  // 按失敗次數降序排列
  const hotspots = Object.values(pairMap)
    .sort((a, b) => b.count - a.count);

  return {
    hotspots,
    totalFailures: patterns.totalFailures,
  };
}

/**
 * Hook 開銷分析
 *
 * 讀取 timeline 中的 hook:timing 事件，
 * 計算每個 hook 的平均 durationMs、max、count。
 *
 * @param {object} deps - { timeline }
 * @param {object} opts - { session?: string }
 * @param {string} projectRoot
 * @returns {{
 *   hooks: Array<{ hook: string, avgMs: number, maxMs: number, count: number }>,
 *   sessionId: string|null
 * }}
 */
function analyzeHookOverhead(deps, opts, projectRoot) {
  const { timeline } = deps;
  const sessionId = opts && opts.session ? opts.session : null;

  if (!sessionId) {
    return { hooks: [], sessionId: null };
  }

  let events = [];
  try {
    events = timeline.query(sessionId, { type: 'hook:timing' });
  } catch {
    events = [];
  }

  if (!events || events.length === 0) {
    return { hooks: [], sessionId };
  }

  // 按 hook 名稱聚合
  const hookMap = {};
  for (const e of events) {
    const hookName = e.hook || e.hookName || e.name || 'unknown';
    const duration = typeof e.durationMs === 'number' ? e.durationMs : 0;

    if (!hookMap[hookName]) {
      hookMap[hookName] = { hook: hookName, totalMs: 0, maxMs: 0, count: 0 };
    }
    hookMap[hookName].totalMs += duration;
    hookMap[hookName].count++;
    if (duration > hookMap[hookName].maxMs) {
      hookMap[hookName].maxMs = duration;
    }
  }

  // 計算平均值並按平均耗時降序排列
  const hooks = Object.values(hookMap)
    .map(h => ({
      hook: h.hook,
      avgMs: h.count > 0 ? Math.round(h.totalMs / h.count) : 0,
      maxMs: h.maxMs,
      count: h.count,
    }))
    .sort((a, b) => b.avgMs - a.avgMs);

  return { hooks, sessionId };
}

/**
 * 工作流速度分析
 *
 * 讀取 timeline 中所有 session 的 stage:start 和 stage:complete 事件，
 * 計算每個 stage 的平均耗時（毫秒）。
 *
 * @param {object} deps - { timeline }
 * @param {string[]} sessionIds - 要分析的 session ID 清單
 * @returns {{
 *   stages: Array<{ stage: string, avgMs: number, minMs: number, maxMs: number, samples: number }>,
 *   sessionCount: number
 * }}
 */
function analyzeWorkflowVelocity(deps, sessionIds) {
  const { timeline } = deps;

  if (!sessionIds || sessionIds.length === 0) {
    return { stages: [], sessionCount: 0 };
  }

  // 每個 stage 的耗時樣本
  const stageSamples = {};

  for (const sessionId of sessionIds) {
    let stageStarts = [];
    let stageCompletes = [];

    try {
      stageStarts = timeline.query(sessionId, { type: 'stage:start' });
      stageCompletes = timeline.query(sessionId, { type: 'stage:complete' });
    } catch {
      continue;
    }

    // 比對 start 和 complete，計算耗時
    for (const complete of stageCompletes) {
      if (!complete.stage) continue;

      // 找對應的 start（同 stage，ts 小於 complete）
      const start = stageStarts
        .filter(s => s.stage === complete.stage && s.ts <= complete.ts)
        .sort((a, b) => new Date(b.ts) - new Date(a.ts))[0];

      if (!start) continue;

      const durationMs = new Date(complete.ts).getTime() - new Date(start.ts).getTime();
      if (durationMs < 0) continue;

      if (!stageSamples[complete.stage]) {
        stageSamples[complete.stage] = [];
      }
      stageSamples[complete.stage].push(durationMs);
    }
  }

  // 計算每個 stage 的統計值
  const stages = Object.entries(stageSamples)
    .map(([stage, samples]) => {
      const total = samples.reduce((s, v) => s + v, 0);
      const avg = Math.round(total / samples.length);
      const min = Math.min(...samples);
      const max = Math.max(...samples);
      return { stage, avgMs: avg, minMs: min, maxMs: max, samples: samples.length };
    })
    .sort((a, b) => b.avgMs - a.avgMs);

  return { stages, sessionCount: sessionIds.length };
}

// ── 內部工具 ──

/**
 * 從 patterns 結構建立近似的原始記錄（當 _readAll 不可用時的降級路徑）
 * @param {object} patterns - { byStage, byAgent, topPattern }
 * @returns {object[]}
 */
function _extractRawFromPatterns(patterns) {
  if (!patterns || !patterns.topPattern) return [];
  const { stage, agent, count } = patterns.topPattern;
  // 模擬 count 筆記錄（無 ts，純計數）
  return Array.from({ length: count }, () => ({ stage, agent, ts: null }));
}

module.exports = {
  analyzeFailureHotspot,
  analyzeHookOverhead,
  analyzeWorkflowVelocity,
};
