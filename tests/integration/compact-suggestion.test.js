'use strict';
/**
 * compact-suggestion.test.js — S14 Strategic Compact 整合測試
 *
 * 覆蓋：
 *   Scenario 1:  超過閾值 + 非最後 stage → 建議 compact + emit timeline
 *   Scenario 2:  transcript < 閾值 → 不建議
 *   Scenario 3:  最後 stage（無 nextHint）→ 不建議
 *   Scenario 4:  剛 compact 過（< 2 stage:complete）→ 跳過
 *   Scenario 5:  從未 compact → 允許首次觸發
 *   Scenario 6:  自訂閾值（OVERTONE_COMPACT_THRESHOLD_MB 環境變數）
 *   Scenario 7:  transcript_path 不存在 → 靜默降級
 *   Scenario 8:  fail/reject → 不建議
 *   Scenario 9:  formatSize 格式化正確
 *   Scenario 10: registry 包含 session:compact-suggestion
 *   Scenario 11: transcript_path 為 null → 不建議
 *   Scenario 12: compact 後 ≥ 2 個 stage:complete → 再次觸發建議
 */

const { test, expect, describe, afterAll, beforeAll } = require('bun:test');
const { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync, writeSync, openSync } = require('fs');
const { join } = require('path');
const { homedir, tmpdir } = require('os');
const { HOOKS_DIR, SCRIPTS_LIB } = require('../helpers/paths');

// ── 路徑設定 ──

const ON_STOP_PATH = join(HOOKS_DIR, 'agent', 'on-stop.js');
const paths = require(join(SCRIPTS_LIB, 'paths'));
const stateLib = require(join(SCRIPTS_LIB, 'state'));
const timeline = require(join(SCRIPTS_LIB, 'timeline'));

// ── 直接 import 函式（unit-level 測試）──

const { shouldSuggestCompact, formatSize } = require(ON_STOP_PATH);

// ── Session ID（加時戳避免衝突）──

const TS = Date.now();
const SESSION_BASE = `compact-suggest-${TS}`;

// 各場景 sessionId
const SESSION_ABOVE   = `${SESSION_BASE}-above`;
const SESSION_BELOW   = `${SESSION_BASE}-below`;
const SESSION_LAST    = `${SESSION_BASE}-last`;
const SESSION_RECENT  = `${SESSION_BASE}-recent`;
const SESSION_NEVER   = `${SESSION_BASE}-never`;
const SESSION_CUSTOM  = `${SESSION_BASE}-custom`;
const SESSION_NOFILE  = `${SESSION_BASE}-nofile`;
const SESSION_FAIL    = `${SESSION_BASE}-fail`;
const SESSION_AFTER2  = `${SESSION_BASE}-after2`;

// 暫存 transcript 檔案目錄
const TMP_DIR = join(homedir(), '.overtone', 'test-tmp', `compact-suggest-${TS}`);

// ── 輔助函式 ──

/**
 * 建立指定大小的暫存 transcript 檔案
 * @param {string} name - 檔案名稱（不含路徑）
 * @param {number} sizeBytes - 大小（bytes）
 * @returns {string} 完整路徑
 */
function createTranscript(name, sizeBytes) {
  mkdirSync(TMP_DIR, { recursive: true });
  const filePath = join(TMP_DIR, name);
  // 寫入指定大小的空白字元
  writeFileSync(filePath, Buffer.alloc(sizeBytes, 'x'));
  return filePath;
}

/**
 * 執行 on-stop.js hook 子進程
 */
