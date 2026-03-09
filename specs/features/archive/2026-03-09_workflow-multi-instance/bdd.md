---
feature: workflow-multi-instance
type: bdd-spec
status: in-progress
created: 2026-03-09
---

# Feature: workflow-multi-instance — BDD 規格

---

## Feature 1: paths.js 新路徑函式

### Scenario 1-1: workflowDir 回傳正確路徑
GIVEN sessionId 為 `"sess-abc"`
AND workflowId 為 `"lz4abc12-r2xy"`
WHEN 呼叫 `paths.session.workflowDir("sess-abc", "lz4abc12-r2xy")`
THEN 回傳路徑結尾為 `sessions/sess-abc/workflows/lz4abc12-r2xy`

### Scenario 1-2: workflowFile 回傳正確路徑
GIVEN sessionId 為 `"sess-abc"`
AND workflowId 為 `"lz4abc12-r2xy"`
WHEN 呼叫 `paths.session.workflowFile("sess-abc", "lz4abc12-r2xy")`
THEN 回傳路徑結尾為 `sessions/sess-abc/workflows/lz4abc12-r2xy/workflow.json`

### Scenario 1-3: workflowTimeline 回傳正確路徑
GIVEN sessionId 為 `"sess-abc"`
AND workflowId 為 `"lz4abc12-r2xy"`
WHEN 呼叫 `paths.session.workflowTimeline("sess-abc", "lz4abc12-r2xy")`
THEN 回傳路徑結尾為 `sessions/sess-abc/workflows/lz4abc12-r2xy/timeline.jsonl`

### Scenario 1-4: workflowHandoffsDir 回傳正確路徑
GIVEN sessionId 與 workflowId 均為有效字串
WHEN 呼叫 `paths.session.workflowHandoffsDir(sessionId, workflowId)`
THEN 回傳路徑結尾為 `workflows/{workflowId}/handoffs`

### Scenario 1-5: workflowHandoff 回傳正確路徑
GIVEN sessionId 為 `"sess-abc"`、workflowId 為 `"lz4abc12-r2xy"`、stageKey 為 `"DEV"`
WHEN 呼叫 `paths.session.workflowHandoff("sess-abc", "lz4abc12-r2xy", "DEV")`
THEN 回傳路徑結尾為 `workflows/lz4abc12-r2xy/handoffs/DEV.md`

### Scenario 1-6: activeWorkflowId 回傳正確路徑
GIVEN sessionId 為 `"sess-abc"`
WHEN 呼叫 `paths.session.activeWorkflowId("sess-abc")`
THEN 回傳路徑結尾為 `sessions/sess-abc/active-workflow-id`

### Scenario 1-7: agentMapping 回傳正確路徑
GIVEN sessionId 為 `"sess-abc"`
WHEN 呼叫 `paths.session.agentMapping("sess-abc")`
THEN 回傳路徑結尾為 `sessions/sess-abc/agent-mapping.json`

### Scenario 1-8: 舊路徑函式仍存在（deprecated fallback）
GIVEN paths.js 已更新
WHEN 分別呼叫 `paths.session.workflow(sessionId)`、`paths.session.timeline(sessionId)`、`paths.session.handoff(sessionId, stageKey)`
THEN 三個函式均存在且回傳非空字串
AND 路徑不含 `workflows/` 子目錄（舊格式根層路徑）

---

## Feature 2: state.js 多實例隔離

### Scenario 2-1: readState 帶 workflowId 讀新路徑
GIVEN 磁碟上存在 `workflows/{workflowId}/workflow.json` 且內含有效 state
WHEN 呼叫 `readState(sessionId, workflowId)`
THEN 回傳對應的 state 物件
AND state 物件包含 `workflowId` 欄位等於傳入的 workflowId

### Scenario 2-2: readState 帶 workflowId 但新路徑不存在時回傳 null
GIVEN `workflows/{workflowId}/workflow.json` 不存在
AND 根層 `workflow.json` 也不存在
WHEN 呼叫 `readState(sessionId, workflowId)`
THEN 回傳 `null`

### Scenario 2-3: readState 無 workflowId 時 fallback 至舊路徑
GIVEN 磁碟上僅存在根層 `workflow.json`（舊格式）
AND `active-workflow-id` 不存在
WHEN 呼叫 `readState(sessionId, null)`
THEN 回傳根層 `workflow.json` 的 state 物件
AND 不拋出錯誤

### Scenario 2-4: readState 兩者皆不存在時回傳 null
GIVEN `workflows/{workflowId}/workflow.json` 不存在
AND 根層 `workflow.json` 也不存在
WHEN 呼叫 `readState(sessionId, null)`
THEN 回傳 `null`

