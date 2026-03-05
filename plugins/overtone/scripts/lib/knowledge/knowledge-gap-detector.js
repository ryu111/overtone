'use strict';
/**
 * knowledge-gap-detector.js — 知識缺口偵測器
 *
 * 分析 prompt 中出現的關鍵詞，偵測 agent 尚未具備的知識 domain，
 * 提供 gap 建議讓 pre-task hook 注入警告訊息。
 *
 * 導出：
 *   DOMAIN_KEYWORDS — 15/15 knowledge domain 的關鍵詞靜態表（os-control、autonomous-control、craft 已補齊）
 *   detectKnowledgeGaps — 主要偵測函式
 *   shouldAutoForge — 判斷哪些 gaps 需要自動 forge
 *   autoForge — 對篩選出的 gaps 自動執行 forge
 */

const path = require('path');
const fs = require('fs');

/**
 * 15 個 knowledge domain 的關鍵詞靜態表。
 * 每個 domain 約 10-15 個關鍵詞，涵蓋該領域的核心概念。
 */
const DOMAIN_KEYWORDS = {
  'testing': [
    'test', 'spec', 'coverage', 'mock', 'stub', 'assert', 'expect',
    'bun:test', 'describe', 'it(', 'beforeEach', 'afterEach', 'jest',
    'unit test', 'integration test', 'e2e',
  ],
  'security-kb': [
    'security', 'vulnerability', 'xss', 'injection', 'csrf', 'auth',
    'authentication', 'authorization', 'encrypt', 'hash', 'sanitize',
    'owasp', 'exploit', 'attack', 'token',
  ],
  'commit-convention': [
    'commit', 'conventional commit', 'feat:', 'fix:', 'chore:', 'refactor:',
    'changelog', 'semver', 'version bump', 'git message',
    'breaking change', 'atomic commit', 'squash',
  ],
  'wording': [
    'wording', 'emoji', 'tone', 'phrasing', 'message text', 'ui text',
    'label', 'placeholder', 'error message', 'copy', 'localization',
    'i18n', 'l10n', 'translation',
  ],
  'code-review': [
    'review', 'code review', 'refactor', 'smell', 'lint', 'style guide',
    'best practice', 'maintainability', 'readability', 'complexity',
    'dry', 'solid', 'coupling', 'cohesion',
  ],
  'database': [
    'database', 'sql', 'query', 'schema', 'migration', 'index',
    'transaction', 'orm', 'nosql', 'mongodb', 'postgres', 'mysql',
    'join', 'foreign key', 'normalization',
  ],
  'dead-code': [
    'dead code', 'unused', 'orphan', 'unreachable', 'deprecated',
    'remove', 'cleanup', 'prune', 'tree-shaking', 'bundle size',
    'unused export', 'unused import',
  ],
  'workflow-core': [
    'workflow', 'pipeline', 'stage', 'agent', 'handoff', 'bdd',
    'overtone', 'hook', 'skill', 'command', 'subagent', 'session',
    'instinct', 'timeline', 'state',
  ],
  'debugging': [
    'debug', 'debugger', 'breakpoint', 'stack trace', 'exception',
    'crash', 'bug', 'root cause', 'memory leak', 'core dump',
    'reproduce', 'diagnosis',
  ],
  'architecture': [
    'architecture', 'system design', 'design pattern', 'adr',
    'scalability', 'microservice', 'monolith', 'api design',
    'distributed', 'event-driven', 'layered', 'tradeoff',
    'module boundary',
  ],
  'build-system': [
    'typescript', 'tsc', 'compile error', 'build error', 'bundle',
    'webpack', 'vite', 'dependency conflict', 'package.json',
    'tsconfig', 'type error', 'strict mode',
  ],
  'claude-dev': [
    'hooks.json', 'hook event', 'pretooluse', 'posttooluse',
    'subagent stop', 'sessionstart', 'userpromptsubmit',
    'updatedinput', 'hook script', 'agent frontmatter', 'agent.md',
    'bypasspermissions', 'plugin hook', 'claude code plugin',
    'manage-component',
  ],
  'os-control': [
    'process', 'clipboard', 'screenshot', 'window', 'notification',
    'system-info', 'fswatch', 'keyboard', 'mouse', 'applescript',
    'screencapture', '截圖', '視窗', '剪貼簿', '通知',
  ],
  'autonomous-control': [
    'heartbeat', 'daemon', 'spawn', 'queue', 'execution-queue',
    'headless', 'autonomous', '自主', '常駐', '佇列',
    '排程', 'cron', 'background', 'polling', 'scheduled',
  ],
  'craft': [
    'principle', 'convention', 'invariant', 'guard', 'closed-loop',
    'recovery', 'completion-gap', 'health-check', 'validate',
    'clean code', 'solid', 'refactor', 'design pattern', 'dry principle',
    'srp', 'function composition', 'immutable', 'pure function', 'code smell',
    '製作規範', '閉環', '守衛', '自癒', '不變量', '品質',
  ],
};

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

