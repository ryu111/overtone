# Dashboard G3 深度整合 — 任務分解

## 依賴分析

```
Phase 1（sequential）: api-router + server.js 串接
  ↓
Phase 2（parallel）: starfield + utils + CSS + HTML（4 任務並行）
  ↓
Phase 3（parallel）: quality.js + monitor.js + loop.js（3 任務並行）
  ↓
Phase 4（sequential）: main.js 整合 + system.js 合併 + logs.js 擴展
  ↓
Phase 5（sequential）: 驗收
```

---

## Phase 1：基礎設施（sequential）

### T1.1 建立 API Router 模組
- **檔案**：新增 `~/.claude/scripts/flow/api-router.js`
- **內容**：
  - 從 `~/projects/overtone/dashboard/server.js` 搬遷所有 `/api/*` handler
  - export `handleDashboardApi(pathname, req)` 函式
  - 將 `execSync`（git log）改為非同步 `Bun.spawn`
  - 路由清單：scores, behaviors, improvements, sessions-summary, scripts, components, git, locks, daemons, llm, system, decisions, notion-todo, actions/clear-locks, actions/trigger-maintainer, actions/reload-modules
  - 注意 `/api/sessions-summary`（避免與 3457 的 `/api/sessions` 衝突）
- **行數目標**：~250 行
- **驗收**：`curl http://localhost:3457/api/scores` 回傳 JSON

### T1.2 串接 server.js + 更新靜態白名單
- **檔案**：修改 `~/.claude/hooks/server.js`
- **內容**：
  - import api-router.js
  - 在 fetch handler 中，核心路由（dispatch/health/modules/processes/events/graph/sessions/config/daily-logs/hook-errors）之後，串接 `handleDashboardApi`
  - FLOW_STATIC 白名單新增：`starfield.js`, `quality.js`, `monitor.js`, `loop.js`, `utils.js`
- **行數限制**：server.js 新增 ≤ 10 行
- **驗收**：server.js 行數 ≤ 355 + 新 API 可 curl

---

## Phase 2：視覺層 + 工具層（parallel，依賴 Phase 1）

### T2.1 星空背景模組
- **檔案**：新增 `~/.claude/scripts/flow/starfield.js`
- **內容**：
  - 從 `g3-galaxy-pro.html` 第 464-554 行提取 Canvas 動畫
  - export `initStarfield()` 函式
  - 建立 `<canvas id="stars-canvas">` + 3 個星雲 div
  - 3 層視差星星（120+100+80 顆）+ 流星
  - 在 `document.hidden` 時暫停 requestAnimationFrame
- **行數目標**：~100 行

### T2.2 共用工具函式
- **檔案**：新增 `~/.claude/scripts/flow/utils.js`
- **內容**：
  - 從 `data-layer.js` 搬遷：`filterUserSessions`, `heartbeatSummaryHtml`, `mergeGitCommits`, `parseDaemonStatus`, `filterActiveLocks`, `gradeColor`, `relativeTime`, `getLatestScores`, `gradeDistribution`, `clusterErrors`, `calcHealthScore`, `generateMeetingNotes`, `generateDecisionSummary`
  - 從 `g3-galaxy-pro.html` 搬遷：`gradeFrom`, `scoreBarColor`, `animateCount`, `makeRing`, `renderMarkdown`
  - 全部 export
- **行數目標**：~120 行

### T2.3 CSS G3 風格覆蓋
- **檔案**：修改 `~/.claude/scripts/flow/client.css`
- **內容**：
  - body 背景從 grid pulse 改為 `#050510`（G3 純黑）
  - 新增 CSS 變數：`--accent: #818cf8; --accent2: #38bdf8; --accent3: #a78bfa; --text: #c4d0ff; --text-dim: rgba(196,208,255,0.45); --panel-bg: rgba(10,10,30,0.82); --panel-border: rgba(100,140,255,0.15);`
  - 星空 Canvas 和星雲的固定定位 CSS
  - 新增品質/監控/自主循環 Tab 的 panel CSS（從 G3 的樣式遷移）
  - 保留所有 3457 原有 CSS（graph/flow/events/system/logs 面板不動）
- **注意**：不刪除現有 CSS，只新增和覆蓋

### T2.4 HTML 骨架更新
- **檔案**：修改 `~/.claude/scripts/flow/client.html`
- **內容**：
  - `<body>` 開頭加 `<canvas id="stars-canvas">` + 3 個 `.nebula` div
  - Tab 列新增 3 個：品質、監控、自主循環
  - 新增 3 個 `<div class="panel">` 骨架（品質/監控/自主循環）
  - `<script>` 區新增 starfield.js + quality.js + monitor.js + loop.js + utils.js 的 import
  - 日誌 Tab 加「生成日報」按鈕

---

## Phase 3：Tab 實作（parallel，依賴 Phase 2）

