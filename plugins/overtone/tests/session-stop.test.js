'use strict';
/**
 * session-stop.test.js — Stop hook 整合測試
 *
 * 測試 hooks/scripts/session/on-stop.js 的核心路徑：
 *   - 有未完成 stages → block（decision: 'block'）
 *   - 手動停止（loop.stopped = true）→ 允許退出
 *   - 無 sessionId → 直接允許退出
 *   - Specs archive 整合：workflow 完成且有 featureName → 自動歸檔
 *
 * 策略：使用 Bun.spawn 執行真實 Stop hook 子進程，傳入 stdin + 環境變數驗證行為。
 */

const { test, expect, describe, afterAll } = require('bun:test');
const { mkdirSync, rmSync, existsSync } = require('fs');
const { join } = require('path');
const os = require('os');

// ── 路徑設定 ──

const HOOK_PATH = join(
  __dirname,
  '../hooks/scripts/session/on-stop.js'
);

const PATHS_LIB_PATH = join(__dirname, '../scripts/lib/paths');
const STATE_LIB_PATH = join(__dirname, '../scripts/lib/state');
const LOOP_LIB_PATH  = join(__dirname, '../scripts/lib/loop');

const paths = require(PATHS_LIB_PATH);
const state = require(STATE_LIB_PATH);
const loop  = require(LOOP_LIB_PATH);

// ── 輔助函式 ──

/**
 * 執行 Stop hook，回傳原始輸出文字與 exit code
 * @param {object} input - hook 的 stdin 輸入（stop_reason, cwd 等）
 * @param {string|undefined} sessionId - CLAUDE_SESSION_ID 環境變數
 * @returns {Promise<{ output: string, exitCode: number }>}
 */
