# Dashboard 模組化重構 — 任務分解

## 子任務依賴分析

```
Phase 1（sequential）：server.js static serving + graceful restart
    ↓ 依賴 Phase 1 完成
Phase 2（parallel）：6 個模組同時拆分
    ├── T2.1 client.css
    ├── T2.2 graph.js
    ├── T2.3 metro.js
    ├── T2.4 events.js
    ├── T2.5 system.js
    └── T2.6 logs.js
    ↓ 依賴 Phase 2 全部完成
Phase 3（sequential）：main.js 整合 + client.html 瘦身
    ├── T3.1 main.js
    └── T3.2 client.html（依賴 T3.1）
    ↓ 依賴 Phase 3 完成
Phase 4（sequential）：驗證
    └── T4.1 測試 + 驗收
```

---

## Phase 1：基礎設施

### T1.1 server.js static serving + graceful restart

- **executor**：developer
- **檔案**：`~/.claude/hooks/server.js`
- **動作**：
  1. 在 `url.pathname === '/'` 路由**之前**新增 `/flow/{name}` 白名單 static serving
  2. 白名單：`client.css`、`main.js`、`graph.js`、`metro.js`、`events.js`、`system.js`、`logs.js`
  3. Content-Type：`.js` → `application/javascript; charset=utf-8`，`.css` → `text/css; charset=utf-8`
  4. 擴展 graceful restart 偵測：`fp.includes('/scripts/flow/')` 取代只匹配 `client.html`
  5. 移除 `/client-logic.js` 單獨路由（整合到 `/flow/` 通用路由，或若不再需要則刪除）
- **驗收**：`curl -I http://localhost:3457/flow/main.js` 回傳 200 + 正確 Content-Type（需先建立空檔案）
- **狀態**：[ ]

---

## Phase 2：模組拆分（parallel — 6 個 executor）

### T2.1 client.css

- **executor**：developer
- **檔案**：`~/.claude/scripts/flow/client.css`（新建）
- **動作**：
  1. 從 client.html 行 9-1120 提取 `<style>` 標籤內容
  2. 純搬移，不修改任何 CSS 規則
  3. 移除 `<style>` 和 `</style>` 標籤
- **驗收**：檔案行數 ~1112 行，無 `<style>` 標籤
- **狀態**：[ ]

### T2.2 graph.js

- **executor**：developer
- **檔案**：`~/.claude/scripts/flow/graph.js`（新建）
- **動作**：
  1. 從 client.html 行 1406-1766 提取 D3 力導向圖邏輯
  2. 函式提取為 export：`init(state)`、`render()`、`updateDimensions()`、`pulseNode(nodeId)`、`updateUsageBadges()`、`showDetail(node)`
  3. 接收共享狀態：`init({ graphData, nodeUsageCount, NODE_COLORS })` 保存引用
  4. 行 1347-1404 的 breaks toggle + sidebar toggle + legend + detail panel 事件綁定歸入 graph.js 的 `init()`
  5. `d3` 作為全域變數直接使用（CDN 載入）
- **輸入依賴**：NODE_COLORS 定義（從 main.js import 或 init 參數傳入）
- **驗收**：export 5+ 函式，無全域變數宣告
- **狀態**：[ ]

### T2.3 metro.js

- **executor**：developer
- **檔案**：`~/.claude/scripts/flow/metro.js`（新建）
- **動作**：
  1. 從 client.html 行 2521-3187 提取 Metro 地鐵圖邏輯
  2. 函式提取為 export：`init()`、`loadSessions()`、`handleFlowEvent(event, isReplay)`、`renderMetroMap()`、`updateFlowDimensions()`
  3. metro 狀態物件（currentSid、events、initialized）模組內部管理
  4. 包含：renderSessionList、loadFlowsForSession、selectFlow、selectSession、initMetro、eventToStation、getHookInfo、HOOK_SHAPES、showMetroTooltip、getOrbitPath
  5. `graphData` 引用透過 init 傳入（metro 需要讀取 edges/breaks 做 skill branch）
- **輸入依賴**：NODE_COLORS, AGENT_COLORS（從 main.js import 或 init 參數傳入），graphData 引用
- **驗收**：export 5 函式，metro 狀態不外洩
- **狀態**：[ ]

### T2.4 events.js

