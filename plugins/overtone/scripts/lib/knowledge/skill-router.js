'use strict';
/**
 * skill-router.js — 知識路由與寫入
 *
 * 負責將從 agent 輸出提取的知識片段路由到正確的 domain，
 * 並寫入對應的 auto-discovered.md 檔案。
 *
 * 導出：
 *   routeKnowledge  — 判斷知識片段應路由到哪個 domain
 *   writeKnowledge  — 執行寫入（append 或 gap-observation）
 */

const { readFileSync, existsSync } = require('fs');
const path = require('path');
const { atomicWrite } = require('../utils');
const { DOMAIN_KEYWORDS } = require('./knowledge-gap-detector');

// auto-discovered.md 的大小上限（5KB）
const MAX_FILE_SIZE = 5 * 1024;

// 超過上限時保留的最新條目數
const MAX_ENTRIES_KEEP = 50;

/**
 * 預計算跨 domain 出現的歧義詞集合。
 * 出現在 2+ 個 domain 的關鍵詞命中時只給 0.5 倍權重，降低噪音。
 * @returns {Set<string>}
 */
function _buildAmbiguousKeywords() {
  const kwCount = new Map();
  for (const keywords of Object.values(DOMAIN_KEYWORDS)) {
    for (const kw of keywords) {
      const lower = kw.toLowerCase();
      kwCount.set(lower, (kwCount.get(lower) || 0) + 1);
    }
  }
  const result = new Set();
  for (const [kw, count] of kwCount) {
    if (count >= 2) result.add(kw);
  }
  return result;
}

// 模組級快取，避免每次呼叫重複計算
const AMBIGUOUS_KEYWORDS = _buildAmbiguousKeywords();

// 信心差距保護：前兩名分數差距小於此值時視為歧義，降級為 gap-observation
const MIN_CONFIDENCE_GAP = 0.05;

/**
 * 路由知識片段到正確的 domain。
 *
 * 演算法（v2 — 提升精準度）：
 *   1. 對 fragment.keywords（強信號）與 fragment.content（弱信號）計算每個 domain 的命中分數
 *   2. fragment.keywords 精確命中 domain 詞時給 ×2 加成；歧義詞（跨 domain）只給 0.5 倍
 *   3. content 命中給 0.5 倍基礎權重；歧義詞再折半為 0.25 倍
 *   4. 分數對 domain keywords 總數正規化
 *   5. bestScore >= 0.2 且 totalHits >= 2 → 進入候選
 *   6. 前兩名分差 < 0.05 → 歧義太高，降級為 gap-observation
 *   7. 通過以上條件 → action: 'append'
 *
 * @param {object} fragment - { type, content, source, keywords }
 * @param {object} [options]
 * @param {string} [options.pluginRoot] - plugin 根目錄（用於計算 targetPath）
 * @returns {{ action: 'append'|'gap-observation', domain?: string, targetPath?: string, score?: number, observation?: string }}
 */
function routeKnowledge(fragment, options = {}) {
  if (!fragment || typeof fragment.content !== 'string') {
    return { action: 'gap-observation', observation: '（無效的知識片段）' };
  }

  const fragmentKeywords = Array.isArray(fragment.keywords) ? fragment.keywords : [];
  const lowerContent = fragment.content.toLowerCase();
  const minScore = 0.2;
  const minTotalHits = 2;

  // 結果陣列（含前兩名用於信心差距檢查）
  const scores = [];

  for (const [domain, domainKeywords] of Object.entries(DOMAIN_KEYWORDS)) {
    let weightedScore = 0;
    let totalHits = 0;

    // fragment.keywords 強信號：精確命中給 ×2，歧義詞折半為 ×1
    for (const kw of fragmentKeywords) {
      const lowerKw = kw.toLowerCase();
      const hit = domainKeywords.some(dk => {
        const lowerDk = dk.toLowerCase();
        return lowerDk.includes(lowerKw) || lowerKw.includes(lowerDk);
      });
      if (hit) {
        const ambiguityFactor = AMBIGUOUS_KEYWORDS.has(lowerKw) ? 0.5 : 1.0;
        weightedScore += 2.0 * ambiguityFactor;
        totalHits++;
      }
    }

    // fragment.content 弱信號：命中給 0.5，歧義詞再折半為 0.25
    for (const dk of domainKeywords) {
      const lowerDk = dk.toLowerCase();
      if (lowerContent.includes(lowerDk)) {
        const ambiguityFactor = AMBIGUOUS_KEYWORDS.has(lowerDk) ? 0.5 : 1.0;
        weightedScore += 0.5 * ambiguityFactor;
        totalHits++;
      }
    }

    // 正規化：除以 domain keywords 總數
    const score = weightedScore / domainKeywords.length;

    if (score > 0) {
      scores.push({ domain, score, totalHits });
    }
  }

  // 依分數降序排列
  scores.sort((a, b) => b.score - a.score);

  const best = scores[0];
  const second = scores[1];

  // 條件 1：分數門檻 + 最小命中數
  if (!best || best.score < minScore || best.totalHits < minTotalHits) {
    const observation = `未分類知識片段 from ${fragment.source || 'unknown'}. Keywords: ${fragmentKeywords.join(', ') || '(無)'}`;
    return { action: 'gap-observation', observation };
  }

  // 條件 2：信心差距保護（前兩名分差過小 → 歧義，降級）
  if (second && (best.score - second.score) < MIN_CONFIDENCE_GAP) {
    const observation = `知識片段路由歧義（${best.domain} vs ${second.domain}，分差 ${(best.score - second.score).toFixed(3)}）from ${fragment.source || 'unknown'}`;
    return { action: 'gap-observation', observation };
  }

  const targetPath = options.pluginRoot
    ? path.join(options.pluginRoot, 'skills', best.domain, 'references', 'auto-discovered.md')
    : null;

  return {
    action: 'append',
    domain: best.domain,
    targetPath,
    score: best.score,
  };
}

