'use strict';
/**
 * fs-scanner.js — 共用檔案系統掃描工具
 *
 * 提供帶 cache 的 .js / .md 遞迴收集，以及安全讀取工具函式。
 * 供 health-check.js、dead-code-scanner.js 等多處消費者使用。
 *
 * API：
 *   collectJsFiles(dir)   — 遞迴收集 .js 檔案（自動 cache）
 *   collectMdFiles(dir)   — 遞迴收集 .md 檔案（自動 cache）
 *   safeRead(filePath)    — 讀取檔案，失敗回傳空字串
 *   clearCache()          — 清除所有 cache（測試用）
 */

const fs = require('fs');
const path = require('path');

// ── Module 層級 Cache ──────────────────────────────────────────────────────

/** @type {Map<string, string[]>} */
const _jsCache = new Map();

/** @type {Map<string, string[]>} */
const _mdCache = new Map();

// ── 內部遞迴函式（不帶 cache，供 cache 層包裝） ──────────────────────────

/**
 * 遞迴收集 dir 下所有 .js 檔案，排除 node_modules。
 * @param {string} dir
 * @param {string[]} result
 */
function _collectJsRecursive(dir, result) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      _collectJsRecursive(fullPath, result);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      result.push(fullPath);
    }
  }
}

/**
 * 遞迴收集 dir 下所有 .md 檔案，排除 node_modules。
 * @param {string} dir
 * @param {string[]} result
 */
function _collectMdRecursive(dir, result) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      _collectMdRecursive(fullPath, result);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      result.push(fullPath);
    }
  }
}

// ── 公開 API ──────────────────────────────────────────────────────────────

/**
 * 遞迴收集目錄下所有 .js 檔案的絕對路徑（排除 node_modules）。
 * 結果自動 cache，相同 dir 第二次呼叫直接回傳同一陣列參考。
 *
 * @param {string} dir  — 目標目錄的絕對路徑
 * @returns {string[]}  — .js 檔案絕對路徑陣列（不存在的目錄回傳空陣列）
 */
function collectJsFiles(dir) {
  if (_jsCache.has(dir)) return _jsCache.get(dir);
  const result = [];
  _collectJsRecursive(dir, result);
  _jsCache.set(dir, result);
  return result;
}

/**
 * 遞迴收集目錄下所有 .md 檔案的絕對路徑（排除 node_modules）。
 * 結果自動 cache，相同 dir 第二次呼叫直接回傳同一陣列參考。
 *
 * @param {string} dir  — 目標目錄的絕對路徑
 * @returns {string[]}  — .md 檔案絕對路徑陣列（不存在的目錄回傳空陣列）
 */
function collectMdFiles(dir) {
  if (_mdCache.has(dir)) return _mdCache.get(dir);
  const result = [];
  _collectMdRecursive(dir, result);
  _mdCache.set(dir, result);
  return result;
}

/**
 * 讀取檔案內容，失敗回傳空字串。
 * @param {string} filePath
 * @returns {string}
 */
function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

/**
 * 清除所有 cache（測試用）。
 */
function clearCache() {
  _jsCache.clear();
  _mdCache.clear();
}

// ── Export 解析 ────────────────────────────────────────────────────────────

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

// ── 匯出 ──────────────────────────────────────────────────────────────────

module.exports = {
  collectJsFiles,
  collectMdFiles,
  safeRead,
  clearCache,
  parseExportKeys,
};