### Scenario 2-5: initState 寫入 workflowId 欄位
GIVEN sessionId 與 workflowId 均為有效字串
WHEN 呼叫 `initState(sessionId, workflowId, "standard", ["DEV", "TEST"], {})`
THEN 在 `workflows/{workflowId}/workflow.json` 建立 state 檔案
AND state 物件的 `workflowId` 欄位等於傳入的 workflowId
AND state 物件的 `sessionId` 欄位等於傳入的 sessionId

### Scenario 2-6: updateStage 更新正確 workflow 的 state
GIVEN 磁碟上同時存在兩個 workflow 的 state（workflowId-A 與 workflowId-B）
WHEN 呼叫 `updateStage(sessionId, workflowId-A, "DEV", { status: "completed" })`
THEN workflowId-A 的 `workflow.json` 中 DEV stage 狀態為 `completed`
AND workflowId-B 的 `workflow.json` 未被修改

### Scenario 2-7: sanitize 帶 workflowId 修復正確 workflow
GIVEN `workflows/{workflowId}/workflow.json` 存在但 state 不一致
WHEN 呼叫 `sanitize(sessionId, workflowId)`
THEN 回傳 `{ fixed, state }` 物件
AND 修復套用至正確的 `workflows/{workflowId}/workflow.json`

### Scenario 2-8: enforceInvariants 從 state.workflowId 取得路徑
GIVEN state 物件包含 `workflowId` 欄位
WHEN 呼叫 enforceInvariants（內部觸發）
THEN timeline.emit 使用 `state.workflowId` 寫入正確的 workflow 層級 timeline
AND 不需外部傳入 workflowId 參數

---

## Feature 3: timeline.js 多實例隔離

### Scenario 3-1: emit 帶 workflowId 寫入新路徑
GIVEN sessionId 與 workflowId 均為有效字串
AND `workflows/{workflowId}/` 目錄存在
WHEN 呼叫 `emit(sessionId, workflowId, "workflow:start", { type: "standard" })`
THEN 事件寫入 `workflows/{workflowId}/timeline.jsonl`
AND 根層 `timeline.jsonl` 不受影響

### Scenario 3-2: emit 無 workflowId 時 fallback 至根層
GIVEN sessionId 為有效字串
WHEN 呼叫 `emit(sessionId, null, "workflow:start", {})`
THEN 事件寫入根層 `timeline.jsonl`（舊格式路徑）
AND 不拋出錯誤

### Scenario 3-3: 兩個 workflow 的 timeline 互不影響
GIVEN workflowId-A 與 workflowId-B 各自有獨立目錄
WHEN 對 workflowId-A emit 事件 3 筆，對 workflowId-B emit 事件 2 筆
THEN `query(sessionId, workflowId-A)` 回傳 3 筆
AND `query(sessionId, workflowId-B)` 回傳 2 筆

### Scenario 3-4: query 帶 workflowId 只查對應 timeline
GIVEN `workflows/{workflowId}/timeline.jsonl` 有 5 筆事件
AND 根層 `timeline.jsonl` 有 3 筆舊事件
WHEN 呼叫 `query(sessionId, workflowId)`
THEN 回傳 5 筆（新路徑的事件）
AND 不混入根層舊事件

---

## Feature 4: agent-mapping.js 新模組

### Scenario 4-1: readMapping 不存在時回傳空物件
GIVEN `agent-mapping.json` 不存在
WHEN 呼叫 `readMapping(sessionId)`
THEN 回傳 `{}`
AND 不拋出錯誤

### Scenario 4-2: writeMapping 寫入正確條目
GIVEN `agent-mapping.json` 不存在或為空
WHEN 呼叫 `writeMapping(sessionId, "developer:lz4abc12-r2xy", "lz4abc12-r2xy")`
THEN `agent-mapping.json` 內容包含 `{ "developer:lz4abc12-r2xy": "lz4abc12-r2xy" }`

### Scenario 4-3: writeMapping 累積不覆蓋既有條目
GIVEN `agent-mapping.json` 已有 `{ "developer:wf-A": "wf-A" }`
WHEN 呼叫 `writeMapping(sessionId, "tester:wf-B", "wf-B")`
THEN `agent-mapping.json` 同時包含兩個條目
AND `developer:wf-A` 的條目未被刪除

### Scenario 4-4: lookupWorkflow 查詢存在的 instanceId
GIVEN `agent-mapping.json` 有 `{ "developer:lz4abc12-r2xy": "lz4abc12-r2xy" }`
WHEN 呼叫 `lookupWorkflow(sessionId, "developer:lz4abc12-r2xy")`
THEN 回傳 `"lz4abc12-r2xy"`

### Scenario 4-5: lookupWorkflow 查詢不存在的 instanceId 回傳 null
GIVEN `agent-mapping.json` 存在但不含目標 instanceId
WHEN 呼叫 `lookupWorkflow(sessionId, "developer:unknown-id")`
THEN 回傳 `null`

