/**
 * Overtone Dashboard — Timeline 事件流邏輯
 *
 * namespace：window.OT.timeline
 * 不依賴 Alpine.js，純 DOM 操作。
 *
 * 歷史事件（初始載入）不加 timeline-slide class；
 * 只有 SSE 推入的新事件才透過 animateNewEvent 加動畫。
 */

window.OT = window.OT || {};

window.OT.timeline = (function () {
  'use strict';

  // ── 事件分類對應表 ──────────────────────────────────

  /**
   * 9 種前綴對應分類 class：
   *   stage:*    → cat-stage
   *   agent:*    → cat-agent
   *   workflow:* → cat-workflow
   *   loop:*     → cat-loop
   *   grader:*   → cat-grader
   *   specs:*    → cat-specs
   *   test:*     → cat-test
   *   system:*   → cat-system
   *   其他       → cat-default
   */
  function getCategoryClass(eventType) {
    if (!eventType || typeof eventType !== 'string') return 'cat-default';

    const colon = eventType.indexOf(':');
    const prefix = colon !== -1 ? eventType.slice(0, colon) : eventType;

    const map = {
      stage:    'cat-stage',
      agent:    'cat-agent',
      workflow: 'cat-workflow',
      loop:     'cat-loop',
      grader:   'cat-grader',
      specs:    'cat-specs',
      test:     'cat-test',
      system:   'cat-system',
    };

    return map[prefix] || 'cat-default';
  }

  // ── 時間格式化 ──────────────────────────────────────

  /**
   * 格式化 ISO 時間戳為 "HH:MM:SS"（24 小時制）。
   * 解析失敗時靜默回傳空字串。
   */
  function formatTimestamp(isoString) {
    if (!isoString) return '';
    try {
      return new Date(isoString).toLocaleTimeString('zh-TW', { hour12: false });
    } catch {
      return '';
    }
  }

  // ── 捲動 ────────────────────────────────────────────

  /**
   * 捲動容器到底部。
   * containerEl 為 null 時靜默 return，不拋例外。
   */
  function scrollToBottom(containerEl) {
    if (!containerEl) return;
    containerEl.scrollTop = containerEl.scrollHeight;
  }

  // ── 清空 ────────────────────────────────────────────

  /**
   * 清空容器所有事件元素。
   * containerEl 為 null 時靜默 return，不拋例外。
   */
  function clearEvents(containerEl) {
    if (!containerEl) return;
    containerEl.innerHTML = '';
  }

  // ── 新事件動畫 ──────────────────────────────────────

  /**
   * 在 timeline 容器中渲染一個新事件項目（附帶 slide-in 動畫）。
   *
   * 設計說明：
   *   dashboard.html（Phase 2）使用 Alpine.js x-for 負責渲染
   *   `.timeline-event` 元素。此函式的職責是：
   *   1. 對容器最後一個 `.timeline-event` 加上 timeline-slide class（觸發動畫）
   *   2. 捲動到容器底部
   *
   *   若 containerEl 為 null 或容器內無 .timeline-event，靜默 return。
   *
   * @param {Element|null} containerEl - timeline 容器元素
   * @param {Object} [eventData]       - 事件資料（保留，供未來擴充；目前由 Alpine.js x-for 渲染）
   */
  function animateNewEvent(containerEl, eventData) {
    if (!containerEl) return;

    // 找到容器內最後一個 .timeline-event 元素
    const items = containerEl.querySelectorAll('.timeline-event');
    if (!items || items.length === 0) return;

    const lastItem = items[items.length - 1];
    lastItem.classList.add('timeline-slide');

    scrollToBottom(containerEl);
  }

  // ── 公開介面 ────────────────────────────────────────

  return {
    animateNewEvent,
    scrollToBottom,
    clearEvents,
    getCategoryClass,
    formatTimestamp,
  };
})();
