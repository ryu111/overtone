'use strict';
/**
 * guard-coverage.test.js — 守衛覆蓋率 Meta-Guard
 *
 * 這是「守衛的守衛」— 確保所有守衛/掃描器模組都有對應的測試檔案，
 * 且每個測試檔案的測試數量達到最低閾值。
 *
 * Feature 1：守衛模組測試覆蓋
 *   lib/ 下每個守衛/掃描器模組都有對應的 unit test 檔案
 *
 * Feature 2：Guard Test 存在性
 *   每個高層 guard test 都存在
 *
 * Feature 3：Hook 整合測試覆蓋
 *   關鍵 hook 的整合測試都存在
 *
 * Feature 4：最低測試數量閘門
 *   上述測試檔案各自至少有 3 個 test() 呼叫
 */

const { describe, test, expect } = require('bun:test');
const { join } = require('path');
const fs = require('fs');
const { PROJECT_ROOT } = require('../helpers/paths');

const TESTS_UNIT = join(PROJECT_ROOT, 'tests', 'unit');
const TESTS_INTEGRATION = join(PROJECT_ROOT, 'tests', 'integration');

// 最低測試數量閾值
const MIN_TEST_COUNT = 3;

/**
 * 計算檔案中 test( 呼叫的數量
 * 匹配 test( 和 it( 兩種形式
 */
function countTests(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const matches = content.match(/\btest\s*\(/g) || [];
  return matches.length;
}

// ── Feature 1：守衛/掃描器模組 → Unit Test 對應 ──
const GUARD_MODULE_TEST_PAIRS = [
  { module: 'docs-sync-engine.js',    test: join(TESTS_UNIT, 'docs-sync-engine.test.js') },
  { module: 'session-cleanup.js',     test: join(TESTS_UNIT, 'session-cleanup.test.js') },
  { module: 'test-quality-scanner.js',test: join(TESTS_UNIT, 'test-quality-scanner.test.js') },
  { module: 'dead-code-scanner.js',   test: join(TESTS_UNIT, 'dead-code-scanner.test.js') },
  { module: 'component-repair.js',    test: join(TESTS_UNIT, 'component-repair.test.js') },
  { module: 'hook-diagnostic.js',     test: join(TESTS_UNIT, 'hook-diagnostic.test.js') },
];

// ── Feature 2：Guard Test 本身的存在性 ──
const GUARD_TEST_FILES = [
  join(TESTS_UNIT, 'test-quality-guard.test.js'),
  join(TESTS_UNIT, 'dead-code-guard.test.js'),
  join(TESTS_UNIT, 'reference-integrity.test.js'),
  join(TESTS_UNIT, 'knowledge-domain-chain.test.js'),
];

// ── Feature 3：Hook 整合測試 ──
const HOOK_INTEGRATION_TEST_FILES = [
  join(TESTS_INTEGRATION, 'agent-on-stop.test.js'),
  join(TESTS_INTEGRATION, 'session-start.test.js'),
  join(TESTS_INTEGRATION, 'on-submit.test.js'),
];

describe('Guard Coverage Meta-Guard', () => {

  // ── Feature 1：守衛模組 → Unit Test 對應 ──
  describe('Feature 1：守衛模組 Unit Test 覆蓋', () => {
    for (const pair of GUARD_MODULE_TEST_PAIRS) {
      test(`${pair.module} 有對應的 unit test 檔案`, () => {
        const exists = fs.existsSync(pair.test);
        if (!exists) {
          throw new Error(
            `[guard-coverage] 守衛模組 ${pair.module} 缺少對應測試檔案。\n` +
            `預期路徑：${pair.test.replace(PROJECT_ROOT + '/', '')}`
          );
        }
        expect(exists).toBe(true);
      });
    }
  });

  // ── Feature 2：Guard Test 存在性 ──
  describe('Feature 2：Guard Test 檔案存在性', () => {
    for (const filePath of GUARD_TEST_FILES) {
      const rel = filePath.replace(PROJECT_ROOT + '/', '');
      test(`${rel} 存在`, () => {
        const exists = fs.existsSync(filePath);
        if (!exists) {
          throw new Error(
            `[guard-coverage] Guard test 檔案不存在：${rel}\n` +
            `請確認守衛測試未被意外刪除。`
          );
        }
        expect(exists).toBe(true);
      });
    }
  });

  // ── Feature 3：Hook 整合測試覆蓋 ──
  describe('Feature 3：Hook 整合測試覆蓋', () => {
    for (const filePath of HOOK_INTEGRATION_TEST_FILES) {
      const rel = filePath.replace(PROJECT_ROOT + '/', '');
      test(`${rel} 存在`, () => {
        const exists = fs.existsSync(filePath);
        if (!exists) {
          throw new Error(
            `[guard-coverage] Hook 整合測試不存在：${rel}\n` +
            `關鍵 hook 必須有對應的整合測試。`
          );
        }
        expect(exists).toBe(true);
      });
    }
  });

  // ── Feature 4：最低測試數量閘門 ──
  describe(`Feature 4：最低測試數量閘門（每個檔案 ≥ ${MIN_TEST_COUNT} 個 test）`, () => {
    const allTrackedFiles = [
      ...GUARD_MODULE_TEST_PAIRS.map(p => p.test),
      ...GUARD_TEST_FILES,
      ...HOOK_INTEGRATION_TEST_FILES,
    ];

    for (const filePath of allTrackedFiles) {
      const rel = filePath.replace(PROJECT_ROOT + '/', '');
      test(`${rel} 有 ≥ ${MIN_TEST_COUNT} 個 test`, () => {
        if (!fs.existsSync(filePath)) {
          // 檔案不存在的情況已在前面的 Feature 中處理
          // 此處跳過，避免 double fail
          return;
        }

        const count = countTests(filePath);
        if (count < MIN_TEST_COUNT) {
          throw new Error(
            `[guard-coverage] 測試數量不足：${rel}\n` +
            `目前：${count} 個 test，最低要求：${MIN_TEST_COUNT} 個。\n` +
            `請補充測試以確保守衛的有效性。`
          );
        }
        expect(count).toBeGreaterThanOrEqual(MIN_TEST_COUNT);
      });
    }
  });
});