async function runStopHook(input, sessionId) {
  const envConfig = sessionId !== undefined
    ? { ...process.env, CLAUDE_SESSION_ID: sessionId }
    : (() => { const e = { ...process.env }; delete e.CLAUDE_SESSION_ID; return e; })();

  const proc = Bun.spawn(['node', HOOK_PATH], {
    stdin: Buffer.from(JSON.stringify(input)),
    env: envConfig,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  return { output, exitCode };
}

// ── 各測試的獨立 sessionId ──

const SESSION_PREFIX = `test_session_stop_${Date.now()}`;
let testCounter = 0;

function newSessionId() {
  return `${SESSION_PREFIX}_${++testCounter}`;
}

// ── 清理所有測試 session ──

const createdSessions = [];

afterAll(() => {
  for (const sid of createdSessions) {
    const dir = paths.sessionDir(sid);
    rmSync(dir, { recursive: true, force: true });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 1：無 sessionId → 直接允許退出
// ────────────────────────────────────────────────────────────────────────────

describe('Stop hook 場景 1：無 sessionId → 允許退出', () => {
  test('未設 CLAUDE_SESSION_ID → 輸出不含 block，exitCode 為 0', async () => {
    const { output, exitCode } = await runStopHook(
      { stop_reason: 'end_turn' },
      undefined
    );

    const parsed = JSON.parse(output);
    // 沒有 decision: 'block'
    expect(parsed.decision).not.toBe('block');
    expect(exitCode).toBe(0);
  });

  test('CLAUDE_SESSION_ID 為空字串 → 輸出不含 block，exitCode 為 0', async () => {
    const { output, exitCode } = await runStopHook(
      { stop_reason: 'end_turn' },
      ''
    );

    const parsed = JSON.parse(output);
    expect(parsed.decision).not.toBe('block');
    expect(exitCode).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 2：有未完成 stages → block
// ────────────────────────────────────────────────────────────────────────────

describe('Stop hook 場景 2：有未完成 stages → block', () => {
  test('quick workflow DEV 尚未完成 → decision: block', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    // quick workflow：DEV 設為 pending（未完成）
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW', 'TEST', 'RETRO']);

    const { output, exitCode } = await runStopHook(
      { stop_reason: 'end_turn', cwd: '' },
      sessionId
    );

    const parsed = JSON.parse(output);
    // 應 block
    expect(parsed.decision).toBe('block');
    // reason 中應包含進度提示
    expect(parsed.reason).toBeTruthy();
    expect(exitCode).toBe(0);
  });

  test('部分 stages 完成（DEV done，REVIEW pending）→ decision: block', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW', 'TEST', 'RETRO']);
    state.updateStateAtomic(sessionId, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      return s;
    });

    const { output, exitCode } = await runStopHook(
      { stop_reason: 'end_turn', cwd: '' },
      sessionId
    );

    const parsed = JSON.parse(output);
    expect(parsed.decision).toBe('block');
    expect(exitCode).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 3：手動停止（loop.stopped = true）→ 允許退出
// ────────────────────────────────────────────────────────────────────────────

describe('Stop hook 場景 3：手動停止 → 允許退出', () => {
  test('loop.stopped = true → 不 block，result 含 🛑', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    // 初始化 workflow（有未完成 stages）
    state.initState(sessionId, 'quick', ['DEV', 'REVIEW', 'TEST', 'RETRO']);

    // 設定 loop.stopped = true（模擬 /ot:stop）
    const loopState = loop.readLoop(sessionId);
    loopState.stopped = true;
    loop.writeLoop(sessionId, loopState);

    const { output, exitCode } = await runStopHook(
      { stop_reason: 'end_turn', cwd: '' },
      sessionId
    );

    const parsed = JSON.parse(output);
    // 不應 block
    expect(parsed.decision).not.toBe('block');
    // result 應包含手動停止的 🛑 提示
    expect(parsed.result).toContain('🛑');
    expect(exitCode).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 4：所有 stages 完成 → 允許退出並顯示完成摘要
// ────────────────────────────────────────────────────────────────────────────

describe('Stop hook 場景 4：所有 stages 完成 → 允許退出', () => {
  test('single workflow DEV 完成 → 不 block，result 含 🎉', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'single', ['DEV']);
    state.updateStateAtomic(sessionId, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      return s;
    });

    const { output, exitCode } = await runStopHook(
      { stop_reason: 'end_turn', cwd: '' },
      sessionId
    );

    const parsed = JSON.parse(output);
    // 不應 block
    expect(parsed.decision).not.toBe('block');
    // result 應含完成摘要
    expect(parsed.result).toContain('🎉');
    expect(exitCode).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 5：無 workflow 狀態 → 允許退出
// ────────────────────────────────────────────────────────────────────────────

describe('Stop hook 場景 5：無 workflow 狀態 → 允許退出', () => {
  test('sessionId 存在但無 workflow.json → 不 block', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    // 建立 session 目錄但不初始化 workflow
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });

    const { output, exitCode } = await runStopHook(
      { stop_reason: 'end_turn', cwd: '' },
      sessionId
    );

    const parsed = JSON.parse(output);
    expect(parsed.decision).not.toBe('block');
    expect(exitCode).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 6：Specs archive 整合 — workflow 完成且有 featureName → 自動歸檔
// ────────────────────────────────────────────────────────────────────────────

// 輔助：建立臨時專案根目錄（含 specs feature 結構）
const { mkdtempSync } = require('fs');
const specs = require('../scripts/lib/specs');

// 收集需清理的臨時目錄
const createdTmpDirs = [];

afterAll(() => {
  for (const d of createdTmpDirs) {
    rmSync(d, { recursive: true, force: true });
  }
});

describe('Stop hook 場景 6：Specs archive 整合', () => {
  test('workflow 完成且有 featureName → specs feature 自動歸檔', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    // 建立臨時專案根目錄並初始化 specs feature
    const projectRoot = mkdtempSync(join(os.tmpdir(), 'overtone-stop-specs-'));
    createdTmpDirs.push(projectRoot);
    specs.initFeatureDir(projectRoot, 'my-feature', 'single');

    const inProgressPath = specs.featurePath(projectRoot, 'my-feature');
    expect(existsSync(inProgressPath)).toBe(true);

    // 初始化 single workflow（DEV）並標記完成
    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'single', ['DEV'], { featureName: 'my-feature' });
    state.updateStateAtomic(sessionId, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      return s;
    });

    const { output, exitCode } = await runStopHook(
      { stop_reason: 'end_turn', cwd: projectRoot },
      sessionId
    );

    const parsed = JSON.parse(output);
    // 應允許退出（workflow 完成）
    expect(parsed.decision).not.toBe('block');
    expect(exitCode).toBe(0);

    // specs feature 應已從 in-progress 移出（歸檔）
    expect(existsSync(inProgressPath)).toBe(false);
    // archive 目錄下應有歸檔目錄
    const archDir = specs.archiveDir(projectRoot);
    expect(existsSync(archDir)).toBe(true);
  });

  test('workflow 完成但 featureName 不存在於 in-progress → 仍允許退出（不 block）', async () => {
    const sessionId = newSessionId();
    createdSessions.push(sessionId);

    // 建立臨時專案根目錄但不建立 specs feature（模擬已手動移動的情況）
    const projectRoot = mkdtempSync(join(os.tmpdir(), 'overtone-stop-specs-nofeature-'));
    createdTmpDirs.push(projectRoot);

    mkdirSync(paths.sessionDir(sessionId), { recursive: true });
    state.initState(sessionId, 'single', ['DEV'], { featureName: 'missing-feature' });
    state.updateStateAtomic(sessionId, (s) => {
      s.stages['DEV'].status = 'completed';
      s.stages['DEV'].result = 'pass';
      return s;
    });

    const { output, exitCode } = await runStopHook(
      { stop_reason: 'end_turn', cwd: projectRoot },
      sessionId
    );

    const parsed = JSON.parse(output);
    // 歸檔失敗不阻擋退出
    expect(parsed.decision).not.toBe('block');
    expect(exitCode).toBe(0);
  });
});