### T3.1 品質 Tab
- **檔案**：新增 `~/.claude/scripts/flow/quality.js`
- **內容**：
  - export `init()`, `update()` 函式
  - `update()` 從 `/api/scores`, `/api/improvements`, `/api/components` fetch
  - SVG Ring KPI（4 個環：健康度/品質分/穩定度/元件率）
  - 品質分布柱狀圖（Grade A-F）
  - 完整評分排行表（sortable by total）
  - 改善建議列表
  - 使用 utils.js 的 `makeRing`, `gradeFrom`, `scoreBarColor`, `animateCount`
- **行數目標**：~200 行

### T3.2 監控 Tab
- **檔案**：新增 `~/.claude/scripts/flow/monitor.js`
- **內容**：
  - export `init()`, `update()` 函式
  - `update()` 從 `/api/errors`（hook-errors）, `/api/git`, `/api/sessions-summary` fetch
  - 錯誤聚類（top 5 錯誤 + 計數）
  - 7 日趨勢 sparkline
  - 雙 repo Git 活動（最近 5 個 commit 每 repo）
  - Session 列表（過濾 heartbeat，顯示使用者 session）
  - 使用 utils.js 的 `filterUserSessions`, `heartbeatSummaryHtml`, `relativeTime`, `clusterErrors`
- **行數目標**：~150 行

### T3.3 自主循環 Tab
- **檔案**：新增 `~/.claude/scripts/flow/loop.js`
- **內容**：
  - export `init()`, `update()` 函式
  - 心跳狀態卡片（運行中/執行中/停止）
  - 下次 Tick 倒數計時
  - Notion 待做顯示
  - 循環流程高亮（4 步驟）
  - 最近自驅成果列表
  - 統計面板
  - 資料來源：`/processes`（已有）+ `/api/notion-todo` + `/api/sessions-summary`
  - 3 秒自動 fetch + 1 秒倒數 tick
- **行數目標**：~200 行

---

## Phase 4：整合（sequential，依賴 Phase 3）

### T4.1 main.js 整合
- **檔案**：修改 `~/.claude/scripts/flow/main.js`
- **內容**：
  - import Quality, Monitor, Loop, Starfield 模組
  - `Starfield.init()` 在頁面載入時呼叫
  - Tab 切換邏輯加入品質/監控/自主循環的 update 呼叫
  - CMD_ACTIONS 新增 3 個 Tab 快捷鍵（6/7/8）
  - 鍵盤快捷鍵新增 6/7/8
  - Quality.init(), Monitor.init(), Loop.init() 在啟動時呼叫

### T4.2 系統 Tab 合併
- **檔案**：修改 `~/.claude/scripts/flow/system.js`
- **內容**：
  - 新增服務狀態區塊：從 `/api/llm`, `/api/daemons` 取得資料，渲染 5 行服務狀態（Nova Server/LLM/Maintainer/Judge/Hook Client）
  - 新增 Lock 管理區塊：從 `/api/locks` 取得，顯示活躍 lock + 清除按鈕
  - 新增操作按鈕區塊：重載模組（已有）、觸發 Maintainer、清除 Lock
  - 修改 HTML 骨架（在 T2.4 已預留）
  - 使用 utils.js 的 `parseDaemonStatus`, `filterActiveLocks`, `relativeTime`

### T4.3 日誌 Tab 日報功能
- **檔案**：修改 `~/.claude/scripts/flow/logs.js`
- **內容**：
  - 新增「生成日報」按鈕事件
  - 點擊後 fetch 所有需要的 API → 呼叫 `generateMeetingNotes()` + `generateDecisionSummary()`
  - 用 modal 或展開區塊顯示 Markdown 渲染結果
  - 使用 utils.js 的 `generateMeetingNotes`, `renderMarkdown`

---

## Phase 5：驗收（sequential，依賴 Phase 4）

### T5.1 API 驗收
- curl 測試所有 16 個新 API 路由
- 確認 /dispatch, /health, /events 等原有路由不受影響
- server.js `wc -l` ≤ 355

### T5.2 UI 驗收
- PinchTab 驗證：
  - 星空背景渲染正常
  - 7 個 Tab 可切換
  - 各 Tab 內容正確顯示
  - SSE 即時事件正常推送

### T5.3 測試驗收
- `bun test` 通過
- 無退化

---

## 並行/串行總結

| Phase | 模式 | 任務 | 預估 |
|:-----:|:----:|------|:----:|
| 1 | sequential | T1.1 → T1.2 | 基礎 |
| 2 | **parallel** | T2.1 + T2.2 + T2.3 + T2.4 | 視覺+工具 |
| 3 | **parallel** | T3.1 + T3.2 + T3.3 | Tab 實作 |
| 4 | sequential | T4.1 → T4.2 → T4.3 | 整合 |
| 5 | sequential | T5.1 → T5.2 → T5.3 | 驗收 |
