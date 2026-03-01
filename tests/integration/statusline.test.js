'use strict';
/**
 * statusline.integration.test.js — statusline.js 整合測試
 *
 * 測試範圍：
 *   - 完整 stdin JSON 模擬（context_window + cost + session_id）
 *   - workflow.json 讀取與格式化
 *   - compact-count.json 讀取
 *   - pre-compact.js compact count 追蹤（使用真實 ~/.overtone 路徑）
 *   - paths.session.compactCount 路徑正確
 */

const { describe, it, expect, beforeEach, afterEach, afterAll } = require('bun:test');
const os = require('os');
const path = require('path');
const { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } = require('fs');
const { spawnSync } = require('child_process');
const { join } = require('path');
const { homedir } = require('os');
const { SCRIPTS_DIR, HOOKS_DIR, SCRIPTS_LIB } = require('../helpers/paths');

const STATUSLINE_PATH = join(SCRIPTS_DIR, 'statusline.js');
const PRE_COMPACT_PATH = join(HOOKS_DIR, 'session', 'pre-compact.js');

// paths 模組（使用真實 ~/.overtone 路徑，和 pre-compact.js 一致）
const paths = require(join(SCRIPTS_LIB, 'paths'));
const stateLib = require(join(SCRIPTS_LIB, 'state'));

// ANSI 剝離
function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// ── 共用 timestamp（確保多個 test session 不衝突）──
const TS = Date.now();

// ── Feature 1: 完整 stdin 流程（使用 HOME 覆寫讓 statusline.js 讀測試路徑）──

