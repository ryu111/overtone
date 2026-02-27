'use strict';
/**
 * dashboard-adapter.js — Dashboard SSE Adapter
 *
 * 從 sse.js 提取的 SSE 連線管理，封裝為 Adapter。
 * 職責：
 *   ✅ SSE 連線池管理（每個 session 一組 controllers）
 *   ✅ 接收 EventBus push → 廣播到 SSE 連線
 *   ✅ 建立 SSE ReadableStream（供 server.js 路由使用）
 *   ✅ 首次連線時觸發 EventBus watchSession
 */

const Adapter = require('./adapter');
const state = require('../state');

class DashboardAdapter extends Adapter {
  /**
   * @param {EventBus} eventBus
   */
  constructor(eventBus) {
    super('dashboard', eventBus);

    /** @type {Map<string, Set<object>>} session → SSE 連線集 */
    this.connections = new Map();

    /** @type {Set<object>} 全 session 監聽（首頁用） */
    this.allConnections = new Set();
  }

  // ── EventBus → SSE 推送 ──

  /**
   * 接收 EventBus 推送，轉發到 SSE 連線
   * @param {string|null} sessionId
   * @param {string} eventType
   * @param {object} data
   */
  onPush(sessionId, eventType, data) {
    const jsonData = JSON.stringify(data);

    // 推送到 session 特定連線
    if (sessionId) {
      const conns = this.connections.get(sessionId);
      if (conns) {
        for (const ctrl of conns) {
          this._sendSSE(ctrl, eventType, jsonData);
        }
      }
    }

    // 推送到全 session 連線（首頁）
    for (const ctrl of this.allConnections) {
      this._sendSSE(ctrl, eventType, jsonData);
    }
  }

  // ── SSE 串流建立 ──

  /**
   * 建立 session SSE 串流
   * @param {string} sessionId
   * @returns {ReadableStream}
   */
  createSSEStream(sessionId) {
    const encoder = new TextEncoder();
    const self = this;
    let wrapper; // 在 ReadableStream 外層宣告，start/cancel 共享

    return new ReadableStream({
      start(controller) {
        wrapper = {
          enqueue(text) { controller.enqueue(encoder.encode(text)); },
        };

        self._addConnection(sessionId, wrapper);

        // 觸發 EventBus 監聽此 session
        self.eventBus.watchSession(sessionId);

        // 送出初始連線事件
        self._sendSSE(wrapper, 'connected', JSON.stringify({
          sessionId,
          serverTime: new Date().toISOString(),
        }));

        // 推送當前狀態
        const ws = state.readState(sessionId);
        if (ws) self._sendSSE(wrapper, 'workflow', JSON.stringify(ws));

        // 心跳：每 15 秒發送，防止 proxy/browser 閒置超時斷線
        wrapper._heartbeatTimer = setInterval(() => {
          self._sendSSE(wrapper, 'heartbeat', JSON.stringify({ ts: new Date().toISOString() }));
        }, 15000);
      },
      cancel() {
        if (wrapper) {
          clearInterval(wrapper._heartbeatTimer);
          self._removeConnection(sessionId, wrapper);
        }
      },
    });
  }

  /**
   * 建立全 session SSE 串流（首頁用）
   * @returns {ReadableStream}
   */
  createAllSSEStream() {
    const encoder = new TextEncoder();
    const self = this;
    let wrapper; // 在 ReadableStream 外層宣告，start/cancel 共享

    return new ReadableStream({
      start(controller) {
        wrapper = {
          enqueue(text) { controller.enqueue(encoder.encode(text)); },
        };

        self.allConnections.add(wrapper);

        self._sendSSE(wrapper, 'connected', JSON.stringify({
          serverTime: new Date().toISOString(),
        }));

        // 心跳：每 15 秒發送，防止 proxy/browser 閒置超時斷線
        wrapper._heartbeatTimer = setInterval(() => {
          self._sendSSE(wrapper, 'heartbeat', JSON.stringify({ ts: new Date().toISOString() }));
        }, 15000);
      },
      cancel() {
        if (wrapper) {
          clearInterval(wrapper._heartbeatTimer);
          self.allConnections.delete(wrapper);
        }
      },
    });
  }

  // ── 連線管理 ──

  /** @private */
  _addConnection(sessionId, controller) {
    if (!this.connections.has(sessionId)) {
      this.connections.set(sessionId, new Set());
    }
    this.connections.get(sessionId).add(controller);
  }

  /** @private */
  _removeConnection(sessionId, controller) {
    const conns = this.connections.get(sessionId);
    if (conns) {
      conns.delete(controller);
      if (conns.size === 0) {
        this.connections.delete(sessionId);
        // 無連線時可選擇停止 watcher
        this.eventBus.unwatchSession(sessionId);
      }
    }
  }

  // ── SSE 傳送 ──

  /**
   * 送出一筆 SSE 事件
   * @private
   * @param {object} controller - wrapper with enqueue()
   * @param {string} event - SSE event name
   * @param {string} data - JSON 字串
   */
  _sendSSE(controller, event, data) {
    try {
      controller.enqueue(`event: ${event}\ndata: ${data}\n\n`);
    } catch {
      // 連線已關閉，靜默忽略
    }
  }

  // ── 生命週期 ──

  /** 斷開所有連線 */
  disconnect() {
    this.connections.clear();
    this.allConnections.clear();
    super.disconnect();
  }
}

module.exports = DashboardAdapter;
