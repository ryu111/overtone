'use strict';
/**
 * cross-session-state.test.js — 跨 Session 狀態管理驗證整合測試
 *
 * 覆蓋以下兩個驗證面向：
 *   1. Loop Restart State Recovery
 *      驗證 Loop 系統在重啟後能正確讀取既有 loop state，
 *      以及 writeLoop/readLoop 的往返一致性
 *
 *   2. Compact-Count.json 精確度
 *      驗證 PreCompact hook 正確追蹤 auto/manual compact 計數，
 *      包含首次 compact、連續多次、不同 trigger 類型
 *
 * 測試策略：使用 Bun.spawnSync 執行真實 hook 子進程，
 * 同時搭配直接呼叫 lib API 驗證跨 session 狀態一致性。
 */

const { test, expect, describe, beforeAll, afterAll, beforeEach, afterEach } = require('bun:test');
const { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } = require('fs');
const { join } = require('path');
const { HOOKS_DIR, SCRIPTS_LIB } = require('../helpers/paths');

// ── 路徑設定 ──

const PRE_COMPACT_PATH = join(HOOKS_DIR, 'session', 'pre-compact.js');
const paths = require(join(SCRIPTS_LIB, 'paths'));
const stateLib = require(join(SCRIPTS_LIB, 'state'));
const loopLib = require(join(SCRIPTS_LIB, 'loop'));

// ── 時戳前綴，確保測試 session ID 唯一 ──

const TS = Date.now();

// ── 輔助函式 ──

/**
 * 執行 pre-compact.js hook 子進程
 * @param {object} input - stdin JSON
 * @param {object} extraEnv - 額外環境變數
 */