function runOnStop(input, extraEnv = {}) {
  const sessionId = input.session_id || '';
  const proc = Bun.spawnSync(['node', ON_STOP_PATH], {
    stdin: Buffer.from(JSON.stringify(input)),
    env: {
      ...process.env,
      CLAUDE_SESSION_ID: sessionId,
      OVERTONE_NO_DASHBOARD: '1',
      ...extraEnv,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout ? new TextDecoder().decode(proc.stdout) : '',
    stderr: proc.stderr ? new TextDecoder().decode(proc.stderr) : '',
  };
}

/**
 * 讀取 timeline.jsonl 並解析所有事件
 */
function readTimeline(sessionId) {
  const timelinePath = paths.session.timeline(sessionId);
  if (!existsSync(timelinePath)) return [];
  const raw = readFileSync(timelinePath, 'utf8');
  return raw.trim().split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

/**
 * 建立 standard workflow 並設定部分 stage 為 completed
 */
function setupWorkflow(sessionId, stages, completedStages = []) {
  stateLib.initState(sessionId, 'standard', stages);
  for (const s of completedStages) {
    stateLib.updateStage(sessionId, s, { status: 'completed', result: 'pass' });
  }
}

// ── 清理 ──

afterAll(() => {
  const allSessions = [
    SESSION_ABOVE, SESSION_BELOW, SESSION_LAST, SESSION_RECENT,
    SESSION_NEVER, SESSION_CUSTOM, SESSION_NOFILE, SESSION_FAIL, SESSION_AFTER2,
  ];
  for (const s of allSessions) {
    rmSync(paths.sessionDir(s), { recursive: true, force: true });
  }
  rmSync(TMP_DIR, { recursive: true, force: true });
});

// ══════════════════════════════════════════════════════════════════
// Scenario 9 & formatSize — unit-level 測試
// ══════════════════════════════════════════════════════════════════

describe('Scenario 9：formatSize 格式化', () => {
  test('bytes < 1000 → "B" 格式', () => {
    expect(formatSize(500)).toBe('500B');
    expect(formatSize(0)).toBe('0B');
    expect(formatSize(999)).toBe('999B');
  });

  test('bytes >= 1000 → "KB" 格式（四捨五入）', () => {
    expect(formatSize(1000)).toBe('1KB');
    expect(formatSize(1500)).toBe('2KB');
    expect(formatSize(800_000)).toBe('800KB');
  });

  test('bytes >= 1_000_000 → "MB" 格式（一位小數）', () => {
    expect(formatSize(1_000_000)).toBe('1.0MB');
    expect(formatSize(6_500_000)).toBe('6.5MB');
    expect(formatSize(10_200_000)).toBe('10.2MB');
  });
});

// ══════════════════════════════════════════════════════════════════
// Scenario 10: registry 包含 session:compact-suggestion
// ══════════════════════════════════════════════════════════════════

describe('Scenario 10：registry 事件定義', () => {
  test('session:compact-suggestion 在 registry.timelineEvents 中有定義', () => {
    const { timelineEvents } = require(join(SCRIPTS_LIB, 'registry'));
    expect(timelineEvents['session:compact-suggestion']).toBeDefined();
    expect(timelineEvents['session:compact-suggestion'].label).toBe('建議壓縮');
    expect(timelineEvents['session:compact-suggestion'].category).toBe('session');
  });
});

// ══════════════════════════════════════════════════════════════════
// Scenario 11: transcript_path 為 null → 不建議
// ══════════════════════════════════════════════════════════════════

describe('Scenario 11：transcript_path 為 null', () => {
  test('transcriptPath 為 null 時回傳 { suggest: false }', () => {
    const result = shouldSuggestCompact({
      transcriptPath: null,
      sessionId: `${SESSION_BASE}-null-path`,
    });
    expect(result.suggest).toBe(false);
  });

  test('transcriptPath 未傳入時回傳 { suggest: false }', () => {
    const result = shouldSuggestCompact({
      sessionId: `${SESSION_BASE}-undef-path`,
    });
    expect(result.suggest).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// Scenario 7: transcript_path 不存在 → 靜默降級
// ══════════════════════════════════════════════════════════════════

describe('Scenario 7：transcript_path 不存在', () => {
  test('不存在的 transcript 路徑靜默回傳 { suggest: false }', () => {
    const result = shouldSuggestCompact({
      transcriptPath: '/nonexistent/path/transcript.jsonl',
      sessionId: SESSION_NOFILE,
      thresholdBytes: 1,
    });
    expect(result.suggest).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// Scenario 2: transcript < 閾值 → 不建議
// ══════════════════════════════════════════════════════════════════

describe('Scenario 2：transcript 小於閾值', () => {
  test('transcript 大小 ≤ 閾值時回傳 { suggest: false }', () => {
    const transcriptPath = createTranscript('small.jsonl', 1_000);
    const result = shouldSuggestCompact({
      transcriptPath,
      sessionId: SESSION_BELOW,
      thresholdBytes: 5_000_000,
    });
    expect(result.suggest).toBe(false);
  });

  test('transcript 大小恰好等於閾值時不建議', () => {
    const transcriptPath = createTranscript('equal.jsonl', 5_000_000);
    const result = shouldSuggestCompact({
      transcriptPath,
      sessionId: SESSION_BELOW,
      thresholdBytes: 5_000_000,
    });
    expect(result.suggest).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// Scenario 5: 從未 compact → 允許首次觸發
// ══════════════════════════════════════════════════════════════════

describe('Scenario 5：從未 compact 過', () => {
  test('從未 compact 且 transcript 超過閾值時建議 compact', () => {
    const transcriptPath = createTranscript('large-never.jsonl', 6_000_000);
    const result = shouldSuggestCompact({
      transcriptPath,
      sessionId: SESSION_NEVER,
      thresholdBytes: 5_000_000,
    });
    expect(result.suggest).toBe(true);
    expect(result.transcriptSize).toBe('6.0MB');
    expect(result.reason).toContain('6.0MB');
  });
});

// ══════════════════════════════════════════════════════════════════
// Scenario 4: 剛 compact 過（< 2 stage:complete）→ 跳過
// ══════════════════════════════════════════════════════════════════

describe('Scenario 4：剛 compact 過（< 2 stage:complete）', () => {
  beforeAll(() => {
    // 先 emit session:compact 事件
    mkdirSync(paths.sessionDir(SESSION_RECENT), { recursive: true });
    timeline.emit(SESSION_RECENT, 'session:compact', { workflowType: 'standard' });
    // 只 emit 1 個 stage:complete（< 2）
    timeline.emit(SESSION_RECENT, 'stage:complete', { stage: 'PLAN', result: 'pass' });
  });

  test('compact 後只有 1 個 stage:complete 時不建議', () => {
    const transcriptPath = createTranscript('large-recent.jsonl', 6_000_000);
    const result = shouldSuggestCompact({
      transcriptPath,
      sessionId: SESSION_RECENT,
      thresholdBytes: 5_000_000,
      minStagesSinceCompact: 2,
    });
    expect(result.suggest).toBe(false);
  });

  test('compact 後 0 個 stage:complete 時不建議', () => {
    const SESSION_ZERO = `${SESSION_BASE}-zero-stages`;
    mkdirSync(paths.sessionDir(SESSION_ZERO), { recursive: true });
    timeline.emit(SESSION_ZERO, 'session:compact', { workflowType: 'standard' });
    // 沒有 stage:complete

    const transcriptPath = createTranscript('large-zero.jsonl', 6_000_000);
    const result = shouldSuggestCompact({
      transcriptPath,
      sessionId: SESSION_ZERO,
      thresholdBytes: 5_000_000,
      minStagesSinceCompact: 2,
    });
    expect(result.suggest).toBe(false);
    rmSync(paths.sessionDir(SESSION_ZERO), { recursive: true, force: true });
  });
});

// ══════════════════════════════════════════════════════════════════
// Scenario 12: compact 後 ≥ 2 個 stage:complete → 再次觸發
// ══════════════════════════════════════════════════════════════════

describe('Scenario 12：compact 後 ≥ 2 個 stage:complete', () => {
  beforeAll(() => {
    mkdirSync(paths.sessionDir(SESSION_AFTER2), { recursive: true });
    // emit compact 事件
    timeline.emit(SESSION_AFTER2, 'session:compact', { workflowType: 'standard' });
    // emit 2 個 stage:complete（≥ minStagesSinceCompact）
    timeline.emit(SESSION_AFTER2, 'stage:complete', { stage: 'PLAN', result: 'pass' });
    timeline.emit(SESSION_AFTER2, 'stage:complete', { stage: 'ARCH', result: 'pass' });
  });

  test('compact 後已有 2 個 stage:complete 時應建議', () => {
    const transcriptPath = createTranscript('large-after2.jsonl', 6_000_000);
    const result = shouldSuggestCompact({
      transcriptPath,
      sessionId: SESSION_AFTER2,
      thresholdBytes: 5_000_000,
      minStagesSinceCompact: 2,
    });
    expect(result.suggest).toBe(true);
    expect(result.transcriptSize).toBe('6.0MB');
  });
});

// ══════════════════════════════════════════════════════════════════
// Scenario 6: 自訂閾值（OVERTONE_COMPACT_THRESHOLD_MB）
// ══════════════════════════════════════════════════════════════════

describe('Scenario 6：自訂閾值覆蓋', () => {
  test('thresholdBytes 參數可覆蓋預設值（1MB 閾值，2MB 檔案 → 建議）', () => {
    const transcriptPath = createTranscript('custom-large.jsonl', 2_000_000);
    const result = shouldSuggestCompact({
      transcriptPath,
      sessionId: SESSION_CUSTOM,
      thresholdBytes: 1_000_000, // 1MB
      minStagesSinceCompact: 0,
    });
    expect(result.suggest).toBe(true);
    expect(result.transcriptSize).toBe('2.0MB');
  });

  test('thresholdBytes 參數可覆蓋預設值（10MB 閾值，2MB 檔案 → 不建議）', () => {
    const transcriptPath = createTranscript('custom-small.jsonl', 2_000_000);
    const result = shouldSuggestCompact({
      transcriptPath,
      sessionId: SESSION_CUSTOM,
      thresholdBytes: 10_000_000, // 10MB
    });
    expect(result.suggest).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// Scenario 1 & 3 & 8: on-stop.js 整合測試（透過子進程）
// ══════════════════════════════════════════════════════════════════

describe('Scenario 1：超過閾值 + 非最後 stage → 建議 + emit timeline', () => {
  beforeAll(() => {
    // standard workflow：PLAN completed，剩餘 ARCH..DOCS 為 pending
    setupWorkflow(SESSION_ABOVE, ['PLAN', 'ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST', 'RETRO', 'DOCS'], ['PLAN']);
    // 將 PLAN 設為 active（模擬 planner agent 正在執行）
    stateLib.updateStage(SESSION_ABOVE, 'PLAN', { status: 'active', result: null });
  });

  test('超過閾值時 result 包含 compact 建議文字', () => {
    const transcriptPath = createTranscript('above-threshold.jsonl', 6_000_000);
    const result = runOnStop({
      session_id: SESSION_ABOVE,
      agent_type: 'ot:planner',
      last_assistant_message: 'PASS',
      transcript_path: transcriptPath,
    }, {
      OVERTONE_COMPACT_THRESHOLD_MB: '5',
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.result).toContain('建議在繼續下一個 stage 前執行 /compact');
    expect(parsed.result).toContain('6.0MB');
  });

  test('超過閾值時 timeline 包含 session:compact-suggestion 事件', () => {
    const events = readTimeline(SESSION_ABOVE);
    const suggestionEvent = events.find(e => e.type === 'session:compact-suggestion');
    expect(suggestionEvent).toBeDefined();
    expect(suggestionEvent.category).toBe('session');
    expect(suggestionEvent.transcriptSize).toBe('6.0MB');
    expect(suggestionEvent.stage).toBe('PLAN');
    expect(suggestionEvent.agent).toBe('planner');
  });
});

describe('Scenario 3：最後 stage → 不建議', () => {
  beforeAll(() => {
    // single workflow：只有 DEV stage，設為 active
    setupWorkflow(SESSION_LAST, ['DEV'], []);
    stateLib.updateStage(SESSION_LAST, 'DEV', { status: 'active', result: null });
  });

  test('所有 stage 完成後（無 nextHint）result 不包含 compact 建議', () => {
    const transcriptPath = createTranscript('last-stage.jsonl', 6_000_000);
    const result = runOnStop({
      session_id: SESSION_LAST,
      agent_type: 'ot:developer',
      last_assistant_message: 'PASS',
      transcript_path: transcriptPath,
    }, {
      OVERTONE_COMPACT_THRESHOLD_MB: '1',
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    // 最後 stage 完成 → 進入「所有階段完成」分支，不觸發 compact 建議
    expect(parsed.result).not.toContain('建議在繼續下一個 stage 前執行 /compact');
    expect(parsed.result).toContain('所有階段已完成');
  });

  test('最後 stage 完成後 timeline 不包含 session:compact-suggestion 事件', () => {
    const events = readTimeline(SESSION_LAST);
    const suggestionEvent = events.find(e => e.type === 'session:compact-suggestion');
    expect(suggestionEvent).toBeUndefined();
  });
});

describe('Scenario 8：fail/reject → 不建議', () => {
  beforeAll(() => {
    // 使用 TEST stage（tester agent），因為 parse-result 對 TEST stage 才會解析 FAIL
    setupWorkflow(SESSION_FAIL, ['TEST', 'DEV', 'REVIEW', 'TEST', 'RETRO', 'DOCS'], []);
    stateLib.updateStage(SESSION_FAIL, 'TEST', { status: 'active', result: null });
  });

  test('agent 結果為 fail 時不建議 compact', () => {
    const transcriptPath = createTranscript('fail-stage.jsonl', 6_000_000);
    // 用結構化 VERDICT 確保解析為 fail
    const result = runOnStop({
      session_id: SESSION_FAIL,
      agent_type: 'ot:tester',
      last_assistant_message: '<!-- VERDICT: {"result": "FAIL"} -->',
      transcript_path: transcriptPath,
    }, {
      OVERTONE_COMPACT_THRESHOLD_MB: '1',
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.result).not.toContain('建議在繼續下一個 stage 前執行 /compact');
  });
});
