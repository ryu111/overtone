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
 *   - 佇列進度顯示（Feature 6）
 */

const { describe, it, expect, beforeAll, afterAll } = require('bun:test');
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

  // ── 無 active agent 但 workflow 未完成 → 顯示 Main ──

  it('無 active stage 但 workflow 未完成時顯示 🧠 Main（雙行）', () => {
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
    // 雙行（Main + 模式 │ metrics）
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain('Main');
    expect(lines[0]).toContain('快速');
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

  it('workflow 全部完成時收回單行（無 ♻️）', () => {
    writeWorkflow({
      workflowType: 'quick',
      stages: { DEV: { status: 'completed' } },
    });

    const result = runWithSession({ context_window: { used_percentage: 20 } });
    const plain = stripAnsi(result.stdout || '');
    const lines = plain.split('\n').filter(l => l.trim());
    expect(lines.length).toBe(1);
    expect(plain).toContain('ctx');
  });

  // ── workflow stages 並行 × N（純 workflow.json 信號）──

  it('workflow 3 個並行 active DEV stages 時顯示 × 3', () => {
    writeWorkflow({
      workflowType: 'standard',
      stages: {
        'DEV':   { status: 'active' },
        'DEV:2': { status: 'active' },
        'DEV:3': { status: 'active' },
      },
    });

    const result = runWithSession({ context_window: { used_percentage: 20 } });
    const plain = stripAnsi(result.stdout || '');
    expect(plain).toContain('× 3');
    expect(plain).toContain('developer');
  });

  it('workflow 單一 active DEV stage 時不顯示 × N', () => {
    writeWorkflow({
      workflowType: 'quick',
      stages: {
        'DEV': { status: 'active' },
      },
    });

    const result = runWithSession({ context_window: { used_percentage: 20 } });
    const plain = stripAnsi(result.stdout || '');
    expect(plain).toContain('developer');
    expect(plain).not.toContain('× 1');
    expect(plain).not.toContain('×');
  });

  // ── 無 workflow 時 active-agent.json 不影響顯示（已移除支援）──

  it('無 workflow 時即使有 active-agent.json 也只顯示單行', () => {
    // 確保清除前一個測試留下的 workflow.json
    try { require('fs').rmSync(path.join(sessionDir, 'workflow.json')); } catch { /* 不存在則略過 */ }
    // active-agent.json 不再被讀取，不影響輸出
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(path.join(sessionDir, 'active-agent.json'), JSON.stringify({
      agent: 'developer',
      subagentType: 'developer',
      startedAt: new Date().toISOString(),
    }));

    const result = runWithSession({ context_window: { used_percentage: 20 } });
    const plain = stripAnsi(result.stdout || '');
    const lines = plain.split('\n').filter(l => l.trim());
    // 單行（無 workflow → 無 agent 顯示，active-agent.json 被忽略）
    expect(lines.length).toBe(1);

    // 清除 active-agent.json
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

// ── Feature 7: workflowId 路由（多實例隔離）──

describe('readWorkflow workflowId 路由', () => {
  const os = require('os');
  const path = require('path');
  const { mkdirSync, writeFileSync, rmSync } = require('fs');

  const tmpHome = path.join(os.tmpdir(), `home-wid-route-test-${Date.now()}`);
  const sessionId = `wid-route-${Date.now()}`;
  const sessionDir = path.join(tmpHome, '.overtone', 'sessions', sessionId);

  function runWithSession(stdinData = {}) {
    return spawnSync('node', [STATUSLINE_PATH], {
      input: JSON.stringify({ ...stdinData, session_id: sessionId }),
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, HOME: tmpHome },
    });
  }

  afterAll(() => {
    try { rmSync(tmpHome, { recursive: true, force: true }); } catch { /* 靜默 */ }
  });

  it('有 active-workflow-id 時從 workflows/{wid}/workflow.json 讀取', () => {
    const workflowId = 'test-wid-abc123';
    const workflowDir = path.join(sessionDir, 'workflows', workflowId);
    mkdirSync(workflowDir, { recursive: true });
    // 寫入 workflow 層級 workflow.json（有 active stage）
    writeFileSync(path.join(workflowDir, 'workflow.json'), JSON.stringify({
      workflowType: 'quick',
      stages: { DEV: { status: 'active' } },
    }));
    // 寫入 active-workflow-id
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(path.join(sessionDir, 'active-workflow-id'), workflowId);

    const result = runWithSession({ context_window: { used_percentage: 20 } });
    const plain = stripAnsi(result.stdout || '');
    const lines = plain.split('\n').filter(l => l.trim());
    // 應讀到 workflow 層級的 active stage → 雙行輸出含 developer
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain('developer');
  });

  it('無 active-workflow-id 時 fallback 到 session 層級 workflow.json', () => {
    // 確保無 active-workflow-id（先做好隔離）
    const isolatedSessionId = `wid-fallback-${Date.now()}`;
    const isolatedSessionDir = path.join(tmpHome, '.overtone', 'sessions', isolatedSessionId);
    mkdirSync(isolatedSessionDir, { recursive: true });
    writeFileSync(path.join(isolatedSessionDir, 'workflow.json'), JSON.stringify({
      workflowType: 'standard',
      stages: { PLAN: { status: 'active' } },
    }));
    // 不寫 active-workflow-id → fallback 路徑

    const result = spawnSync('node', [STATUSLINE_PATH], {
      input: JSON.stringify({ session_id: isolatedSessionId, context_window: { used_percentage: 20 } }),
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, HOME: tmpHome },
    });
    const plain = stripAnsi(result.stdout || '');
    const lines = plain.split('\n').filter(l => l.trim());
    // 應讀到 session 層級 workflow.json 的 PLAN stage
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain('標準');
  });

  it('active-workflow-id 指向的 workflow.json 不存在時回傳 null（顯示單行）', () => {
    const badWid = 'non-existent-wid';
    const isolatedSessionId = `wid-missing-${Date.now()}`;
    const isolatedSessionDir = path.join(tmpHome, '.overtone', 'sessions', isolatedSessionId);
    mkdirSync(isolatedSessionDir, { recursive: true });
    writeFileSync(path.join(isolatedSessionDir, 'active-workflow-id'), badWid);
    // 不寫 workflows/{badWid}/workflow.json

    const result = spawnSync('node', [STATUSLINE_PATH], {
      input: JSON.stringify({ session_id: isolatedSessionId, context_window: { used_percentage: 20 } }),
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, HOME: tmpHome },
    });
    const plain = stripAnsi(result.stdout || '');
    const lines = plain.split('\n').filter(l => l.trim());
    // workflow.json 不存在 → readWorkflow 回傳 null → 無 workflow 單行
    expect(lines.length).toBe(1);
    expect(plain).toContain('ctx');
  });

  it('active-workflow-id 為空字串時 fallback 到 session 層級', () => {
    const isolatedSessionId = `wid-empty-${Date.now()}`;
    const isolatedSessionDir = path.join(tmpHome, '.overtone', 'sessions', isolatedSessionId);
    mkdirSync(isolatedSessionDir, { recursive: true });
    writeFileSync(path.join(isolatedSessionDir, 'active-workflow-id'), '');
    writeFileSync(path.join(isolatedSessionDir, 'workflow.json'), JSON.stringify({
      workflowType: 'quick',
      stages: { DEV: { status: 'active' } },
    }));

    const result = spawnSync('node', [STATUSLINE_PATH], {
      input: JSON.stringify({ session_id: isolatedSessionId, context_window: { used_percentage: 20 } }),
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, HOME: tmpHome },
    });
    const plain = stripAnsi(result.stdout || '');
    const lines = plain.split('\n').filter(l => l.trim());
    // 空字串 workflowId → fallback → 從 session 層級讀取 → DEV active → 雙行
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain('developer');
  });
});

