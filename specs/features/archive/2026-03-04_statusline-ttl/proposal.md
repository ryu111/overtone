# Proposal

## 功能名稱

`statusline-ttl`

## 需求背景（Why）

- **問題**：`statusline-state.json` 在 session 結束後殘留於磁碟，新 session 啟動時 `statusline.js` 的 `read()` 讀到舊狀態，導致顯示不正確（例如顯示已結束 session 的 workflow 類型或 active agent 資訊）。
- **目標**：`read()` 自動辨識過期的狀態檔並回傳 `null`，讓 statusline 在新 session 中以乾淨狀態渲染，不殘留前次 session 的資訊。
- **優先級**：這是一個低風險、影響小的 bug fix，且修改範圍集中在單一檔案（statusline-state.js）。

## 使用者故事

```
身為 Overtone 使用者
我想要新 session 的 statusline 從乾淨狀態開始
以便不因舊 session 的殘留狀態而看到誤導性的 workflow 或 agent 顯示
```

## 範圍邊界

### 在範圍內（In Scope）

- `read()` 加入 mtime 檢查：若 mtime 超過 TTL 且 `idle === true`，回傳 `null`
- `idle === false` 時不套用 TTL（保護長時間執行的 agent）
- TTL 常數定義在 `statusline-state.js` 內，預設 10 分鐘（600,000 ms）
- 為 TTL 邏輯新增單元測試（擴展 `statusline-state.test.js` 或於 `statusline-ttl.test.js` 新增 TTL scenarios）

### 不在範圍內（Out of Scope）

- 主動刪除過期的 `statusline-state.json`（`read()` 只回傳 null，不刪除）
- 從 registry.js 讀取 TTL 配置（常數在 statusline-state.js 內定義即可，不需要 registry 整合）
- 修改 `write()` 或 `update()` 行為
- 跨 session 清理機制（如 gc 腳本）

## 子任務清單

1. **在 `read()` 加入 TTL 過期邏輯**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/statusline-state.js`
   - 說明：
     - `require('fs')` 補充引入 `statSync`
     - 定義 `TTL_MS = 10 * 60 * 1000`（模組頂層常數）
     - `read()` 在解析 JSON 後，用 `statSync(path).mtimeMs` 取得 mtime
     - 若 `(Date.now() - mtime) > TTL_MS && state.idle === true`，回傳 `null`
     - 若 statSync 失敗，靜默繼續（try/catch 包覆整個 read，行為不變）

2. **新增 TTL 單元測試**
   - 負責 agent：developer
   - 相關檔案：`tests/unit/statusline-ttl.test.js`
   - 說明：在現有檔案新增一個 `describe` 區塊，涵蓋以下情境：
     - TTL-1：mtime 超過 10 分鐘且 idle=true → `read()` 回傳 null
     - TTL-2：mtime 超過 10 分鐘但 idle=false → `read()` 回傳 state（不觸發 TTL）
     - TTL-3：mtime 未超過 10 分鐘且 idle=true → `read()` 回傳 state（未過期）
     - 測試策略：寫入 statusline-state.json 後，用 `utimesSync` 操控 mtime（或 mock `Date.now()`）

## 開放問題

- **mtime 操控方式**：測試中需要模擬「超過 10 分鐘」的 mtime，有兩種方式：
  1. `utimesSync(path, oldDate, oldDate)` 將檔案 mtime 設成過去時間（不需 mock，更真實）
  2. 在 `statusline-state.js` 注入可覆寫的 `_nowFn`，測試時傳入 mock（更易測，但改動 API）
  建議由 architect 決定偏好哪種方式。

- **TTL 常數位置**：需確認 TTL 是否應放入 registry.js 的常數區（方便未來集中管理），或直接在 statusline-state.js 定義（避免引入依賴）。建議：直接在 statusline-state.js 頂層定義，保持模組自足。
