#!/usr/bin/env node
'use strict';
/**
 * instinct.js — Instinct 學習系統
 *
 * 從工作流執行中自動觀察並累積知識，依信心分數決定是否自動應用。
 *
 * 資料格式（observations.jsonl 每行）：
 *   { id, ts, lastSeen, type, trigger, action, tag, confidence, count }
 *
 * 信心分數生命週期：
 *   0.3（初始）→ +0.05/確認 → -0.10/矛盾 → -0.02/週衰減
 *   >= 0.7 自動應用 | < 0.2 自動刪除
 */

const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs');
const { dirname } = require('path');
const paths = require('./paths');
const { instinctDefaults } = require('./registry');

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

class Instinct {
  // ── 讀寫工具 ──

  /** 讀取所有 instinct（JSONL 全量讀取） */
  _readAll(sessionId) {
    const filePath = paths.session.observations(sessionId);
    if (!existsSync(filePath)) return [];

    return readFileSync(filePath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);
  }

  /** 全量寫回（修改後用此取代 append-only） */
  _writeAll(sessionId, list) {
    const filePath = paths.session.observations(sessionId);
    mkdirSync(dirname(filePath), { recursive: true });
    const content = list.map(item => JSON.stringify(item)).join('\n');
    writeFileSync(filePath, content ? content + '\n' : '', 'utf8');
  }

  /** 將分數夾在 [0, 1] 範圍內，並四捨五入到小數點後 4 位 */
  _clamp(value) {
    return Math.round(Math.min(1.0, Math.max(0.0, value)) * 10000) / 10000;
  }