### Scenario 4-6: lookupWorkflow 檔案不存在時回傳 null
GIVEN `agent-mapping.json` 不存在
WHEN 呼叫 `lookupWorkflow(sessionId, "developer:lz4abc12-r2xy")`
THEN 回傳 `null`
AND 不拋出錯誤

### Scenario 4-7: removeEntry 清除指定條目
GIVEN `agent-mapping.json` 有兩個條目（developer:wf-A 與 tester:wf-B）
WHEN 呼叫 `removeEntry(sessionId, "developer:wf-A")`
THEN `agent-mapping.json` 不再包含 `developer:wf-A`
AND `tester:wf-B` 條目仍存在

### Scenario 4-8: removeEntry 目標不存在時靜默成功
GIVEN `agent-mapping.json` 不含目標 instanceId
WHEN 呼叫 `removeEntry(sessionId, "developer:nonexistent")`
THEN 不拋出錯誤
AND 既有條目不受影響

### Scenario 4-9: writeMapping CAS 並發保護
GIVEN 兩個並發寫入同時進行（不同 instanceId）
WHEN writeMapping 的 mtime 檢查偵測到衝突
THEN 至多重試 3 次
AND 最終兩個條目均出現在 `agent-mapping.json`

---

## Feature 5: init-workflow.js 初始化流程

### Scenario 5-1: 生成 workflowId 並建立目錄結構
GIVEN sessionId 為有效字串
WHEN 執行 `init-workflow.js`
THEN 生成格式符合 `{timestamp36}-{random4}` 的 workflowId（如 `lz4abc12-r2xy`）
AND `workflows/{workflowId}/` 目錄存在
AND `workflows/{workflowId}/handoffs/` 目錄存在

### Scenario 5-2: 寫入 active-workflow-id
GIVEN sessionId 為有效字串
WHEN 執行 `init-workflow.js`
THEN `active-workflow-id` 檔案存在
AND 檔案內容等於本次生成的 workflowId

### Scenario 5-3: 初始化 state 寫入 workflowId 欄位
GIVEN init-workflow.js 執行成功
WHEN 讀取 `workflows/{workflowId}/workflow.json`
THEN state 物件包含 `workflowId` 欄位
AND state 物件包含 `sessionId` 欄位

### Scenario 5-4: 連續啟動兩次 workflow 時 active-workflow-id 被覆蓋
GIVEN 第一次 init-workflow.js 已執行，workflowId 為 wf-A
WHEN 第二次執行 init-workflow.js，生成 workflowId 為 wf-B
THEN `active-workflow-id` 內容更新為 wf-B
AND wf-A 的目錄與 state 仍然存在（不刪除）

### Scenario 5-5: 輸出 workflowId 到 stdout
GIVEN init-workflow.js 執行成功
WHEN 讀取 stdout
THEN 輸出包含生成的 workflowId 字串

---

## Feature 6: SubagentStop 正確路由（核心修復）

### Scenario 6-1: 背景 agent 完成時查 mapping 路由到正確 workflow
GIVEN session 同時有兩個 workflow（wf-A 為前景、wf-B 為背景）
AND `agent-mapping.json` 有 `{ "developer:wf-B-inst": "wf-B" }`
AND wf-B 的 developer agent 完成，instanceId 為 `developer:wf-B-inst`
WHEN agent-stop-handler 收到 SubagentStop 事件
THEN `lookupWorkflow(sessionId, "developer:wf-B-inst")` 回傳 `"wf-B"`
AND state 更新寫入 `workflows/wf-B/workflow.json`
AND `workflows/wf-A/workflow.json` 不受影響

### Scenario 6-2: 前景 agent 完成時 mapping 路由到前景 workflow
GIVEN `agent-mapping.json` 有 `{ "tester:wf-A-inst": "wf-A" }`
AND `active-workflow-id` 內容為 `"wf-A"`
WHEN agent-stop-handler 處理 instanceId `tester:wf-A-inst`
THEN state 更新寫入 `workflows/wf-A/workflow.json`

### Scenario 6-3: mapping 找不到時 fallback 至 active-workflow-id
GIVEN `agent-mapping.json` 不含目標 instanceId
AND `active-workflow-id` 內容為 `"wf-A"`
WHEN agent-stop-handler 嘗試 lookupWorkflow 但回傳 null
THEN fallback 讀取 `active-workflow-id`，取得 workflowId = `"wf-A"`
AND state 更新寫入 `workflows/wf-A/workflow.json`
AND hookError 記錄 fallback 事件（供追蹤）

### Scenario 6-4: mapping 和 active-workflow-id 均不存在時使用根層路徑
GIVEN `agent-mapping.json` 不含目標 instanceId
AND `active-workflow-id` 不存在（舊 session）
WHEN agent-stop-handler 處理完成
THEN workflowId 為 null
AND state 更新寫入根層 `workflow.json`（migration 路徑）
AND 不拋出錯誤

