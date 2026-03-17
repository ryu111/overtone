# Dashboard G3 星空風格深度整合 — 技術設計

## 深度路由：D4
**理由**：跨 8+ 檔案（server + CSS + HTML + 5 個新 JS 模組 + API router），影響兩個 repo 的多個檔案，Phase 可並行。

---

## 技術摘要

- **方案**：API Router 模組化 + G3 視覺覆蓋 + 按 Tab 逐一遷移
- **理由**：server.js 有 350 行硬上限，16 個新 API 不可能塞進去；G3 覆蓋 3457 CSS 比合併兩套 CSS 更乾淨；按 Tab 遷移可並行且風險隔離
- **取捨**：接受 G3 星空 Canvas 的額外 GPU 開銷（約 3-5% CPU on idle）

## 方案比較

| 維度 | 方案 A：API Router 抽出 + CSS 覆蓋（選擇） | 方案 B：直接在 server.js 加路由 | 方案 C：3500 當 proxy 反向代理 3457 |
|------|:------------------------------------------:|:-------------------------------:|:----------------------------------:|
| 複雜度 | 中 — 新增 1 個 router 檔案 | 低 — 直接加 | 高 — 維護兩個 server + proxy |
| server.js 行數 | ≤ 350（+5 行 import + mount） | ~550（超限 200 行） | 不變（但維護雙 server） |
| 可維護性 | 高 — API 邏輯獨立於 server | 低 — server.js 變肥 | 低 — proxy 增加故障點 |
| 風險 | 低 — 不動 dispatch/SSE 核心 | 中 — 核心檔案膨脹 | 高 — 多一個服務要管 |
| **結論** | **選擇** | ❌ 超行數限制 | ❌ 違反「統一到 3457 port」 |

## 關鍵設計決策

### 決策 1：統一後 7 個 Tab

| # | Tab 名稱 | 來源 | 內容 |
|---|---------|------|------|
| 1 | 架構圖 | 3457 原有 | D3 力導向圖（不變） |
| 2 | 事件流 | 3457 原有 | Metro 地鐵圖（不變） |
| 3 | 事件記錄 | 3457 原有 | 即時事件列表（不變） |
| 4 | 品質 | 3500 品質 Tab | SVG Ring KPI + 評分排行 + 品質分布 + 改善建議 |
| 5 | 監控 | 3500 監控 Tab | 錯誤聚類 + 7 日趨勢 + Git 活動 + Session 列表 |
| 6 | 系統 | 3457 系統 + 3500 系統合併 | Memory 趨勢 + Heartbeat + 模組 + 服務狀態 + Lock + 操作按鈕 + Hook Errors |
| 7 | 自主循環 | 3500 自主循環 Tab | 心跳狀態 + Notion 待做 + 循環流程 + 成果日誌 + 統計 |

**去除的內容**：
- Script Top 5（行數頻繁變動，價值低）
- Gallery 選擇頁面 + nav-bar.js（整合後不需要）
- 評分系統（5 星風格/資料評分，Gallery 專用）
- 3500 的總覽 Tab（KPI Ring + 品質分布合併到品質 Tab，最近 Session 合併到監控 Tab）
- 會議記錄 Tab（合併到日誌 Tab，作為「日報」生成按鈕而非獨立 Tab）

**合併的內容**：
- 3457 系統面板 + 3500 系統面板 → 統一系統 Tab（3457 的 Memory 趨勢/模組/Anomalies + 3500 的服務狀態/Lock/操作按鈕）
- 日誌 Tab 增加「生成日報」按鈕，呼叫 generateMeetingNotes 產出 Markdown 報告

### 決策 2：server.js 擴展方式 — API Router 模組

新增 `~/.claude/scripts/flow/api-router.js`，將 3500 的所有 API 邏輯封裝為一個函式：

```javascript
// api-router.js
export function handleDashboardApi(pathname, req) {
  // 回傳 Response 或 null（null = 不匹配，交給 server.js 原有邏輯）
}
```

server.js 只需加 5 行：

```javascript
import { handleDashboardApi } from '...api-router.js';
// 在 fetch handler 中，/dispatch 等核心路由之後：
const dashResp = handleDashboardApi(url.pathname, req);
if (dashResp) return dashResp;
```

### 決策 3：CSS 合併策略 — G3 覆蓋

