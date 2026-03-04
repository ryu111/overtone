'use strict';
/**
 * knowledge-gap-detector.js — 知識缺口偵測器
 *
 * 分析 prompt 中出現的關鍵詞，偵測 agent 尚未具備的知識 domain，
 * 提供 gap 建議讓 pre-task hook 注入警告訊息。
 *
 * 導出：
 *   DOMAIN_KEYWORDS — 12 個 domain 的關鍵詞靜態表
 *   detectKnowledgeGaps — 主要偵測函式
 */

/**
 * 12 個 knowledge domain 的關鍵詞靜態表。
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
    'hook-development', 'agent-development',
  ],
};

/**
 * 偵測 prompt 中出現但 agent 尚未具備的知識 domain。
 *
 * 演算法：
 *   1. 將 prompt 轉為小寫
 *   2. 對每個 domain，計算命中的關鍵詞數量
 *   3. score = 命中數 / 總關鍵詞數（正規化到 0~1）
 *   4. 排除 agent 已有的 skills
 *   5. score >= minScore 才回報
 *   6. 依 score 降序排列，取前 maxGaps 個
 *
 * @param {string} prompt - 使用者/任務 prompt
 * @param {string[]} agentSkills - agent 已有的 skills 列表
 * @param {object} [options]
 * @param {number} [options.minScore=0.2] - 最低分數門檻（0~1）
 * @param {number} [options.maxGaps=3] - 最多回報幾個缺口
 * @returns {Array<{domain: string, score: number, matchedKeywords: string[]}>} 依 score 降序排列的缺口
 */
function detectKnowledgeGaps(prompt, agentSkills, options = {}) {
  // 防禦：空 prompt 直接回傳空陣列
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return [];
  }

  const minScore = options.minScore !== undefined ? options.minScore : 0.2;
  const maxGaps = options.maxGaps !== undefined ? options.maxGaps : 3;

  // 安全處理 agentSkills（undefined / null → 空陣列）
  const existingSkills = Array.isArray(agentSkills) ? agentSkills : [];

  const lowerPrompt = prompt.toLowerCase();
  const gaps = [];

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    // 已有此 skill → 跳過
    if (existingSkills.includes(domain)) continue;

    // 計算命中的關鍵詞
    const matchedKeywords = keywords.filter(kw => lowerPrompt.includes(kw.toLowerCase()));
    const score = matchedKeywords.length / keywords.length;

    if (score >= minScore) {
      gaps.push({ domain, score, matchedKeywords });
    }
  }

  // 依 score 降序排列，取前 maxGaps 個
  gaps.sort((a, b) => b.score - a.score);
  return gaps.slice(0, maxGaps);
}

module.exports = { DOMAIN_KEYWORDS, detectKnowledgeGaps };
