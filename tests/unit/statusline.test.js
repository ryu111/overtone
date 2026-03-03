'use strict';
/**
 * statusline.test.js — statusline.js 單元測試
 *
 * 測試範圍：
 *   - colorPct：百分比著色
 *   - formatSize：檔案大小格式化
 *   - buildAgentDisplay：agent 顯示字串（active/idle/並行）
 *   - 無 workflow 時單行、有 active agent 時雙行
 *   - 中文模式標籤
 *   - transcript_path 檔案大小
 */

const { describe, it, expect } = require('bun:test');
const { join } = require('path');
const { spawnSync } = require('child_process');
const { SCRIPTS_DIR } = require('../helpers/paths');

const STATUSLINE_PATH = join(SCRIPTS_DIR, 'statusline.js');

// ── 輔助函式 ──

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

function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// ── Feature 1: 百分比著色 ──

describe('colorPct 著色規則', () => {
  it('ctx < 65% 使用預設色（無特殊 ANSI）', () => {
    const { stdout } = runStatusline({
      session_id: '',
      context_window: { used_percentage: 50 },
    });
    const plain = stripAnsi(stdout);
    expect(plain).toContain('ctx 50%');
    // 正常值不應包含黃色或紅色
    expect(stdout).not.toContain('\x1b[33m50%');
    expect(stdout).not.toContain('\x1b[91m50%');
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

// ── Feature 2: 無 workflow 時單行輸出 ──

describe('無 workflow 時輸出格式', () => {
  it('輸出一行（不含 workflow type 行）', () => {
    const { stdout } = runStatusline({
      session_id: '',
      context_window: { used_percentage: 12 },
    });
    const lines = stdout.split('\n').filter(l => l.trim());
    expect(lines.length).toBe(1);
  });

  it('包含 ctx 欄位', () => {
    const { stdout } = runStatusline({
      session_id: '',
      context_window: { used_percentage: 12 },
    });
    const plain = stripAnsi(stdout);
    expect(plain).toContain('ctx');
  });

  it('不包含 5h / 7d 欄位（已移除）', () => {
    const { stdout } = runStatusline({
      session_id: '',
      context_window: { used_percentage: 12 },
    });
    const plain = stripAnsi(stdout);
    expect(plain).not.toContain('5h');
    expect(plain).not.toContain('7d');
  });

  it('不包含 ♻️ compact 計數（無 workflow）', () => {
    const { stdout } = runStatusline({
      session_id: '',
      context_window: { used_percentage: 20 },
    });
    const plain = stripAnsi(stdout);
    expect(plain).not.toContain('♻️');
  });
});

// ── Feature 3: transcript 檔案大小 ──

describe('transcript 檔案大小', () => {
  const os = require('os');
  const path = require('path');
  const { writeFileSync, rmSync, mkdirSync } = require('fs');

  it('transcript_path 存在時顯示檔案大小', () => {
    const tmpFile = path.join(os.tmpdir(), `statusline-transcript-${Date.now()}.jsonl`);
    // 寫入約 1.5MB 的假資料
    writeFileSync(tmpFile, 'x'.repeat(1_500_000));

    try {
      const { stdout } = runStatusline({
        session_id: '',
        context_window: { used_percentage: 20 },
        transcript_path: tmpFile,
      });
      const plain = stripAnsi(stdout);
      expect(plain).toContain('1.5MB');
    } finally {
      try { rmSync(tmpFile); } catch { /* 靜默 */ }
    }
  });

  it('transcript_path 不存在時顯示 --', () => {
    const { stdout } = runStatusline({
      session_id: '',
      context_window: { used_percentage: 20 },
      transcript_path: '/tmp/non-existent-file-xyz.jsonl',
    });
    const plain = stripAnsi(stdout);
    expect(plain).toContain('--');
  });

  it('無 transcript_path 時顯示 --', () => {
    const { stdout } = runStatusline({
      session_id: '',
      context_window: { used_percentage: 20 },
    });
    const plain = stripAnsi(stdout);
    expect(plain).toContain('--');
  });
});

// ── Feature 4: 失敗時安靜退出 ──

describe('錯誤處理', () => {
  it('stdin 為空時安靜退出（exit 0）', () => {
    const { exitCode } = runStatusline('');
    expect(exitCode).toBe(0);
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

// ── Feature 5: agent 顯示字串與中文模式 ──

describe('agent 顯示與中文模式', () => {
  const os = require('os');
  const path = require('path');
  const { mkdirSync, writeFileSync, rmSync } = require('fs');

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
      env: { ...process.env, HOME: tmpHome },
    });
  }

  // ── 無 active agent 時隱藏 Line 1 ──

  it('無 active stage 但 workflow 未完成時只顯示單行 metrics', () => {
    writeWorkflow({
      workflowType: 'quick',
      stages: {
        DEV: { status: 'pending' },
        REVIEW: { status: 'pending' },
      },
    });

    const result = runWithSession({ context_window: { used_percentage: 20 } });
    const plain = stripAnsi(result.stdout || '');
    const lines = plain.split('\n').filter(l => l.trim());
    // 單行（只有 metrics + compact count）
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('ctx');
    expect(lines[0]).toContain('♻️');
  });

  it('全部 completed 時只輸出一行', () => {
    writeWorkflow({
      workflowType: 'quick',
      stages: {
        DEV: { status: 'completed' },
        REVIEW: { status: 'completed' },
      },
    });

    const result = runWithSession({ context_window: { used_percentage: 20 } });
    const lines = (result.stdout || '').split('\n').filter(l => l.trim());
    expect(lines.length).toBe(1);
  });

  // ── 有 active agent 時雙行 ──

  it('單一 active stage 顯示 emoji + agent（agent 在前）', () => {
    writeWorkflow({
      workflowType: 'quick',
      stages: {
        DEV: { status: 'active' },
        REVIEW: { status: 'pending' },
      },
    });

    const result = runWithSession({ context_window: { used_percentage: 20 } });
    const plain = stripAnsi(result.stdout || '');
    const lines = plain.split('\n').filter(l => l.trim());

    // 雙行輸出
    expect(lines.length).toBe(2);
    // Line 1: agent 名稱
    expect(lines[0]).toContain('developer');
    expect(lines[0]).toContain('💻');
    // Line 1 不包含 STAGE 大寫（舊格式）
    expect(lines[0]).not.toContain('DEV');
  });

  it('Line 1 包含中文模式標籤', () => {
    writeWorkflow({
      workflowType: 'quick',
      stages: { DEV: { status: 'active' } },
    });

    const result = runWithSession({ context_window: { used_percentage: 20 } });
    const plain = stripAnsi(result.stdout || '');
    expect(plain).toContain('快速');
  });

  it('standard 模式顯示「標準」', () => {
    writeWorkflow({
      workflowType: 'standard',
      stages: { PLAN: { status: 'active' } },
    });

    const result = runWithSession({ context_window: { used_percentage: 20 } });
    const plain = stripAnsi(result.stdout || '');
    expect(plain).toContain('標準');
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

  it('有 active agent 時 Line 2 包含 ♻️ compact 計數', () => {
    writeWorkflow({
      workflowType: 'quick',
      stages: { DEV: { status: 'active' } },
    });

    const result = runWithSession({ context_window: { used_percentage: 20 } });
    const plain = stripAnsi(result.stdout || '');
    expect(plain).toContain('♻️');
    expect(plain).toContain('0a 0m');
  });

  it('有 workflow 無 active agent 時仍顯示 ♻️ compact 計數', () => {
    writeWorkflow({
      workflowType: 'quick',
      stages: { DEV: { status: 'completed' } },
    });

    const result = runWithSession({ context_window: { used_percentage: 20 } });
    const plain = stripAnsi(result.stdout || '');
    expect(plain).toContain('♻️');
  });

  // ── active-agent.json + workflow 並行 × N（主信號分支修復驗證）──

  it('active-agent.json 主信號 + 並行 workflow stages 時顯示 × N', () => {
    writeWorkflow({
      workflowType: 'standard',
      stages: {
        'DEV':   { status: 'active' },
        'DEV:2': { status: 'active' },
        'DEV:3': { status: 'active' },
      },
    });
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(path.join(sessionDir, 'active-agent.json'), JSON.stringify({
      agent: 'developer',
      subagentType: 'ot:developer',
      startedAt: new Date().toISOString(),
    }));

    const result = runWithSession({ context_window: { used_percentage: 20 } });
    const plain = stripAnsi(result.stdout || '');
    // 主信號分支應能讀取 workflow stages 並顯示 × 3
    expect(plain).toContain('× 3');
    expect(plain).toContain('developer');

    // 清除 active-agent.json
    try { require('fs').rmSync(path.join(sessionDir, 'active-agent.json')); } catch { /* 靜默 */ }
  });

  it('active-agent.json 主信號單一 stage 時不顯示 × N', () => {
    writeWorkflow({
      workflowType: 'quick',
      stages: {
        'DEV': { status: 'active' },
      },
    });
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(path.join(sessionDir, 'active-agent.json'), JSON.stringify({
      agent: 'developer',
      subagentType: 'ot:developer',
      startedAt: new Date().toISOString(),
    }));

    const result = runWithSession({ context_window: { used_percentage: 20 } });
    const plain = stripAnsi(result.stdout || '');
    expect(plain).toContain('developer');
    expect(plain).not.toContain('× 1');
    expect(plain).not.toContain('×');

    // 清除 active-agent.json
    try { require('fs').rmSync(path.join(sessionDir, 'active-agent.json')); } catch { /* 靜默 */ }
  });

  // ── 無 workflow 但有 active-agent.json 時顯示 agent ──

  it('無 workflow 但有 active-agent.json 時顯示 agent', () => {
    // 確保清除前一個測試留下的 workflow.json，真正模擬無 workflow 情境
    try { require('fs').rmSync(path.join(sessionDir, 'workflow.json')); } catch { /* 不存在則略過 */ }
    // 不寫 workflow.json，只寫 active-agent.json
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(path.join(sessionDir, 'active-agent.json'), JSON.stringify({
      agent: 'Explore',
      subagentType: 'Explore',
      startedAt: new Date().toISOString(),
    }));

    const result = runWithSession({ context_window: { used_percentage: 20 } });
    const plain = stripAnsi(result.stdout || '');
    const lines = plain.split('\n').filter(l => l.trim());
    // 雙行（agent + metrics）
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain('Explore');

    // 清除 active-agent.json
    try { require('fs').rmSync(path.join(sessionDir, 'active-agent.json')); } catch { /* 靜默 */ }
  });

  it('無 workflow 有 Overtone agent 時顯示 emoji', () => {
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(path.join(sessionDir, 'active-agent.json'), JSON.stringify({
      agent: 'developer',
      subagentType: 'ot:developer',
      startedAt: new Date().toISOString(),
    }));

    const result = runWithSession({ context_window: { used_percentage: 20 } });
    const plain = stripAnsi(result.stdout || '');
    expect(plain).toContain('developer');
    expect(plain).toContain('💻');

    // 清除
    try { require('fs').rmSync(path.join(sessionDir, 'active-agent.json')); } catch { /* 靜默 */ }
  });

  // ── 色碼區分：分隔符使用 dim ──

  it('分隔符使用 dim ANSI（\\x1b[2m）', () => {
    writeWorkflow({
      workflowType: 'quick',
      stages: { DEV: { status: 'active' } },
    });

    const result = runWithSession({ context_window: { used_percentage: 20 } });
    // dim 用於分隔符
    expect(result.stdout).toContain('\x1b[2m');
  });

  it('標籤使用 cyan ANSI（\\x1b[36m）', () => {
    writeWorkflow({
      workflowType: 'quick',
      stages: { DEV: { status: 'active' } },
    });

    const result = runWithSession({ context_window: { used_percentage: 20 } });
    expect(result.stdout).toContain('\x1b[36m');
  });

  // 清理
  it('清理臨時目錄', () => {
    try { rmSync(tmpHome, { recursive: true, force: true }); } catch { /* 靜默 */ }
    expect(true).toBe(true);
  });
});
