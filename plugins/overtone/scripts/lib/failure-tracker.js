#!/usr/bin/env node
'use strict';
/**
 * failure-tracker.js — 跨 session 失敗模式追蹤
 *
 * 跨 session 記錄 fail/reject 事件，聚合分析哪個 stage/agent 最常失敗，
 * 並在執行前注入警告，幫助 agent 預防已知的失敗模式。
 *
 * 儲存位置：~/.overtone/global/{projectHash}/failures.jsonl
 */

const { readFileSync, appendFileSync, existsSync, mkdirSync } = require('fs');
const { dirname } = require('path');
const paths = require('./paths');
const { failureDefaults } = require('./registry');
const { atomicWrite } = require('./utils');

// ── 核心 API ──

/**
 * 記錄一筆失敗（JSONL append-only）
 *
 * @param {string} projectRoot
 * @param {object} record - { ts, sessionId, workflowType, stage, agent, verdict: 'fail'|'reject', retryAttempt }
 */
function recordFailure(projectRoot, record) {
  if (!projectRoot || !record) return;

  // 測試環境不寫入真實 failures store（避免測試污染生產資料）
  if (process.env.OVERTONE_TEST || process.env.BUN_TEST) return;

  // 驗證必要欄位
  const required = ['ts', 'sessionId', 'stage', 'agent', 'verdict'];
  for (const field of required) {
    if (!record[field]) return;
  }

  const filePath = paths.global.failures(projectRoot);
  mkdirSync(dirname(filePath), { recursive: true });
  appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf8');

  // 定期截斷：超過上限時保留最新的
  _trimIfNeeded(projectRoot);
}

/**
 * 記錄一筆解決記錄（stage 最終 pass 時呼叫，用於過濾之前的 fail）
 *
 * @param {string} projectRoot
 * @param {object} record - { ts, sessionId, stage }
 */
function recordResolution(projectRoot, record) {
  if (!projectRoot || !record) return;

  // 測試環境不寫入真實 failures store
  if (process.env.OVERTONE_TEST || process.env.BUN_TEST) return;

  const required = ['ts', 'sessionId', 'stage'];
  for (const field of required) {
    if (!record[field]) return;
  }

  const filePath = paths.global.failures(projectRoot);
  mkdirSync(dirname(filePath), { recursive: true });
  appendFileSync(filePath, JSON.stringify({ ...record, verdict: 'resolved' }) + '\n', 'utf8');
}

/**
 * 取得失敗模式分析（最近 N 筆）
 *
 * @param {string} projectRoot
 * @param {number} [window] - 取最近幾筆，預設 warningWindow
 * @returns {{
 *   totalFailures: number,
 *   byStage: { [stage]: { count: number, rate: number } },
 *   byAgent: { [agent]: { count: number, rate: number } },
 *   topPattern: { stage: string, agent: string, count: number } | null
 * }}
 */
function getFailurePatterns(projectRoot, window) {
  const windowSize = window || failureDefaults.warningWindow;
  const all = _readAll(projectRoot);

  // 建立 resolved Set：同 sessionId::stage 有 resolved 記錄者，排除其所有 failures
  const resolvedKeys = new Set();
  for (const r of all) {
    if (r.verdict === 'resolved') {
      resolvedKeys.add(`${r.sessionId}::${r.stage}`);
    }
  }

  // 過濾：排除 resolved 的 session+stage 組合中的 fail/reject 記錄，並排除 resolved 記錄本身
  const failures = all.filter(r => {
    if (r.verdict === 'resolved') return false;
    if (resolvedKeys.has(`${r.sessionId}::${r.stage}`)) return false;
    return true;
  });

  const records = failures.slice(-windowSize);

  const totalFailures = records.length;

  if (totalFailures === 0) {
    return { totalFailures: 0, byStage: {}, byAgent: {}, topPattern: null };
  }

  // 按 stage 聚合
  const stageCount = {};
  for (const r of records) {
    if (!stageCount[r.stage]) stageCount[r.stage] = 0;
    stageCount[r.stage]++;
  }
  const byStage = {};
  for (const [stage, count] of Object.entries(stageCount)) {
    byStage[stage] = { count, rate: Math.round((count / totalFailures) * 10000) / 10000 };
  }

  // 按 agent 聚合
  const agentCount = {};
  for (const r of records) {
    if (!agentCount[r.agent]) agentCount[r.agent] = 0;
    agentCount[r.agent]++;
  }
  const byAgent = {};
  for (const [agent, count] of Object.entries(agentCount)) {
    byAgent[agent] = { count, rate: Math.round((count / totalFailures) * 10000) / 10000 };
  }

  // 找 topPattern（stage + agent 組合最多失敗的）
  const pairCount = {};
  for (const r of records) {
    const key = `${r.stage}::${r.agent}`;
    if (!pairCount[key]) pairCount[key] = { stage: r.stage, agent: r.agent, count: 0 };
    pairCount[key].count++;
  }
  let topPattern = null;
  for (const entry of Object.values(pairCount)) {
    if (!topPattern || entry.count > topPattern.count) {
      topPattern = entry;
    }
  }

  return { totalFailures, byStage, byAgent, topPattern };
}

/**
 * 格式化失敗模式警告（用於 pre-task.js 注入）
 *
 * 只在 targetStage 有歷史失敗 >= warningThreshold 時才產生警告（避免雜訊）。
 *
 * @param {string} projectRoot
 * @param {string} targetStage - 即將執行的 stage
 * @returns {string|null} - 有相關失敗模式時回傳警告文字
 */
