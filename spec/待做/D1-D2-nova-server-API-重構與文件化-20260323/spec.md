# nova-server API 重構與文件化

## 動機（Why）

- **問題**：nova-server 有 40+ 個 API 端點散落在 server.js 和 api-router.js，沒有文件。nova-control（macOS + iOS）開發者只能讀源碼猜 API 契約。內部端點（dispatch、modules/reload）和對外端點混在一起，server.js 行數逼近 360 行上限。iOS 版已在呼叫 2 個後端尚未實作的端點（`/api/heartbeat/toggle`、`/api/terminal/interrupt`）。
- **目標**：(1) 分類 Internal/Public 端點 (2) Public API 統一歸口 api-router.js (3) 產出 API 參考文件供 nova-control 開發者使用 (4) 補齊缺失端點、去重
- **不做的代價**：nova-control 每新增功能都要讀後端源碼；server.js 繼續膨脹最終超標；iOS 版 2 個端點永遠 404

## 範圍

### In-scope

- 盤點全部 40+ 端點，標記消費者和分類（Internal / Public-Read / Public-Write）
- 產出完整 API 參考文件（Markdown），放在 nova-control 和 overtone 都能讀取的位置
- 從 server.js 遷移 6 個 Public 端點到 api-router.js（hook-errors、daily-logs、graph、config、sessions、sessions/:id/events）
- server.js 瘦身至只保留 Internal 端點 + 路由轉發
- 合併重複端點：/api/sessions-summary 和 /api/sessions
- 補齊 iOS 缺失端點：/api/heartbeat/toggle、/api/terminal/interrupt

### Out-of-scope

- OpenAPI/Swagger 自動化（目前消費者只有 3 個，Markdown 足夠）
- API 版本化（v1/v2 prefix）——目前規模不需要
- 認證機制變更（現有 Bearer token + 本機免驗已足夠）
- REST 風格統一改造（如 DELETE /api/projects/:name）——破壞現有客戶端

## 使用者故事

1. 身為 **nova-control 開發者（macOS/iOS）**，我想要一份完整的 API 參考文件，以便不讀後端源碼就能正確呼叫端點。
2. 身為 **nova-server 維護者**，我想要 Internal 和 Public 端點明確分離，以便 server.js 行數可控且職責清晰。
3. 身為 **未來遠端控制消費者（Telegram bot、手機 app）**，我想要統一的 Public API 入口，以便接入時只需讀一份文件。

## 行為規格

### 正常路徑

1. 所有 `/api/*` 請求 → server.js 檢查 auth → 轉發給 api-router.js
2. Internal 端點（`/dispatch`、`/agent/status`、`/modules/reload`）→ server.js 直接處理
3. 基礎設施端點（`/health`、`/events`、`/processes/*`、`/`、`/flow/*`）→ server.js 直接處理

### 錯誤路徑

| 錯誤情境 | 預期行為 |
|---------|---------|
| 非本機 + 無 token 存取 /api/* | 401 Unauthorized |
| 呼叫不存在的端點 | 404 Not Found |
| POST 缺必填欄位 | 400 Bad Request + 具體錯誤訊息 |
| server 內部錯誤 | 500 + { error: "message" } |

### 邊界條件

- /api/sessions-summary 合併入 /api/sessions 後，舊路徑 301 redirect 或保留 alias
- /api/heartbeat/toggle 和 /api/terminal/interrupt 為新增端點，需實作

## 資料模型

### 輸入

N/A — 本次重構不改變資料模型，只重組路由和補充文件。

### 輸出

| 產出 | 格式 | 位置 |
|------|------|------|
| API 參考文件 | Markdown | `~/.claude/docs/api-reference.md`（nova repo SoT） |
| API 參考副本 | Symlink 或複製 | `~/projects/nova-control/docs/api-reference.md` |

### 儲存

無新增儲存。

## 介面契約

完整契約見 api-reference.md（本 spec 的主要產出）。

端點分類摘要：

| 分類 | 端點數 | 所在檔案 | 消費者 |
|------|:------:|---------|--------|
| Internal | 3 | server.js | hook-client |
| Infrastructure | 7 | server.js | Dashboard / 管理用 |
| Public-Read | 17 | api-router.js | Dashboard / Control App |
| Public-Write | 10 | api-router.js | Dashboard / Control App |
| **合計** | **37** | | |

## 非功能需求

| 維度 | 要求 |
|------|------|
| 效能 | 遷移後延遲不增加（api-router 已是同進程 import，無額外開銷） |
| 相容性 | 現有 Dashboard JS、nova-control macOS/iOS 不需改碼即可運作 |
| 安全 | /api/* 的 auth 機制保持不變（本機免驗 + 遠端 Bearer token） |

## 依賴

| 方向 | 模組 | 說明 |
|------|------|------|
| 上游 | server.js | 路由入口 + auth 中間層 |
| 上游 | api-router.js | 已有 Public API 處理 |
| 下游 | nova-control (macOS) | NovaAPIClient.swift 消費 API |
| 下游 | nova-control (iOS) | IOSViewModel.swift 消費 API |
| 下游 | Dashboard (瀏覽器) | flow/*.js 消費 API |

## 驗收標準

- [ ] server.js 行數 <= 200（從 359 降至約 180）
- [ ] api-router.js 處理所有 `/api/*` 路由
- [ ] `api-reference.md` 涵蓋全部 37 個端點（Method + Path + Request/Response schema + curl 範例 + 消費者標記）
- [ ] 現有 `bun test` 全數通過（無回歸）
- [ ] Dashboard 所有 tab 功能正常（PinchTab text 驗證）
- [ ] nova-control macOS 所有功能正常（手動驗證）
- [ ] /api/heartbeat/toggle 和 /api/terminal/interrupt 實作完成

## 風險

| 風險 | 機率 | 影響 | 緩解策略 |
|------|:----:|:----:|---------|
| 遷移過程中遺漏端點 | 低 | 高 | 逐端點遷移 + grep 確認無殘留 |
| api-router.js 取得不到 server.js 的內部狀態（如 handlerMap、activeAgents） | 中 | 中 | 透過函式參數或 context 物件傳遞，不用 global |
| /api/sessions-summary alias 遺漏更新 Dashboard | 低 | 低 | 保留 alias 轉發，不立即刪除 |
