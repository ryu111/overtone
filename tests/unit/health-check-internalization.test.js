'use strict';
/**
 * health-check-internalization.test.js — 內化索引偵測單元測試
 *
 * 覆蓋 BDD Feature 6：checkInternalizationIndex
 *   Scenario 6-1: experience-index.json 不存在 → info
 *   Scenario 6-2: JSON 格式損壞 → warning
 *   Scenario 6-3: domains 為空陣列 → warning
 *   Scenario 6-4: 所有條目超過 30 天未更新 → info
 *   Scenario 6-5: 索引健康 → 無 warning/error
 *   Scenario 6-6: runAllChecks 包含第 17 項 internalization-index
 */

const { test, expect, describe, beforeEach, afterEach } = require('bun:test');
const path = require('path');
const os = require('os');
const { mkdirSync, writeFileSync, rmSync } = require('fs');

const {
  checkInternalizationIndex,
  runAllChecks,
} = require('../../plugins/overtone/scripts/health-check');

// ── 輔助函式 ──

function makeTmpGlobalDir() {
  const tmpDir = path.join(
    os.tmpdir(),
    `ot-intidx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  );
  mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

function writeIndexFile(globalDir, projectHash, data) {
  const dir = path.join(globalDir, projectHash);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'experience-index.json'), JSON.stringify(data, null, 2), 'utf8');
}

function makeHealthyEntry(daysAgo = 1) {
  const ts = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  return {
    projectHash: 'abc123',
    domains: ['testing', 'workflow-core'],
    lastUpdated: ts,
    sessionCount: 3,
  };
}

// ══════════════════════════════════════════════════════════════════
// Feature 6: checkInternalizationIndex
// ══════════════════════════════════════════════════════════════════

describe('checkInternalizationIndex', () => {
  let tmpGlobalDir;

  beforeEach(() => {
    tmpGlobalDir = makeTmpGlobalDir();
  });

  afterEach(() => {
    try { rmSync(tmpGlobalDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  // Scenario 6-1: 不存在索引 → info finding
  test('Scenario 6-1: experience-index.json 不存在時回傳 info level finding', () => {
    // tmpGlobalDir 存在但無任何子目錄
    const findings = checkInternalizationIndex(tmpGlobalDir);

    expect(Array.isArray(findings)).toBe(true);
    expect(findings.length).toBeGreaterThanOrEqual(1);

    const infoFindings = findings.filter((f) => f.severity === 'info');
    expect(infoFindings.length).toBeGreaterThanOrEqual(1);

    const f = infoFindings[0];
    expect(f.check).toBe('internalization-index');
    expect(f.message).toMatch(/尚未建立/);
  });

  // Scenario 6-1b: globalDir 本身不存在 → 同樣回傳 info
  test('Scenario 6-1b: globalDir 不存在時回傳 info finding（視同索引尚未建立）', () => {
    const nonExistDir = path.join(os.tmpdir(), `ot-nonexist-${Date.now()}`);
    const findings = checkInternalizationIndex(nonExistDir);

    expect(Array.isArray(findings)).toBe(true);
    const infoFindings = findings.filter((f) => f.severity === 'info');
    expect(infoFindings.length).toBeGreaterThanOrEqual(1);
    expect(infoFindings[0].check).toBe('internalization-index');
  });

  // Scenario 6-2: JSON 格式損壞 → warning
  test('Scenario 6-2: experience-index.json 格式損壞時回傳 warning finding', () => {
    const dir = path.join(tmpGlobalDir, 'proj1');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'experience-index.json'), '{ corrupted', 'utf8');

    const findings = checkInternalizationIndex(tmpGlobalDir);

    const warnFindings = findings.filter((f) => f.severity === 'warning');
    expect(warnFindings.length).toBeGreaterThanOrEqual(1);

    const f = warnFindings[0];
    expect(f.check).toBe('internalization-index');
    expect(f.message).toMatch(/JSON 格式損壞/);
  });

  // Scenario 6-3: domains 為空陣列 → warning
  test('Scenario 6-3: entries 中有 domains 為空陣列的條目時回傳 warning', () => {
    writeIndexFile(tmpGlobalDir, 'proj2', {
      version: 1,
      entries: [
        { projectHash: 'proj2', domains: [], lastUpdated: new Date().toISOString(), sessionCount: 1 },
      ],
    });

    const findings = checkInternalizationIndex(tmpGlobalDir);

    const warnFindings = findings.filter(
      (f) => f.severity === 'warning' && f.message.includes('domains 為空陣列'),
    );
    expect(warnFindings.length).toBeGreaterThanOrEqual(1);
    expect(warnFindings[0].check).toBe('internalization-index');
    expect(warnFindings[0].message).toContain('條目');
  });

  // Scenario 6-4: 所有條目超過 30 天 → info
  test('Scenario 6-4: 所有條目 lastUpdated 超過 30 天時回傳 info finding', () => {
    const staleDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    writeIndexFile(tmpGlobalDir, 'proj3', {
      version: 1,
      entries: [
        { projectHash: 'proj3', domains: ['testing'], lastUpdated: staleDate, sessionCount: 2 },
      ],
    });

    const findings = checkInternalizationIndex(tmpGlobalDir);

    const infoFindings = findings.filter(
      (f) => f.severity === 'info' && f.message.includes('30 天'),
    );
    expect(infoFindings.length).toBeGreaterThanOrEqual(1);
    expect(infoFindings[0].check).toBe('internalization-index');
    expect(infoFindings[0].message).toMatch(/過時/);
  });

  // Scenario 6-5: 健康索引 → 無 warning/error
  test('Scenario 6-5: 健康索引回傳 Finding 陣列不含 warning 或 error', () => {
    writeIndexFile(tmpGlobalDir, 'proj4', {
      version: 1,
      entries: [makeHealthyEntry(5)],
    });

    const findings = checkInternalizationIndex(tmpGlobalDir);

    const problemFindings = findings.filter(
      (f) => f.severity === 'warning' || f.severity === 'error',
    );
    expect(problemFindings.length).toBe(0);
  });

  // 同一 globalDir 含多個 experience-index.json：部分損壞
  test('Scenario 6-extra: 多個索引混合健康/損壞時分別回報', () => {
    // 健康的
    writeIndexFile(tmpGlobalDir, 'healthy', {
      version: 1,
      entries: [makeHealthyEntry(3)],
    });
    // 損壞的
    const dir = path.join(tmpGlobalDir, 'corrupted');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'experience-index.json'), 'not-json', 'utf8');

    const findings = checkInternalizationIndex(tmpGlobalDir);

    const warnFindings = findings.filter((f) => f.severity === 'warning');
    expect(warnFindings.length).toBeGreaterThanOrEqual(1);
    // 健康的不應該產生 warning
    const healthyWarnings = findings.filter(
      (f) => f.severity === 'warning' && f.file && f.file.includes('healthy'),
    );
    expect(healthyWarnings.length).toBe(0);
  });

  // finding schema 驗證
  test('finding 只包含 Finding schema 定義的欄位', () => {
    writeIndexFile(tmpGlobalDir, 'schema-test', {
      version: 1,
      entries: [makeHealthyEntry(1)],
    });

    const findings = checkInternalizationIndex(tmpGlobalDir);
    const validKeys = new Set(['check', 'severity', 'file', 'message', 'detail']);

    for (const f of findings) {
      expect(f.check).toBe('internalization-index');
      for (const key of Object.keys(f)) {
        expect(validKeys.has(key)).toBe(true);
      }
    }
  });

  // 函式不拋出例外
  test('checkInternalizationIndex 不拋出例外（任何輸入）', () => {
    expect(() => checkInternalizationIndex(tmpGlobalDir)).not.toThrow();
    expect(() => checkInternalizationIndex('/nonexistent/path')).not.toThrow();
    // 預設模式（讀取真實 globalDir）
    expect(() => checkInternalizationIndex()).not.toThrow();
  });
});

// ══════════════════════════════════════════════════════════════════
// Scenario 6-6: runAllChecks 包含第 17 項 internalization-index
// ══════════════════════════════════════════════════════════════════

describe('runAllChecks — 第 17 項 internalization-index', () => {
  test('Scenario 6-6: runAllChecks 輸出包含 internalization-index，共 22 項偵測', () => {
    const { checks } = runAllChecks();

    expect(Array.isArray(checks)).toBe(true);
    expect(checks.length).toBe(23);

    const names = checks.map((c) => c.name);
    expect(names).toContain('internalization-index');
  });
});
