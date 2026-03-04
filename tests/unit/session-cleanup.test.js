'use strict';
/**
 * session-cleanup.test.js
 *
 * 驗證 session-cleanup.js 的三個核心函式：
 *   cleanupStaleSessions — 過期 session 清理
 *   cleanupOrphanFiles   — orphan 暫存檔清理
 *   runCleanup           — 一鍵清理入口
 *
 * 策略：所有操作使用 mkdtempSync 建立的臨時目錄，不操作真實 ~/.overtone/sessions/。
 */

const { describe, test, expect, beforeEach, afterEach } = require('bun:test');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const { cleanupStaleSessions, cleanupOrphanFiles, cleanupStaleGlobalDirs, runCleanup } = require(
  path.join(SCRIPTS_LIB, 'session-cleanup')
);

// ── 工具：建立 N 天前的 mtime ──

/**
 * 計算 N 天前的時間戳（Date 物件）
 * @param {number} days - 天數
 * @returns {Date}
 */
function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/**
 * 計算 N 小時前的時間戳（Date 物件）
 * @param {number} hours - 小時數
 * @returns {Date}
 */
function hoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

/**
 * 設定目錄的 mtime（同時設定 atime）
 * @param {string} filePath
 * @param {Date} date
 */
function setMtime(filePath, date) {
  fs.utimesSync(filePath, date, date);
}

// ── 臨時目錄管理 ──

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overtone-cleanup-test-'));
});

afterEach(() => {
  try {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  } catch {
    // 清理失敗不影響測試結果
  }
});

// ── cleanupStaleSessions ──

