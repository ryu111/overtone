'use strict';
const { test, expect, describe } = require('bun:test');
const { clamp } = require('../../plugins/overtone/scripts/lib/utils');

describe('clamp', () => {
  test('在範圍內 → 回傳原值', () => {
    expect(clamp(5, 1, 10)).toBe(5);
  });

  test('低於 min → 回傳 min', () => {
    expect(clamp(0, 1, 10)).toBe(1);
  });

  test('高於 max → 回傳 max', () => {
    expect(clamp(15, 1, 10)).toBe(10);
  });

  test('等於 min 邊界 → 回傳 min', () => {
    expect(clamp(1, 1, 10)).toBe(1);
  });

  test('等於 max 邊界 → 回傳 max', () => {
    expect(clamp(10, 1, 10)).toBe(10);
  });
});
