# Dashboard 資訊架構重組 — 技術設計

## 深度路由：D2
**理由**：跨 8 個前端模組（HTML/CSS/JS x6）重組，但邏輯明確（搬移+合併，無新 API），不涉及後端。

---

## 技術摘要

- **方案**：營運 Tab 用 Sub-Tab 切換（CSS class toggle + lazy render），系統 Tab 用 DOM 區塊分層 + 折疊 `<details>`
- **理由**：最小 JS 變更量，沿用現有 Tab 記憶和 lazy render 模式
- **取捨**：接受系統 Tab 單頁載入所有 4 區塊（總 Card 數 13 與原 9+6 相當，不會過長）

## 方案比較

| 維度 | 方案 A：CSS toggle + details（選擇） | 方案 B：Sub-Tab 全部用 JS 動態渲染 |
|------|:-----------------------------------:|:---------------------------------:|
| 複雜度 | 低（HTML 結構驅動，JS 只管 class toggle） | 中（需要 render/destroy 生命週期） |
| 效能 | 好（hidden 元素不渲染 canvas/fetch） | 相同 |
| 可維護性 | 高（結構在 HTML 可見，不藏在 JS 裡） | 中（需讀 JS 才知道結構） |
| 與現有模式一致性 | 高（Tab 切換已用 class toggle） | 中（引入新模式） |
| **結論** | **選擇** | ❌ 過度工程 |

---

## 模組介面

### 修改檔案

| # | 檔案 | 變更內容 |
|---|------|---------|
| 1 | `client.html` | Tab Bar 8→5 + 營運 Panel 含 Sub-Tab + 系統 Panel 4 區塊 + 刪除 loop-panel |
| 2 | `client.css` | 新增 Sub-Tab 樣式 + 系統區塊樣式 + 折疊區塊樣式 |
| 3 | `main.js` | Tab 切換邏輯 8→5 + Sub-Tab 切換 + 快捷鍵 1-5 + CMD_ACTIONS 更新 + 跳轉連結 handler + 移除 Loop import |
| 4 | `system.js` | 吸收 loop.js 的 fetchData/render 邏輯 + 4 區塊渲染 + 折疊/自動展開 + tick 倒數 |
| 5 | `logs.js` | Git Commits 區段改為摘要行 + 「查看完整」跳轉連結 |
| 6 | `server.js` | FLOW_FILES 白名單移除 `loop.js`（第 173 行，單行修改） |

### 刪除檔案

| # | 檔案 | 原因 |
|---|------|------|
| 1 | `loop.js` | 內容合併到 system.js，不再需要 |

### 不修改檔案

| 檔案 | 原因 |
|------|------|
| `graph.js` | 架構圖 Tab 不變 |
| `metro.js` | 事件流 Tab 不變 |
| `events.js` | 事件記錄 Tab 不變 |
| `quality.js` | 成為營運 Sub-Tab，介面（`init()` + `update()`）不變 |
| `monitor.js` | 成為營運 Sub-Tab，介面（`init()` + `update()`）不變 |
| `api-router.js` | 後端不變 |

---

## HTML 結構設計

### Tab Bar（5 Tab）

```html
<div class="tabs">
  <div class="tab active" data-tab="graph">架構圖</div>
  <div class="tab" data-tab="flow">事件流</div>
  <div class="tab" data-tab="events">事件記錄 <span id="events-count"></span></div>
  <span class="tab-sep">|</span>
  <div class="tab" data-tab="ops">營運</div>
  <div class="tab" data-tab="system">系統</div>
</div>
```

### 營運 Panel（Sub-Tab 結構）

```html
<div class="panel" id="ops-panel">
  <!-- Sub-Tab 列 -->
  <div class="sub-tabs">
    <div class="sub-tab" data-subtab="quality">品質</div>
    <div class="sub-tab active" data-subtab="monitor">監控</div>
    <div class="sub-tab" data-subtab="logs">日誌</div>
  </div>
  <!-- Sub-Tab 內容 -->
  <div class="sub-panel" id="sub-quality" style="display:none">
    <!-- 原 quality-panel 內容搬入 -->
    <div class="q-rings" id="q-rings"></div>
    <div class="q-grid">...</div>
    ...
  </div>
  <div class="sub-panel active" id="sub-monitor">
    <!-- 原 monitor-panel 內容搬入 -->
    <div class="mon-grid">...</div>
    ...
  </div>
  <div class="sub-panel" id="sub-logs" style="display:none">
    <!-- 原 logs-panel 內容搬入 -->
    <div class="logs-container">...</div>
  </div>
</div>
```

