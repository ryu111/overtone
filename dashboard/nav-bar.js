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

// ─── 自主循環 Tab（注入到所有 Dashboard 頁面）───
(function initLoopTab() {
  // 只在 Dashboard 頁面注入（有 .tabs 容器）
  const tabBar = document.querySelector('.tabs');
  if (!tabBar) return;

  // 注入 tab 按鈕
  const btn = document.createElement('button');
  btn.className = 'tab';
  btn.dataset.tab = 'tab-loop';
  btn.textContent = '🔄 自主循環';
  tabBar.appendChild(btn);

  // 用 delegation 統一管理所有 tab（含動態注入的），覆蓋 initTabs 的不完整切換
  tabBar.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    const id = tab.dataset.tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === id));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === id));
  });

  // 注入 tab 內容
  const container = tabBar.parentElement;
  const content = document.createElement('div');
  content.className = 'tab-content';
  content.id = 'tab-loop';
  content.innerHTML = `
    <style>
      .loop-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
      .loop-card { background: rgba(124,58,237,0.06); border: 1px solid rgba(124,58,237,0.15); border-radius: 10px; padding: 12px; text-align: center; }
      .loop-card .lc-label { font-size: 11px; color: var(--muted, #6b7280); margin-bottom: 4px; }
      .loop-card .lc-value { font-size: 24px; font-weight: 700; transition: color 0.3s; }
      .loop-card .lc-sub { font-size: 10px; color: var(--muted, #6b7280); margin-top: 2px; }
      .loop-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
      .loop-steps { display: flex; flex-direction: column; gap: 6px; }
      .loop-step-item { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 8px; font-size: 12px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.05); transition: all 0.3s; }
      .loop-step-item.step-active { border-color: #7c3aed; background: rgba(124,58,237,0.12); box-shadow: 0 0 8px rgba(124,58,237,0.2); }
      .loop-step-item .step-icon { font-size: 16px; width: 24px; text-align: center; }
      .loop-notion-list { font-size: 12px; }
      .loop-task { padding: 6px 10px; margin-bottom: 4px; border-radius: 6px; background: rgba(0,0,0,0.2); border-left: 3px solid #fbbf24; }
      .loop-bottom { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; }
      .loop-log { max-height: 200px; overflow-y: auto; font-size: 11px; }
      .loop-log-entry { padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
      .loop-log-ts { color: var(--muted, #6b7280); }
      .loop-stat-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 12px; border-bottom: 1px solid rgba(255,255,255,0.04); }
      .loop-stat-k { color: var(--muted, #9ca3af); }
      .loop-stat-v { font-weight: 600; }
      .lc-green { color: #34d399; }
      .lc-yellow { color: #fbbf24; }
      .lc-red { color: #f87171; }
    </style>

    <div class="loop-cards">
      <div class="loop-card"><div class="lc-label">心跳狀態</div><div class="lc-value" id="lp-status">--</div><div class="lc-sub" id="lp-status-sub"></div></div>
      <div class="loop-card"><div class="lc-label">下次 Tick</div><div class="lc-value" id="lp-poll">--</div><div class="lc-sub" id="lp-interval-sub"></div></div>
      <div class="loop-card"><div class="lc-label">Notion 待做</div><div class="lc-value" id="lp-todo">--</div><div class="lc-sub" id="lp-todo-name"></div></div>
    </div>

    <div class="loop-grid">
      <div class="panel">
        <div class="panel-title">循環流程</div>
        <div class="loop-steps">
          <div class="loop-step-item" id="ls-poll"><span class="step-icon">🔍</span> Poll Notion 待做佇列</div>
          <div class="loop-step-item" id="ls-exec"><span class="step-icon">⚡</span> Claude session 執行任務</div>
          <div class="loop-step-item" id="ls-done"><span class="step-icon">✅</span> 完成 → 標記 Notion 已完成</div>
          <div class="loop-step-item" id="ls-analyze"><span class="step-icon">🧠</span> 佇列空 → Claude 分析缺口並實作</div>
        </div>
        <div style="margin-top:8px;font-size:11px;color:var(--muted,#6b7280)" id="lp-note"></div>
      </div>
      <div class="panel">
        <div class="panel-title">Notion 任務</div>
        <div class="loop-notion-list" id="lp-tasks">載入中...</div>
      </div>
    </div>

    <div class="loop-bottom">
      <div class="panel">
        <div class="panel-title">活動日誌</div>
        <div class="loop-log" id="lp-log">載入中...</div>
      </div>
      <div class="panel">
        <div class="panel-title">統計</div>
        <div id="lp-stats">載入中...</div>
      </div>
    </div>
  `;
  container.appendChild(content);

  // ── 資料與倒數 ──
  let pollTs = 0, interval = 1800000, executing = false, running = false, mode = '', stats = null, todo = 0, todoTop = '';

  function fmt(s) {
    if (s <= 0) return '0s';
    const m = Math.floor(s / 60), r = s % 60;
    return m > 0 ? m + 'm' + (r ? r + 's' : '') : s + 's';
  }
  function $(id) { return document.getElementById(id); }

  async function fetchLoop() {
    try {
      const [hRes, tRes, sRes] = await Promise.all([
        fetch('/api/processes', { signal: AbortSignal.timeout(3000) }),
        fetch('/api/notion-todo', { signal: AbortSignal.timeout(5000) }),
        fetch('/api/session-log', { signal: AbortSignal.timeout(3000) }),
      ]);
      const hb = (await hRes.json()).heartbeat || {};
      const td = await tRes.json();
      const sessions = await sRes.json();

      running = !!hb.running;
      executing = !!hb.executing;
      mode = hb.mode || 'production';
      interval = hb.interval || 1800000;
      stats = hb.stats || null;
      if (hb.lastPoll) pollTs = new Date(hb.lastPoll).getTime();
      todo = td.count ?? 0;
      todoTop = td.top ?? '';

      // 狀態卡片
      const modeTag = mode === 'test' ? ' (test)' : '';
      if (!running) { $('lp-status').innerHTML = '<span class="lc-red">停止</span>'; $('lp-status-sub').textContent = ''; }
      else if (executing) { $('lp-status').innerHTML = '<span class="lc-yellow">執行中</span>'; $('lp-status-sub').textContent = 'Claude session' + modeTag; }
      else { $('lp-status').innerHTML = '<span class="lc-green">運行中</span>'; $('lp-status-sub').textContent = mode + modeTag; }

      $('lp-interval-sub').textContent = `每 ${Math.round(interval / 60000)} 分鐘`;

      $('lp-todo').textContent = todo;
      $('lp-todo-name').textContent = todoTop ? todoTop.slice(0, 20) + (todoTop.length > 20 ? '…' : '') : '佇列空';

      // 循環高亮
      document.querySelectorAll('.loop-step-item').forEach(el => el.classList.remove('step-active'));
      if (executing) $('ls-exec')?.classList.add('step-active');
      else if (todo > 0) $('ls-poll')?.classList.add('step-active');
      else $('ls-analyze')?.classList.add('step-active');

      // 說明
      const note = $('lp-note');
      if (executing) note.textContent = '🔥 Claude session 正在自主執行...';
      else if (todo > 0) note.textContent = '📋 下次 tick 將認領並執行待做任務';
      else note.textContent = '🧠 下次 tick 佇列空將觸發 Claude 分析缺口';

      // Notion 任務
      $('lp-tasks').innerHTML = todo > 0
        ? `<div class="loop-task">${todoTop || '（載入中）'}</div>`
        : '<div style="color:var(--muted,#6b7280)">佇列空 — 下次 tick 將觸發分析</div>';

      // 活動日誌
      const hbSessions = (Array.isArray(sessions) ? sessions : []).filter(s => s.source === 'heartbeat').slice(-8).reverse();
      $('lp-log').innerHTML = hbSessions.length > 0
        ? hbSessions.map(s => {
            const ts = s.date ? new Date(s.date).toLocaleTimeString('zh-TW') : '??';
            const c = s.status === 'success' ? 'lc-green' : 'lc-red';
            return `<div class="loop-log-entry"><span class="loop-log-ts">${ts}</span> <span class="${c}">${s.status || '—'}</span> ${(s.task || s.summary || '').slice(0, 40)}</div>`;
          }).join('')
        : '<div style="color:var(--muted,#6b7280)">尚無活動記錄</div>';

      // 統計（對齊 API 實際欄位）
      if (stats) {
        const sr = stats.tasksExecuted > 0 ? Math.round(stats.tasksSucceeded / stats.tasksExecuted * 100) : 0;
        $('lp-stats').innerHTML = [
          ['任務執行', stats.tasksExecuted || 0],
          ['成功', `<span class="lc-green">${stats.tasksSucceeded || 0}</span>`],
          ['失敗', (stats.tasksFailed || 0) > 0 ? `<span class="lc-red">${stats.tasksFailed}</span>` : '0'],
          ['成功率', sr + '%'],
          ['分析次數', stats.analyzes || 0],
        ].map(([k, v]) => `<div class="loop-stat-row"><span class="loop-stat-k">${k}</span><span class="loop-stat-v">${v}</span></div>`).join('');
      }
    } catch {
      $('lp-status').innerHTML = '<span class="lc-red">離線</span>';
    }
  }

  function tickLoop() {
    const now = Date.now();
    const pe = $('lp-poll');
    if (pe && pollTs && interval) {
      const s = Math.max(0, Math.floor((pollTs + interval - now) / 1000));
      pe.textContent = fmt(s);
      pe.className = 'lc-value' + (s <= 10 ? ' lc-yellow' : '');
    } else if (pe && !pollTs) {
      pe.textContent = '等待首次';
      pe.className = 'lc-value';
    }
  }

  fetchLoop();
  setInterval(fetchLoop, 3000);
  setInterval(tickLoop, 1000);
})();