function formatFailureWarnings(projectRoot, targetStage) {
  if (!projectRoot || !targetStage) return null;

  const patterns = getFailurePatterns(projectRoot);
  const stageData = patterns.byStage[targetStage];

  if (!stageData || stageData.count < failureDefaults.warningThreshold) {
    return null;
  }

  const lines = [
    `[失敗模式警告 — ${targetStage}]`,
    `此 stage 在最近 ${failureDefaults.warningWindow} 筆記錄中失敗 ${stageData.count} 次（佔 ${Math.round(stageData.rate * 100)}%）。`,
  ];

  // 找出在此 stage 失敗最多的 agent
  const all = _readAll(projectRoot).slice(-failureDefaults.warningWindow);
  const stageFailures = all.filter(r => r.stage === targetStage);
  if (stageFailures.length > 0) {
    const agentCounts = {};
    for (const r of stageFailures) {
      if (!agentCounts[r.agent]) agentCounts[r.agent] = 0;
      agentCounts[r.agent]++;
    }
    const topAgent = Object.entries(agentCounts).sort((a, b) => b[1] - a[1])[0];
    if (topAgent) {
      lines.push(`最常失敗的 agent：${topAgent[0]}（${topAgent[1]} 次）`);
    }

    // 列出 verdict 分布
    const failCount = stageFailures.filter(r => r.verdict === 'fail').length;
    const rejectCount = stageFailures.filter(r => r.verdict === 'reject').length;
    if (failCount > 0 || rejectCount > 0) {
      const parts = [];
      if (failCount > 0) parts.push(`fail: ${failCount}`);
      if (rejectCount > 0) parts.push(`reject: ${rejectCount}`);
      lines.push(`失敗類型：${parts.join('、')}`);
    }

    // 列出最近失敗的根因（去重，最多 3 個）
    const reasons = stageFailures
      .filter(r => r.reason)
      .map(r => r.reason);
    const uniqueReasons = [...new Set(reasons)].slice(0, 3);
    if (uniqueReasons.length > 0) {
      lines.push('常見失敗原因：');
      uniqueReasons.forEach(r => lines.push(`  - ${r}`));
    }
  }

  lines.push('建議：仔細核對本次任務的輸出品質，避免重蹈歷史失敗模式。');

  return lines.join('\n');
}

/**
 * 格式化失敗摘要（用於 SessionStart 注入）
 *
 * @param {string} projectRoot
 * @returns {string} - Markdown 摘要，無資料時空字串
 */
function formatFailureSummary(projectRoot) {
  if (!projectRoot) return '';

  const patterns = getFailurePatterns(projectRoot);
  if (patterns.totalFailures === 0) return '';

  // 計算時間範圍（從最近 warningWindow 筆失敗記錄中取最早和最晚）
  const all = _readAll(projectRoot);
  const resolvedKeys = new Set();
  for (const r of all) {
    if (r.verdict === 'resolved') resolvedKeys.add(`${r.sessionId}::${r.stage}`);
  }
  const recentFailures = all
    .filter(r => r.verdict !== 'resolved' && !resolvedKeys.has(`${r.sessionId}::${r.stage}`))
    .slice(-failureDefaults.warningWindow);

  let timeRange = '';
  const timestamps = recentFailures.map(r => r.ts).filter(Boolean).sort();
  if (timestamps.length >= 2) {
    const fmt = (iso) => {
      const d = new Date(iso);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    };
    const earliest = fmt(timestamps[0]);
    const latest = fmt(timestamps[timestamps.length - 1]);
    timeRange = earliest === latest ? `（${earliest}）` : `（${earliest} - ${latest}）`;
  }

  const lines = [
    `最近 ${failureDefaults.warningWindow} 筆記錄共 ${patterns.totalFailures} 次失敗${timeRange}：`,
  ];

  // 按 stage 排序（失敗最多的優先）
  const sortedStages = Object.entries(patterns.byStage)
    .sort((a, b) => b[1].count - a[1].count);

  for (const [stage, data] of sortedStages) {
    lines.push(`- ${stage}：${data.count} 次（${Math.round(data.rate * 100)}%）`);
  }

  if (patterns.topPattern) {
    lines.push(`\n最常見失敗組合：${patterns.topPattern.stage} × ${patterns.topPattern.agent}（${patterns.topPattern.count} 次）`);
  }

  return lines.join('\n');
}

// ── 低層工具 ──

/**
 * 讀取所有失敗記錄
 * @param {string} projectRoot
 * @returns {object[]}
 */
function _readAll(projectRoot) {
  const filePath = paths.global.failures(projectRoot);
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
 * 截斷超過上限的記錄（保留最新的 maxRecords 筆）
 * @param {string} projectRoot
 */
function _trimIfNeeded(projectRoot) {
  const filePath = paths.global.failures(projectRoot);
  const records = _readAll(projectRoot);
  if (records.length <= failureDefaults.maxRecords) return;

  // 保留最新的 maxRecords 筆
  const trimmed = records.slice(-failureDefaults.maxRecords);
  const content = trimmed.map(r => JSON.stringify(r)).join('\n');
  atomicWrite(filePath, content ? content + '\n' : '');
}

module.exports = {
  recordFailure,
  recordResolution,
  getFailurePatterns,
  formatFailureWarnings,
  formatFailureSummary,
};
