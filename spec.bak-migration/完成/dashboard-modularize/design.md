# Dashboard 模組化重構 — 技術設計

## 深度路由：D4
**理由**：涉及 8 個新檔案 + 1 個修改檔案，跨 CSS/HTML/JS 三層，且多個模組可並行開發。D4 多 executor 並行能大幅縮短執行時間。

---

## 技術摘要

- **方案**：瀏覽器原生 ES modules（`<script type="module">`），server.js 新增白名單 static file serving
- **理由**：零建置依賴、瀏覽器原生支援、與現有架構最小衝突
- **取捨**：每個模組一個 HTTP 請求（7 個），但全部 localhost 本地請求，延遲可忽略

## 方案比較

| 維度 | 方案 A：原生 ES modules（選擇） | 方案 B：esbuild bundle |
|------|:----------------------------:|:--------------------:|
| 複雜度 | 低（零建置） | 中（需建置步驟 + watch） |
| 開發體驗 | 改檔即生效（graceful restart） | 需 watch process 或手動 rebuild |
| HTTP 請求數 | 7-8 個（可接受，localhost） | 1 個 bundle |
| 偵錯體驗 | 原始碼直接對應（無 sourcemap 需求） | 需 sourcemap |
| 依賴 | 零新依賴 | 新增 esbuild 依賴 |
| **結論** | **選擇** — 零建置、最小改動 | ❌ 過度工程化（Dashboard 僅本地使用） |

## 模組介面

### 新增檔案

| # | 檔案 | 位置 | 行數 | 用途 |
|---|------|------|:----:|------|
| 1 | `client.css` | `~/.claude/scripts/flow/` | ~1120 | 所有 CSS 樣式（從 `<style>` 提取） |
| 2 | `main.js` | `~/.claude/scripts/flow/` | ~300 | 入口：State 管理、SSE、Tab 切換、Header、Command Palette、鍵盤快捷鍵、init |
| 3 | `graph.js` | `~/.claude/scripts/flow/` | ~400 | D3 力導向圖：renderGraph、simulation、drag、pulse、usage badges |
| 4 | `metro.js` | `~/.claude/scripts/flow/` | ~500 | Metro 地鐵圖：session sidebar、renderMetroMap、eventToStation、tooltip |
| 5 | `events.js` | `~/.claude/scripts/flow/` | ~200 | 事件列表：renderEventItem、filter chips、搜尋 |
| 6 | `system.js` | `~/.claude/scripts/flow/` | ~250 | 系統面板：memory chart、heartbeat stats、modules list、anomalies、server info、hook errors |
| 7 | `logs.js` | `~/.claude/scripts/flow/` | ~200 | 每日日誌：fetchDailyLogs、renderDayView、日期導航 |

### 修改檔案

| # | 檔案 | 變更內容 |
|---|------|---------|
| 1 | `client.html` | 移除 `<style>` 和 `<script>` 區塊 → 加入 `<link href="/flow/client.css">` + `<script type="module" src="/flow/main.js">` |
| 2 | `server.js` | 新增 `/flow/{name}.{ext}` static serving 路由 + 擴展 graceful restart 偵測範圍 |

### 可移除

| # | 檔案 | 原因 |
|---|------|------|
| 1 | `client-logic.js` | 已有路由但目前未被 client.html 使用，模組化後由各模組取代 |

### API 設計

**server.js 新增 static serving**

```javascript
// 白名單 static files
const FLOW_FILES = {
  'client.css':  'text/css; charset=utf-8',
  'main.js':     'application/javascript; charset=utf-8',
  'graph.js':    'application/javascript; charset=utf-8',
  'metro.js':    'application/javascript; charset=utf-8',
  'events.js':   'application/javascript; charset=utf-8',
  'system.js':   'application/javascript; charset=utf-8',
  'logs.js':     'application/javascript; charset=utf-8',
};

// 路由：GET /flow/{filename}
const flowMatch = url.pathname.match(/^\/flow\/(.+)$/);
if (flowMatch) {
  const file = flowMatch[1];
  const contentType = FLOW_FILES[file];
  if (!contentType) return new Response('Not Found', { status: 404 });
  const content = readFileSync(join(CLAUDE_DIR, 'scripts/flow', file), 'utf-8');
  return new Response(content, { headers: { 'Content-Type': contentType } });
}
```