**ID 規範**：
- 營運 Panel：`ops-panel`
- Sub-Tab 按鈕：`data-subtab="quality|monitor|logs"`
- Sub-Panel：`sub-quality`、`sub-monitor`、`sub-logs`

### 系統 Panel（4 區塊結構）

```html
<div class="panel" id="system-panel">
  <div class="sys-sections">

    <!-- 區塊 A：即時狀態 -->
    <section class="sys-section" id="sys-sec-realtime">
      <div class="sys-section-title">即時狀態</div>
      <div class="sys-grid">
        <div class="sys-card" id="sys-card-heartbeat">
          <div class="sys-card-header">心跳狀態</div>
          <div id="sys-heartbeat-content"></div>
        </div>
        <div class="sys-card" id="sys-card-services">
          <div class="sys-card-header">服務狀態</div>
          <div id="sys-services-content"></div>
        </div>
        <div class="sys-card sys-card-wide" id="sys-card-loop-flow">
          <div class="sys-card-header">循環流程</div>
          <div id="sys-loop-steps"></div>
        </div>
      </div>
    </section>

    <!-- 區塊 B：資源監控 -->
    <section class="sys-section" id="sys-sec-resources">
      <div class="sys-section-title">資源監控</div>
      <div class="sys-grid">
        <div class="sys-card sys-card-wide">
          <div class="sys-card-header">Memory 趨勢</div>
          <canvas id="sys-memory-chart"></canvas>
          <div class="sys-card-footer" id="sys-memory-current"></div>
        </div>
        <div class="sys-card">
          <div class="sys-card-header">Server 資訊</div>
          <div id="sys-server-content"></div>
        </div>
        <div class="sys-card">
          <div class="sys-card-header">模組</div>
          <div id="sys-modules-content"></div>
        </div>
      </div>
    </section>

    <!-- 區塊 C：全自動成果 -->
    <section class="sys-section" id="sys-sec-results">
      <div class="sys-section-title">全自動成果</div>
      <div class="sys-grid">
        <div class="sys-card">
          <div class="sys-card-header">最近全自動成果</div>
          <div id="sys-loop-log"></div>
        </div>
        <div class="sys-card">
          <div class="sys-card-header">統計</div>
          <div id="sys-loop-stats"></div>
        </div>
        <div class="sys-card">
          <div class="sys-card-header">Notion 待做</div>
          <div id="sys-loop-notion"></div>
        </div>
      </div>
    </section>

    <!-- 區塊 D：管理工具（預設折疊） -->
    <details class="sys-section sys-section-collapsible" id="sys-sec-admin">
      <summary class="sys-section-title sys-section-toggle">
        管理工具 <span id="sys-admin-badge" class="sys-admin-badge"></span>
      </summary>
      <div class="sys-grid">
        <div class="sys-card">
          <div class="sys-card-header">Hook Errors 摘要</div>
          <div id="sys-hook-errors-content"></div>
        </div>
        <div class="sys-card">
          <div class="sys-card-header">Lock 管理</div>
          <div id="sys-locks-content"></div>
        </div>
        <div class="sys-card">
          <div class="sys-card-header">Anomalies</div>
          <div id="sys-anomalies-content"></div>
        </div>
        <div class="sys-card">
          <div class="sys-card-header">操作</div>
          <div id="sys-actions-content"></div>
        </div>
      </div>
    </details>

  </div>
</div>
```

**ID 規範**：
- 區塊：`sys-sec-realtime`、`sys-sec-resources`、`sys-sec-results`、`sys-sec-admin`
- 從 loop.js 吸收的元素 ID：`sys-loop-steps`、`sys-loop-log`、`sys-loop-stats`、`sys-loop-notion`
- 管理工具徽章：`sys-admin-badge`
- 心跳統計卡片：`sys-card-heartbeat`（合併原 heartbeat + loop 心跳狀態）

---

## CSS 新增設計

### Sub-Tab 樣式

```css
/* ── Sub-Tab（營運 Tab 內部切換） ────────────── */
.sub-tabs {
  display: flex;
  gap: 0;
  padding: 0 16px;
  border-bottom: 1px solid #1e293b;
  flex-shrink: 0;
  background: rgba(10, 10, 25, 0.6);
}

.sub-tab {
  padding: 6px 14px;
  font-size: 12px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  color: #64748b;
  transition: color 0.2s, border-color 0.2s;
  user-select: none;
}

.sub-tab.active {
  color: var(--accent, #818cf8);
  border-bottom-color: var(--accent, #818cf8);
}

.sub-tab:hover:not(.active) { color: #94a3b8; }

/* Sub-panel */
.sub-panel { display: none; flex: 1; overflow-y: auto; }
.sub-panel.active { display: flex; flex-direction: column; }

/* 營運 panel 佈局 */
#ops-panel { flex-direction: column; overflow: hidden; }
```

