'use strict';
/**
 * telegram-adapter.js — Telegram Bot API Adapter
 *
 * 提供雙向通訊：
 *   ✅ push：EventBus 事件 → Telegram 訊息
 *   ✅ control：Telegram 命令 → EventBus 控制
 *
 * 環境變數：
 *   TELEGRAM_BOT_TOKEN — Bot token（必須）
 *   TELEGRAM_CHAT_ID — 目標 chat ID（可選，/start 自動學習）
 *
 * 支援命令：/start, /status, /stop, /sessions, /help
 */

const Adapter = require('./adapter');
const { workflows, stages } = require('../registry');

// 預設推送的事件類型（避免洗頻）
const DEFAULT_PUSH_EVENTS = [
  'workflow:start',
  'workflow:complete',
  'workflow:abort',
  'agent:delegate',
  'agent:complete',
  'agent:error',
  'error:fatal',
  'session:start',
  'session:end',
];

const API_BASE = 'https://api.telegram.org/bot';
const POLL_TIMEOUT = 30; // 秒

class TelegramAdapter extends Adapter {
  /**
   * @param {string} token - Telegram Bot token
   * @param {EventBus} eventBus
   * @param {object} [options={}]
   * @param {string} [options.chatId] - 目標 chat ID
   * @param {string[]} [options.pushEvents] - 要推送的事件類型
   */
  constructor(token, eventBus, options = {}) {
    super('telegram', eventBus);

    this.token = token;
    this.chatId = options.chatId || null;
    this.pushEvents = options.pushEvents || DEFAULT_PUSH_EVENTS;
    this.lastUpdateId = 0;
    this._polling = false;
    this._abortController = null;
  }

  // ── 生命週期 ──

  /** 啟動長輪詢 */
  async connect() {
    super.connect();

    // 驗證 token
    try {
      const me = await this._apiCall('getMe');
      if (me.ok) {
        console.log(`🤖 Telegram Bot: @${me.result.username}`);
      }
    } catch (err) {
      console.error('Telegram Bot 驗證失敗:', err.message);
      this._connected = false;
      return;
    }

    this._polling = true;
    this._pollLoop();
  }

  /** 停止輪詢 */
  disconnect() {
    this._polling = false;
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
    super.disconnect();
  }

  // ── EventBus → Telegram 推送 ──

  /**
   * 接收 EventBus 推送，篩選後發送到 Telegram
   */
  onPush(sessionId, eventType, data) {
    if (!this.chatId) return;
    if (eventType === 'heartbeat') return;

    // 檢查 timeline 事件是否在推送清單中
    if (eventType === 'timeline') {
      const timelineType = data.type;
      if (!this.pushEvents.includes(timelineType)) return;

      const message = this._formatTimelineEvent(sessionId, data);
      if (message) this._sendMessage(this.chatId, message);
      return;
    }

    // workflow 狀態更新不推送（太頻繁）
  }

  // ── 長輪詢 ──

  /** @private */
  async _pollLoop() {
    while (this._polling) {
      try {
        this._abortController = new AbortController();
        const result = await this._apiCall('getUpdates', {
          offset: this.lastUpdateId + 1,
          timeout: POLL_TIMEOUT,
        }, this._abortController.signal);

        if (!result.ok || !result.result) continue;

        for (const update of result.result) {
          this.lastUpdateId = update.update_id;
          this._handleUpdate(update);
        }
      } catch (err) {
        if (err.name === 'AbortError') break;
        // 網路錯誤，等待後重試
        await this._sleep(3000);
      }
    }
  }

  // ── 命令處理 ──

  /** @private */
  _handleUpdate(update) {
    const msg = update.message;
    if (!msg || !msg.text) return;

    const chatId = msg.chat.id;
    const text = msg.text.trim();

    // 解析命令
    if (text.startsWith('/start')) {
      this._handleStart(chatId);
    } else if (text.startsWith('/status')) {
      const args = text.split(/\s+/).slice(1);
      this._handleStatus(chatId, args[0]);
    } else if (text.startsWith('/stop')) {
      const args = text.split(/\s+/).slice(1);
      this._handleStop(chatId, args[0]);
    } else if (text.startsWith('/sessions')) {
      this._handleSessions(chatId);
    } else if (text.startsWith('/help')) {
      this._handleHelp(chatId);
    }
  }

