#!/usr/bin/env node
'use strict';
/**
 * session-digest.js — Session 自動摘要
 *
 * 在 SessionEnd 時產生 session 摘要，寫入 global 目錄供跨 session 查詢。
 * 儲存位置：~/.overtone/global/{projectHash}/digests.jsonl
 *
 * API 使用 dependency injection 模式（_getDeps()），便於測試。
 */

const { appendFileSync, mkdirSync } = require('fs');
const { dirname } = require('path');

// ── 依賴（可透過 _deps 注入供測試替換）──

function _getDeps(_deps = {}) {
  return {
    timeline:       _deps.timeline       || require('./timeline'),
    failureTracker: _deps.failureTracker || require('./failure-tracker'),
    state:          _deps.state          || require('./state'),
    paths:          _deps.paths          || require('./paths'),
  };
}

// ── 核心 API ──

/**
 * 產生 session 摘要
 *
 * @param {string} sessionId
 * @param {string} projectRoot
 * @param {object} [_deps] - 依賴注入（供測試替換）
 * @returns {{
 *   ts: string,
 *   sessionId: string,
 *   workflowType: string|null,
 *   featureName: string|null,
 *   durationMs: number|null,
 *   totalEvents: number,
 *   byCategory: { [category]: number },
 *   stages: {
 *     total: number,
 *     pass: number,
 *     fail: number,
 *     reject: number,
 *   },
 *   failureHotspot: { stage: string, agent: string, count: number }|null,
 * }}
 */
function generateDigest(sessionId, projectRoot, _deps = {}) {
  const deps = _getDeps(_deps);

  // ── 從 workflow state 取得 workflowType 和 featureName ──

  let workflowType = null;
  let featureName = null;

  try {
    const state = deps.state.readState(sessionId);
    if (state) {
      workflowType = state.workflowType || null;
      featureName = state.featureName || null;
    }
  } catch {
    // 讀取失敗靜默降級
  }

  // ── 查詢 timeline 事件 ──

  let allEvents = [];
  try {
    allEvents = deps.timeline.query(sessionId, {});
  } catch {
    allEvents = [];
  }

  const totalEvents = allEvents.length;

  // ── 按 category 分組計數 ──

  const byCategory = {};
  for (const e of allEvents) {
    const cat = e.category || 'unknown';
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  }

  // ── 計算 session 總時長（第一個到最後一個事件的時間差）──

  let durationMs = null;
  if (allEvents.length >= 2) {
    try {
      const firstTs = new Date(allEvents[0].ts).getTime();
      const lastTs = new Date(allEvents[allEvents.length - 1].ts).getTime();
      const diff = lastTs - firstTs;
      if (!isNaN(diff) && diff >= 0) {
        durationMs = diff;
      }
    } catch {
      // 時間計算失敗靜默
    }
  }

  // ── 統計 stage 執行結果 ──

  let stageCompletes = [];
  try {
    stageCompletes = deps.timeline.query(sessionId, { type: 'stage:complete' });
  } catch {
    stageCompletes = [];
  }

  const stages = { total: 0, pass: 0, fail: 0, reject: 0 };
  for (const e of stageCompletes) {
    stages.total++;
    const result = e.result || 'pass';
    if (result === 'pass') stages.pass++;
    else if (result === 'fail') stages.fail++;
    else if (result === 'reject') stages.reject++;
  }

  // ── 統計異常事件（error:fatal / tool:failure / system:warning）──

  let fatalErrors = [];
  let toolFailures = [];
  let systemWarnings = [];
  try {
    fatalErrors = deps.timeline.query(sessionId, { type: 'error:fatal' });
    toolFailures = deps.timeline.query(sessionId, { type: 'tool:failure' });
    systemWarnings = deps.timeline.query(sessionId, { type: 'system:warning' });
  } catch {
    // 異常事件查詢失敗靜默降級
  }

  const incidents = {
    fatalErrors: fatalErrors.length,
    toolFailures: toolFailures.length,
    systemWarnings: systemWarnings.length,
  };

  // ── 失敗熱點（若有 failure 記錄）──

  let failureHotspot = null;
  try {
    const patterns = deps.failureTracker.getFailurePatterns(projectRoot);
    if (patterns && patterns.topPattern) {
      failureHotspot = patterns.topPattern;
    }
  } catch {
    // 失敗熱點分析失敗靜默降級
  }

  return {
    ts: new Date().toISOString(),
    sessionId,
    workflowType,
    featureName,
    durationMs,
    totalEvents,
    byCategory,
    stages,
    incidents,
    failureHotspot,
  };
}

/**
 * 將摘要 append 到 global digests.jsonl
 *
 * @param {string} projectRoot
 * @param {object} digest - generateDigest 的回傳值
 * @param {object} [_deps] - 依賴注入（供測試替換）
 */
function appendDigest(projectRoot, digest, _deps = {}) {
  const deps = _getDeps(_deps);

  if (!projectRoot || !digest) return;

  const filePath = deps.paths.global.digests(projectRoot);
  mkdirSync(dirname(filePath), { recursive: true });
  appendFileSync(filePath, JSON.stringify(digest) + '\n', 'utf8');
}

module.exports = {
  generateDigest,
  appendDigest,
  _getDeps,
};