### 系統區塊樣式

```css
/* ── 系統 Tab 區塊分層 ────────────────────────── */
.sys-sections {
  padding: 16px;
  overflow-y: auto;
  flex: 1;
}

.sys-section {
  margin-bottom: 24px;
}

.sys-section-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--accent2, #38bdf8);
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.sys-section-title::after {
  content: '';
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, rgba(56,189,248,0.2), transparent);
}

/* 折疊區塊（<details>） */
.sys-section-collapsible {
  border: 1px solid rgba(30,41,59,0.4);
  border-radius: 8px;
  padding: 0;
}

.sys-section-collapsible > .sys-section-toggle {
  cursor: pointer;
  padding: 12px 16px;
  margin-bottom: 0;
  list-style: none;
}

.sys-section-collapsible > .sys-section-toggle::-webkit-details-marker {
  display: none;
}

.sys-section-collapsible > .sys-section-toggle::before {
  content: '\25B6';  /* ▶ */
  font-size: 8px;
  color: #475569;
  transition: transform 0.2s;
  display: inline-block;
}

.sys-section-collapsible[open] > .sys-section-toggle::before {
  transform: rotate(90deg);
}

.sys-section-collapsible[open] > .sys-grid {
  padding: 0 16px 16px;
}

/* 管理工具徽章 */
.sys-admin-badge {
  display: none;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 10px;
  background: rgba(251,191,36,0.15);
  color: #fbbf24;
  font-weight: 600;
}

.sys-admin-badge.visible { display: inline-block; }
```

---

## 跳轉連結實作方式

### data-nav 屬性

跳轉連結統一用 `data-nav` 自訂屬性：

```html
<a href="#" data-nav="ops:monitor">查看全部 →</a>
<a href="#" data-nav="ops:logs">日誌 →</a>
```

格式：`data-nav="tab:subtab"`，其中 subtab 為可選。

### main.js 全域委派 handler

```javascript
// 跳轉連結 handler — 事件委派，不需逐一綁定
document.addEventListener('click', (e) => {
  const nav = e.target.closest('[data-nav]');
  if (!nav) return;
  e.preventDefault();
  const [tab, subtab] = nav.dataset.nav.split(':');
  // 切換 Tab
  document.querySelector(`[data-tab="${tab}"]`)?.click();
  // 切換 Sub-Tab（如果指定）
  if (subtab) {
    setTimeout(() => {
      document.querySelector(`[data-subtab="${subtab}"]`)?.click();
    }, 50);
  }
});
```

### 跳轉點

| 來源 | 跳轉目標 | data-nav 值 |
|------|---------|-------------|
| 系統 > Hook Errors 摘要 > 「查看全部」 | 營運 > 監控 | `ops:monitor` |
| 營運 > 日誌 > Git 摘要 > 「查看完整」 | 營運 > 監控 | `ops:monitor` |

---

## system.js 吸收 loop.js 的設計

### 資料流

```
system.js update(health)
  ├── 原有：renderMemoryChart, renderHeartbeatStats, renderModulesList, ...
  └── 新增：fetchLoopData() → renderLoopCards, renderLoopSteps, renderLoopLog, renderLoopStats, renderLoopNotion

fetchLoopData()：
  - fetch /processes → heartbeat 狀態（運行/停止/執行中/間隔/lastPoll）
  - fetch /api/notion-todo → 待做數量 + 最上面任務
  - fetch /api/sessions-summary → session 列表（filter heartbeat）
```

### 合併 Heartbeat 顯示

原 system.js 的 `renderHeartbeatStats()` 和 loop.js 的心跳卡片合併為 `sys-card-heartbeat`：
- 狀態（運行中/停止/執行中）
- 模式 + 間隔
- 下次 Tick 倒數（需要 1s tick interval）
- Sessions/成功/失敗統計
- 最後 Poll 時間

### Tick 倒數邏輯

system.js 吸收 loop.js 的 `tick()` 函式和 `tickIntervalId`：
- Tab active 時啟動 `setInterval(tick, 1000)` → 更新倒數
- Tab 離開時 `clearInterval`

### Hook Errors 精簡

原 system.js 的 `renderHookErrors()` 改為只顯示最近 1 條 + 跳轉連結：

