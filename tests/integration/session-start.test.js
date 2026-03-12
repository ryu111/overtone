'use strict';
/**
 * session-start.test.js — on-start.js hook 整合測試
 *
 * 驗證 SessionStart hook 的四個核心行為：
 *   1. 傳入有效 session_id 時 exit 0 並建立 session 目錄
 *   2. 建立目錄後向 timeline 寫入 session:start 事件
 *   3. 無 session_id 時靜默跳過，exit 0
 *   4. 有未完成 specs tasks 時，輸出含 systemMessage 的 pending tasks 提示
 *
 * 遷移策略（Humble Object）：
 *   - 場景 4：systemMessage 內容改用直接呼叫 buildPendingTasksMessage + buildStartOutput
 *   - 場景 6：banner 字串格式改用直接呼叫 buildBanner
 *   - 副作用場景（目錄建立、timeline 事件、state 修改）保留 spawn 測試
 */

const { test, expect, describe, afterAll, beforeAll } = require('bun:test');
const { existsSync, rmSync, readFileSync, mkdirSync, writeFileSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const { HOOKS_DIR, SCRIPTS_LIB } = require('../helpers/paths');

// ── 路徑設定 ──

const HOOK_PATH = join(HOOKS_DIR, 'session', 'on-start.js');
const paths = require(join(SCRIPTS_LIB, 'paths'));

// ── 純函數直接 require（Humble Object 模式）──
const { buildBanner, buildStartOutput } = require(join(HOOKS_DIR, 'session', 'on-start.js'));
const { buildPendingTasksMessage } = require(join(SCRIPTS_LIB, 'hook-utils'));

// 每個場景使用唯一 sessionId 避免衝突
const TIMESTAMP = Date.now();
const DEFAULT_CWD = process.cwd(); // spawn 的 projectRoot fallback
const SESSION_1 = `test-start-001-${TIMESTAMP}`;
const SESSION_2 = `test-start-002-${TIMESTAMP}`;
const SESSION_5 = `test-start-005-${TIMESTAMP}`;
const SESSION_8 = `test-start-008-${TIMESTAMP}`;

// 用於場景 4 的暫存 feature 目錄（建在隔離的 tmp projectRoot 下）
const TMP_PROJECT_ROOT = join(homedir(), '.nova', 'test-tmp', `session-start-${TIMESTAMP}`);
// 用於場景 5 的 projectRoot（需要寫入 workflow.json 到真實 session 目錄）
const TMP_PROJECT_ROOT_5 = join(homedir(), '.nova', 'test-tmp', `session-start-5-${TIMESTAMP}`);
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

// ── 清理 ──

afterAll(() => {
  // 清理所有測試建立的 session 目錄（per-project path）
  for (const sessionId of [SESSION_1, SESSION_2]) {
    const dir = paths.sessionDir(DEFAULT_CWD, sessionId);
    rmSync(dir, { recursive: true, force: true });
  }
  // 清理場景 4, 5 的暫存 feature
  rmSync(TMP_PROJECT_ROOT, { recursive: true, force: true });
  rmSync(TMP_PROJECT_ROOT_5, { recursive: true, force: true });
  // 清理場景 5 的 session（per-project path）
  const dir5 = paths.sessionDir(TMP_PROJECT_ROOT_5, SESSION_5);
  rmSync(dir5, { recursive: true, force: true });
  // 清理場景 8 的 session（per-project path）
  const dir8 = paths.sessionDir(DEFAULT_CWD, SESSION_8);
  rmSync(dir8, { recursive: true, force: true });
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
    const sessionDir = paths.sessionDir(DEFAULT_CWD, SESSION_1);
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

    const timelinePath = paths.session.timeline(DEFAULT_CWD, SESSION_2);
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
// ── 業務邏輯改用純函數直接測試（buildPendingTasksMessage + buildStartOutput）
// ────────────────────────────────────────────────────────────────────────────

describe('場景 4：有未完成 tasks — 業務邏輯（純函數）', () => {
  // setup：建立暫存 feature 目錄，供下方純函數測試使用
  beforeAll(() => {
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
  });

  test('buildPendingTasksMessage 回傳含 feature 名稱的訊息', () => {
    const msg = buildPendingTasksMessage(TMP_PROJECT_ROOT, { header: '未完成任務（上次 session 中斷）' });
    expect(typeof msg).toBe('string');
    expect(msg).toContain('pending-tasks-test');
  });

  test('buildPendingTasksMessage 包含未完成任務（ARCH、DEV）', () => {
    const msg = buildPendingTasksMessage(TMP_PROJECT_ROOT, { header: '未完成任務（上次 session 中斷）' });
    expect(msg).toContain('ARCH');
    expect(msg).toContain('DEV');
  });

  test('buildPendingTasksMessage 不包含已完成任務（PLAN）的 checkbox', () => {
    const msg = buildPendingTasksMessage(TMP_PROJECT_ROOT, { header: '未完成任務（上次 session 中斷）' });
    const lines = msg.split('\n');
    const checkboxLines = lines.filter(l => l.startsWith('- [ ]'));
    expect(checkboxLines.some(l => l.includes('PLAN'))).toBe(false);
  });

  test('buildStartOutput 含 msg 時 systemMessage 包含 banner 和 msg', () => {
    const msg = '## 未完成任務\n\nFeature：test（1/2 完成）\n- [ ] ARCH';
    const output = buildStartOutput({}, { banner: 'banner text', msgs: [msg] });
    expect(output.systemMessage).toBe('banner text\n\n' + msg);
  });

  test('buildStartOutput 無 msg 但有 banner 時 systemMessage 為 banner', () => {
    const output = buildStartOutput({}, { banner: 'banner text', msgs: [] });
    expect(output.systemMessage).toBe('banner text');
  });

  test('所有任務完成時 buildPendingTasksMessage 回傳 null', () => {
    // 建立另一個所有 checkbox 都勾選的 feature
    const allDoneFeatureName = 'all-done-feature';
    const allDoneRoot = join(homedir(), '.nova', 'test-tmp', `session-start-alldone-${TIMESTAMP}`);
    const allDoneFeatureDir = join(allDoneRoot, 'specs', 'features', 'in-progress', allDoneFeatureName);
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

    const msg = buildPendingTasksMessage(allDoneRoot, {});
    expect(msg).toBeNull();

    // 清理
    rmSync(allDoneRoot, { recursive: true, force: true });
  });

  test('hook 整合驗證：有未完成 tasks 時 stdout 含 systemMessage（spawn 整合）', () => {
    const result = runHook({ cwd: TMP_PROJECT_ROOT });
    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.systemMessage).toBeDefined();
    expect(output.systemMessage).toContain('pending-tasks-test');
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
    stateLib.initState(TMP_PROJECT_ROOT_5, SESSION_5, 'standard', ['PLAN', 'ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST', 'RETRO', 'DOCS']);
    const ws = stateLib.readState(TMP_PROJECT_ROOT_5, SESSION_5);
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

    const ws = stateLib.readState(TMP_PROJECT_ROOT_5, SESSION_5);
    expect(ws.featureName).toBe(FEATURE_NAME_5);
  });

  test('workflow.json.featureName 已有值時不覆蓋', () => {
    // 設置一個不同的 featureName
    stateLib.setFeatureName(TMP_PROJECT_ROOT_5, SESSION_5, null, 'existing-feature');
    const result = runHook({ session_id: SESSION_5, cwd: TMP_PROJECT_ROOT_5 });
    expect(result.exitCode).toBe(0);

    // 應保留原有值，不被 active feature 覆蓋
    const ws = stateLib.readState(TMP_PROJECT_ROOT_5, SESSION_5);
    expect(ws.featureName).toBe('existing-feature');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 7：CLAUDE_ENV_FILE 機制 — 寫入 CLAUDE_CODE_EFFORT_LEVEL
// ── 映射邏輯用純函數測試（registry.effortLevels），副作用保留 1 個 spawn
// ────────────────────────────────────────────────────────────────────────────

describe('場景 7：CLAUDE_CODE_EFFORT_LEVEL 映射邏輯（純函數 registry.effortLevels）', () => {
  const { effortLevels } = require(join(SCRIPTS_LIB, 'registry'));

  test('opus 對應 high', () => {
    expect(effortLevels['opus']).toBe('high');
  });

  test('sonnet 對應 medium', () => {
    expect(effortLevels['sonnet']).toBe('medium');
  });

  test('haiku 對應 low', () => {
    expect(effortLevels['haiku']).toBe('low');
  });

  test('未知 model 對應 undefined（不寫入）', () => {
    expect(effortLevels['unknown-model']).toBeUndefined();
  });
});

describe('場景 7b：CLAUDE_ENV_FILE — 寫入副作用整合測試（spawn）', () => {
  const SESSION_7 = `test-start-007-${TIMESTAMP}`;
  const tmpEnvFile = join(homedir(), '.nova', 'test-tmp', `session-start-env-${TIMESTAMP}.txt`);

  afterAll(() => {
    const dir7 = paths.sessionDir(DEFAULT_CWD, SESSION_7);
    rmSync(dir7, { recursive: true, force: true });
    rmSync(tmpEnvFile, { force: true });
  });

  test('model=opus 時實際寫入 CLAUDE_CODE_EFFORT_LEVEL=high 到檔案', () => {
    writeFileSync(tmpEnvFile, '');
    const result = runHook(
      { session_id: SESSION_7, model: 'opus' },
      { CLAUDE_ENV_FILE: tmpEnvFile, CLAUDE_CODE_EFFORT_LEVEL: '' }
    );
    expect(result.exitCode).toBe(0);
    const envContent = readFileSync(tmpEnvFile, 'utf8');
    expect(envContent).toContain('CLAUDE_CODE_EFFORT_LEVEL=high');
  });

  test('CLAUDE_CODE_EFFORT_LEVEL 已存在時不覆蓋', () => {
    writeFileSync(tmpEnvFile, '');
    const result = runHook(
      { session_id: SESSION_7, model: 'opus' },
      { CLAUDE_ENV_FILE: tmpEnvFile, CLAUDE_CODE_EFFORT_LEVEL: 'max' }
    );
    expect(result.exitCode).toBe(0);
    const envContent = readFileSync(tmpEnvFile, 'utf8');
    expect(envContent).not.toContain('CLAUDE_CODE_EFFORT_LEVEL');
  });

  test('CLAUDE_ENV_FILE 未設定時不寫入任何檔案，exit 0', () => {
    const result = runHook(
      { session_id: SESSION_7, model: 'opus' },
      { CLAUDE_CODE_EFFORT_LEVEL: '' }
    );
    expect(result.exitCode).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 6：banner 字串格式（純函數）+ NOVA_NO_DASHBOARD 整合
// ── banner 內容改用直接呼叫 buildBanner；副作用場景保留 spawn
// ────────────────────────────────────────────────────────────────────────────

describe('場景 6：banner 字串格式（純函數 buildBanner）', () => {
  test('buildBanner 回傳包含版本號的字串', () => {
    const banner = buildBanner('0.28.43', 'test-session-id', 7777, {});
    expect(typeof banner).toBe('string');
    expect(banner).toContain('0.28.43');
  });

  test('buildBanner 包含 session ID 前 8 碼', () => {
    const banner = buildBanner('1.0.0', 'abcdef1234567890', 7777, {});
    expect(banner).toContain('abcdef12');
  });

  test('buildBanner 不包含 Dashboard URL（dashboard 已移除）', () => {
    const banner = buildBanner('1.0.0', 'test-session', 7777, {});
    expect(banner).not.toContain('localhost');
    expect(banner).not.toContain('Dashboard');
  });

  test('buildBanner 包含 agentBrowserStatus（非 null 時）', () => {
    const banner = buildBanner('1.0.0', 'test-session', null, {
      agentBrowserStatus: '  🌐 agent-browser: 已安裝',
    });
    expect(banner).toContain('agent-browser: 已安裝');
  });

  test('buildBanner 無 sessionId 時不顯示 Session 行', () => {
    const banner = buildBanner('1.0.0', null, null, {});
    expect(banner).not.toContain('Session:');
  });
});

describe('場景 6b：NOVA_NO_DASHBOARD=1 — 跳過 Dashboard spawn（副作用整合）', () => {
  const SESSION_6 = `test-start-006-${TIMESTAMP}`;

  // 清理場景 6 的 session
  afterAll(() => {
    const dir6 = paths.sessionDir(DEFAULT_CWD, SESSION_6);
    rmSync(dir6, { recursive: true, force: true });
  });

  test('NOVA_NO_DASHBOARD=1 時 exit 0、stdout 為有效 JSON、stderr 無錯誤', () => {
    const result = runHook({ session_id: SESSION_6 }, { NOVA_NO_DASHBOARD: '1' });
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(typeof parsed).toBe('object');
    expect(result.stderr).not.toContain('Dashboard 啟動失敗');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 場景 8：on-start.js 呼叫 sanitize() 修復殘留不一致狀態
// ────────────────────────────────────────────────────────────────────────────

describe('場景 8：on-start.js 呼叫 sanitize() 修復殘留不一致狀態', () => {
  const stateLib = require(join(SCRIPTS_LIB, 'state'));

  test('setup: 初始化 workflow.json 並注入孤兒 activeAgent', () => {
    stateLib.initState(DEFAULT_CWD, SESSION_8, 'quick', ['DEV', 'REVIEW']);
    // 注入孤兒 activeAgent（TEST 不在 stages 中）
    stateLib.writeState(DEFAULT_CWD, SESSION_8, {
      ...stateLib.readState(DEFAULT_CWD, SESSION_8),
      activeAgents: {
        'tester:orphan999': {
          agentName: 'tester',
          stage: 'TEST',
          startedAt: new Date().toISOString(),
        },
      },
    });
    const ws = stateLib.readState(DEFAULT_CWD, SESSION_8);
    expect(ws.activeAgents['tester:orphan999']).toBeDefined();
  });

  test('hook 執行後孤兒 activeAgent 被清除', () => {
    const result = runHook({ session_id: SESSION_8 });
    expect(result.exitCode).toBe(0);

    const ws = stateLib.readState(DEFAULT_CWD, SESSION_8);
    // sanitize() 應在 SessionStart 時清除孤兒 entry
    expect(ws.activeAgents['tester:orphan999']).toBeUndefined();
    expect(Object.keys(ws.activeAgents)).toHaveLength(0);
  });

  test('無 workflow state 時 hook 仍正常 exit 0（sanitize 對無 state 靜默）', () => {
    const SESSION_NO_WF_8 = `test-start-no-wf-8-${TIMESTAMP}`;
    // 不初始化 workflow.json
    const result = runHook({ session_id: SESSION_NO_WF_8 });
    expect(result.exitCode).toBe(0);
    // 清理
    const { rmSync: rm } = require('fs');
    rm(paths.sessionDir(DEFAULT_CWD, SESSION_NO_WF_8), { recursive: true, force: true });
  });
});