1. 保留 3457 的 `client.css`（1111 行）作為基底
2. 新增 `starfield.js` 模組（從 G3 抽取星空 Canvas + 星雲）
3. 修改 `client.css` 的 `body` 背景：移除 grid 背景，改為純黑 `#050510`
4. 用 CSS 變數統一色彩：`--accent: #818cf8` 等 G3 色調注入 3457

不合併 G3 的 308 行 CSS（都是 3500 專用的元件樣式），改為在新 Tab 的 JS 模組中用 inline 或 scoped style。

### 決策 4：data-layer.js 處理方式

**不搬遷整個 data-layer.js**。原因：
- 3457 已有 SSE + health polling，不需要 15 秒輪詢機制
- data-layer.js 的 `loadAllData()` 一次 fetch 16 個 API，在 3457 中各 Tab 按需 fetch 更高效

**搬遷的部分**：
- 工具函式（`filterUserSessions`、`relativeTime`、`parseDaemonStatus`、`filterActiveLocks`、`gradeColor`、`generateMeetingNotes`、`generateDecisionSummary`）→ 新增 `utils.js` 模組
- 各 Tab 的 render 函式 → 搬進對應的 Tab JS 模組

### 決策 5：會議記錄 → 日誌 Tab 按鈕

不保留獨立的會議記錄 Tab。原因：
- 會議記錄本質是「當日摘要報告」，與日誌 Tab 高度重疊
- 改為在日誌 Tab 加一個「生成日報」按鈕，點擊後呼叫 `generateMeetingNotes()`，在 modal 中顯示 Markdown 渲染結果

## 模組介面

### 新增檔案

| # | 檔案 | 位置 | 行數 | 用途 |
|---|------|------|------|------|
| 1 | api-router.js | `~/.claude/scripts/flow/` | ~250 | 3500 API 路由（scores/behaviors/git/locks/llm/daemons/components/system/actions/notion-todo/improvements/decisions） |
| 2 | starfield.js | `~/.claude/scripts/flow/` | ~100 | G3 星空 Canvas（3 層視差 + 流星 + 星雲 CSS 注入） |
| 3 | quality.js | `~/.claude/scripts/flow/` | ~200 | 品質 Tab：SVG Ring KPI + 評分排行 + 品質分布 + 改善建議 |
| 4 | monitor.js | `~/.claude/scripts/flow/` | ~150 | 監控 Tab：錯誤聚類 + 7 日趨勢 sparkline + Git 活動 + Session 列表 |
| 5 | loop.js | `~/.claude/scripts/flow/` | ~200 | 自主循環 Tab：心跳卡片 + Notion 任務 + 循環流程 + 成果日誌 + 統計 |
| 6 | utils.js | `~/.claude/scripts/flow/` | ~120 | 共用工具函式（從 data-layer.js 遷移） |

### 修改檔案

| # | 檔案 | 變更內容 |
|---|------|---------|
| 1 | `~/.claude/hooks/server.js` | +5 行：import api-router + 在 fetch handler 中串接 |
| 2 | `~/.claude/scripts/flow/client.html` | 新增 3 個 Tab（品質/監控/自主循環）的 HTML 骨架 + 星空 Canvas 元素 + 新 JS 模組 import |
| 3 | `~/.claude/scripts/flow/client.css` | body 背景改為 #050510 + Tab/panel 增加 G3 色調變數 + 新 Tab 的 CSS |
| 4 | `~/.claude/scripts/flow/main.js` | import 新模組 + Tab 切換邏輯擴展 + 新 API fetch 函式 |
| 5 | `~/.claude/scripts/flow/system.js` | 合併 3500 的服務狀態、Lock 管理、操作按鈕 |
| 6 | `~/.claude/scripts/flow/logs.js` | 新增「生成日報」按鈕 + generateMeetingNotes 整合 |

### 靜態資源白名單更新

server.js 的 `FLOW_STATIC` 需新增：
```javascript
'starfield.js': 'application/javascript; charset=utf-8',
'quality.js': 'application/javascript; charset=utf-8',
'monitor.js': 'application/javascript; charset=utf-8',
'loop.js': 'application/javascript; charset=utf-8',
'utils.js': 'application/javascript; charset=utf-8',
```

## 執行步驟

