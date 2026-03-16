// nav-bar.js — 共用導航 + 5 分制評分系統
// 自動注入到所有 dashboard 頁面底部

const PAGES = [
  { id: 'g1-liquid-pro', name: '流體旗艦', cat: '終極' },
  { id: 'g2-glass-pro', name: '毛玻璃旗艦', cat: '終極' },
  { id: 'g3-galaxy-pro', name: '星空旗艦', cat: '終極' },
  { id: 'g4-particles-pro', name: '粒子旗艦', cat: '終極' },
  { id: 'g5-hybrid-pro', name: '流體×毛玻璃', cat: '終極' },
];

// 偵測目前頁面
const path = location.pathname.replace(/^\//, '').replace('.html', '');
const currentIdx = PAGES.findIndex(p => p.id === path);
const current = PAGES[currentIdx];

if (currentIdx >= 0 && current) {
  // ── 評分系統（5 分制）──
  function getRatings() {
    try { return JSON.parse(localStorage.getItem('nova-ratings') || '{}'); } catch { return {}; }
  }
  function saveRatings(r) { localStorage.setItem('nova-ratings', JSON.stringify(r)); }
  function getRating(pageId, type) { return getRatings()[`${pageId}:${type}`] || 0; }
  function setRating(pageId, type, score) {
    const r = getRatings();
    if (score === 0) delete r[`${pageId}:${type}`];
    else r[`${pageId}:${type}`] = score;
    saveRatings(r);
    updateUI();
  }
  function countRated(type) {
    const r = getRatings();
    return Object.entries(r).filter(([k, v]) => k.endsWith(`:${type}`) && v > 0).length;
  }
  function avgRating(type) {
    const r = getRatings();
    const vals = Object.entries(r).filter(([k, v]) => k.endsWith(`:${type}`) && v > 0).map(([, v]) => v);
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '—';
  }

  // ── 星星元件 ──
  function starsHTML(pageId, type, label, colorClass) {
    const score = getRating(pageId, type);
    let html = `<span class="nav-rating-label ${colorClass}">${label}</span>`;
    for (let i = 1; i <= 5; i++) {
      const filled = i <= score;
      html += `<button class="nav-star ${colorClass} ${filled ? 'filled' : ''}" onclick="setRating('${pageId}','${type}',${i === score ? 0 : i})" title="${i}分${i === score ? '（再點取消）' : ''}">${filled ? '★' : '☆'}</button>`;
    }
    return html;
  }

  // ── 注入 CSS ──
  const style = document.createElement('style');
  style.textContent = `
    .nova-nav {
      position: fixed; bottom: 0; left: 0; right: 0; z-index: 99999;
      background: rgba(15,14,23,0.95); backdrop-filter: blur(12px);
      border-top: 1px solid rgba(124,58,237,0.3);
      display: flex; align-items: center; justify-content: space-between;
      padding: 0 12px; height: 56px; font-family: -apple-system, system-ui, sans-serif;
      gap: 8px;
    }
    .nova-nav * { box-sizing: border-box; }
    .nova-nav-group { display: flex; align-items: center; gap: 6px; }
    .nova-nav-btn {
      background: rgba(124,58,237,0.15); border: 1px solid rgba(124,58,237,0.3);
      color: #a78bfa; border-radius: 6px; padding: 6px 12px; font-size: 12px;
      cursor: pointer; transition: all 0.2s; text-decoration: none; display: inline-flex;
      align-items: center; gap: 4px; white-space: nowrap;
    }
    .nova-nav-btn:hover { background: rgba(124,58,237,0.3); color: #c4b5fd; }
    .nova-nav-btn:disabled { opacity: 0.3; cursor: default; }
    .nova-nav-info { color: #e0def4; font-size: 13px; font-weight: 600; }
    .nova-nav-sub { color: #6b7280; font-size: 11px; }
    .nova-nav-center { display: flex; flex-direction: column; align-items: center; gap: 1px; }
    .nav-rating-row { display: flex; align-items: center; gap: 2px; }
    .nav-rating-label { font-size: 10px; width: 44px; text-align: right; margin-right: 2px; font-weight: 600; }
    .nav-rating-label.style-color { color: #f472b6; }
    .nav-rating-label.data-color { color: #22d3ee; }
    .nav-star {
      background: none; border: none; cursor: pointer; font-size: 16px; padding: 0 1px;
      transition: transform 0.15s, color 0.15s; line-height: 1;
    }
    .nav-star:hover { transform: scale(1.3); }
    .nav-star.style-color { color: rgba(236,72,153,0.3); }
    .nav-star.style-color.filled { color: #ec4899; }
    .nav-star.data-color { color: rgba(6,182,212,0.3); }
    .nav-star.data-color.filled { color: #06b6d4; }
    .nav-stats { display: flex; gap: 8px; align-items: center; }
    .nav-stat { font-size: 10px; display: flex; align-items: center; gap: 3px; }
    .nav-stat .dot { width: 6px; height: 6px; border-radius: 50%; }
    .nav-stat .dot.pink { background: #ec4899; }
    .nav-stat .dot.cyan { background: #06b6d4; }
    body { padding-bottom: 64px !important; }
  `;
  document.head.appendChild(style);

  // ── 注入 HTML ──
  const prev = currentIdx > 0 ? PAGES[currentIdx - 1] : null;
  const next = currentIdx < PAGES.length - 1 ? PAGES[currentIdx + 1] : null;

  const nav = document.createElement('div');
  nav.className = 'nova-nav';
  nav.innerHTML = `
    <div class="nova-nav-group">
      <a class="nova-nav-btn" href="/gallery.html" title="Gallery">☰</a>
      ${prev ? `<a class="nova-nav-btn" href="/${prev.id}.html" title="${prev.name}">← 上一個</a>` : '<button class="nova-nav-btn" disabled>← 上一個</button>'}
    </div>
    <div class="nova-nav-center">
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="nova-nav-info">${current.name}</span>
        <span class="nova-nav-sub">${currentIdx + 1}/${PAGES.length} · ${current.cat}</span>
      </div>
      <div style="display:flex;gap:12px;">
        <div class="nav-rating-row" id="stars-style">${starsHTML(current.id, 'style', '風格', 'style-color')}</div>
        <div class="nav-rating-row" id="stars-data">${starsHTML(current.id, 'data', '資料', 'data-color')}</div>
      </div>
    </div>
    <div class="nova-nav-group">
      <div class="nav-stats">
        <span class="nav-stat"><span class="dot pink"></span><span id="stat-style">0</span></span>
        <span class="nav-stat"><span class="dot cyan"></span><span id="stat-data">0</span></span>
      </div>
      ${next ? `<a class="nova-nav-btn" href="/${next.id}.html" title="${next.name}">下一個 →</a>` : '<button class="nova-nav-btn" disabled>下一個 →</button>'}
      <a class="nova-nav-btn" href="/preferences.html" title="偏好分析">📊</a>
    </div>
  `;
  document.body.appendChild(nav);

  // ── 鍵盤快捷鍵 ──
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowLeft' && prev) location.href = `/${prev.id}.html`;
    if (e.key === 'ArrowRight' && next) location.href = `/${next.id}.html`;
  });

  function updateUI() {
    document.getElementById('stars-style').innerHTML = starsHTML(current.id, 'style', '風格', 'style-color');
    document.getElementById('stars-data').innerHTML = starsHTML(current.id, 'data', '資料', 'data-color');
    document.getElementById('stat-style').textContent = `${countRated('style')}個 avg${avgRating('style')}`;
    document.getElementById('stat-data').textContent = `${countRated('data')}個 avg${avgRating('data')}`;
  }

  window.setRating = setRating;
  updateUI();
}

