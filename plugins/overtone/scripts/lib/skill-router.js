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
const { atomicWrite } = require('./utils');
const { DOMAIN_KEYWORDS } = require('./knowledge-gap-detector');

// auto-discovered.md 的大小上限（5KB）
const MAX_FILE_SIZE = 5 * 1024;

// 超過上限時保留的最新條目數
const MAX_ENTRIES_KEEP = 50;

/**
 * 路由知識片段到正確的 domain。
 *
 * 演算法：
 *   1. 對 fragment.keywords 與 fragment.content 計算每個 domain 的命中分數
 *   2. score = (keywords 命中數 + content 命中詞數 / 2) / domain 總關鍵詞數
 *   3. score >= 0.2 → action: 'append'，選分數最高的 domain
 *   4. score < 0.2  → action: 'gap-observation'
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

  let bestDomain = null;
  let bestScore = 0;

  for (const [domain, domainKeywords] of Object.entries(DOMAIN_KEYWORDS)) {
    // 計算 fragment.keywords 中命中此 domain 的關鍵詞
    const keywordHits = fragmentKeywords.filter(kw =>
      domainKeywords.some(dk => dk.toLowerCase().includes(kw.toLowerCase()) || kw.toLowerCase().includes(dk.toLowerCase()))
    ).length;

    // 計算 fragment.content 中命中此 domain 的關鍵詞
    const contentHits = domainKeywords.filter(dk =>
      lowerContent.includes(dk.toLowerCase())
    ).length;

    // 綜合分數：keywords 命中 + content 命中（降半權重）
    const score = (keywordHits + contentHits * 0.5) / domainKeywords.length;

    if (score > bestScore) {
      bestScore = score;
      bestDomain = domain;
    }
  }

  if (bestScore >= minScore && bestDomain) {
    const targetPath = options.pluginRoot
      ? path.join(options.pluginRoot, 'skills', bestDomain, 'references', 'auto-discovered.md')
      : null;

    return {
      action: 'append',
      domain: bestDomain,
      targetPath,
      score: bestScore,
    };
  }

  // 未匹配任何 domain → gap-observation
  const observation = `未分類知識片段 from ${fragment.source || 'unknown'}. Keywords: ${fragmentKeywords.join(', ') || '(無)'}`;
  return { action: 'gap-observation', observation };
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
        'dead_code', // 複用現有 type，表示「未分類知識」
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

  const newEntry = [
    `---`,
    `## ${date} | ${source}`,
    fragment.content.trim(),
    keywords ? `Keywords: ${keywords}` : null,
  ].filter(Boolean).join('\n') + '\n';

  // 讀取現有內容
  let existingContent = '';
  if (existsSync(targetPath)) {
    existingContent = readFileSync(targetPath, 'utf8');
  }

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
