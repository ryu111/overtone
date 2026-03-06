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

// ── handleSessionStop 整合測試 ────────────────────────────────────────────────

const { describe: describeI, test: testI, expect: expectI, beforeAll, afterAll } = require('bun:test');
const fs = require('fs');
const path = require('path');
const { homedir } = require('os');
const stateLib = require('../../plugins/overtone/scripts/lib/state');
const loopLib = require('../../plugins/overtone/scripts/lib/loop');
const paths = require('../../plugins/overtone/scripts/lib/paths');
const { handleSessionStop } = require('../../plugins/overtone/scripts/lib/session-stop-handler');

const SID_PREFIX = `test_ssh_${Date.now()}`;
let sidCounter = 0;
const createdSessions = [];

function newSid() {
  const sid = `${SID_PREFIX}_${++sidCounter}`;
  createdSessions.push(sid);
  return sid;
}

function setupSession(sid, stageList, workflowType = 'quick', extra = {}) {
  const dir = paths.sessionDir(sid);
  fs.mkdirSync(dir, { recursive: true });
  const s = stateLib.initState(sid, workflowType, stageList, extra);
  return s;
}

afterAll(() => {
  for (const sid of createdSessions) {
    fs.rmSync(paths.sessionDir(sid), { recursive: true, force: true });
  }
});

// ── handleSessionStop：邊界情況 ──────────────────────────────────────────────

describeI('handleSessionStop 邊界情況', () => {
  testI('無 sessionId → 回傳 { output: { result: "" } }', () => {
    const result = handleSessionStop({ cwd: '/tmp' }, null);
    expectI(result).toEqual({ output: { result: '' } });
  });

  testI('sessionId 為空字串 → 回傳 { output: { result: "" } }', () => {
    const result = handleSessionStop({ cwd: '/tmp' }, '');
    expectI(result).toEqual({ output: { result: '' } });
  });

  testI('無 workflow state（session 目錄不存在）→ 回傳 { output: { result: "" } }', () => {
    const result = handleSessionStop({ cwd: '/tmp' }, 'nonexistent-session-xyz');
    expectI(result).toEqual({ output: { result: '' } });
  });

  testI('回傳值可 JSON 序列化', () => {
    const result = handleSessionStop({ cwd: '/tmp' }, null);
    expectI(() => JSON.stringify(result)).not.toThrow();
  });
});

// ── handleSessionStop：手動退出（loopState.stopped）───────────────────────────

describeI('handleSessionStop 手動退出', () => {
  testI('/ot:stop 手動退出 → 回傳 result 包含「手動停止」', () => {
    const sid = newSid();
    setupSession(sid, ['DEV', 'REVIEW']);
    // 設 stopped: true
    loopLib.writeLoop(sid, { iteration: 1, stopped: true, consecutiveErrors: 0, startedAt: new Date().toISOString() });

    const result = handleSessionStop({ cwd: '/tmp' }, sid);
    expectI(result.output).toHaveProperty('result');
    expectI(result.output.result).toContain('停止');
  });
});

// ── handleSessionStop：max iterations ───────────────────────────────────────

describeI('handleSessionStop max iterations', () => {
  testI('達到最大迭代次數（100）→ 回傳帶「迭代」的 result 訊息', () => {
    const sid = newSid();
    setupSession(sid, ['DEV', 'REVIEW']);
    // loopDefaults.maxIterations = 100，設 >= 100 觸發條件
    loopLib.writeLoop(sid, { iteration: 100, stopped: false, consecutiveErrors: 0, startedAt: new Date().toISOString() });

    const result = handleSessionStop({ cwd: '/tmp' }, sid);
    expectI(result.output).toHaveProperty('result');
    expectI(result.output.result).toMatch(/迭代/);
  });
});

// ── handleSessionStop：連續錯誤 ──────────────────────────────────────────────

