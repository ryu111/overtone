#!/usr/bin/env node
'use strict';
/**
 * score-engine.js — 數值評分引擎
 *
 * 跨 session 追蹤 agent 輸出品質評分，支援三個維度：
 *   - clarity:       輸出清晰度（整數 1-5）
 *   - completeness:  完整度（整數 1-5）
 *   - actionability: 可操作性（整數 1-5）
 *   - overall:       平均分（小數 2 位）
 *
 * 儲存位置：~/.overtone/global/{projectHash}/scores.jsonl
 *
 * 對齊 baseline-tracker.js 模式（JSONL append-only + atomicWrite 截斷）
 */

const { readFileSync, appendFileSync, existsSync, mkdirSync } = require('fs');
const { dirname } = require('path');
const paths = require('./paths');
const { scoringDefaults } = require('./registry');
const { atomicWrite } = require('./utils');

// ── 核心 API ──

/**
 * 儲存一筆評分記錄（JSONL append-only）
 *
 * @param {string} projectRoot - 專案根目錄絕對路徑
 * @param {object} record - 評分記錄
 * @param {string} record.ts          - ISO 8601 timestamp
 * @param {string} record.sessionId   - session ID
 * @param {string} record.workflowType - workflow 類型
 * @param {string} record.stage       - 'DEV' | 'REVIEW' | 'TEST'
 * @param {string} record.agent       - agent 名稱
 * @param {object} record.scores      - { clarity, completeness, actionability }
 * @param {number} record.overall     - (clarity+completeness+actionability)/3，小數 2 位
 * @throws {Error} 若必要欄位缺失
 */
function saveScore(projectRoot, record) {
  // 驗證必要欄位
  if (!record || !record.stage) {
    throw new Error('saveScore: record.stage 為必要欄位');
  }
  if (!record.scores || record.scores.clarity === undefined || record.scores.clarity === null) {
    throw new Error('saveScore: record.scores.clarity 為必要欄位');
  }
  if (record.scores.completeness === undefined || record.scores.completeness === null) {
    throw new Error('saveScore: record.scores.completeness 為必要欄位');
  }
  if (record.scores.actionability === undefined || record.scores.actionability === null) {
    throw new Error('saveScore: record.scores.actionability 為必要欄位');
  }

  const filePath = paths.global.scores(projectRoot);
  mkdirSync(dirname(filePath), { recursive: true });
  appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf8');

  // 定期截斷：每次寫入後檢查，超過上限時保留最新的
  _trimIfNeeded(projectRoot);
}

/**
 * 查詢評分記錄
 *
 * @param {string} projectRoot
 * @param {object} [filter]
 * @param {string} [filter.stage]        - 篩選特定 stage
 * @param {string} [filter.workflowType] - 篩選特定 workflow 類型
 * @param {number} [filter.limit]        - 最多返回幾筆（從最新開始）
 * @returns {object[]}
 */
function queryScores(projectRoot, filter) {
  const f = filter || {};
  let records = _readAll(projectRoot);

  if (f.stage) {
    records = records.filter(r => r.stage === f.stage);
  }
  if (f.workflowType) {
    records = records.filter(r => r.workflowType === f.workflowType);
  }
  if (f.limit && f.limit > 0) {
    records = records.slice(-f.limit);
  }

  return records;
}

/**
 * 取得特定 stage 的最近 N 筆評分摘要（平均值）
 *
 * @param {string} projectRoot
 * @param {string} stageKey - 如 'DEV'、'REVIEW'、'TEST'
 * @param {number} [n] - 取最近幾筆，預設 scoringDefaults.compareWindowSize
 * @returns {{ sessionCount: number, avgClarity: number|null, avgCompleteness: number|null, avgActionability: number|null, avgOverall: number|null }}
 */
function getScoreSummary(projectRoot, stageKey, n) {
  const windowSize = n || scoringDefaults.compareWindowSize;
  const records = _readAll(projectRoot)
    .filter(r => r.stage === stageKey)
    .slice(-windowSize);

  if (records.length === 0) {
    return {
      sessionCount: 0,
      avgClarity: null,
      avgCompleteness: null,
      avgActionability: null,
      avgOverall: null,
    };
  }

  const avg = (arr) => arr.reduce((sum, v) => sum + v, 0) / arr.length;
  const round2 = (v) => Math.round(v * 100) / 100;

  return {
    sessionCount: records.length,
    avgClarity:       round2(avg(records.map(r => r.scores.clarity))),
    avgCompleteness:  round2(avg(records.map(r => r.scores.completeness))),
    avgActionability: round2(avg(records.map(r => r.scores.actionability))),
    avgOverall:       round2(avg(records.map(r => r.overall))),
  };
}

// ── 低層工具 ──

/**
 * 讀取所有評分記錄（靜默容錯）
 * @param {string} projectRoot
 * @returns {object[]}
 */
function _readAll(projectRoot) {
  const filePath = paths.global.scores(projectRoot);
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
 * 截斷超過上限的記錄（按 stage 分組保留最新的 maxRecordsPerStage 筆）
 * @param {string} projectRoot
 */
function _trimIfNeeded(projectRoot) {
  const filePath = paths.global.scores(projectRoot);
  const records = _readAll(projectRoot);
  if (records.length === 0) return;

  // 按 stage 分組
  const byStage = {};
  for (const r of records) {
    if (!byStage[r.stage]) byStage[r.stage] = [];
    byStage[r.stage].push(r);
  }

  // 檢查是否有任何 stage 超過上限
  let needsTrim = false;
  for (const group of Object.values(byStage)) {
    if (group.length > scoringDefaults.maxRecordsPerStage) {
      needsTrim = true;
      break;
    }
  }

  if (!needsTrim) return;

  // 重寫：每種 stage 只保留最新的 maxRecordsPerStage 筆
  const trimmed = [];
  for (const group of Object.values(byStage)) {
    trimmed.push(...group.slice(-scoringDefaults.maxRecordsPerStage));
  }

  // 按 ts 排序維持時間順序
  trimmed.sort((a, b) => new Date(a.ts) - new Date(b.ts));
  const content = trimmed.map(r => JSON.stringify(r)).join('\n');
  atomicWrite(filePath, content ? content + '\n' : '');
}

module.exports = { saveScore, queryScores, getScoreSummary };