describe('cleanupStaleSessions — 過期 session 清理', () => {

  test('正確刪除超過 maxAgeDays 的 session 目錄', () => {
    // 建立 sessions 目錄
    const sessionsDir = path.join(tmpDir, 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });

    // 建立一個過期 session（10 天前）
    const staleId = 'stale-session-001';
    const stalePath = path.join(sessionsDir, staleId);
    fs.mkdirSync(stalePath);
    fs.writeFileSync(path.join(stalePath, 'workflow.json'), '{}');
    setMtime(stalePath, daysAgo(10));
    setMtime(path.join(stalePath, 'workflow.json'), daysAgo(10));

    const result = cleanupStaleSessions({ sessionsDir, maxAgeDays: 7 });

    expect(result.cleaned).toBe(1);
    expect(result.errors).toEqual([]);
    expect(fs.existsSync(stalePath)).toBe(false);
  });

  test('保護 maxAgeDays 以內的 session 不被刪除', () => {
    const sessionsDir = path.join(tmpDir, 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });

    // 建立一個最近的 session（1 天前）
    const recentId = 'recent-session-001';
    const recentPath = path.join(sessionsDir, recentId);
    fs.mkdirSync(recentPath);
    fs.writeFileSync(path.join(recentPath, 'workflow.json'), '{}');
    setMtime(recentPath, daysAgo(1));
    setMtime(path.join(recentPath, 'workflow.json'), daysAgo(1));

    const result = cleanupStaleSessions({ sessionsDir, maxAgeDays: 7 });

    expect(result.cleaned).toBe(0);
    expect(result.skipped).toContain(recentId);
    expect(fs.existsSync(recentPath)).toBe(true);
  });

  test('保護 currentSessionId 指定的 session 不被刪除（即使已過期）', () => {
    const sessionsDir = path.join(tmpDir, 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });

    // 建立一個「過期」的 session，但它是當前 session
    const currentId = 'current-session-001';
    const currentPath = path.join(sessionsDir, currentId);
    fs.mkdirSync(currentPath);
    fs.writeFileSync(path.join(currentPath, 'workflow.json'), '{}');
    setMtime(currentPath, daysAgo(30));
    setMtime(path.join(currentPath, 'workflow.json'), daysAgo(30));

    const result = cleanupStaleSessions({
      sessionsDir,
      maxAgeDays: 7,
      currentSessionId: currentId,
    });

    expect(result.cleaned).toBe(0);
    expect(result.skipped).toContain(currentId);
    expect(fs.existsSync(currentPath)).toBe(true);
  });

  test('混合場景：部分過期、部分最近、部分為當前 session', () => {
    const sessionsDir = path.join(tmpDir, 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });

    // 過期 session
    const staleId1 = 'stale-001';
    const stalePath1 = path.join(sessionsDir, staleId1);
    fs.mkdirSync(stalePath1);
    setMtime(stalePath1, daysAgo(14));

    const staleId2 = 'stale-002';
    const stalePath2 = path.join(sessionsDir, staleId2);
    fs.mkdirSync(stalePath2);
    setMtime(stalePath2, daysAgo(8));

    // 最近的 session
    const recentId = 'recent-001';
    const recentPath = path.join(sessionsDir, recentId);
    fs.mkdirSync(recentPath);
    setMtime(recentPath, daysAgo(3));

    // 當前 session（即使過期也保護）
    const currentId = 'current-001';
    const currentPath = path.join(sessionsDir, currentId);
    fs.mkdirSync(currentPath);
    setMtime(currentPath, daysAgo(20));

    const result = cleanupStaleSessions({
      sessionsDir,
      maxAgeDays: 7,
      currentSessionId: currentId,
    });

    expect(result.cleaned).toBe(2);
    expect(fs.existsSync(stalePath1)).toBe(false);
    expect(fs.existsSync(stalePath2)).toBe(false);
    expect(fs.existsSync(recentPath)).toBe(true);
    expect(fs.existsSync(currentPath)).toBe(true);
    expect(result.skipped).toContain(recentId);
    expect(result.skipped).toContain(currentId);
  });

  test('sessions 目錄不存在時回傳空結果（不拋例外）', () => {
    const nonExistentDir = path.join(tmpDir, 'no-such-sessions');

    const result = cleanupStaleSessions({ sessionsDir: nonExistentDir });

    expect(result.cleaned).toBe(0);
    expect(result.errors).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  test('空 sessions 目錄時回傳 cleaned: 0', () => {
    const sessionsDir = path.join(tmpDir, 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });

    const result = cleanupStaleSessions({ sessionsDir, maxAgeDays: 7 });

    expect(result.cleaned).toBe(0);
    expect(result.errors).toEqual([]);
  });

  test('session 目錄內的檔案最新 mtime 決定存活（目錄本身舊但檔案新）', () => {
    const sessionsDir = path.join(tmpDir, 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });

    const sessionId = 'mixed-mtime-session';
    const sessionPath = path.join(sessionsDir, sessionId);
    fs.mkdirSync(sessionPath);

    // 目錄本身設為舊時間，但目錄內的檔案是最近的
    const timelineFile = path.join(sessionPath, 'timeline.jsonl');
    fs.writeFileSync(timelineFile, '{"event":"test"}\n');
    setMtime(sessionPath, daysAgo(30));
    // 檔案設為 2 天前（新的）
    setMtime(timelineFile, daysAgo(2));

    const result = cleanupStaleSessions({ sessionsDir, maxAgeDays: 7 });

    // 檔案是 2 天前（新的），所以不應刪除
    expect(result.cleaned).toBe(0);
    expect(fs.existsSync(sessionPath)).toBe(true);
  });

  test('只跳過非目錄的 entry', () => {
    const sessionsDir = path.join(tmpDir, 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });

    // 在 sessions 目錄下放一個檔案（不是目錄）
    const nonDirFile = path.join(sessionsDir, 'some-file.txt');
    fs.writeFileSync(nonDirFile, 'data');
    setMtime(nonDirFile, daysAgo(30));

    const result = cleanupStaleSessions({ sessionsDir, maxAgeDays: 7 });

    // 非目錄不被計入 cleaned
    expect(result.cleaned).toBe(0);
    expect(fs.existsSync(nonDirFile)).toBe(true);
  });
});

// ── cleanupOrphanFiles ──

