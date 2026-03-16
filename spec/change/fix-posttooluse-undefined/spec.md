# PostToolUse:undefined hook error 修復

## 動機（Why）

- **問題**：`PostToolUse:undefined:retry` error 每小時出現 3 次。根因三層：(1) hook-client.js 的 `matcher` 參數在無 CLI arg 時為 `undefined`，template literal 產生 `PostToolUse:undefined`；(2) 觀測型事件（PostToolUse、Notification、SessionStart 等）在 dispatch 失敗時做 retry + autoStart 是浪費——它們沒有 fallback 也不是 guard，retry 只產生噪音；(3) autoStart 後 800ms 等待不足，retry 也失敗產生雙重 error log
- **目標**：消除 `PostToolUse:undefined` error；觀測型事件在 server 不可用時靜默失敗不 retry；guard 型事件保留 retry + fallback 行為
- **不做的代價**：error log 持續增長（每小時 6 條：dispatch + retry 各 3 條）；hook-errors.jsonl 膨脹觸發 context-injector 注入過時 error 資訊給 AI

## 範圍

### In-scope

- hook-client.js：`matcher` 預設值修正（`undefined` → `''`）
- hook-client.js：根據是否有 fallback 分流——有 fallback 才 retry + autoStart，無 fallback 只做一次 dispatch + autoStart（不 retry）
- 新增/擴充測試確認事件名稱格式和分流邏輯

### Out-of-scope

- settings.json 的 matcher 配置（`matcher: ""` 是全匹配，設計正確）
- server.js 的 dispatch 函式（matcher 處理邏輯正確）
- flow-observer.js（PostToolUse handler 從 stdin input 讀 tool_name，設計正確）
- autoStart 的 800ms 等待時間調整（是獨立議題，此次不處理）

## 使用者故事

身為 Nova 系統維護者，我希望 hook error log 不包含可預期的靜默失敗（觀測型事件在 server 未啟動時），以便 error log 只反映真正需要注意的問題。

身為 Nova 系統使用者，我希望 PostToolUse hook 失敗不會觸發不必要的 server autoStart 和 retry，以便減少 session 中的延遲。

## 行為規格

### 正常路徑

1. PostToolUse hook 觸發 → `matcher = ''`（非 `undefined`）→ event name = `PostToolUse:`（不含 `undefined`）
2. dispatch 成功 → 正常記錄 flow event
3. dispatch 失敗（server 未跑）→ PostToolUse 無 fallback → 只做 autoStart → 不 retry → 靜默退出

### 錯誤路徑

| 錯誤情境 | 預期行為 |
|---------|---------|
| PostToolUse dispatch 失敗 | autoStart 嘗試啟動 server → 不 retry → 不 logError → exit 0 |
| PreToolUse:Bash dispatch 失敗 | autoStart → retry dispatch → 仍失敗 → fallback import guards.js → logError |
| matcher 為 undefined（防禦性） | 預設為 `''`，event name 不含 `undefined` |

### 邊界條件

- SessionStart、SessionEnd、UserPromptSubmit、SubagentStop：同 PostToolUse，無 fallback → 不 retry
- PreToolUse:Bash、PreToolUse:Write|Edit：有 fallback → retry + fallback（行為不變）
- PreToolUse:Agent：無 fallback → 不 retry（與 PostToolUse 同類）
- Notification：無 fallback → 不 retry

## 資料模型

N/A（無新資料結構）

## 介面契約

hook-client.js 公開介面不變（stdin JSON → stdout JSON）。內部行為變更：

| 事件類型 | 修改前 | 修改後 |
|---------|--------|--------|
| 有 fallback（PreToolUse:Bash/Write/Edit） | dispatch → autoStart → retry → fallback | 不變 |
| 無 fallback（其餘所有） | dispatch → autoStart → retry → 空轉 | dispatch → autoStart → exit |

## 非功能需求

| 維度 | 要求 |
|------|------|
| 可靠性 | PostToolUse:undefined error 歸零 |
| 效能 | 觀測型事件在 server 不可用時省去 retry 的 3 秒 timeout（AbortSignal.timeout(3000)） |
| 可觀測 | error log 只記有 fallback 的事件的失敗，觀測型事件用 debugLog 記錄（不進 hook-errors.jsonl） |

## 依賴

| 方向 | 模組 | 說明 |
|------|------|------|
| 上游 | Claude Code | 觸發 hook 並傳入 stdin |
| 上游 | settings.json | hook 配置（不修改） |
| 下游 | nova-server /dispatch | hook 處理（不修改） |
| 下游 | hook-errors.jsonl | error 記錄（減少寫入量） |

## 驗收標準

- [ ] `bun test` 全部通過（含新增測試）
- [ ] event name 不包含 `undefined`：所有 logError/debugLog 呼叫中 `${eventType}:${matcher}` 不含 `undefined`
- [ ] PostToolUse dispatch 失敗時不產生 `phase: "retry"` 的 error log
- [ ] PreToolUse:Bash dispatch 失敗時仍走 retry + fallback 流程（行為不變）
- [ ] E2E 測試：PostToolUse hook（server 未跑）→ exit 0 + 無 stdout output + 無 retry error

## 風險

| 風險 | 機率 | 影響 | 緩解策略 |
|------|:----:|:----:|---------|
| 觀測型事件不 retry 導致 server 剛啟動完的 dispatch 被丟棄 | 低 | 低 | autoStart 仍執行——下一次 hook 觸發時 server 已在跑，dispatch 成功。一次觀測事件丟失不影響功能 |
| matcher 預設 `''` 影響 fallback 查找 | 無 | 無 | fallback key 是 `${eventType}:${matcher}`，`PostToolUse:` 在 FALLBACK_MODULES 中無對應條目，行為與 `PostToolUse:undefined` 相同（查無 fallback） |
| 修改影響 PreToolUse guard 的 retry 行為 | 低 | 高 | 分流邏輯明確判斷 FALLBACK_MODULES 有無條目，PreToolUse:Bash/Write/Edit 必定走 retry 路徑 |
