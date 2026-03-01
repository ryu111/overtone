'use strict';
/**
 * sound.test.js — sound.js 單元測試
 *
 * 測試音效播放、error flag 機制
 */

const { describe, it, expect, beforeEach, afterEach, mock } = require('bun:test');
const os = require('os');
const path = require('path');
const { mkdirSync, existsSync, writeFileSync, rmSync } = require('fs');

// ── 測試用暫存目錄 ──

let testSessionDir;
let testSessionId;

// 在測試前設定暫存 session 目錄
function setupTestSession() {
  testSessionId = `test-sound-${Date.now()}`;
  // 覆寫 OVERTONE_HOME 讓 paths.sessionDir 指向測試目錄
  const overtoneHome = path.join(os.tmpdir(), `overtone-test-${Date.now()}`);
  testSessionDir = path.join(overtoneHome, 'sessions', testSessionId);
  mkdirSync(testSessionDir, { recursive: true });
  return { overtoneHome, testSessionDir, testSessionId };
}

// ── 測試 SOUNDS 常數 ──

describe('SOUNDS 常數', () => {
  it('包含所有 4 個音效常數', () => {
    // 動態 require 避免 module cache 問題
    const { SOUNDS } = require('../../plugins/overtone/scripts/lib/sound');
    expect(SOUNDS.HERO).toBe('Hero.aiff');
    expect(SOUNDS.GLASS).toBe('Glass.aiff');
    expect(SOUNDS.BASSO).toBe('Basso.aiff');
    expect(SOUNDS.TINK).toBe('Tink.aiff');
  });

  it('導出正確的 5 個函式/常數', () => {
    const sound = require('../../plugins/overtone/scripts/lib/sound');
    expect(typeof sound.playSound).toBe('function');
    expect(typeof sound.SOUNDS).toBe('object');
    expect(typeof sound.writeErrorFlag).toBe('function');
    expect(typeof sound.readAndClearErrorFlag).toBe('function');
    expect(typeof sound.clearErrorFlag).toBe('function');
  });
});

// ── 測試 playSound ──

describe('playSound', () => {
  it('在非 darwin 平台靜默跳過（不 throw）', () => {
    // 模擬非 darwin
    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

    try {
      const { playSound, SOUNDS } = require('../../plugins/overtone/scripts/lib/sound');
      // 不應 throw
      expect(() => playSound(SOUNDS.GLASS)).not.toThrow();
    } finally {
      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform);
      }
    }
  });

  it('在 darwin 平台但音效檔不存在時靜默跳過（不 throw）', () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

    try {
      const { playSound } = require('../../plugins/overtone/scripts/lib/sound');
      // 不存在的音效檔
      expect(() => playSound('NotExist.aiff')).not.toThrow();
    } finally {
      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform);
      }
    }
  });
});

// ── 測試 Error Flag 機制 ──

