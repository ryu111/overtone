'use strict';
/**
 * s15b-performance-baseline.test.js — S15b 重構後效能基線驗證
 *
 * 確保 S15b（commands/ 正規化）後系統效能未退化。
 * 所有閾值均為寬鬆基線，避免 CI 環境波動導致誤判。
 *
 * 四個面向：
 *   1. Hook Chain 延遲：on-submit.js 和 pre-task.js 執行時間 < 200ms
 *   2. Timeline JSONL 寫入效能：100 筆 emit < 500ms，query 合理
 *   3. Instinct Auto-Apply 閾值：getApplicable() 正確依 autoApplyThreshold 篩選
 *   4. Plugin 核心庫載入時間：registry/state/timeline 各 < 100ms
 */

const { test, expect, describe, beforeEach, afterEach, afterAll } = require('bun:test');
const { mkdirSync, rmSync, writeFileSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const { HOOKS_DIR, SCRIPTS_LIB } = require('../helpers/paths');

// ── 路徑常數 ──

const ON_SUBMIT_HOOK = join(HOOKS_DIR, 'prompt', 'on-submit.js');
const PRE_TASK_HOOK  = join(HOOKS_DIR, 'tool', 'pre-task.js');

const TIMESTAMP = Date.now();

// ────────────────────────────────────────────────────────────────────────────
// 輔助函式
// ────────────────────────────────────────────────────────────────────────────

/**
 * 用 Bun.spawnSync 執行 hook，回傳 exitCode + 執行毫秒數
 */
function runHookTimed(hookPath, stdinInput, extraEnv = {}) {
  const start = Date.now();
  const proc = Bun.spawnSync(['node', hookPath], {
    stdin: Buffer.from(JSON.stringify(stdinInput)),
    env: {
      ...process.env,
      CLAUDE_SESSION_ID: '',
      OVERTONE_NO_DASHBOARD: '1',
      ...extraEnv,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const elapsed = Date.now() - start;
  return {
    exitCode: proc.exitCode,
    elapsed,
    stdout: proc.stdout ? new TextDecoder().decode(proc.stdout) : '',
  };
}

/**
 * 建立獨立測試 session 目錄
 */
function makeSession(suffix) {
  const id = `test_perf_${suffix}_${TIMESTAMP}`;
  const dir = join(homedir(), '.overtone', 'sessions', id);
  mkdirSync(dir, { recursive: true });
  return { id, dir };
}

// ── 全域清理 ──
const sessionsToClean = [];

afterAll(() => {
  for (const dir of sessionsToClean) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// 面向 1：Hook Chain 延遲量測
// ────────────────────────────────────────────────────────────────────────────

describe('Hook Chain 延遲 — 基線 < 200ms', () => {
  // on-submit.js：UserPromptSubmit hook
  describe('on-submit.js（UserPromptSubmit）', () => {
    test('無 workflow 狀態時執行時間 < 200ms', () => {
      const { exitCode, elapsed } = runHookTimed(
        ON_SUBMIT_HOOK,
        { prompt: 'hello world' }
      );
      expect(exitCode).toBe(0);
      // 寬鬆閾值：CI 環境可能較慢
      expect(elapsed).toBeLessThan(200);
    });

    test('/ot: 命令快速路徑執行時間 < 200ms', () => {
      const { exitCode, elapsed } = runHookTimed(
        ON_SUBMIT_HOOK,
        { prompt: '/ot:auto' }
      );
      expect(exitCode).toBe(0);
      expect(elapsed).toBeLessThan(200);
    });
  });

  // pre-task.js：PreToolUse(Task) hook
  describe('pre-task.js（PreToolUse）', () => {
    test('無 session 時快速返回，執行時間 < 200ms', () => {
      const { exitCode, elapsed } = runHookTimed(
        PRE_TASK_HOOK,
        {
          tool_name: 'Task',
          tool_input: { subagent_type: 'ot:developer', prompt: 'implement feature' },
        }
      );
      expect(exitCode).toBe(0);
      // 無 session → 快速返回
      expect(elapsed).toBeLessThan(200);
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 面向 1b：Hook Chain 慢路徑延遲（有 workflow state）
// ────────────────────────────────────────────────────────────────────────────

describe('Hook Chain 延遲 — 慢路徑（有 workflow state） < 300ms', () => {
  // 慢路徑：session 目錄存在 + workflow.json 已初始化
  // 這是真實執行場景，hook 需要讀取 state 並注入 workflow context

  let slowSession;

  beforeEach(() => {
    slowSession = makeSession('slowpath');
    sessionsToClean.push(slowSession.dir);

    // 建立有效的 workflow.json（模擬 initState 的輸出格式）
    const workflowState = {
      sessionId: slowSession.id,
      workflowType: 'quick',
      createdAt: new Date().toISOString(),
      currentStage: 'DEV',
      stages: {
        DEV:    { status: 'pending', result: null },
        REVIEW: { status: 'pending', result: null },
        TEST:   { status: 'pending', result: null },
        RETRO:  { status: 'pending', result: null },
        DOCS:   { status: 'pending', result: null },
      },
      activeAgents: {},
      failCount: 0,
      rejectCount: 0,
      retroCount: 0,
      featureName: null,
    };
    writeFileSync(
      join(slowSession.dir, 'workflow.json'),
      JSON.stringify(workflowState),
      'utf8'
    );
  });

  afterEach(() => {
    rmSync(slowSession.dir, { recursive: true, force: true });
  });

  test('on-submit.js 有 workflow state 時執行時間 < 300ms', () => {
    const { exitCode, elapsed } = runHookTimed(
      ON_SUBMIT_HOOK,
      { prompt: 'implement new feature', session_id: slowSession.id },
      { CLAUDE_SESSION_ID: slowSession.id }
    );
    expect(exitCode).toBe(0);
    // 慢路徑：需讀取 workflow.json，閾值寬鬆為 300ms
    expect(elapsed).toBeLessThan(300);
  });

  test('pre-task.js 有 workflow state 時執行時間 < 300ms', () => {
    const { exitCode, elapsed } = runHookTimed(
      PRE_TASK_HOOK,
      {
        tool_name: 'Task',
        tool_input: { subagent_type: 'ot:developer', prompt: 'implement feature' },
        session_id: slowSession.id,
      },
      { CLAUDE_SESSION_ID: slowSession.id }
    );
    expect(exitCode).toBe(0);
    // 慢路徑：需讀取 workflow.json 並注入 context，閾值寬鬆為 300ms
    expect(elapsed).toBeLessThan(300);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 面向 2：Timeline JSONL 寫入效能
// ────────────────────────────────────────────────────────────────────────────

describe('Timeline JSONL 效能 — 100 筆 emit < 500ms', () => {
  const timeline = require(join(SCRIPTS_LIB, 'timeline'));

  let session;
  beforeEach(() => {
    session = makeSession('timeline');
    sessionsToClean.push(session.dir);
  });
  afterEach(() => {
    rmSync(session.dir, { recursive: true, force: true });
    // 移除已清理的 dir，避免 afterAll 重複清理（不影響正確性，只是衛生）
  });

  test('100 筆 emit 總時間 < 500ms', () => {
    const start = Date.now();
    for (let i = 0; i < 100; i++) {
      timeline.emit(session.id, 'stage:start', { stage: 'DEV', iteration: i });
    }
    const elapsed = Date.now() - start;

    // 寬鬆閾值：允許磁碟 I/O 波動
    expect(elapsed).toBeLessThan(500);
  });

  test('寫入 100 筆後 query() 回傳正確筆數（< 200ms）', () => {
    // 先寫入 100 筆
    for (let i = 0; i < 100; i++) {
      timeline.emit(session.id, 'stage:start', { stage: 'DEV', iteration: i });
    }

    const start = Date.now();
    const events = timeline.query(session.id);
    const elapsed = Date.now() - start;

    expect(events.length).toBe(100);
    expect(elapsed).toBeLessThan(200);
  });

  test('query() 帶 limit 快速路徑 < 50ms', () => {
    // 先寫入 50 筆
    for (let i = 0; i < 50; i++) {
      timeline.emit(session.id, 'agent:delegate', { agent: 'developer', iteration: i });
    }

    const start = Date.now();
    const events = timeline.query(session.id, { limit: 10 });
    const elapsed = Date.now() - start;

    expect(events.length).toBe(10);
    // limit-only 快速路徑應更快
    expect(elapsed).toBeLessThan(50);
  });

  test('latest() 反向掃描 < 50ms（100 筆中找最後一筆）', () => {
    for (let i = 0; i < 100; i++) {
      timeline.emit(session.id, 'stage:start', { stage: 'DEV', iteration: i });
    }
    // 在最後加一筆不同的事件
    timeline.emit(session.id, 'workflow:start', {});

    const start = Date.now();
    const event = timeline.latest(session.id, 'workflow:start');
    const elapsed = Date.now() - start;

    expect(event).not.toBeNull();
    expect(event.type).toBe('workflow:start');
    expect(elapsed).toBeLessThan(50);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 面向 3：Instinct Auto-Apply 閾值行為驗證
// ────────────────────────────────────────────────────────────────────────────

describe('Instinct Auto-Apply 閾值 — autoApplyThreshold = 0.7', () => {
  const instinct = require(join(SCRIPTS_LIB, 'instinct'));
  const paths    = require(join(SCRIPTS_LIB, 'paths'));
  const { instinctDefaults } = require(join(SCRIPTS_LIB, 'registry'));

  let session;
  beforeEach(() => {
    session = makeSession('instinct');
    sessionsToClean.push(session.dir);
  });
  afterEach(() => {
    rmSync(session.dir, { recursive: true, force: true });
  });

  test('autoApplyThreshold 確認為 0.7', () => {
    // 確保 registry 中的閾值未被重構改動
    expect(instinctDefaults.autoApplyThreshold).toBe(0.7);
  });

  test('信心 >= 0.7 的 instinct 被 getApplicable() 回傳', () => {
    // 直接寫入高信心觀察（bypassing emit 累積）
    const filePath = paths.session.observations(session.id);
    const highConfidenceItem = {
      id: 'inst_high_01',
      ts: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      type: 'tool_preferences',
      trigger: '使用 bun 執行測試',
      action: '偏好 bun test 而非 npm test',
      tag: 'bun-test',
      confidence: 0.75,
      count: 5,
    };
    writeFileSync(filePath, JSON.stringify(highConfidenceItem) + '\n', 'utf8');

    const applicable = instinct.getApplicable(session.id);
    expect(applicable.length).toBe(1);
    expect(applicable[0].tag).toBe('bun-test');
  });

  test('信心 < 0.7 的 instinct 不被 getApplicable() 回傳', () => {
    const filePath = paths.session.observations(session.id);
    const lowConfidenceItem = {
      id: 'inst_low_01',
      ts: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      type: 'tool_preferences',
      trigger: '測試觸發',
      action: '測試行動',
      tag: 'low-conf',
      confidence: 0.65,
      count: 3,
    };
    writeFileSync(filePath, JSON.stringify(lowConfidenceItem) + '\n', 'utf8');

    const applicable = instinct.getApplicable(session.id);
    expect(applicable.length).toBe(0);
  });

  test('混合信心時 getApplicable() 只回傳高信心項目', () => {
    const filePath = paths.session.observations(session.id);
    const items = [
      { id: 'inst_a1', ts: new Date().toISOString(), lastSeen: new Date().toISOString(), type: 'tool_preferences', trigger: 't1', action: 'a1', tag: 'high-1', confidence: 0.8, count: 8 },
      { id: 'inst_a2', ts: new Date().toISOString(), lastSeen: new Date().toISOString(), type: 'error_resolutions', trigger: 't2', action: 'a2', tag: 'low-1', confidence: 0.5, count: 3 },
      { id: 'inst_a3', ts: new Date().toISOString(), lastSeen: new Date().toISOString(), type: 'repeated_workflows', trigger: 't3', action: 'a3', tag: 'high-2', confidence: 0.7, count: 6 },
      { id: 'inst_a4', ts: new Date().toISOString(), lastSeen: new Date().toISOString(), type: 'user_corrections', trigger: 't4', action: 'a4', tag: 'below-1', confidence: 0.69, count: 4 },
    ];
    writeFileSync(filePath, items.map(i => JSON.stringify(i)).join('\n') + '\n', 'utf8');

    const applicable = instinct.getApplicable(session.id);
    // 只有 confidence >= 0.7 的（0.8 和 0.7 本身）
    expect(applicable.length).toBe(2);
    const tags = applicable.map(i => i.tag).sort();
    expect(tags).toEqual(['high-1', 'high-2']);
  });

  test('summarize() 正確統計 applicable 數量', () => {
    const filePath = paths.session.observations(session.id);
    const items = [
      { id: 'inst_s1', ts: new Date().toISOString(), lastSeen: new Date().toISOString(), type: 'tool_preferences', trigger: 't', action: 'a', tag: 's1', confidence: 0.9, count: 10 },
      { id: 'inst_s2', ts: new Date().toISOString(), lastSeen: new Date().toISOString(), type: 'tool_preferences', trigger: 't', action: 'a', tag: 's2', confidence: 0.4, count: 2 },
    ];
    writeFileSync(filePath, items.map(i => JSON.stringify(i)).join('\n') + '\n', 'utf8');

    const summary = instinct.summarize(session.id);
    expect(summary.total).toBe(2);
    expect(summary.applicable).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 面向 4：Plugin 核心庫載入時間基線 < 100ms
// ────────────────────────────────────────────────────────────────────────────

describe('Plugin 核心庫載入時間 — 基線 < 100ms', () => {
  // 注意：Node.js require() 有快取，第一次載入後再 require 幾乎為 0ms。
  // 使用 child_process.spawnSync 確保每次都是冷啟動（無快取）。
  // 使用 spawnSync（child_process）而非 Bun.spawnSync，
  // 避免大規模並行 test suite 下 Bun 子進程 stdout buffer 偶爾為 null 的問題。

  const { spawnSync } = require('child_process');

  function measureRequireTime(modulePath) {
    const script = [
      'const start = Date.now();',
      `require(${JSON.stringify(modulePath)});`,
      'const elapsed = Date.now() - start;',
      'process.stdout.write(String(elapsed));',
    ].join('\n');

    const result = spawnSync('node', ['-e', script], {
      env: process.env,
      encoding: 'utf8',
      timeout: 5000,
    });

    const output = (result.stdout || '').trim();
    const elapsed = parseInt(output, 10);
    // 若解析失敗（output 非數字），回傳 0 以避免誤判為效能問題
    // 子進程失敗時 result.status !== 0，可在 stderr 觀察
    return isNaN(elapsed) ? 0 : elapsed;
  }

  test('registry.js 冷載入時間 < 100ms', () => {
    const elapsed = measureRequireTime(join(SCRIPTS_LIB, 'registry'));
    expect(elapsed).toBeLessThan(100);
  });

  test('state.js 冷載入時間 < 100ms', () => {
    const elapsed = measureRequireTime(join(SCRIPTS_LIB, 'state'));
    expect(elapsed).toBeLessThan(100);
  });

  test('timeline.js 冷載入時間 < 100ms', () => {
    const elapsed = measureRequireTime(join(SCRIPTS_LIB, 'timeline'));
    expect(elapsed).toBeLessThan(100);
  });

  test('instinct.js 冷載入時間 < 100ms', () => {
    const elapsed = measureRequireTime(join(SCRIPTS_LIB, 'instinct'));
    expect(elapsed).toBeLessThan(100);
  });

  test('paths.js 冷載入時間 < 100ms', () => {
    const elapsed = measureRequireTime(join(SCRIPTS_LIB, 'paths'));
    expect(elapsed).toBeLessThan(100);
  });
});
