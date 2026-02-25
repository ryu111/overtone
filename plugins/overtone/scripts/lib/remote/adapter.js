'use strict';
/**
 * adapter.js — Remote Adapter 基類
 *
 * 所有 Adapter（Dashboard、Telegram、Slack…）必須繼承此類。
 * 定義 EventBus ↔ Adapter 的通訊介面。
 *
 * V1 實作：push / query / control
 * V2 預留：sync / interact
 */

class Adapter {
  /**
   * @param {string} name - Adapter 識別名稱
   * @param {EventBus} eventBus - 所屬 EventBus 實例
   */
  constructor(name, eventBus) {
    this.name = name;
    this.eventBus = eventBus;
    this._connected = false;
  }

  // ── 生命週期 ──

  /** 啟動連線（子類覆寫） */
  connect() {
    this._connected = true;
  }

  /** 斷開連線（子類覆寫） */
  disconnect() {
    this._connected = false;
  }

  /** @returns {boolean} 連線狀態 */
  get isConnected() {
    return this._connected;
  }

  // ── EventBus → Adapter（V1） ──

  /**
   * 接收推送事件（子類必須覆寫）
   * @param {string|null} sessionId - 目標 session（null 表示全局事件如 heartbeat）
   * @param {string} eventType - 事件類型（'workflow' | 'timeline' | 'heartbeat'）
   * @param {object} data - 事件資料
   */
  onPush(sessionId, eventType, data) {
    // 子類實作
  }

  // ── V2 預留 ──

  /** 同步（V2） */
  onSync(sessionId, data) {}

  /** 互動（V2） */
  onInteract(sessionId, input) {}
}

module.exports = Adapter;
