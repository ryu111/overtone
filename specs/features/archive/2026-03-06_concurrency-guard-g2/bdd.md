# Feature: Concurrency Guard G2 — Orphan Agent 自動清理與健康偵測

## 背景

Overtone 的 activeAgents 記錄正在執行的 subagent。當 subagent 異常中斷（crash、timeout、context 壓縮等），
對應的 entry 不會被移除，導致 getNextStageHint() 誤以為有並行 agent 仍在執行，
造成 loop 無法繼續（卡在 soft-release 狀態）。G2 修復在兩個位置解決此問題：

1. session-stop-handler.js — detectAndCleanOrphans()：主動清理超時 orphan
2. health-check.js — checkConcurrencyGuards()：靜態 + runtime 健康偵測

---

## Feature A: detectAndCleanOrphans — 基本 orphan 清理

### Scenario A-1: agent 超過 TTL 被識別為 orphan 並清除

GIVEN 一個 session 的 activeAgents 中有一筆 entry
AND 該 entry 的 startedAt 為 16 分鐘前（超過 15 分鐘 TTL）
WHEN handleSessionStop 執行
THEN 該 orphan entry 被從 activeAgents 中移除
AND timeline 記錄一筆 `agent:orphan-cleanup` 事件
AND 事件包含正確的 instanceId、agentName、ageMs、ttlMs 欄位

### Scenario A-2: agent 未超過 TTL 不被清除

GIVEN 一個 session 的 activeAgents 中有一筆 entry
AND 該 entry 的 startedAt 為 5 分鐘前（未超過 15 分鐘 TTL）
WHEN handleSessionStop 執行
THEN 該 entry 保留在 activeAgents 中（不被清除）
AND 不 emit `agent:orphan-cleanup` 事件

### Scenario A-3: 清除 orphan 後 loop 可正常繼續（不再 soft-release 卡住）

GIVEN 一個 session 的 DEV stage 為 active 狀態
AND activeAgents 中有一筆超過 TTL 的 orphan entry（該 agent 實際上已不存在）
AND 尚有未完成的 REVIEW stage
WHEN handleSessionStop 執行
THEN orphan 被清除
AND handleSessionStop 回傳 `{ output: { decision: 'block' } }`（loop 繼續執行下一 stage）
AND 不回傳 soft-release 的 `{ output: { result: '' } }`

---

## Feature B: detectAndCleanOrphans — 邊界條件與防禦性處理

### Scenario B-1: entry 缺少 startedAt 欄位時跳過（不清除）

GIVEN activeAgents 中有一筆 entry
AND 該 entry 缺少 startedAt 欄位（或為 undefined）
WHEN detectAndCleanOrphans 執行
THEN 該 entry 不被清除
AND 不拋出例外
AND 不 emit 任何 `agent:orphan-cleanup` 事件

### Scenario B-2: entry 的 startedAt 為非法 ISO 字串時跳過

GIVEN activeAgents 中有一筆 entry
AND 該 entry 的 startedAt 為非法字串（如 "not-a-date" 或 null）
WHEN detectAndCleanOrphans 執行
THEN 該 entry 不被清除
AND 不拋出例外

### Scenario B-3: activeAgents 為空物件時不拋出例外

GIVEN 一個 session 的 activeAgents 為空物件 `{}`
WHEN detectAndCleanOrphans 執行
THEN 回傳 `{ cleaned: [] }`
AND 不拋出例外

### Scenario B-4: 多筆 orphan 同時清除，回傳所有清除記錄

GIVEN activeAgents 中有 3 筆 entry
AND 其中 2 筆的 startedAt 超過 TTL，1 筆未超過
WHEN detectAndCleanOrphans 執行
THEN 回傳 `{ cleaned: [entry1, entry2] }`（陣列長度 2）
AND 未超過 TTL 的 entry 保留在 activeAgents
AND emit 2 筆 `agent:orphan-cleanup` timeline 事件

### Scenario B-5: 並行競爭 — SubagentStop 已先清除同一 key 時不拋出例外

GIVEN detectAndCleanOrphans 與 SubagentStop 並行執行
AND SubagentStop 已先將 instanceId 從 activeAgents 刪除
WHEN detectAndCleanOrphans 試圖刪除同一 instanceId
THEN 操作為 no-op（delete 不存在的 key 不拋例外）
AND 不影響其他 entry 的清除

