'use strict';
/**
 * session-stop-handler.test.js
 *
 * 測試 session-stop-handler.js 的純函數：
 *   - calcDuration：時間差計算
 *   - buildCompletionSummary：完成摘要產生
 *   - buildContinueMessage：loop 繼續訊息組裝
 */

const { describe, test, expect } = require('bun:test');
const {
  calcDuration,
  buildCompletionSummary,
  buildContinueMessage,
  _isRelatedQueueItem,
} = require('../../plugins/overtone/scripts/lib/session-stop-handler');

// ── calcDuration ────────────────────────────────────────────────────────────

describe('calcDuration', () => {
  test('超過 1 分鐘時包含分鐘和秒數', () => {
    const start = new Date(Date.now() - 2 * 60 * 1000 - 30 * 1000).toISOString();
    const result = calcDuration(start);
    expect(result).toMatch(/\d+m \d+s/);
    expect(result).toContain('2m');
  });

  test('不足 1 分鐘時只回傳秒數', () => {
    const start = new Date(Date.now() - 45 * 1000).toISOString();
    const result = calcDuration(start);
    expect(result).toMatch(/^\d+s$/);
    expect(result).not.toContain('m');
  });

  test('回傳字串型別', () => {
    const start = new Date(Date.now() - 1000).toISOString();
    expect(typeof calcDuration(start)).toBe('string');
  });

  test('剛好 60 秒時回傳 1m 0s', () => {
    const start = new Date(Date.now() - 60 * 1000).toISOString();
    const result = calcDuration(start);
    expect(result).toMatch(/1m \d+s/);
  });
});

// ── buildCompletionSummary ───────────────────────────────────────────────────

