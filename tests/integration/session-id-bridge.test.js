// @sequential
'use strict';
/**
 * session-id-bridge.test.js — Session ID 橋接機制整合測試
 *
 * 驗證：
 *   1. on-submit.js 將 sessionId 寫入 ~/.overtone/.current-session-id
 *   2. init-workflow.js 在未傳入 sessionId 時從共享文件讀取 fallback
 */

const { test, expect, describe, beforeEach, afterEach } = require('bun:test');
const {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} = require('fs');
const os = require('os');
const path = require('path');
const { SCRIPTS_LIB, SCRIPTS_DIR, HOOKS_DIR, PROJECT_ROOT } = require('../helpers/paths');

// ── 路徑常數 ──

const pathsMod = require(path.join(SCRIPTS_LIB, 'paths'));
const OVERTONE_HOME = path.join(os.homedir(), '.overtone');
const CURRENT_SESSION_FILE = path.join(OVERTONE_HOME, '.current-session-id');
const PER_PROJECT_SESSION_FILE = pathsMod.currentSessionFile(PROJECT_ROOT);
const SESSIONS_DIR = path.join(OVERTONE_HOME, 'sessions');

// ── 工具函式 ──

/**
 * 執行 CLI 腳本，傳入環境變數和 cwd
 */
function runCLI(scriptPath, args, { cwd = PROJECT_ROOT, env = {} } = {}) {
  const result = Bun.spawnSync(['node', scriptPath, ...args], {
    cwd,
    env: { ...process.env, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    exitCode: result.exitCode,
  };
}

// ── 測試 A：init-workflow.js 從 .current-session-id 讀取 fallback ──

describe('Session ID Bridge — init-workflow.js fallback 讀取', () => {
  const testSessionId = `test-session-${Date.now()}`;
  const sessionDir = path.join(SESSIONS_DIR, testSessionId);

  beforeEach(() => {
    // 確保 ~/.overtone 目錄存在
    mkdirSync(OVERTONE_HOME, { recursive: true });
  });

  afterEach(() => {
    // 清理：移除測試生成的 session 目錄
    try {
      if (existsSync(sessionDir)) {
        rmSync(sessionDir, { recursive: true, force: true });
      }
    } catch { /* 忽略清理錯誤 */ }

    // 清理 per-project .current-session-id（若我們寫入了）
    try {
      if (existsSync(PER_PROJECT_SESSION_FILE)) {
        const current = readFileSync(PER_PROJECT_SESSION_FILE, 'utf8').trim();
        if (current === testSessionId) {
          rmSync(PER_PROJECT_SESSION_FILE, { force: true });
        }
      }
    } catch { /* 忽略清理錯誤 */ }
    // 清理舊全域文件（若存在）
    try {
      if (existsSync(CURRENT_SESSION_FILE)) {
        const current = readFileSync(CURRENT_SESSION_FILE, 'utf8').trim();
        if (current === testSessionId) {
          rmSync(CURRENT_SESSION_FILE, { force: true });
        }
      }
    } catch { /* 忽略清理錯誤 */ }
  });

  test('寫入假 session ID 後執行 init-workflow.js（無 sessionId 參數）應成功讀取', () => {
    // 寫入假 session ID 到 per-project 共享文件
    const dir = path.dirname(PER_PROJECT_SESSION_FILE);
    mkdirSync(dir, { recursive: true });
    writeFileSync(PER_PROJECT_SESSION_FILE, testSessionId, 'utf8');

    // 執行 init-workflow.js，不傳 sessionId（只傳 workflowType）
    const { stdout, stderr, exitCode } = runCLI(
      path.join(SCRIPTS_DIR, 'init-workflow.js'),
      ['quick'],  // 只傳 workflowType，不傳 sessionId
      { cwd: PROJECT_ROOT }
    );

    // 應成功初始化（exit code 0）
    expect(exitCode).toBe(0);

    // 輸出應包含工作流資訊
    expect(stdout).toContain('quick');
    expect(stdout).toContain('DEV');

    // workflow.json 現在寫在 workflow-level 路徑下，先從 active-workflow-id 讀取 workflowId
    const activeWfIdPath = path.join(sessionDir, 'active-workflow-id');
    expect(existsSync(activeWfIdPath)).toBe(true);
    const workflowId = readFileSync(activeWfIdPath, 'utf8').trim();
    const workflowPath = path.join(sessionDir, 'workflows', workflowId, 'workflow.json');
    expect(existsSync(workflowPath)).toBe(true);

    // 驗證 workflow.json 內容正確
    const wfData = JSON.parse(readFileSync(workflowPath, 'utf8'));
    expect(wfData.sessionId).toBe(testSessionId);
    expect(wfData.workflowType).toBe('quick');
    expect(wfData.stages).toBeDefined();
    expect(Object.keys(wfData.stages)).toContain('DEV');
  });

  test('.current-session-id 不存在時，fallback 從 sessions 目錄找最近 session', () => {
    // 先建立一個測試 session 目錄（確保 fallback 有東西可找）
    const testSessionId = `fallback-test-session-${Date.now()}`;
    const testSessionDir = path.join(SESSIONS_DIR, testSessionId);
    mkdirSync(testSessionDir, { recursive: true });

    let previousId = null;
    if (existsSync(PER_PROJECT_SESSION_FILE)) {
      previousId = readFileSync(PER_PROJECT_SESSION_FILE, 'utf8').trim();
      rmSync(PER_PROJECT_SESSION_FILE, { force: true });
    }
    // 也清理舊全域文件
    if (existsSync(CURRENT_SESSION_FILE)) rmSync(CURRENT_SESSION_FILE, { force: true });

    try {
      const { exitCode } = runCLI(
        path.join(SCRIPTS_DIR, 'init-workflow.js'),
        ['quick'],
        { cwd: PROJECT_ROOT }
      );
      // fallback 找到 testSessionDir → 成功初始化（exit 0）
      expect(exitCode).toBe(0);
    } finally {
      // 清理測試 session 和 workflow.json
      rmSync(testSessionDir, { recursive: true, force: true });
      if (previousId) {
        mkdirSync(path.dirname(PER_PROJECT_SESSION_FILE), { recursive: true });
        writeFileSync(PER_PROJECT_SESSION_FILE, previousId, 'utf8');
      }
    }
  });

  test('init-workflow.js 傳入明確 sessionId 時不需要 .current-session-id', () => {
    // 確保 .current-session-id 不存在（或有其他值）
    // 明確傳入 sessionId 應優先於共享文件
    const explicitSessionId = `explicit-session-${Date.now()}`;
    const explicitSessionDir = path.join(SESSIONS_DIR, explicitSessionId);

    try {
      const { stdout, exitCode } = runCLI(
        path.join(SCRIPTS_DIR, 'init-workflow.js'),
        ['single', explicitSessionId],  // 明確傳入 sessionId
        { cwd: PROJECT_ROOT }
      );

      expect(exitCode).toBe(0);
      expect(stdout).toContain('single');

      // workflow.json 現在寫在 workflow-level 路徑下，先從 active-workflow-id 讀取 workflowId
      const activeWfIdPath = path.join(explicitSessionDir, 'active-workflow-id');
      expect(existsSync(activeWfIdPath)).toBe(true);
      const workflowId = readFileSync(activeWfIdPath, 'utf8').trim();
      const workflowPath = path.join(explicitSessionDir, 'workflows', workflowId, 'workflow.json');
      expect(existsSync(workflowPath)).toBe(true);

      const wfData = JSON.parse(readFileSync(workflowPath, 'utf8'));
      expect(wfData.sessionId).toBe(explicitSessionId);
    } finally {
      // 清理
      try {
        if (existsSync(explicitSessionDir)) {
          rmSync(explicitSessionDir, { recursive: true, force: true });
        }
      } catch { /* 忽略 */ }
    }
  });
});

// ── 測試 B：CURRENT_SESSION_FILE 路徑在 paths.js 中已正確 export ──

describe('paths.js — session ID 路徑已正確 export', () => {
  test('CURRENT_SESSION_FILE（舊全域）應被 export 且指向正確路徑', () => {
    const paths = require(path.join(SCRIPTS_LIB, 'paths'));

    expect(paths.CURRENT_SESSION_FILE).toBeDefined();
    expect(paths.CURRENT_SESSION_FILE).toContain('.overtone');
    expect(paths.CURRENT_SESSION_FILE).toContain('.current-session-id');
  });

  test('currentSessionFile（per-project）應被 export 且回傳含 projectHash 的路徑', () => {
    const paths = require(path.join(SCRIPTS_LIB, 'paths'));

    expect(typeof paths.currentSessionFile).toBe('function');
    const result = paths.currentSessionFile('/tmp/test-project');
    expect(result).toContain('.overtone');
    expect(result).toContain('global');
    expect(result).toContain('.current-session-id');
  });

  test('OVERTONE_HOME 應被 export', () => {
    const paths = require(path.join(SCRIPTS_LIB, 'paths'));
    expect(paths.OVERTONE_HOME).toBeDefined();
    expect(paths.OVERTONE_HOME).toContain('.overtone');
  });
});

// ── 測試 C：on-submit.js sessionId 橋接邏輯驗證（邏輯層面）──

describe('on-submit.js — sessionId 橋接邏輯', () => {
  const bridgeSessionId = `bridge-test-${Date.now()}`;

  afterEach(() => {
    // 清理測試寫入的 per-project session ID
    try {
      if (existsSync(PER_PROJECT_SESSION_FILE)) {
        const current = readFileSync(PER_PROJECT_SESSION_FILE, 'utf8').trim();
        if (current === bridgeSessionId) {
          rmSync(PER_PROJECT_SESSION_FILE, { force: true });
        }
      }
    } catch { /* 忽略 */ }
  });

  test('on-submit.js 傳入 CLAUDE_SESSION_ID 環境變數時應寫入 per-project .current-session-id', () => {
    // 模擬 UserPromptSubmit hook 傳入的 stdin（on-submit.js 從 stdin 讀 hook input）
    const hookInput = JSON.stringify({
      user_prompt: '請幫我新增功能',
      cwd: PROJECT_ROOT,
    });

    // 執行 on-submit.js，傳入 CLAUDE_SESSION_ID 環境變數
    const proc = Bun.spawnSync(
      ['node', path.join(HOOKS_DIR, 'prompt', 'on-submit.js')],
      {
        cwd: PROJECT_ROOT,
        env: {
          ...process.env,
          CLAUDE_SESSION_ID: bridgeSessionId,
        },
        stdin: Buffer.from(hookInput),
        stdout: 'pipe',
        stderr: 'pipe',
      }
    );

    // on-submit.js 應成功執行（exit code 0）
    expect(proc.exitCode).toBe(0);

    // per-project .current-session-id 應包含我們傳入的 session ID
    expect(existsSync(PER_PROJECT_SESSION_FILE)).toBe(true);
    const writtenId = readFileSync(PER_PROJECT_SESSION_FILE, 'utf8').trim();
    expect(writtenId).toBe(bridgeSessionId);

    // stdout 應為有效的 JSON（systemMessage 格式）
    const output = JSON.parse(proc.stdout.toString());
    expect(output).toHaveProperty('systemMessage');
  });

  test('on-submit.js 未傳入 CLAUDE_SESSION_ID 時不應寫入 .current-session-id（靜默跳過）', () => {
    const hookInput = JSON.stringify({
      user_prompt: '請幫我新增功能',
      cwd: PROJECT_ROOT,
    });

    // 記錄執行前的文件狀態
    const beforeExists = existsSync(PER_PROJECT_SESSION_FILE);
    const beforeContent = beforeExists ? readFileSync(PER_PROJECT_SESSION_FILE, 'utf8').trim() : null;

    const proc = Bun.spawnSync(
      ['node', path.join(HOOKS_DIR, 'prompt', 'on-submit.js')],
      {
        cwd: PROJECT_ROOT,
        env: {
          ...process.env,
          CLAUDE_SESSION_ID: '',  // 空字串，模擬無 session ID
        },
        stdin: Buffer.from(hookInput),
        stdout: 'pipe',
        stderr: 'pipe',
      }
    );

    // 應成功執行（不因缺少 session ID 而崩潰）
    expect(proc.exitCode).toBe(0);

    // 文件內容不應改變（因為 sessionId 為空，不應寫入）
    if (beforeExists) {
      const afterContent = readFileSync(PER_PROJECT_SESSION_FILE, 'utf8').trim();
      expect(afterContent).toBe(beforeContent);
    }
    // 若文件不存在且 sessionId 為空，文件仍不應被建立
  });
});
