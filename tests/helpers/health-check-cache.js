'use strict';
/**
 * health-check-cache.js — runAllChecks 跨文件共用 cache
 *
 * 利用 Node.js module cache 特性：同一 bun test process 中，
 * 所有 require('../helpers/health-check-cache') 共享同一個 module instance。
 *
 * 在 test-parallel.js SEQUENTIAL_GROUPS['health-check'] 中，
 * 所有 health-check 測試在同一進程中串行執行，所以第一個文件呼叫
 * getCachedRunAllChecks() 後，後續文件可直接取用已快取的結果，
 * 節省重複執行 runAllChecks（每次 7-10 秒）的時間。
 */

const { join } = require('path');
const { SCRIPTS_DIR } = require('./paths');

// module-level singleton cache（跨文件共享）
let _cachedResult = null;

/**
 * 取得 runAllChecks() 的快取結果。
 * 同一 process 只執行一次 runAllChecks，後續呼叫直接回傳已快取結果。
 *
 * @returns {{ checks: Array, findings: Array, summary: object }}
 */
function getCachedRunAllChecks() {
  if (!_cachedResult) {
    const { runAllChecks } = require(join(SCRIPTS_DIR, 'health-check'));
    _cachedResult = runAllChecks();
  }
  return _cachedResult;
}

module.exports = { getCachedRunAllChecks };
