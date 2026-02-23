'use strict';
/**
 * sse.js — SSE 連線管理 + 檔案監聽推送
 *
 * 核心職責：
 * 1. 管理 SSE 連線池（每個 sessionId 一組 controllers）
 * 2. fs.watch 監聽 workflow.json + timeline.jsonl 變更
 * 3. 檔案變更 → 讀取新資料 → 推送到對應 SSE 連線
 * 4. 每 15 秒 heartbeat 保持連線活躍
 */

const { watch, statSync, openSync, readSync, closeSync, fstatSync } = require('fs');
const { existsSync } = require('fs');
const paths = require('../paths');
const state = require('../state');

// ── 連線池 ──

/** @type {Map<string, Set<ReadableStreamDefaultController>>} */
const connections = new Map();

/** @type {Set<ReadableStreamDefaultController>} 全 session 監聽（首頁用） */
const allConnections = new Set();

// ── 檔案監聽器 ──

/** @type {Map<string, {ww: FSWatcher|null, tw: FSWatcher|null, lastSize: number}>} */
const watchers = new Map();

// ── Heartbeat ──

const HEARTBEAT_INTERVAL = 15000;
let heartbeatTimer = null;

function startHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    const data = JSON.stringify({ ts: new Date().toISOString() });
    for (const [, conns] of connections) {
      for (const ctrl of conns) {
        sendSSE(ctrl, 'heartbeat', data);
      }
    }
    for (const ctrl of allConnections) {
      sendSSE(ctrl, 'heartbeat', data);
    }
  }, HEARTBEAT_INTERVAL);
}

// ── SSE 傳送 ──

/**
 * 送出一筆 SSE 事件
 * @param {ReadableStreamDefaultController} controller
 * @param {string} event - SSE event name
 * @param {string} data - JSON 字串
 */
function sendSSE(controller, event, data) {
  try {
    controller.enqueue(`event: ${event}\ndata: ${data}\n\n`);
  } catch {
    // 連線已關閉，靜默忽略
  }
}

/**
 * 廣播事件到指定 session 的所有連線
 * @param {string} sessionId
 * @param {string} event
 * @param {object} data
 */
function broadcast(sessionId, event, data) {
  const jsonData = JSON.stringify(data);
  const conns = connections.get(sessionId);
  if (conns) {
    for (const ctrl of conns) {
      sendSSE(ctrl, event, jsonData);
    }
  }
  // 同時推送到 all 連線
  for (const ctrl of allConnections) {
    sendSSE(ctrl, event, jsonData);
  }
}

// ── 連線管理 ──

function addConnection(sessionId, controller) {
  if (!connections.has(sessionId)) {
    connections.set(sessionId, new Set());
  }
  connections.get(sessionId).add(controller);
  startHeartbeat();
}

function removeConnection(sessionId, controller) {
  const conns = connections.get(sessionId);
  if (conns) {
    conns.delete(controller);
    if (conns.size === 0) {
      connections.delete(sessionId);
      maybeStopWatcher(sessionId);
    }
  }
}

function addAllConnection(controller) {
  allConnections.add(controller);
  startHeartbeat();
}

function removeAllConnection(controller) {
  allConnections.delete(controller);
}

// ── 檔案監聽 ──

/**
 * 確保指定 session 有檔案監聽器
 */
function ensureWatcher(sessionId) {
  if (watchers.has(sessionId)) return;

  const workflowPath = paths.session.workflow(sessionId);
  const timelinePath = paths.session.timeline(sessionId);
  const watcherState = { ww: null, tw: null, lastSize: 0 };

  // 監聽 workflow.json
  try {
    if (existsSync(workflowPath)) {
      watcherState.ww = watch(workflowPath, () => {
        const data = state.readState(sessionId);
        if (data) broadcast(sessionId, 'workflow', data);
      });
    }
  } catch {
    // 檔案不存在時略過
  }

  // 監聽 timeline.jsonl
  try {
    if (existsSync(timelinePath)) {
      watcherState.lastSize = getFileSize(timelinePath);
      watcherState.tw = watch(timelinePath, () => {
        const newEvents = readNewLines(timelinePath, watcherState.lastSize);
        watcherState.lastSize = getFileSize(timelinePath);
        for (const event of newEvents) {
          broadcast(sessionId, 'timeline', event);
        }
      });
    }
  } catch {
    // 檔案不存在時略過
  }

  // 監聽 session 目錄（捕捉新建檔案）
  try {
    const sessionDir = paths.sessionDir(sessionId);
    if (existsSync(sessionDir)) {
      const dirWatcher = watch(sessionDir, (_, filename) => {
        // 檔案首次建立時，啟動對應的 watcher
        if (filename === 'workflow.json' && !watcherState.ww) {
          try {
            watcherState.ww = watch(workflowPath, () => {
              const data = state.readState(sessionId);
              if (data) broadcast(sessionId, 'workflow', data);
            });
            // 推送初始狀態
            const data = state.readState(sessionId);
            if (data) broadcast(sessionId, 'workflow', data);
          } catch {}
        }
        if (filename === 'timeline.jsonl' && !watcherState.tw) {
          try {
            watcherState.lastSize = 0;
            watcherState.tw = watch(timelinePath, () => {
              const newEvents = readNewLines(timelinePath, watcherState.lastSize);
              watcherState.lastSize = getFileSize(timelinePath);
              for (const event of newEvents) {
                broadcast(sessionId, 'timeline', event);
              }
            });
          } catch {}
        }
      });
      watcherState.dirWatcher = dirWatcher;
    }
  } catch {}

  watchers.set(sessionId, watcherState);
}

