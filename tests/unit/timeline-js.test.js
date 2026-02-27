'use strict';
const { test, expect, describe, beforeAll } = require('bun:test');
const fs = require('fs');
const path = require('path');

// ── 載入 timeline.js（瀏覽器端 IIFE，透過 global.window 模擬） ──

const timelineSource = fs.readFileSync(
  path.join(__dirname, '../../plugins/overtone/web/js/timeline.js'),
  'utf8'
);

let timeline;

beforeAll(() => {
  // 重置 window namespace，避免測試間污染
  global.window = {};
  // eslint-disable-next-line no-eval
  eval(timelineSource);
  timeline = global.window.OT.timeline;
});

// ── 輔助：建立 mock DOM 容器 ──

function makeContainer(eventCount = 0) {
  // 最小化模擬 DOM 容器物件
  const items = [];
  for (let i = 0; i < eventCount; i++) {
    items.push(makeMockEventEl());
  }

  const container = {
    _items: items,
    _scrollTop: 0,
    get scrollHeight() { return items.length * 40; },
    get scrollTop() { return this._scrollTop; },
    set scrollTop(v) { this._scrollTop = v; },
    innerHTML: '',
    querySelectorAll(selector) {
      if (selector === '.timeline-event') return [...this._items];
      return [];
    },
  };
  return container;
}

function makeMockEventEl() {
  const classes = new Set();
  return {
    _classes: classes,
    classList: {
      add(cls) { classes.add(cls); },
      remove(cls) { classes.delete(cls); },
      contains(cls) { return classes.has(cls); },
    },
  };
}

// ════════════════════════════════════════════════════════
// Feature 6：Timeline 新事件 slide-in 動畫
// ════════════════════════════════════════════════════════