**模組間共享狀態架構**

```
main.js（State owner）
├── import { init, render, ... } from './graph.js'
├── import { init, loadSessions, ... } from './metro.js'
├── import { init, addEvent } from './events.js'
├── import { update } from './system.js'
└── import { init, update } from './logs.js'

共享狀態傳遞方式：
- 常數（NODE_COLORS 等）：main.js export，各模組 import
- 動態狀態（graphData, events, health）：main.js 持有，透過函式參數傳入
- 模組內部狀態（simulation, memoryHistory）：各模組自行管理，不 export
```

**依賴方向（單向）**

```
main.js → graph.js      （init, render, pulseNode, updateUsageBadges, updateDimensions）
main.js → metro.js       （init, loadSessions, handleFlowEvent, renderMetroMap, updateFlowDimensions）
main.js → events.js      （init, addEvent）
main.js → system.js      （update）
main.js → logs.js        （init, update）

graph.js ← main.js export NODE_COLORS
metro.js ← main.js export NODE_COLORS, AGENT_COLORS

模組之間不互相 import（graph.js 不 import metro.js）
```

## 資料模型

- 儲存格式：無新增檔案（所有檔案為 .js/.css/.html）
- 儲存位置：`~/.claude/scripts/flow/`
- 清理策略：不適用

## 原始碼行號對照表

精確的拆分邊界（以原始 client.html 行號為基準）：

| 目標檔案 | 原始行號範圍 | 行數 | 內容描述 |
|---------|:----------:|:----:|---------|
| `client.css` | 9-1120 | ~1112 | `<style>` 標籤內所有 CSS |
| `client.html` | 1-7 + 1121-1285 | ~172 | `<!DOCTYPE>` + `<head>` + `<body>` HTML 骨架 |
| `main.js` | 1287-1345 + 1768-1852 + 1897-1945 + 1972-2086 + 2510-2519 + 3189-3285 | ~300 | State, Tab switch, SSE, Events filter init, Header metrics/controls, fetchGraph, Command Palette, Keyboard, Init |
| `graph.js` | 1406-1766 | ~361 | D3 SVG setup, renderGraph, simulation, drag, pulse, usage badges |
| `metro.js` | 2521-3187 | ~667 | Metro state, sessions sidebar, renderMetroMap, eventToStation, tooltip, handleFlowEvent |
| `events.js` | 1854-1970 | ~117 | renderEventItem, EVENT_TYPES, applyEventsFilter |
| `system.js` | 2087-2325 | ~239 | memoryHistory, updateSystemPanel, renderMemoryChart, heartbeat/modules/anomalies/server/hookErrors |
| `logs.js` | 2327-2508 | ~182 | dailyLogsCache, fetchDailyLogs, renderDayView, renderDailyLogs, 日期導航 |

注意：main.js 的行號不連續，因為它聚合了分散在各處的全域邏輯。

## 執行步驟

### Phase 1：基礎設施（sequential）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 1.1 | `server.js` | 新增 `/flow/{name}.{ext}` 白名單 static serving 路由 + 擴展 graceful restart 偵測 |

**理由**：所有模組檔案都依賴 server.js 能正確 serving，必須先完成。

### Phase 2：模組拆分（parallel）