/**
 * 偵測 prompt 中出現但 agent 尚未具備的知識 domain。
 *
 * 演算法（v2 — 歧義詞減重）：
 *   1. 將 prompt 轉為小寫
 *   2. 對每個 domain，計算命中的關鍵詞，歧義詞（跨 2+ domain）只給 0.5 倍 score 貢獻
 *   3. score = 加權命中分 / 總關鍵詞數（正規化到 0~1）
 *   4. 排除 agent 已有的 skills
 *   5. score >= minScore 且非歧義詞命中數 >= minTotalHits 才回報
 *   6. 依 score 降序排列，取前 maxGaps 個
 *
 * @param {string} prompt - 使用者/任務 prompt
 * @param {string[]} agentSkills - agent 已有的 skills 列表
 * @param {object} [options]
 * @param {number} [options.minScore=0.2] - 最低分數門檻（0~1）
 * @param {number} [options.maxGaps=3] - 最多回報幾個缺口
 * @param {number} [options.minTotalHits=2] - 至少需要幾個非歧義詞命中才算有效 gap
 * @returns {Array<{domain: string, score: number, matchedKeywords: string[]}>} 依 score 降序排列的缺口
 */
function detectKnowledgeGaps(prompt, agentSkills, options = {}) {
  // 防禦：空 prompt 直接回傳空陣列
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return [];
  }

  const minScore = options.minScore !== undefined ? options.minScore : 0.2;
  const maxGaps = options.maxGaps !== undefined ? options.maxGaps : 3;
  const minTotalHits = options.minTotalHits !== undefined ? options.minTotalHits : 2;

  // 安全處理 agentSkills（undefined / null → 空陣列）
  const existingSkills = Array.isArray(agentSkills) ? agentSkills : [];

  const lowerPrompt = prompt.toLowerCase();
  const gaps = [];

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    // 已有此 skill → 跳過
    if (existingSkills.includes(domain)) continue;

    // 計算命中的關鍵詞，歧義詞只給 0.5 倍貢獻
    const matchedKeywords = keywords.filter(kw => lowerPrompt.includes(kw.toLowerCase()));
    let weightedHits = 0;
    let nonAmbiguousHits = 0;
    for (const kw of matchedKeywords) {
      const isAmbiguous = AMBIGUOUS_KEYWORDS.has(kw.toLowerCase());
      weightedHits += isAmbiguous ? 0.5 : 1.0;
      if (!isAmbiguous) nonAmbiguousHits++;
    }
    const score = weightedHits / keywords.length;

    // 需同時滿足：分數門檻 + 非歧義詞命中數門檻
    if (score >= minScore && nonAmbiguousHits >= minTotalHits) {
      gaps.push({ domain, score, matchedKeywords });
    }
  }

  // 依 score 降序排列，取前 maxGaps 個
  gaps.sort((a, b) => b.score - a.score);
  return gaps.slice(0, maxGaps);
}