describe('window.OT.timeline', () => {

  // ── Scenario 6-3：scrollToBottom ──────────────────────

  describe('scrollToBottom(containerEl)', () => {
    test('Scenario 6-3：捲動後 scrollTop 等於 scrollHeight', () => {
      const container = makeContainer(3);
      container._scrollTop = 0;
      timeline.scrollToBottom(container);
      expect(container.scrollTop).toBe(container.scrollHeight);
    });

    test('Scenario 6-5：傳入 null 時靜默 return，不拋例外', () => {
      expect(() => timeline.scrollToBottom(null)).not.toThrow();
    });

    test('傳入 undefined 時靜默 return，不拋例外', () => {
      expect(() => timeline.scrollToBottom(undefined)).not.toThrow();
    });
  });

  // ── Scenario 6-1、6-4：animateNewEvent ───────────────

  describe('animateNewEvent(containerEl, eventData)', () => {
    test('Scenario 6-1：最後一個 .timeline-event 加上 timeline-slide class', () => {
      const container = makeContainer(3);
      timeline.animateNewEvent(container, { type: 'stage:start', ts: new Date().toISOString() });
      const items = container._items;
      // 只有最後一個元素加動畫 class
      expect(items[items.length - 1].classList.contains('timeline-slide')).toBe(true);
    });

    test('Scenario 6-1：前面的事件不加 timeline-slide class', () => {
      const container = makeContainer(3);
      timeline.animateNewEvent(container, { type: 'agent:done' });
      const items = container._items;
      // 第一、二個元素不應有 timeline-slide
      expect(items[0].classList.contains('timeline-slide')).toBe(false);
      expect(items[1].classList.contains('timeline-slide')).toBe(false);
    });

    test('Scenario 6-1：呼叫後容器 scrollTop 捲到底部', () => {
      const container = makeContainer(2);
      container._scrollTop = 0;
      timeline.animateNewEvent(container, { type: 'workflow:complete' });
      expect(container.scrollTop).toBe(container.scrollHeight);
    });

    test('Scenario 6-4：空容器（無 .timeline-event）靜默 return，不拋例外', () => {
      const container = makeContainer(0);
      expect(() => timeline.animateNewEvent(container, {})).not.toThrow();
    });

    test('containerEl 為 null 時靜默 return，不拋例外', () => {
      expect(() => timeline.animateNewEvent(null, {})).not.toThrow();
    });

    test('containerEl 為 null 時靜默 return，無副作用', () => {
      // 確保不報錯且不影響全域狀態
      let threw = false;
      try {
        timeline.animateNewEvent(null);
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });
  });

  // ── clearEvents ──────────────────────────────────────

  describe('clearEvents(containerEl)', () => {
    test('清空容器的 innerHTML', () => {
      const container = makeContainer(0);
      container.innerHTML = '<div class="timeline-event">test</div>';
      timeline.clearEvents(container);
      expect(container.innerHTML).toBe('');
    });

    test('containerEl 為 null 時靜默 return，不拋例外', () => {
      expect(() => timeline.clearEvents(null)).not.toThrow();
    });
  });

  // ── getCategoryClass ──────────────────────────────────

  describe('getCategoryClass(eventType)', () => {
    test('stage:start → cat-stage', () => {
      expect(timeline.getCategoryClass('stage:start')).toBe('cat-stage');
    });

    test('stage:end → cat-stage', () => {
      expect(timeline.getCategoryClass('stage:end')).toBe('cat-stage');
    });

    test('agent:done → cat-agent', () => {
      expect(timeline.getCategoryClass('agent:done')).toBe('cat-agent');
    });

    test('workflow:start → cat-workflow', () => {
      expect(timeline.getCategoryClass('workflow:start')).toBe('cat-workflow');
    });

    test('workflow:complete → cat-workflow', () => {
      expect(timeline.getCategoryClass('workflow:complete')).toBe('cat-workflow');
    });

    test('loop:continue → cat-loop', () => {
      expect(timeline.getCategoryClass('loop:continue')).toBe('cat-loop');
    });

    test('grader:score → cat-grader', () => {
      expect(timeline.getCategoryClass('grader:score')).toBe('cat-grader');
    });

    test('specs:update → cat-specs', () => {
      expect(timeline.getCategoryClass('specs:update')).toBe('cat-specs');
    });

    test('test:pass → cat-test', () => {
      expect(timeline.getCategoryClass('test:pass')).toBe('cat-test');
    });

    test('system:init → cat-system', () => {
      expect(timeline.getCategoryClass('system:init')).toBe('cat-system');
    });

    test('未知類型 → cat-default', () => {
      expect(timeline.getCategoryClass('unknown:event')).toBe('cat-default');
    });

    test('無冒號的類型 → cat-default', () => {
      expect(timeline.getCategoryClass('someevent')).toBe('cat-default');
    });

    test('空字串 → cat-default', () => {
      expect(timeline.getCategoryClass('')).toBe('cat-default');
    });

    test('null → cat-default', () => {
      expect(timeline.getCategoryClass(null)).toBe('cat-default');
    });

    test('undefined → cat-default', () => {
      expect(timeline.getCategoryClass(undefined)).toBe('cat-default');
    });
  });

  // ── formatTimestamp ───────────────────────────────────

  describe('formatTimestamp(isoString)', () => {
    test('正確格式化 ISO 字串為 HH:MM:SS', () => {
      // 2024-01-15T13:05:07.000Z 對應台灣時間 21:05:07（UTC+8）
      // 此測試依賴 local timezone，使用固定本地時間避免不穩定
      const iso = '2024-01-15T05:05:07.000Z';
      const result = timeline.formatTimestamp(iso);
      // 確認格式為 HH:MM:SS（長度 8，包含兩個冒號）
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    test('null → 回傳空字串', () => {
      expect(timeline.formatTimestamp(null)).toBe('');
    });

    test('undefined → 回傳空字串', () => {
      expect(timeline.formatTimestamp(undefined)).toBe('');
    });

    test('空字串 → 回傳空字串', () => {
      expect(timeline.formatTimestamp('')).toBe('');
    });

    test('無效日期字串 → 不拋例外', () => {
      expect(() => timeline.formatTimestamp('not-a-date')).not.toThrow();
    });
  });

  // ── namespace 完整性 ──────────────────────────────────

  describe('window.OT.timeline namespace', () => {
    test('window.OT 存在', () => {
      expect(global.window.OT).toBeDefined();
    });

    test('window.OT.timeline 存在', () => {
      expect(global.window.OT.timeline).toBeDefined();
    });

    test('animateNewEvent 是函式', () => {
      expect(typeof global.window.OT.timeline.animateNewEvent).toBe('function');
    });

    test('scrollToBottom 是函式', () => {
      expect(typeof global.window.OT.timeline.scrollToBottom).toBe('function');
    });

    test('clearEvents 是函式', () => {
      expect(typeof global.window.OT.timeline.clearEvents).toBe('function');
    });

    test('getCategoryClass 是函式', () => {
      expect(typeof global.window.OT.timeline.getCategoryClass).toBe('function');
    });

    test('formatTimestamp 是函式', () => {
      expect(typeof global.window.OT.timeline.formatTimestamp).toBe('function');
    });
  });
});
