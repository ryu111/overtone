#!/usr/bin/env node
'use strict';
/**
 * timeline.js — JSONL append-only 事件記錄
 *
 * 每行一個 JSON 物件，append-only。
 * 18 種事件類型定義在 registry.js。
 */

const { appendFileSync, readFileSync, mkdirSync } = require('fs');
const { dirname } = require('path');
const paths = require('./paths');
const { timelineEvents } = require('./registry');
const { atomicWrite } = require('./utils');

const MAX_EVENTS = 2000;

/**
 * 寫入一筆 timeline 事件
 * @param {string} sessionId
 * @param {string} eventType - registry 中的 timeline event key（如 'workflow:start'）
 * @param {object} [data={}] - 附加資料
 * @returns {object} 寫入的完整事件物件
 */
function emit(sessionId, eventType, data = {}) {
  const def = timelineEvents[eventType];
  if (!def) throw new Error(`未知的 timeline 事件類型：${eventType}`);

  const event = {
    ts: new Date().toISOString(),
    type: eventType,
    category: def.category,
    label: def.label,
    ...data,
  };

  const filePath = paths.session.timeline(sessionId);
  mkdirSync(dirname(filePath), { recursive: true });
  appendFileSync(filePath, JSON.stringify(event) + '\n', 'utf8');

  // 定期截斷：每 100 次寫入檢查一次
  if (!emit._counter) emit._counter = 0;
  if (++emit._counter % 100 === 0) {
    trimIfNeeded(sessionId);
  }

  return event;
}

/**
 * 查詢 timeline 事件
 * @param {string} sessionId
 * @param {object} [filter={}]
 * @param {string} [filter.type] - 篩選事件類型
 * @param {string} [filter.category] - 篩選分類
 * @param {number} [filter.limit] - 最多返回幾筆（從最新開始）
 * @returns {object[]} 事件陣列
 */
function query(sessionId, filter = {}) {
  const filePath = paths.session.timeline(sessionId);
  let lines;
  try {
    lines = readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }

  let events = lines.map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);

  if (filter.type) {
    events = events.filter((e) => e.type === filter.type);
  }
  if (filter.category) {
    events = events.filter((e) => e.category === filter.category);
  }
  if (filter.limit) {
    events = events.slice(-filter.limit);
  }

  return events;
}

/**
 * 取得最近一筆特定類型的事件
 * @param {string} sessionId
 * @param {string} eventType
 * @returns {object|null}
 */
function latest(sessionId, eventType) {
  const results = query(sessionId, { type: eventType, limit: 1 });
  return results[0] || null;
}

/**
 * 截斷過長的 JSONL（保留最新的 MAX_EVENTS 筆）
 * 從 query() 分離為獨立函式，由 emit() 定期觸發。
 * @param {string} sessionId
 */
function trimIfNeeded(sessionId) {
  const filePath = paths.session.timeline(sessionId);
  try {
    const lines = readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean);
    if (lines.length > MAX_EVENTS) {
      const trimmed = lines.slice(-MAX_EVENTS);
      atomicWrite(filePath, trimmed.join('\n') + '\n');
    }
  } catch {
    // 檔案不存在或讀取失敗，跳過
  }
}

/**
 * 計算 per-session pass@k 統計
 * @param {string} sessionId
 * @returns {{ sessionId, computed, stages, overall }}
 */
function passAtK(sessionId) {
  const events = query(sessionId, { type: 'stage:complete' });

  // 依 stage key 分組
  const grouped = {};
  for (const e of events) {
    if (!e.stage) continue;
    if (!grouped[e.stage]) grouped[e.stage] = [];
    grouped[e.stage].push(e);
  }

  // 每個 stage 依 ts 排序並計算指標
  const stages = {};
  for (const [stageKey, stageEvents] of Object.entries(grouped)) {
    const sorted = [...stageEvents].sort((a, b) => new Date(a.ts) - new Date(b.ts));
    const attempts = sorted.map(e => ({ result: e.result, ts: e.ts }));
    const n = attempts.length;

    const pass1 = n >= 1 && attempts[0].result === 'pass';
    const pass3 = n >= 1 && attempts.slice(0, 3).some(a => a.result === 'pass');
    const passConsecutive3 = n >= 3
      ? attempts.slice(-3).every(a => a.result === 'pass')
      : null;

    stages[stageKey] = { attempts, pass1, pass3, passConsecutive3 };
  }

  // 計算 overall
  const stageCount = Object.keys(stages).length;
  let pass1Count = 0;
  let pass3Count = 0;
  for (const s of Object.values(stages)) {
    if (s.pass1) pass1Count++;
    if (s.pass3) pass3Count++;
  }

  const overall = {
    stageCount,
    pass1Count,
    pass3Count,
    pass1Rate: stageCount > 0 ? parseFloat((pass1Count / stageCount).toFixed(4)) : null,
    pass3Rate: stageCount > 0 ? parseFloat((pass3Count / stageCount).toFixed(4)) : null,
  };

  return {
    sessionId,
    computed: new Date().toISOString(),
    stages,
    overall,
  };
}

module.exports = { emit, query, latest, passAtK };
