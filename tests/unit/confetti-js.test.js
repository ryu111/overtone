'use strict';
const { test, expect, describe } = require('bun:test');
const fs = require('fs');
const path = require('path');

// ── 載入 confetti.js（瀏覽器端 IIFE，透過 new Function 注入依賴） ──
//
// confetti.js 的 IIFE 使用以下全域：
//   window.__ot_confetti_css_injected  — style guard
//   window.OT                          — 命名空間
//   window.matchMedia(...)             — prefers-reduced-motion 檢查
//   document.createElement / .head.appendChild / .body.appendChild
//   document.getElementById
//   setTimeout(fn, delay)              — 延遲清除 DOM
//
// 使用 new Function('window', 'document', 'setTimeout', source)
// 讓這些名稱成為函式參數，IIFE 閉包永久持有 mock 物件的參照，
// 避免在 test 呼叫 fireConfetti 時因 globalThis 已還原而 "window is not defined"。

const confettiSource = fs.readFileSync(
  path.join(__dirname, '../../plugins/overtone/web/js/confetti.js'),
  'utf8'
);

// eslint-disable-next-line no-new-func
const confettiFactory = new Function('window', 'document', 'setTimeout', confettiSource);

// ── mock DOM 輔助函式 ──

/**
 * 建立輕量 mock element，模擬瀏覽器 DOM element。
 * children 陣列追蹤 appendChild 加入的子元素。
 */
function makeMockElement(tagName) {
  return {
    tagName: tagName ? tagName.toUpperCase() : 'DIV',
    className: '',
    id: '',
    textContent: '',
    style: {},
    children: [],
    parentNode: null,
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) this.children.splice(idx, 1);
      child.parentNode = null;
    },
    querySelectorAll(selector) {
      // 簡化：只支援 .classname 查詢
      if (!selector.startsWith('.')) return [];
      const cls = selector.slice(1);
      return this.children.filter(c => c.className && c.className.split(' ').includes(cls));
    },
  };
}

/**
 * 建立隔離的 mock 環境並執行 confetti.js。
 * 回傳 { fireConfetti, confettiRef, bodyEl, headEl, timeouts }。
 *
 * 使用 confettiFactory（new Function 版）讓三個依賴（window/document/setTimeout）
 * 作為函式參數傳入，IIFE 閉包持有參照，之後呼叫 fireConfetti 時不依賴 globalThis。
 *
 * @param {object} opts
 * @param {boolean} [opts.prefersReducedMotion=false]
 */
function loadConfetti({ prefersReducedMotion = false } = {}) {
  const bodyEl = makeMockElement('body');
  const headEl = makeMockElement('head');
  const stylesById = {};
  const timeouts = [];

  // window mock — IIFE 透過參數訪問，閉包永久持有
  const windowMock = {
    OT: undefined,
    __ot_confetti_css_injected: false,
    matchMedia(/* query */) {
      return { matches: prefersReducedMotion };
    },
  };

  // document mock
  const documentMock = {
    _stylesById: stylesById,
    getElementById(id) { return stylesById[id] || null; },
    createElement(tagName) { return makeMockElement(tagName); },
    head: headEl,
    body: bodyEl,
  };

  // setTimeout mock（頂層 setTimeout，非 window.setTimeout）
  function setTimeoutMock(fn, delay) {
    const id = timeouts.length;
    timeouts.push({ fn, delay, id });
    return id;
  }

  // 執行 IIFE，window/document/setTimeout 以參數形式注入
  confettiFactory(windowMock, documentMock, setTimeoutMock);

  return {
    fireConfetti: windowMock.OT && windowMock.OT.fireConfetti,
    confettiRef:  windowMock.OT && windowMock.OT.confetti,
    bodyEl,
    headEl,
    timeouts,
  };
}

// ════════════════════════════════════════════════════════
// Feature 4：fireConfetti() 慶祝動畫
// ════════════════════════════════════════════════════════

