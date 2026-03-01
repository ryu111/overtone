'use strict';
/**
 * statusline.test.js — statusline.js 單元測試
 *
 * 測試範圍：
 *   - formatTokens：數字格式化（k/M）
 *   - colorPct：百分比著色
 *   - buildAgentDisplay：agent 顯示字串（單一、並行、無 active）
 *   - main output：無 workflow 時單行、有 workflow 時雙行
 */

const { describe, it, expect } = require('bun:test');
const { join } = require('path');
const { spawnSync } = require('child_process');
const { SCRIPTS_DIR } = require('../helpers/paths');

const STATUSLINE_PATH = join(SCRIPTS_DIR, 'statusline.js');

// ── 輔助函式 ──

/**
 * 執行 statusline.js，傳入 stdin JSON
 * @param {object|string} input
 * @returns {{ stdout: string, stderr: string, exitCode: number }}
 */
function runStatusline(input = {}) {
  const stdinData = typeof input === 'string' ? input : JSON.stringify(input);
  const result = spawnSync('node', [STATUSLINE_PATH], {
    input: stdinData,
    encoding: 'utf8',
    timeout: 10000,
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? 0,
  };
}

// ── 剝離 ANSI 色碼的輔助函式 ──
function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// ── Feature 1: 數字格式化 ──

describe('formatTokens（透過 stdout 驗證）', () => {
  it('小於 1000 個 token 直接顯示數字', () => {
    const { stdout } = runStatusline({
      session_id: '',
      cost: { total_input_tokens: 500, total_output_tokens: 200 },
    });
    const plain = stripAnsi(stdout);
    expect(plain).toContain('700');
  });

  it('1000-999999 顯示 k 格式', () => {
    const { stdout } = runStatusline({
      session_id: '',
      cost: { total_input_tokens: 200000, total_output_tokens: 45000 },
    });
    const plain = stripAnsi(stdout);
    expect(plain).toContain('245k');
  });

  it('1000000 以上顯示 M 格式', () => {
    const { stdout } = runStatusline({
      session_id: '',
      cost: { total_input_tokens: 1000000, total_output_tokens: 200000 },
    });
    const plain = stripAnsi(stdout);
    expect(plain).toContain('1.2M');
  });

  it('無 cost 欄位時顯示 --', () => {
    const { stdout } = runStatusline({ session_id: '' });
    const plain = stripAnsi(stdout);
    expect(plain).toContain('--');
  });
});

// ── Feature 2: 百分比著色 ──

describe('colorPct 著色規則', () => {
  it('ctx < 65% 使用暗綠色（dim green）', () => {
    const { stdout } = runStatusline({
      session_id: '',
      context_window: { used_percentage: 50 },
    });
    // 暗綠 = \x1b[2m\x1b[32m
    expect(stdout).toContain('\x1b[2m\x1b[32m');
    const plain = stripAnsi(stdout);
    expect(plain).toContain('ctx 50%');
  });

  it('ctx >= 65% 且 < 80% 使用黃色', () => {
    const { stdout } = runStatusline({
      session_id: '',
      context_window: { used_percentage: 72 },
    });
    expect(stdout).toContain('\x1b[33m');
    const plain = stripAnsi(stdout);
    expect(plain).toContain('72%');
  });

  it('ctx >= 80% 使用紅色', () => {
    const { stdout } = runStatusline({
      session_id: '',
      context_window: { used_percentage: 87 },
    });
    expect(stdout).toContain('\x1b[91m');
    const plain = stripAnsi(stdout);
    expect(plain).toContain('87%');
  });

  it('ctx null 顯示 --', () => {
    const { stdout } = runStatusline({
      session_id: '',
      context_window: { used_percentage: null },
    });
    const plain = stripAnsi(stdout);
    expect(plain).toContain('ctx --');
  });
});

// ── Feature 3: 無 workflow 時單行輸出 ──

describe('無 workflow 時輸出格式', () => {
  it('輸出一行（不含 workflow type 行）', () => {
    const { stdout } = runStatusline({
      session_id: '',
      context_window: { used_percentage: 12 },
    });
    const lines = stdout.split('\n').filter(l => l.trim());
    expect(lines.length).toBe(1);
  });

  it('包含 ctx / 5h / 7d 欄位', () => {
    const { stdout } = runStatusline({
      session_id: '',
      context_window: { used_percentage: 12 },
    });
    const plain = stripAnsi(stdout);
    expect(plain).toContain('ctx');
    expect(plain).toContain('5h');
    expect(plain).toContain('7d');
  });

  it('不包含 ♻️ compact 計數（無 workflow）', () => {
    const { stdout } = runStatusline({
      session_id: '',
      context_window: { used_percentage: 20 },
    });
    // 無 workflow 時不應顯示 compact 計數
    const plain = stripAnsi(stdout);
    expect(plain).not.toContain('♻️');
  });
});

// ── Feature 4: 失敗時安靜退出 ──

describe('錯誤處理', () => {
  it('stdin 為空時安靜退出（exit 0）', () => {
    const { exitCode, stderr } = runStatusline('');
    expect(exitCode).toBe(0);
    // 不應輸出錯誤訊息到 stdout（stderr 可能有些 node 警告但不影響 status line）
  });

  it('stdin 為畸形 JSON 時安靜退出', () => {
    const result = spawnSync('node', [STATUSLINE_PATH], {
      input: '{invalid json',
      encoding: 'utf8',
      timeout: 5000,
    });
    expect(result.status ?? 0).toBe(0);
  });

  it('session_id 不存在時不 crash（workflow.json 不存在）', () => {
    const { exitCode } = runStatusline({
      session_id: 'non-existent-session-id-xyz',
      context_window: { used_percentage: 30 },
    });
    expect(exitCode).toBe(0);
  });
});

// ── Feature 5: buildAgentDisplay 邏輯（透過 stdout 驗證）──

describe('agent 顯示字串', () => {
  const os = require('os');
  const path = require('path');
  const { mkdirSync, writeFileSync, rmSync } = require('fs');

  // 建立臨時 session 目錄，寫入 workflow.json
  // statusline.js 使用 join(homedir(), '.overtone', 'sessions', sessionId)
  // 所以 HOME 需設為 tmpHome，讓 homedir()/.overtone 指向正確位置
  const tmpHome = path.join(os.tmpdir(), `home-statusline-test-${Date.now()}`);
  const sessionId = `statusline-unit-${Date.now()}`;
  const sessionDir = path.join(tmpHome, '.overtone', 'sessions', sessionId);

  function writeWorkflow(data) {
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(path.join(sessionDir, 'workflow.json'), JSON.stringify(data));
  }

  function runWithSession(stdinData = {}) {
    return spawnSync('node', [STATUSLINE_PATH], {
      input: JSON.stringify({ ...stdinData, session_id: sessionId }),
      encoding: 'utf8',
      timeout: 10000,
      env: {
        ...process.env,
        HOME: tmpHome,  // homedir() 讀取 HOME，讓測試隔離於 ~/.overtone
      },
    });
  }

  it('無 active stage 時顯示 🤖 main', () => {
    writeWorkflow({
      workflowType: 'quick',
      stages: {
        DEV: { status: 'pending' },
        REVIEW: { status: 'pending' },
      },
    });

    const result = runWithSession({ context_window: { used_percentage: 20 } });
    const plain = stripAnsi(result.stdout || '');
    expect(plain).toContain('main');
  });

  it('單一 active stage 顯示 emoji + STAGE : agent', () => {
    writeWorkflow({
      workflowType: 'quick',
      stages: {
        DEV: { status: 'active' },
        REVIEW: { status: 'pending' },
      },
    });

    const result = runWithSession({ context_window: { used_percentage: 20 } });
    const plain = stripAnsi(result.stdout || '');
    expect(plain).toContain('DEV');
    expect(plain).toContain('developer');
    expect(plain).toContain('💻');
  });

  it('多個不同 active stage 顯示 + 分隔', () => {
    writeWorkflow({
      workflowType: 'standard',
      stages: {
        REVIEW: { status: 'active' },
        TEST: { status: 'active' },
      },
    });

    const result = runWithSession({ context_window: { used_percentage: 20 } });
    const plain = stripAnsi(result.stdout || '');
    expect(plain).toContain('+');
  });

  it('同一 stage 並行多次顯示 × N', () => {
    writeWorkflow({
      workflowType: 'standard',
      stages: {
        'DEV':   { status: 'active' },
        'DEV:2': { status: 'active' },
      },
    });

    const result = runWithSession({ context_window: { used_percentage: 20 } });
    const plain = stripAnsi(result.stdout || '');
    expect(plain).toContain('× 2');
  });

  it('有 workflow 時輸出兩行', () => {
    writeWorkflow({
      workflowType: 'quick',
      stages: {
        DEV: { status: 'active' },
      },
    });

    const result = runWithSession({ context_window: { used_percentage: 20 } });
    const lines = (result.stdout || '').split('\n').filter(l => l.trim());
    expect(lines.length).toBe(2);
  });

  it('有 workflow 時 Line 2 包含 ♻️ compact 計數', () => {
    writeWorkflow({
      workflowType: 'quick',
      stages: { DEV: { status: 'active' } },
    });

    const result = runWithSession({ context_window: { used_percentage: 20 } });
    const plain = stripAnsi(result.stdout || '');
    expect(plain).toContain('♻️');
    expect(plain).toContain('0a 0m');
  });

  // 清理
  it('清理臨時目錄', () => {
    try { rmSync(tmpHome, { recursive: true, force: true }); } catch { /* 靜默 */ }
    expect(true).toBe(true);
  });
});