  /** /start — 註冊 chat + 歡迎訊息 */
  _handleStart(chatId) {
    this.chatId = String(chatId);
    this._sendMessage(chatId, [
      '🎵 <b>Overtone Remote</b>',
      '',
      '已連線！你將收到工作流即時通知。',
      '',
      '📋 可用命令：',
      '/status [id] — 查看工作流狀態',
      '/stop [id] — 停止 Loop',
      '/sessions — 列出所有工作階段',
      '/help — 顯示此說明',
    ].join('\n'));
  }

  /** /status [sessionId] — 查詢狀態 */
  _handleStatus(chatId, sessionId) {
    if (!sessionId) {
      // 嘗試找最新的活躍 session
      const result = this.eventBus.handleControl(null, 'sessions', { active: true });
      if (result.ok && result.data.length > 0) {
        sessionId = result.data[0].sessionId;
      } else {
        this._sendMessage(chatId, '❌ 沒有進行中的工作階段。');
        return;
      }
    }

    const result = this.eventBus.handleControl(sessionId, 'status');
    if (!result.ok) {
      this._sendMessage(chatId, `❌ ${result.error}`);
      return;
    }

    const ws = result.data;
    const label = workflows[ws.workflowType]?.label || ws.workflowType || '未知';
    const stageEntries = Object.entries(ws.stages || {});
    const completed = stageEntries.filter(([, s]) => s.status === 'completed').length;
    const total = stageEntries.length;

    const progressBar = stageEntries.map(([k, s]) => {
      const base = k.split(':')[0];
      const def = stages[base];
      const icon = s.status === 'completed'
        ? (s.result === 'pass' ? '✅' : s.result === 'fail' ? '❌' : '🔙')
        : s.status === 'active' ? '⏳' : '⬜';
      return `${icon}${def?.emoji || ''}`;
    }).join('');

    const activeAgents = Object.entries(ws.activeAgents || {})
      .map(([name]) => name)
      .join(', ');

    this._sendMessage(chatId, [
      `🎵 <b>Overtone 狀態</b>`,
      '',
      `📋 ${label} (<code>${ws.workflowType}</code>)`,
      `📂 <code>${ws.sessionId.slice(0, 8)}...</code>`,
      `📊 ${progressBar}`,
      `    ${completed}/${total} 階段完成`,
      activeAgents ? `🤖 執行中：${activeAgents}` : '',
      ws.failCount > 0 ? `⚠️ 失敗：${ws.failCount} 次` : '',
      ws.rejectCount > 0 ? `⚠️ 拒絕：${ws.rejectCount} 次` : '',
    ].filter(Boolean).join('\n'));
  }

  /** /stop [sessionId] — 停止 Loop */
  _handleStop(chatId, sessionId) {
    if (!sessionId) {
      const result = this.eventBus.handleControl(null, 'sessions', { active: true });
      if (result.ok && result.data.length > 0) {
        sessionId = result.data[0].sessionId;
      } else {
        this._sendMessage(chatId, '❌ 沒有進行中的工作階段。');
        return;
      }
    }

    const result = this.eventBus.handleControl(sessionId, 'stop');
    if (result.ok) {
      this._sendMessage(chatId, `🛑 Loop 已標記為停止。\n📂 <code>${sessionId.slice(0, 8)}...</code>`);
    } else {
      this._sendMessage(chatId, `❌ ${result.error}`);
    }
  }

  /** /sessions — 列出工作階段 */
  _handleSessions(chatId) {
    const result = this.eventBus.handleControl(null, 'sessions');
    if (!result.ok) {
      this._sendMessage(chatId, `❌ ${result.error}`);
      return;
    }

    const list = result.data;
    if (list.length === 0) {
      this._sendMessage(chatId, '📋 沒有工作階段。');
      return;
    }

    const lines = list.slice(0, 10).map((s, i) => {
      const label = workflows[s.workflowType]?.label || s.workflowType || '未知';
      const status = s.isActive ? '🟢' : '⚪';
      return `${i + 1}. ${status} ${label} (${s.progress.completed}/${s.progress.total}) <code>${s.sessionId.slice(0, 8)}</code>`;
    });

    this._sendMessage(chatId, [
      '📋 <b>工作階段</b>',
      '',
      ...lines,
      list.length > 10 ? `\n...共 ${list.length} 個` : '',
    ].filter(Boolean).join('\n'));
  }