describe('cleanupOrphanFiles — orphan 暫存檔清理', () => {

  test('正確刪除超過 maxAgeHours 的 .tmp 檔案', () => {
    // 建立一個過期的 .tmp 檔案（2 小時前）
    const tmpFile = path.join(tmpDir, 'test.tmp');
    fs.writeFileSync(tmpFile, 'temp data');
    setMtime(tmpFile, hoursAgo(2));

    const result = cleanupOrphanFiles(tmpDir, { maxAgeHours: 1 });

    expect(result.cleaned).toBe(1);
    expect(result.errors).toEqual([]);
    expect(fs.existsSync(tmpFile)).toBe(false);
  });

  test('正確刪除過期的 .bak 和 .lock 檔案', () => {
    const bakFile = path.join(tmpDir, 'data.bak');
    const lockFile = path.join(tmpDir, 'process.lock');
    fs.writeFileSync(bakFile, 'backup');
    fs.writeFileSync(lockFile, 'locked');
    setMtime(bakFile, hoursAgo(3));
    setMtime(lockFile, hoursAgo(5));

    const result = cleanupOrphanFiles(tmpDir, { maxAgeHours: 1 });

    expect(result.cleaned).toBe(2);
    expect(fs.existsSync(bakFile)).toBe(false);
    expect(fs.existsSync(lockFile)).toBe(false);
  });

  test('保留 maxAgeHours 以內的暫存檔', () => {
    // 建立一個最近的 .tmp 檔案（30 分鐘前）
    const recentTmp = path.join(tmpDir, 'recent.tmp');
    fs.writeFileSync(recentTmp, 'recent data');
    setMtime(recentTmp, hoursAgo(0.5));

    const result = cleanupOrphanFiles(tmpDir, { maxAgeHours: 1 });

    expect(result.cleaned).toBe(0);
    expect(result.skipped).toContain('recent.tmp');
    expect(fs.existsSync(recentTmp)).toBe(true);
  });

  test('不刪除非暫存副檔名的檔案（.json、.md 等）', () => {
    const jsonFile = path.join(tmpDir, 'config.json');
    const mdFile = path.join(tmpDir, 'readme.md');
    fs.writeFileSync(jsonFile, '{}');
    fs.writeFileSync(mdFile, '# test');
    setMtime(jsonFile, hoursAgo(10));
    setMtime(mdFile, hoursAgo(10));

    const result = cleanupOrphanFiles(tmpDir, { maxAgeHours: 1 });

    expect(result.cleaned).toBe(0);
    expect(fs.existsSync(jsonFile)).toBe(true);
    expect(fs.existsSync(mdFile)).toBe(true);
  });

  test('overtoneHome 不存在時回傳空結果（不拋例外）', () => {
    const nonExistentDir = path.join(tmpDir, 'no-such-dir');

    const result = cleanupOrphanFiles(nonExistentDir, { maxAgeHours: 1 });

    expect(result.cleaned).toBe(0);
    expect(result.errors).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  test('混合場景：過期和最近的暫存檔並存', () => {
    const oldTmp = path.join(tmpDir, 'old.tmp');
    const newTmp = path.join(tmpDir, 'new.tmp');
    const oldBak = path.join(tmpDir, 'old.bak');

    fs.writeFileSync(oldTmp, 'old');
    fs.writeFileSync(newTmp, 'new');
    fs.writeFileSync(oldBak, 'backup');

    setMtime(oldTmp, hoursAgo(5));
    setMtime(newTmp, hoursAgo(0.1));
    setMtime(oldBak, hoursAgo(2));

    const result = cleanupOrphanFiles(tmpDir, { maxAgeHours: 1 });

    expect(result.cleaned).toBe(2);
    expect(fs.existsSync(oldTmp)).toBe(false);
    expect(fs.existsSync(oldBak)).toBe(false);
    expect(fs.existsSync(newTmp)).toBe(true);
  });
});

// ── cleanupStaleGlobalDirs ──

describe('cleanupStaleGlobalDirs — 全域 hash 目錄清理', () => {

  test('正確刪除超過 maxAgeDays 的孤兒 hash 目錄', () => {
    // 建立 global 目錄
    const globalDir = path.join(tmpDir, 'global');
    fs.mkdirSync(globalDir, { recursive: true });

    // 建立一個過期 hash 目錄（35 天前）
    const staleHash = 'abc12345';
    const stalePath = path.join(globalDir, staleHash);
    fs.mkdirSync(stalePath);
    fs.writeFileSync(path.join(stalePath, 'observations.jsonl'), '');
    setMtime(stalePath, daysAgo(35));
    setMtime(path.join(stalePath, 'observations.jsonl'), daysAgo(35));

    const result = cleanupStaleGlobalDirs({ globalDir, maxAgeDays: 30 });

    expect(result.cleaned).toBe(1);
    expect(result.errors).toEqual([]);
    expect(fs.existsSync(stalePath)).toBe(false);
  });

  test('保留最近更新過的 hash 目錄', () => {
    const globalDir = path.join(tmpDir, 'global');
    fs.mkdirSync(globalDir, { recursive: true });

    // 建立一個最近更新的 hash 目錄（5 天前）
    const recentHash = 'def67890';
    const recentPath = path.join(globalDir, recentHash);
    fs.mkdirSync(recentPath);
    fs.writeFileSync(path.join(recentPath, 'scores.jsonl'), '');
    setMtime(recentPath, daysAgo(5));
    setMtime(path.join(recentPath, 'scores.jsonl'), daysAgo(5));

    const result = cleanupStaleGlobalDirs({ globalDir, maxAgeDays: 30 });

    expect(result.cleaned).toBe(0);
    expect(result.skipped).toBe(1);
    expect(fs.existsSync(recentPath)).toBe(true);
  });

  test('dry-run 模式：回傳清單但不實際刪除', () => {
    const globalDir = path.join(tmpDir, 'global');
    fs.mkdirSync(globalDir, { recursive: true });

    // 建立過期 hash 目錄
    const staleHash = 'aaa11111';
    const stalePath = path.join(globalDir, staleHash);
    fs.mkdirSync(stalePath);
    setMtime(stalePath, daysAgo(40));

    const result = cleanupStaleGlobalDirs({ globalDir, maxAgeDays: 30, dryRun: true });

    // dry-run：不刪除，但 dryRunList 有該路徑
    expect(result.cleaned).toBe(0);
    expect(result.dryRunList).toContain(stalePath);
    expect(fs.existsSync(stalePath)).toBe(true);
  });

  test('混合場景：過期和最近的 hash 目錄並存', () => {
    const globalDir = path.join(tmpDir, 'global');
    fs.mkdirSync(globalDir, { recursive: true });

    // 過期目錄（35 天前）
    const staleHash1 = 'stale001';
    const stalePath1 = path.join(globalDir, staleHash1);
    fs.mkdirSync(stalePath1);
    setMtime(stalePath1, daysAgo(35));

    const staleHash2 = 'stale002';
    const stalePath2 = path.join(globalDir, staleHash2);
    fs.mkdirSync(stalePath2);
    setMtime(stalePath2, daysAgo(60));

    // 最近目錄（10 天前）
    const recentHash = 'recent01';
    const recentPath = path.join(globalDir, recentHash);
    fs.mkdirSync(recentPath);
    setMtime(recentPath, daysAgo(10));

    const result = cleanupStaleGlobalDirs({ globalDir, maxAgeDays: 30 });

    expect(result.cleaned).toBe(2);
    expect(result.skipped).toBe(1);
    expect(fs.existsSync(stalePath1)).toBe(false);
    expect(fs.existsSync(stalePath2)).toBe(false);
    expect(fs.existsSync(recentPath)).toBe(true);
  });

  test('global 目錄不存在時回傳空結果（不拋例外）', () => {
    const nonExistentDir = path.join(tmpDir, 'no-such-global');

    const result = cleanupStaleGlobalDirs({ globalDir: nonExistentDir });

    expect(result.cleaned).toBe(0);
    expect(result.errors).toEqual([]);
    expect(result.dryRunList).toEqual([]);
    expect(result.skipped).toBe(0);
  });

  test('目錄內的最新檔案 mtime 決定存活（目錄本身舊但檔案新）', () => {
    const globalDir = path.join(tmpDir, 'global');
    fs.mkdirSync(globalDir, { recursive: true });

    const hashDir = 'mixmtime';
    const hashPath = path.join(globalDir, hashDir);
    fs.mkdirSync(hashPath);

    // 目錄本身設為 60 天前，但內部有一個 20 天前的檔案
    const recentFile = path.join(hashPath, 'failures.jsonl');
    fs.writeFileSync(recentFile, '');
    setMtime(hashPath, daysAgo(60));
    setMtime(recentFile, daysAgo(20));

    const result = cleanupStaleGlobalDirs({ globalDir, maxAgeDays: 30 });

    // 檔案 20 天前（新的），不應刪除
    expect(result.cleaned).toBe(0);
    expect(result.skipped).toBe(1);
    expect(fs.existsSync(hashPath)).toBe(true);
  });

  test('空 global 目錄時回傳 cleaned: 0', () => {
    const globalDir = path.join(tmpDir, 'global');
    fs.mkdirSync(globalDir, { recursive: true });

    const result = cleanupStaleGlobalDirs({ globalDir, maxAgeDays: 30 });

    expect(result.cleaned).toBe(0);
    expect(result.errors).toEqual([]);
  });
});

// ── runCleanup ──

describe('runCleanup — 一鍵清理入口', () => {

  test('回傳包含 sessions、orphanFiles 和 globalDirs 的完整報告', () => {
    const sessionsDir = path.join(tmpDir, 'sessions');
    const globalDir = path.join(tmpDir, 'global');
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.mkdirSync(globalDir, { recursive: true });

    const report = runCleanup('', tmpDir);

    expect(report).toHaveProperty('sessions');
    expect(report).toHaveProperty('orphanFiles');
    expect(report).toHaveProperty('globalDirs');
    expect(report.sessions).toHaveProperty('cleaned');
    expect(report.sessions).toHaveProperty('errors');
    expect(report.sessions).toHaveProperty('skipped');
    expect(report.orphanFiles).toHaveProperty('cleaned');
    expect(report.globalDirs).toHaveProperty('cleaned');
  });

  test('同時清理過期 session 和過期暫存檔', () => {
    // 建立 sessions 目錄和過期 session
    const sessionsDir = path.join(tmpDir, 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });

    const staleId = 'stale-session-xyz';
    const stalePath = path.join(sessionsDir, staleId);
    fs.mkdirSync(stalePath);
    setMtime(stalePath, daysAgo(10));

    // 建立過期暫存檔
    const oldTmp = path.join(tmpDir, 'old.tmp');
    fs.writeFileSync(oldTmp, 'temp');
    setMtime(oldTmp, hoursAgo(3));

    const report = runCleanup('', tmpDir, { maxAgeDays: 7 });

    expect(report.sessions.cleaned).toBe(1);
    expect(report.orphanFiles.cleaned).toBe(1);
    expect(fs.existsSync(stalePath)).toBe(false);
    expect(fs.existsSync(oldTmp)).toBe(false);
  });

  test('傳入 currentSessionId 保護當前 session', () => {
    const sessionsDir = path.join(tmpDir, 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });

    const currentId = 'my-current-session';
    const currentPath = path.join(sessionsDir, currentId);
    fs.mkdirSync(currentPath);
    setMtime(currentPath, daysAgo(20));

    const report = runCleanup(currentId, tmpDir, { maxAgeDays: 7 });

    expect(report.sessions.cleaned).toBe(0);
    expect(report.sessions.skipped).toContain(currentId);
    expect(fs.existsSync(currentPath)).toBe(true);
  });

  test('同時清理過期 global hash 目錄', () => {
    const sessionsDir = path.join(tmpDir, 'sessions');
    const globalDir = path.join(tmpDir, 'global');
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.mkdirSync(globalDir, { recursive: true });

    // 建立過期 global hash 目錄（40 天前）
    const staleHash = 'deadbeef';
    const staleHashPath = path.join(globalDir, staleHash);
    fs.mkdirSync(staleHashPath);
    setMtime(staleHashPath, daysAgo(40));

    const report = runCleanup('', tmpDir, { globalMaxAgeDays: 30 });

    expect(report.globalDirs.cleaned).toBe(1);
    expect(fs.existsSync(staleHashPath)).toBe(false);
  });
});
