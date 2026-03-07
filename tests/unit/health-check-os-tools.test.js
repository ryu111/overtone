// @sequential
'use strict';
/**
 * health-check-os-tools.test.js — checkOsTools 擴展測試
 *
 * 覆蓋 Feature 4: screencapture 偵測
 * 覆蓋 Feature 5: heartbeat daemon 狀態偵測
 */

const { test, expect, describe } = require('bun:test');
const os = require('os');
const path = require('path');
const { join } = path;
const { writeFileSync, mkdirSync, unlinkSync, existsSync } = require('fs');
const { SCRIPTS_DIR } = require('../helpers/paths');
const { checkOsTools } = require(join(SCRIPTS_DIR, 'health-check'));

// heartbeat PID 檔路徑（與 paths.js 一致）
const HEARTBEAT_PID_FILE = path.join(os.homedir(), '.overtone', 'heartbeat.pid');

// ══════════════════════════════════════════════════════════════════
// Feature 4: screencapture 偵測
// ══════════════════════════════════════════════════════════════════

describe('checkOsTools: screencapture 偵測', () => {

  test('Feature 4 Scenario 3: screencapture finding 格式符合標準結構', () => {
    // macOS 上偵測（screencapture 通常存在）
    // 任何 finding 應有正確欄位
    const findings = checkOsTools();
    const screencaptureFindings = findings.filter(
      f => f.check === 'os-tools' && f.message && f.message.includes('screencapture')
    );

    for (const f of screencaptureFindings) {
      expect(typeof f.check).toBe('string');
      expect(typeof f.severity).toBe('string');
      expect(typeof f.file).toBe('string');
      expect(typeof f.message).toBe('string');
      expect(['info', 'warning', 'error'].includes(f.severity)).toBe(true);
    }
  });

  test('Feature 4 Scenario 1: macOS 環境 screencapture 存在時，不含 screencapture warning', () => {
    if (process.platform !== 'darwin') {
      return;
    }

    const { execSync } = require('child_process');
    let screencaptureAvailable = false;
    try {
      execSync('which screencapture', { stdio: 'pipe' });
      screencaptureAvailable = true;
    } catch {
      screencaptureAvailable = false;
    }

    if (!screencaptureAvailable) {
      return;
    }

    const findings = checkOsTools();
    const screencaptureWarnings = findings.filter(
      f => f.check === 'os-tools' && f.severity === 'warning' && f.message.includes('screencapture')
    );
    expect(screencaptureWarnings.length).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// Feature 5: heartbeat daemon 狀態偵測
// ══════════════════════════════════════════════════════════════════

describe('checkOsTools: heartbeat daemon 狀態偵測', () => {

  test('Feature 5 Scenario 1: PID 檔案不存在時產生 info finding（heartbeat 未在執行）', () => {
    // 只在 macOS 執行（非 macOS 回傳不同格式）
    if (process.platform !== 'darwin') {
      return;
    }

    // 暫時移除 PID 檔（若存在），測試後恢復
    let originalContent = null;
    const pidFileExists = existsSync(HEARTBEAT_PID_FILE);
    if (pidFileExists) {
      const { readFileSync } = require('fs');
      originalContent = readFileSync(HEARTBEAT_PID_FILE, 'utf8');
      unlinkSync(HEARTBEAT_PID_FILE);
    }

    try {
      const findings = checkOsTools();
      const heartbeatInfos = findings.filter(
        f => f.check === 'os-tools' && f.severity === 'info' && f.message.includes('heartbeat daemon 未在執行')
      );
      expect(heartbeatInfos.length).toBeGreaterThanOrEqual(1);
      expect(heartbeatInfos[0].message).toContain('heartbeat daemon 未在執行');
    } finally {
      // 恢復 PID 檔（若原本存在）
      if (originalContent !== null) {
        writeFileSync(HEARTBEAT_PID_FILE, originalContent);
      }
    }
  });

  test('Feature 5 Scenario 2: stale PID 時產生 warning finding', () => {
    if (process.platform !== 'darwin') {
      return;
    }

    // 寫入一個確定不存在的 PID（使用極大的數值）
    const stalePid = 99999999;
    const overtoneDir = path.join(os.homedir(), '.overtone');

    // 備份現有 PID 檔
    let originalContent = null;
    const pidFileExists = existsSync(HEARTBEAT_PID_FILE);
    if (pidFileExists) {
      const { readFileSync } = require('fs');
      originalContent = readFileSync(HEARTBEAT_PID_FILE, 'utf8');
    }

    // 確認此 PID 確實不存在
    let pidReallyNotExist = false;
    try {
      process.kill(stalePid, 0);
      pidReallyNotExist = false; // PID 存在，跳過測試
    } catch (err) {
      if (err.code === 'ESRCH') {
        pidReallyNotExist = true;
      }
    }

    if (!pidReallyNotExist) {
      // 無法確保 stale PID，跳過此測試
      if (originalContent !== null) {
        writeFileSync(HEARTBEAT_PID_FILE, originalContent);
      }
      return;
    }

    try {
      if (!existsSync(overtoneDir)) {
        mkdirSync(overtoneDir, { recursive: true });
      }
      writeFileSync(HEARTBEAT_PID_FILE, String(stalePid));

      const findings = checkOsTools();
      const staleWarnings = findings.filter(
        f => f.check === 'os-tools' && f.severity === 'warning' && f.message.includes('stale PID')
      );
      expect(staleWarnings.length).toBeGreaterThanOrEqual(1);
      expect(staleWarnings[0].message).toContain('stale PID');
      expect(staleWarnings[0].detail).toContain(String(stalePid));
    } finally {
      // 恢復 PID 檔
      if (originalContent !== null) {
        writeFileSync(HEARTBEAT_PID_FILE, originalContent);
      } else if (existsSync(HEARTBEAT_PID_FILE)) {
        unlinkSync(HEARTBEAT_PID_FILE);
      }
    }
  });

  test('Feature 5 Scenario 3: daemon 正常執行時不產生 heartbeat warning/error', () => {
    if (process.platform !== 'darwin') {
      return;
    }

    // 使用自身 PID（current process 必然存活）
    const currentPid = process.pid;

    // 備份現有 PID 檔
    let originalContent = null;
    const pidFileExists = existsSync(HEARTBEAT_PID_FILE);
    if (pidFileExists) {
      const { readFileSync } = require('fs');
      originalContent = readFileSync(HEARTBEAT_PID_FILE, 'utf8');
    }

    const overtoneDir = path.join(os.homedir(), '.overtone');
    try {
      if (!existsSync(overtoneDir)) {
        mkdirSync(overtoneDir, { recursive: true });
      }
      writeFileSync(HEARTBEAT_PID_FILE, String(currentPid));

      const findings = checkOsTools();
      const heartbeatProblems = findings.filter(
        f => f.check === 'os-tools' &&
             ['warning', 'error'].includes(f.severity) &&
             f.message.includes('heartbeat')
      );
      expect(heartbeatProblems.length).toBe(0);
    } finally {
      // 恢復 PID 檔
      if (originalContent !== null) {
        writeFileSync(HEARTBEAT_PID_FILE, originalContent);
      } else if (existsSync(HEARTBEAT_PID_FILE)) {
        unlinkSync(HEARTBEAT_PID_FILE);
      }
    }
  });

  test('Feature 5 Scenario 4: health-check 的 check 項目數量與 runAllChecks 定義一致', () => {
    const { HEALTH_CHECK_COUNT } = require('../helpers/counts');
    const { runAllChecks } = require(join(SCRIPTS_DIR, 'health-check'));
    const { checks } = runAllChecks();
    expect(checks.length).toBe(HEALTH_CHECK_COUNT);
    // screencapture 和 heartbeat 屬於 checkOsTools 內部擴展，不增加 check item
    const osToolsCheck = checks.find(c => c.name === 'os-tools');
    expect(osToolsCheck).toBeDefined();
  });
});
