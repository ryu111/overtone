'use strict';
/**
 * test-quality-guard.test.js — 測試品質守衛
 *
 * Guard test：掃描 tests/ 目錄中的測試品質問題。
 * - error 級問題（skip/only 殘留、空測試體）硬阻擋（test fail）
 * - warning/info 級問題軟報告（console.warn）不阻擋
 *
 * 豁免：test-quality-scanner.test.js 本身包含掃描器的測試資料
 *（template literal 字串中的 skip/only 和空測試體），不計入品質檢查。
 */

const { describe, test, expect } = require('bun:test');
const { join, basename } = require('path');
const { SCRIPTS_LIB, PROJECT_ROOT } = require('../helpers/paths');

const { scanTestQuality } = require(join(SCRIPTS_LIB, 'test-quality-scanner.js'));

// 豁免清單：這些測試檔包含掃描器測試資料，不計入 guard 掃描
const EXEMPTED_FILES = new Set([
  'test-quality-scanner.test.js', // 掃描器本身的單元測試，含有 skip/only 測試資料
]);

// 測試目錄路徑
const TESTS_DIR = join(PROJECT_ROOT, 'tests');

describe('Test 品質 Guard', () => {
  // 執行一次掃描，後續斷言共用結果
  let report;

  test('掃描完成（前置條件）', () => {
    report = scanTestQuality(TESTS_DIR);

    // 過濾豁免檔案
    report.issues = report.issues.filter(issue => {
      const fileName = basename(issue.filePath);
      return !EXEMPTED_FILES.has(fileName);
    });

    // 更新 summary
    report.summary.total = report.issues.length;

    expect(typeof report).toBe('object');
    expect(Array.isArray(report.issues)).toBe(true);
  });

  test('error 級問題數量為 0（skip/only 殘留、空測試體）', () => {
    const errors = report.issues.filter(i => i.severity === 'error');

    if (errors.length > 0) {
      const errorList = errors
        .map(e => {
          const rel = e.filePath.replace(PROJECT_ROOT + '/', '');
          return `  ${rel}:${e.line} [${e.type}] ${e.message}`;
        })
        .join('\n');

      // 同時將警告印出（方便開發者定位）
      console.warn(`[test-quality-guard] 發現 ${errors.length} 個 error 級問題：\n${errorList}`);

      throw new Error(
        `測試品質 Guard 失敗：發現 ${errors.length} 個 error 級問題（skip/only 殘留或空測試體）。\n` +
        `請修復以下問題後再 commit：\n${errorList}`
      );
    }

    expect(errors.length).toBe(0);
  });

  test('warning 級問題軟報告（不阻擋）', () => {
    const warnings = report.issues.filter(i => i.severity === 'warning');

    if (warnings.length > 0) {
      const warnList = warnings
        .map(w => {
          const rel = w.filePath.replace(PROJECT_ROOT + '/', '');
          return `  ${rel}:${w.line} [${w.type}]`;
        })
        .join('\n');
      console.warn(`[test-quality-guard] ${warnings.length} 個 warning 級問題（供參考）：\n${warnList}`);
    }

    // warning 不阻擋，只記錄數量
    expect(typeof warnings.length).toBe('number');
  });
});