// ── Feature 8: compacting 標記偵測 ──

describe('compacting 標記偵測', () => {
  const os = require('os');
  const path = require('path');
  const { mkdirSync, writeFileSync, existsSync, rmSync } = require('fs');

  const tmpHome = path.join(os.tmpdir(), `home-compacting-test-${Date.now()}`);
  const sessionId = `compacting-${Date.now()}`;
  const sessionDir = path.join(tmpHome, '.overtone', 'sessions', sessionId);

  function runWithSession(stdinData = {}) {
    return spawnSync('node', [STATUSLINE_PATH], {
      input: JSON.stringify({ ...stdinData, session_id: sessionId }),
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, HOME: tmpHome },
    });
  }

  afterAll(() => {
    try { rmSync(tmpHome, { recursive: true, force: true }); } catch { /* 靜默 */ }
  });

  it('compacting 標記存在時 ctx 顯示 --%', () => {
    mkdirSync(sessionDir, { recursive: true });
    // 寫入 compacting 標記
    writeFileSync(path.join(sessionDir, 'compacting'), '', 'utf8');

    const result = runWithSession({ context_window: { used_percentage: 85 } });
    const plain = stripAnsi(result.stdout || '');
    // 應顯示 --% 而非 85%
    expect(plain).toContain('--%');
    expect(plain).not.toContain('85%');
  });

  it('compacting 標記讀取後被刪除', () => {
    mkdirSync(sessionDir, { recursive: true });
    const compactingPath = path.join(sessionDir, 'compacting');
    writeFileSync(compactingPath, '', 'utf8');

    // 第一次呼叫：偵測到標記 → 顯示 --% + 刪除標記
    runWithSession({ context_window: { used_percentage: 85 } });
    expect(existsSync(compactingPath)).toBe(false);

    // 第二次呼叫：標記已刪除 → 恢復正常百分比顯示
    const result2 = runWithSession({ context_window: { used_percentage: 85 } });
    const plain2 = stripAnsi(result2.stdout || '');
    expect(plain2).toContain('85%');
    expect(plain2).not.toContain('--%');
  });
});

