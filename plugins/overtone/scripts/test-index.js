#!/usr/bin/env node
'use strict';
/**
 * test-index.js — 測試索引掃描工具
 *
 * 掃描 tests/ 目錄下 unit/、integration/、e2e/ 子目錄的 *.test.js，
 * 產出摘要字串供 pre-task.js 注入 tester/developer 的 prompt。
 *
 * API：buildTestIndex(testsDir, options = {}) → string
 *   - testsDir: 測試根目錄路徑
 *   - options.maxChars: 最大字元數（預設 4000）
 *
 * 輸出格式：
 *   [Test Index] N files (unit: X, integration: Y, e2e: Z)
 *   ## unit/
 *   - filename.test.js: describe 名稱 | 另一個 describe
 *   ## integration/
 *   - filename.test.js: describe 名稱
 */

const fs = require('fs');
const path = require('path');

const SUBDIRS = ['unit', 'integration', 'e2e'];
const DEFAULT_MAX_CHARS = 4000;
const TRUNCATION_SUFFIX = '... (已截斷)';

/**
 * 從測試檔案內容中擷取 top-level describe 名稱
 * @param {string} content - 檔案原始內容
 * @returns {string[]} top-level describe 名稱列表
 */
function extractDescribeNames(content) {
  const names = [];
  // 匹配行首（允許最多 2 個 tab 或 8 個空白）的 describe('...') 或 describe("...")
  // 使用 matchAll，不依賴 global state
  const pattern = /^[ \t]{0,8}describe\s*\(\s*(['"`])([\s\S]*?)\1/gm;
  for (const m of content.matchAll(pattern)) {
    const name = m[2].trim();
    if (name) {
      names.push(name);
    }
  }
  return names;
}

/**
 * 掃描單一子目錄，回傳各檔案資訊
 * @param {string} subdir - 子目錄完整路徑
 * @returns {{ filename: string, describes: string[] }[]}
 */
function scanSubdir(subdir) {
  let entries;
  try {
    entries = fs.readdirSync(subdir);
  } catch {
    return [];
  }

  const results = [];
  const testFiles = entries.filter((e) => e.endsWith('.test.js')).sort();

  for (const filename of testFiles) {
    const filePath = path.join(subdir, filename);
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      // 單檔失敗 → 靜默跳過
      continue;
    }
    const describes = extractDescribeNames(content);
    results.push({ filename, describes });
  }

  return results;
}

/**
 * 建立測試索引摘要字串
 * @param {string} testsDir - 測試根目錄路徑
 * @param {{ maxChars?: number }} [options={}]
 * @returns {string} 摘要字串，目錄不存在時回傳 ''
 */
function buildTestIndex(testsDir, options = {}) {
  const maxChars = options.maxChars !== undefined ? options.maxChars : DEFAULT_MAX_CHARS;

  // 目錄不存在 → 回傳空字串
  if (!fs.existsSync(testsDir)) {
    return '';
  }

  // 各子目錄的掃描結果
  const sections = {};
  let totalFiles = 0;

  for (const sub of SUBDIRS) {
    const subPath = path.join(testsDir, sub);
    const files = scanSubdir(subPath);
    sections[sub] = files;
    totalFiles += files.length;
  }

  // 全部失敗（無任何可讀檔案）→ 回傳空字串
  if (totalFiles === 0) {
    return '';
  }

  // 組裝輸出行
  const counts = SUBDIRS.map((s) => `${s}: ${sections[s].length}`).join(', ');
  const lines = [`[Test Index] ${totalFiles} files (${counts})`];

  for (const sub of SUBDIRS) {
    const files = sections[sub];
    if (files.length === 0) continue;

    lines.push(`## ${sub}/`);
    for (const { filename, describes } of files) {
      const descPart = describes.length > 0
        ? describes.join(' | ')
        : '（無 describe）';
      lines.push(`- ${filename}: ${descPart}`);
    }
  }

  let result = lines.join('\n');

  // maxChars 截斷保護
  if (result.length > maxChars) {
    result = result.slice(0, maxChars - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX;
  }

  return result;
}

module.exports = { buildTestIndex };

// ── CLI 模式 ──

if (require.main === module) {
  const testsDir = process.argv[2] || path.join(process.cwd(), 'tests');
  const output = buildTestIndex(testsDir);
  if (output) {
    process.stdout.write(output + '\n');
  }
  process.exit(0);
}
