'use strict';
/**
 * event-bus.js — Remote EventBus 核心
 *
 * 職責：
 *   ✅ fs.watch 監聽 workflow.json + timeline.jsonl（從 sse.js 提取）
 *   ✅ 事件分發到所有已註冊 Adapter
 *   ✅ 控制命令路由（stop / status / sessions）
 *   ✅ Heartbeat 定時推送
 *   ✅ 增量 JSONL 讀取
 */

const { watch, existsSync, statSync, readFileSync,
        openSync, readSync, closeSync, fstatSync } = require('fs');
const paths = require('../paths');
const state = require('../state');
const loop = require('../loop');
const sessions = require('../dashboard/sessions');
const { remoteCommands } = require('../registry');

const HEARTBEAT_INTERVAL = 15000;

class EventBus {
  constructor() {
    /** @type {Set<Adapter>} */
    this.adapters = new Set();

    /** @type {Map<string, {ww: FSWatcher|null, tw: FSWatcher|null, dw: FSWatcher|null, lastSize: number}>} */
    this.watchers = new Map();

    /** @type {NodeJS.Timeout|null} */
    this.heartbeatTimer = null;
  }

  // ── Adapter 管理 ──

  /** 註冊 Adapter */
  register(adapter) {
    this.adapters.add(adapter);
  }

  /** 移除 Adapter */
  unregister(adapter) {
    this.adapters.delete(adapter);
  }

  // ── 事件推送 ──

  /**
   * 推送事件到所有 Adapter
   * @param {string|null} sessionId
   * @param {string} eventType - 'workflow' | 'timeline' | 'heartbeat'
   * @param {object} data
   */
  push(sessionId, eventType, data) {
    for (const adapter of this.adapters) {
      try {
        adapter.onPush(sessionId, eventType, data);
      } catch {
        // Adapter 推送失敗不影響其他
      }
    }
  }

  // ── 控制命令 ──

