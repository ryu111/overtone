'use strict';
/**
 * knowledge-searcher.js — 三源知識搜尋與提取
 *
 * 提供兩個函式：
 *   searchKnowledge  — 從三個 source 搜尋相關知識片段
 *   extractKnowledge — 從 agent 輸出（Handoff 格式）提取知識片段
 *
 * 三個 source：
 *   skill-ref  — 已有的 skill references（SKILL.md 的 reference 檔案）
 *   instinct   — session 中的 instinct observations
 *   codebase   — scripts/lib/ 下的模組（檔名 + 首行 JSDoc）
 */

const { readdirSync, readFileSync, existsSync, statSync } = require('fs');
const path = require('path');

/**
 * 三源知識搜尋。
 *
 * 每個 source 用獨立的 try/catch 包裹，單一 source 失敗不影響其他。
 *
 * @param {string} query - 搜尋關鍵詞
 * @param {object} [options]
 * @param {string[]} [options.sources] - 要搜尋的 source 清單，預設全部
 * @param {string} [options.pluginRoot] - plugin 根目錄
 * @param {string} [options.sessionId] - session ID（供 instinct 搜尋使用）
 * @param {string} [options.sessionsDir] - sessions 目錄（測試用，覆蓋預設路徑）
 * @param {number} [options.maxCharsPerResult=500] - 每個結果的最大字元數
 * @returns {Array<{source: string, content: string, path?: string, domain?: string, relevance: number}>}
 */
function searchKnowledge(query, options = {}) {
  if (!query || typeof query !== 'string') return [];

  const sources = options.sources || ['skill-ref', 'instinct', 'codebase'];
  const maxCharsPerResult = options.maxCharsPerResult || 500;
  const lowerQuery = query.toLowerCase();

  const results = [];

  // ── Source 1: Skill references ──
  if (sources.includes('skill-ref') && options.pluginRoot) {
    try {
      const skillsDir = path.join(options.pluginRoot, 'skills');
      if (existsSync(skillsDir)) {
        const domains = readdirSync(skillsDir, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name);

        for (const domain of domains) {
          const refsDir = path.join(skillsDir, domain, 'references');
          if (!existsSync(refsDir)) continue;

          const refFiles = readdirSync(refsDir, { withFileTypes: true })
            .filter(f => f.isFile() && f.name.endsWith('.md'))
            .map(f => f.name);

          for (const fileName of refFiles) {
            const filePath = path.join(refsDir, fileName);
            try {
              const content = readFileSync(filePath, 'utf8');
              // 相關性：檢查檔名和前 200 chars 是否含查詢詞
              const nameMatch = fileName.toLowerCase().includes(lowerQuery.split(' ')[0]);
              const contentPreview = content.slice(0, 200).toLowerCase();
              const queryWords = lowerQuery.split(/\s+/).filter(Boolean);
              const contentMatchCount = queryWords.filter(w => contentPreview.includes(w)).length;

              if (!nameMatch && contentMatchCount === 0) continue;

              const relevance = nameMatch
                ? 0.8
                : Math.min(contentMatchCount / queryWords.length, 1.0) * 0.6;

              results.push({
                source: 'skill-ref',
                domain,
                content: content.slice(0, maxCharsPerResult),
                path: filePath,
                relevance,
              });
            } catch { /* 靜默跳過不可讀的檔案 */ }
          }
        }
      }
    } catch { /* skill-ref source 失敗不影響其他 source */ }
  }

  // ── Source 2: Instinct observations ──
  if (sources.includes('instinct') && options.sessionId) {
    try {
      const instinct = require('./instinct');
      // 只搜尋 confidence >= 0.5 的高信心觀察
      const observations = instinct.query(options.sessionId, { minConfidence: 0.5 });

      for (const obs of observations) {
        const tagMatch = obs.tag && obs.tag.toLowerCase().includes(lowerQuery.split(' ')[0]);
        const triggerMatch = obs.trigger && obs.trigger.toLowerCase().includes(lowerQuery.split(' ')[0]);
        const actionMatch = obs.action && obs.action.toLowerCase().includes(lowerQuery.split(' ')[0]);

        if (!tagMatch && !triggerMatch && !actionMatch) continue;

        const relevance = Math.min(obs.confidence, 1.0);
        results.push({
          source: 'instinct',
          content: `[${obs.tag}] ${obs.trigger} → ${obs.action}`.slice(0, maxCharsPerResult),
          relevance,
        });
      }
    } catch { /* instinct source 失敗不影響其他 source */ }
  }

  // ── Source 3: Codebase patterns ──
  if (sources.includes('codebase') && options.pluginRoot) {
    try {
      const libDir = path.join(options.pluginRoot, 'scripts', 'lib');
      if (existsSync(libDir)) {
        const jsFiles = readdirSync(libDir, { withFileTypes: true })
          .filter(f => f.isFile() && f.name.endsWith('.js'))
          .map(f => f.name);

        for (const fileName of jsFiles) {
          const filePath = path.join(libDir, fileName);
          const moduleName = fileName.replace('.js', '');

          // 以模組名和查詢詞做相關性判斷
          const queryWords = lowerQuery.split(/\s+/).filter(Boolean);
          const nameMatchCount = queryWords.filter(w => moduleName.toLowerCase().includes(w)).length;
          if (nameMatchCount === 0) continue;

          try {
            // 讀取前 300 chars（模組說明 JSDoc）
            const content = readFileSync(filePath, 'utf8').slice(0, 300);
            const relevance = Math.min(nameMatchCount / queryWords.length, 1.0) * 0.7;

            results.push({
              source: 'codebase',
              content: content.slice(0, maxCharsPerResult),
              path: filePath,
              relevance,
            });
          } catch { /* 靜默跳過 */ }
        }
      }
    } catch { /* codebase source 失敗不影響其他 source */ }
  }

  // 依 relevance 降序排列
  results.sort((a, b) => b.relevance - a.relevance);
  return results;
}