// ─── 心跳即時面板（全頁面共用）───
(function initHeartbeatWidget() {
  const w = document.createElement('div');
  w.id = 'hb-widget';
  w.style.cssText = 'position:fixed;top:12px;right:12px;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);color:#eee;padding:8px 14px;border-radius:10px;font:12px/1.6 monospace;z-index:9999;min-width:160px;';
  w.innerHTML = '<div id="hb-text">心跳 載入中...</div><div id="hb-tasks" style="color:#aaa;margin-top:2px"></div>';
  document.body.appendChild(w);

  let lastPollTs = 0;
  let lastSdTs = 0;
  let hbExecuting = false;
  let todoCount = 0;
  let todoName = '';

  function fmt(sec) {
    if (sec <= 0) return '0s';
    if (sec >= 60) return Math.floor(sec / 60) + 'm' + (sec % 60 ? (sec % 60) + 's' : '');
    return sec + 's';
  }

  async function poll() {
    try {
      const r = await fetch('/api/processes', { signal: AbortSignal.timeout(3000) });
      const d = await r.json();
      const hb = d.heartbeat;
      if (!hb) { el('hb-text').textContent = '心跳 無資料'; return; }
      if (!hb.running) { el('hb-text').innerHTML = '<span style="color:#f66">心跳 停止</span>'; return; }

      if (hb.lastPoll) lastPollTs = new Date(hb.lastPoll).getTime();
      if (hb.lastSelfDrive) lastSdTs = new Date(hb.lastSelfDrive).getTime();
      hbExecuting = !!hb.executing;
    } catch {
      el('hb-text').innerHTML = '<span style="color:#f66">心跳 離線</span>';
      return;
    }
    // Notion 待做
    try {
      const r2 = await fetch('/api/notion-todo', { signal: AbortSignal.timeout(5000) });
      const d2 = await r2.json();
      todoCount = d2.count ?? 0;
      todoName = d2.top ?? '';
    } catch { /* keep previous */ }
  }

  function tick() {
    const t = document.getElementById('hb-text');
    const t2 = document.getElementById('hb-tasks');
    if (!t) return;

    if (hbExecuting) {
      t.innerHTML = `<span style="color:#ff6">心跳 執行中</span>`;
    } else if (lastPollTs) {
      const now = Date.now();
      const nextPoll = Math.max(0, Math.floor((lastPollTs + 60000 - now) / 1000));
      const sdCooldown = lastSdTs ? Math.max(0, Math.floor((lastSdTs + 1800000 - now) / 1000)) : 0;
      t.innerHTML =
        `<span style="color:#6f6">心跳</span> ` +
        `poll <b>${fmt(nextPoll)}</b> │ ` +
        `自驅 <b>${sdCooldown > 0 ? fmt(sdCooldown) : '就緒'}</b>`;
    }

    if (t2) {
      t2.innerHTML = todoCount > 0
        ? `待做 <b>${todoCount}</b> │ ${todoName.slice(0, 30)}${todoName.length > 30 ? '…' : ''}`
        : '<span style="color:#666">待做 0</span>';
    }
  }

  function el(id) { return document.getElementById(id); }

  poll();
  setInterval(poll, 5000);   // 每 5 秒拉新資料
  setInterval(tick, 1000);   // 每 1 秒更新倒數
})();