  /**
   * 處理控制命令
   * @param {string|null} sessionId
   * @param {string} command - 'stop' | 'status' | 'sessions'
   * @param {object} [params={}]
   * @returns {object} 執行結果
   */
  handleControl(sessionId, command, params = {}) {
    const def = remoteCommands[command];
    if (!def) {
      return { ok: false, error: `未知的控制命令：${command}` };
    }

    try {
      switch (command) {
        case 'stop':
          return this._controlStop(sessionId);
        case 'status':
          return this._controlStatus(sessionId);
        case 'sessions':
          return this._controlSessions(params);
        default:
          return { ok: false, error: `未實作的命令：${command}` };
      }
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * 處理查詢
   * @param {string} type - 'status' | 'sessions'
   * @param {object} [params={}]
   * @returns {object}
   */
  handleQuery(type, params = {}) {
    return this.handleControl(params.sessionId || null, type, params);
  }

  // ── 控制命令實作 ──

  /** 停止 Loop（統一使用 loop.js API） */
  _controlStop(sessionId) {
    if (!sessionId) return { ok: false, error: '缺少 sessionId' };

    const loopState = loop.readLoop(sessionId);
    loopState.stopped = true;
    loopState.stoppedAt = new Date().toISOString();
    loop.writeLoop(sessionId, loopState);

    return { ok: true, message: 'Loop 已標記為停止' };
  }

  /** 查詢工作流狀態 */
  _controlStatus(sessionId) {
    if (!sessionId) return { ok: false, error: '缺少 sessionId' };

    const ws = state.readState(sessionId);
    if (!ws) return { ok: false, error: 'Session 不存在' };
    return { ok: true, data: ws };
  }

  /** 列出工作階段 */
  _controlSessions(params) {
    const filter = {};
    if (params.active !== undefined) filter.active = params.active;
    const list = sessions.listSessions(filter);
    return { ok: true, data: list };
  }

  // ── 檔案監聽（從 sse.js 移植） ──

  /**
   * 開始監聽指定 session 的檔案變更
   * @param {string} sessionId
   */
  watchSession(sessionId) {
    if (this.watchers.has(sessionId)) return;

    const workflowPath = paths.session.workflow(sessionId);
    const timelinePath = paths.session.timeline(sessionId);
    const watcherState = { ww: null, tw: null, dw: null, lastSize: 0 };

    // 監聽 workflow.json
    try {
      if (existsSync(workflowPath)) {
        watcherState.ww = watch(workflowPath, () => {
          const data = state.readState(sessionId);
          if (data) this.push(sessionId, 'workflow', data);
        });
      }
    } catch {}

    // 監聽 timeline.jsonl
    try {
      if (existsSync(timelinePath)) {
        watcherState.lastSize = this._getFileSize(timelinePath);
        watcherState.tw = watch(timelinePath, () => {
          const newEvents = this._readNewLines(timelinePath, watcherState.lastSize);
          watcherState.lastSize = this._getFileSize(timelinePath);
          for (const event of newEvents) {
            this.push(sessionId, 'timeline', event);
          }
        });
      }
    } catch {}

    // 監聽 session 目錄（捕捉新建檔案）
    try {
      const sessionDir = paths.sessionDir(sessionId);
      if (existsSync(sessionDir)) {
        watcherState.dw = watch(sessionDir, (_, filename) => {
          if (filename === 'workflow.json' && !watcherState.ww) {
            try {
              watcherState.ww = watch(workflowPath, () => {
                const data = state.readState(sessionId);
                if (data) this.push(sessionId, 'workflow', data);
              });
              // 推送初始狀態
              const data = state.readState(sessionId);
              if (data) this.push(sessionId, 'workflow', data);
            } catch {}
          }
          if (filename === 'timeline.jsonl' && !watcherState.tw) {
            try {
              watcherState.lastSize = 0;
              watcherState.tw = watch(timelinePath, () => {
                const newEvents = this._readNewLines(timelinePath, watcherState.lastSize);
                watcherState.lastSize = this._getFileSize(timelinePath);
                for (const event of newEvents) {
                  this.push(sessionId, 'timeline', event);
                }
              });
            } catch {}
          }
        });
      }
    } catch {}

    this.watchers.set(sessionId, watcherState);
  }

  /**
   * 停止監聽指定 session
   * @param {string} sessionId
   */
  unwatchSession(sessionId) {
    const w = this.watchers.get(sessionId);
    if (!w) return;

    if (w.ww) w.ww.close();
    if (w.tw) w.tw.close();
    if (w.dw) w.dw.close();
    this.watchers.delete(sessionId);
  }

  // ── 生命週期 ──

  /** 啟動 EventBus（heartbeat） */
  start() {
    if (this.heartbeatTimer) return;

    this.heartbeatTimer = setInterval(() => {
      this.push(null, 'heartbeat', { ts: new Date().toISOString() });
    }, HEARTBEAT_INTERVAL);
  }

  /** 停止 EventBus（關閉所有 watcher + heartbeat） */
  stop() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    for (const [, w] of this.watchers) {
      if (w.ww) w.ww.close();
      if (w.tw) w.tw.close();
      if (w.dw) w.dw.close();
    }
    this.watchers.clear();

    // 斷開所有 Adapter
    for (const adapter of this.adapters) {
      try { adapter.disconnect(); } catch {}
    }
  }

  // ── 增量讀取（從 sse.js 移植） ──

  /** @private */
  _getFileSize(filePath) {
    try {
      return statSync(filePath).size;
    } catch {
      return 0;
    }
  }

  /**
   * 增量讀取 JSONL 新行
   * @private
   * @param {string} filePath
   * @param {number} fromByte
   * @returns {object[]}
   */
  _readNewLines(filePath, fromByte) {
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
        .map(line => { try { return JSON.parse(line); } catch { return null; } })
        .filter(Boolean);
    } catch {
      if (fd !== undefined) try { closeSync(fd); } catch {}
      return [];
    }
  }
}

module.exports = EventBus;
