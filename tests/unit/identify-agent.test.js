'use strict';
const { test, expect, describe } = require('bun:test');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');

// 從獨立模組 require（Single Source of Truth）
const identifyAgent = require(join(SCRIPTS_LIB, 'identify-agent'));

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

// ── BDD F1 回歸測試：.test.js 誤匹配防護 ──

describe('identifyAgent — .test.js 誤匹配防護（BDD F1）', () => {
  test('prompt 含測試檔案路徑時不誤判為 tester（alias 不匹配 prmt）', () => {
    // BDD F1 Scenario 1：desc 為空，prmt 含 .test.js 路徑
    expect(identifyAgent('', 'run tests/unit/foo.test.js')).toBeNull();
  });

  test('prompt 含 bun test 指令時不誤判為 tester', () => {
    // BDD F1 Scenario 2：desc 為空，prmt 含 bun test 指令
    expect(identifyAgent('', 'bun test src/')).toBeNull();
  });

  test('desc 含 tester 且 prompt 含測試路徑時仍正確匹配 tester', () => {
    // BDD F1 Scenario 3：desc 有 tester，prmt 含 .test.js（不影響結果）
    expect(identifyAgent('delegate tester', 'run tests/foo.test.js')).toBe('tester');
  });

  test('desc 含 testing 別名時匹配 tester', () => {
    // BDD F1 Scenario 4：desc 含 testing alias，prmt 為空
    expect(identifyAgent('run testing', '')).toBe('tester');
  });

  test('prompt 含完整 agent 名稱（精確匹配）時仍正確匹配', () => {
    // BDD F1 Scenario 5：精確名稱匹配 combined（desc + prmt），不受 alias 限制影響
    expect(identifyAgent('', 'delegate code-reviewer')).toBe('code-reviewer');
  });
});