```javascript
function renderHookErrors() {
  // ... fetch 邏輯不變 ...
  if (hookErrorsCache.length === 0) {
    el.appendChild(sysEmpty('無錯誤記錄'));
    return;
  }
  // 只顯示最近 1 條
  const latest = hookErrorsCache[0];
  const row = sysStatRow(
    new Date(latest.ts).toLocaleTimeString(),
    `[${latest.event}] ${latest.error}`
  );
  el.appendChild(row);
  // 跳轉連結
  const link = document.createElement('a');
  link.href = '#';
  link.dataset.nav = 'ops:monitor';
  link.textContent = `查看全部 (${hookErrorsCache.length}) →`;
  link.className = 'sys-nav-link';
  el.appendChild(link);
}
```

### 折疊自動展開邏輯

```javascript
function updateAdminBadge() {
  const details = document.getElementById('sys-sec-admin');
  const badge = document.getElementById('sys-admin-badge');
  const activeLocks = filterActiveLocks(locksCache);
  const anomalyCount = latestHealth?.anomalies?.length || 0;
  const total = activeLocks.length + anomalyCount;

  if (total > 0) {
    badge.textContent = total;
    badge.classList.add('visible');
    details.open = true;  // 自動展開
  } else {
    badge.classList.remove('visible');
  }
}
```

---

## main.js 變更設計

### Tab 切換邏輯

```javascript
// Tab 切換 — 新邏輯
tab.addEventListener('click', () => {
  const prevTab = document.querySelector('.tab.active')?.dataset.tab;
  // 離開系統 Tab 時清除 tick interval
  if (prevTab === 'system') System.destroyTick();
  if (prevTab === 'graph') Graph.pause?.();

  // 切換 active
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  tab.classList.add('active');
  document.getElementById(`${tab.dataset.tab}-panel`).classList.add('active');
  localStorage.setItem('nova-tab', tab.dataset.tab);

  // Tab 啟用行為
  if (tab.dataset.tab === 'flow') { Metro.updateFlowDimensions(); Metro.loadSessions(); }
  if (tab.dataset.tab === 'graph') { Graph.updateDimensions(); Graph.render(); }
  if (tab.dataset.tab === 'system') { System.update(latestHealth); }
  if (tab.dataset.tab === 'ops') { triggerActiveSubTab(); }
});
```

### Sub-Tab 切換邏輯

```javascript
// Sub-Tab 切換
let activeSubTab = 'monitor';  // 預設

document.querySelectorAll('.sub-tab').forEach(st => {
  st.addEventListener('click', () => {
    document.querySelectorAll('.sub-tab').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.sub-panel').forEach(p => p.classList.remove('active'));
    st.classList.add('active');
    activeSubTab = st.dataset.subtab;
    document.getElementById(`sub-${activeSubTab}`).classList.add('active');
    // Sub-Tab 記憶
    localStorage.setItem('nova-subtab', activeSubTab);
    triggerActiveSubTab();
  });
});

function triggerActiveSubTab() {
  if (activeSubTab === 'quality') Quality.update();
  if (activeSubTab === 'monitor') Monitor.update();
  if (activeSubTab === 'logs') Logs.update();
}
```

### 快捷鍵更新

```javascript
// 1-5 對應 5 個 Tab
if (e.key === '1') document.querySelector('[data-tab="graph"]').click();
if (e.key === '2') document.querySelector('[data-tab="flow"]').click();
if (e.key === '3') document.querySelector('[data-tab="events"]').click();
if (e.key === '4') document.querySelector('[data-tab="ops"]').click();
if (e.key === '5') document.querySelector('[data-tab="system"]').click();
```

### CMD_ACTIONS 更新

```javascript
const CMD_ACTIONS = [
  { label: '架構圖',     key: '1', action: () => clickTab('graph') },
  { label: '事件流',     key: '2', action: () => clickTab('flow') },
  { label: '事件記錄',   key: '3', action: () => clickTab('events') },
  { label: '營運',       key: '4', action: () => clickTab('ops') },
  { label: '系統',       key: '5', action: () => clickTab('system') },
  // Sub-Tab 捷徑
  { label: '營運 > 品質', key: 'Q', action: () => navTo('ops', 'quality') },
  { label: '營運 > 監控', key: 'M', action: () => navTo('ops', 'monitor') },
  { label: '營運 > 日誌', key: 'L', action: () => navTo('ops', 'logs') },
  // 操作
  { label: 'Heartbeat 啟動/停止', key: 'H', action: () => document.getElementById('hc-heartbeat').click() },
  { label: '模組熱重載',          key: 'R', action: () => document.getElementById('hc-reload').click() },
];
```

