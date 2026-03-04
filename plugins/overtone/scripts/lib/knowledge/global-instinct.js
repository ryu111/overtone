#!/usr/bin/env node
'use strict';
/**
 * global-instinct.js — 跨 Session 全域 Instinct 模組
 *
 * 將 session 層高信心觀察（confidence >= graduationThreshold）畢業到
 * 專案專屬的全域 store，供後續 session 載入使用。
 *
 * 全域 store 位置：~/.overtone/global/{projectHash}/observations.jsonl
 *
 * 去重鍵：tag + type（不以 id）
 * merge 語意：confidence 取 max，count 相加，lastSeen 取較新，
 *             trigger/action 取 confidence 較高方（相等取 session 方）
 *
 * 注意：此模組不引用 instinct.js，獨立實作低層讀寫工具。
 */

const { readFileSync, appendFileSync, existsSync, mkdirSync } = require('fs');
const { dirname } = require('path');
const paths = require('../paths');
const { globalInstinctDefaults } = require('../registry');
const { atomicWrite, clamp } = require('../utils');

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const AUTO_DELETE_THRESHOLD = 0.2;

// ── 低層讀寫工具（獨立實作，不依賴 instinct.js）──

/**
 * 讀取全域 store 所有觀察（JSONL 全量讀取，同 tag+type 合併取最新）
 * @param {string} projectRoot
 * @returns {object[]}
 */
function _readAll(projectRoot) {
  const filePath = paths.global.observations(projectRoot);
  if (!existsSync(filePath)) return [];

  const lines = readFileSync(filePath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean);

  const items = lines
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);

  // 同 tag+type 合併：後出現的記錄覆蓋先出現的（支援 append-only 更新）
  const byKey = new Map();
  for (const item of items) {
    const key = `${item.tag}||${item.type}`;
    byKey.set(key, item);
  }
  const merged = Array.from(byKey.values());

  // 自動壓縮：原始行數超過唯一條目的 2 倍時，重寫檔案，避免無限膨脹
  if (merged.length > 0 && lines.length > merged.length * 2) {
    _writeAll(projectRoot, merged);
  }

  return merged;
}

/**
 * 全量寫回（用於 prune/decay 等需要刪減的操作）
 * @param {string} projectRoot
 * @param {object[]} list
 */
function _writeAll(projectRoot, list) {
  const filePath = paths.global.observations(projectRoot);
  const content = list.map(item => JSON.stringify(item)).join('\n');
  atomicWrite(filePath, content ? content + '\n' : '');
}

/**
 * 追加單筆記錄（O(1)）
 * @param {string} projectRoot
 * @param {object} item
 */
function _append(projectRoot, item) {
  const filePath = paths.global.observations(projectRoot);
  mkdirSync(dirname(filePath), { recursive: true });
  appendFileSync(filePath, JSON.stringify(item) + '\n', 'utf8');
}

/**
 * 將信心分數夾在 [0, 1]，四捨五入到小數點後 4 位
 * @param {number} value
 * @returns {number}
 */
function _clampConfidence(value) {
  return Math.round(clamp(value, 0, 1) * 10000) / 10000;
}

// ── 核心 API ──

/**
 * 畢業：將 sessionId 中 confidence >= graduationThreshold 的觀察升至專案全域 store。
 * 同 tag+type 已存在則 merge；執行後自動觸發 decayGlobal()。
 *
 * @param {string} sessionId
 * @param {string} projectRoot - 專案根目錄，用於計算 projectHash 隔離
 * @returns {{ graduated: number, merged: number, decayed: number, pruned: number }}
 */
function graduate(sessionId, projectRoot) {
  const threshold = globalInstinctDefaults.graduationThreshold;

  // 讀取 session 觀察
  const sessionObsPath = paths.session.observations(sessionId);
  if (!existsSync(sessionObsPath)) {
    const decayResult = decayGlobal(projectRoot);
    return { graduated: 0, merged: 0, ...decayResult };
  }

  const sessionLines = readFileSync(sessionObsPath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean);

  const sessionItems = sessionLines
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);

  // 同 id 合併（session 層邏輯）
  const byId = new Map();
  for (const item of sessionItems) {
    byId.set(item.id, item);
  }
  const sessionObs = Array.from(byId.values());

  // 篩選符合畢業門檻的觀察
  const candidates = sessionObs.filter(o => o.confidence >= threshold);

  if (candidates.length === 0) {
    const decayResult = decayGlobal(projectRoot);
    return { graduated: 0, merged: 0, ...decayResult };
  }

  // 讀取全域 store
  const globalObs = _readAll(projectRoot);
  const globalByKey = new Map();
  for (const item of globalObs) {
    const key = `${item.tag}||${item.type}`;
    globalByKey.set(key, item);
  }

  let graduated = 0;
  let merged = 0;
  const now = new Date().toISOString();

  for (const candidate of candidates) {
    const key = `${candidate.tag}||${candidate.type}`;

    if (globalByKey.has(key)) {
      // 已存在 → merge
      const existing = globalByKey.get(key);
      // trigger/action：取 confidence 較高方；相等時取 session 方（代表最新版本）
      const useSession = candidate.confidence >= existing.confidence;

      const updated = {
        ...existing,
        confidence: _clampConfidence(Math.max(existing.confidence, candidate.confidence)),
        count: (existing.count || 1) + (candidate.count || 1),
        lastSeen: existing.lastSeen > candidate.lastSeen ? existing.lastSeen : candidate.lastSeen,
        trigger: useSession ? candidate.trigger : existing.trigger,
        action: useSession ? candidate.action : existing.action,
        // globalTs 保留原有值，不更新
      };

      globalByKey.set(key, updated);
      _append(projectRoot, updated);
      merged++;
    } else {
      // 新畢業 → 完整複製 + 新增 globalTs
      const newGlobal = {
        ...candidate,
        globalTs: now,
      };

      globalByKey.set(key, newGlobal);
      _append(projectRoot, newGlobal);
      graduated++;
    }
  }

  // 畢業後自動執行 decay
  const decayResult = decayGlobal(projectRoot);

  return { graduated, merged, ...decayResult };
}

