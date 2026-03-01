'use strict';
/**
 * format-size.test.js
 * BDD spec: specs/features/in-progress/core-refactor-iter1/bdd-iter2.md
 * Feature: formatSize — 位元組格式化統一行為（F1，9 個 scenario）
 * Feature: 介面相容性驗證（F5 部分：utils.js formatSize 與 statusline.js 行為一致）
 *
 * 覆蓋：
 *   - 正常路徑：MB / KB / B 顯示
 *   - 邊界條件：恰好 1MB / 1KB / 0B
 *   - 統一後邊界行為：null → '--' / undefined → '--'
 *   - 介面相容性：on-stop.js 呼叫端傳入數值的結果一致
 */

const { describe, it, expect } = require('bun:test');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');

const { formatSize } = require(join(SCRIPTS_LIB, 'utils'));

// ── Feature F1: formatSize — 位元組格式化統一行為 ──

describe('formatSize — 正常路徑', () => {
  it('大於等於 1MB 時以小數點一位 MB 顯示', () => {
    // GIVEN 傳入 bytes 為 6_500_000
    // WHEN 呼叫 formatSize(6_500_000)
    // THEN 回傳字串為 '6.5MB'
    expect(formatSize(6_500_000)).toBe('6.5MB');
  });

  it('大於等於 1KB 且小於 1MB 時以四捨五入 KB 顯示', () => {
    // GIVEN 傳入 bytes 為 800_000
    // WHEN 呼叫 formatSize(800_000)
    // THEN 回傳字串為 '800KB'
    expect(formatSize(800_000)).toBe('800KB');
  });

  it('小於 1KB 時以 B 顯示', () => {
    // GIVEN 傳入 bytes 為 500
    // WHEN 呼叫 formatSize(500)
    // THEN 回傳字串為 '500B'
    expect(formatSize(500)).toBe('500B');
  });
});

describe('formatSize — 邊界條件', () => {
  it('恰好 1MB 時以 MB 顯示', () => {
    // GIVEN 傳入 bytes 為 1_000_000
    // WHEN 呼叫 formatSize(1_000_000)
    // THEN 回傳字串為 '1.0MB'
    expect(formatSize(1_000_000)).toBe('1.0MB');
  });

  it('恰好 1KB 時以 KB 顯示', () => {
    // GIVEN 傳入 bytes 為 1_000
    // WHEN 呼叫 formatSize(1_000)
    // THEN 回傳字串為 '1KB'
    expect(formatSize(1_000)).toBe('1KB');
  });

  it('0 bytes 時以 B 顯示', () => {
    // GIVEN 傳入 bytes 為 0
    // WHEN 呼叫 formatSize(0)
    // THEN 回傳字串為 '0B'
    expect(formatSize(0)).toBe('0B');
  });
});

describe('formatSize — 統一後邊界行為（null/undefined guard）', () => {
  it('null 輸入時回傳 "--" 且不拋出例外', () => {
    // GIVEN 傳入 bytes 為 null
    // WHEN 呼叫 utils.js 的 formatSize(null)
    // THEN 回傳字串為 '--' AND 不拋出例外
    expect(() => formatSize(null)).not.toThrow();
    expect(formatSize(null)).toBe('--');
  });

  it('undefined 輸入時回傳 "--" 且不拋出例外', () => {
    // GIVEN 傳入 bytes 為 undefined
    // WHEN 呼叫 utils.js 的 formatSize(undefined)
    // THEN 回傳字串為 '--' AND 不拋出例外
    expect(() => formatSize(undefined)).not.toThrow();
    expect(formatSize(undefined)).toBe('--');
  });
});

describe('formatSize — 介面相容性（F5）', () => {
  it('on-stop.js 呼叫端傳入 5_200_000 時回傳 "5.2MB"', () => {
    // GIVEN formatSize 已從 on-stop.js 提取到 utils.js
    // WHEN 傳入相同的 size 數值（如 5_200_000）
    // THEN utils.js 的 formatSize(5_200_000) 回傳 '5.2MB'
    expect(formatSize(5_200_000)).toBe('5.2MB');
  });
});