/**
 * 執行知識寫入。
 *
 * - action='append': 追加到 auto-discovered.md，超過 5KB 時修剪舊條目
 * - action='gap-observation': 用 instinct.emit 記錄，不寫入檔案
 *
 * @param {object} routeResult - routeKnowledge 的回傳
 * @param {object} fragment - 知識片段 { content, source, keywords }
 * @param {string} pluginRoot - plugin 根目錄
 * @param {string} [sessionId] - 用於 gap-observation 的 instinct 記錄
 */
function writeKnowledge(routeResult, fragment, pluginRoot, sessionId) {
  if (!routeResult) return;

  if (routeResult.action === 'append') {
    _appendToAutoDiscovered(routeResult, fragment);
  } else if (routeResult.action === 'gap-observation' && sessionId) {
    // gap-observation → 用 instinct 記錄（不寫入 skills/ 目錄）
    try {
      const instinct = require('./instinct');
      instinct.emit(
        sessionId,
        'knowledge_gap',
        routeResult.observation || '未分類知識',
        `來自 ${fragment.source || 'unknown'} 的知識無法路由到已知 domain`,
        'knowledge-gap'
      );
    } catch { /* 靜默降級 */ }
  }
  // gap-observation 且無 sessionId → 靜默跳過（不寫入任何 skills/ 目錄下的檔案）
}

/**
 * 追加知識條目到 auto-discovered.md。
 * @private
 */
function _appendToAutoDiscovered(routeResult, fragment) {
  const { targetPath } = routeResult;
  if (!targetPath) return;

  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const source = fragment.source || 'unknown';
  const keywords = Array.isArray(fragment.keywords) ? fragment.keywords.join(', ') : '';
  const contentTrimmed = fragment.content.trim();

  // 讀取現有內容
  let existingContent = '';
  if (existsSync(targetPath)) {
    existingContent = readFileSync(targetPath, 'utf8');
  }

  // 去重：若現有內容已包含相同 content 本體，跳過不寫入
  if (existingContent.includes(contentTrimmed)) return;

  const newEntry = [
    `---`,
    `## ${date} | ${source}`,
    contentTrimmed,
    keywords ? `Keywords: ${keywords}` : null,
  ].filter(Boolean).join('\n') + '\n';

  let newContent = existingContent + newEntry;

  // 超過 5KB 時修剪：只保留最新的 MAX_ENTRIES_KEEP 筆
  if (newContent.length > MAX_FILE_SIZE) {
    newContent = _pruneEntries(newContent, MAX_ENTRIES_KEEP);
  }

  atomicWrite(targetPath, newContent);
}

/**
 * 修剪條目，只保留最新的 N 筆。
 * 條目以 `---` 分隔。
 * @param {string} content
 * @param {number} keepCount
 * @returns {string}
 * @private
 */
function _pruneEntries(content, keepCount) {
  // 以 `---` 行分割條目
  const parts = content.split(/\n(?=---\n)/);
  // 去掉空白部分
  const entries = parts.filter(p => p.trim());
  // 取最新的 keepCount 筆
  const kept = entries.slice(-keepCount);
  return kept.join('\n') + '\n';
}

module.exports = { routeKnowledge, writeKnowledge };
