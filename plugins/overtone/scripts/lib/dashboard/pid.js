'use strict';
/**
 * pid.js — Dashboard 程序管理
 *
 * 管理 ~/.overtone/dashboard.json，追蹤 Dashboard server 的 PID/port。
 * 用於 SessionStart hook 判斷是否需要 spawn 新 server。
 */

const { readFileSync, unlinkSync } = require('fs');
const { execSync } = require('child_process');
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
 * 同步 HTTP port probe — 用 execSync + curl 偵測 Overtone server
 *
 * 呼叫 curl GET http://localhost:{port}/health，timeout 1 秒。
 * 解析 JSON 回應，確認 ok === true 才視為 Overtone server。
 * 任何錯誤（timeout、connection refused、非 JSON）回傳 false。
 *
 * @param {number} port - 要探測的 port
 * @returns {boolean} true 表示 port 上有 Overtone server 在跑
 */
function probePort(port) {
  try {
    const result = execSync(
      `curl -s --connect-timeout 1 --max-time 1 http://localhost:${port}/health`,
      { encoding: 'utf8', timeout: 2000 },
    );
    const data = JSON.parse(result);
    return data.ok === true;
  } catch {
    return false;
  }
}

/**
 * 檢查 Dashboard server 是否在執行中
 *
 * 三層偵測策略：
 *   1. 讀取 PID 檔案 + process.kill(pid, 0) 驗證進程存在
 *   2. 若 PID 檢查失敗，嘗試 HTTP port probe（GET /health）
 *      — 偵測「server 存活但 PID 檔案 stale/不存在」的情況
 *
 * @param {object} [opts]
 * @param {number} [opts.port] - 要探測的 port（預設 7777）
 * @returns {boolean}
 */
function isRunning(opts) {
  const info = read();
  if (info && info.pid) {
    try {
      // 信號 0 只檢查進程是否存在，不實際發送信號
      process.kill(info.pid, 0);
      return true;
    } catch {
      // 進程不存在，清理殘留的 PID 檔案
      remove();
    }
  }

  // PID 檢查失敗（檔案不存在或進程已死）→ fallback 到 port probe
  const port = (opts && opts.port) || 7777;
  return probePort(port);
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

module.exports = { write, read, remove, isRunning, probePort, getUrl };