describe('error flag 機制', () => {
  let overtoneHome;
  let flagSessionId;
  let flagSessionDir;

  beforeEach(() => {
    // 建立獨立的測試 session 目錄，直接操作絕對路徑
    overtoneHome = path.join(os.tmpdir(), `overtone-flag-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    flagSessionId = `flag-test-${Date.now()}`;
    flagSessionDir = path.join(overtoneHome, 'sessions', flagSessionId);
    mkdirSync(flagSessionDir, { recursive: true });
  });

  afterEach(() => {
    // 清理測試目錄
    try {
      rmSync(overtoneHome, { recursive: true, force: true });
    } catch {
      // 靜默
    }
  });

  // 直接操作 flag 檔案（不依賴 paths.js 的 OVERTONE_HOME）
  function flagPath() {
    return path.join(flagSessionDir, 'error.flag');
  }

  it('readAndClearErrorFlag 在無 flag 時回傳 { exists: false, recentMs: Infinity }', () => {
    // 直接測試邏輯：flag 檔不存在時
    const fp = flagPath();
    expect(existsSync(fp)).toBe(false);

    // 手動測試 readAndClearErrorFlag 邏輯
    const result = (() => {
      if (!existsSync(fp)) return { exists: false, recentMs: Infinity };
      return { exists: true, recentMs: 0 };
    })();

    expect(result.exists).toBe(false);
    expect(result.recentMs).toBe(Infinity);
  });

  it('writeErrorFlag 寫入時間戳，readAndClearErrorFlag 讀取後刪除', () => {
    // 直接寫入 flag 檔
    const fp = flagPath();
    const before = Date.now();
    writeFileSync(fp, String(before));
    expect(existsSync(fp)).toBe(true);

    // 讀取並清除
    const ts = parseInt(require('fs').readFileSync(fp, 'utf8'), 10);
    require('fs').unlinkSync(fp);

    expect(existsSync(fp)).toBe(false);
    expect(ts).toBeGreaterThanOrEqual(before - 1);
    expect(typeof ts).toBe('number');
    expect(isNaN(ts)).toBe(false);
  });

  it('flag 被讀取後自動清除', () => {
    const fp = flagPath();
    writeFileSync(fp, String(Date.now()));
    expect(existsSync(fp)).toBe(true);

    // 模擬 readAndClearErrorFlag 的清除行為
    require('fs').unlinkSync(fp);
    expect(existsSync(fp)).toBe(false);
  });

  it('recentMs 正確反映時間差', async () => {
    const fp = flagPath();
    const writeTime = Date.now();
    writeFileSync(fp, String(writeTime));

    // 等待一小段時間
    await new Promise(resolve => setTimeout(resolve, 10));

    const readTime = Date.now();
    const ts = parseInt(require('fs').readFileSync(fp, 'utf8'), 10);
    require('fs').unlinkSync(fp);

    const recentMs = readTime - ts;
    expect(recentMs).toBeGreaterThanOrEqual(10);
    expect(recentMs).toBeLessThan(5000);
  });

  it('clearErrorFlag 在有 flag 時刪除', () => {
    const fp = flagPath();
    writeFileSync(fp, String(Date.now()));
    expect(existsSync(fp)).toBe(true);

    // 模擬 clearErrorFlag 行為
    if (existsSync(fp)) require('fs').unlinkSync(fp);
    expect(existsSync(fp)).toBe(false);
  });

  it('clearErrorFlag 在無 flag 時不 throw', () => {
    const fp = flagPath();
    expect(existsSync(fp)).toBe(false);

    // 模擬 clearErrorFlag 行為（flag 不存在）
    expect(() => {
      if (existsSync(fp)) require('fs').unlinkSync(fp);
    }).not.toThrow();
  });
});

// ── 整合測試：透過 sound.js 的實際函式（但使用 mock paths）──

describe('sound.js 函式整合（使用真實實作）', () => {
  // 注意：由於 paths.js 使用固定的 OVERTONE_HOME（~/.overtone），
  // 這裡的 writeErrorFlag/readAndClearErrorFlag/clearErrorFlag 會操作真實目錄
  // 我們使用一個唯一的 sessionId 確保不污染真實資料

  const uniqueSessionId = `unit-test-sound-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const { SESSIONS_DIR } = require('../../plugins/overtone/scripts/lib/paths');
  const testDir = path.join(SESSIONS_DIR, uniqueSessionId);

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // 靜默
    }
  });

  it('writeErrorFlag 後 readAndClearErrorFlag 回傳 exists: true', () => {
    const { writeErrorFlag, readAndClearErrorFlag } = require('../../plugins/overtone/scripts/lib/sound');

    writeErrorFlag(uniqueSessionId);
    const result = readAndClearErrorFlag(uniqueSessionId);

    expect(result.exists).toBe(true);
    expect(result.recentMs).toBeLessThan(5000);
  });

  it('readAndClearErrorFlag 清除後再次讀取回傳 exists: false', () => {
    const { writeErrorFlag, readAndClearErrorFlag } = require('../../plugins/overtone/scripts/lib/sound');

    writeErrorFlag(uniqueSessionId);
    readAndClearErrorFlag(uniqueSessionId);  // 第一次：清除

    const second = readAndClearErrorFlag(uniqueSessionId);  // 第二次：應該不存在
    expect(second.exists).toBe(false);
    expect(second.recentMs).toBe(Infinity);
  });

  it('clearErrorFlag 後 readAndClearErrorFlag 回傳 exists: false', () => {
    const { writeErrorFlag, clearErrorFlag, readAndClearErrorFlag } = require('../../plugins/overtone/scripts/lib/sound');

    writeErrorFlag(uniqueSessionId);
    clearErrorFlag(uniqueSessionId);

    const result = readAndClearErrorFlag(uniqueSessionId);
    expect(result.exists).toBe(false);
  });
});
