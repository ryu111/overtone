# Dashboard 模組化重構

## 動機（Why）

- **問題**：`client.html` 單一檔案 3287 行，CSS/HTML/JS 全部耦合。修改任何一個 Tab 的邏輯都需要在巨大檔案中定位，認知負擔高。模組間共享狀態隱式（全域變數），難以追蹤依賴關係。
- **目標**：拆分為 ES modules，每個 Tab 獨立一個 JS 檔，CSS 獨立。模組間依賴透過 import/export 顯式聲明。單檔行數控制在 500 行以下。
- **不做的代價**：隨功能增加（如未來 Tab 擴充），檔案將持續膨脹。多人/多 session 同時修改同一檔案衝突機率高。

## 範圍

### In-scope

- 將 CSS 提取為獨立 `client.css`
- 將 JS 按功能區塊拆為 ES modules：`main.js`、`graph.js`、`metro.js`、`events.js`、`system.js`、`logs.js`
- `client.html` 瘦身為純 HTML 骨架 + `<link>` + `<script type="module">`
- server.js 新增 static file serving（`/flow/*.js`、`/flow/*.css`）
- server.js graceful restart 偵測範圍擴展為 `scripts/flow/` 下所有檔案
- 移除已存在但未使用的 `client-logic.js` 路由（或整合）

### Out-of-scope

- 不引入建置工具（Vite/Webpack/esbuild）— 保持零建置，瀏覽器原生 ES modules
- 不改變 UI 外觀或功能行為
- 不新增 Tab 或功能
- 不修改 server.js 的 API 路由（/dispatch、/health 等）
- 不做 TypeScript 遷移

## 使用者故事

身為 Nova 開發者，我想要每個 Dashboard Tab 的程式碼獨立在各自的模組中，以便修改某個 Tab（如系統面板）時只需閱讀和編輯該模組，不需要在 3000+ 行檔案中搜尋。

身為 Nova 維護者（AI agent），我想要明確的 import/export 介面，以便自動分析模組依賴關係和影響範圍。

## 行為規格

### 正常路徑

1. 使用者訪問 `http://localhost:3457/` → server.js 回傳 `client.html`
2. 瀏覽器載入 `client.html` → 透過 `<link>` 載入 `client.css` → 透過 `<script type="module">` 載入 `main.js`
3. `main.js` import 各 Tab 模組 → 初始化 SSE、Tab 切換、Command Palette、鍵盤快捷鍵
4. 各 Tab 模組 export `init()` 和 `update()` 函式，由 `main.js` 統一呼叫
5. SSE 事件進入 → `main.js` 分發給對應 Tab 模組處理

### 錯誤路徑

| 錯誤情境 | 預期行為 |
|---------|---------|
| 某個 .js 模組載入失敗（404） | 該 Tab 功能不可用，其他 Tab 正常運作，Console 顯示錯誤 |
| CSS 載入失敗 | 頁面無樣式但功能正常（graceful degradation） |
| server.js 未新增 static serving | 模組 404，回退到舊行為（不應發生，有測試防護） |

### 邊界條件

- 空事件列表 → 各 Tab 顯示空狀態，與現行行為一致
- 瀏覽器不支援 ES modules → 不支援（Chrome 61+ 即支援，Dashboard 僅供本地使用）
- 多個 SSE client 同時連線 → 行為不變（SSEPool 在 server.js 中處理）

## 資料模型

### 輸入

無新增資料結構。所有資料來自現有 SSE 事件流和 REST API。

### 輸出

無新增輸出。所有渲染目標為既有 DOM 元素。

### 共享狀態（模組間）

| 狀態 | 來源 | 消費者 | 介面 |
|------|------|--------|------|
| `graphData` | fetchGraph() → `/api/graph` | graph.js | main.js 持有，graph.js 透過 init(state) 接收引用 |
| `events[]` | SSE → handleEvent | events.js | main.js 持有，events.js 透過 addEvent(evt) 接收 |
| `latestHealth` | pollHealth() → `/health` | system.js, main.js (header) | main.js 持有，system.js 透過 update(health) 接收 |
| `metro` | SSE → handleFlowEvent | metro.js | metro.js 內部管理，main.js 呼叫 handleFlowEvent(evt) |
| `NODE_COLORS` / `AGENT_COLORS` | 常數 | graph.js, metro.js | 從 `main.js` export |
| `seenEventTs` | SSE 去重 | main.js | main.js 內部 |
| `simulation` (D3) | graph.js | graph.js | graph.js 內部 |
| `memoryHistory[]` | pollHealth | system.js | system.js 內部 |

