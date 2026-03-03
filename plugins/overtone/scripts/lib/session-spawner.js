'use strict';
/**
 * session-spawner.js — Claude Code session 啟動封裝
 *
 * 以 `claude -p` 啟動新的 headless session，
 * 監聽 stream-json stdout 偵測完成，支援 timeout 兜底。
 *
 * 依賴注入：最後一個參數 _deps = { spawn } 供測試替換。
 */

const { spawn: defaultSpawn } = require('child_process');
const path = require('path');

// PLUGIN_DIR 預設值：相對 __dirname 自動偵測 plugins/overtone
const DEFAULT_PLUGIN_DIR = path.resolve(__dirname, '..', '..');

// 預設 timeout：60 分鐘（毫秒）
const DEFAULT_TIMEOUT_MS = 60 * 60 * 1000;

/**
 * 組裝 claude CLI 參數陣列
 * @param {object} opts
 * @param {string} [opts.pluginDir] - plugin 目錄路徑（預設自動偵測）
 * @param {string} [opts.outputFormat] - output format（預設 stream-json）
 * @returns {string[]} 參數陣列（不含 prompt，由 spawnSession 組裝完整命令）
 */
function _buildArgs(opts = {}) {
  const pluginDir = opts.pluginDir || DEFAULT_PLUGIN_DIR;
  const outputFormat = opts.outputFormat || 'stream-json';

  return [
    '-p',
    '--plugin-dir', pluginDir,
    '--output-format', outputFormat,
  ];
}

/**
 * spawn 一個新的 Claude Code session
 *
 * @param {string} prompt - 傳給 claude -p 的 prompt 文字
 * @param {object} [opts]
 * @param {string} [opts.pluginDir] - plugin 目錄路徑（預設自動偵測）
 * @param {string} [opts.cwd] - 子程序工作目錄
 * @param {number} [opts.timeout] - 逾時毫秒（預設 3600000 = 60 分鐘）
 * @param {string} [opts.outputFormat] - output format（預設 stream-json）
 * @param {object} [_deps] - 依賴注入
 * @param {Function} [_deps.spawn] - child_process.spawn 替換（測試用）
 * @returns {{ child: import('child_process').ChildProcess, outcome: Promise<SessionOutcome> }}
 */
function spawnSession(prompt, opts = {}, _deps = {}) {
  const spawnFn = _deps.spawn || defaultSpawn;
  const timeoutMs = opts.timeout !== undefined ? opts.timeout : DEFAULT_TIMEOUT_MS;

  const args = _buildArgs(opts);
  // prompt 作為最後一個參數傳入
  const fullArgs = [...args, prompt];

  const spawnOpts = {
    stdio: ['ignore', 'pipe', 'pipe'],
  };
  if (opts.cwd) {
    spawnOpts.cwd = opts.cwd;
  }

  const child = spawnFn('claude', fullArgs, spawnOpts);

  /** @type {Promise<SessionOutcome>} */
  const outcome = new Promise((resolve) => {
    let settled = false;
    let sessionId = null;
    let timeoutHandle = null;

    function settle(result) {
      if (settled) return;
      settled = true;
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      resolve(result);
    }

    // timeout 兜底
    if (timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        // 嘗試殺死子程序
        try {
          child.kill('SIGTERM');
        } catch {
          // 靜默失敗
        }
        settle({ status: 'timeout', sessionId: null, errorCode: null });
      }, timeoutMs);
    }

    // stream-json stdout 解析
    let buffer = '';
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();

      // 換行分割，逐行解析 JSON
      const lines = buffer.split('\n');
      // 最後一段可能不完整，保留到下一次 data 事件
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const obj = JSON.parse(trimmed);

          // 記錄 session_id（任何事件都可能帶有）
          if (obj.session_id && !sessionId) {
            sessionId = obj.session_id;
          }

          // result 事件 → 完成訊號
          if (obj.type === 'result') {
            const subtype = obj.subtype || '';
            // 同步 session_id（result 事件可能也帶有）
            if (obj.session_id) {
              sessionId = obj.session_id;
            }

            if (subtype === 'success') {
              settle({ status: 'success', sessionId, errorCode: null });
            } else {
              settle({ status: 'error', sessionId: obj.session_id || sessionId, errorCode: subtype || null });
            }
          }
        } catch {
          // JSON 解析失敗，忽略此行
        }
      }
    });

    // stdout 關閉：若尚未 settle，視為 crash
    child.stdout.on('close', () => {
      settle({ status: 'crash', sessionId: null, errorCode: null });
    });

    // 子程序退出（異常退出也觸發 crash）
    child.on('error', () => {
      settle({ status: 'crash', sessionId: null, errorCode: null });
    });
  });

  return { child, outcome };
}

module.exports = {
  spawnSession,
  _buildArgs,
};