/**
 * 從 agent 輸出（Handoff 格式）提取知識片段。
 *
 * 支援提取的區塊：
 *   ### Findings — 發現和決策記錄
 *   ### Context  — 背景和前提條件
 *
 * @param {string} agentOutput - agent 的完整輸出（建議截斷至 3000 chars 再傳入）
 * @param {object} context - { agentName: string, stageName?: string }
 * @returns {Array<{type: string, content: string, source: string, keywords: string[]}>}
 */
function extractKnowledge(agentOutput, context = {}) {
  if (!agentOutput || typeof agentOutput !== 'string') return [];

  const { agentName = 'unknown', stageName = '' } = context;
  const sourcePrefix = stageName ? `${agentName}:${stageName}` : agentName;

  const fragments = [];

  // 提取 ### Findings 區塊
  const findingsMatch = agentOutput.match(/###\s+Findings\s*\n([\s\S]*?)(?=\n###|\n##[^#]|$)/i);
  if (findingsMatch) {
    const content = findingsMatch[1].trim();
    if (content) {
      const keywords = _extractKeywords(content);
      fragments.push({
        type: 'findings',
        content,
        source: `${sourcePrefix} Findings`,
        keywords,
      });
    }
  }

  // 提取 ### Context 區塊
  const contextMatch = agentOutput.match(/###\s+Context\s*\n([\s\S]*?)(?=\n###|\n##[^#]|$)/i);
  if (contextMatch) {
    const content = contextMatch[1].trim();
    if (content) {
      const keywords = _extractKeywords(content);
      fragments.push({
        type: 'context',
        content,
        source: `${sourcePrefix} Context`,
        keywords,
      });
    }
  }

  return fragments;
}

/**
 * 從文字中提取關鍵詞（簡單的詞彙提取）。
 * @param {string} text
 * @returns {string[]}
 * @private
 */
function _extractKeywords(text) {
  // 提取長度 >= 4 的英文單詞，去重，取前 10 個
  const words = text.match(/\b[a-zA-Z]{4,}\b/g) || [];
  const unique = [...new Set(words.map(w => w.toLowerCase()))];
  // 過濾常見停用詞
  const stopWords = new Set(['this', 'that', 'with', 'from', 'have', 'will', 'been', 'were', 'they', 'them', 'when', 'then', 'also', 'into', 'more', 'each', 'what', 'which', 'able', 'just']);
  return unique.filter(w => !stopWords.has(w)).slice(0, 10);
}

module.exports = { searchKnowledge, extractKnowledge };