// ── Feature 6: 佇列進度顯示 ──

describe('佇列進度顯示', () => {
  const os = require('os');
  const path = require('path');
  const crypto = require('crypto');
  const { mkdirSync, writeFileSync, rmSync } = require('fs');

  const tmpHome = path.join(os.tmpdir(), `home-queue-statusline-test-${Date.now()}`);
  const sessionId = `queue-statusline-${Date.now()}`;
  const sessionDir = path.join(tmpHome, '.overtone', 'sessions', sessionId);

  // 計算 execution-queue.json 路徑（與 paths.js projectHash 邏輯一致）
  function queueDir(projectRoot) {
    const hash = crypto.createHash('sha256').update(projectRoot).digest('hex').slice(0, 8);
    return path.join(tmpHome, '.overtone', 'global', hash);
  }

  function writeWorkflow(data) {
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(path.join(sessionDir, 'workflow.json'), JSON.stringify(data));
  }

  function writeQueue(projectRoot, queue) {
    const dir = queueDir(projectRoot);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'execution-queue.json'), JSON.stringify(queue));
  }

  function runWithSessionAndCwd(projectRoot, stdinData = {}) {
    return spawnSync('node', [STATUSLINE_PATH], {
      input: JSON.stringify({ ...stdinData, session_id: sessionId, cwd: projectRoot }),
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, HOME: tmpHome },
    });
  }

  const projectRoot = path.join(tmpHome, 'project');

  beforeAll(() => {
    // 建立 active workflow
    writeWorkflow({
      workflowType: 'quick',
      stages: { DEV: { status: 'active' } },
    });
  });

  afterAll(() => {
    try { rmSync(tmpHome, { recursive: true, force: true }); } catch { /* 靜默 */ }
  });

  it('多項佇列有未完成項目時，Line 2 顯示 📦 completed/total', () => {
    writeQueue(projectRoot, {
      items: [
        { name: 'A', workflow: 'quick', status: 'completed' },
        { name: 'B', workflow: 'quick', status: 'in_progress' },
        { name: 'C', workflow: 'quick', status: 'pending' },
      ],
      autoExecute: true,
      source: 'test',
    });

    const result = runWithSessionAndCwd(projectRoot, { context_window: { used_percentage: 20 } });
    const plain = stripAnsi(result.stdout || '');
    expect(plain).toContain('📦 1/3');
  });

  it('佇列全部完成時不顯示 📦', () => {
    writeQueue(projectRoot, {
      items: [
        { name: 'A', workflow: 'quick', status: 'completed' },
        { name: 'B', workflow: 'quick', status: 'completed' },
      ],
      autoExecute: true,
      source: 'test',
    });

    const result = runWithSessionAndCwd(projectRoot, { context_window: { used_percentage: 20 } });
    const plain = stripAnsi(result.stdout || '');
    expect(plain).not.toContain('📦');
  });

  it('佇列只有 1 項時不顯示 📦', () => {
    writeQueue(projectRoot, {
      items: [
        { name: 'A', workflow: 'quick', status: 'in_progress' },
      ],
      autoExecute: true,
      source: 'test',
    });

    const result = runWithSessionAndCwd(projectRoot, { context_window: { used_percentage: 20 } });
    const plain = stripAnsi(result.stdout || '');
    expect(plain).not.toContain('📦');
  });

  it('無佇列時不顯示 📦', () => {
    // 使用不存在的 projectRoot，不寫 queue 檔案
    const emptyRoot = path.join(tmpHome, 'empty-project');

    const result = runWithSessionAndCwd(emptyRoot, { context_window: { used_percentage: 20 } });
    const plain = stripAnsi(result.stdout || '');
    expect(plain).not.toContain('📦');
  });

  it('佇列讀取失敗時不 crash（安靜跳過）', () => {
    // 寫入損壞的 JSON
    const dir = queueDir(projectRoot);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'execution-queue.json'), '{invalid json}');

    const result = runWithSessionAndCwd(projectRoot, { context_window: { used_percentage: 20 } });
    expect(result.status ?? 0).toBe(0);
    const plain = stripAnsi(result.stdout || '');
    expect(plain).not.toContain('📦');
  });
});
