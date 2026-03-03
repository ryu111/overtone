#!/usr/bin/env node
'use strict';
/**
 * heartbeat.js — 心跳引擎 daemon
 *
 * CLI 介面：
 *   bun scripts/heartbeat.js start [--project-root <path>]
 *   bun scripts/heartbeat.js stop
 *   bun scripts/heartbeat.js status
 *
 * 架構：
 *   - start：spawn 自身為 _daemon 子命令（detached），parent exit
 *   - _daemon：polling execution-queue 每 10 秒，spawn session，管理安全邊界
 *   - stop：讀 PID 檔，送 SIGTERM，刪 PID 檔
 *   - status：讀 PID 檔 + heartbeat-state.json，輸出狀態
 *
 * 依賴注入（_deps）：供測試替換所有副作用
 */

const path = require('path');
const { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } = require('fs');
const { spawn: defaultSpawn } = require('child_process');
const paths = require('./lib/paths');
const { atomicWrite } = require('./lib/utils');

// ── 常數 ──

const POLL_INTERVAL_MS = 10_000; // 10 秒
const CONSECUTIVE_FAILURE_THRESHOLD = 3;

// ── PID 檔工具 ──

/**
 * 讀取 PID 檔，回傳數字 PID 或 null
 * @param {object} [_deps]
 * @returns {number|null}
 */
