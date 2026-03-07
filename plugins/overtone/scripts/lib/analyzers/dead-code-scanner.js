#!/usr/bin/env node
'use strict';
/**
 * dead-code-scanner.js — Dead Code 自動偵測器
 *
 * 掃描 plugins/overtone/scripts/lib/ 下的未使用 exports 和孤立檔案。
 *
 * 核心 API：
 *   scanUnusedExports(libDir, searchDirs)  — 偵測未被使用的 export keys
 *   scanOrphanFiles(libDir, searchDirs)    — 偵測無人 require 的 lib 模組
 *   runDeadCodeScan(options)               — 整合掃描入口
 */

const fs = require('fs');
const { join, basename, relative } = require('path');
const fsScanner = require('../fs-scanner');

// ── 路徑常數 ──────────────────────────────────────────────────────────────

// 此檔位於 plugins/overtone/scripts/lib/analyzers/dead-code-scanner.js
// __dirname = /path/to/overtone/plugins/overtone/scripts/lib/analyzers
const OVERTONE_PLUGIN = join(__dirname, '..', '..', '..');  // plugins/overtone/
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..'); // 專案根目錄（overtone/）

const DEFAULT_LIB_DIR = join(OVERTONE_PLUGIN, 'scripts', 'lib');
const DEFAULT_SEARCH_DIRS = [
  join(OVERTONE_PLUGIN, 'hooks', 'scripts'),
  join(OVERTONE_PLUGIN, 'scripts'),
  join(PROJECT_ROOT, 'tests'),
];

// 排除規則：這些 lib 模組是 CLI entry points 或頂層 orchestrator，直接被命令列呼叫，不計入孤立
const ENTRY_POINT_BASENAMES = new Set([
  'health-check',
  'init-workflow',
  'manage-component',
  'validate-agents',
  'stop-loop',
  'test-index',
  'server',
  'specs-backlog',
  'specs-list',
  'specs-pause',
  'specs-resume',
  'statusline',
  'get-workflow-context',
  'guard-system',  // 守衛體系頂層 orchestrator，設計為直接呼叫而非被 require
]);

// ── 工具函式 ──────────────────────────────────────────────────────────────

const { collectJsFiles, safeRead } = fsScanner;

/**
 * 解析 module.exports = { ... } 中的 key 名稱。
 * 支援：
 *   - shorthand：module.exports = { a, b, c }
 *   - key-value：module.exports = { a: ..., b: ... }
 *   - module.exports.x = ... 形式
 *
 * @param {string} content
 * @returns {string[]} 去重後的 export key 清單
 */
function parseExportKeys(content) {
  const keys = [];

  // 模式 1：module.exports = { ... } 物件形式
  const objectExportMatch = content.match(/module\.exports\s*=\s*\{([^}]+)\}/s);
  if (objectExportMatch) {
    const body = objectExportMatch[1];
    // 匹配每個 entry 的 key，支援 shorthand 和 key: value 兩種格式
    const keyRe = /(?:^|[,\n])\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?=:|,|\n|$|\s*\})/gm;
    for (const m of body.matchAll(keyRe)) {
      const k = m[1];
      // 排除 JS 保留字
      if (k && !['true', 'false', 'null', 'undefined', 'return'].includes(k)) {
        keys.push(k);
      }
    }
  }

  // 模式 2：module.exports.xxx = ... 逐個賦值形式
  const dotExportRe = /module\.exports\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g;
  for (const m of content.matchAll(dotExportRe)) {
    keys.push(m[1]);
  }

  return [...new Set(keys)];
}

/**
 * 判斷 export key 是否被任何搜尋目錄中的檔案使用。
 * 條件：
 *   1. 有 require('.../{moduleName}') 引用此模組
 *   2. 在 require 之後有 key 的存取（解構或屬性存取）
 *
 * @param {string} exportKey
 * @param {string} moduleBasename  - 不含副檔名的模組名稱（如 'registry'）
 * @param {string[]} searchFiles   - 要搜尋的 .js 檔案清單
 * @returns {boolean}
 */
