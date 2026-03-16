# 修復 hook dispatch error — 任務清單

## 深度路由：D2
**planner → executor**

## 依賴分析

```
Phase 1（parallel）: T1 + T2（修改不同檔案，無依賴）
Phase 2（parallel，依賴 Phase 1）: T3 + T4（測試不同檔案，無依賴）
Phase 3（sequential，依賴 Phase 2）: T5（驗收）
```

---

## Phase 1：程式碼修改（parallel）

### T1：hook-client.js autoStart 改用 polling

- **執行者**：executor
- **檔案**：`~/.claude/hooks/hook-client.js`（修改）
- **內容**：
  1. 新增 `pollHealth({ maxRetries = 5, intervalMs = 200 })` 函式
     - 迴圈：`Bun.sleep(intervalMs)` → `fetch /health` (timeout 1000ms)
     - 回應 `status === 'ok' && title === 'nova-server'` → return true
     - 重試耗盡 → return false
  2. `autoStart()` 中 `await Bun.sleep(800)` 替換為 `await pollHealth()`
  3. lockfile 等待也改用 polling：lockfile 存在時 polling 等 server 就緒（而非固定 sleep 1000ms）
- **驗收**：hook-client.js 不含 `Bun.sleep(800)`

### T2：error-analyzer.js 新增自癒錯誤過濾

- **執行者**：executor
- **檔案**：`~/.claude/scripts/error-analyzer.js`（修改）
- **內容**：
  1. 新增 `export function isSelfHealingError(clusterKey)`
     - 解析 clusterKey 格式 `"event:phase"` → 取出 phase
     - phase 為 `"all-failed"` 且 event 在 FALLBACK 列表 → return true
     - FALLBACK 列表：`PreToolUse:Bash`、`PreToolUse:Write`、`PreToolUse:Edit`
  2. `createRepairTaskIfNeeded` 過濾邏輯：
     - `newClusters` 過濾時額外排除 `isSelfHealingError(key)` 為 true 的項目
     - log 輸出包含「自癒 N 個」的統計
- **驗收**：`isSelfHealingError("PreToolUse:Bash:all-failed")` === true

---

## Phase 2：測試更新（parallel，依賴 Phase 1）

### T3：hook-client.test.js 新增 polling 測試

- **執行者**：executor
- **檔案**：`~/projects/overtone/tests/unit/hook-client.test.js`（修改）
- **內容**：
  1. 新增 describe `autoStart polling 改善`：
     - 靜態驗證：hook-client.js 不含 `Bun.sleep(800)`
     - 靜態驗證：hook-client.js 包含 `pollHealth` 函式
     - 靜態驗證：pollHealth 內有 `maxRetries` 和 `intervalMs` 參數
  2. 確認現有 E2E 測試仍通過（server 斷線時 fallback 正常）
- **驗收**：`bun test tests/unit/hook-client.test.js` 全部通過

### T4：error-analyzer.test.js 新增自癒過濾測試

- **執行者**：executor
- **檔案**：`~/projects/overtone/tests/unit/error-analyzer.test.js`（修改）
- **內容**：
  1. 新增 describe `isSelfHealingError`：
     - `"PreToolUse:Bash:all-failed"` → true（有 fallback）
     - `"PreToolUse:Write:all-failed"` → true（有 fallback）
     - `"PreToolUse:Edit:all-failed"` → true（有 fallback）
     - `"PostToolUse:observer:all-failed"` → false（觀測型，無 fallback）
     - `"PreToolUse:Bash:stdin"` → false（phase 不是 all-failed）
     - `"SessionStart:unknown"` → false（無 fallback）
  2. 新增 describe `createRepairTaskIfNeeded 自癒過濾`：
     - 5 個 `PreToolUse:Bash` all-failed error → 不建任務（全為自癒型）
     - 3 個 `PreToolUse:Bash` all-failed + 5 個 `SessionStart:unknown` → 只對 SessionStart 建任務
- **驗收**：`bun test tests/unit/error-analyzer.test.js` 全部通過

---

## Phase 3：驗收（sequential，依賴 Phase 2）

### T5：全面驗收

- **執行者**：executor
- **內容**：
  1. `bun test` 全部通過
  2. hook-client.js 靜態檢查：不含 `Bun.sleep(800)`、包含 `pollHealth`
  3. error-analyzer.js 靜態檢查：export 包含 `isSelfHealingError`
  4. E2E：server 斷線時危險命令仍被 fallback 攔截
- **驗收**：全部通過，exit code 0

---

## 依賴圖

```
T1（hook-client polling）  T2（error-analyzer 過濾）
         ↓                          ↓
T3（hook-client 測試）     T4（error-analyzer 測試）
         ↓                          ↓
         └──────── T5（驗收）────────┘
```

---

## 完成定義

- [ ] hook-client.js 不含 `Bun.sleep(800)`，改用 pollHealth polling
- [ ] error-analyzer.js export `isSelfHealingError`，自癒錯誤不建 P1 任務
- [ ] `bun test` 全部通過（含新增測試）
- [ ] E2E：server 斷線時 PreToolUse:Bash fallback 正常攔截危險命令