---

## logs.js 變更設計

### Git Commits 摘要化

`renderDayView()` 中的 Git Commits 區段改為摘要行 + 跳轉連結：

```javascript
// 原本：完整列出每條 commit
// 新：只顯示摘要行
if (log.commits?.length) {
  const commitSection = document.createElement('div');
  commitSection.className = 'logs-section';
  const commitTitle = document.createElement('div');
  commitTitle.className = 'logs-section-title';
  commitTitle.textContent = `Git Commits`;
  commitSection.appendChild(commitTitle);

  const summary = document.createElement('div');
  summary.className = 'logs-commit-summary';
  summary.textContent = `今日 ${log.commits.length} 筆 commit`;

  const link = document.createElement('a');
  link.href = '#';
  link.dataset.nav = 'ops:monitor';
  link.className = 'logs-nav-link';
  link.textContent = '查看完整 →';
  summary.appendChild(link);

  commitSection.appendChild(summary);
  el.appendChild(commitSection);
}
```

---

## 執行步驟

### Phase 1：HTML + CSS 骨架（parallel，2 executor）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 1a | `client.html` | Tab Bar 8→5 + 營運 Panel Sub-Tab 結構 + 系統 Panel 4 區塊結構 + 刪除 loop-panel |
| 1b | `client.css` | 新增 Sub-Tab 樣式 + 系統區塊分層樣式 + 折疊樣式 + 跳轉連結樣式 |

### Phase 2：JS 邏輯重組（parallel，2 executor，依賴 Phase 1）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 2a | `main.js` | Tab 切換 8→5 + Sub-Tab 切換/記憶 + 快捷鍵 1-5 + CMD_ACTIONS + 跳轉 handler + 移除 Loop import + SSE 分發更新 |
| 2b | `system.js` | 吸收 loop.js 全部邏輯 + 4 區塊渲染 + 心跳合併 + Hook Errors 精簡 + 折疊自動展開 + tick 倒數 + destroyTick 導出 |

### Phase 3：去重 + 清理（parallel，依賴 Phase 2）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 3a | `logs.js` | Git Commits 摘要化 + 跳轉連結 |
| 3b | `server.js` | FLOW_FILES 白名單移除 `loop.js`（第 173 行） |
| 3c | 刪除 `loop.js` | `rm ~/.claude/scripts/flow/loop.js` |

### Phase 4：驗收（sequential，依賴 Phase 3）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 4 | 驗收 | `bun test` 全量通過 + PinchTab acceptance 測試 |

---

## Pre-mortem

| # | 失敗情境 | 機率 | 影響 | 預防措施 |
|---|---------|:----:|:----:|---------|
| 1 | system.js 吸收 loop.js 後行數膨脹，超過可維護上限 | 中 | 中 | loop.js 273 行 + system.js 457 行 = ~730 行。system.js 原有 Hook Errors 完整列表移除（-30 行），loop.js 的 buildHtml 不需要（HTML 已寫死）（-50 行），估計合併後 ~600 行，可接受 |
| 2 | Sub-Tab 切換後 quality/monitor/logs 的 DOM 元素找不到（ID 衝突或不存在） | 中 | 高 | 保持原有 DOM ID 不變（`q-rings`、`mon-errors` 等），只是搬移位置 |
| 3 | Tab 記憶恢復失敗（localStorage 存了舊 Tab 名如 `quality`） | 低 | 低 | main.js 初始化時，若 saved tab 不存在則 fallback 到 `graph` |
| 4 | system.js 的 fetch polling 和 loop 的 fetchData polling 衝突或重複 | 中 | 中 | 合併為一個 polling 週期：health poll（5s，已有）+ loop data poll（3s，Tab active 時才啟動），互不干擾 |

---

## 測試策略

| 測試方式 | 驗收條件 |
|---------|---------|
| `bun test` | 1256 tests 全量通過 |
| PinchTab acceptance | Tab Bar 顯示 5 個 Tab、快捷鍵 1-5 正常、Sub-Tab 切換正常、跳轉連結正常、折疊展開正常 |

---

## 不做什麼

1. **不改後端 API**：所有 `/api/*` endpoint 不變，只改前端消費方式
2. **不改 graph.js / metro.js / events.js**：這三個 Tab 內容完全不變
3. **不改 quality.js / monitor.js 的 API 介面**：它們的 `init()` + `update()` 保持不變，只是被營運 Tab 的 Sub-Tab 機制呼叫
4. **不引入新的打包工具或框架**：維持原有 ES module + CDN D3 模式
