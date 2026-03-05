'use strict';
/**
 * skill-evaluator.js — 知識條目內化門檻評估
 *
 * 評估 skills/instinct/auto-discovered.md 中的知識條目是否達到內化門檻。
 * 三個評估維度：
 *   - usageCount:  domain 相關 agent 使用次數（來自 observations.jsonl）
 *   - avgScore:    平均評分（來自 scores.jsonl，0-5）
 *   - confidence:  觀察信心度（來自 global observations，0-1）
 *
 * 輸出：
 *   EvaluationResult:
 *     entry:     string        - 原始條目內容
 *     domain:    string|null   - 偵測到的 domain（null = 無法路由）
 *     score:     number        - 綜合評分（0-1，加權平均）
 *     qualified: boolean       - 是否達到門檻
 *     reasons:   string[]      - 通過或不通過的原因清單
 */

const { readFileSync, existsSync } = require('fs');
const { queryScores } = require('../score-engine');
const { queryGlobal } = require('./global-instinct');
const { DOMAIN_KEYWORDS } = require('./knowledge-gap-detector');

// ── 門檻預設值 ──

const DEFAULTS = {
  minUsageCount: 2,
  minAvgScore: 3.5,
  minConfidence: 0.6,
};

// ── 核心 API ──

/**
 * 評估 auto-discovered.md 中所有知識條目是否達到內化門檻。
 *
 * @param {string} autoDiscoveredPath - auto-discovered.md 絕對路徑
 * @param {string} projectRoot - 專案根目錄絕對路徑
 * @param {object} [options]
 * @param {number} [options.minUsageCount=2] - 最低使用次數門檻
 * @param {number} [options.minAvgScore=3.5] - 最低平均評分門檻（0-5）
 * @param {number} [options.minConfidence=0.6] - 最低信心度門檻（0-1）
 * @returns {EvaluationResult[]}
 */
function evaluateEntries(autoDiscoveredPath, projectRoot, options = {}) {
  // 檔案不存在 → 回傳空陣列（不拋出例外）
  if (!existsSync(autoDiscoveredPath)) return [];

  let content;
  try {
    content = readFileSync(autoDiscoveredPath, 'utf8');
  } catch {
    return [];
  }

  const opts = {
    minUsageCount: options.minUsageCount !== undefined ? options.minUsageCount : DEFAULTS.minUsageCount,
    minAvgScore: options.minAvgScore !== undefined ? options.minAvgScore : DEFAULTS.minAvgScore,
    minConfidence: options.minConfidence !== undefined ? options.minConfidence : DEFAULTS.minConfidence,
  };

  // 以 `---` 分隔條目（過濾空條目）
  const rawEntries = content.split(/\n---\n/).map(e => e.trim()).filter(Boolean);

  // 預先載入評分和觀察資料（避免重複 I/O）
  const allScores = _loadScores(projectRoot);
  const allObservations = _loadObservations(projectRoot);

  return rawEntries.map(entry => _evaluateEntry(entry, projectRoot, opts, allScores, allObservations));
}

// ── 內部工具 ──

/**
 * 評估單一條目
 * @param {string} entry - 條目內容
 * @param {string} projectRoot - 專案根目錄
 * @param {object} opts - 已解析的門檻選項
 * @param {object[]} allScores - 預載入的評分記錄
 * @param {object[]} allObservations - 預載入的觀察記錄
 * @returns {EvaluationResult}
 */
function _evaluateEntry(entry, projectRoot, opts, allScores, allObservations) {
  const domain = _detectDomain(entry);
  const { usageCount, avgScore, confidence } = _computeMetrics(entry, domain, allScores, allObservations);

  const reasons = [];
  let qualified = true;

  // 檢查 usageCount 門檻
  if (usageCount >= opts.minUsageCount) {
    reasons.push(`usageCount ${usageCount} >= ${opts.minUsageCount}（通過）`);
  } else {
    reasons.push(`usageCount ${usageCount} < ${opts.minUsageCount}（不足）`);
    qualified = false;
  }

  // 檢查 avgScore 門檻
  if (avgScore >= opts.minAvgScore) {
    reasons.push(`avgScore ${avgScore.toFixed(2)} >= ${opts.minAvgScore}（通過）`);
  } else {
    reasons.push(`avgScore ${avgScore.toFixed(2)} < ${opts.minAvgScore}（不足）`);
    qualified = false;
  }

  // 檢查 confidence 門檻
  if (confidence >= opts.minConfidence) {
    reasons.push(`confidence ${confidence.toFixed(2)} >= ${opts.minConfidence}（通過）`);
  } else {
    reasons.push(`confidence ${confidence.toFixed(2)} < ${opts.minConfidence}（不足）`);
    qualified = false;
  }

  // 計算綜合評分（加權平均，正規化到 0-1）
  const score = _computeScore(usageCount, avgScore, confidence, opts);

  return { entry, domain, score, qualified, reasons };
}

/**
 * 偵測條目的 domain（取第一個命中關鍵詞最多的 domain）
 * @param {string} entry - 條目內容
 * @returns {string|null}
 */
function _detectDomain(entry) {
  // 嘗試從標題提取明確 domain 聲明（# domain 或 ## domain 格式）
  const titleMatch = entry.match(/^#{1,2}\s+(.+)/m);
  if (titleMatch) {
    const title = titleMatch[1].trim().toLowerCase();
    // 檢查 title 是否直接對應某個 domain
    if (DOMAIN_KEYWORDS[title]) {
      return title;
    }
  }

  // 關鍵詞匹配：找出命中最多關鍵詞的 domain
  const lowerEntry = entry.toLowerCase();
  let bestDomain = null;
  let bestCount = 0;

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    const count = keywords.filter(kw => lowerEntry.includes(kw.toLowerCase())).length;
    if (count > bestCount) {
      bestCount = count;
      bestDomain = domain;
    }
  }

  // 至少需要命中 1 個關鍵詞才能判斷 domain
  return bestCount >= 1 ? bestDomain : null;
}

