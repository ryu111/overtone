'use strict';
/**
 * dashboard-pid.test.js — 整合測試
 *
 * 驗證 dashboard/pid.js 的讀寫行為。
 * DASHBOARD_FILE 路徑為 ~/.overtone/dashboard.json，
 * 測試前備份、測試後還原，避免污染真實環境。
 */
const { test, expect, describe, beforeEach, afterEach } = require('bun:test');
const { join } = require('path');
const { existsSync, readFileSync, writeFileSync, unlinkSync } = require('fs');
const { homedir } = require('os');
const { SCRIPTS_LIB } = require('../helpers/paths');

const pid = require(join(SCRIPTS_LIB, 'dashboard', 'pid'));

// dashboard.json 的真實路徑
const DASHBOARD_FILE = join(homedir(), '.overtone', 'dashboard.json');

// 每個測試前備份、每個測試後還原
let backup = null;

beforeEach(() => {
  if (existsSync(DASHBOARD_FILE)) {
    backup = readFileSync(DASHBOARD_FILE, 'utf8');
  } else {
    backup = null;
  }
  // 確保從乾淨狀態開始
  try { unlinkSync(DASHBOARD_FILE); } catch { /* 不存在時靜默 */ }
});

afterEach(() => {
  // 還原原始檔案
  if (backup !== null) {
    writeFileSync(DASHBOARD_FILE, backup, 'utf8');
  } else {
    try { unlinkSync(DASHBOARD_FILE); } catch { /* 不存在時靜默 */ }
  }
  backup = null;
});

describe('dashboard/pid.js', () => {
  describe('Scenario 1: 寫入後讀取回傳相同資料', () => {
    test('write() 後 read() 包含相同的 pid 與 port', () => {
      const info = { pid: 12345, port: 7777, startedAt: '2026-01-01T00:00:00.000Z' };
      pid.write(info);

      const result = pid.read();
      expect(result).not.toBeNull();
      expect(result.pid).toBe(12345);
      expect(result.port).toBe(7777);
    });

    test('write() 後 read() 包含 startedAt', () => {
      const info = { pid: 12345, port: 7777, startedAt: '2026-01-01T00:00:00.000Z' };
      pid.write(info);

      const result = pid.read();
      expect(result.startedAt).toBe('2026-01-01T00:00:00.000Z');
    });
  });

  describe('Scenario 2: isRunning() 在 pid 不存在時回傳 false', () => {
    test('dashboard.json 不存在時 isRunning() 回傳 false', () => {
      // beforeEach 已確保 dashboard.json 不存在
      expect(pid.isRunning()).toBe(false);
    });

    test('pid 指向不存在的進程時 isRunning() 回傳 false', () => {
      // 使用極大的 PID，確保該進程不存在
      pid.write({ pid: 999999, port: 7777, startedAt: '2026-01-01T00:00:00.000Z' });
      expect(pid.isRunning()).toBe(false);
    });
  });

  describe('Scenario 3: getUrl() 根據 port 回傳正確的 localhost URL', () => {
    test('port 為 7777 時 getUrl() 回傳 http://localhost:7777', () => {
      pid.write({ pid: 12345, port: 7777, startedAt: '2026-01-01T00:00:00.000Z' });
      expect(pid.getUrl()).toBe('http://localhost:7777');
    });
  });

  describe('Scenario 4: dashboard.json 不存在時 getUrl() 回傳 null', () => {
    test('dashboard.json 不存在時 getUrl() 回傳 null', () => {
      // beforeEach 已確保 dashboard.json 不存在
      expect(pid.getUrl()).toBeNull();
    });
  });
});
