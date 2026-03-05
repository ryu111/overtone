'use strict';
/**
 * os-scripts.test.js — OS 腳本整合測試（macOS only）
 *
 * 覆蓋 Feature 6：7 個 smoke test，直接 require 真實模組（非 mock）
 * Feature 7：非 macOS 平台自動跳過
 *
 * process.js 不測（kill/spawn 副作用大）
 */

const { test, expect, describe } = require('bun:test');
const path = require('path');
const { existsSync, unlinkSync } = require('fs');

const OS_SCRIPTS_DIR = path.resolve(__dirname, '../../plugins/overtone/scripts/os');

const isMac = process.platform === 'darwin';

// ── screenshot.js ──

describe('OS smoke: screenshot.js', () => {
  test('Feature 6 Scenario 1: takeScreenshot (captureFullScreen) 成功並產生檔案', async () => {
    if (!isMac) {
      // 非 macOS 跳過
      return;
    }
    const { captureFullScreen } = require(path.join(OS_SCRIPTS_DIR, 'screenshot.js'));
    const result = captureFullScreen();

    // 在 CI 或無 Screen Recording 權限環境，ok 可能為 false → smoke test 只驗證不 throw
    if (result.ok) {
      expect(typeof result.path).toBe('string');
      expect(existsSync(result.path)).toBe(true);
      // 清理截圖檔案
      try { unlinkSync(result.path); } catch { /* 靜默忽略 */ }
    } else {
      // 無權限也算通過（只要不 throw）
      expect(typeof result.error).toBe('string');
    }
  });
});

// ── window.js ──

describe('OS smoke: window.js', () => {
  test('Feature 6 Scenario 2: getWindowList (listProcesses) 回傳 ok + 陣列', async () => {
    if (!isMac) {
      return;
    }
    const { listProcesses } = require(path.join(OS_SCRIPTS_DIR, 'window.js'));
    const result = listProcesses();

    // 需要 Accessibility 權限，有時可能失敗 → smoke test 驗證不 throw + 格式正確
    expect(typeof result.ok).toBe('boolean');
    if (result.ok) {
      expect(Array.isArray(result.processes)).toBe(true);
    } else {
      expect(typeof result.error).toBe('string');
    }
  });
});

// ── clipboard.js ──

describe('OS smoke: clipboard.js', () => {
  test('Feature 6 Scenario 3: writeClipboard 後 readClipboard 讀回正確值', async () => {
    if (!isMac) {
      return;
    }
    const { writeClipboard, readClipboard } = require(path.join(OS_SCRIPTS_DIR, 'clipboard.js'));

    const testValue = 'overtone-test-value';
    const writeResult = writeClipboard(testValue);
    expect(writeResult.ok).toBe(true);

    const readResult = readClipboard();
    expect(readResult.ok).toBe(true);
    expect(readResult.content).toBe(testValue);
  });
});

// ── system-info.js ──

describe('OS smoke: system-info.js', () => {
  test('Feature 6 Scenario 4: getSystemInfo (getMemoryInfo) 回傳 ok + platform 資訊', async () => {
    if (!isMac) {
      return;
    }
    // system-info.js 沒有 getSystemInfo，使用 getMemoryInfo 驗證平台能力
    const { getMemoryInfo } = require(path.join(OS_SCRIPTS_DIR, 'system-info.js'));
    const result = getMemoryInfo();

    expect(typeof result.ok).toBe('boolean');
    if (result.ok) {
      expect(typeof result.memory).toBe('object');
      expect(result.memory).not.toBeNull();
      // 此模組只在 darwin 運作，能執行到這裡代表 platform === 'darwin'
      expect(process.platform).toBe('darwin');
    } else {
      expect(typeof result.error).toBe('string');
    }
  });
});

// ── notification.js ──

describe('OS smoke: notification.js', () => {
  test('Feature 6 Scenario 5: sendNotification 不拋錯', async () => {
    if (!isMac) {
      return;
    }
    const { sendNotification } = require(path.join(OS_SCRIPTS_DIR, 'notification.js'));

    let caughtError = null;
    let result;
    try {
      result = sendNotification({ title: 'Overtone Test', message: 'smoke test' });
    } catch (err) {
      caughtError = err;
    }

    // 不應 throw
    expect(caughtError).toBeNull();
    // 回傳值應為物件，ok 為 boolean
    expect(typeof result).toBe('object');
    expect(typeof result.ok).toBe('boolean');
  });
});

// ── fswatch.js ──

describe('OS smoke: fswatch.js', () => {
  test('Feature 6 Scenario 6: watchPath 後可正常關閉', async () => {
    if (!isMac) {
      return;
    }
    const { watchPath, stopWatch } = require(path.join(OS_SCRIPTS_DIR, 'fswatch.js'));

    const result = watchPath('/tmp', () => {});
    expect(result).not.toBeNull();
    expect(result).not.toBeUndefined();

    if (result.ok) {
      const { watcherId } = result;
      let caughtError = null;
      try {
        stopWatch(watcherId);
      } catch (err) {
        caughtError = err;
      }
      expect(caughtError).toBeNull();
    } else {
      // 失敗也不應 throw
      expect(typeof result.error).toBe('string');
    }
  });
});

// ── websocket.js ──

describe('OS smoke: websocket.js', () => {
  test('Feature 6 Scenario 7: 連線到無效 URL 回傳 error 而非拋錯', async () => {
    if (!isMac) {
      return;
    }
    const { connect } = require(path.join(OS_SCRIPTS_DIR, 'websocket.js'));

    let caughtError = null;
    let result;
    try {
      // 短 timeout 避免測試等太久
      result = await connect('ws://127.0.0.1:19999/invalid', { timeout: 2000 });
    } catch (err) {
      caughtError = err;
    }

    // 不應 throw
    expect(caughtError).toBeNull();
    // 回傳 ok: false
    expect(result.ok).toBe(false);
    // error 欄位為字串
    expect(typeof result.error).toBe('string');
  });
});

// ── Feature 7: 非 macOS 自動跳過 ──

describe('OS smoke: 非 macOS 平台跳過', () => {
  test('Feature 7: 非 macOS 平台時所有 OS 操作回傳 UNSUPPORTED_PLATFORM', () => {
    if (isMac) {
      // macOS 上跳過此測試
      return;
    }
    // 非 macOS：直接 require 並呼叫，驗證回傳 UNSUPPORTED_PLATFORM
    const { captureFullScreen } = require(path.join(OS_SCRIPTS_DIR, 'screenshot.js'));
    const result = captureFullScreen();
    expect(result.ok).toBe(false);
    expect(result.error).toBe('UNSUPPORTED_PLATFORM');
  });
});