---

## Feature C: checkConcurrencyGuards — 靜態文件掃描

### Scenario C-1: filesystem-concurrency.md 包含完整 G1/G2/G3 記錄時回傳 0 findings

GIVEN filesystem-concurrency.md 的內容包含 "G1"、"G2"、"G3" 三個標記
WHEN checkConcurrencyGuards 執行
THEN 靜態掃描部分回傳 0 findings（無 info finding）

### Scenario C-2: filesystem-concurrency.md 缺少 G2 記錄時回傳 info finding

GIVEN 測試用的 filesystem-concurrency.md 只包含 "G1" 和 "G3"，不含 "G2"
WHEN checkConcurrencyGuards(sessionsDirOverride, fsConMdOverride) 執行
THEN 回傳至少 1 筆 severity 為 "info" 的 finding
AND finding.message 提及 G2

### Scenario C-3: filesystem-concurrency.md 不存在時靜默跳過（不拋例外）

GIVEN fsConMdOverride 指向一個不存在的路徑
WHEN checkConcurrencyGuards 執行
THEN 不拋出例外
AND 回傳至少 1 筆 info finding 說明文件缺失

---

## Feature D: checkConcurrencyGuards — Runtime 掃描

### Scenario D-1: active session 有超時 orphan 時回傳 warning finding

GIVEN sessionsDirOverride 指向一個臨時目錄
AND 該目錄下有一個 session 子目錄含 workflow.json
AND workflow.json 的 activeAgents 有一筆 startedAt 超過 15 分鐘的 entry
WHEN checkConcurrencyGuards(sessionsDirOverride) 執行
THEN 回傳至少 1 筆 severity 為 "warning" 的 finding
AND finding.message 包含該 session 或 agent 的識別資訊

### Scenario D-2: active session 無 orphan 時 runtime 掃描回傳 0 warning

GIVEN sessionsDirOverride 指向含有合法 session 的臨時目錄
AND workflow.json 的 activeAgents 所有 entry 的 startedAt 均在 15 分鐘內
WHEN checkConcurrencyGuards(sessionsDirOverride) 執行
THEN runtime 掃描部分不回傳任何 warning finding

### Scenario D-3: sessions 目錄不存在時靜默跳過（全新安裝）

GIVEN sessionsDirOverride 指向一個不存在的路徑
WHEN checkConcurrencyGuards(sessionsDirOverride) 執行
THEN 不拋出例外
AND runtime 掃描部分回傳 0 finding

### Scenario D-4: workflow.json 損壞（無效 JSON）時靜默跳過該 session

GIVEN sessionsDirOverride 指向含有 session 的臨時目錄
AND 該 session 的 workflow.json 包含無效 JSON（如 "{ broken }"）
WHEN checkConcurrencyGuards(sessionsDirOverride) 執行
THEN 不拋出例外
AND 跳過該損壞的 session，繼續掃描其他 session

### Scenario D-5: activeAgents 欄位缺失的 workflow.json 靜默跳過

GIVEN sessionsDirOverride 下有一個 session 的 workflow.json 不含 activeAgents 欄位
WHEN checkConcurrencyGuards(sessionsDirOverride) 執行
THEN 不拋出例外
AND 該 session 不產生任何 finding

---

## Feature E: agent:orphan-cleanup timeline 事件格式

### Scenario E-1: emit 的事件包含所有必要欄位

GIVEN detectAndCleanOrphans 清除了一筆 orphan
WHEN timeline.emit 被呼叫
THEN 事件 type 為字串常量 `"agent:orphan-cleanup"`（符合 checkPhantomEvents regex 格式）
AND 事件包含 instanceId（string）
AND 事件包含 agentName（string）
AND 事件包含 ageMs（number，大於 TTL）
AND 事件包含 ttlMs（number，等於 ORPHAN_TTL_MS 常數值 900000）

### Scenario E-2: 事件 type 符合 registry.js 的 timelineEvents 定義

GIVEN registry.js 的 timelineEvents 新增了 `agent:orphan-cleanup` key
WHEN checkPhantomEvents 掃描 session-stop-handler.js 的 emit 呼叫
THEN 不產生 phantom event finding（emit 呼叫與 registry 一致）
