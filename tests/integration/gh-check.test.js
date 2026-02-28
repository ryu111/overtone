'use strict';
/**
 * gh-check.test.js — on-start.js 的 gh CLI 偵測邏輯整合測試
 *
 * 驗證 SessionStart hook 的 gh CLI 偵測三個場景：
 *   1. gh 未安裝時：banner 不包含 gh 相關訊息（靜默跳過）
 *   2. gh 已安裝且已認證：banner 顯示「已安裝且已認證」
 *   3. gh 已安裝但未認證：banner 顯示「已安裝但未認證」提示
 */

const { test, expect, describe, afterAll } = require('bun:test');
const { rmSync } = require('fs');
const { join } = require('path');
const { HOOKS_DIR, SCRIPTS_LIB } = require('../helpers/paths');

// ── 路徑設定 ──

const HOOK_PATH = join(HOOKS_DIR, 'session', 'on-start.js');
const paths = require(join(SCRIPTS_LIB, 'paths'));

const TIMESTAMP = Date.now();
const SESSION_GH_1 = `test-gh-001-${TIMESTAMP}`;
const SESSION_GH_2 = `test-gh-002-${TIMESTAMP}`;
const SESSION_GH_3 = `test-gh-003-${TIMESTAMP}`;

// ── 輔助函式 ──

/**
 * 執行 on-start.js hook，允許注入自訂 PATH 來 mock 指令可用性
 * @param {object} input - stdin JSON 輸入
 * @param {Record<string, string>} extraEnv - 額外環境變數
 * @returns {{ exitCode: number, stdout: string, stderr: string }}
 */
