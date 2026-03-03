'use strict';
/**
 * process.js — macOS Process 管理能力
 *
 * 提供列出執行中 Process、啟動 Process、終止 Process 三種功能。
 * 僅支援 macOS（darwin），其他平台回傳 UNSUPPORTED_PLATFORM。
 * 不 throw — 所有錯誤以 { ok: false, error, message } 回傳。
 *
 * 依賴注入：最後一個參數 _deps = { execSync } 或 { spawn } 供測試替換。
 */

const { execSync: defaultExecSync, spawn: defaultSpawn } = require('child_process');

// 允許的 signal 白名單
const ALLOWED_SIGNALS = ['SIGTERM', 'SIGKILL', 'SIGINT'];

// 統一 response 建構工具
function ok(fields) {
  return { ok: true, ...fields };
}

function fail(error, message) {
  return { ok: false, error, message };
}

/**
 * 列出所有執行中的 Process
 * @param {object} [_deps]
 * @param {Function} [_deps.execSync]
 * @returns {{ ok: true, processes: ProcessEntry[] }
 *           |{ ok: false, error: string, message: string }}
 */
function listProcesses(_deps = {}) {
  if (process.platform !== 'darwin') {
    return fail('UNSUPPORTED_PLATFORM', '此功能僅支援 macOS');
  }

  const execSync = _deps.execSync || defaultExecSync;

  let output;
  try {
    output = execSync('ps -axo pid,comm,%cpu,%mem,start', { encoding: 'utf8' });
  } catch (err) {
    return fail('COMMAND_FAILED', `ps 指令失敗：${err.message}`);
  }

  try {
    const lines = output.trim().split('\n');
    // 跳過 header 行（第一行）
    const dataLines = lines.slice(1).filter(line => line.trim() !== '');

    if (dataLines.length === 0) {
      return fail('PARSE_ERROR', 'ps 輸出無資料行（只有 header 或空白）');
    }

    const processes = dataLines.map(line => {
      const parts = line.trim().split(/\s+/);
      // 格式：PID COMM %CPU %MEM STARTED
      // STARTED 可能是 'HH:MM' 或 'MMM DD'（兩個欄位）
      const pid = parseInt(parts[0], 10);
      const name = parts[1];
      const cpu = parseFloat(parts[2]);
      const mem = parseFloat(parts[3]);
      // started 可能由剩餘欄位組成
      const started = parts.slice(4).join(' ');
      return { pid, name, cpu, mem, started };
    });

    return ok({ processes });
  } catch (err) {
    return fail('PARSE_ERROR', `ps 輸出解析失敗：${err.message}`);
  }
}

/**
 * 啟動一個獨立的 Process
 * @param {string} command - 要執行的指令
 * @param {string[]} [args] - 指令參數
 * @param {object} [_deps]
 * @param {Function} [_deps.spawn]
 * @returns {{ ok: true, pid: number }
 *           |{ ok: false, error: string, message: string }}
 */
function startProcess(command, args = [], _deps = {}) {
  if (process.platform !== 'darwin') {
    return fail('UNSUPPORTED_PLATFORM', '此功能僅支援 macOS');
  }

  if (command === null || command === undefined || typeof command !== 'string' || command.trim() === '') {
    return fail('INVALID_ARGUMENT', 'command 必須為非空字串');
  }

  const spawnFn = _deps.spawn || defaultSpawn;

  try {
    const child = spawnFn(command, args, {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return ok({ pid: child.pid });
  } catch (err) {
    return fail('COMMAND_FAILED', `spawn 失敗：${err.message}`);
  }
}

/**
 * 終止指定 PID 的 Process
 * @param {number} pid - 目標 Process ID
 * @param {'SIGTERM'|'SIGKILL'|'SIGINT'} [signal] - 發送的信號，預設 SIGTERM
 * @param {object} [_deps]
 * @param {Function} [_deps.execSync]
 * @returns {{ ok: true }
 *           |{ ok: false, error: string, message: string }}
 */
function killProcess(pid, signal = 'SIGTERM', _deps = {}) {
  if (process.platform !== 'darwin') {
    return fail('UNSUPPORTED_PLATFORM', '此功能僅支援 macOS');
  }

  // 拒絕 PID <= 1（init/kernel）
  if (pid <= 1) {
    return fail('INVALID_ARGUMENT', `拒絕終止系統 PID（${pid}），僅接受 PID > 1`);
  }

  // 拒絕自殺
  if (pid === process.pid) {
    return fail('INVALID_ARGUMENT', `拒絕終止自身 PID（${pid}）`);
  }

  // signal 白名單驗證
  if (!ALLOWED_SIGNALS.includes(signal)) {
    return fail('INVALID_ARGUMENT', `不支援的 signal：${signal}，允許的 signal：${ALLOWED_SIGNALS.join(', ')}`);
  }

  const execSync = _deps.execSync || defaultExecSync;

  try {
    execSync(`kill -${signal} ${pid}`, { stdio: 'pipe' });
    return ok({});
  } catch (err) {
    return fail('COMMAND_FAILED', `kill 指令失敗：${err.message}`);
  }
}

module.exports = {
  listProcesses,
  startProcess,
  killProcess,
};
