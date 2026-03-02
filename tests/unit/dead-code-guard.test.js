'use strict';
/**
 * dead-code-guard.test.js — Dead Code 守衛
 *
 * Guard test：掃描 plugins/overtone/scripts/lib/ 的 dead code 狀況。
 * - 孤立檔案（無人 require）數量須在合理範圍（允許 ≤3，新模組尚未整合）
 * - 未使用 exports 只軟報告（console.warn），因為某些 exports 是 public API 預留
 *
 * 合理範圍說明：
 *   - 正在開發中的模組（如新掃描器）可能尚未被整合進主流程
 *   - 允許 ≤3 個孤立檔案作為緩衝（超過代表有未整合的殘留）
 */

const { describe, test, expect } = require('bun:test');
const { join } = require('path');
const { SCRIPTS_LIB, PROJECT_ROOT } = require('../helpers/paths');

const { runDeadCodeScan } = require(join(SCRIPTS_LIB, 'dead-code-scanner.js'));

// 孤立檔案允許上限（新開發中的模組暫時未被整合是合理的）
const ORPHAN_FILE_LIMIT = 3;

describe('Dead Code Guard', () => {
  let scanResult;

  test('掃描完成（前置條件）', () => {
    scanResult = runDeadCodeScan();

    expect(typeof scanResult).toBe('object');
    expect(Array.isArray(scanResult.orphanFiles)).toBe(true);
    expect(Array.isArray(scanResult.unusedExports)).toBe(true);
  });

  test(`孤立模組數量 ≤ ${ORPHAN_FILE_LIMIT}（無人 require 的 lib 模組）`, () => {
    const { orphanFiles } = scanResult;

    if (orphanFiles.length > 0) {
      const fileList = orphanFiles
        .map(f => `  - ${f.replace(PROJECT_ROOT + '/', '')}`)
        .join('\n');
      console.warn(`[dead-code-guard] 發現 ${orphanFiles.length} 個孤立模組：\n${fileList}`);
    }

    if (orphanFiles.length > ORPHAN_FILE_LIMIT) {
      const fileList = orphanFiles
        .map(f => `  - ${f.replace(PROJECT_ROOT + '/', '')}`)
        .join('\n');
      throw new Error(
        `Dead Code Guard 失敗：發現 ${orphanFiles.length} 個孤立模組（上限 ${ORPHAN_FILE_LIMIT}）。\n` +
        `請整合或刪除以下模組：\n${fileList}`
      );
    }

    expect(orphanFiles.length).toBeLessThanOrEqual(ORPHAN_FILE_LIMIT);
  });

  test('未使用 exports 軟報告（不阻擋）', () => {
    const { unusedExports, summary } = scanResult;

    if (unusedExports.length > 0) {
      const exportList = unusedExports
        .slice(0, 20) // 最多顯示前 20 個避免輸出過長
        .map(e => {
          const rel = e.file.replace(PROJECT_ROOT + '/', '');
          return `  ${rel}: ${e.exportName}`;
        })
        .join('\n');
      const suffix = unusedExports.length > 20 ? `\n  （共 ${unusedExports.length} 個，僅顯示前 20）` : '';
      console.warn(`[dead-code-guard] ${summary.unusedExports} 個未使用 exports（供參考）：\n${exportList}${suffix}`);
    }

    // 未使用 exports 不阻擋（可能是 public API 預留）
    expect(typeof unusedExports.length).toBe('number');
  });
});