所有模組獨立，可同時進行。

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 2.1 | `client.css` | 提取 CSS（行 9-1120），純搬移無修改 |
| 2.2 | `graph.js` | 提取 D3 力導向圖邏輯，export init/render/pulseNode/updateUsageBadges/updateDimensions。import NODE_COLORS from main。接收 `graphData` 作為參數 |
| 2.3 | `metro.js` | 提取 Metro 地鐵圖邏輯，export init/loadSessions/handleFlowEvent/renderMetroMap/updateFlowDimensions。import NODE_COLORS, AGENT_COLORS from main。Metro 內部管理 session state |
| 2.4 | `events.js` | 提取事件列表邏輯，export init/addEvent。EVENT_TYPES 和 filter state 模組內部管理 |
| 2.5 | `system.js` | 提取系統面板邏輯，export update。memoryHistory 模組內部管理。接收 health 資料作為 update(health) 參數 |
| 2.6 | `logs.js` | 提取日誌邏輯，export init/update。dailyLogsCache 模組內部管理 |

### Phase 3：整合（sequential）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 3.1 | `main.js` | 建立入口模組：import 所有 Tab 模組、管理共享 state、SSE 連線、Tab 切換、Command Palette、鍵盤快捷鍵、Health polling、init 流程 |
| 3.2 | `client.html` | 瘦身：移除 `<style>` + `<script>` → 加入 `<link>` + `<script type="module">` |

**理由**：main.js 需要所有模組的 export 介面已確定才能撰寫。client.html 需要所有檔案就緒才能整合。

### Phase 4：驗證（sequential）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 4.1 | — | `bun test` 確認全部通過 |
| 4.2 | — | PinchTab Acceptance 測試：5 個 Tab、SSE、Command Palette |
| 4.3 | — | 確認 graceful restart 偵測範圍正確（修改 .js/.css 觸發 restart） |

## Pre-mortem

**假設這個功能上線後失敗了，最可能的原因是什麼？**

| # | 失敗情境 | 機率 | 影響 | 預防措施 |
|---|---------|:----:|:----:|---------|
| 1 | D3 全域變數在 ES module 內不可用 | 低 | 高 | CDN `<script>` 標籤 **必須在** `<script type="module">` 之前。瀏覽器先載入全域 D3，模組才能用 `window.d3` 或直接 `d3`。已知 Chrome 支援此模式。Phase 4 PinchTab 驗證。 |
| 2 | 拆分時遺漏某段邏輯或狀態引用 | 中 | 中 | 行號對照表確保每行都有歸屬。Phase 3 整合時逐一比對。Phase 4 PinchTab 5 Tab 全覆蓋驗證。 |
| 3 | 模組載入順序導致 init 時序問題 | 低 | 中 | `main.js` 統一控制 init 順序：connectSSE → fetchGraph → loadSessions → initEventsFilter → initHeader。各模組不在 import 時自執行。 |
| 4 | static serving 路徑穿越安全問題 | 低 | 高 | 白名單限制，只允許預定義的檔名，不接受子路徑。 |
| 5 | Graceful restart 未偵測到新檔案變更 | 中 | 低 | 擴展偵測邏輯為 `fp.includes('/scripts/flow/')` 而非只匹配特定檔名。 |

**Pre-mortem 觸發重新設計的條件**：無「高機率 + 高影響」的未防護情境。方案可行。

## 測試策略

| 測試檔案 | 驗收條件 |
|---------|---------|
| 既有 `bun test` | 全部 1274 pass / 0 fail |
| PinchTab Acceptance | 5 Tab 切換正常、SSE 事件即時顯示、Command Palette 開啟/搜尋/執行、Header 指標更新 |
| 手動驗證 | `curl http://localhost:3457/flow/main.js` 回傳 JS 內容 + 正確 Content-Type |
| 手動驗證 | 修改 `graph.js` 後觸發 graceful restart |

## 不做什麼

1. **不做 bundle/minify**：Dashboard 僅本地使用，7 個 localhost 請求的效能影響為零。建置步驟增加複雜度不值得。
2. **不做 CSS modules/scoped CSS**：現有 CSS 已用命名空間區分（`.sys-`、`.logs-`、`.metro-` 等），不需要額外隔離機制。
3. **不做 Web Components**：過度工程化。ES modules 的 import/export 已足夠管理模組邊界。
4. **不做 State management library**：共享狀態量少（5-6 個變數），直接透過函式參數傳遞比引入 Redux/MobX 更簡單。
