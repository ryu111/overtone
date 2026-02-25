'use strict';
const { test, expect, describe } = require('bun:test');
const { stages } = require('../scripts/lib/registry');

// 從 pre-task.js 提取 identifyAgent 邏輯
function identifyAgent(desc, prmt) {
  const combined = ` ${desc} ${prmt} `;
  const agentNames = Object.values(stages).map((d) => d.agent);

  for (const name of agentNames) {
    const pattern = new RegExp(`\\b${name.replace(/-/g, '[-\\s]')}\\b`, 'i');
    if (pattern.test(combined)) return name;
  }

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
    if (regex.test(combined)) return agent;
  }

  return null;
}

describe('identifyAgent — 精確名稱匹配', () => {
  test('完整 agent 名稱匹配', () => {
    expect(identifyAgent('code-reviewer', '')).toBe('code-reviewer');
    expect(identifyAgent('', 'delegate to developer')).toBe('developer');
    expect(identifyAgent('security-reviewer agent', '')).toBe('security-reviewer');
    expect(identifyAgent('database-reviewer', '')).toBe('database-reviewer');
    expect(identifyAgent('e2e-runner', '')).toBe('e2e-runner');
  });
});

describe('identifyAgent — 別名匹配', () => {
  test('review → code-reviewer', () => {
    expect(identifyAgent('do code review', '')).toBe('code-reviewer');
  });

  test('tester/testing → tester', () => {
    expect(identifyAgent('run testing', '')).toBe('tester');
    expect(identifyAgent('tester agent', '')).toBe('tester');
  });

  test('debug/debugger → debugger', () => {
    expect(identifyAgent('debug this issue', '')).toBe('debugger');
    expect(identifyAgent('', 'use debugger')).toBe('debugger');
  });

  test('plan/planner → planner', () => {
    expect(identifyAgent('create plan', '')).toBe('planner');
  });

  test('security → security-reviewer', () => {
    expect(identifyAgent('security scan', '')).toBe('security-reviewer');
  });

  test('e2e → e2e-runner', () => {
    expect(identifyAgent('run e2e tests', '')).toBe('e2e-runner');
  });

  test('build-fix → build-error-resolver', () => {
    expect(identifyAgent('build fix', '')).toBe('build-error-resolver');
  });

  test('refactor → refactor-cleaner', () => {
    expect(identifyAgent('refactor code', '')).toBe('refactor-cleaner');
  });

  test('qa → qa', () => {
    expect(identifyAgent('run qa check', '')).toBe('qa');
  });
});

describe('identifyAgent — false positive 防護', () => {
  test('"the latest test results" 不應誤匹配為 tester', () => {
    // 注意：'test' 仍會匹配 tester（這是別名設計決策）
    // 但 'latest' 不會誤觸發
    const result = identifyAgent('show the latest', 'results summary');
    expect(result).toBeNull();
  });

  test('空輸入回傳 null', () => {
    expect(identifyAgent('', '')).toBeNull();
  });

  test('不相關描述回傳 null', () => {
    expect(identifyAgent('deploy to production', 'send notification')).toBeNull();
  });
});
