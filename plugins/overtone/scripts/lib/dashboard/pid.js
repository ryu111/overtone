'use strict';
/**
 * pid.js — Dashboard 程序管理
 *
 * 管理 ~/.overtone/dashboard.json，追蹤 Dashboard server 的 PID/port。
 * 用於 SessionStart hook 判斷是否需要 spawn 新 server。
 */

const { readFileSync, unlinkSync } = require('fs');
const { DASHBOARD_FILE } = require('../paths');
const { atomicWrite } = require('../utils');

/**
 * 寫入 Dashboard 狀態
 * @param {{pid: number, port: number, startedAt: string}} info
 */
function write(info) {
  atomicWrite(DASHBOARD_FILE, info);
}

/**
 * 讀取 Dashboard 狀態
 * @returns {{pid: number, port: number, startedAt: string}|null}
 */
function read() {
  try {
    return JSON.parse(readFileSync(DASHBOARD_FILE, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * 移除 PID 檔案
 */
function remove() {
  try {
    unlinkSync(DASHBOARD_FILE);
  } catch {
    // 檔案不存在時靜默
  }
}

/**
 * 檢查 Dashboard server 是否在執行中
 * @returns {boolean}
 */
function isRunning() {
  const info = read();
  if (!info || !info.pid) return false;

  try {
    // 信號 0 只檢查進程是否存在，不實際發送信號
    process.kill(info.pid, 0);
    return true;
  } catch {
    // 進程不存在，清理殘留的 PID 檔案
    remove();
    return false;
  }
}

/**
 * 取得 Dashboard URL
 * @returns {string|null}
 */
function getUrl() {
  const info = read();
  if (!info) return null;
  return `http://localhost:${info.port}`;
}

module.exports = { write, read, remove, isRunning, getUrl };
