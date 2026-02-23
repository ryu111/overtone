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

  let events = lines.map((line) => JSON.parse(line));

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

module.exports = { emit, query, latest };
