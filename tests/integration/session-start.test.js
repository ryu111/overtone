'use strict';
/**
 * session-start.test.js — on-start.js hook 整合測試
 *
 * 驗證 SessionStart hook 的四個核心行為：
 *   1. 傳入有效 session_id 時 exit 0 並建立 session 目錄
 *   2. 建立目錄後向 timeline 寫入 session:start 事件
 *   3. 無 session_id 時靜默跳過，exit 0
 *   4. 有未完成 specs tasks 時，輸出含 systemMessage 的 pending tasks 提示
 */

const { test, expect, describe, afterAll } = require('bun:test');
const { existsSync, rmSync, readFileSync, mkdirSync, writeFileSync } = require('fs');
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
const SESSION_5 = `test-start-005-${TIMESTAMP}`;

// 用於場景 4 的暫存 feature 目錄（建在隔離的 tmp projectRoot 下）
const TMP_PROJECT_ROOT = join(homedir(), '.overtone', 'test-tmp', `session-start-${TIMESTAMP}`);
// 用於場景 5 的 projectRoot（需要寫入 workflow.json 到真實 session 目錄）
const TMP_PROJECT_ROOT_5 = join(homedir(), '.overtone', 'test-tmp', `session-start-5-${TIMESTAMP}`);
const TMP_FEATURE_NAME = 'pending-tasks-test';
const TMP_FEATURE_DIR = join(TMP_PROJECT_ROOT, 'specs', 'features', 'in-progress', TMP_FEATURE_NAME);

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
  // 清理場景 4, 5 的暫存 feature
  rmSync(TMP_PROJECT_ROOT, { recursive: true, force: true });
  rmSync(TMP_PROJECT_ROOT_5, { recursive: true, force: true });
  // 清理場景 5 的 session
  const stateLib = require(join(SCRIPTS_LIB, 'state'));
  const dir5 = paths.sessionDir(SESSION_5);
  rmSync(dir5, { recursive: true, force: true });
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

// ────────────────────────────────────────────────────────────────────────────
// 場景 4：有未完成 specs tasks 時，輸出含 systemMessage 的 pending tasks 提示
// ────────────────────────────────────────────────────────────────────────────

