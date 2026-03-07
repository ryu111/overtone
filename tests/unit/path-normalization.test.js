// tests/unit/path-normalization.test.js
// BDD 行為規格：projectHash 路徑正規化 + counts.js sanity check

'use strict';

const { test, expect, describe } = require('bun:test');
const { join } = require('path');
const { SCRIPTS_LIB } = require('../helpers/paths');

const { projectHash } = require(join(SCRIPTS_LIB, 'paths'));

// ── Feature: projectHash 路徑正規化 ──

describe('Feature: projectHash 路徑正規化', () => {
  // Scenario 1: trailing slash 不影響 hash
  test('Scenario 1: 相同路徑加 trailing slash 產生相同 hash', () => {
    // GIVEN 一個專案根目錄路徑
    const base = '/Users/sbu/projects/overtone';
    // WHEN 分別對「無 trailing slash」和「有 trailing slash」呼叫 projectHash
    const hashWithout = projectHash(base);
    const hashWith    = projectHash(base + '/');
    // THEN 兩者 hash 相同
    expect(hashWith).toBe(hashWithout);
  });

  // Scenario 2: 多重 trailing slash 不影響 hash
  test('Scenario 2: 多重 trailing slash 也產生相同 hash', () => {
    // GIVEN 一個專案根目錄路徑
    const base = '/Users/sbu/projects/overtone';
    // WHEN 對「雙 slash 結尾」呼叫 projectHash
    const hashBase   = projectHash(base);
    const hashDouble = projectHash(base + '//');
    // THEN hash 仍相同
    expect(hashDouble).toBe(hashBase);
  });

  // Scenario 3: 不同路徑產生不同 hash
  test('Scenario 3: 不同路徑產生不同 hash', () => {
    // GIVEN 兩個不同的專案根目錄
    const pathA = '/Users/sbu/projects/overtone';
    const pathB = '/Users/sbu/projects/kuji';
    // WHEN 分別計算 hash
    const hashA = projectHash(pathA);
    const hashB = projectHash(pathB);
    // THEN 兩者不同
    expect(hashA).not.toBe(hashB);
  });

  // Scenario 4: hash 格式正確（8 字元 hex）
  test('Scenario 4: hash 為 8 字元小寫 hex 字串', () => {
    // GIVEN 任意有效路徑
    const path = '/Users/sbu/projects/overtone';
    // WHEN 計算 hash
    const hash = projectHash(path);
    // THEN hash 長度為 8，且全為小寫十六進位字元
    expect(hash).toHaveLength(8);
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
  });

  // Scenario 5: 相同路徑多次呼叫結果穩定（冪等性）
  test('Scenario 5: 相同輸入多次呼叫產生相同 hash（冪等）', () => {
    // GIVEN 一個路徑
    const path = '/tmp/some-project';
    // WHEN 連續呼叫三次
    const h1 = projectHash(path);
    const h2 = projectHash(path);
    const h3 = projectHash(path);
    // THEN 結果完全一致
    expect(h1).toBe(h2);
    expect(h2).toBe(h3);
  });
});

// ── Feature: counts.js helper sanity check ──

describe('Feature: counts.js helper sanity check', () => {
  const counts = require('../helpers/counts');

  // Scenario 1: 所有 count 值大於 0
  test('Scenario 1: AGENT_COUNT > 0', () => {
    // GIVEN counts.js 已載入
    // WHEN 取得 AGENT_COUNT
    // THEN 值大於 0
    expect(counts.AGENT_COUNT).toBeGreaterThan(0);
  });

  test('Scenario 1: SKILL_COUNT > 0', () => {
    expect(counts.SKILL_COUNT).toBeGreaterThan(0);
  });

  test('Scenario 1: COMMAND_COUNT > 0', () => {
    expect(counts.COMMAND_COUNT).toBeGreaterThan(0);
  });

  test('Scenario 1: HOOK_COUNT > 0', () => {
    expect(counts.HOOK_COUNT).toBeGreaterThan(0);
  });

  test('Scenario 1: STAGE_COUNT > 0', () => {
    expect(counts.STAGE_COUNT).toBeGreaterThan(0);
  });

  test('Scenario 1: WORKFLOW_COUNT > 0', () => {
    expect(counts.WORKFLOW_COUNT).toBeGreaterThan(0);
  });

  test('Scenario 1: TIMELINE_EVENT_COUNT > 0', () => {
    expect(counts.TIMELINE_EVENT_COUNT).toBeGreaterThan(0);
  });

  test('Scenario 1: HEALTH_CHECK_COUNT > 0', () => {
    expect(counts.HEALTH_CHECK_COUNT).toBeGreaterThan(0);
  });

  // Scenario 2: count 值為整數
  test('Scenario 2: 所有 count 值為整數', () => {
    // GIVEN counts.js 匯出的所有 count 值
    const intKeys = [
      'AGENT_COUNT', 'SKILL_COUNT', 'COMMAND_COUNT', 'HOOK_COUNT',
      'STAGE_COUNT', 'WORKFLOW_COUNT', 'TIMELINE_EVENT_COUNT',
      'TIMELINE_CATEGORY_COUNT', 'HEALTH_CHECK_COUNT',
    ];
    // WHEN 檢查每個值
    for (const key of intKeys) {
      // THEN 應為整數
      expect(Number.isInteger(counts[key])).toBe(true);
    }
  });
});
