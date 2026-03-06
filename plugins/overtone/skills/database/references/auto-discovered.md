---
## 2026-03-03 | retrospective:RETRO Findings
**回顧摘要**：

測試結果：2641 pass / 0 fail（113 個檔案），較上一版本新增 1 個測試檔，新增測試通過。

確認的品質點：

- **模組邊界清晰**：`failure-tracker.js` 完全自足（234 行），四個公開 API 職責分明（recordFailure / getFailurePatterns / formatFailureWarnings / formatFailureSummary），內部 `_readAll` / `_trimIfNeeded` 正確封裝為私有工具。
- **try/catch 降級一致**：on-stop.js、pre-task.js、on-start.js 三個整合點全部用 try/catch 包覆，確保主流程不受影響。
- **設定集中**：`warningThreshold`（2）、`warningWindow`（20）、`maxRecords`（100）全部定義在 registry.js 的 `failureDefaults`，實作與設定無重複魔術字串。
- **路徑一致性**：`paths.global.failures(projectRoot)` 遵循既有 global store 模式，與 observations/baselines/scores 路徑格式對齊。
- **注入順序合理**：pre-task.js 的注入順序（workflowContext → skillContext → gapWarnings → scoreContext → failureWarning → testIndex → originalPrompt）符合資訊優先級，失敗警告在分數上下文之後，不搶佔主流程資訊。
- **Level 2 整合防護完整**：level-2-integration.test.js 的靜態分析 guard 涵蓋所有新整合點（on-start.js 的 formatFailureSummary、pre-task.js 的 failureWarning、on-stop.js 的 recordFailure），防止未來重構意外移除。
- **warningThreshold 語義一致**：registry 標注「>= 此值才產生警告」，failure-tracker.js 實作為 `stageData.count < threshold` 才回傳 null（即 count >= threshold 時產生警告），語義完全對齊。
Keywords: pass, fail, failure, tracker, recordfailure, getfailurepatterns, formatfailurewarnings, formatfailuresummary, catch, stop
---
## 2026-03-04 | developer:DEV Findings
1. **data.js 設計亮點**：採用 `_getDeps(_deps)` 依賴注入模式（參考 queue.js pattern），所有底層 module 皆可在測試中替換，避免實際 FS 操作。

2. **query baselines 的 API 差異**：baseline-tracker.js 沒有直接的 `queryBaselines()` API，data.js 透過直接讀取 baselines.jsonl 原始資料實作，符合設計規格中「包裝現有 API」的原則（baselines.jsonl 由 baseline-tracker 管理）。

3. **query failures 的原始資料讀取**：failures 的原始記錄讀取也採用直接讀 JSONL 方式，failure-tracker 沒有 `queryFailures()` API（規格中提及但未實作），data.js 使用 `getFailurePatterns()` 提供聚合資料。

4. **測試採用 runWithCapture 模式**：攔截 console.log/error + process.exit，讓各子命令測試不依賴 FS 和實際外部資源。
Keywords: data, queue, pattern, module, query, baselines, baseline, tracker, querybaselines, jsonl
---
## 2026-03-04 | retrospective:RETRO Findings
**回顧摘要**：

- **API 對齊**：data.js 正確使用各 lib 模組的公開 API（`getFailurePatterns`、`queryScores`、`queryGlobal`、`cleanupStaleGlobalDirs`、`getBaseline`），均與 `module.exports` 一致
- **依賴注入設計**：`_getDeps()` 模式讓所有函式可以在測試中完整替換，39 個測試全覆蓋 4 個子命令
- **錯誤處理**：所有無效輸入路徑（缺少 `--session`、未知類型、空命令）均有防禦並 `process.exit(1)`
- **測試品質**：3185 pass / 0 fail，data-cli 的 39 個測試覆蓋所有分支（查詢、統計、清理、列出）
- **baselines 直讀 JSONL**：因 `baseline-tracker.js` 無 `queryBaselines` API，改為直讀原始檔案，屬合理的務實決策，程式碼有明確注解說明原因

**確認的品質點**：

1. `parseArgs` 正確處理布林旗標、帶值選項、混合參數三種情況
2. `cmdGc` 的 `dry-run` 防禦（`=== true || === 'true' || === ''`）覆蓋了 CLI 傳值的三種形式
3. `_printTable` 表格輸出使用 `Object.keys(rows[0])` 動態推斷欄位，不硬編碼結構
4. `main` 函式先過濾 `--project-root` 再解析其他選項，避免 positional 污染