describe('buildCompletionSummary', () => {
  test('回傳非空字串', () => {
    const ws = {
      workflowType: 'standard',
      currentStage: 'DEV',
      createdAt: new Date(Date.now() - 60000).toISOString(),
      failCount: 0,
      rejectCount: 0,
      stages: {
        PLAN: { status: 'completed', result: 'pass' },
        DEV: { status: 'completed', result: 'pass' },
      },
    };
    const result = buildCompletionSummary(ws);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  test('包含 workflowType', () => {
    const ws = {
      workflowType: 'quick',
      currentStage: 'DOCS',
      createdAt: new Date(Date.now() - 30000).toISOString(),
      failCount: 0,
      rejectCount: 0,
      stages: {
        DEV: { status: 'completed', result: 'pass' },
        REVIEW: { status: 'completed', result: 'pass' },
      },
    };
    const result = buildCompletionSummary(ws);
    expect(result).toContain('quick');
  });

  test('stages 為空物件時不拋出例外', () => {
    const ws = {
      workflowType: 'single',
      currentStage: null,
      createdAt: new Date(Date.now() - 5000).toISOString(),
      failCount: 0,
      rejectCount: 0,
      stages: {},
    };
    expect(() => buildCompletionSummary(ws)).not.toThrow();
    const result = buildCompletionSummary(ws);
    expect(typeof result).toBe('string');
  });

  test('fail stage 顯示 ❌ 圖示', () => {
    const ws = {
      workflowType: 'quick',
      createdAt: new Date(Date.now() - 10000).toISOString(),
      failCount: 1,
      rejectCount: 0,
      stages: {
        DEV: { status: 'completed', result: 'fail' },
      },
    };
    const result = buildCompletionSummary(ws);
    expect(result).toContain('❌');
  });

  test('有 failCount 時顯示失敗重試次數', () => {
    const ws = {
      workflowType: 'quick',
      createdAt: new Date(Date.now() - 5000).toISOString(),
      failCount: 3,
      rejectCount: 0,
      stages: {
        DEV: { status: 'completed', result: 'pass' },
      },
    };
    const result = buildCompletionSummary(ws);
    expect(result).toContain('3');
  });
});

// ── buildContinueMessage ─────────────────────────────────────────────────────

describe('buildContinueMessage', () => {
  test('包含 iteration 資訊', () => {
    const result = buildContinueMessage({
      iteration: 2,
      maxIterations: 5,
      progressBar: '✅🏗️✅',
      completedStages: 3,
      totalStages: 5,
      tasksStatus: { checked: 3, total: 5 },
      hint: '繼續 DEV 階段',
    });
    expect(result).toContain('2');
    expect(result).toContain('5');
  });

  test('包含禁止使用 AskUserQuestion的指令', () => {
    const result = buildContinueMessage({
      iteration: 1,
      maxIterations: 10,
      progressBar: '',
      completedStages: 1,
      totalStages: 4,
      tasksStatus: null,
      hint: null,
    });
    expect(result).toContain('禁止使用 AskUserQuestion');
  });

  test('有 hint 時顯示在繼續訊息中', () => {
    const result = buildContinueMessage({
      iteration: 1,
      maxIterations: 10,
      progressBar: '',
      completedStages: 1,
      totalStages: 4,
      tasksStatus: null,
      hint: '執行 REVIEW 階段',
    });
    expect(result).toContain('執行 REVIEW 階段');
  });

  test('有 tasksStatus 時顯示 tasks 進度', () => {
    const result = buildContinueMessage({
      iteration: 1,
      maxIterations: 10,
      progressBar: '',
      completedStages: 2,
      totalStages: 4,
      tasksStatus: { checked: 2, total: 5 },
      hint: null,
    });
    expect(result).toContain('2/5');
  });

  test('iteration 達到 maxIterations 時不拋出例外', () => {
    expect(() => buildContinueMessage({
      iteration: 5,
      maxIterations: 5,
      progressBar: '',
      completedStages: 3,
      totalStages: 5,
    })).not.toThrow();
  });

  test('ctx 為 null/undefined 時不拋出例外', () => {
    expect(() => buildContinueMessage(null)).not.toThrow();
    expect(() => buildContinueMessage(undefined)).not.toThrow();
  });

  test('回傳字串型別', () => {
    const result = buildContinueMessage({
      iteration: 1,
      maxIterations: 5,
      progressBar: '✅',
      completedStages: 1,
      totalStages: 3,
      tasksStatus: null,
      hint: null,
    });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── _isRelatedQueueItem ──────────────────────────────────────────────────────

describe('_isRelatedQueueItem', () => {
  test('itemName 包含 featureName 時回傳 true', () => {
    expect(_isRelatedQueueItem('prompt-journal-core', 'prompt-journal')).toBe(true);
  });

  test('itemName 完全等於 featureName 時回傳 true', () => {
    expect(_isRelatedQueueItem('prompt-journal', 'prompt-journal')).toBe(true);
  });

  test('featureName 包含 itemName 時回傳 true（子任務比主任務長）', () => {
    // featureName = 'prompt-journal-graduation'，itemName = 'promptjournal'
    expect(_isRelatedQueueItem('promptjournal', 'prompt-journal-graduation')).toBe(true);
  });

  test('不相關的項目回傳 false', () => {
    expect(_isRelatedQueueItem('exec-queue-fix', 'prompt-journal')).toBe(false);
  });

  test('空值回傳 false', () => {
    expect(_isRelatedQueueItem('', 'prompt-journal')).toBe(false);
    expect(_isRelatedQueueItem('prompt-journal', '')).toBe(false);
    expect(_isRelatedQueueItem(null, 'prompt-journal')).toBe(false);
    expect(_isRelatedQueueItem('prompt-journal', null)).toBe(false);
  });

  test('大小寫不敏感匹配', () => {
    expect(_isRelatedQueueItem('Prompt-Journal-Core', 'prompt-journal')).toBe(true);
  });

  test('底線和空白與連字號等效', () => {
    expect(_isRelatedQueueItem('prompt_journal_core', 'prompt-journal')).toBe(true);
  });
});