/**
 * 計算條目的三個度量值
 * @param {string} entry - 條目內容
 * @param {string|null} domain - 偵測到的 domain
 * @param {object[]} allScores - 預載入的評分記錄
 * @param {object[]} allObservations - 預載入的觀察記錄
 * @returns {{ usageCount: number, avgScore: number, confidence: number }}
 */
function _computeMetrics(entry, domain, allScores, allObservations) {
  const usageCount = _computeUsageCount(entry, domain, allObservations);
  const avgScore = _computeAvgScore(domain, allScores);
  const confidence = _computeConfidence(domain, allObservations);

  return { usageCount, avgScore, confidence };
}

/**
 * 計算 usageCount：domain 相關觀察的出現次數
 * 策略：計算 observations 中 tag 或 trigger 包含 domain 相關關鍵詞的記錄總 count
 * @param {string} entry - 條目內容
 * @param {string|null} domain - 偵測到的 domain
 * @param {object[]} observations - 觀察記錄
 * @returns {number}
 */
function _computeUsageCount(entry, domain, observations) {
  if (!domain || observations.length === 0) return 0;

  const keywords = DOMAIN_KEYWORDS[domain] || [];
  if (keywords.length === 0) return 0;

  let totalCount = 0;
  for (const obs of observations) {
    const obsText = `${obs.tag || ''} ${obs.trigger || ''} ${obs.action || ''}`.toLowerCase();
    const matched = keywords.some(kw => obsText.includes(kw.toLowerCase()));
    if (matched) {
      // 使用 obs.count（觀察累積次數），若無則計為 1
      totalCount += (obs.count && typeof obs.count === 'number') ? obs.count : 1;
    }
  }

  return totalCount;
}

/**
 * 計算 avgScore：查詢 scores.jsonl 取得 overall 平均值
 * 若無相關評分資料，預設為 0
 * @param {string|null} domain - 偵測到的 domain
 * @param {object[]} scores - 評分記錄
 * @returns {number}
 */
function _computeAvgScore(domain, scores) {
  if (scores.length === 0) return 0;

  // 取所有 overall 評分的平均值作為 domain avgScore
  // 若 domain 存在，嘗試篩選與 domain 相關的 stage 記錄
  const domainStageMap = {
    'testing': ['TEST'],
    'code-review': ['REVIEW'],
    'debugging': ['DEV'],
    'architecture': ['ARCH'],
    'workflow-core': ['DEV', 'REVIEW'],
  };

  let relevantScores = scores;
  if (domain && domainStageMap[domain]) {
    const stages = domainStageMap[domain];
    const filtered = scores.filter(s => stages.includes(s.stage));
    if (filtered.length > 0) relevantScores = filtered;
  }

  if (relevantScores.length === 0) return 0;

  const overallScores = relevantScores
    .map(s => s.overall)
    .filter(v => typeof v === 'number' && !isNaN(v));

  if (overallScores.length === 0) return 0;

  const avg = overallScores.reduce((sum, v) => sum + v, 0) / overallScores.length;
  return Math.round(avg * 100) / 100;
}

/**
 * 計算 confidence：domain 觀察的最高信心度平均值
 * @param {string|null} domain - 偵測到的 domain
 * @param {object[]} observations - 觀察記錄
 * @returns {number}
 */
function _computeConfidence(domain, observations) {
  if (!domain || observations.length === 0) return 0;

  const keywords = DOMAIN_KEYWORDS[domain] || [];
  if (keywords.length === 0) return 0;

  const domainObs = observations.filter(obs => {
    const obsText = `${obs.tag || ''} ${obs.trigger || ''} ${obs.action || ''}`.toLowerCase();
    return keywords.some(kw => obsText.includes(kw.toLowerCase()));
  });

  if (domainObs.length === 0) return 0;

  const confidenceValues = domainObs
    .map(obs => obs.confidence)
    .filter(v => typeof v === 'number' && !isNaN(v));

  if (confidenceValues.length === 0) return 0;

  const avg = confidenceValues.reduce((sum, v) => sum + v, 0) / confidenceValues.length;
  return Math.round(avg * 10000) / 10000;
}

/**
 * 計算綜合評分（0-1），三個維度加權平均
 * @param {number} usageCount
 * @param {number} avgScore - 0-5 範圍
 * @param {number} confidence - 0-1 範圍
 * @param {object} opts - 包含門檻值（用於正規化）
 * @returns {number}
 */
function _computeScore(usageCount, avgScore, confidence, opts) {
  // 正規化到 0-1
  const normUsage = Math.min(usageCount / Math.max(opts.minUsageCount * 2, 1), 1);
  const normScore = Math.min(avgScore / 5, 1);
  const normConf = Math.min(confidence, 1);

  // 加權：avgScore 40% + confidence 40% + usageCount 20%
  const weighted = normScore * 0.4 + normConf * 0.4 + normUsage * 0.2;
  return Math.round(weighted * 10000) / 10000;
}

/**
 * 載入評分記錄（容錯處理）
 * @param {string} projectRoot
 * @returns {object[]}
 */
function _loadScores(projectRoot) {
  try {
    return queryScores(projectRoot, {});
  } catch {
    return [];
  }
}

/**
 * 載入觀察記錄（容錯處理）
 * @param {string} projectRoot
 * @returns {object[]}
 */
function _loadObservations(projectRoot) {
  try {
    return queryGlobal(projectRoot, {});
  } catch {
    return [];
  }
}

module.exports = { evaluateEntries };