  /** /help — 說明 */
  _handleHelp(chatId) {
    this._sendMessage(chatId, [
      '🎵 <b>Overtone Remote 命令</b>',
      '',
      '/status [id] — 查看工作流狀態',
      '/stop [id] — 停止 Loop',
      '/sessions — 列出所有工作階段',
      '/help — 顯示此說明',
      '',
      '💡 省略 [id] 時自動使用最新的活躍 session。',
    ].join('\n'));
  }

  // ── 訊息格式化 ──

  /**
   * 格式化 timeline 事件為 Telegram 訊息
   * @private
   */
  _formatTimelineEvent(sessionId, event) {
    const sid8 = sessionId ? sessionId.slice(0, 8) : '?';
    const type = event.type;

    switch (type) {
      case 'workflow:start': {
        const label = workflows[event.workflowType]?.label || event.workflowType || '?';
        return `🎵 工作流啟動\n📋 ${label}\n📂 <code>${sid8}...</code>`;
      }
      case 'workflow:complete': {
        const label = workflows[event.workflowType]?.label || event.workflowType || '?';
        return `🎉 工作流完成！\n📋 ${label}\n📂 <code>${sid8}...</code>`;
      }
      case 'workflow:abort':
        return `⚠️ 工作流中斷\n📂 <code>${sid8}...</code>`;
      case 'agent:delegate': {
        const base = event.stage?.split(':')[0];
        const def = stages[base];
        return `${def?.emoji || '🤖'} 委派 ${event.agent || '?'}\n📂 <code>${sid8}...</code>`;
      }
      case 'agent:complete': {
        const base = event.stage?.split(':')[0];
        const def = stages[base];
        const icon = event.result === 'pass' ? '✅' : event.result === 'fail' ? '❌' : '🔙';
        return `${icon} ${def?.emoji || ''} ${def?.label || event.stage || '?'} 完成\n📂 <code>${sid8}...</code>`;
      }
      case 'agent:error':
        return `⚠️ 代理錯誤：${event.agent || '?'}\n📂 <code>${sid8}...</code>`;
      case 'error:fatal':
        return `⛔ 嚴重錯誤\n${event.reason || ''}\n📂 <code>${sid8}...</code>`;
      case 'session:start':
        return `📂 Session 開始 <code>${sid8}...</code>`;
      case 'session:end': {
        const reason = event.reason || '';
        return `📂 Session 結束\n${reason}\n<code>${sid8}...</code>`;
      }
      default:
        return null;
    }
  }

  // ── Telegram API ──

  /**
   * 發送訊息
   * @private
   */
  async _sendMessage(chatId, text) {
    try {
      await this._apiCall('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      });
    } catch {
      // 發送失敗靜默處理
    }
  }

  /**
   * 呼叫 Telegram Bot API
   * @private
   * @param {string} method
   * @param {object} [params={}]
   * @param {AbortSignal} [signal]
   * @returns {Promise<object>}
   */
  async _apiCall(method, params = {}, signal) {
    const url = `${API_BASE}${this.token}/${method}`;
    const hasBody = Object.keys(params).length > 0;

    let res;
    try {
      res = await fetch(url, {
        method: hasBody ? 'POST' : 'GET',
        headers: hasBody ? { 'Content-Type': 'application/json' } : {},
        body: hasBody ? JSON.stringify(params) : undefined,
        signal,
      });
    } catch (err) {
      // 遮蔽 token：錯誤訊息只印 method 名稱，不印完整 URL
      throw new Error(`Telegram API ${method} 網路錯誤：${err.message}`);
    }

    if (!res.ok) {
      throw new Error(`Telegram API ${method} 錯誤：${res.status} ${res.statusText}`);
    }

    return res.json();
  }

  /** @private */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = TelegramAdapter;
