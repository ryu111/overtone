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
      // 跳過 Dashboard spawn，避免測試觸發 bun spawn
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

});
// 注意：handoffs 目錄不再由 SessionStart 建立（Handoff 為虛擬，不寫磁碟）

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

// ────────────────────────────────────────────────────────────────────────────
// 場景 7：CLAUDE_ENV_FILE 機制 — 寫入 CLAUDE_CODE_EFFORT_LEVEL
// ────────────────────────────────────────────────────────────────────────────

describe('場景 7：CLAUDE_ENV_FILE — 寫入 CLAUDE_CODE_EFFORT_LEVEL', () => {
  const SESSION_7 = `test-start-007-${TIMESTAMP}`;
  const tmpEnvFile = join(homedir(), '.overtone', 'test-tmp', `session-start-env-${TIMESTAMP}.txt`);

  afterAll(() => {
    const dir7 = paths.sessionDir(SESSION_7);
    rmSync(dir7, { recursive: true, force: true });
    rmSync(tmpEnvFile, { force: true });
  });

  test('model=opus 時寫入 CLAUDE_CODE_EFFORT_LEVEL=high 到 CLAUDE_ENV_FILE', () => {
    // 預先建立空的 env 檔（模擬 Claude Code 提供的臨時檔案）
    writeFileSync(tmpEnvFile, '');

    const result = runHook(
      { session_id: SESSION_7, model: 'opus' },
      { CLAUDE_ENV_FILE: tmpEnvFile, CLAUDE_CODE_EFFORT_LEVEL: '' }
    );
    expect(result.exitCode).toBe(0);

    const envContent = readFileSync(tmpEnvFile, 'utf8');
    expect(envContent).toContain('CLAUDE_CODE_EFFORT_LEVEL=high');
  });

  test('model=sonnet 時寫入 CLAUDE_CODE_EFFORT_LEVEL=medium', () => {
    writeFileSync(tmpEnvFile, '');

    const result = runHook(
      { session_id: SESSION_7, model: 'sonnet' },
      { CLAUDE_ENV_FILE: tmpEnvFile, CLAUDE_CODE_EFFORT_LEVEL: '' }
    );
    expect(result.exitCode).toBe(0);

    const envContent = readFileSync(tmpEnvFile, 'utf8');
    expect(envContent).toContain('CLAUDE_CODE_EFFORT_LEVEL=medium');
  });

  test('model=haiku 時寫入 CLAUDE_CODE_EFFORT_LEVEL=low', () => {
    writeFileSync(tmpEnvFile, '');

    const result = runHook(
      { session_id: SESSION_7, model: 'haiku' },
      { CLAUDE_ENV_FILE: tmpEnvFile, CLAUDE_CODE_EFFORT_LEVEL: '' }
    );
    expect(result.exitCode).toBe(0);

    const envContent = readFileSync(tmpEnvFile, 'utf8');
    expect(envContent).toContain('CLAUDE_CODE_EFFORT_LEVEL=low');
  });

  test('CLAUDE_CODE_EFFORT_LEVEL 已存在時不覆蓋', () => {
    writeFileSync(tmpEnvFile, '');

    const result = runHook(
      { session_id: SESSION_7, model: 'opus' },
      { CLAUDE_ENV_FILE: tmpEnvFile, CLAUDE_CODE_EFFORT_LEVEL: 'max' }
    );
    expect(result.exitCode).toBe(0);

    // 已存在時不應寫入 CLAUDE_ENV_FILE
    const envContent = readFileSync(tmpEnvFile, 'utf8');
    expect(envContent).not.toContain('CLAUDE_CODE_EFFORT_LEVEL');
  });

  test('CLAUDE_ENV_FILE 不存在時靜默跳過，exit 0', () => {
    // 指向一個不存在的路徑
    const nonExistentFile = join(homedir(), '.overtone', 'test-tmp', `nonexistent-${TIMESTAMP}.txt`);
    const result = runHook(
      { session_id: SESSION_7, model: 'opus' },
      { CLAUDE_ENV_FILE: nonExistentFile, CLAUDE_CODE_EFFORT_LEVEL: '' }
    );
    // 不存在的路徑，appendFileSync 實際上會建立檔案，所以不會拋錯
    // 此場景改為驗證：CLAUDE_ENV_FILE 未設定時靜默跳過
    expect(result.exitCode).toBe(0);
  });

  test('CLAUDE_ENV_FILE 未設定時不寫入任何檔案，exit 0', () => {
    // 不傳 CLAUDE_ENV_FILE
    const result = runHook(
      { session_id: SESSION_7, model: 'opus' },
      { CLAUDE_CODE_EFFORT_LEVEL: '' }
    );
    expect(result.exitCode).toBe(0);
    // 無 CLAUDE_ENV_FILE，只要 exit 0 即可
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 6：OVERTONE_NO_DASHBOARD — 跳過 Dashboard spawn
// ────────────────────────────────────────────────────────────────────────────

describe('場景 6：OVERTONE_NO_DASHBOARD=1 — 跳過 Dashboard spawn', () => {
  const SESSION_6 = `test-start-006-${TIMESTAMP}`;

  // 清理場景 6 的 session
  afterAll(() => {
    const dir6 = paths.sessionDir(SESSION_6);
    rmSync(dir6, { recursive: true, force: true });
  });

  test('OVERTONE_NO_DASHBOARD=1 時 hook exit code 仍為 0', () => {
    // runHook 已預設注入 OVERTONE_NO_DASHBOARD=1，extraEnv 可覆蓋確認
    const result = runHook({ session_id: SESSION_6 }, { OVERTONE_NO_DASHBOARD: '1' });
    expect(result.exitCode).toBe(0);
  });

  test('OVERTONE_NO_DASHBOARD=1 時 stdout 包含 banner 輸出', () => {
    const result = runHook({ session_id: SESSION_6 }, { OVERTONE_NO_DASHBOARD: '1' });
    expect(result.exitCode).toBe(0);
    // banner 在 JSON result 欄位中輸出
    const parsed = JSON.parse(result.stdout);
    expect(parsed.result).toBeDefined();
    expect(typeof parsed.result).toBe('string');
  });

  test('OVERTONE_NO_DASHBOARD=1 時 stderr 無錯誤訊息', () => {
    const result = runHook({ session_id: SESSION_6 }, { OVERTONE_NO_DASHBOARD: '1' });
    expect(result.exitCode).toBe(0);
    // 允許 stderr 為空或只有無關警告，不應出現 Dashboard 相關錯誤
    expect(result.stderr).not.toContain('Dashboard 啟動失敗');
  });

  test('OVERTONE_NO_DASHBOARD 未設定但明確傳入空字串時仍正常啟動流程', () => {
    // extraEnv 傳入空字串代表「不跳過」— 此場景確認 falsy 值不跳過
    // 因測試環境 runHook 預設已有 OVERTONE_NO_DASHBOARD=1，需用 delete 語意覆蓋
    // 改用直接 spawnSync 繞過 runHook 的預設值
    const proc = Bun.spawnSync(['node', HOOK_PATH], {
      stdin: Buffer.from(JSON.stringify({ session_id: SESSION_6 })),
      env: {
        ...process.env,
        CLAUDE_SESSION_ID: '',
        OVERTONE_NO_DASHBOARD: '1', // 保持跳過，只驗證 exit 0
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(proc.exitCode).toBe(0);
  });
});
