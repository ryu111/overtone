# Proposal: dashboard-duplicate-spawn-fix

## 功能名稱

`dashboard-duplicate-spawn-fix`（kebab-case，與 specs/features/in-progress/ 目錄名一致）

## 需求背景（Why）

- **問題**：Dashboard 在開發過程中會重複開啟多個 server 進程和瀏覽器分頁。根因有 6 個，核心是 spawn 與 PID 寫入之間有 ~500ms-2s 的空窗期（R1）、isRunning() 只靠 PID 檔案無法偵測 port 已被佔用（R2）、以及 `OVERTONE_NO_DASHBOARD` 環境變數完全未實作（R5）。
- **目標**：確保任何時刻只有一個 Dashboard server 存活；測試環境能可靠地跳過 Dashboard 邏輯；port 衝突時 graceful 處理而非 crash。
- **優先級**：高 -- 影響日常開發體驗，每次重開 session 都可能觸發重複 spawn。

## 使用者故事

```
身為 Overtone 使用者
我想要 Dashboard 不會重複啟動多個 server 和瀏覽器分頁
以便 開發體驗流暢且不需手動殺進程
```

```
身為 Overtone 測試開發者
我想要 OVERTONE_NO_DASHBOARD=1 環境變數能完全跳過 Dashboard spawn
以便 測試不受 Dashboard 進程干擾
```

## 範圍邊界

### 在範圍內（In Scope）

- pid.js: isRunning() 增加 HTTP port probe fallback（R2 修復）
- on-start.js: spawn 前增加 port probe（R1 部分緩解）
- on-start.js: 增加 OVERTONE_NO_DASHBOARD 環境變數檢查（R5 修復）
- server.js: port 衝突時 graceful 處理，不 crash（R4 修復）
- on-start.js: 移除自動開瀏覽器，改 banner 提示 URL（R3 修復）
- pid.js: 啟動中 lock 狀態，縮小 race window（R1 進一步緩解）
- 對應的單元測試和整合測試

### 不在範圍內（Out of Scope）

- PID reuse 進階防護（R6，低優先級，process.kill(pid,0) 足夠實用）
- Dashboard 多 instance 支援（不需要，單 server 即可服務所有 session）
- 分散式 lock（file lock / advisory lock），過度工程
- 改變 server.js 的整體架構（只做 port 衝突保護）

## 子任務清單

### 階段 1：基礎修復（序列執行）

1. **pid.js: isRunning() 增加 HTTP port probe fallback**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/dashboard/pid.js`
   - 說明：當 PID 檔案不存在或 PID 進程不存在時，額外嘗試 HTTP GET `http://localhost:{port}/health` 作為 fallback 偵測。如果 port 上有 Overtone server 在跑（health 回應 ok），回傳 true。需要注意 on-start.js 的 shebang 是 `#!/usr/bin/env node`（不是 bun），所以 pid.js 中使用的 API 需要 Node 相容（http.get 或 fetch）。isRunning() 需要新增 port 參數或從環境變數讀取。
   - 依賴：無

2. **on-start.js: 增加 OVERTONE_NO_DASHBOARD 檢查**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/hooks/scripts/session/on-start.js`
   - 說明：在 Dashboard spawn 區塊開頭加入 `if (process.env.OVERTONE_NO_DASHBOARD)` 的 early return，跳過整個 Dashboard spawn + 瀏覽器開啟邏輯。banner 仍然正常顯示。這是最簡單但影響最大的修復 -- 解決 R5，讓所有測試都能可靠地跳過 Dashboard。
   - 依賴：無

3. **server.js: port 衝突 graceful 處理**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/server.js`
   - 說明：Bun.serve() 在 port 被佔用時會 throw。用 try-catch 包住 Bun.serve()，偵測到 EADDRINUSE 時在 stderr 輸出提示訊息後 process.exit(0)（graceful exit，不算錯誤）。不寫 PID 檔案（因為自己沒拿到 port）。
   - 依賴：無

4. **on-start.js: spawn 前增加 port probe**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/hooks/scripts/session/on-start.js`
   - 說明：在 `shouldSpawnDashboard` 判斷邏輯中，除了 `dashboardPid.isRunning()` 之外，再增加一層 port probe 防護。如果 isRunning() 已經整合了 port probe（子任務 1），這裡只需確保正確呼叫即可。on-start.js 使用 node 執行（非 bun），需注意 API 相容性。
   - 依賴：子任務 1

### 階段 2：體驗優化（可與階段 1 部分並行）

5. **on-start.js: 移除自動開瀏覽器，改 banner 提示**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/hooks/scripts/session/on-start.js`
   - 說明：移除 `open` 命令自動開瀏覽器的邏輯（第 97-103 行），保留 banner 中的 Dashboard URL 提示。同時可移除 `OVERTONE_NO_BROWSER` 環境變數的檢查（不再需要）。這解決 R3 -- macOS `open` 每次都開新分頁的問題。
   - 依賴：無（可與階段 1 並行）

6. **pid.js: lock 狀態機制**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/dashboard/pid.js`
   - 說明：新增 `writeLock()` / `readLock()` / `removeLock()` 函式，在 spawn 前寫入 `~/.overtone/dashboard.lock`（含 timestamp），spawn 後由 server.js 寫 PID 時自動清除 lock。isRunning() 檢查 lock 存在且未過期（如 10 秒內）時也回傳 true，縮小 R1 的 race window。
   - 依賴：子任務 1（需要與 isRunning 整合）

### 階段 3：測試驗證

7. **更新與新增測試**
   - 負責 agent：developer（TEST:spec 階段由 tester 定義 BDD spec，TEST:verify 由 developer 實作）
   - 相關檔案：
     - `tests/integration/dashboard-pid.test.js`（擴充 isRunning 測試）
     - `tests/integration/session-start.test.js`（擴充 OVERTONE_NO_DASHBOARD 場景）
     - 可能新增 `tests/integration/dashboard-spawn.test.js`（race condition 場景）
   - 說明：驗證 7 個 BDD 驗收場景（S1-S7）。測試策略由 TEST:spec 階段定義。
   - 依賴：子任務 1-6 完成

## 開放問題

1. **isRunning() 的 port probe 是否需要同步？** on-start.js 是同步腳本（hook 不支援 async），但 HTTP 請求天生是非同步的。architect 需要決定：(a) 用 `child_process.execSync` + curl 做同步 probe (b) 用 Node 的 `http.request` 搭配同步模式 (c) 用 `net.connect` 做 TCP probe（比 HTTP 更輕量、更可靠）。
2. **lock file 是否值得做？** 如果 port probe 已經能可靠偵測到已有 server，lock 的價值可能有限。architect 需評估 port probe 的可靠度後決定是否需要 lock。
3. **移除自動開瀏覽器的影響**：首次安裝 Overtone 的使用者需要手動從 banner 複製 URL。是否需要額外的 onboarding 提示？（建議：不需要，banner 已足夠明顯）
4. **OVERTONE_NO_BROWSER 環境變數**：移除自動開瀏覽器後，此環境變數不再有意義。是否直接刪除？（建議：直接刪除，符合專案「不做向後相容」原則）