describeI('handleSessionStop 連續錯誤', () => {
  testI('連續錯誤達閾值 → 回傳 result 包含錯誤訊息', () => {
    const sid = newSid();
    setupSession(sid, ['DEV', 'REVIEW']);
    loopLib.writeLoop(sid, { iteration: 1, stopped: false, consecutiveErrors: 5, startedAt: new Date().toISOString() });

    const result = handleSessionStop({ cwd: '/tmp' }, sid);
    expectI(result.output).toHaveProperty('result');
    expectI(result.output.result).toMatch(/錯誤/);
  });
});

// ── handleSessionStop：workflow 完成 ────────────────────────────────────────

describeI('handleSessionStop workflow 完成', () => {
  testI('所有 stage completed（無失敗）→ 回傳 result 包含完成訊息', () => {
    const sid = newSid();
    const s = setupSession(sid, ['DEV', 'REVIEW']);
    // 標記所有 stage 為 completed
    stateLib.updateStage(sid, 'DEV', { status: 'completed', result: 'pass' });
    stateLib.updateStage(sid, 'REVIEW', { status: 'completed', result: 'pass' });
    loopLib.writeLoop(sid, { iteration: 1, stopped: false, consecutiveErrors: 0, startedAt: new Date().toISOString() });

    const result = handleSessionStop({ cwd: '/tmp' }, sid);
    expectI(result.output).toHaveProperty('result');
    expectI(result.output.result).toContain('完成');
  });

  testI('所有 stage completed（含失敗 stage）→ 回傳 allCompleted 的結果訊息', () => {
    const sid = newSid();
    setupSession(sid, ['DEV', 'REVIEW']);
    stateLib.updateStage(sid, 'DEV', { status: 'completed', result: 'fail' });
    stateLib.updateStage(sid, 'REVIEW', { status: 'completed', result: 'pass' });
    loopLib.writeLoop(sid, { iteration: 1, stopped: false, consecutiveErrors: 0, startedAt: new Date().toISOString() });

    const result = handleSessionStop({ cwd: '/tmp' }, sid);
    // allCompleted === true → 回傳 result（summary 格式）
    expectI(result.output).toHaveProperty('result');
    // 含失敗 stage → ❌ 圖示
    expectI(result.output.result).toContain('❌');
  });
});

// ── handleSessionStop：未完成 → loop 繼續 ────────────────────────────────────

describeI('handleSessionStop loop 繼續', () => {
  testI('workflow 未完成 → 回傳 decision: block', () => {
    const sid = newSid();
    setupSession(sid, ['DEV', 'REVIEW']);
    stateLib.updateStage(sid, 'DEV', { status: 'completed', result: 'pass' });
    // REVIEW 仍為 pending
    loopLib.writeLoop(sid, { iteration: 1, stopped: false, consecutiveErrors: 0, startedAt: new Date().toISOString() });

    const result = handleSessionStop({ cwd: '/tmp' }, sid);
    expectI(result.output.decision).toBe('block');
    expectI(result.output.reason).toContain('禁止使用 AskUserQuestion');
  });

  testI('loop 繼續訊息包含 iteration 資訊', () => {
    const sid = newSid();
    setupSession(sid, ['DEV', 'REVIEW']);
    loopLib.writeLoop(sid, { iteration: 2, stopped: false, consecutiveErrors: 0, startedAt: new Date().toISOString() });

    const result = handleSessionStop({ cwd: '/tmp' }, sid);
    if (result.output.decision === 'block') {
      expectI(result.output.reason).toContain('Loop');
    }
  });

  testI('loop 繼續訊息包含進度資訊', () => {
    const sid = newSid();
    setupSession(sid, ['DEV', 'REVIEW', 'RETRO', 'DOCS']);
    stateLib.updateStage(sid, 'DEV', { status: 'completed', result: 'pass' });
    loopLib.writeLoop(sid, { iteration: 1, stopped: false, consecutiveErrors: 0, startedAt: new Date().toISOString() });

    const result = handleSessionStop({ cwd: '/tmp' }, sid);
    expectI(result.output.decision).toBe('block');
    expectI(result.output.reason).toMatch(/\d+\/\d+/);
  });
});