function isExportUsed(exportKey, moduleBasename, searchFiles) {
  // 匹配解構或屬性存取的 regex：
  //   const { exportKey } = require(...)          — 直接從 require 解構
  //   let { exportKey, other } = require(...)
  //   const { exportKey } = someVariable          — 從已賦值變數解構（先 require 再解構）
  //   something.exportKey                         — 屬性存取
  //   { exportKey }                               — 物件字面量
  //   exportKey(                                  — 函式呼叫
  //   exportKey,                                  — 逗號後
  const usageRe = new RegExp(
    `(?:const|let|var)\\s*\\{[^}]*\\b${exportKey}\\b[^}]*\\}\\s*=|` +
    `\\.${exportKey}\\b|` +
    `\\b${exportKey}\\s*(?:\\(|,|\\n|\\s*\\})`,
    'g'
  );

  for (const filePath of searchFiles) {
    const content = safeRead(filePath);
    if (!content) continue;

    // 快速篩選：此檔案必須有 require 包含模組名的路徑
    if (!content.includes(moduleBasename)) continue;

    // 重置 regex（因為有 /g flag）
    usageRe.lastIndex = 0;
    if (usageRe.test(content)) {
      return true;
    }
  }
  return false;
}

/**
 * 判斷 lib 模組是否被任何搜尋目錄中的檔案 require。
 *
 * @param {string} moduleBasename  - 不含副檔名的模組名稱（如 'registry'）
 * @param {string[]} searchFiles   - 要搜尋的 .js 檔案清單
 * @returns {boolean}
 */
function isModuleRequired(moduleBasename, searchFiles) {
  // 匹配 require('.../{moduleName}') 的 regex
  // 支援：require('./lib/registry')、require('../lib/registry')、require('/path/to/registry')
  const requireRe = new RegExp(
    `require\\s*\\(\\s*['"][^'"]*\\/${moduleBasename}['"]\\s*\\)`
  );

  for (const filePath of searchFiles) {
    const content = safeRead(filePath);
    if (!content) continue;
    if (requireRe.test(content)) {
      return true;
    }
  }
  return false;
}

// ── 核心 API ──────────────────────────────────────────────────────────────

/**
 * 掃描未使用的 exports（模組層級）。
 *
 * 掃描 libDir 中每個 .js 模組的 export keys，
 * 在 searchDirs 中搜尋這些 keys 的引用，
 * 未被任何地方引用的 export 標記為 unused。
 *
 * @param {string} [libDir]       - lib 目錄路徑，預設 plugins/overtone/scripts/lib
 * @param {string[]} [searchDirs] - 搜尋範圍目錄清單
 * @returns {{
 *   unusedExports: Array<{file: string, exportName: string, type: string}>,
 *   summary: { total: number, byFile: Object }
 * }}
 */
function scanUnusedExports(libDir, searchDirs) {
  const targetLibDir = libDir || DEFAULT_LIB_DIR;
  const targetSearchDirs = searchDirs || DEFAULT_SEARCH_DIRS;

  // 收集 lib 目錄下的所有 .js 檔案
  const libFiles = collectJsFiles(targetLibDir);

  // 收集搜尋目錄下的所有 .js 檔案（排除 libDir 本身的檔案，避免自我引用）
  const uniqueSearchFiles = [...new Set(
    targetSearchDirs.flatMap((dir) => collectJsFiles(dir))
  )];

  const unusedExports = [];

  for (const libFile of libFiles) {
    const content = safeRead(libFile);
    if (!content) continue;

    // 跳過 class instance exports（如 instinct.js 使用 module.exports = new ...）
    if (content.includes('module.exports = new ') || content.includes('module.exports=new ')) {
      continue;
    }

    const exportKeys = parseExportKeys(content);
    if (exportKeys.length === 0) continue;

    const moduleBasename = basename(libFile, '.js');

    // 搜尋時排除 lib 自身
    const otherFiles = uniqueSearchFiles.filter((f) => f !== libFile);

    for (const exportKey of exportKeys) {
      const used = isExportUsed(exportKey, moduleBasename, otherFiles);
      if (!used) {
        unusedExports.push({
          file: libFile,
          exportName: exportKey,
          type: 'unused-export',
        });
      }
    }
  }

  // 統計 byFile
  const byFile = {};
  for (const item of unusedExports) {
    byFile[item.file] = (byFile[item.file] || 0) + 1;
  }

  return {
    unusedExports,
    summary: {
      total: unusedExports.length,
      byFile,
    },
  };
}