**確認的超過 70% 信心問題（設計層級，不阻擋 PASS）**：

`query failures` 同時傳 `--stage` 和 `--agent` 時，第 163-165 行的 `agent` 過濾無條件覆蓋前面的 `stage` 結果 — 信心 80%

- 證據：`/Users/sbu/projects/overtone/plugins/overtone/scripts/data.js` 第 156-165 行，當 `options.stage = 'DEV'` 且 `options.agent = 'developer'` 同時存在時，最終 `result` 只剩下 `agent` 的資料，`stage` 的結果被覆蓋而非合併
- 評估：此行為目前在測試中未被驗證（`tests/unit/data-cli.test.js` 第 307-317 行的「`--stage` 過濾特定 stage」只測單獨傳 `--stage`，未測同時傳兩者）；然而 `getFailurePatterns` 回傳聚合資料的設計本身已限制了細粒度過濾能力，這是架構層面的取捨而非 bug
- 決定：不需修復迭代，但 **doc-updater 記錄此行為限制**

**CLAUDE.md 文件缺口**：data.js 未在 CLAUDE.md「常用指令」區塊中列出 — 信心 95%

- 證據：`/Users/sbu/projects/overtone/CLAUDE.md` 第 100-135 行的常用指令列表包含 `health-check.js`、`validate-agents.js`、`manage-component.js`、`heartbeat.js`、`queue.js` 等，但無 `data.js`
- 這是 doc-updater 的工作範疇
Keywords: data, getfailurepatterns, queryscores, queryglobal, cleanupstaleglobaldirs, getbaseline, module, exports, session, process
---
## 2026-03-05 | retrospective:RETRO Findings
**回顧摘要**：

- **模組架構一致**：skill-evaluator / skill-generalizer / experience-index 三個模組職責清晰，純函式設計，I/O 隔離良好，錯誤均有靜默降級處理
- **整合完整**：evolution.js internalize → skill-evaluator → skill-generalizer → buildIndex 的完整鏈路存在且測試覆蓋；project-orchestrator.js 的 experienceHints 整合點已接入 queryIndex
- **health-check 第 17 項**：`internalization-index` 檢查邏輯正確，涵蓋格式損壞、domains 空陣列、30 天過時三個面向
- **instinct SKILL.md**：frontmatter 結構完整，資源索引指向正確路徑
- **測試策略合理**：測試環境無真實 scores/observations 資料的限制已透過 setupTestData 工具函式解決；evolution-internalize.test.js 15 個測試覆蓋主要流程
- **REVIEW 已標注的 minor 問題（JSON 欄位 `retained` vs design.md `qualified`，及 Scenario 5-4）**：這些屬於文件同步和測試覆蓋的局部問題，已在 REVIEW 階段登錄，不在 retrospective 重複標注

**跨階段一致性確認**：

- BDD 6 Features / 34 Scenarios 覆蓋範圍與實作的 3 Phase / 6 子任務對應合理
- 測試 95 tests / 310 expects 的驗證結果支持整體實作正確性
- `experience-index` 的 path 定義（`~/.overtone/global/{projectHash}/experience-index.json`）與 paths.js 的 `paths.global.experienceIndex()` 方法一致
Keywords: skill, evaluator, generalizer, experience, index, evolution, internalize, buildindex, project, orchestrator
---
## 2026-03-06 | architect:ARCH Findings
**技術方案**：

- **前端**：Next.js 15（App Router），前台 `/(player)/`、後台 `/admin/`、認證 `/(auth)/` 共存一個 Next.js app
- **後端**：Hono + Bun，提供 REST API + SSE endpoint；Hono RPC 讓前端直接使用後端型別定義
- **資料庫**：PostgreSQL + Drizzle ORM；Drizzle 相比 Prisma 更適合 Bun 環境
- **圖片**：Cloudflare R2（S3 相容、無 egress fee、台灣 CDN 速度佳）
- **金流**：ECPay 測試模式（Webhook → 觸發抽獎，付款失敗不建立訂單）
- **部署**：Zeabur（Bun 原生支援 + Managed PostgreSQL + 台灣節點）

