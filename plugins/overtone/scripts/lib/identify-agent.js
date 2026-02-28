'use strict';
/**
 * identify-agent.js — 從 Task 描述/prompt 中識別 Overtone agent
 *
 * 修復策略（決策 B + L2 補強）：
 *   - 第一輪（精確匹配 agent 全名）：只搜尋 desc，不搜尋 prmt
 *   - 第二輪（alias 模糊匹配）：只搜尋 desc，不搜尋 prmt
 *
 * 理由：desc 是人類可讀的短描述（如 "委派 tester agent"），
 * prmt 是完整指令，可能含其他 agent 全名（如 Won't 清單）、
 * 檔案路徑（如 tests/unit/foo.test.js）或指令（如 bun test），
 * 不應被精確匹配或 alias 誤判。
 *
 * 注意：pre-task.js 的 L1 層（subagent_type 直接映射）優先於此函式。
 * 此函式作為 fallback，只處理非 ot: 前綴的場景。
 */

const { stages } = require('./registry');

/**
 * 從 Task 描述中識別 Overtone agent
 * @param {string} desc - 小寫化的 toolInput.description
 * @param {string} _prmt - 保留參數（已棄用，兩輪均只搜 desc；保留簽名相容性）
 * @returns {string|null} agent 名稱，無法辨識時回傳 null
 */
function identifyAgent(desc, _prmt) {
  const agentNames = Object.values(stages).map((d) => d.agent);

  // 第一輪：精確匹配 agent 全名（只搜尋 desc，不搜尋 prmt）
  // prmt 可能含其他 agent 全名（Won't 清單）導致誤判，故排除
  const descPadded = ` ${desc} `;
  for (const name of agentNames) {
    const pattern = new RegExp(`\\b${name.replace(/-/g, '[-\\s]')}\\b`, 'i');
    if (pattern.test(descPadded)) return name;
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

  for (const [pattern, agent] of Object.entries(aliases)) {
    const regex = new RegExp(`\\b${pattern}\\b`, 'i');
    if (regex.test(descPadded)) return agent;
  }

  return null;
}

module.exports = identifyAgent;
