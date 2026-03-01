'use strict';
/**
 * utils.js — 共用工具函式
 *
 * 提供跨模組使用的基礎工具：
 *   ✅ atomicWrite — 原子寫入（tmp+rename，避免 race condition）
 *   ✅ clamp     — 數值夾限（確保 value 在 [min, max] 區間內）
 */

const { writeFileSync, renameSync, mkdirSync } = require('fs');
const { dirname } = require('path');

/**
 * 原子寫入檔案（先寫暫存檔再 rename）
 *
 * 避免多個 hook 並行觸發時的 read-modify-write race condition。
 * tmpPath 含 PID + timestamp 確保唯一性。
 *
 * @param {string} filePath - 目標檔案路徑
 * @param {object|string} data - 要寫入的資料（object 自動 JSON.stringify）
 */
let _atomicCounter = 0;

function atomicWrite(filePath, data) {
  mkdirSync(dirname(filePath), { recursive: true });
  const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n';
  const tmp = `${filePath}.${process.pid}.${Date.now()}.${_atomicCounter++}.tmp`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, filePath);
}

/**
 * 數值夾限（確保 value 在 [min, max] 區間內）
 *
 * @param {number} value - 輸入值
 * @param {number} min   - 最小值（含）
 * @param {number} max   - 最大值（含）
 * @returns {number} 夾限後的值
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * 格式化位元組數為人類可讀格式
 *
 * >= 1MB → '6.5MB'
 * >= 1KB → '800KB'
 * < 1KB  → '500B'
 * null/undefined → '--'
 *
 * @param {number|null|undefined} bytes
 * @returns {string}
 */
function formatSize(bytes) {
  if (bytes === null || bytes === undefined) return '--';
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)}MB`;
  if (bytes >= 1_000)     return `${Math.round(bytes / 1_000)}KB`;
  return `${bytes}B`;
}

module.exports = { atomicWrite, clamp, formatSize };
