'use strict';
/**
 * utils.js — 共用工具函式
 *
 * 提供跨模組使用的基礎工具：
 *   ✅ atomicWrite — 原子寫入（tmp+rename，避免 race condition）
 *   ✅ escapeHtml — HTML entity 編碼（防 XSS）
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
 * HTML entity 編碼（防止 XSS）
 *
 * 將 HTML 特殊字元轉換為安全的 entity，
 * 用於動態值插入 HTML 模板前。
 *
 * @param {string} str - 原始字串
 * @returns {string} 編碼後的安全字串
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

module.exports = { atomicWrite, escapeHtml, clamp };