  /** 產生唯一 ID */
  _newId() {
    return `inst_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  }

  // ── 核心 API ──

  /**
   * 建立或更新觀察
   * 若同 tag + type 已存在則呼叫 confirm()（信心 +0.05）
   * 否則以 initialConfidence 建立新 instinct
   *
   * @param {string} sessionId
   * @param {string} type - user_corrections | error_resolutions | repeated_workflows | tool_preferences
   * @param {string} trigger - 觸發條件描述
   * @param {string} action - 建議行動描述
   * @param {string} tag - 分類標籤（kebab-case，如 npm-bun, javascript-imports）
   * @returns {object} instinct 記錄
   */
  emit(sessionId, type, trigger, action, tag) {
    const list = this._readAll(sessionId);
    const existing = list.find(i => i.tag === tag && i.type === type);

    if (existing) {
      // 同 tag + type 已存在 → 確認（信心 +0.05）
      existing.confidence = this._clamp(existing.confidence + instinctDefaults.confirmBoost);
      existing.count = (existing.count || 1) + 1;
      existing.lastSeen = new Date().toISOString();
      // 更新 trigger/action 為最新觀察（保持最具代表性的描述）
      existing.trigger = trigger;
      existing.action = action;
      this._writeAll(sessionId, list);
      return existing;
    }

    // 新建 instinct
    const instinct = {
      id: this._newId(),
      ts: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      type,
      trigger,
      action,
      tag,
      confidence: instinctDefaults.initialConfidence,
      count: 1,
    };

    list.push(instinct);
    this._writeAll(sessionId, list);
    return instinct;
  }

  /**
   * 明確確認一個 instinct（信心 +0.05）
   * @param {string} sessionId
   * @param {string} id - instinct ID
   * @returns {object|null} 更新後的 instinct，或 null（若找不到）
   */
  confirm(sessionId, id) {
    const list = this._readAll(sessionId);
    const item = list.find(i => i.id === id);
    if (!item) return null;

    item.confidence = this._clamp(item.confidence + instinctDefaults.confirmBoost);
    item.lastSeen = new Date().toISOString();
    this._writeAll(sessionId, list);
    return item;
  }

  /**
   * 明確矛盾一個 instinct（信心 -0.10）
   * @param {string} sessionId
   * @param {string} id - instinct ID
   * @returns {object|null} 更新後的 instinct，或 null（若找不到）
   */
  contradict(sessionId, id) {
    const list = this._readAll(sessionId);
    const item = list.find(i => i.id === id);
    if (!item) return null;

    item.confidence = this._clamp(item.confidence + instinctDefaults.contradictionPenalty);
    item.lastSeen = new Date().toISOString();
    this._writeAll(sessionId, list);
    return item;
  }

  /**
   * 週衰減：對所有超過 7 天未更新的 instinct 施加 -0.02
   * 衰減後自動 prune 低信心 instinct
   *
   * @param {string} sessionId
   * @returns {{ decayed: number, pruned: number }}
   */
  decay(sessionId) {
    const list = this._readAll(sessionId);
    const now = Date.now();
    let decayed = 0;

    for (const item of list) {
      const age = now - new Date(item.lastSeen).getTime();
      if (age >= WEEK_MS) {
        item.confidence = this._clamp(item.confidence + instinctDefaults.weeklyDecay);
        decayed++;
      }
    }

    const pruned = this._pruneList(list);
    this._writeAll(sessionId, list.filter(
      i => i.confidence >= instinctDefaults.autoDeleteThreshold
    ));

    return { decayed, pruned };
  }

  /**
   * 刪除信心低於 autoDeleteThreshold 的 instinct
   * @param {string} sessionId
   * @returns {number} 刪除數量
   */
  prune(sessionId) {
    const list = this._readAll(sessionId);
    const pruned = this._pruneList(list);
    this._writeAll(sessionId, list.filter(
      i => i.confidence >= instinctDefaults.autoDeleteThreshold
    ));
    return pruned;
  }

  /** @private */
  _pruneList(list) {
    return list.filter(i => i.confidence < instinctDefaults.autoDeleteThreshold).length;
  }

  /**
   * 查詢 instinct
   * @param {string} sessionId
   * @param {object} [filter={}]
   * @param {string} [filter.type] - 篩選 type
   * @param {string} [filter.tag] - 篩選 tag
   * @param {number} [filter.minConfidence] - 最低信心分數
   * @param {number} [filter.limit] - 最多回傳筆數
   * @returns {object[]}
   */
  query(sessionId, filter = {}) {
    let list = this._readAll(sessionId);

    if (filter.type) list = list.filter(i => i.type === filter.type);
    if (filter.tag) list = list.filter(i => i.tag === filter.tag);
    if (filter.minConfidence !== undefined) {
      list = list.filter(i => i.confidence >= filter.minConfidence);
    }
    if (filter.limit) list = list.slice(0, filter.limit);

    return list;
  }

  /**
   * 取得可自動應用的 instinct（confidence >= autoApplyThreshold）
   * @param {string} sessionId
   * @returns {object[]}
   */
  getApplicable(sessionId) {
    return this.query(sessionId, { minConfidence: instinctDefaults.autoApplyThreshold });
  }

  /**
   * 統計摘要 + 進化候選分析
   * @param {string} sessionId
   * @returns {object}
   */
  summarize(sessionId) {
    const list = this._readAll(sessionId);
    const applicable = list.filter(i => i.confidence >= instinctDefaults.autoApplyThreshold);

    // 按 type 分類
    const byType = {};
    for (const item of list) {
      if (!byType[item.type]) byType[item.type] = 0;
      byType[item.type]++;
    }

    // 按 tag 分組（計算進化候選）
    const byTag = {};
    for (const item of list) {
      if (!byTag[item.tag]) byTag[item.tag] = { count: 0, totalConfidence: 0, items: [] };
      byTag[item.tag].count++;
      byTag[item.tag].totalConfidence += item.confidence;
      byTag[item.tag].items.push(item);
    }

    // Skill 進化候選：同 tag >= skillEvolutionCount 且平均 confidence >= autoApplyThreshold
    const skillCandidates = Object.entries(byTag)
      .filter(([, g]) => g.count >= instinctDefaults.skillEvolutionCount)
      .filter(([, g]) => (g.totalConfidence / g.count) >= instinctDefaults.autoApplyThreshold)
      .map(([tag, g]) => ({
        tag,
        count: g.count,
        avgConfidence: Math.round(g.totalConfidence / g.count * 100) / 100,
      }))
      .sort((a, b) => b.avgConfidence - a.avgConfidence);

    // Agent 進化候選：同 tag >= agentEvolutionCount
    const agentCandidates = Object.entries(byTag)
      .filter(([, g]) => g.count >= instinctDefaults.agentEvolutionCount)
      .map(([tag, g]) => ({ tag, count: g.count }))
      .sort((a, b) => b.count - a.count);

    return {
      total: list.length,
      applicable: applicable.length,
      byType,
      evolutionCandidates: {
        skills: skillCandidates,
        agents: agentCandidates,
      },
    };
  }
}

// ── 命令列介面（供 /ot:evolve 直接呼叫） ──

const instinct = new Instinct();

if (require.main === module) {
  const [cmd, sessionId] = process.argv.slice(2);

  if (!cmd || !sessionId) {
    console.error('用法：node instinct.js <command> <sessionId>');
    console.error('  命令：summarize | decay | prune | query | applicable');
    process.exit(1);
  }

  try {
    switch (cmd) {
      case 'summarize':
        console.log(JSON.stringify(instinct.summarize(sessionId), null, 2));
        break;
      case 'decay': {
        const result = instinct.decay(sessionId);
        console.log(JSON.stringify(result));
        break;
      }
      case 'prune': {
        const pruned = instinct.prune(sessionId);
        console.log(JSON.stringify({ pruned }));
        break;
      }
      case 'query':
        console.log(JSON.stringify(instinct.query(sessionId), null, 2));
        break;
      case 'applicable':
        console.log(JSON.stringify(instinct.getApplicable(sessionId), null, 2));
        break;
      default:
        console.error(`未知的命令：${cmd}`);
        process.exit(1);
    }
  } catch (err) {
    console.error(`錯誤：${err.message}`);
    process.exit(1);
  }
}

module.exports = instinct;