function runHook(input, extraEnv = {}) {
  const proc = Bun.spawnSync(['node', HOOK_PATH], {
    stdin: Buffer.from(JSON.stringify(input)),
    env: {
      ...process.env,
      CLAUDE_SESSION_ID: '',
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
 * 從 hook stdout JSON 取出 banner 文字
 * @param {string} stdout
 * @returns {string}
 */
function parseBanner(stdout) {
  try {
    const output = JSON.parse(stdout);
    return output.result || '';
  } catch {
    return stdout;
  }
}

// ── 清理 ──

afterAll(() => {
  for (const sessionId of [SESSION_GH_1, SESSION_GH_2, SESSION_GH_3]) {
    const dir = paths.sessionDir(sessionId);
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── mock 指令腳本路徑 ──
// 利用 PATH 前置注入 mock 腳本目錄來模擬 gh 的行為

const { mkdirSync, writeFileSync, chmodSync } = require('fs');
const { homedir } = require('os');

const MOCK_BIN_DIR = join(homedir(), '.overtone', 'test-tmp', `gh-mock-bin-${TIMESTAMP}`);

afterAll(() => {
  rmSync(MOCK_BIN_DIR, { recursive: true, force: true });
});

/**
 * 建立 mock `gh` 腳本
 * @param {'not-installed' | 'installed-authed' | 'installed-not-authed'} scenario
 */
function setupMockGh(scenario) {
  mkdirSync(MOCK_BIN_DIR, { recursive: true });

  if (scenario === 'not-installed') {
    // 移除 gh（若存在），讓 which gh 失敗
    // 透過 PATH 限制：只放一個不含 gh 的 mock bin 目錄
    // 不建立 gh 腳本即可
    return;
  }

  const ghPath = join(MOCK_BIN_DIR, 'gh');

  if (scenario === 'installed-authed') {
    // gh 存在，auth status 回傳 exit 0
    writeFileSync(ghPath, '#!/bin/sh\nexit 0\n');
  } else if (scenario === 'installed-not-authed') {
    // gh 存在，auth status 回傳 exit 1
    writeFileSync(ghPath, [
      '#!/bin/sh',
      'if [ "$1" = "auth" ] && [ "$2" = "status" ]; then',
      '  exit 1',
      'fi',
      'exit 0',
    ].join('\n'));
  }

  chmodSync(ghPath, 0o755);
}

/**
 * 建立 mock `which` 腳本
 * - 若 scenario 為 'not-installed'：which gh 回傳 exit 1
 * - 其他：回傳 exit 0
 */
function setupMockWhich(scenario) {
  mkdirSync(MOCK_BIN_DIR, { recursive: true });
  const whichPath = join(MOCK_BIN_DIR, 'which');

  if (scenario === 'not-installed') {
    writeFileSync(whichPath, [
      '#!/bin/sh',
      '# mock which：gh 未安裝，回傳 exit 1',
      'if [ "$1" = "gh" ]; then',
      '  exit 1',
      'fi',
      '# 其他指令委派真實 which',
      'command -v "$1" 2>/dev/null',
    ].join('\n'));
  } else {
    writeFileSync(whichPath, [
      '#!/bin/sh',
      '# mock which：所有指令回傳 exit 0',
      'exit 0',
    ].join('\n'));
  }

  chmodSync(whichPath, 0o755);
}

// ────────────────────────────────────────────────────────────────────────────
// 場景 1：gh 未安裝時 — banner 不包含 gh 相關訊息
// ────────────────────────────────────────────────────────────────────────────

describe('場景 1：gh 未安裝 — banner 靜默跳過', () => {
  test('setup: 建立 mock which（gh 回傳 exit 1）', () => {
    setupMockWhich('not-installed');
    // 不建立 gh mock，確認 which gh 會失敗
  });

  test('hook exit code 為 0（不因缺少 gh 而失敗）', () => {
    const mockPath = `${MOCK_BIN_DIR}:${process.env.PATH}`;
    const result = runHook(
      { session_id: SESSION_GH_1 },
      { PATH: mockPath }
    );
    expect(result.exitCode).toBe(0);
  });

  test('banner 不包含 gh CLI 相關訊息', () => {
    const mockPath = `${MOCK_BIN_DIR}:${process.env.PATH}`;
    const result = runHook(
      { session_id: SESSION_GH_1 },
      { PATH: mockPath }
    );
    const banner = parseBanner(result.stdout);
    // gh 未安裝時靜默跳過，banner 不應包含 gh 提示
    expect(banner).not.toContain('gh CLI');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 2：gh 已安裝且已認證 — banner 顯示「已安裝且已認證」
// ────────────────────────────────────────────────────────────────────────────

describe('場景 2：gh 已安裝且已認證 — banner 顯示認證狀態', () => {
  test('setup: 建立 mock gh（auth status 成功）', () => {
    setupMockWhich('installed-authed');
    setupMockGh('installed-authed');
  });

  test('hook exit code 為 0', () => {
    const mockPath = `${MOCK_BIN_DIR}:${process.env.PATH}`;
    const result = runHook(
      { session_id: SESSION_GH_2 },
      { PATH: mockPath }
    );
    expect(result.exitCode).toBe(0);
  });

  test('banner 包含 gh CLI 已安裝且已認證的訊息', () => {
    const mockPath = `${MOCK_BIN_DIR}:${process.env.PATH}`;
    const result = runHook(
      { session_id: SESSION_GH_2 },
      { PATH: mockPath }
    );
    const banner = parseBanner(result.stdout);
    expect(banner).toContain('gh CLI');
    expect(banner).toContain('已安裝且已認證');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 3：gh 已安裝但未認證 — banner 顯示警告和認證說明
// ────────────────────────────────────────────────────────────────────────────

describe('場景 3：gh 已安裝但未認證 — banner 顯示警告', () => {
  test('setup: 建立 mock gh（auth status 失敗）', () => {
    setupMockWhich('installed-not-authed');
    setupMockGh('installed-not-authed');
  });

  test('hook exit code 為 0（未認證不阻擋啟動）', () => {
    const mockPath = `${MOCK_BIN_DIR}:${process.env.PATH}`;
    const result = runHook(
      { session_id: SESSION_GH_3 },
      { PATH: mockPath }
    );
    expect(result.exitCode).toBe(0);
  });

  test('banner 包含 gh CLI 未認證的警告訊息', () => {
    const mockPath = `${MOCK_BIN_DIR}:${process.env.PATH}`;
    const result = runHook(
      { session_id: SESSION_GH_3 },
      { PATH: mockPath }
    );
    const banner = parseBanner(result.stdout);
    expect(banner).toContain('gh CLI');
    expect(banner).toContain('未認證');
  });

  test('banner 包含認證說明（gh auth login）', () => {
    const mockPath = `${MOCK_BIN_DIR}:${process.env.PATH}`;
    const result = runHook(
      { session_id: SESSION_GH_3 },
      { PATH: mockPath }
    );
    const banner = parseBanner(result.stdout);
    expect(banner).toContain('gh auth login');
  });
});