describe('場景 4：有未完成 tasks — 輸出 systemMessage', () => {
  test('setup: 建立暫存 in-progress feature 目錄及 tasks.md', () => {
    mkdirSync(TMP_FEATURE_DIR, { recursive: true });
    writeFileSync(join(TMP_FEATURE_DIR, 'tasks.md'), [
      '---',
      'feature: pending-tasks-test',
      'status: in-progress',
      'workflow: standard',
      '---',
      '',
      '## Tasks',
      '',
      '- [x] PLAN',
      '- [ ] ARCH',
      '- [ ] DEV',
    ].join('\n'));
    expect(existsSync(join(TMP_FEATURE_DIR, 'tasks.md'))).toBe(true);
  });

  test('hook 輸出 JSON 含 systemMessage 字段', () => {
    const result = runHook({ cwd: TMP_PROJECT_ROOT });
    expect(result.exitCode).toBe(0);

    const output = JSON.parse(result.stdout);
    expect(output.systemMessage).toBeDefined();
  });

  test('systemMessage 包含 feature 名稱', () => {
    const result = runHook({ cwd: TMP_PROJECT_ROOT });
    const output = JSON.parse(result.stdout);
    expect(output.systemMessage).toContain('pending-tasks-test');
  });

  test('systemMessage 包含未完成任務（ARCH、DEV）', () => {
    const result = runHook({ cwd: TMP_PROJECT_ROOT });
    const output = JSON.parse(result.stdout);
    expect(output.systemMessage).toContain('ARCH');
    expect(output.systemMessage).toContain('DEV');
  });

  test('systemMessage 不包含已完成任務（PLAN）', () => {
    const result = runHook({ cwd: TMP_PROJECT_ROOT });
    const output = JSON.parse(result.stdout);
    // PLAN 已完成，不應出現在未完成列表中
    // 注意：PLAN 出現在 feature 名稱統計行不算，要確認不在 checkbox 列表中
    const lines = output.systemMessage.split('\n');
    const checkboxLines = lines.filter(l => l.startsWith('- [ ]'));
    expect(checkboxLines.some(l => l.includes('PLAN'))).toBe(false);
  });

  test('所有任務完成時 hook 輸出不含 systemMessage', () => {
    // 建立另一個所有 checkbox 都勾選的 feature
    const allDoneFeatureName = 'all-done-feature';
    const allDoneFeatureDir = join(TMP_PROJECT_ROOT, 'specs', 'features', 'in-progress', allDoneFeatureName);
    // 注意：只能有一個 in-progress feature（getActiveFeature 取字母序第一個）
    // 先移除原本的 feature，建立全勾的 feature
    rmSync(TMP_FEATURE_DIR, { recursive: true, force: true });
    mkdirSync(allDoneFeatureDir, { recursive: true });
    writeFileSync(join(allDoneFeatureDir, 'tasks.md'), [
      '---',
      'feature: all-done-feature',
      'status: in-progress',
      'workflow: standard',
      '---',
      '',
      '## Tasks',
      '',
      '- [x] PLAN',
      '- [x] DEV',
    ].join('\n'));

    const result = runHook({ cwd: TMP_PROJECT_ROOT });
    expect(result.exitCode).toBe(0);

    const output = JSON.parse(result.stdout);
    // 全部完成時不應注入 systemMessage
    expect(output.systemMessage).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 5：有 active feature 且 workflow.json.featureName 為 null 時自動補寫
// ────────────────────────────────────────────────────────────────────────────

describe('場景 5：active feature 自動補寫 workflow.json.featureName', () => {
  const FEATURE_NAME_5 = 'auto-feature-name-test';
  const stateLib = require(join(SCRIPTS_LIB, 'state'));

  test('setup: 初始化 workflow.json（featureName 為 null）並建立 in-progress feature', () => {
    // 初始化 session 的 workflow.json（standard workflow 的 stage 列表）
    stateLib.initState(SESSION_5, 'standard', ['PLAN', 'ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST', 'RETRO', 'DOCS']);
    const ws = stateLib.readState(SESSION_5);
    expect(ws).toBeDefined();
    expect(ws.featureName).toBeNull();

    // 建立 active feature 目錄
    const featureDir = join(TMP_PROJECT_ROOT_5, 'specs', 'features', 'in-progress', FEATURE_NAME_5);
    mkdirSync(featureDir, { recursive: true });
    writeFileSync(join(featureDir, 'tasks.md'), [
      '---',
      `feature: ${FEATURE_NAME_5}`,
      'status: in-progress',
      'workflow: standard',
      '---',
      '',
      '## Tasks',
      '',
      '- [ ] PLAN',
      '- [ ] DEV',
    ].join('\n'));
    expect(existsSync(join(featureDir, 'tasks.md'))).toBe(true);
  });

  test('hook 執行後 workflow.json.featureName 已自動設置', () => {
    const result = runHook({ session_id: SESSION_5, cwd: TMP_PROJECT_ROOT_5 });
    expect(result.exitCode).toBe(0);

    const ws = stateLib.readState(SESSION_5);
    expect(ws.featureName).toBe(FEATURE_NAME_5);
  });

  test('workflow.json.featureName 已有值時不覆蓋', () => {
    // 設置一個不同的 featureName
    stateLib.setFeatureName(SESSION_5, 'existing-feature');
    const result = runHook({ session_id: SESSION_5, cwd: TMP_PROJECT_ROOT_5 });
    expect(result.exitCode).toBe(0);

    // 應保留原有值，不被 active feature 覆蓋
    const ws = stateLib.readState(SESSION_5);
    expect(ws.featureName).toBe('existing-feature');
  });
});