function readPid(_deps = {}) {
  const readFn = _deps.readFileSync || readFileSync;
  const existsFn = _deps.existsSync || existsSync;
  const pidFile = paths.HEARTBEAT_PID_FILE;

  if (!existsFn(pidFile)) return null;
  try {
    const content = readFn(pidFile, 'utf8').trim();
    const pid = parseInt(content, 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

/**
 * 寫入 PID 檔
 * @param {number} pid
 * @param {object} [_deps]
 */
function writePid(pid, _deps = {}) {
  const writeFn = _deps.writeFileSync || writeFileSync;
  const mkdirFn = _deps.mkdirSync || mkdirSync;
  const pidFile = paths.HEARTBEAT_PID_FILE;

  mkdirFn(path.dirname(pidFile), { recursive: true });
  writeFn(pidFile, String(pid) + '\n', 'utf8');
}

/**
 * 刪除 PID 檔
 * @param {object} [_deps]
 */
function deletePid(_deps = {}) {
  const unlinkFn = _deps.unlinkSync || unlinkSync;
  const existsFn = _deps.existsSync || existsSync;
  const pidFile = paths.HEARTBEAT_PID_FILE;

  try {
    if (existsFn(pidFile)) {
      unlinkFn(pidFile);
    }
  } catch {
    // 靜默失敗
  }
}

/**
 * 確認 process 是否存活（透過 signal 0）
 * @param {number} pid
 * @returns {boolean}
 */
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// ── 狀態檔工具 ──

/** 預設依賴（供 _deps 覆蓋） */
const DEFAULT_STATE_DEPS = {
  atomicWrite,
  existsSync,
  readFileSync,
  unlinkSync,
};

/**
 * 讀取 heartbeat-state.json
 * @param {object} [_deps] - 可注入 existsSync / readFileSync 供測試替換
 * @returns {object|null}
 */
function readState(_deps = {}) {
  const existsFn = _deps.existsSync || DEFAULT_STATE_DEPS.existsSync;
  const readFn   = _deps.readFileSync || DEFAULT_STATE_DEPS.readFileSync;
  const stateFile = paths.HEARTBEAT_STATE_FILE;
  if (!existsFn(stateFile)) return null;
  try {
    return JSON.parse(readFn(stateFile, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * 將 daemon 狀態持久化到 heartbeat-state.json
 * @param {object} state - daemon 記憶體狀態
 * @param {object} [_deps] - 可注入 atomicWrite 供測試替換
 */
function persistState(state, _deps = {}) {
  const writeFn   = _deps.atomicWrite || DEFAULT_STATE_DEPS.atomicWrite;
  const stateFile = paths.HEARTBEAT_STATE_FILE;
  const now = new Date().toISOString();
  const data = {
    pid: state.pid,
    projectRoot: state.projectRoot,
    activeItem: state.activeSession ? state.activeSession.itemName : null,
    consecutiveFailures: state.consecutiveFailures,
    paused: state.paused,
    startedAt: state.startedAt,
    lastPollAt: now,
  };
  // 更新 in-memory state 的 lastPollAt，供測試不需要讀檔即可驗證
  state.lastPollAt = now;
  writeFn(stateFile, data);
}

/**
 * 清理狀態檔
 * @param {object} [_deps] - 可注入 existsSync / unlinkSync 供測試替換
 */
function cleanState(_deps = {}) {
  const existsFn  = _deps.existsSync  || DEFAULT_STATE_DEPS.existsSync;
  const unlinkFn  = _deps.unlinkSync  || DEFAULT_STATE_DEPS.unlinkSync;
  const stateFile = paths.HEARTBEAT_STATE_FILE;
  try {
    if (existsFn(stateFile)) {
      unlinkFn(stateFile);
    }
  } catch {
    // 靜默失敗
  }
}

// ── 核心 poll 邏輯（獨立函式，供測試直接呼叫）──

/**
 * 建立 poll 函式（閉包，持有 state 和依賴）
 * 回傳的 poll() 每次執行一輪佇列偵測邏輯。
 *
 * @param {string} projectRoot
 * @param {object} state - daemon 記憶體狀態物件（可變）
 * @param {object} deps - 依賴物件
 * @param {object} deps.executionQueue
 * @param {Function} deps.spawnSession
 * @param {Function} deps.notify
 * @param {Function} [deps.persistState] - 供測試替換，預設使用模組內的 persistState
 * @returns {Function} async poll()
 */
function _createPollFn(projectRoot, state, deps) {
  const { executionQueue, spawnSession: spawnSessionFn, notify } = deps;
  const persistStateFn = deps.persistState || persistState;

  return async function poll() {
    // 1. 有活躍 session → 跳過（並行 = 1）
    if (state.activeSession !== null) {
      persistStateFn(state);
      return;
    }

    // 2. paused → 跳過
    if (state.paused) {
      persistStateFn(state);
      return;
    }

    // 3. 有 in_progress 項目 → 跳過（其他 session 正在執行）
    let current;
    try {
      current = executionQueue.getCurrent(projectRoot);
    } catch {
      persistStateFn(state);
      return;
    }
    if (current) {
      persistStateFn(state);
      return;
    }

    // 4. 取下一個 pending 項目
    let next;
    try {
      next = executionQueue.getNext(projectRoot);
    } catch {
      persistStateFn(state);
      return;
    }
    if (!next) {
      persistStateFn(state);
      return;
    }

    const { item } = next;

    // 5. 標記為 in_progress
    try {
      executionQueue.advanceToNext(projectRoot);
    } catch {
      persistStateFn(state);
      return;
    }

    // 6. 通知：開始執行
    notify(`開始執行 ${item.name}（workflow: ${item.workflow}）`);

    // 7. spawn session
    const prompt = `開始執行 ${item.name}，workflow: ${item.workflow}`;
    let spawnResult;
    try {
      spawnResult = spawnSessionFn(prompt, { cwd: projectRoot });
    } catch {
      // spawn 本身失敗
      state.consecutiveFailures++;
      try { executionQueue.failCurrent(projectRoot, 'spawn 失敗'); } catch { /* 靜默 */ }
      notify(`執行 ${item.name} 失敗（spawn 錯誤），連續失敗：${state.consecutiveFailures}`);
      if (state.consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD) {
        state.paused = true;
        notify('連續 3 次失敗，daemon 暫停');
      }
      persistStateFn(state);
      return;
    }

    // 8. 設定 activeSession
    state.activeSession = {
      child: spawnResult.child,
      itemName: item.name,
      startedAt: new Date().toISOString(),
    };
    persistStateFn(state);

    // 9. 監聽 outcome（非同步）
    spawnResult.outcome.then((result) => {
      if (result.status === 'success') {
        try { executionQueue.completeCurrent(projectRoot); } catch { /* 靜默 */ }
        state.consecutiveFailures = 0;
        notify(`${item.name} 執行完成`);
      } else {
        const reason = result.errorCode || result.status || '未知錯誤';
        try { executionQueue.failCurrent(projectRoot, reason); } catch { /* 靜默 */ }
        state.consecutiveFailures++;
        notify(`${item.name} 執行失敗（${reason}），連續失敗：${state.consecutiveFailures}`);

        if (state.consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD) {
          state.paused = true;
          notify('連續 3 次失敗，daemon 暫停');
        }
      }

      state.activeSession = null;
      persistStateFn(state);
    }).catch(() => {
      // outcome Promise 不應 throw，但防禦性捕獲
      state.activeSession = null;
      state.consecutiveFailures++;
      try { executionQueue.failCurrent(projectRoot, '未知錯誤'); } catch { /* 靜默 */ }
      persistStateFn(state);
    });
  };
}

// ── start 命令 ──

/**
 * 啟動 daemon（fork 自身為 _daemon 子命令）
 * @param {string} projectRoot
 * @param {object} [_deps]
 */
function cmdStart(projectRoot, _deps = {}) {
  const spawnFn = _deps.spawn || defaultSpawn;
  const readPidFn = _deps.readPid || readPid;
  const writePidFn = _deps.writePid || writePid;
  const deletePidFn = _deps.deletePid || deletePid;
  const exitFn = _deps.exit || ((code) => process.exit(code));

  // 檢查 PID 檔
  const existingPid = readPidFn(_deps);
  if (existingPid !== null) {
    if (isProcessAlive(existingPid)) {
      console.log(`heartbeat daemon 已在執行（PID: ${existingPid}）`);
      exitFn(1);
      return;
    }
    // stale PID — 自動清理
    deletePidFn(_deps);
  }

  // fork 自身為 _daemon 子命令（detached）
  const scriptPath = __filename;
  const args = ['_daemon', '--project-root', projectRoot];

  const child = spawnFn(process.execPath, [scriptPath, ...args], {
    detached: true,
    stdio: 'ignore',
  });

  // 寫入 PID 檔（子程序 PID）
  writePidFn(child.pid, _deps);

  child.unref();

  console.log(`heartbeat daemon 已啟動（PID: ${child.pid}）`);
  exitFn(0);
}

// ── stop 命令 ──

/**
 * 停止 daemon（送 SIGTERM）
 * @param {object} [_deps]
 */
function cmdStop(_deps = {}) {
  const readPidFn = _deps.readPid || readPid;
  const exitFn = _deps.exit || ((code) => process.exit(code));

  const pid = readPidFn(_deps);
  if (pid === null) {
    console.log('heartbeat daemon 未在執行');
    exitFn(0);
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
    console.log(`heartbeat daemon 已停止（PID: ${pid}）`);
  } catch {
    console.log('heartbeat daemon 未在執行（無法送 SIGTERM）');
  }

  exitFn(0);
}

// ── status 命令 ──

/**
 * 顯示 daemon 狀態
 * @param {object} [_deps]
 */
function cmdStatus(_deps = {}) {
  const readPidFn = _deps.readPid || readPid;

  const pid = readPidFn(_deps);
  if (pid === null || !isProcessAlive(pid)) {
    console.log('heartbeat daemon 未在執行');
    return;
  }

  const state = readState();
  if (!state) {
    console.log(`heartbeat daemon 執行中（PID: ${pid}），但尚無狀態資料`);
    return;
  }

  console.log('heartbeat daemon 狀態：');
  console.log(`  PID：${state.pid}`);
  console.log(`  projectRoot：${state.projectRoot}`);
  console.log(`  activeItem：${state.activeItem || '（無）'}`);
  console.log(`  paused：${state.paused}`);
  console.log(`  consecutiveFailures：${state.consecutiveFailures}`);
  console.log(`  startedAt：${state.startedAt}`);
  console.log(`  lastPollAt：${state.lastPollAt || '（未 poll 過）'}`);
}

// ── _daemon 子命令（實際常駐程序）──

/**
 * Daemon 主體：初始化狀態、設置 SIGTERM handler、啟動 polling loop
 * @param {string} projectRoot
 * @param {object} [_deps]
 * @param {Function} [_deps.writePid]
 * @param {Function} [_deps.deletePid]
 * @param {Function} [_deps.spawnSession]
 * @param {object}   [_deps.executionQueue]
 * @param {Function} [_deps.TelegramAdapter]
 * @param {Function} [_deps.setInterval] - 供測試替換（預設 global.setInterval）
 * @param {Function} [_deps.processOn]   - 供測試替換（預設 process.on.bind(process)）
 * @param {Function} [_deps.processExit] - 供測試替換（預設 process.exit）
 */
function cmdDaemon(projectRoot, _deps = {}) {
  const writePidFn = _deps.writePid || writePid;
  const deletePidFn = _deps.deletePid || deletePid;
  const spawnSessionFn = _deps.spawnSession || require('./lib/session-spawner').spawnSession;
  const executionQueue = _deps.executionQueue || require('./lib/execution-queue');
  const TelegramAdapterClass = _deps.TelegramAdapter || require('./lib/remote/telegram-adapter');
  const setIntervalFn = _deps.setInterval || setInterval;
  const processOnFn = _deps.processOn || ((event, handler) => process.on(event, handler));
  const processExitFn = _deps.processExit || ((code) => process.exit(code));

  // 初始化 Telegram（缺少設定時靜默）
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;
  let telegram = null;
  if (telegramToken) {
    telegram = new TelegramAdapterClass(telegramToken, null, {
      chatId: telegramChatId || null,
    });
  }

  // 便捷 notify wrapper（token 不存在時靜默）
  function notify(message) {
    if (!telegram) return;
    telegram.notify(message).catch(() => {});
  }

  // daemon 記憶體狀態
  const state = {
    pid: process.pid,
    projectRoot,
    activeSession: null,   // { child, itemName, startedAt }
    consecutiveFailures: 0,
    paused: false,
    startedAt: new Date().toISOString(),
  };

  // 寫入 PID 檔（daemon 自身 PID）
  writePidFn(state.pid, _deps);

  // 初始化持久化狀態
  persistState(state);

  // 建立 poll 函式
  const poll = _createPollFn(projectRoot, state, { executionQueue, spawnSession: spawnSessionFn, notify });

  // SIGTERM 優雅關閉
  function cleanup() {
    if (state.activeSession) {
      try {
        state.activeSession.child.kill('SIGTERM');
      } catch {
        // 靜默失敗
      }
    }
    deletePidFn(_deps);
    cleanState();
    processExitFn(0);
  }

  processOnFn('SIGTERM', cleanup);

  // 啟動 polling
  const intervalHandle = setIntervalFn(() => {
    poll().catch(() => {});
  }, POLL_INTERVAL_MS);

  // 立即執行第一次 poll
  poll().catch(() => {});

  // ref 確保 setInterval 保持存活
  if (intervalHandle && intervalHandle.ref) intervalHandle.ref();

  // 回傳 cleanup 供測試使用
  return { state, poll, cleanup };
}

// ── CLI 入口 ──

/**
 * 解析 CLI 參數並執行對應命令
 * 僅在直接執行時呼叫（非 require）
 * @param {string[]} [argv] - 參數陣列（預設 process.argv.slice(2)）
 * @param {object} [_deps] - 依賴注入
 */
function main(argv, _deps = {}) {
  const args = argv || process.argv.slice(2);
  const command = args[0];

  // 解析 --project-root
  const prIdx = args.indexOf('--project-root');
  const projectRoot = prIdx !== -1 && args[prIdx + 1]
    ? path.resolve(args[prIdx + 1])
    : process.cwd();

  switch (command) {
    case 'start':
      cmdStart(projectRoot, _deps);
      break;
    case 'stop':
      cmdStop(_deps);
      break;
    case 'status':
      cmdStatus(_deps);
      break;
    case '_daemon':
      cmdDaemon(projectRoot, _deps);
      break;
    default:
      console.log('用法：bun scripts/heartbeat.js <start|stop|status> [--project-root <path>]');
      process.exit(1);
  }
}

// 直接執行時啟動（非 require）
if (require.main === module) {
  main();
}

module.exports = {
  main,
  cmdStart,
  cmdStop,
  cmdStatus,
  cmdDaemon,
  readPid,
  writePid,
  deletePid,
  persistState,
  cleanState,
  _createPollFn,
  // 供測試存取的常數
  POLL_INTERVAL_MS,
  CONSECUTIVE_FAILURE_THRESHOLD,
};
