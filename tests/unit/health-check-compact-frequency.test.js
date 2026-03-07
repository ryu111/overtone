// @sequential
'use strict';
/**
 * health-check-compact-frequency.test.js — checkCompactFrequency 單元測試
 *
 * 覆蓋：
 *   Feature D: health-check checkCompactFrequency（check #21）
 *   Scenario D-1: sessions 目錄不存在時回傳空陣列
 *   Scenario D-2: 有異常 session 時回傳 warning finding
 *   Scenario D-3: 所有 session 均無異常時回傳空陣列
 *   Scenario D-4: compact-count.json 不含 autoTimestamps 時跳過
 *   Scenario D-5: 多個 session 各自獨立判斷
 */

const { describe, it, expect, beforeEach, afterEach } = require('bun:test');
const path = require('path');
const { join } = path;
const os = require('os');
const { mkdirSync, writeFileSync, rmSync } = require('fs');
const { SCRIPTS_DIR, SCRIPTS_LIB } = require('../helpers/paths');

const { checkCompactFrequency } = require(join(SCRIPTS_DIR, 'health-check'));
const { COMPACT_FREQ_WINDOW_MS, COMPACT_FREQ_THRESHOLD } =
  require(join(SCRIPTS_LIB, 'pre-compact-handler'));

// ── 輔助函式 ─────────────────────────────────────────────────────────────────

function createTmpSessionsDir() {
  const dir = path.join(os.tmpdir(), `ot-hc-cf-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function createSession(sessionsDir, sessionId, compactCountData) {
  const sessionDir = path.join(sessionsDir, sessionId);
  mkdirSync(sessionDir, { recursive: true });
  if (compactCountData !== null) {
    writeFileSync(
      path.join(sessionDir, 'compact-count.json'),
      JSON.stringify(compactCountData),
    );
  }
  return sessionDir;
}

function recentTimestamps(count, windowMs) {
  // 產生 count 個在窗口內的時間戳
  return Array.from({ length: count }, (_, i) =>
    new Date(Date.now() - Math.floor(windowMs * (i + 1) / (count + 1))).toISOString()
  );
}

// ── Feature D: checkCompactFrequency ─────────────────────────────────────────

describe('Feature D: checkCompactFrequency', () => {
  let sessionsDir;

  beforeEach(() => {
    sessionsDir = createTmpSessionsDir();
  });

  afterEach(() => {
    try { rmSync(sessionsDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('Scenario D-1: sessions 目錄不存在時回傳空陣列', () => {
    const nonExistent = path.join(os.tmpdir(), `ot-hc-cf-nonexistent-${Date.now()}`);
    const findings = checkCompactFrequency(nonExistent);
    expect(Array.isArray(findings)).toBe(true);
    expect(findings.length).toBe(0);
  });

  it('Scenario D-2: 有異常 session 時回傳 warning finding', () => {
    // 3 個窗口內的時間戳 → 達到門檻
    const timestamps = recentTimestamps(COMPACT_FREQ_THRESHOLD, COMPACT_FREQ_WINDOW_MS);
    createSession(sessionsDir, 'sess-anomaly', {
      auto: COMPACT_FREQ_THRESHOLD,
      manual: 0,
      autoTimestamps: timestamps,
    });

    const findings = checkCompactFrequency(sessionsDir);
    expect(findings.length).toBe(1);
    expect(findings[0].check).toBe('compact-frequency');
    expect(findings[0].severity).toBe('warning');
    expect(typeof findings[0].message).toBe('string');
    expect(findings[0].message).toContain('sess-anomaly');
  });

  it('Scenario D-3: 所有 session 均無異常時回傳空陣列', () => {
    // 只有 2 個時間戳（未達門檻 3）
    const timestamps = recentTimestamps(2, COMPACT_FREQ_WINDOW_MS);
    createSession(sessionsDir, 'sess-ok-1', { auto: 2, manual: 0, autoTimestamps: timestamps });
    createSession(sessionsDir, 'sess-ok-2', { auto: 1, manual: 0, autoTimestamps: [timestamps[0]] });

    const findings = checkCompactFrequency(sessionsDir);
    expect(findings.length).toBe(0);
  });

  it('Scenario D-4: compact-count.json 不含 autoTimestamps 時跳過，回傳空陣列', () => {
    // 舊格式，無 autoTimestamps
    createSession(sessionsDir, 'sess-old-format', { auto: 5, manual: 2 });

    const findings = checkCompactFrequency(sessionsDir);
    expect(findings.length).toBe(0);
  });

  it('Scenario D-4b: autoTimestamps 為空陣列時跳過', () => {
    createSession(sessionsDir, 'sess-empty-ts', { auto: 0, manual: 0, autoTimestamps: [] });

    const findings = checkCompactFrequency(sessionsDir);
    expect(findings.length).toBe(0);
  });

  it('Scenario D-5: 多個 session 各自獨立判斷', () => {
    const anomalyTs = recentTimestamps(COMPACT_FREQ_THRESHOLD, COMPACT_FREQ_WINDOW_MS);
    const normalTs = recentTimestamps(2, COMPACT_FREQ_WINDOW_MS);

    createSession(sessionsDir, 'sess-bad-1', {
      auto: COMPACT_FREQ_THRESHOLD,
      manual: 0,
      autoTimestamps: anomalyTs,
    });
    createSession(sessionsDir, 'sess-bad-2', {
      auto: COMPACT_FREQ_THRESHOLD,
      manual: 0,
      autoTimestamps: anomalyTs,
    });
    createSession(sessionsDir, 'sess-good', {
      auto: 2,
      manual: 0,
      autoTimestamps: normalTs,
    });

    const findings = checkCompactFrequency(sessionsDir);
    expect(findings.length).toBe(2);
    const sessionIds = findings.map((f) => f.message).join(' ');
    expect(sessionIds).toContain('sess-bad-1');
    expect(sessionIds).toContain('sess-bad-2');
    expect(sessionIds).not.toContain('sess-good');
  });

  it('D 不含 compact-count.json 的 session 目錄被跳過', () => {
    // 建立空 session 目錄（無 compact-count.json）
    mkdirSync(path.join(sessionsDir, 'sess-no-file'), { recursive: true });

    const findings = checkCompactFrequency(sessionsDir);
    expect(findings.length).toBe(0);
  });

  it('D finding 包含 file、message、detail 欄位', () => {
    const timestamps = recentTimestamps(COMPACT_FREQ_THRESHOLD, COMPACT_FREQ_WINDOW_MS);
    createSession(sessionsDir, 'sess-detail', {
      auto: COMPACT_FREQ_THRESHOLD,
      manual: 0,
      autoTimestamps: timestamps,
    });

    const findings = checkCompactFrequency(sessionsDir);
    expect(findings.length).toBe(1);
    const f = findings[0];
    expect(typeof f.file).toBe('string');
    expect(typeof f.message).toBe('string');
    expect(typeof f.detail).toBe('string');
    expect(f.detail).toContain('autoCount');
  });
});

// runAllChecks 整合驗證已由 health-check-proactive.test.js 覆蓋（checks.length toBe(21)）
// 此處不重複呼叫 runAllChecks，避免並行測試 timeout
