'use strict';
/**
 * sound.test.js — sound.js 單元測試
 *
 * 測試音效播放功能
 */

const { describe, it, expect } = require('bun:test');

// ── 測試 SOUNDS 常數 ──

describe('SOUNDS 常數', () => {
  it('包含 3 個音效常數（HERO, GLASS, BASSO）', () => {
    const { SOUNDS } = require('../../plugins/overtone/scripts/lib/sound');
    expect(SOUNDS.HERO).toBe('Hero.aiff');
    expect(SOUNDS.GLASS).toBe('Glass.aiff');
    expect(SOUNDS.BASSO).toBe('Basso.aiff');
  });

  it('不包含已移除的 TINK', () => {
    const { SOUNDS } = require('../../plugins/overtone/scripts/lib/sound');
    expect(SOUNDS.TINK).toBeUndefined();
  });

  it('導出 playSound 函式和 SOUNDS 常數', () => {
    const sound = require('../../plugins/overtone/scripts/lib/sound');
    expect(typeof sound.playSound).toBe('function');
    expect(typeof sound.SOUNDS).toBe('object');
  });

  it('不導出已移除的 error flag 函式', () => {
    const sound = require('../../plugins/overtone/scripts/lib/sound');
    expect(sound.writeErrorFlag).toBeUndefined();
    expect(sound.readAndClearErrorFlag).toBeUndefined();
    expect(sound.clearErrorFlag).toBeUndefined();
  });
});

// ── 測試 playSound ──

describe('playSound', () => {
  it('在非 darwin 平台靜默跳過（不 throw）', () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

    try {
      const { playSound, SOUNDS } = require('../../plugins/overtone/scripts/lib/sound');
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
      expect(() => playSound('NotExist.aiff')).not.toThrow();
    } finally {
      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform);
      }
    }
  });
});