describe('完整 stdin 輸入格式', () => {
  // statusline.js 不 require paths.js，直接用 homedir()
  // 所以 HOME 覆寫有效（新 process）
  // sessionDir 必須是 tmpHome/.overtone/sessions/sessionId
  let tmpHome;
  let sessionId;
  let sessionDir;

  beforeEach(() => {
    tmpHome = path.join(os.tmpdir(), `home-statusline-intg-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    sessionId = `statusline-intg-${Date.now()}`;
    sessionDir = path.join(tmpHome, '.overtone', 'sessions', sessionId);
    mkdirSync(sessionDir, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(tmpHome, { recursive: true, force: true }); } catch { /* 靜默 */ }
  });

  function runStatusline(input = {}) {
    return spawnSync('node', [STATUSLINE_PATH], {
      input: JSON.stringify({ ...input, session_id: sessionId }),
      encoding: 'utf8',
      timeout: 15000,
      env: { ...process.env, HOME: tmpHome },
    });
  }

  it('包含 context_window + cost + session_id 時正確輸出兩行', () => {
    writeFileSync(path.join(sessionDir, 'workflow.json'), JSON.stringify({
      workflowType: 'quick',
      stages: { DEV: { status: 'active' }, REVIEW: { status: 'pending' } },
    }));

    const result = runStatusline({
      context_window: { used_percentage: 45 },
      cost: { total_input_tokens: 200000, total_output_tokens: 45000 },
    });

    const plain = stripAnsi(result.stdout || '');
    const lines = plain.split('\n').filter(l => l.trim());

    // 兩行輸出
    expect(lines.length).toBe(2);

    // Line 1：workflow type + agent
    expect(lines[0]).toContain('quick');
    expect(lines[0]).toContain('DEV');
    expect(lines[0]).toContain('developer');

    // Line 2：metrics
    expect(lines[1]).toContain('ctx');
    expect(lines[1]).toContain('45%');
    expect(lines[1]).toContain('5h');
    expect(lines[1]).toContain('7d');
    expect(lines[1]).toContain('245k');
    expect(lines[1]).toContain('♻️');
  });

  it('session_id 有效但 workflow.json 不存在時輸出單行', () => {
    // 不寫 workflow.json
    const result = runStatusline({ context_window: { used_percentage: 30 } });

    const lines = stripAnsi(result.stdout || '').split('\n').filter(l => l.trim());
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('ctx');
    expect(lines[0]).toContain('30%');
  });
});

// ── Feature 2: compact-count.json 讀取（statusline.js 角度）──

describe('compact-count.json 整合（statusline 讀取）', () => {
  let tmpHome;
  let sessionId;
  let sessionDir;

  beforeEach(() => {
    tmpHome = path.join(os.tmpdir(), `home-ccount-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    sessionId = `ccount-statusline-${Date.now()}`;
    sessionDir = path.join(tmpHome, '.overtone', 'sessions', sessionId);
    mkdirSync(sessionDir, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(tmpHome, { recursive: true, force: true }); } catch { /* 靜默 */ }
  });

  function runStatusline(input = {}) {
    return spawnSync('node', [STATUSLINE_PATH], {
      input: JSON.stringify({ ...input, session_id: sessionId }),
      encoding: 'utf8',
      timeout: 15000,
      env: { ...process.env, HOME: tmpHome },
    });
  }

  it('compact-count.json 存在時正確顯示 auto/manual 計數', () => {
    writeFileSync(path.join(sessionDir, 'workflow.json'), JSON.stringify({
      workflowType: 'standard',
      stages: { PLAN: { status: 'completed' }, DEV: { status: 'active' } },
    }));
    writeFileSync(path.join(sessionDir, 'compact-count.json'), JSON.stringify({
      auto: 2,
      manual: 1,
    }));

    const result = runStatusline({ context_window: { used_percentage: 55 } });
    const plain = stripAnsi(result.stdout || '');
    expect(plain).toContain('2a 1m');
  });

  it('compact-count.json 不存在時顯示 0a 0m', () => {
    writeFileSync(path.join(sessionDir, 'workflow.json'), JSON.stringify({
      workflowType: 'quick',
      stages: { DEV: { status: 'active' } },
    }));
    // 不寫 compact-count.json

    const result = runStatusline({ context_window: { used_percentage: 20 } });
    const plain = stripAnsi(result.stdout || '');
    expect(plain).toContain('0a 0m');
  });
});

// ── Feature 3: pre-compact.js compact count 追蹤（使用真實 ~/.overtone 路徑）──
// 注意：pre-compact.js 使用 require paths.js，paths.js 在 load 時固定 OVERTONE_HOME
// 所以 HOME 覆寫對 pre-compact.js 無效，必須使用真實路徑

describe('pre-compact.js compact count 追蹤', () => {
  const SESSION_AUTO   = `pre-compact-auto-${TS}`;
  const SESSION_MANUAL = `pre-compact-manual-${TS}`;
  const SESSION_ACCUM  = `pre-compact-accum-${TS}`;

  // 標準 workflow state
  function initSession(sessionId) {
    stateLib.initState(sessionId, 'quick', ['DEV', 'REVIEW', 'RETRO']);
  }

  function runPreCompact(input = {}) {
    return spawnSync('node', [PRE_COMPACT_PATH], {
      input: JSON.stringify(input),
      encoding: 'utf8',
      timeout: 10000,
      env: {
        ...process.env,
        CLAUDE_SESSION_ID: '',
        OVERTONE_NO_DASHBOARD: '1',
      },
    });
  }

  afterAll(() => {
    [SESSION_AUTO, SESSION_MANUAL, SESSION_ACCUM].forEach(s => {
      try { rmSync(paths.sessionDir(s), { recursive: true, force: true }); } catch { /* 靜默 */ }
    });
  });

  it('第一次 compact（auto 類型）建立 compact-count.json { auto: 1, manual: 0 }', () => {
    initSession(SESSION_AUTO);

    runPreCompact({ session_id: SESSION_AUTO, type: 'auto' });

    const countPath = paths.session.compactCount(SESSION_AUTO);
    expect(existsSync(countPath)).toBe(true);

    const data = JSON.parse(readFileSync(countPath, 'utf8'));
    expect(data.auto).toBe(1);
    expect(data.manual).toBe(0);
  });

  it('第一次 compact（manual/未定義類型）建立 compact-count.json { auto: 0, manual: 1 }', () => {
    initSession(SESSION_MANUAL);

    runPreCompact({ session_id: SESSION_MANUAL });  // 無 type 欄位

    const countPath = paths.session.compactCount(SESSION_MANUAL);
    expect(existsSync(countPath)).toBe(true);

    const data = JSON.parse(readFileSync(countPath, 'utf8'));
    expect(data.auto).toBe(0);
    expect(data.manual).toBe(1);
  });

  it('累積計數：多次 compact 後正確遞增', () => {
    initSession(SESSION_ACCUM);

    runPreCompact({ session_id: SESSION_ACCUM, type: 'auto' });
    runPreCompact({ session_id: SESSION_ACCUM, type: 'auto' });
    runPreCompact({ session_id: SESSION_ACCUM });  // manual

    const countPath = paths.session.compactCount(SESSION_ACCUM);
    const data = JSON.parse(readFileSync(countPath, 'utf8'));
    expect(data.auto).toBe(2);
    expect(data.manual).toBe(1);
  });
});

// ── Feature 4: paths.session.compactCount ──

describe('paths.session.compactCount 路徑', () => {
  it('compactCount(id) 回傳包含 compact-count.json 的路徑', () => {
    const result = paths.session.compactCount('test-session-123');
    expect(result).toContain('test-session-123');
    expect(result).toContain('compact-count.json');
  });

  it('compactCount(id) 以 SESSIONS_DIR 為前綴', () => {
    const result = paths.session.compactCount('my-session');
    expect(result.startsWith(paths.SESSIONS_DIR)).toBe(true);
  });
});