### Scenario 6-5: agent 完成後清除 mapping 條目
GIVEN `agent-mapping.json` 有 `{ "developer:wf-A-inst": "wf-A" }`
WHEN agent-stop-handler 成功完成所有 state 更新
THEN 呼叫 `removeEntry(sessionId, "developer:wf-A-inst")`
AND `agent-mapping.json` 不再包含 `developer:wf-A-inst`

### Scenario 6-6: 兩個 agent 並行完成互不干擾
GIVEN wf-A 的 developer 與 wf-B 的 developer 幾乎同時完成
AND `agent-mapping.json` 各有正確映射
WHEN 兩個 SubagentStop 事件分別觸發
THEN wf-A 的 state 只被 wf-A 的 agent 更新
AND wf-B 的 state 只被 wf-B 的 agent 更新
AND 兩個 `workflow.json` 最終狀態各自正確

---

## Feature 7: Migration — 舊 session 向後相容

### Scenario 7-1: 舊 session 無 active-workflow-id 時 readState 靜默降級
GIVEN session 目錄不含 `active-workflow-id`
AND 根層 `workflow.json` 存在且有效
WHEN 呼叫 `readState(sessionId, null)`
THEN 回傳根層 `workflow.json` 的 state
AND 不拋出錯誤

### Scenario 7-2: 舊 session timeline.emit 寫入根層
GIVEN session 目錄不含 `active-workflow-id`
AND workflowId 傳入 null
WHEN 呼叫 `emit(sessionId, null, "stage:completed", {})`
THEN 事件寫入根層 `timeline.jsonl`

### Scenario 7-3: 新 session 不影響舊 session 的根層檔案
GIVEN 舊 session（根層 `workflow.json`）與新 session（`workflows/{wf}/workflow.json`）同時存在
WHEN 對新 session 執行各種 state 更新
THEN 舊 session 的根層 `workflow.json` 不被修改

### Scenario 7-4: agent-mapping.json 不存在時所有操作靜默降級
GIVEN 舊 session 無 `agent-mapping.json`
WHEN agent-stop-handler 呼叫 lookupWorkflow 並取得 null
AND fallback 至 active-workflow-id 也不存在
THEN workflowId 為 null，使用根層路徑
AND 整個 handler 流程完成，不中斷

### Scenario 7-5: 舊 session handoff 讀取 fallback 至根層 handoffs/
GIVEN session 不含 `workflows/` 目錄
AND 根層 `handoffs/DEV.md` 存在
WHEN pre-compact-handler 嘗試讀取 workflowId = null 的 handoff
THEN 讀取根層 `handoffs/DEV.md`
AND 回傳正確內容

---

## Feature 8: on-submit-handler — 讀取前景 workflow context

### Scenario 8-1: 正常讀取 active-workflow-id 並注入 context
GIVEN `active-workflow-id` 存在，內容為 `"wf-A"`
AND `workflows/wf-A/workflow.json` 存在且有進行中的 stage
WHEN on-submit-handler 處理 UserPromptSubmit
THEN 讀取 workflowId = `"wf-A"`
AND `state.readState(sessionId, "wf-A")` 回傳正確 state
AND workflow context 正常注入 additionalContext

### Scenario 8-2: active-workflow-id 不存在時靜默降級
GIVEN `active-workflow-id` 不存在
WHEN on-submit-handler 處理 UserPromptSubmit
THEN workflowId = null
AND fallback 至根層 `workflow.json`（或無 context）
AND 不拋出錯誤

---

## Feature 9: pre-task-handler — 委派時寫入 agent-mapping

### Scenario 9-1: 委派 agent 後 agent-mapping 有正確條目
GIVEN `active-workflow-id` 存在，內容為 `"wf-A"`
AND pre-task-handler 生成 instanceId = `"developer:inst-001"`
WHEN pre-task-handler 完成委派流程
THEN `agent-mapping.json` 包含 `{ "developer:inst-001": "wf-A" }`

### Scenario 9-2: active-workflow-id 不存在時 workflowId 為 null
GIVEN `active-workflow-id` 不存在（migration 場景）
WHEN pre-task-handler 完成委派
THEN workflowId = null
AND `agent-mapping.json` 中該 instanceId 對應值為 null 或條目不寫入
AND 後續使用根層路徑

### Scenario 9-3: state 更新寫入正確的 workflow
GIVEN workflowId = `"wf-A"` 已從 active-workflow-id 讀取
WHEN pre-task-handler 執行 `updateStateAtomic`
THEN `workflows/wf-A/workflow.json` 被更新
AND 根層 `workflow.json` 不受影響