- **executor**：developer
- **檔案**：`~/.claude/scripts/flow/events.js`（新建）
- **動作**：
  1. 從 client.html 行 1854-1970 提取事件列表邏輯
  2. 函式提取為 export：`init()`、`addEvent(event)`
  3. EVENT_TYPES、activeFilters、searchQuery、applyEventsFilter 模組內部管理
  4. `renderEventItem` 改名為 `addEvent` 對外，內部保留 renderEventItem
  5. init() 負責建立 filter chips 和搜尋框事件綁定
- **輸入依賴**：無（純 DOM 操作）
- **驗收**：export 2 函式
- **狀態**：[ ]

### T2.5 system.js

- **executor**：developer
- **檔案**：`~/.claude/scripts/flow/system.js`（新建）
- **動作**：
  1. 從 client.html 行 2087-2325 提取系統面板邏輯
  2. 函式提取為 export：`update(health)`
  3. memoryHistory、MAX_MEMORY_POINTS、hookErrorsCache 等模組內部管理
  4. 包含：renderMemoryChart、renderHeartbeatStats、renderModulesList、renderAnomalies、renderServerInfo、renderHookErrors、sysStatRow、sysEmpty
  5. update(health) 同時負責收集 memory sample 和判斷是否需要渲染
- **輸入依賴**：health 物件（由 main.js pollHealth 傳入）
- **驗收**：export 1 函式
- **狀態**：[ ]

### T2.6 logs.js

- **executor**：developer
- **檔案**：`~/.claude/scripts/flow/logs.js`（新建）
- **動作**：
  1. 從 client.html 行 2115-2118 + 2327-2508 提取日誌邏輯
  2. 函式提取為 export：`init()`、`update()`
  3. dailyLogsCache、dailyLogsFetchTs、dailyLogsIndex 模組內部管理
  4. init() 綁定日期導航按鈕事件（logs-prev、logs-next）
  5. update() = 原 updateLogsPanel()（檢查 tab 是否 active + 呼叫 renderDailyLogs）
- **輸入依賴**：無（自行 fetch `/api/daily-logs`）
- **驗收**：export 2 函式
- **狀態**：[ ]

---

## Phase 3：整合

### T3.1 main.js

- **executor**：developer
- **檔案**：`~/.claude/scripts/flow/main.js`（新建）
- **動作**：
  1. 建立入口模組，import 所有 Tab 模組
  2. 管理共享狀態：`graphData`、`events[]`、`eventCount`、`nodeUsageCount`、`seenEventTs`、`latestHealth`
  3. export 常數：`NODE_COLORS`、`AGENT_COLORS`（供 graph.js、metro.js import）
  4. SSE 連線：connectSSE → handleEvent → 分發到各模組
  5. Tab 切換邏輯（行 1313-1345）
  6. Header metrics + controls（行 1972-2085）
  7. Command Palette（行 3189-3250）
  8. 鍵盤快捷鍵（行 3252-3264）
  9. Init 流程：fetchGraph → connectSSE → loadSessions → initEventsFilter → initHeader
  10. window resize handler
- **依賴**：Phase 2 所有模組的 export 介面
- **驗收**：import 6 個模組，無全域 `var`/`let` 外洩到 window
- **狀態**：[ ]

### T3.2 client.html 瘦身

- **executor**：developer
- **檔案**：`~/.claude/scripts/flow/client.html`（修改）
- **動作**：
  1. 移除 `<style>...</style>` 區塊（行 8-1120）
  2. 移除 `<script>...</script>` 區塊（行 1286-3285）
  3. 在 `<head>` 加入 `<link rel="stylesheet" href="/flow/client.css">`
  4. 在 `</body>` 前加入 `<script type="module" src="/flow/main.js"></script>`
  5. D3 CDN `<script>` 保留在 `<head>` 中（必須在 module 之前載入）
  6. 確認 HTML 骨架完整（所有 DOM id 都保留）
- **依賴**：T3.1 完成
- **驗收**：行數 < 200 行，包含所有原始 DOM 元素 id
- **狀態**：[ ]

---

## Phase 4：驗證

### T4.1 測試 + 驗收

- **executor**：Main Agent
- **動作**：
  1. `bun test` — 確認 1274 pass / 0 fail
  2. PinchTab Acceptance：
     - 導航到 `http://localhost:3457/`
     - 確認 5 個 Tab 切換正常（架構圖/事件流/事件記錄/系統/日誌）
     - 確認 Header 指標顯示（MEM/UP/MOD/SSE）
     - 確認 SSE 連線狀態（綠點）
  3. 驗證 static serving：`curl -I http://localhost:3457/flow/main.js`
  4. 確認行數：`wc -l ~/.claude/scripts/flow/client.html` < 200
- **狀態**：[ ]
