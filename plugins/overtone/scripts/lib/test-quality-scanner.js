#!/usr/bin/env node
'use strict';
/**
 * test-quality-scanner.js — 測試品質自動掃描器
 *
 * 掃描 tests/ 目錄下所有 .test.js 檔案的品質問題。
 *
 * 核心 API：
 *   scanFile(filePath)         — 掃描單一檔案，回傳 issues 清單
 *   scanTestQuality(testsDir)  — 掃描整個目錄，回傳彙整報告
 */

const fs = require('fs');
const { join } = require('path');

// ── 路徑常數 ──────────────────────────────────────────────────────────────

// 此檔位於 plugins/overtone/scripts/lib/test-quality-scanner.js
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..');
const DEFAULT_TESTS_DIR = join(PROJECT_ROOT, 'tests');

// ── 偵測規則 ──────────────────────────────────────────────────────────────

/**
 * 規則 1：空測試體
 * 偵測 test/it 呼叫但函式體為空、或只有 console.log 沒有 expect。
 *
 * @param {string[]} lines
 * @returns {Array<{type, line, message, severity}>}
 */
function detectEmptyTests(lines) {
  const issues = [];

  // 偵測空的測試體：test('name', () => {}) 或 test('name', async () => {})
  // 允許括號內只有空白或換行
  const emptyBodyRe = /^\s*(?:test|it)\s*\(.*,\s*(?:async\s*)?\(\s*\)\s*=>\s*\{\s*\}\s*\)/;

  // 偵測多行測試：開頭是 test(..., () => { 結尾是 }); 且中間沒有 expect
  // 用狀態機方式追蹤進行中的測試
  let inTest = false;
  let testStartLine = -1;
  let braceDepth = 0;
  let hasExpect = false;
  let hasOnlyConsole = false;

  // 用於追蹤單行情況
  const testOpenRe = /^\s*(?:test|it)\s*\(/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // 單行空測試體快速偵測
    if (emptyBodyRe.test(line)) {
      issues.push({
        type: 'empty-test',
        line: lineNum,
        message: '空測試體：測試函式沒有任何 assertion',
        severity: 'error',
      });
      continue;
    }

    // 多行空測試體偵測（狀態機）
    if (!inTest && testOpenRe.test(line)) {
      // 找到測試開始行，計算初始 brace depth
      inTest = true;
      testStartLine = lineNum;
      hasExpect = false;
      hasOnlyConsole = false;
      braceDepth = 0;

      // 計算此行的 brace 深度
      for (const ch of line) {
        if (ch === '{') braceDepth++;
        else if (ch === '}') braceDepth--;
      }

      // 若此行就關閉了（brace 回到 0），代表是已被上面單行 regex 或 inline 測試
      if (braceDepth <= 0) {
        inTest = false;
      }

      // 檢查此行有無 expect
      if (/expect\s*\(/.test(line)) hasExpect = true;
      if (/console\.\w+/.test(line)) hasOnlyConsole = true;
      continue;
    }

    if (inTest) {
      for (const ch of line) {
        if (ch === '{') braceDepth++;
        else if (ch === '}') braceDepth--;
      }

      if (/expect\s*\(/.test(line)) hasExpect = true;
      if (/console\.\w+/.test(line)) hasOnlyConsole = true;

      // 測試體結束（brace 歸零）
      if (braceDepth <= 0) {
        if (!hasExpect) {
          // 只有 console.log 沒有 expect，或完全空
          issues.push({
            type: 'empty-test',
            line: testStartLine,
            message: '空測試體：測試函式沒有任何 assertion（只有 console.log 或完全空）',
            severity: 'error',
          });
        }
        inTest = false;
        testStartLine = -1;
        braceDepth = 0;
        hasExpect = false;
        hasOnlyConsole = false;
      }
    }
  }

  return issues;
}

/**
 * 規則 2：過大測試檔
 * 單一測試檔超過 500 行。
 *
 * @param {string[]} lines
 * @returns {Array<{type, line, message, severity}>}
 */
function detectLargeFile(lines) {
  const MAX_LINES = 500;
  if (lines.length > MAX_LINES) {
    return [{
      type: 'large-file',
      line: 1,
      message: `測試檔過大：${lines.length} 行（上限 ${MAX_LINES} 行），考慮拆分`,
      severity: 'warning',
    }];
  }
  return [];
}

/**
 * 規則 3：缺少 describe 區塊
 * 測試中有 test/it 呼叫，但沒有用 describe 分群。
 *
 * @param {string[]} lines
 * @returns {Array<{type, line, message, severity}>}
 */
function detectMissingDescribe(lines) {
  const hasTest = lines.some(l => /^\s*(?:test|it)\s*\(/.test(l));
  const hasDescribe = lines.some(l => /^\s*describe\s*\(/.test(l));

  if (hasTest && !hasDescribe) {
    return [{
      type: 'missing-describe',
      line: 1,
      message: '測試缺少 describe 區塊：所有測試應用 describe 分群',
      severity: 'info',
    }];
  }
  return [];
}

/**
 * 規則 4：hardcoded 路徑
 * 測試中直接寫 /Users/xxx、/home/xxx 這類使用者目錄路徑。
 * 應改用 tests/helpers/paths.js 中的路徑常數。
 *
 * @param {string[]} lines
 * @returns {Array<{type, line, message, severity}>}
 */
function detectHardcodedPaths(lines) {
  const issues = [];
  // 偵測硬編碼的使用者家目錄路徑（字串中）
  // 允許：/tmp（臨時目錄）、/usr、/etc、/bin、/var（系統路徑通常合理）
  // 禁止：/Users/xxx、/home/xxx（使用者特定路徑）
  const hardcodedPathRe = /['"` ]\/(?:Users|home)\/[^'"` /\n]+/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 跳過純註解行
    if (/^\s*\/\//.test(line)) continue;
    // 跳過 require 路徑（通常是模組路徑）
    if (/require\s*\(/.test(line) && !hardcodedPathRe.test(line.replace(/require\s*\([^)]+\)/, ''))) continue;

    if (hardcodedPathRe.test(line)) {
      issues.push({
        type: 'hardcoded-path',
        line: i + 1,
        message: '硬編碼路徑：請改用 tests/helpers/paths.js 中的路徑常數',
        severity: 'warning',
      });
    }
  }
  return issues;
}

/**
 * 規則 5：skip/only 殘留
 * test.skip、test.only、describe.skip、describe.only 不該留在 committed code。
 *
 * @param {string[]} lines
 * @returns {Array<{type, line, message, severity}>}
 */
function detectSkipOnly(lines) {
  const issues = [];
  // 偵測 test.skip、test.only、it.skip、it.only、describe.skip、describe.only
  const skipOnlyRe = /^\s*(?:test|it|describe)\.(?:skip|only)\s*\(/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (skipOnlyRe.test(line)) {
      const keyword = line.match(/\.(skip|only)/)[1];
      issues.push({
        type: 'skip-only',
        line: i + 1,
        message: `殘留 .${keyword}：不應在 committed code 中保留，請移除或還原為普通測試`,
        severity: 'error',
      });
    }
  }
  return issues;
}

// ── 核心 API ──────────────────────────────────────────────────────────────

/**
 * 掃描單一測試檔案的品質問題。
 *
 * @param {string} filePath - 絕對路徑
 * @returns {{
 *   filePath: string,
 *   issues: Array<{type: string, line: number, message: string, severity: string}>
 * }}
 */
function scanFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { filePath, issues: [] };
  }

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return { filePath, issues: [] };
  }

  // 空檔案無問題
  if (!content.trim()) {
    return { filePath, issues: [] };
  }

  const lines = content.split('\n');

  const issues = [
    ...detectSkipOnly(lines),
    ...detectEmptyTests(lines),
    ...detectLargeFile(lines),
    ...detectMissingDescribe(lines),
    ...detectHardcodedPaths(lines),
  ];

  return { filePath, issues };
}

/**
 * 遞迴收集目錄下所有 .test.js 檔案（排除 node_modules）。
 *
 * @param {string} dir
 * @returns {string[]} 絕對路徑清單
 */
function collectTestFiles(dir) {
  if (!fs.existsSync(dir)) return [];

  const results = [];

  function walk(currentDir) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name === 'node_modules') continue;

      const fullPath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}

/**
 * 掃描整個測試目錄的品質問題，回傳彙整報告。
 *
 * @param {string} [testsDir] - 測試目錄路徑，預設為專案根目錄下的 tests/
 * @returns {{
 *   issues: Array<{filePath: string, type: string, line: number, message: string, severity: string}>,
 *   summary: {
 *     total: number,
 *     byType: Object.<string, number>
 *   }
 * }}
 */
function scanTestQuality(testsDir) {
  const targetDir = testsDir || DEFAULT_TESTS_DIR;
  const testFiles = collectTestFiles(targetDir);

  const allIssues = [];

  for (const filePath of testFiles) {
    const { issues } = scanFile(filePath);
    for (const issue of issues) {
      allIssues.push({ filePath, ...issue });
    }
  }

  // 統計 byType
  const byType = {};
  for (const issue of allIssues) {
    byType[issue.type] = (byType[issue.type] || 0) + 1;
  }

  return {
    issues: allIssues,
    summary: {
      total: allIssues.length,
      byType,
    },
  };
}

// ── 匯出 ──────────────────────────────────────────────────────────────────

module.exports = {
  scanFile,
  scanTestQuality,
  // 以下為測試用 export
  detectEmptyTests,
  detectLargeFile,
  detectMissingDescribe,
  detectHardcodedPaths,
  detectSkipOnly,
  collectTestFiles,
};
