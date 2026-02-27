'use strict';
/**
 * session-start.test.js — on-start.js hook 整合測試
 *
 * 驗證 SessionStart hook 的三個核心行為：
 *   1. 傳入有效 session_id 時 exit 0 並建立 session 目錄
 *   2. 建立目錄後向 timeline 寫入 session:start 事件
 *   3. 無 session_id 時靜默跳過，exit 0
 */

const { test, expect, describe, afterAll } = require('bun:test');
const { existsSync, rmSync, readFileSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const { HOOKS_DIR, SCRIPTS_LIB } = require('../helpers/paths');

// ── 路徑設定 ──

const HOOK_PATH = join(HOOKS_DIR, 'session', 'on-start.js');
const paths = require(join(SCRIPTS_LIB, 'paths'));

// 每個場景使用唯一 sessionId 避免衝突
const TIMESTAMP = Date.now();
const SESSION_1 = `test-start-001-${TIMESTAMP}`;
const SESSION_2 = `test-start-002-${TIMESTAMP}`;

// ── 輔助函式 ──

/**
 * 以同步方式執行 on-start.js hook 子進程
 * @param {object} input - stdin JSON 輸入（如 { session_id: "..." }）
 * @param {Record<string, string>} extraEnv - 額外環境變數
 * @returns {{ exitCode: number, stdout: string, stderr: string }}
 */
function runHook(input, extraEnv = {}) {
  const proc = Bun.spawnSync(['node', HOOK_PATH], {
    stdin: Buffer.from(JSON.stringify(input)),
    env: {
      ...process.env,
      // 清除 CLAUDE_SESSION_ID 避免干擾，各測試自行控制 session_id
      CLAUDE_SESSION_ID: '',
      // 跳過瀏覽器開啟，避免測試觸發 open 指令
      OVERTONE_NO_BROWSER: '1',
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

// ── 清理 ──

afterAll(() => {
  // 清理所有測試建立的 session 目錄
  for (const sessionId of [SESSION_1, SESSION_2]) {
    const dir = paths.sessionDir(sessionId);
    rmSync(dir, { recursive: true, force: true });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 1：傳入有效 session_id 時 hook exit 0 並建立 session 目錄
// ────────────────────────────────────────────────────────────────────────────

describe('場景 1：有效 session_id — exit 0 並建立 session 目錄', () => {
  test('hook exit code 為 0', () => {
    const result = runHook({ session_id: SESSION_1 });
    expect(result.exitCode).toBe(0);
  });

  test('session 根目錄已建立', () => {
    const sessionDir = paths.sessionDir(SESSION_1);
    expect(existsSync(sessionDir)).toBe(true);
  });

  test('handoffs 子目錄已建立', () => {
    const handoffsDir = paths.session.handoffsDir(SESSION_1);
    expect(existsSync(handoffsDir)).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 2：hook 在建立目錄後向 timeline 寫入 session:start 事件
// ────────────────────────────────────────────────────────────────────────────

describe('場景 2：timeline 寫入 session:start 事件', () => {
  test('timeline.jsonl 包含 session:start 事件', () => {
    // SESSION_2 尚未被建立，執行 hook 觸發初始化
    const result = runHook({ session_id: SESSION_2 });
    expect(result.exitCode).toBe(0);

    const timelinePath = paths.session.timeline(SESSION_2);
    expect(existsSync(timelinePath)).toBe(true);

    // 讀取 timeline.jsonl 並解析所有事件
    const lines = readFileSync(timelinePath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean);

    const events = lines.map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);

    // 找到 session:start 事件
    const startEvent = events.find((e) => e.type === 'session:start');
    expect(startEvent).toBeDefined();
    expect(startEvent.type).toBe('session:start');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 3：無 session_id 時 hook 靜默跳過，exit 0
// ────────────────────────────────────────────────────────────────────────────

describe('場景 3：無 session_id — 靜默跳過，exit 0', () => {
  test('空 stdin {} 且無 CLAUDE_SESSION_ID 時 exit code 為 0', () => {
    // 移除 CLAUDE_SESSION_ID，確保無任何 session 資訊
    const { CLAUDE_SESSION_ID: _removed, ...envWithoutSession } = process.env;
    const proc = Bun.spawnSync(['node', HOOK_PATH], {
      stdin: Buffer.from(JSON.stringify({})),
      env: envWithoutSession,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(proc.exitCode).toBe(0);
  });
});
