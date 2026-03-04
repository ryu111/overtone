# Feature: Statusline State TTL 過期機制

## 背景

`statusline-state.js` 的 `read()` 函式在 idle 狀態下若狀態檔案超過 10 分鐘未更新，應回傳 `null`，
避免 statusline 顯示過時的 idle 狀態。`idle=false` 時（agent 仍在執行中）不觸發 TTL，
保護長時間執行的 agent 不因 TTL 而消失。

TTL 常數：`TTL_MS = 10 * 60 * 1000`（10 分鐘）

---

## Scenario: TTL-1 — idle=true 且 mtime 超過 TTL，回傳 null

GIVEN 一個有效的 sessionId
AND statusline-state.json 存在且內容為 `{ idle: true, activeAgents: [], workflowType: "quick" }`
AND 該檔案的 mtime 已超過 10 分鐘前（透過 utimesSync 設定）
WHEN 呼叫 `read(sessionId)`
THEN 回傳 `null`

---

## Scenario: TTL-2 — idle=false 且 mtime 超過 TTL，回傳 state（不過期）

GIVEN 一個有效的 sessionId
AND statusline-state.json 存在且內容為 `{ idle: false, activeAgents: ["DEV"], workflowType: "quick" }`
AND 該檔案的 mtime 已超過 10 分鐘前（透過 utimesSync 設定）
WHEN 呼叫 `read(sessionId)`
THEN 回傳完整的 state 物件（非 null）
AND state.idle 為 false
AND state.activeAgents 包含 "DEV"

---

## Scenario: TTL-3 — idle=true 且 mtime 在 TTL 內，回傳 state（未過期）

GIVEN 一個有效的 sessionId
AND statusline-state.json 存在且內容為 `{ idle: true, activeAgents: [], workflowType: "standard" }`
AND 該檔案的 mtime 距今不超過 10 分鐘（剛寫入）
WHEN 呼叫 `read(sessionId)`
THEN 回傳完整的 state 物件（非 null）
AND state.idle 為 true

---

## Scenario: TTL-4 — statusline-state.json 不存在，回傳 null（既有行為）

GIVEN 一個有效的 sessionId
AND 對應的 statusline-state.json 檔案不存在
WHEN 呼叫 `read(sessionId)`
THEN 回傳 `null`

---

## Scenario: TTL-5 — sessionId 為空，回傳 null（既有行為）

GIVEN sessionId 為空字串 `""`
WHEN 呼叫 `read(sessionId)`
THEN 回傳 `null`

AND

GIVEN sessionId 為 `null`
WHEN 呼叫 `read(sessionId)`
THEN 回傳 `null`

AND

GIVEN sessionId 為 `undefined`
WHEN 呼叫 `read(sessionId)`
THEN 回傳 `null`

---

## Scenario: TTL-6 — mtime 剛好等於 TTL 邊界，回傳 null（邊界條件）

GIVEN 一個有效的 sessionId
AND statusline-state.json 存在且內容為 `{ idle: true, activeAgents: [], workflowType: null }`
AND 該檔案的 mtime 距今剛好等於 `TTL_MS`（10 分鐘整）
WHEN 呼叫 `read(sessionId)`
THEN 回傳 `null`（邊界值包含在過期條件 `> TTL_MS` 或 `>= TTL_MS` 依實作決定，記錄實際行為）

---

## Scenario: TTL-7 — idle=true 且 mtime 超過 TTL，update() 後 read() 恢復正常

GIVEN 一個有效的 sessionId
AND 狀態已過期（idle=true，mtime 超過 10 分鐘）
WHEN 呼叫 `update(sessionId, 'agent:start', { stageKey: 'DEV' })`（會觸發 write()）
AND 再呼叫 `read(sessionId)`
THEN 回傳最新的 state（非 null）
AND state.idle 為 false
AND state.activeAgents 包含 "DEV"
