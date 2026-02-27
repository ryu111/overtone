'use strict';
/**
 * identify-agent.js — 從 Task 描述/prompt 中識別 Overtone agent
 *
 * 修復策略（決策 B）：
 *   - 第一輪（精確匹配 agent 全名）：搜尋 combined（desc + prmt）
 *   - 第二輪（alias 模糊匹配）：只搜尋 desc，不搜尋 prmt
 *
 * 理由：desc 是人類可讀的短描述（如 "委派 tester agent"），
 * prmt 是完整指令，可能含檔案路徑（如 tests/unit/foo.test.js）
 * 或指令（如 bun test），不應被 alias 誤判。
 */

const { stages } = require('./registry');

/**
 * 從 Task 描述/prompt 中識別 Overtone agent
 * @param {string} desc - 小寫化的 toolInput.description
 * @param {string} prmt - 小寫化的 toolInput.prompt
 * @returns {string|null} agent 名稱，無法辨識時回傳 null
 */
function identifyAgent(desc, prmt) {
  const combined = ` ${desc} ${prmt} `;
  const agentNames = Object.values(stages).map((d) => d.agent);

  // 第一輪：精確匹配 agent 全名（搜尋 combined = desc + prmt）
  for (const name of agentNames) {
    const pattern = new RegExp(`\\b${name.replace(/-/g, '[-\\s]')}\\b`, 'i');
    if (pattern.test(combined)) return name;
  }

  // 第二輪：alias 模糊匹配（只搜尋 desc，不搜尋 prmt）
  // 避免 prmt 中的路徑（tests/foo.test.js）或指令（bun test）誤觸發
  const aliases = {
    'review(?:er)?': 'code-reviewer',
    'test(?:er|ing)?': 'tester',
    'debug(?:ger|ging)?': 'debugger',
    'plan(?:ner|ning)?': 'planner',
    'architect(?:ure)?': 'architect',
    'design(?:er)?': 'designer',
    'develop(?:er|ment)?': 'developer',
    'security': 'security-reviewer',
    'database|db.?review': 'database-reviewer',
    'e2e': 'e2e-runner',
    'build.?(?:fix|error|resolve)': 'build-error-resolver',
    'refactor|clean.?(?:up|code)': 'refactor-cleaner',
    'doc(?:s|umentation)?\\s*(?:updat|sync)': 'doc-updater',
    '\\bqa\\b': 'qa',
  };

  const descWithPad = ` ${desc} `;
  for (const [pattern, agent] of Object.entries(aliases)) {
    const regex = new RegExp(`\\b${pattern}\\b`, 'i');
    if (regex.test(descWithPad)) return agent;
  }

  return null;
}

module.exports = identifyAgent;
