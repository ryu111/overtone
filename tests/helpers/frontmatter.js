'use strict';
/**
 * tests/helpers/frontmatter.js — 共享 YAML frontmatter 解析工具
 *
 * 解析 Markdown 檔案的 YAML frontmatter（--- 區塊），
 * 支援多行 list 格式（- item）與 boolean/number 型別推斷。
 *
 * 設計限制：純文字解析，不依賴 js-yaml 或 gray-matter，
 * 避免 timestamp 自動轉型等副作用。
 */

const fs = require('fs');

/**
 * 解析指定 .md 檔案的 YAML frontmatter
 *
 * @param {string} filePath - 檔案絕對路徑
 * @returns {object} frontmatter 欄位物件；無 frontmatter 時回傳空物件 {}
 *
 * 支援的型別：
 *   - boolean：`true` / `false` → true / false
 *   - number：純數字字串 → Number
 *   - list：值為空（key:）+ 後續 `  - item` 行 → string[]
 *   - string：其他情況
 */
function parseFrontmatter(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  const yaml = match[1];
  const result = {};
  let currentKey = null;
  let inList = false;

  for (const line of yaml.split('\n')) {
    const listItemMatch = line.match(/^  - (.+)$/);
    const kvMatch = line.match(/^([a-zA-Z_-]+):\s*(.*)$/);

    if (listItemMatch && inList && currentKey) {
      if (!Array.isArray(result[currentKey])) {
        result[currentKey] = [];
      }
      result[currentKey].push(listItemMatch[1].trim());
    } else if (kvMatch) {
      currentKey = kvMatch[1];
      const value = kvMatch[2].trim();
      if (value === '') {
        result[currentKey] = [];
        inList = true;
      } else if (value === 'true') {
        result[currentKey] = true;
        inList = false;
      } else if (value === 'false') {
        result[currentKey] = false;
        inList = false;
      } else if (!isNaN(Number(value)) && value !== '') {
        result[currentKey] = Number(value);
        inList = false;
      } else {
        result[currentKey] = value;
        inList = false;
      }
    }
  }

  return result;
}

module.exports = { parseFrontmatter };
