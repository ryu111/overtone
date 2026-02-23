'use strict';
/**
 * sessions.js — Session 列表管理
 *
 * 掃描 ~/.overtone/sessions/ 目錄，
 * 讀取每個 session 的 workflow.json 產生摘要列表。
 */

const { readdirSync } = require('fs');
const { SESSIONS_DIR } = require('../paths');
const state = require('../state');

/**
 * 列出所有 session 摘要
 * @param {{active?: boolean}} [filter={}] - 篩選條件
 * @returns {Array<{sessionId, workflowType, createdAt, currentStage, progress, isActive}>}
 */
function listSessions(filter = {}) {
  let entries;
  try {
    entries = readdirSync(SESSIONS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }

  const sessions = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const summary = getSessionSummary(entry.name);
    if (!summary) continue;

    // 篩選 active/inactive
    if (filter.active === true && !summary.isActive) continue;
    if (filter.active === false && summary.isActive) continue;

    sessions.push(summary);
  }

  // 按建立時間倒序
  sessions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return sessions;
}

/**
 * 取得單一 session 摘要
 * @param {string} sessionId
 * @returns {object|null}
 */
function getSessionSummary(sessionId) {
  const ws = state.readState(sessionId);
  if (!ws) return null;

  const stageEntries = Object.entries(ws.stages || {});
  const completed = stageEntries.filter(([, s]) => s.status === 'completed').length;
  const total = stageEntries.length;

  return {
    sessionId: ws.sessionId || sessionId,
    workflowType: ws.workflowType,
    createdAt: ws.createdAt,
    currentStage: ws.currentStage,
    progress: { completed, total },
    isActive: Object.keys(ws.activeAgents || {}).length > 0,
    failCount: ws.failCount || 0,
    rejectCount: ws.rejectCount || 0,
  };
}

module.exports = { listSessions, getSessionSummary };