/**
 * 無連線時停止 watcher
 */
function maybeStopWatcher(sessionId) {
  const conns = connections.get(sessionId);
  if (conns && conns.size > 0) return;

  const w = watchers.get(sessionId);
  if (w) {
    if (w.ww) w.ww.close();
    if (w.tw) w.tw.close();
    if (w.dirWatcher) w.dirWatcher.close();
    watchers.delete(sessionId);
  }
}

// ── 增量讀取 ──

function getFileSize(filePath) {
  try {
    return statSync(filePath).size;
  } catch {
    return 0;
  }
}

/**
 * 增量讀取 JSONL 檔案的新行
 * @param {string} filePath
 * @param {number} fromByte - 上次讀取位置
 * @returns {object[]}
 */
function readNewLines(filePath, fromByte) {
  let fd;
  try {
    fd = openSync(filePath, 'r');
    const stat = fstatSync(fd);
    if (stat.size <= fromByte) {
      closeSync(fd);
      return [];
    }

    const buf = Buffer.alloc(stat.size - fromByte);
    readSync(fd, buf, 0, buf.length, fromByte);
    closeSync(fd);

    return buf.toString('utf8').trim().split('\n')
      .filter(Boolean)
      .map(line => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);
  } catch {
    if (fd !== undefined) try { closeSync(fd); } catch {}
    return [];
  }
}

// ── 公開 API ──

/**
 * 建立 SSE 串流
 * @param {string} sessionId
 * @returns {ReadableStream}
 */
function createSSEStream(sessionId) {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      // 包裝 controller 的 enqueue 以自動編碼
      const wrapper = {
        enqueue(text) { controller.enqueue(encoder.encode(text)); },
      };

      addConnection(sessionId, wrapper);
      ensureWatcher(sessionId);

      // 送出初始連線事件
      sendSSE(wrapper, 'connected', JSON.stringify({
        sessionId,
        serverTime: new Date().toISOString(),
      }));

      // 推送當前狀態
      const ws = state.readState(sessionId);
      if (ws) sendSSE(wrapper, 'workflow', JSON.stringify(ws));

      // 儲存 wrapper 到 controller 供 cancel 時使用
      controller._sseWrapper = wrapper;
      controller._sseSessionId = sessionId;
    },
    cancel(controller) {
      // ReadableStream cancel 時不傳 controller，需要其他方式
    },
  });
}

/**
 * 建立全 session SSE 串流（首頁用）
 * @returns {ReadableStream}
 */
function createAllSSEStream() {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      const wrapper = {
        enqueue(text) { controller.enqueue(encoder.encode(text)); },
      };

      allConnections.add(wrapper);

      sendSSE(wrapper, 'connected', JSON.stringify({
        serverTime: new Date().toISOString(),
      }));

      controller._sseWrapper = wrapper;
    },
    cancel() {},
  });
}

/**
 * 關閉所有連線和 watcher
 */
function closeAll() {
  // 停止 heartbeat
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  // 關閉所有 watcher
  for (const [, w] of watchers) {
    if (w.ww) w.ww.close();
    if (w.tw) w.tw.close();
    if (w.dirWatcher) w.dirWatcher.close();
  }
  watchers.clear();
  connections.clear();
  allConnections.clear();
}

module.exports = {
  createSSEStream,
  createAllSSEStream,
  closeAll,
  broadcast,
};
