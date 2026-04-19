# Heartbeat 品質提升 + Spawn 穩定性

## 動機（Why）

- **問題**：heartbeat 三個檔案中有 4 處空 catch 違反「禁止靜默失敗」規範；Phase 1 while 迴圈無上限可能無限循環；spawn 失敗未記錄到 hook-errors.jsonl，維護困難
- **目標**：消除所有空 catch、補上防護邊界、spawn 失敗可追蹤
- **不做的代價**：靜默失敗導致 Notion API 異常時完全無跡可循；while 無上限在 Notion 返回大量任務時卡死 heartbeat tick

## 範圍

### In-scope

- 4 處空 catch 補上 log 或 emit
- Phase 1 while 迴圈加最大迭代上限
- `let deps = null` 模組層 mutable state 加 guard
- CLI fallback `for await` 替換為 `Bun.readableStreamToText`
- spawn 前健康前置檢查（claude CLI 可用性）
- spawn 失敗記錄到 `/tmp/hook-errors.jsonl`
- `process.kill(-child.pid)` 在已結束 child 時 log
- 測試擴充覆蓋上述所有修復點

### Out-of-scope

- heartbeat 功能變更（不改 poll/executeTask 的業務邏輯）
- session-spawner 的 stream-json 解析邏輯
- Notion API 直接呼叫邏輯（listTasks 的 API 路徑不改）
- heartbeat module 的 Phase 2（analyze/self-drive）重構

## 使用者故事

身為 nova-server 維運者，我想要 heartbeat 每個失敗點都有 log，以便在 Notion API 或 claude CLI 異常時能從 `/tmp/nova-server.log` 和 `/tmp/hook-errors.jsonl` 追蹤根因。

身為 heartbeat 開發者，我想要 while 迴圈有安全上限，以便即使 Notion 返回異常大量任務也不會卡死系統。

## 行為規格

### 正常路徑

1. heartbeat tick 觸發 → handler 進入 Phase 1
2. while 迴圈最多執行 MAX_BATCH（50）次後強制 break
3. 每次 poll 返回 idle → Phase 2 分析
4. spawn 前檢查 claude CLI 可用性 → 可用則 spawn
5. spawn 結束 → 記錄結果

### 錯誤路徑

| 錯誤情境 | 預期行為 |
|---------|---------|
| loadConfig() JSON 解析失敗 | console.error 記錄錯誤，回傳空物件 |
| resetTask 呼叫失敗 | console.error 記錄（best effort 語意保留，但有 log） |
| NOTION_TOKEN .zshrc 讀取失敗 | console.error 記錄，return null |
| process.kill(-child.pid) 失敗 | console.debug 記錄（正常情境：child 已結束） |
| while 迴圈超過 50 次 | console.warn 記錄，強制 break |
| spawn 前 claude CLI 不存在 | emit sd:done + error，不 spawn |
| spawn 失敗 | 寫入 /tmp/hook-errors.jsonl |

### 邊界條件

- Notion 返回 0 個任務 → idle，不進入 while body
- Notion 持續返回任務（永遠有 action: execute）→ 第 50 次後強制 break + warn
- deps 為 null 時 handler 被呼叫 → 提前 return + error log
- claude CLI 不在 PATH → 不 spawn，emit error event

## 資料模型

### 輸入

不新增資料結構。修復使用既有的 config、deps、state。

### 輸出

不新增資料結構。hook-errors.jsonl 沿用既有格式 `{ ts, event, error, phase }`。

### 儲存

- `/tmp/hook-errors.jsonl` — spawn 失敗記錄（既有機制，只是 heartbeat 之前未寫入）
- `/tmp/nova-server.log` — console.error/warn 輸出（既有機制）

## 介面契約

不變更。保持 `poll`、`executeTask`、`buildDeps` export 簽名不變。
heartbeat module 保持 `{ name, subscribe, handler, init, destroy }` 介面。

## 非功能需求

| 維度 | 要求 |
|------|------|
| 效能 | CLI fallback 替換 for-await 為 Bun.readableStreamToText（預期 16 倍加速） |
| 安全 | 不引入新的外部依賴 |
| 測試 | 新增測試覆蓋所有 10 個修復點 |

## 依賴

| 方向 | 模組 | 說明 |
|------|------|------|
| 上游 | notion-tasks.js | listTasks/claimTask/completeTask/resetTask |
| 上游 | session-spawner.js | spawnSession/buildPrompt |
| 下游 | nova-server | 載入 heartbeat module |

## 驗收標準

- [ ] `grep -rn 'catch\s*{' ~/.claude/hooks/modules/heartbeat.js ~/.claude/scripts/heartbeat.js ~/.claude/scripts/session-spawner.js` 結果為 0（無空 catch）
- [ ] Phase 1 while 有 MAX_BATCH 常數和超限 warn log
- [ ] handler 開頭有 deps null guard
- [ ] CLI fallback 不使用 `for await`
- [ ] spawn 前有 claude CLI 可用性檢查
- [ ] spawn 失敗寫入 `/tmp/hook-errors.jsonl`
- [ ] `bun test` 全部通過
- [ ] heartbeat.test.js 新增測試 >= 8 個（覆蓋 Group A-D）

## 風險

| 風險 | 機率 | 影響 | 緩解策略 |
|------|:----:|:----:|---------|
| console.error 過多造成 log 噪音 | 低 | 低 | 空 catch 場景本就罕見，錯誤時應該要有 log |
| MAX_BATCH=50 太小，正常任務被截斷 | 低 | 中 | 正常不會有 50 個待做任務；超限 warn 可調整 |
| claude CLI 檢查增加 spawn 延遲 | 低 | 低 | 用 Bun.which 同步檢查，<1ms |