function runPreCompact(input, extraEnv = {}) {
  const proc = Bun.spawnSync(['node', PRE_COMPACT_PATH], {
    stdin: Buffer.from(JSON.stringify(input)),
    env: {
      ...process.env,
      CLAUDE_SESSION_ID: '',
      NOVA_NO_DASHBOARD: '1',
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
 * 讀取 compact-count.json
 * @param {string} sessionId
 * @returns {{ auto: number, manual: number } | null}
 */
function readCompactCount(sessionId) {
  try {
    const raw = readFileSync(paths.session.compactCount(sessionId), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════
// 1. Loop Restart State Recovery
// ══════════════════════════════════════════════════════════════════

describe('1. Loop Restart State Recovery — 跨 session 狀態讀取', () => {
  const SESSION_LOOP = `cs-loop-${TS}`;
  const SESSION_DIR = paths.sessionDir(SESSION_LOOP);

  beforeEach(() => {
    mkdirSync(SESSION_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(SESSION_DIR, { recursive: true, force: true });
  });

  test('預先寫入的 loop.json 可被 readLoop 正確讀取', () => {
    const loopData = {
      iteration: 7,
      stopped: false,
      consecutiveErrors: 2,
      startedAt: new Date().toISOString(),
    };
    writeFileSync(paths.session.loop(SESSION_LOOP), JSON.stringify(loopData, null, 2), 'utf8');

    const result = loopLib.readLoop(SESSION_LOOP);
    expect(result.iteration).toBe(7);
    expect(result.stopped).toBe(false);
    expect(result.consecutiveErrors).toBe(2);
  });

  test('writeLoop + readLoop 往返一致（所有欄位完整保留）', () => {
    const originalData = {
      iteration: 12,
      stopped: false,
      consecutiveErrors: 0,
      startedAt: '2026-03-01T10:00:00.000Z',
      stopReason: undefined,
    };
    loopLib.writeLoop(SESSION_LOOP, originalData);
    const readBack = loopLib.readLoop(SESSION_LOOP);

    expect(readBack.iteration).toBe(12);
    expect(readBack.stopped).toBe(false);
    expect(readBack.consecutiveErrors).toBe(0);
    expect(readBack.startedAt).toBe('2026-03-01T10:00:00.000Z');
  });

  test('loop.json 不存在時 readLoop 自動初始化並回傳正確預設值', () => {
    const result = loopLib.readLoop(SESSION_LOOP);
    expect(result.iteration).toBe(0);
    expect(result.stopped).toBe(false);
    expect(result.consecutiveErrors).toBe(0);
    expect(typeof result.startedAt).toBe('string');
    expect(existsSync(paths.session.loop(SESSION_LOOP))).toBe(true);
  });

  test('stopped=true 的既有 loop 狀態被 readLoop 正確讀回', () => {
    const stoppedData = {
      iteration: 5,
      stopped: true,
      consecutiveErrors: 0,
      startedAt: new Date().toISOString(),
      stoppedAt: new Date().toISOString(),
      stopReason: '工作流完成',
    };
    loopLib.writeLoop(SESSION_LOOP, stoppedData);
    const result = loopLib.readLoop(SESSION_LOOP);

    expect(result.stopped).toBe(true);
    expect(result.stopReason).toBe('工作流完成');
    expect(result.stoppedAt).toBeDefined();
  });

  test('exitLoop 設定 stopped=true 並寫回 loop.json', () => {
    const loopData = {
      iteration: 3,
      stopped: false,
      consecutiveErrors: 0,
      startedAt: new Date().toISOString(),
    };
    loopLib.writeLoop(SESSION_LOOP, loopData);
    loopLib.exitLoop(SESSION_LOOP, loopData, '測試完成');

    expect(loopData.stopped).toBe(true);
    expect(loopData.stopReason).toBe('測試完成');

    const savedData = loopLib.readLoop(SESSION_LOOP);
    expect(savedData.stopped).toBe(true);
    expect(savedData.stopReason).toBe('測試完成');
    expect(typeof savedData.stoppedAt).toBe('string');
  });

  test('writeLoop 使用 atomic write，不留殘餘 .tmp 檔案', () => {
    loopLib.writeLoop(SESSION_LOOP, { iteration: 0, stopped: false });
    const files = require('fs').readdirSync(SESSION_DIR);
    const tmpFiles = files.filter(f => f.endsWith('.tmp'));
    expect(tmpFiles.length).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// 2. Compact-Count.json 精確度
// ══════════════════════════════════════════════════════════════════

describe('2. Compact-Count.json 精確度', () => {
  const SESSION_COUNT_AUTO    = `cs-count-auto-${TS}`;
  const SESSION_COUNT_MANUAL  = `cs-count-manual-${TS}`;
  const SESSION_COUNT_MIXED   = `cs-count-mixed-${TS}`;
  const SESSION_COUNT_MULTI   = `cs-count-multi-${TS}`;

  beforeAll(() => {
    for (const sid of [SESSION_COUNT_AUTO, SESSION_COUNT_MANUAL, SESSION_COUNT_MIXED, SESSION_COUNT_MULTI]) {
      stateLib.initState(sid, 'single', ['DEV']);
    }
  });

  afterAll(() => {
    for (const sid of [SESSION_COUNT_AUTO, SESSION_COUNT_MANUAL, SESSION_COUNT_MIXED, SESSION_COUNT_MULTI]) {
      rmSync(paths.sessionDir(sid), { recursive: true, force: true });
    }
  });

  test('首次 trigger=auto compact 後 compact-count.json 存在且 auto=1', () => {
    const result = runPreCompact({ session_id: SESSION_COUNT_AUTO, trigger: 'auto' });
    expect(result.exitCode).toBe(0);

    const countData = readCompactCount(SESSION_COUNT_AUTO);
    expect(countData).not.toBeNull();
    expect(countData.auto).toBe(1);
    expect(countData.manual).toBe(0);
  });

  test('首次 trigger=manual compact 後 compact-count.json auto=0, manual=1', () => {
    const result = runPreCompact({ session_id: SESSION_COUNT_MANUAL, trigger: 'manual' });
    expect(result.exitCode).toBe(0);

    const countData = readCompactCount(SESSION_COUNT_MANUAL);
    expect(countData).not.toBeNull();
    expect(countData.auto).toBe(0);
    expect(countData.manual).toBe(1);
  });

  test('無 trigger 欄位時計為 auto', () => {
    const result = runPreCompact({ session_id: SESSION_COUNT_MIXED });
    expect(result.exitCode).toBe(0);

    const countData = readCompactCount(SESSION_COUNT_MIXED);
    expect(countData).not.toBeNull();
    expect(countData.auto).toBe(1);
    expect(countData.manual).toBe(0);
  });

  test('連續 3 次 auto compact 後 auto count 累積為 3', () => {
    runPreCompact({ session_id: SESSION_COUNT_MULTI, trigger: 'auto' });
    runPreCompact({ session_id: SESSION_COUNT_MULTI, trigger: 'auto' });
    runPreCompact({ session_id: SESSION_COUNT_MULTI, trigger: 'auto' });

    const countData = readCompactCount(SESSION_COUNT_MULTI);
    expect(countData).not.toBeNull();
    expect(countData.auto).toBe(3);
    expect(countData.manual).toBe(0);
  });

  test('2 auto + 1 manual compact 後 auto=2, manual=1', () => {
    const SESSION_MIX2 = `cs-count-mix2-${TS}`;
    stateLib.initState(SESSION_MIX2, 'single', ['DEV']);
    try {
      runPreCompact({ session_id: SESSION_MIX2, trigger: 'auto' });
      runPreCompact({ session_id: SESSION_MIX2, trigger: 'auto' });
      runPreCompact({ session_id: SESSION_MIX2, trigger: 'manual' });

      const countData = readCompactCount(SESSION_MIX2);
      expect(countData).not.toBeNull();
      expect(countData.auto).toBe(2);
      expect(countData.manual).toBe(1);
    } finally {
      rmSync(paths.sessionDir(SESSION_MIX2), { recursive: true, force: true });
    }
  });

  test('compact-count.json 位於 ~/.nova/sessions/{sessionId}/compact-count.json', () => {
    const SESSION_PATH_CHECK = `cs-count-path-${TS}`;
    stateLib.initState(SESSION_PATH_CHECK, 'single', ['DEV']);
    try {
      runPreCompact({ session_id: SESSION_PATH_CHECK, trigger: 'auto' });
      const expectedPath = paths.session.compactCount(SESSION_PATH_CHECK);
      expect(existsSync(expectedPath)).toBe(true);
    } finally {
      rmSync(paths.sessionDir(SESSION_PATH_CHECK), { recursive: true, force: true });
    }
  });
});
