'use strict';
/**
 * tests/unit/get-workflow-context.test.js
 *
 * 測試 get-workflow-context.js 腳本的輸出行為。
 * 策略：spawn 子進程，設定假的共享文件路徑（透過環境變數 HOME 覆蓋），
 * 驗證各情境的 stdout 輸出。
 */

const { describe, it, expect, beforeEach, afterEach } = require('bun:test');
const { spawnSync } = require('child_process');
const { mkdirSync, writeFileSync, rmSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');
const { SCRIPTS_DIR } = require('../helpers/paths');

const SCRIPT = join(SCRIPTS_DIR, 'get-workflow-context.js');

// ── 輔助函式 ──

/**
 * 執行 get-workflow-context.js 並捕捉 stdout/stderr/exitCode。
 * @param {string} fakeHome - 假的 HOME 目錄（含 .overtone/ 結構）
 * @param {object} [extraEnv] - 額外環境變數
 */
function runScript(fakeHome, extraEnv = {}) {
  const result = spawnSync('node', [SCRIPT], {
    encoding: 'utf8',
    timeout: 8000,
    env: {
      ...process.env,
      HOME: fakeHome,
      // 確保 CLAUDE_SESSION_ID 不影響測試（腳本應從共享文件讀取）
      CLAUDE_SESSION_ID: '',
      ...extraEnv,
    },
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status,
  };
}

/**
 * 建立臨時目錄，初始化 .overtone/ 結構。
 */
function makeTmpHome() {
  const dir = join(tmpdir(), `gwc-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(dir, '.overtone'), { recursive: true });
  return dir;
}

/**
 * 寫入 .current-session-id 共享文件。
 */
function writeSessionId(home, sessionId) {
  writeFileSync(join(home, '.overtone', '.current-session-id'), sessionId, 'utf8');
}

/**
 * 寫入 workflow.json 到 ~/.overtone/sessions/{sessionId}/。
 */
function writeWorkflowState(home, sessionId, state) {
  const sessionDir = join(home, '.overtone', 'sessions', sessionId);
  mkdirSync(sessionDir, { recursive: true });
  writeFileSync(join(sessionDir, 'workflow.json'), JSON.stringify(state), 'utf8');
}

// ── Feature 1: 無 sessionId ──

describe('無 sessionId（共享文件不存在）', () => {
  let tmpHome;

  beforeEach(() => {
    tmpHome = makeTmpHome();
    // 不寫入 .current-session-id，模擬未啟動 session
  });

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it('輸出「尚未啟動工作流」並 exit 0', () => {
    const { stdout, exitCode } = runScript(tmpHome);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe('尚未啟動工作流。');
  });
});

// ── Feature 2: 有 sessionId 但無 workflow state ──

describe('有 sessionId 但無 workflow state', () => {
  let tmpHome;
  const SESSION_ID = 'test-session-001';

  beforeEach(() => {
    tmpHome = makeTmpHome();
    writeSessionId(tmpHome, SESSION_ID);
    // 不建立 workflow.json，模擬 workflow 尚未初始化
  });

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it('輸出「尚未啟動工作流」並 exit 0', () => {
    const { stdout, exitCode } = runScript(tmpHome);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe('尚未啟動工作流。');
  });
});

// ── Feature 3: 有 workflow state ──

describe('有 workflow state', () => {
  let tmpHome;
  const SESSION_ID = 'test-session-002';

  beforeEach(() => {
    tmpHome = makeTmpHome();
    writeSessionId(tmpHome, SESSION_ID);
  });

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it('輸出工作流名稱、進度、目前階段', () => {
    writeWorkflowState(tmpHome, SESSION_ID, {
      workflowType: 'quick',
      currentStage: 'DEV',
      stages: {
        DEV: { status: 'active', result: null },
        REVIEW: { status: 'pending', result: null },
        TEST: { status: 'pending', result: null },
        RETRO: { status: 'pending', result: null },
        DOCS: { status: 'pending', result: null },
      },
      failCount: 0,
      rejectCount: 0,
    });

    const { stdout, exitCode } = runScript(tmpHome);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('工作流：quick');
    expect(stdout).toContain('目前階段：DEV');
    expect(stdout).toContain('⏳ DEV');
    expect(stdout).toContain('⬜ REVIEW');
  });

  it('completed stage 顯示 ✅ 圖示', () => {
    writeWorkflowState(tmpHome, SESSION_ID, {
      workflowType: 'standard',
      currentStage: 'DEV',
      stages: {
        PLAN: { status: 'completed', result: '規劃完成' },
        ARCH: { status: 'completed', result: '架構完成' },
        TEST: { status: 'completed', result: null },
        DEV: { status: 'active', result: null },
      },
      failCount: 0,
      rejectCount: 0,
    });

    const { stdout, exitCode } = runScript(tmpHome);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('✅ PLAN');
    expect(stdout).toContain('✅ ARCH');
    expect(stdout).toContain('⏳ DEV');
  });

  it('failCount > 0 時顯示失敗次數', () => {
    writeWorkflowState(tmpHome, SESSION_ID, {
      workflowType: 'debug',
      currentStage: 'DEV',
      stages: {
        DEBUG: { status: 'completed', result: null },
        DEV: { status: 'active', result: null },
        TEST: { status: 'pending', result: null },
      },
      failCount: 2,
      rejectCount: 0,
    });

    const { stdout, exitCode } = runScript(tmpHome);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('失敗次數：2/3');
    expect(stdout).not.toContain('拒絕次數');
  });

  it('rejectCount > 0 時顯示拒絕次數', () => {
    writeWorkflowState(tmpHome, SESSION_ID, {
      workflowType: 'quick',
      currentStage: 'DEV',
      stages: {
        DEV: { status: 'active', result: null },
      },
      failCount: 0,
      rejectCount: 1,
    });

    const { stdout, exitCode } = runScript(tmpHome);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('拒絕次數：1/3');
    expect(stdout).not.toContain('失敗次數');
  });

  it('failCount 和 rejectCount 都為 0 時不顯示計數', () => {
    writeWorkflowState(tmpHome, SESSION_ID, {
      workflowType: 'single',
      currentStage: 'DEV',
      stages: {
        DEV: { status: 'active', result: null },
      },
      failCount: 0,
      rejectCount: 0,
    });

    const { stdout, exitCode } = runScript(tmpHome);
    expect(exitCode).toBe(0);
    expect(stdout).not.toContain('失敗次數');
    expect(stdout).not.toContain('拒絕次數');
  });
});

// ── Feature 4: 有活躍 feature ──

describe('有活躍 feature', () => {
  let tmpHome;
  const SESSION_ID = 'test-session-003';

  beforeEach(() => {
    tmpHome = makeTmpHome();
    writeSessionId(tmpHome, SESSION_ID);
    writeWorkflowState(tmpHome, SESSION_ID, {
      workflowType: 'standard',
      currentStage: 'DEV',
      stages: {
        DEV: { status: 'active', result: null },
      },
      failCount: 0,
      rejectCount: 0,
    });
  });

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it('有活躍 feature 時輸出 feature 名稱', () => {
    // 建立假的 specs/features/in-progress/my-feature/ 結構
    const projectRoot = tmpHome; // 用 tmpHome 當 projectRoot
    const featureDir = join(projectRoot, 'specs', 'features', 'in-progress', 'my-feature');
    mkdirSync(featureDir, { recursive: true });
    writeFileSync(join(featureDir, 'tasks.md'), [
      '---',
      'workflow: standard',
      'status: in-progress',
      '---',
      '',
      '# Tasks',
      '',
      '- [x] Task 1',
      '- [ ] Task 2',
    ].join('\n'), 'utf8');

    const { stdout, exitCode } = runScript(tmpHome, {
      CLAUDE_PROJECT_ROOT: projectRoot,
    });
    expect(exitCode).toBe(0);
    expect(stdout).toContain('my-feature');
    expect(stdout).toContain('1/2');
  });

  it('無活躍 feature 時不輸出 feature 相關資訊', () => {
    // projectRoot 沒有 specs/ 目錄
    const { stdout, exitCode } = runScript(tmpHome, {
      CLAUDE_PROJECT_ROOT: join(tmpHome, 'nonexistent'),
    });
    expect(exitCode).toBe(0);
    expect(stdout).not.toContain('活躍 Feature');
    expect(stdout).toContain('工作流：standard');
  });
});