/**
 * 查詢指定專案的全域觀察
 *
 * @param {string} projectRoot - 專案根目錄
 * @param {object} [filter={}]
 * @param {string} [filter.type] - 篩選 type
 * @param {string} [filter.tag] - 篩選 tag
 * @param {number} [filter.minConfidence] - 最低信心分數
 * @param {number} [filter.limit] - 最多回傳筆數（先按 confidence 降序排列再截取）
 * @returns {object[]}
 */
function queryGlobal(projectRoot, filter = {}) {
  let list = _readAll(projectRoot);

  if (filter.type) list = list.filter(i => i.type === filter.type);
  if (filter.tag) list = list.filter(i => i.tag === filter.tag);
  if (filter.minConfidence !== undefined) {
    list = list.filter(i => i.confidence >= filter.minConfidence);
  }
  if (filter.limit) {
    // 先按 confidence 降序排列，再截取 top-N
    list = list.slice().sort((a, b) => b.confidence - a.confidence).slice(0, filter.limit);
  }

  return list;
}

/**
 * 取得指定專案的全域觀察統計摘要
 *
 * @param {string} projectRoot - 專案根目錄
 * @returns {{ total: number, applicable: number, byType: object, byTag: object }}
 */
function summarizeGlobal(projectRoot) {
  const list = _readAll(projectRoot);

  const applicable = list.filter(i => i.confidence >= globalInstinctDefaults.graduationThreshold).length;

  const byType = {};
  for (const item of list) {
    if (!byType[item.type]) byType[item.type] = 0;
    byType[item.type]++;
  }

  const byTag = {};
  for (const item of list) {
    if (!byTag[item.tag]) byTag[item.tag] = 0;
    byTag[item.tag]++;
  }

  return {
    total: list.length,
    applicable,
    byType,
    byTag,
  };
}

/**
 * 週衰減：對超過 7 天未更新的全域觀察施加 -0.02，並自動 prune
 *
 * @param {string} projectRoot - 專案根目錄
 * @returns {{ decayed: number, pruned: number }}
 */
function decayGlobal(projectRoot) {
  const list = _readAll(projectRoot);
  if (list.length === 0) return { decayed: 0, pruned: 0 };

  const now = Date.now();
  let decayed = 0;

  for (const item of list) {
    const age = now - new Date(item.lastSeen).getTime();
    if (age >= WEEK_MS) {
      item.confidence = _clampConfidence(item.confidence - 0.02);
      decayed++;
    }
  }

  const pruned = list.filter(i => i.confidence < AUTO_DELETE_THRESHOLD).length;
  const surviving = list.filter(i => i.confidence >= AUTO_DELETE_THRESHOLD);
  _writeAll(projectRoot, surviving);

  return { decayed, pruned };
}

/**
 * 刪除信心低於 autoDeleteThreshold 的全域觀察
 *
 * @param {string} projectRoot - 專案根目錄
 * @returns {number} 刪除數量
 */
function pruneGlobal(projectRoot) {
  const list = _readAll(projectRoot);
  const pruned = list.filter(i => i.confidence < AUTO_DELETE_THRESHOLD).length;
  const surviving = list.filter(i => i.confidence >= AUTO_DELETE_THRESHOLD);
  _writeAll(projectRoot, surviving);
  return pruned;
}

/**
 * 根據 ID 列表批量調整 confidence
 * 用於時間序列學習的品質反饋
 *
 * @param {string} projectRoot
 * @param {string[]} ids - 觀察 ID 列表
 * @param {number} delta - 信心分數調整量（正/負）
 * @returns {number} 實際更新的筆數
 */
function adjustConfidenceByIds(projectRoot, ids, delta) {
  if (!ids || ids.length === 0 || delta === 0) return 0;

  const records = _readAll(projectRoot);
  if (records.length === 0) return 0;

  const idSet = new Set(ids);
  let updated = 0;

  for (const r of records) {
    if (idSet.has(r.id)) {
      const oldConf = r.confidence;
      r.confidence = _clampConfidence((r.confidence || 0.3) + delta);
      if (r.confidence !== oldConf) updated++;
    }
  }

  if (updated > 0) {
    _writeAll(projectRoot, records);
  }

  return updated;
}

module.exports = {
  graduate,
  queryGlobal,
  summarizeGlobal,
  decayGlobal,
  pruneGlobal,
  adjustConfidenceByIds,
};
