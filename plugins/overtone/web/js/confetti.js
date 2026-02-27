/**
 * confetti.js — Overtone Dashboard 慶祝動畫模組
 *
 * 介面：
 *   window.OT.fireConfetti(options)   — BDD 驗收介面
 *   window.OT.confetti.fire(options)  — Handoff 介面（別名）
 *
 * options:
 *   count    {number}  粒子數量（預設 40）
 *   played   {boolean} 外部傳入的已播放 flag（true → 跳過）
 *   duration {number}  DOM 清除延遲毫秒（預設 5000，測試用可傳短值）
 */

(function () {
  'use strict';

  var COLORS = [
    '#7c3aed',
    '#a78bfa',
    '#06b6d4',
    '#f59e0b',
    '#10b981',
    '#ef4444',
    '#ec4899',
    '#ffffff',
  ];

  // 動態注入 confetti-fall keyframe（只注入一次）
  // 若 main.css 已定義 confetti-fall（由 dashboard.html init 前設 flag），跳過注入
  function ensureStyles() {
    if (window.__ot_confetti_css_injected) return;
    if (document.getElementById('ot-confetti-styles')) return;

    var style = document.createElement('style');
    style.id = 'ot-confetti-styles';
    style.textContent = [
      '@keyframes confetti-fall {',
      '  0%   { transform: translateY(-10px) rotate(0deg); opacity: 1; }',
      '  80%  { opacity: 1; }',
      '  100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }',
      '}',
      '.confetti-particle {',
      '  position: fixed;',
      '  top: -10px;',
      '  width: 8px;',
      '  height: 8px;',
      '  border-radius: 2px;',
      '  pointer-events: none;',
      '  animation-name: confetti-fall;',
      '  animation-timing-function: linear;',
      '  animation-fill-mode: forwards;',
      '}',
    ].join('\n');

    document.head.appendChild(style);
  }

  /**
   * 觸發 confetti 動畫。
   *
   * @param {object} options
   * @param {number}  [options.count=40]    粒子數量
   * @param {boolean} [options.played=false] 已播放 flag（true → return false）
   * @param {number}  [options.duration=5000] DOM 清除延遲（毫秒）
   * @returns {boolean} true = 成功觸發，false = 跳過
   */
  function fireConfetti(options) {
    options = options || {};

    // 已播放 → 跳過
    if (options.played === true) return false;

    // prefers-reduced-motion → 跳過
    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return false;
    }

    ensureStyles();

    var count = typeof options.count === 'number' ? options.count : 40;
    var clearDelay = typeof options.duration === 'number' ? options.duration : 5000;

    // 建立 overlay 容器
    var overlay = document.createElement('div');
    overlay.className = 'confetti-overlay';
    overlay.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'width:100%',
      'height:100%',
      'pointer-events:none',
      'z-index:9999',
      'overflow:hidden',
    ].join(';');

    // 建立粒子
    var particles = [];
    for (var i = 0; i < count; i++) {
      var p = document.createElement('div');
      p.className = 'confetti-particle';

      var color = COLORS[Math.floor(Math.random() * COLORS.length)];
      var leftPct = Math.random() * 100;
      var animDuration = 2 + Math.random() * 2; // 2–4s
      var animDelay = Math.random() * 1;          // 0–1s

      p.style.backgroundColor = color;
      p.style.left = leftPct + '%';
      p.style.animationDuration = animDuration.toFixed(2) + 's';
      p.style.animationDelay = animDelay.toFixed(2) + 's';

      overlay.appendChild(p);
      particles.push(p);
    }

    document.body.appendChild(overlay);

    // 動畫結束後清除 DOM
    setTimeout(function () {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, clearDelay);

    return true;
  }

  // 掛載到 window.OT namespace
  window.OT = window.OT || {};
  window.OT.fireConfetti = fireConfetti;
  window.OT.confetti = {
    fire: fireConfetti,
  };
})();
