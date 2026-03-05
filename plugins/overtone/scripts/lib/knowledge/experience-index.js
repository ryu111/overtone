'use strict';
/**
 * experience-index.js — 專案經驗索引
 *
 * 維護「什麼專案需要哪些 skill domain」的全域索引，
 * 讓 project-orchestrator.js 能根據歷史經驗加速能力盤點。
 *
 * 資料路徑：~/.overtone/global/{projectHash}/experience-index.json
 *
 * 格式：
 *   { version: 1, entries: ExperienceEntry[] }
 *
 * ExperienceEntry:
 *   { projectHash, domains, lastUpdated, sessionCount }
 *
 * 導出：
 *   buildIndex(projectRoot, domains) => void
 *   queryIndex(projectRoot, specText, options?) => IndexQueryResult
 *   readIndex(projectRoot) => ExperienceEntry[]
 */

const { readFileSync, existsSync } = require('fs');
const paths = require('../paths');
const { atomicWrite } = require('../utils');
const { DOMAIN_KEYWORDS } = require('./knowledge-gap-detector');

const INDEX_VERSION = 1;

// ── 內部讀寫工具 ──

/**
 * 讀取 experience-index.json，回傳完整結構
 * @param {string} filePath
 * @returns {{ version: number, entries: object[] }}
 */
function _readFile(filePath) {
  if (!existsSync(filePath)) {
    return { version: INDEX_VERSION, entries: [] };
  }
  try {
    const raw = readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.entries)) {
      return { version: INDEX_VERSION, entries: [] };
    }
    return data;
  } catch {
    return { version: INDEX_VERSION, entries: [] };
  }
}

/**
 * 寫入 experience-index.json（原子寫入）
 * @param {string} filePath
 * @param {{ version: number, entries: object[] }} data
 */
function _writeFile(filePath, data) {
  atomicWrite(filePath, data);
}

// ── 公開 API ──

/**
 * 建立或更新此 projectRoot 的索引條目（upsert 語意）
 *
 * - 不存在 → 建立新條目，sessionCount = 1
 * - 已存在 → sessionCount++，domains union，lastUpdated 更新
 *
 * @param {string} projectRoot
 * @param {string[]} domains - 本次 session/workflow 用到的 domains
 */
function buildIndex(projectRoot, domains) {
  const filePath = paths.global.experienceIndex(projectRoot);
  const data = _readFile(filePath);

  const hash = paths.projectHash(projectRoot);
  const existing = data.entries.find(e => e.projectHash === hash);

  if (existing) {
    // upsert：union domains，sessionCount++
    const merged = Array.from(new Set([...existing.domains, ...domains]));
    existing.domains = merged;
    existing.sessionCount = (existing.sessionCount || 0) + 1;
    existing.lastUpdated = new Date().toISOString();
  } else {
    // 新條目
    data.entries.push({
      projectHash: hash,
      domains: Array.from(new Set(domains)),
      lastUpdated: new Date().toISOString(),
      sessionCount: 1,
    });
  }

  _writeFile(filePath, data);
}

/**
 * 根據 specText 中的關鍵詞，推薦此專案可能需要的 skill domains
 *
 * 演算法：
 *   1. 對 specText 做 DOMAIN_KEYWORDS 關鍵詞匹配，取得 matchedDomains
 *   2. 遍歷所有 entry（排除自身），計算與 matchedDomains 的重疊
 *   3. overlap >= minOverlap 的 entry 列為相似專案
 *   4. 統計所有相似專案中出現的 domain 頻率，依頻率排序
 *   5. 取前 maxRecommendations 個
 *
 * @param {string} projectRoot
 * @param {string} specText - 專案描述或 spec 文字
 * @param {object} [options]
 * @param {number} [options.maxRecommendations=5]
 * @param {number} [options.minOverlap=1] - 最少共同 domain 數
 * @returns {{ recommendedDomains: string[], matchedProjects: number }}
 */
function queryIndex(projectRoot, specText, options = {}) {
  const maxRecommendations = options.maxRecommendations !== undefined ? options.maxRecommendations : 5;
  const minOverlap = options.minOverlap !== undefined ? options.minOverlap : 1;

  const filePath = paths.global.experienceIndex(projectRoot);
  const data = _readFile(filePath);

  if (data.entries.length === 0) {
    return { recommendedDomains: [], matchedProjects: 0 };
  }

  // 步驟 1：從 specText 偵測相關 domains
  const lowerSpec = (specText || '').toLowerCase();
  const matchedDomains = new Set();

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    const hits = keywords.filter(kw => lowerSpec.includes(kw.toLowerCase()));
    if (hits.length > 0) {
      matchedDomains.add(domain);
    }
  }

  // 步驟 2-3：找相似專案（排除自身）
  const selfHash = paths.projectHash(projectRoot);
  const domainFreq = new Map();
  let matchedProjects = 0;

  for (const entry of data.entries) {
    if (entry.projectHash === selfHash) continue;

    // 計算重疊數量
    const overlap = entry.domains.filter(d => matchedDomains.has(d)).length;
    if (overlap >= minOverlap) {
      matchedProjects++;
      for (const d of entry.domains) {
        domainFreq.set(d, (domainFreq.get(d) || 0) + 1);
      }
    }
  }

  // 步驟 4-5：依頻率排序，取前 maxRecommendations 個
  const sorted = Array.from(domainFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([domain]) => domain)
    .slice(0, maxRecommendations);

  return {
    recommendedDomains: sorted,
    matchedProjects,
  };
}

/**
 * 讀取所有 experience-index 條目
 *
 * @param {string} projectRoot
 * @returns {Array<{ projectHash: string, domains: string[], lastUpdated: string, sessionCount: number }>}
 */
function readIndex(projectRoot) {
  const filePath = paths.global.experienceIndex(projectRoot);
  const data = _readFile(filePath);
  return data.entries;
}

module.exports = { buildIndex, queryIndex, readIndex };