## 介面契約

### 模組 export 介面規範

每個 Tab 模組 export 以下函式：

```javascript
// graph.js
export function init(state)      // 初始化 D3 SVG、force simulation
export function render()          // 重新渲染（resize、新資料）
export function updateDimensions() // 更新寬高
export function pulseNode(nodeId)  // 動畫：脈衝某個節點
export function updateUsageBadges() // 更新使用次數

// metro.js
export function init()            // 初始化 Metro SVG
export function loadSessions()    // 載入 session 列表
export function handleFlowEvent(event, isReplay) // SSE 事件處理
export function renderMetroMap()  // 重新渲染地鐵圖
export function updateFlowDimensions() // 更新寬高

// events.js
export function init()            // 初始化 filter chips、搜尋
export function addEvent(event)   // 新增事件到列表

// system.js
export function update(health)    // 用最新 health 資料更新面板

// logs.js
export function init()            // 初始化日期導航
export function update()          // 載入/渲染日誌

// main.js — 入口模組，不 export（自執行）
```

### server.js 新增路由

| 路由 | 方法 | 回應 |
|------|------|------|
| `/flow/{filename}.js` | GET | `Content-Type: application/javascript; charset=utf-8` |
| `/flow/{filename}.css` | GET | `Content-Type: text/css; charset=utf-8` |

限制 `filename` 為白名單（`main`、`graph`、`metro`、`events`、`system`、`logs`、`client`），避免路徑穿越。

## 非功能需求

| 維度 | 要求 |
|------|------|
| 效能 | 首次載入增加 6-7 個 HTTP 請求（JS + CSS），但均為本地 localhost，延遲 < 1ms。無感知差異。 |
| 快取 | 不加 Cache-Control（本地開發工具，不需快取）。Server restart 後瀏覽器 hard reload 即可。 |
| 安全 | static serving 白名單限制，防止任意檔案讀取。 |
| 相容性 | 僅支援 Chrome/Edge（本地 Dashboard 工具）。 |

## 依賴

| 方向 | 模組 | 說明 |
|------|------|------|
| 上游 | `server.js` | 需新增 static file serving 路由 |
| 上游 | D3.js (CDN) | graph.js、metro.js 依賴，保持 CDN 引入不變 |
| 下游 | 無 | Dashboard 是終端消費者，無下游 |

## 驗收標準

- [ ] `client.html` 行數 < 200 行（純 HTML 骨架）
- [ ] `client.css` 包含所有樣式，行數 ~1120 行
- [ ] 每個 JS 模組行數 < 500 行
- [ ] `bun test` 全部通過（1274 pass / 0 fail）
- [ ] 瀏覽器訪問 `http://localhost:3457/` 功能完整：5 個 Tab 切換正常、SSE 即時更新、Command Palette 運作、鍵盤快捷鍵運作
- [ ] server.js 修改 `scripts/flow/` 下任何 `.js` 或 `.css` 檔案時觸發 graceful restart
- [ ] server.js `/flow/main.js` 等路由回傳正確 Content-Type
- [ ] 模組間無全域變數污染（所有共享狀態透過 import/export）

## 風險

| 風險 | 機率 | 影響 | 緩解策略 |
|------|:----:|:----:|---------|
| D3 全域依賴問題（`d3` 在 CDN 載入為全域，ES module 內需能存取） | 中 | 高 | CDN `<script>` 在 `<script type="module">` 之前載入，`d3` 為 window 全域物件，模組內直接用 `d3` 即可（已驗證行為） |
| 循環依賴（如 graph.js 和 main.js 互相 import） | 低 | 中 | 設計時確保單向依賴：main → 各模組，各模組不 import main |
| 瀏覽器 MIME type 嚴格檢查 | 低 | 高 | server.js static serving 必須設定正確 Content-Type（`application/javascript`） |
| 拆分後遺漏某段邏輯 | 中 | 中 | 拆分前建立行號對照表，拆分後逐一比對。用 PinchTab 做 Acceptance 測試確認 5 個 Tab 功能。 |
| 現有測試依賴 client.html 結構 | 低 | 低 | 現有測試不直接測 client.html 內容（主要測 server API）。若有，一併更新。 |
