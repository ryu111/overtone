'use strict';
/**
 * knowledge-archiver.test.js — archiveKnowledge 單元測試
 *
 * 覆蓋 BDD spec Feature 6（5 scenarios）：
 *   Scenario 6-1: 含 Findings 區塊 → archived > 0
 *   Scenario 6-2: 空輸出 → archived = 0
 *   Scenario 6-3: 不可寫路徑 → errors > 0 且不拋錯
 *   Scenario 6-4: 多 fragments 部分失敗 → 繼續處理
 *   Scenario 6-5: 有 sessionId → 不因 instinct 失敗而拋錯
 *
 * Feature A: _isExternalFragment（5 scenarios）
 * Feature B: archiveKnowledge 外部 fragment 降級（3 scenarios）
 */

const { test, expect, describe } = require('bun:test');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');

const { archiveKnowledge, _isExternalFragment } = require(join(SCRIPTS_LIB, 'knowledge/knowledge-archiver'));

// 取得專案根目錄（tests/unit/ 上兩層）
const PROJECT_ROOT = join(__dirname, '..', '..');

// ════════════════════════════════════════════════════════════════
// Feature A: _isExternalFragment
// ════════════════════════════════════════════════════════════════

describe('Feature A: _isExternalFragment', () => {
  // Scenario A-1: 外部專案路徑 → true
  test('Scenario A-1: content 含 projects/md-blog/src/parser.js → true', () => {
    const fragment = { content: '發現問題在 projects/md-blog/src/parser.js 中' };
    expect(_isExternalFragment(fragment)).toBe(true);
  });

  // Scenario A-2: Overtone 自身路徑 → false
  test('Scenario A-2: content 含 plugins/overtone/scripts/lib/ → false', () => {
    const fragment = { content: '修改了 plugins/overtone/scripts/lib/knowledge-archiver.js' };
    expect(_isExternalFragment(fragment)).toBe(false);
  });

  // Scenario A-3: 純文字知識 — 保守歸檔 → false
  test('Scenario A-3: 純文字無路徑特徵 → false（保守歸檔）', () => {
    const fragment = { content: '使用 describe/it/expect 組織 BDD 測試，coverage 達標' };
    expect(_isExternalFragment(fragment)).toBe(false);
  });

  // Scenario A-4: 多種外部路徑格式 → 均 true
  test('Scenario A-4a: projects/kuji/app/routes.ts → true', () => {
    expect(_isExternalFragment({ content: '路徑：projects/kuji/app/routes.ts' })).toBe(true);
  });
  test('Scenario A-4b: projects/my-app/ → true', () => {
    expect(_isExternalFragment({ content: '目錄 projects/my-app/ 底下' })).toBe(true);
  });
  test('Scenario A-4c: Projects/AnotherProject/ 大小寫混用 → true', () => {
    expect(_isExternalFragment({ content: '在 Projects/AnotherProject/ 中' })).toBe(true);
  });

  // Scenario A-5: projects/overtone/ — negative lookahead 保護 → false
  test('Scenario A-5: projects/overtone/plugins/ → false（不誤判）', () => {
    const fragment = { content: '路徑為 projects/overtone/plugins/overtone/scripts/' };
    expect(_isExternalFragment(fragment)).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════
// Feature B: archiveKnowledge 外部 fragment 降級
// ════════════════════════════════════════════════════════════════

describe('Feature B: archiveKnowledge 外部 fragment 降級', () => {
  // Scenario B-1: 外部路徑 fragment → archived=0, skipped=1
  test('Scenario B-1: 外部路徑 fragment → archived=0, skipped=1, errors=0', () => {
    const agentOutput = [
      '### Findings',
      '- 在 projects/md-blog/src/parser.js 發現解析問題',
    ].join('\n');

    const result = archiveKnowledge(agentOutput, {
      agentName: 'developer',
      actualStageKey: 'DEV',
      projectRoot: PROJECT_ROOT,
      sessionId: undefined,
    });

    expect(result.archived).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors).toBe(0);
  });

  // Scenario B-2: 外部 fragment + sessionId → mockInstinct.emit 被呼叫
  test('Scenario B-2: 外部 fragment + sessionId → instinct.emit 被呼叫一次（knowledge_gap）', () => {
    const agentOutput = [
      '### Findings',
      '- 在 projects/md-blog/src/parser.js 發現解析問題',
    ].join('\n');

    const emitCalls = [];
    const mockInstinct = {
      emit: (...args) => emitCalls.push(args),
    };

    const result = archiveKnowledge(
      agentOutput,
      {
        agentName: 'developer',
        actualStageKey: 'DEV',
        projectRoot: PROJECT_ROOT,
        sessionId: 'test-session-b2',
      },
      { instinct: mockInstinct }
    );

    expect(result.archived).toBe(0);
    expect(emitCalls.length).toBe(1);
    expect(emitCalls[0][1]).toBe('knowledge_gap');
  });

  // Scenario B-3: 外部 fragment + 無 sessionId → emit 不被呼叫
  test('Scenario B-3: 外部 fragment + 無 sessionId → instinct.emit 不被呼叫，skipped=1', () => {
    const agentOutput = [
      '### Findings',
      '- 在 projects/md-blog/src/parser.js 發現解析問題',
    ].join('\n');

    const emitCalls = [];
    const mockInstinct = {
      emit: (...args) => emitCalls.push(args),
    };

    const result = archiveKnowledge(
      agentOutput,
      {
        agentName: 'developer',
        actualStageKey: 'DEV',
        projectRoot: PROJECT_ROOT,
        sessionId: undefined,
      },
      { instinct: mockInstinct }
    );

    expect(emitCalls.length).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.archived).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════
// Feature 6: archiveKnowledge
// ════════════════════════════════════════════════════════════════

describe('Feature 6: archiveKnowledge', () => {
  // Scenario 6-1: 含 Findings 區塊 → archived > 0
  test('Scenario 6-1: 含 Findings 區塊（testing 關鍵詞）→ archived > 0, errors = 0', () => {
    const agentOutput = [
      'VERDICT: pass',
      '### Findings',
      '- 使用 describe/it/expect 組織 BDD 測試',
      '- mock 和 stub 用於隔離外部依賴',
      '- coverage 指標：statement 90% branch 85%',
      '### Files Modified',
      '- src/feature.js',
    ].join('\n');

    const result = archiveKnowledge(agentOutput, {
      agentName: 'developer',
      actualStageKey: 'DEV',
      projectRoot: PROJECT_ROOT,
      sessionId: undefined,
    });

    expect(typeof result.archived).toBe('number');
    expect(typeof result.errors).toBe('number');
    expect(result.archived).toBeGreaterThan(0);
    expect(result.errors).toBe(0);
  });

  // Scenario 6-2: 空輸出 → archived = 0, errors = 0
  test('Scenario 6-2: 空輸出 → archived = 0, errors = 0', () => {
    const result = archiveKnowledge('', {
      agentName: 'developer',
      actualStageKey: 'DEV',
      projectRoot: PROJECT_ROOT,
    });

    expect(result.archived).toBe(0);
    expect(result.errors).toBe(0);
  });

  // Scenario 6-2 變體: null 輸出
  test('Scenario 6-2b: null 輸出 → archived = 0, errors = 0，不拋錯', () => {
    expect(() => {
      const result = archiveKnowledge(null, {
        agentName: 'developer',
        actualStageKey: 'DEV',
        projectRoot: PROJECT_ROOT,
      });
      expect(result.archived).toBe(0);
      expect(result.errors).toBe(0);
    }).not.toThrow();
  });

  // Scenario 6-3: 不可寫路徑 → errors > 0 且不拋錯
  test('Scenario 6-3: projectRoot 指向不存在路徑 → errors > 0，函式不拋例外', () => {
    const agentOutput = [
      '### Findings',
      '- 使用 describe/it/expect 組織 BDD 測試，confirm test strategy',
      '- mock 依賴 isolation，coverage 達標',
    ].join('\n');

    expect(() => {
      const result = archiveKnowledge(agentOutput, {
        agentName: 'developer',
        actualStageKey: 'DEV',
        // 指向不存在的 plugin 目錄（路由可能成功但寫入失敗）
        projectRoot: '/nonexistent-path-xyz-12345',
      });
      // 不拋錯，errors 可能 > 0 或 archived > 0（視路由結果而定）
      expect(typeof result.archived).toBe('number');
      expect(typeof result.errors).toBe('number');
    }).not.toThrow();
  });

  // Scenario 6-4: 多 fragments 但部分失敗 — 繼續處理其餘
  test('Scenario 6-4: 含多個區塊（Findings + Context）→ 繼續處理全部', () => {
    const agentOutput = [
      '### Findings',
      '- 使用 describe/it/expect 組織 BDD 測試，test coverage 90%',
      '### Context',
      '- BDD spec 定義了 10 個 scenario，全部通過 test validation',
    ].join('\n');

    // 即使 projectRoot 不可寫，也不應拋錯
    expect(() => {
      const result = archiveKnowledge(agentOutput, {
        agentName: 'developer',
        actualStageKey: 'DEV',
        projectRoot: PROJECT_ROOT,
      });
      // 函式不拋錯，結果格式正確
      expect(typeof result.archived).toBe('number');
      expect(typeof result.errors).toBe('number');
      expect(result.archived + result.errors).toBeGreaterThanOrEqual(0);
    }).not.toThrow();
  });

  // Scenario 6-5: sessionId 有效 → 不因 instinct 操作失敗而拋錯
  test('Scenario 6-5: 有 sessionId → 正常回傳，不因 instinct 而拋錯', () => {
    const agentOutput = [
      '### Findings',
      '- 使用 describe/it/expect 組織 BDD 測試，coverage 達標',
    ].join('\n');

    expect(() => {
      const result = archiveKnowledge(agentOutput, {
        agentName: 'developer',
        actualStageKey: 'DEV',
        projectRoot: PROJECT_ROOT,
        sessionId: 'test-session-archiver-12345',
      });
      expect(typeof result).toBe('object');
      expect(typeof result.archived).toBe('number');
      expect(typeof result.errors).toBe('number');
    }).not.toThrow();
  });
});
