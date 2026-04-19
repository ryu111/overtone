# Dashboard G3 星空風格深度整合

## 動機（Why）

- **問題**：目前有兩個獨立的 Dashboard（port 3457 Nova 控制中心 + port 3500 Nova Dashboard），功能重疊（系統面板、session 列表、服務狀態）、視覺不統一（3457 暗色格線 vs 3500 星空背景）、資料層分離（各自 fetch 不同 API）。使用者需要在兩個頁面之間切換。
- **目標**：統一為單一 Dashboard 在 port 3457，保留 G3 星空視覺風格，合併兩者精華功能，去除冗餘資訊。
- **不做的代價**：持續維護兩套 server + 兩套前端 + 兩套 API，認知負擔高。3500 的分析功能（品質評分、改善建議、會議記錄、自主循環）無法與 3457 的即時能力（SSE、Metro 圖、架構圖）結合。

## 範圍

### In-scope

- 將 3500 的 6 個 API 組搬入 3457 server.js（透過 API router 模組化）
- 將 G3 星空 Canvas（3 層視差 + 流星 + 星雲）融入 3457 的 CSS 架構
- 合併兩者 Tab 為統一的 7 個 Tab
- 搬遷 data-layer.js 工具函式到 3457 前端
- 搬遷會議記錄生成器（generateMeetingNotes）
- 搬遷自主循環 Tab 功能
- 去除冗餘功能（Script Top 5、Gallery 導航、評分系統、nav-bar.js）

### Out-of-scope

- 3500 server.js 的刪除（完成後手動確認再刪）
- 新增功能（只做遷移整合，不加新東西）
- 3457 的 hook dispatch、SSE、graceful restart 邏輯修改
- 行動裝置響應式設計優化

## 使用者故事

身為 Nova 開發者，我想要在單一 Dashboard（port 3457）看到所有系統資訊——即時事件流、架構圖、品質評分、自主循環狀態——以便不需要在兩個頁面之間切換。

身為自主代理（heartbeat），我想要 Dashboard 即時反映我的執行狀態和成果，以便開發者可以監控我的自主循環。

## 行為規格

### 正常路徑

1. 使用者開啟 `http://localhost:3457` → 看到 G3 星空背景 + 7 個 Tab
2. 切換 Tab → 各 Tab 內容即時渲染，SSE 事件持續推送
3. 品質/監控 Tab 的資料 → 從 3457 server 的新 API 路由取得（原 3500 的資料來源）
4. 自主循環 Tab → 顯示心跳狀態、Notion 待做、成果日誌（與原 3500 相同）

### 錯誤路徑

| 錯誤情境 | 預期行為 |
|---------|---------|
| 新 API 回傳失敗 | 各 Tab 顯示「資料不可用」空狀態，不影響其他 Tab |
| LLM 離線 | 系統 Tab 服務狀態顯示離線，其餘功能正常 |
| Notion API 逾時 | 自主循環 Tab 用快取資料，不阻塞頁面 |

### 邊界條件

- 無評分資料 → 品質 Tab 顯示空狀態
- 無 session 記錄 → 監控 Tab 顯示空狀態
- server.js 超過行數限制 → API 路由已抽到獨立模組，server.js 不膨脹

## 資料模型

### 輸入

N/A — 純前端整合 + API 路由搬遷，不新增資料格式。

### 輸出

N/A — 所有 API 回傳格式與 3500 相同，僅搬遷位置。

### 儲存

- 所有 JSONL 檔案位置不變（`~/.claude/data/*.jsonl`、`/tmp/*.jsonl`）
- 無新增儲存

## 介面契約

### 新增到 3457 的 API 路由（搬自 3500）

| 路由 | 方法 | 回傳 | 說明 |
|------|------|------|------|
| `/api/scores` | GET | `Score[]` | 評分記錄 |
| `/api/behaviors` | GET | `Behavior[]` | 行為觀察 |
| `/api/improvements` | GET | `Improvement[]` | 改善建議 |
| `/api/sessions-summary` | GET | `SessionSummary[]` | session 摘要（原 3500 的 /api/sessions） |
| `/api/scripts` | GET | `Script[]` | 腳本清單 |
| `/api/components` | GET | `{rules, skills, agents, hooks}` | 元件計數 |
| `/api/git` | GET | `{nova: Commit[], nova-brain: Commit[]}` | 雙 repo commits |
| `/api/locks` | GET | `Lock[]` | Lockfile 狀態 |
| `/api/daemons` | GET | `{maintainer, judge, learner}` | daemon 日誌 |
| `/api/llm` | GET | `{status, model}` | LLM 健康 |
| `/api/notion-todo` | GET | `{count, top}` | Notion 待做 |
| `/api/system` | GET | `{memory, orphans, novaProcesses}` | 系統資源 |
| `/api/decisions` | GET | `Decision[]` | 決策日誌 |
| `/api/actions/clear-locks` | POST | `{cleared}` | 清除過期 Lock |
| `/api/actions/trigger-maintainer` | POST | `{triggered}` | 觸發 Maintainer |

注意：3457 已有的 `/api/sessions`（session index by sid）和 3500 的 `/api/sessions`（session summaries from JSONL）功能不同。新路由用 `/api/sessions-summary` 避免衝突。

## 非功能需求

| 維度 | 要求 |
|------|------|
| 效能 | API 回應 < 500ms，星空 Canvas < 16ms/frame（60fps） |
| 行數 | server.js 維持 ≤ 350 行（API 路由抽到獨立模組） |
| 相容性 | 不破壞現有 hook-client → /dispatch 流程 |

## 依賴

| 方向 | 模組 | 說明 |
|------|------|------|
| 上游 | `~/.claude/hooks/server.js` (349 行) | 核心 server，需要加載新的 API router |
| 上游 | `~/.claude/scripts/flow/*.js` (8 檔) | 現有前端模組 |
| 上游 | `~/projects/nova-brain/dashboard/` (4 檔) | 遷移來源 |
| 下游 | hook-client.js | 不受影響（/dispatch 路由不變） |

## 驗收標準

- [ ] `http://localhost:3457` 顯示 G3 星空背景（3 層視差星星 + 流星 + 星雲）
- [ ] 7 個 Tab 全部可切換且功能正常
- [ ] 原 3457 的 5 個 Tab（架構圖、事件流、事件記錄、系統、日誌）功能不退化
- [ ] 品質 Tab 顯示評分排行表 + 改善建議
- [ ] 監控 Tab 顯示錯誤聚類 + Git 活動 + Session 列表
- [ ] 自主循環 Tab 顯示心跳狀態 + Notion 待做 + 成果日誌
- [ ] server.js ≤ 350 行（API 路由在獨立模組）
- [ ] 所有新 API 路由回傳正確資料（用 curl 驗證）
- [ ] SSE 即時事件推送正常（切換 Tab 後事件仍在推送）
- [ ] `bun test` 通過（無退化）

## 風險

| 風險 | 機率 | 影響 | 緩解策略 |
|------|:----:|:----:|---------|
| server.js 超過 350 行 | 中 | 中 | API router 抽到獨立模組 `api-router.js` |
| CSS 衝突（G3 vs 3457 選擇器名稱重複） | 中 | 低 | G3 CSS 用 scoped class prefix `.g3-*` 或覆蓋 3457 根變數 |
| 3500 API 中 execSync 阻塞 server | 低 | 高 | 搬遷時將 execSync 改為 Bun.spawn 非同步 |
| 星空 Canvas 影響 SVG 圖表效能 | 低 | 中 | Canvas 設 `pointer-events: none` + `z-index: 0`，不影響上層互動 |