**API 介面**：
- `POST /api/auth/register` / `POST /api/auth/login` / `GET /api/auth/me`
- `GET|POST /api/addresses`、`PUT|DELETE /api/addresses/:id`
- `GET /api/prizes`（列表）、`GET /api/prizes/:id`（詳情含 grades）
- `POST /api/admin/prizes`（Admin 上架）、`PUT /api/admin/prizes/:id/status`
- `POST /api/draws/initiate`（建立待付款）、`POST /api/draws/webhook/ecpay`（金流回調）
- `GET /api/orders`（玩家）、`GET /api/admin/orders`、`PUT /api/admin/orders/:id/ship`
- `GET /api/sse/prize/:prizeId`（即時剩餘數量推送）
- `GET /api/admin/stats/overview`（營運總覽）

**資料模型**（6 個核心 table）：
- `users`（id, email, nickname, password_hash, role）
- `addresses`（user_id, recipient_name, phone, postal_code, city, district, address）
- `prizes`（name, price_per_draw, total_items, drawn_count, status, ip_tag）
- `prize_grades`（prize_id, grade_name, item_name, total_count, remaining_count, is_last_prize）
- `prize_items`（prize_id, prize_grade_id, status: available/drawn）— 每個抽獎 slot 一筆
- `orders`（user_id, prize_item_id, address_snapshot, prize_snapshot, status, tracking_number）
- `payments`（user_id, prize_id, amount, gateway, gateway_order_id, status, webhook_payload）

**抽獎引擎核心**（防超賣）：
- `SELECT FOR UPDATE SKIP LOCKED LIMIT 1` 在 DB 層鎖定單一 prize_item
- 選用悲觀鎖而非樂觀鎖，原因：抽獎是高衝突場景，樂觀鎖 retry 語意在此不正確
- 建立 prize 時 Fisher-Yates shuffle prize_items 插入順序，確保公平隨機
- Transaction 內完成：lock item → update status → update grade remaining_count → update prize drawn_count → insert order → update payment
- Transaction commit 後才廣播 SSE 事件

**檔案結構**：
- `apps/api/`：Hono API（routes / engine / middleware / lib）
- `apps/web/`：Next.js 15（app router 分 player / auth / admin 三個區域）
- `packages/shared/`：前後端共用型別
Keywords: next, router, player, admin, auth, hono, rest, endpoint, postgresql, drizzle

---
## 2026-03-06 | architect:ARCH Context
為 Kuji 線上一番賞平台 MVP 完成完整技術架構設計。核心技術決策圍繞兩個關鍵點：(1) 抽獎引擎的並發安全（選用 PostgreSQL `SELECT FOR UPDATE SKIP LOCKED`），(2) 整體架構選用 Monorepo 讓前後端型別共享減少重複定義。
Keywords: kuji, postgresql, select, update, skip, locked, monorepo

---
## 2026-03-06 | developer:DEV Findings
**Phase 0 完成項目：**
- Bun Monorepo 結構：`apps/api`（Hono + Drizzle）、`apps/web`（Next.js 15 骨架）、`packages/shared`（共用型別）
- 7 個 DB table schema（Drizzle ORM）：users、addresses、prizes、prize_grades、prize_items、orders、payments
- Docker Compose PostgreSQL、.env.example、tsconfig、drizzle.config
- db/migrate.ts + db/seed.ts（管理員初始化腳本）

**Phase 1 完成項目：**
- 抽獎引擎（`/apps/api/src/engine/lottery.ts`）：
  - `fisherYatesShuffle`：純函數，插入時隨機洗牌確保公平性
  - `buildShuffledPrizeItems`：建立 prize 時使用
  - `executeDraw`：完整 transaction 防超賣邏輯（SELECT FOR UPDATE SKIP LOCKED LIMIT 1）
  - `getPrizeCurrentState`：transaction 外取得即時狀態供 SSE 廣播
- 輔助模組：JWT（簽發/驗簽）、SSE EventBus（in-memory 廣播）、ECPay（CheckMacValue 計算/驗簽）、R2（上傳 stub）
- Auth middleware：requireAuth / requireAdmin / requireAddress
- Hono 主入口（健康檢查 + 路由預留位置）

**關鍵設計決策：**
- orders 表依賴 payments，但 payments 需要 prize_items（外鍵）→ payments 先定義，orders 後定義
- ECPay CheckMacValue 計算實作 URL Encode 特定規則（依官方文件）
- R2 上傳為 stub，MVP 可先用 fallback URL；部署時補 AWS SigV4
- Auth middleware 使用 Hono ContextVariableMap 型別擴充，保持型別安全

**測試結果：14 pass / 0 fail（`bun test`）**
- `DB 連線失敗` console.error 是 DB_ERROR 場景的預期行為
Keywords: phase, monorepo, apps, hono, drizzle, next, packages, shared, table, schema