/**
 * 判斷哪些 gaps 需要自動 forge。
 *
 * 篩選條件：
 *   1. score < minForgeScore（預設 0.2）
 *   2. 尚未有 SKILL.md 存在（fs.existsSync 檢查）
 *
 * @param {Array<{domain: string, score: number, matchedKeywords: string[]}>} gaps - detectKnowledgeGaps 輸出
 * @param {object} [options]
 * @param {number} [options.minForgeScore=0.2] - 低於此分數才觸發 forge
 * @param {string} [options.pluginRoot] - plugin 根目錄（用於檢查 SKILL.md 是否存在）
 * @returns {{ domains: string[], reason: string }}
 */
function shouldAutoForge(gaps, options = {}) {
  if (!Array.isArray(gaps) || gaps.length === 0) {
    return { domains: [], reason: '無 gap 需要 forge' };
  }

  const minForgeScore = options.minForgeScore !== undefined ? options.minForgeScore : 0.2;
  const pluginRoot = options.pluginRoot || _resolveDefaultPluginRoot();

  const domains = [];

  for (const gap of gaps) {
    if (typeof gap.domain !== 'string') continue;
    if (gap.score >= minForgeScore) continue;

    // 檢查是否已有 SKILL.md
    const skillMdPath = path.join(pluginRoot, 'skills', gap.domain, 'SKILL.md');
    if (fs.existsSync(skillMdPath)) continue;

    domains.push(gap.domain);
  }

  const reason = domains.length > 0
    ? `${domains.length} 個 domain score < ${minForgeScore} 且無既有 SKILL.md`
    : `無 domain 低於 forge 門檻（minForgeScore=${minForgeScore}）`;

  return { domains, reason };
}

/**
 * 對篩選出的 gaps 自動執行 forge。
 *
 * @param {Array<{domain: string, score: number, matchedKeywords: string[]}>} gaps - detectKnowledgeGaps 輸出
 * @param {object} [options]
 * @param {boolean} [options.dryRun=true] - 預設 dry-run（安全優先）
 * @param {string} [options.pluginRoot] - plugin 根目錄覆寫
 * @param {number} [options.maxConsecutiveFailures] - 連續失敗暫停門檻
 * @param {number} [options.minForgeScore] - 低於此分數才觸發 forge
 * @returns {{ forged: object[], skipped: string[] }}
 */
function autoForge(gaps, options = {}) {
  const {
    dryRun = true,
    pluginRoot,
    maxConsecutiveFailures,
    minForgeScore,
  } = options;

  const { shouldForge } = _getAutoForgeResult(gaps, { pluginRoot, minForgeScore });

  if (shouldForge.domains.length === 0) {
    return { forged: [], skipped: [] };
  }

  const { forgeSkill } = require('../skill-forge');
  const forged = [];
  const skipped = [];

  let consecutiveFailures = 0;
  const maxFailures = maxConsecutiveFailures !== undefined ? maxConsecutiveFailures : 3;

  for (let i = 0; i < shouldForge.domains.length; i++) {
    const domain = shouldForge.domains[i];

    const result = forgeSkill(domain, {}, {
      dryRun,
      pluginRoot,
      maxConsecutiveFailures: maxFailures,
      initialFailures: consecutiveFailures,
    });

    forged.push(result);

    if (result.status === 'error') {
      consecutiveFailures++;
    } else if (result.status === 'success') {
      consecutiveFailures = 0;
    } else if (result.status === 'paused') {
      // forge 內部已暫停，後續 domain 全部 skip
      const remaining = shouldForge.domains.slice(i + 1);
      skipped.push(...remaining);
      break;
    }
  }

  return { forged, skipped };
}

/**
 * 內部輔助：執行 shouldAutoForge 並回傳結構化結果
 * @param {Array} gaps
 * @param {object} options
 * @returns {{ shouldForge: { domains: string[], reason: string } }}
 */
function _getAutoForgeResult(gaps, options = {}) {
  const shouldForge = shouldAutoForge(gaps, options);
  return { shouldForge };
}

/**
 * 推算預設 plugin 根目錄路徑
 * knowledge-gap-detector.js 位於 scripts/lib/knowledge/，往上三層
 * @returns {string}
 */
function _resolveDefaultPluginRoot() {
  return path.resolve(__dirname, '..', '..', '..');
}

module.exports = { DOMAIN_KEYWORDS, detectKnowledgeGaps, shouldAutoForge, autoForge };