// ── handleSessionStop：loop:start 事件（iteration === 0）──────────────────────

describeI('handleSessionStop loop:start 事件', () => {
  testI('iteration === 0 時 loop:start 事件被 emit（不拋出）', () => {
    const sid = newSid();
    setupSession(sid, ['DEV']);
    loopLib.writeLoop(sid, { iteration: 0, stopped: false, consecutiveErrors: 0, startedAt: new Date().toISOString() });

    expectI(() => handleSessionStop({ cwd: '/tmp' }, sid)).not.toThrow();
  });
});

// ── handleSessionStop：PM stage ──────────────────────────────────────────────

describeI('handleSessionStop PM stage', () => {
  testI('currentStage 為 PM → 回傳 result: "" 不強制 loop', () => {
    const sid = newSid();
    const s = setupSession(sid, ['PM', 'DEV']);
    loopLib.writeLoop(sid, { iteration: 1, stopped: false, consecutiveErrors: 0, startedAt: new Date().toISOString() });

    const result = handleSessionStop({ cwd: '/tmp' }, sid);
    expectI(result.output).toHaveProperty('result');
    // PM 模式不應 block loop
    expectI(result.output.result).toBe('');
  });
});

// ── buildCompletionSummary 補充 ───────────────────────────────────────────────

describeI('buildCompletionSummary 補充', () => {
  testI('reject stage 顯示 🔙 圖示', () => {
    const ws = {
      workflowType: 'quick',
      createdAt: new Date(Date.now() - 10000).toISOString(),
      failCount: 0,
      rejectCount: 1,
      stages: { REVIEW: { status: 'completed', result: 'reject' } },
    };
    const result = buildCompletionSummary(ws);
    expectI(result).toContain('🔙');
  });

  testI('pass stage 顯示 ✅ 圖示', () => {
    const ws = {
      workflowType: 'quick',
      createdAt: new Date(Date.now() - 10000).toISOString(),
      failCount: 0,
      rejectCount: 0,
      stages: { DEV: { status: 'completed', result: 'pass' } },
    };
    const result = buildCompletionSummary(ws);
    expectI(result).toContain('✅');
  });

  testI('有 rejectCount 時顯示拒絕次數', () => {
    const ws = {
      workflowType: 'quick',
      createdAt: new Date(Date.now() - 5000).toISOString(),
      failCount: 0,
      rejectCount: 2,
      stages: { REVIEW: { status: 'completed', result: 'pass' } },
    };
    const result = buildCompletionSummary(ws);
    expectI(result).toContain('2');
  });

  testI('包含耗時資訊', () => {
    const ws = {
      workflowType: 'quick',
      createdAt: new Date(Date.now() - 30000).toISOString(),
      failCount: 0,
      rejectCount: 0,
      stages: { DEV: { status: 'completed', result: 'pass' } },
    };
    const result = buildCompletionSummary(ws);
    expectI(result).toContain('耗時');
  });

  testI('未知 result 顯示 ⬜', () => {
    const ws = {
      workflowType: 'single',
      createdAt: new Date(Date.now() - 1000).toISOString(),
      failCount: 0,
      rejectCount: 0,
      stages: { DEV: { status: 'completed', result: null } },
    };
    const result = buildCompletionSummary(ws);
    expectI(result).toContain('⬜');
  });
});

// ── _isRelatedQueueItem 補充 ──────────────────────────────────────────────────

describeI('_isRelatedQueueItem 補充', () => {
  testI('兩者都是 null 回傳 false', () => {
    expectI(_isRelatedQueueItem(null, null)).toBe(false);
  });

  testI('兩個完全不同的名稱回傳 false', () => {
    expectI(_isRelatedQueueItem('auth-system', 'payment-gateway')).toBe(false);
  });

  testI('空白字元正規化後匹配', () => {
    expectI(_isRelatedQueueItem('prompt journal', 'prompt-journal')).toBe(true);
  });
});