/**
 * 掃描孤立檔案（無人 require 的 lib 模組）。
 *
 * 掃描 libDir 中每個 .js 模組，
 * 在 searchDirs 中搜尋 require('.../{moduleName}') 的引用，
 * 未被任何人 require 的模組標記為 orphan（排除已知 entry points）。
 *
 * @param {string} [libDir]       - lib 目錄路徑，預設 plugins/overtone/scripts/lib
 * @param {string[]} [searchDirs] - 搜尋範圍目錄清單
 * @returns {{
 *   orphanFiles: string[],
 *   summary: { total: number }
 * }}
 */
function scanOrphanFiles(libDir, searchDirs) {
  const targetLibDir = libDir || DEFAULT_LIB_DIR;
  const targetSearchDirs = searchDirs || DEFAULT_SEARCH_DIRS;

  // 只掃描 lib 目錄頂層的 .js（不含子目錄，子目錄通常是 internal helper）
  let libEntries;
  try {
    libEntries = fs.readdirSync(targetLibDir, { withFileTypes: true });
  } catch {
    return { orphanFiles: [], summary: { total: 0 } };
  }

  const libFiles = libEntries
    .filter((e) => e.isFile() && e.name.endsWith('.js'))
    .map((e) => join(targetLibDir, e.name));

  // 收集搜尋目錄下的所有 .js 檔案
  const uniqueSearchFiles = [...new Set(
    targetSearchDirs.flatMap((dir) => collectJsFiles(dir))
  )];

  const orphanFiles = [];

  for (const libFile of libFiles) {
    const moduleBasename = basename(libFile, '.js');

    // 排除已知 entry points（直接被 CLI 呼叫，不需要被 require）
    if (ENTRY_POINT_BASENAMES.has(moduleBasename)) continue;

    // 排除 dead-code-scanner 自身（避免自我偵測）
    if (moduleBasename === 'dead-code-scanner') continue;

    // 搜尋時排除 lib 自身（避免 lib 內部的 require 計算）
    const otherFiles = uniqueSearchFiles.filter((f) => f !== libFile);

    const required = isModuleRequired(moduleBasename, otherFiles);
    if (!required) {
      orphanFiles.push(libFile);
    }
  }

  return {
    orphanFiles,
    summary: {
      total: orphanFiles.length,
    },
  };
}

/**
 * 整合掃描入口 — 同時執行未使用 exports 和孤立檔案偵測。
 *
 * @param {{
 *   libDir?: string,
 *   searchDirs?: string[]
 * }} [options]
 * @returns {{
 *   unusedExports: Array<{file: string, exportName: string, type: string}>,
 *   orphanFiles: string[],
 *   summary: {
 *     unusedExports: number,
 *     orphanFiles: number,
 *     total: number
 *   }
 * }}
 */
function runDeadCodeScan(options = {}) {
  const { libDir, searchDirs } = options;

  const exportsResult = scanUnusedExports(libDir, searchDirs);
  const orphansResult = scanOrphanFiles(libDir, searchDirs);

  return {
    unusedExports: exportsResult.unusedExports,
    orphanFiles: orphansResult.orphanFiles,
    summary: {
      unusedExports: exportsResult.summary.total,
      orphanFiles: orphansResult.summary.total,
      total: exportsResult.summary.total + orphansResult.summary.total,
    },
  };
}

// ── 匯出 ──────────────────────────────────────────────────────────────────

module.exports = {
  scanUnusedExports,
  scanOrphanFiles,
  runDeadCodeScan,
  // 以下為測試用 export
  parseExportKeys,
  isExportUsed,
  isModuleRequired,
  collectJsFiles,
};