describe('window.OT.fireConfetti', () => {

  // ── Scenario 4-1：首次呼叫產生 confetti 粒子 DOM ──────

  describe('Scenario 4-1：首次呼叫產生 confetti 粒子 DOM', () => {
    test('body 中出現一個 .confetti-overlay 元素', () => {
      const { fireConfetti, bodyEl } = loadConfetti({ prefersReducedMotion: false });
      fireConfetti({});
      const overlays = bodyEl.querySelectorAll('.confetti-overlay');
      expect(overlays.length).toBe(1);
    });

    test('.confetti-overlay 內包含 40 個粒子（預設 count）', () => {
      const { fireConfetti, bodyEl } = loadConfetti({ prefersReducedMotion: false });
      fireConfetti({});
      const overlay = bodyEl.querySelectorAll('.confetti-overlay')[0];
      const particles = overlay.querySelectorAll('.confetti-particle');
      expect(particles.length).toBe(40);
    });

    test('每個粒子都有 animationDuration 屬性（CSS animation）', () => {
      const { fireConfetti, bodyEl } = loadConfetti({ prefersReducedMotion: false });
      fireConfetti({});
      const overlay = bodyEl.querySelectorAll('.confetti-overlay')[0];
      const particles = overlay.querySelectorAll('.confetti-particle');
      expect(particles.length).toBeGreaterThan(0);
      for (const p of particles) {
        expect(p.style.animationDuration).toBeDefined();
        expect(p.style.animationDuration).toMatch(/^\d+\.\d{2}s$/);
      }
    });

    test('fireConfetti 回傳 true（成功觸發）', () => {
      const { fireConfetti } = loadConfetti({ prefersReducedMotion: false });
      const result = fireConfetti({});
      expect(result).toBe(true);
    });
  });

  // ── Scenario 4-2：動畫完成後自動清除 DOM ─────────────

  describe('Scenario 4-2：動畫完成後自動清除 DOM', () => {
    test('觸發 setTimeout callback 後 .confetti-overlay 從 body 移除', () => {
      const { fireConfetti, bodyEl, timeouts } = loadConfetti({ prefersReducedMotion: false });
      fireConfetti({ duration: 100 });

      // 確認 overlay 已存在
      expect(bodyEl.querySelectorAll('.confetti-overlay').length).toBe(1);

      // 手動觸發 setTimeout callback（模擬 100ms 計時完成）
      expect(timeouts.length).toBe(1);
      expect(timeouts[0].delay).toBe(100);
      timeouts[0].fn();

      // overlay 應已被移除
      expect(bodyEl.querySelectorAll('.confetti-overlay').length).toBe(0);
    });

    test('setTimeout 以正確的 duration 被登記', () => {
      const { fireConfetti, timeouts } = loadConfetti({ prefersReducedMotion: false });
      fireConfetti({ duration: 250 });
      expect(timeouts.length).toBe(1);
      expect(timeouts[0].delay).toBe(250);
    });

    test('不傳 duration 時預設 5000ms', () => {
      const { fireConfetti, timeouts } = loadConfetti({ prefersReducedMotion: false });
      fireConfetti({});
      expect(timeouts.length).toBe(1);
      expect(timeouts[0].delay).toBe(5000);
    });
  });

  // ── Scenario 4-3：prefers-reduced-motion 為 true 不產生粒子 ──

  describe('Scenario 4-3：prefers-reduced-motion 為 true 時不產生粒子', () => {
    test('body 中不出現 .confetti-overlay 元素', () => {
      const { fireConfetti, bodyEl } = loadConfetti({ prefersReducedMotion: true });
      fireConfetti({});
      const overlays = bodyEl.querySelectorAll('.confetti-overlay');
      expect(overlays.length).toBe(0);
    });

    test('fireConfetti 回傳 false（跳過）', () => {
      const { fireConfetti } = loadConfetti({ prefersReducedMotion: true });
      const result = fireConfetti({});
      expect(result).toBe(false);
    });

    test('不登記任何 setTimeout', () => {
      const { fireConfetti, timeouts } = loadConfetti({ prefersReducedMotion: true });
      fireConfetti({});
      expect(timeouts.length).toBe(0);
    });
  });

  // ── Scenario 4-4：played flag 防重複（E2E pending，unit 僅驗證 return false） ──

  describe('Scenario 4-4：played: true 時直接 return false（E2E pending）', () => {
    test('傳入 played: true 時回傳 false', () => {
      // 注意：confettiPlayed flag 由 Alpine.js state 控制（dashboard.html），
      // 此 unit test 僅驗證 fireConfetti 本身收到 played: true 時的行為。
      // Alpine.js state 整合屬 E2E pending 範圍。
      const { fireConfetti } = loadConfetti({ prefersReducedMotion: false });
      const result = fireConfetti({ played: true });
      expect(result).toBe(false);
    });

    test('傳入 played: true 時 body 中不出現 .confetti-overlay', () => {
      const { fireConfetti, bodyEl } = loadConfetti({ prefersReducedMotion: false });
      fireConfetti({ played: true });
      const overlays = bodyEl.querySelectorAll('.confetti-overlay');
      expect(overlays.length).toBe(0);
    });

    test('傳入 played: false 時正常觸發（回傳 true）', () => {
      const { fireConfetti } = loadConfetti({ prefersReducedMotion: false });
      const result = fireConfetti({ played: false });
      expect(result).toBe(true);
    });
  });

  // ── Scenario 4-5：可自訂粒子數量 ─────────────────────

  describe('Scenario 4-5：可自訂粒子數量', () => {
    test('count: 10 時 .confetti-overlay 內恰好 10 個粒子', () => {
      const { fireConfetti, bodyEl } = loadConfetti({ prefersReducedMotion: false });
      fireConfetti({ count: 10 });
      const overlay = bodyEl.querySelectorAll('.confetti-overlay')[0];
      const particles = overlay.querySelectorAll('.confetti-particle');
      expect(particles.length).toBe(10);
    });

    test('count: 1 時恰好 1 個粒子', () => {
      const { fireConfetti, bodyEl } = loadConfetti({ prefersReducedMotion: false });
      fireConfetti({ count: 1 });
      const overlay = bodyEl.querySelectorAll('.confetti-overlay')[0];
      const particles = overlay.querySelectorAll('.confetti-particle');
      expect(particles.length).toBe(1);
    });

    test('count: 0 時 overlay 內無粒子', () => {
      const { fireConfetti, bodyEl } = loadConfetti({ prefersReducedMotion: false });
      fireConfetti({ count: 0 });
      const overlay = bodyEl.querySelectorAll('.confetti-overlay')[0];
      const particles = overlay.querySelectorAll('.confetti-particle');
      expect(particles.length).toBe(0);
    });
  });

  // ── namespace 完整性 ──────────────────────────────────

  describe('window.OT namespace 完整性', () => {
    test('fireConfetti 是函式', () => {
      const { fireConfetti } = loadConfetti();
      expect(typeof fireConfetti).toBe('function');
    });

    test('confetti.fire 是函式', () => {
      const { confettiRef } = loadConfetti();
      expect(typeof confettiRef.fire).toBe('function');
    });

    test('confetti.fire 與 fireConfetti 是同一函式（別名）', () => {
      const { fireConfetti, confettiRef } = loadConfetti();
      expect(confettiRef.fire).toBe(fireConfetti);
    });
  });
});