### Phase 1：基礎設施（sequential）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 1a | api-router.js | 從 3500 server.js 搬遷所有 API 處理邏輯 |
| 1b | server.js | 加 5 行串接 api-router + 更新 FLOW_STATIC 白名單 |

### Phase 2：視覺層 + 工具層（parallel，依賴 Phase 1）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 2a | starfield.js | 從 G3 抽取星空 Canvas 動畫 + 星雲 CSS |
| 2b | utils.js | 從 data-layer.js 搬遷工具函式 |
| 2c | client.css | body 背景改為 G3 風格 + CSS 變數 + 新 Tab CSS |
| 2d | client.html | 加星空 Canvas 元素 + 3 個新 Tab 骨架 + 新 JS import |

### Phase 3：Tab 實作（parallel，依賴 Phase 2）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 3a | quality.js | 品質 Tab 完整實作（Ring KPI + 評分表 + 分布圖 + 改善建議） |
| 3b | monitor.js | 監控 Tab 完整實作（錯誤聚類 + sparkline + Git + Session） |
| 3c | loop.js | 自主循環 Tab 完整實作（心跳 + Notion + 成果 + 統計） |

### Phase 4：整合 + 合併現有 Tab（sequential，依賴 Phase 3）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 4a | main.js | import 所有新模組 + Tab 切換邏輯 + init 呼叫 |
| 4b | system.js | 合併 3500 的服務狀態/Lock/操作按鈕到現有系統 Tab |
| 4c | logs.js | 加「生成日報」按鈕 + generateMeetingNotes |

### Phase 5：驗收（sequential，依賴 Phase 4）

| 步驟 | 說明 |
|------|------|
| 5a | 用 curl 驗證所有新 API 路由回傳正確 |
| 5b | PinchTab text 驗證 7 個 Tab 的關鍵內容 |
| 5c | `bun test` 確認無退化 |

## Pre-mortem

| # | 失敗情境 | 機率 | 影響 | 預防措施 |
|---|---------|:----:|:----:|---------|
| 1 | api-router.js 中 execSync（git log）阻塞 server 主線程，導致 hook dispatch 延遲 | 中 | 高 | 搬遷時將 execSync 改為 Bun.spawn + await，或加 AbortSignal.timeout(3000) |
| 2 | CSS 衝突：G3 的 `.panel` 和 3457 的 `.panel` class 撞名 | 中 | 中 | 3457 已用 `.panel` 但樣式相容；G3 特有樣式用 `.g3-panel` prefix 或直接覆蓋 |
| 3 | 星空 Canvas 的 requestAnimationFrame 與 D3 force simulation 競爭 CPU | 低 | 中 | Canvas 在非活動 Tab 時暫停動畫（用 `document.hidden` API） |
| 4 | FLOW_STATIC 白名單遺漏新檔案 → 404 | 高 | 高 | 在 Phase 1b 一次加完所有 5 個新檔案名 |
| 5 | 3500 的 `/api/sessions` 和 3457 的 `/api/sessions` 路由衝突 | 高 | 高 | 新路由命名為 `/api/sessions-summary` 避免衝突 |

## 測試策略

| 測試檔案 | 驗收條件 |
|---------|---------|
| curl /api/scores | 回傳 JSON array，status 200 |
| curl /api/git | 回傳 `{nova: [...], overtone: [...]}` |
| curl /api/components | 回傳 `{rules, skills, agents, hooks}` 皆為數字 |
| curl /api/llm | 回傳 `{status: "online"|"offline"}` |
| PinchTab text | 頁面包含「品質」「監控」「自主循環」Tab 文字 |
| PinchTab snap -i | 7 個 Tab 按鈕可互動 |
| bun test | 0 fail（無退化） |
| server.js wc -l | ≤ 355 行 |

## 不做什麼

1. **不做響應式設計**：Dashboard 主要在桌面使用，行動裝置適配留到後續
2. **不做 3500 刪除**：整合完成後手動確認再決定是否刪除 3500 server + dashboard 目錄
3. **不做新功能**：只做遷移整合，不在此次加入新圖表或新資料來源
4. **不做 SSE 擴展**：新 Tab 的資料用 fetch polling（按需），不擴展 SSE 事件類型
5. **不做日誌 Tab 重寫**：日誌 Tab 只加一個「生成日報」按鈕，不改現有日誌結構
