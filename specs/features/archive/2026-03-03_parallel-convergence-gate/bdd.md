---
feature: parallel-convergence-gate
stage: TEST
created: 2026-03-04
workflow: standard
---

# Feature: 並行收斂門（Parallel Convergence Gate）

同 stage 多 agent 並行執行時，透過 `instanceId` 追蹤、`parallelTotal/parallelDone` 計數、以及收斂門判斷，確保所有 instance 全部完成後才將 stage 標記為 completed。

---

## Feature 1: checkSameStageConvergence 函式

### Scenario 1-1: parallelTotal 未設定時視為已收斂（單 agent 向後相容）
GIVEN stageEntry 為 `{ status: 'active', parallelDone: 0 }`
AND stageEntry 不含 `parallelTotal` 欄位
WHEN 呼叫 `checkSameStageConvergence(stageEntry)`
THEN 回傳 `true`（視為已收斂，行為與舊版單 agent 場景一致）

### Scenario 1-2: parallelDone 小於 parallelTotal 時未收斂
GIVEN stageEntry 為 `{ status: 'active', parallelTotal: 3, parallelDone: 1 }`
WHEN 呼叫 `checkSameStageConvergence(stageEntry)`
THEN 回傳 `false`（尚有 2 個 instance 未完成）

### Scenario 1-3: parallelDone 等於 parallelTotal 時已收斂
GIVEN stageEntry 為 `{ status: 'active', parallelTotal: 3, parallelDone: 3 }`
WHEN 呼叫 `checkSameStageConvergence(stageEntry)`
THEN 回傳 `true`（所有 instance 均已完成）

### Scenario 1-4: parallelDone 大於 parallelTotal 時已收斂（防禦性）
GIVEN stageEntry 為 `{ status: 'active', parallelTotal: 2, parallelDone: 3 }`
WHEN 呼叫 `checkSameStageConvergence(stageEntry)`
THEN 回傳 `true`（parallelDone >= parallelTotal 一律視為收斂）

### Scenario 1-5: stageEntry 為 null 時回傳 true 且不拋出例外
GIVEN stageEntry 為 `null`
WHEN 呼叫 `checkSameStageConvergence(null)`
THEN 回傳 `true`
AND 不拋出例外（防禦性預設：無法確認時視為已收斂）

### Scenario 1-6: stageEntry 為 undefined 時回傳 true 且不拋出例外
GIVEN stageEntry 為 `undefined`
WHEN 呼叫 `checkSameStageConvergence(undefined)`
THEN 回傳 `true`
AND 不拋出例外

---

## Feature 2: pre-task.js instanceId 追蹤

### Scenario 2-1: 並行委派 3 個 developer 時 activeAgents 有 3 個獨立 instanceId key
GIVEN Main Agent 依序啟動 3 個 developer subagent
AND 每次啟動都觸發 pre-task.js（同一個 sessionId，同一個 DEV stage）
WHEN 3 個 pre-task.js 均執行完畢
THEN `workflow.json` 的 `activeAgents` 中有 3 個 key，格式均符合 `developer:timestamp36-random6`
AND 3 個 key 彼此不相同（無碰撞）
AND 每個 entry 包含 `agentName: 'developer'`、`stage: 'DEV'`、`startedAt`

### Scenario 2-2: prompt 含 PARALLEL_TOTAL: 3 時 stage entry 寫入 parallelTotal = 3
GIVEN DEV stage 為 pending 狀態
AND 啟動的 subagent prompt 包含文字 `PARALLEL_TOTAL: 3`
WHEN pre-task.js 執行
THEN `workflow.json` 的 `stages.DEV.parallelTotal` 設定為 `3`

### Scenario 2-3: prompt 不含 PARALLEL_TOTAL 時 parallelTotal 不被設定
GIVEN DEV stage 為 pending 狀態
AND 啟動的 subagent prompt 不包含 `PARALLEL_TOTAL` 文字
WHEN pre-task.js 執行
THEN `workflow.json` 的 `stages.DEV` 不含 `parallelTotal` 欄位
AND `checkSameStageConvergence` 將視為已收斂（parallelTotal = 1）

### Scenario 2-4: updatedInput 注入 [PARALLEL INSTANCE] 區塊
GIVEN subagent prompt 包含 `PARALLEL_TOTAL: 3`
AND pre-task.js 產生 instanceId `developer:m3xap2k-f7r9qz`
WHEN pre-task.js 處理 updatedInput
THEN 回傳的 updatedInput.prompt 最前面包含 `[PARALLEL INSTANCE]` 區塊
AND 區塊中包含 `INSTANCE_ID: developer:m3xap2k-f7r9qz`
AND 區塊中包含 `PARALLEL_TOTAL: 3`
AND 原始 prompt 內容保留在後面

### Scenario 2-5: 多個並行 pre-task 執行 parallelTotal 取最大值（race condition 防禦）
GIVEN DEV stage 已有 `parallelTotal: 2`（第二個 instance 的 pre-task 已執行）
AND 第三個 instance 的 pre-task 帶入 `PARALLEL_TOTAL: 3`
WHEN pre-task.js 執行原子更新
THEN `stages.DEV.parallelTotal` 更新為 `3`（取 Math.max(2, 3)）

---

## Feature 3: on-stop.js 收斂門

### Scenario 3-1: 並行 3 個 developer 全部 pass 時前 2 個完成後 stage 仍 active
GIVEN DEV stage 為 active，parallelTotal = 3，parallelDone = 0
AND developer:inst1、developer:inst2、developer:inst3 均在 activeAgents 中
WHEN developer:inst1 完成（verdict = pass）
THEN `stages.DEV.parallelDone` 遞增為 1
AND `stages.DEV.status` 仍為 `active`（尚未收斂）
AND `currentStage` 不跳轉
AND `active-agent.json` 不刪除

### Scenario 3-2: 並行 3 個 developer 第 2 個完成後 stage 仍 active
GIVEN DEV stage 為 active，parallelTotal = 3，parallelDone = 1
AND developer:inst2 完成（verdict = pass）
WHEN on-stop.js 執行收斂門判斷
THEN `stages.DEV.parallelDone` 遞增為 2
AND `stages.DEV.status` 仍為 `active`
AND `active-agent.json` 仍存在

### Scenario 3-3: 並行 3 個 developer 全部 pass 時第 3 個完成後 stage 標記 completed + pass
GIVEN DEV stage 為 active，parallelTotal = 3，parallelDone = 2
AND 最後一個 developer:inst3 完成（verdict = pass）
WHEN on-stop.js 執行收斂門判斷
THEN `stages.DEV.parallelDone` 遞增為 3
AND `stages.DEV.status` 更新為 `completed`
AND `stages.DEV.result` 更新為 `pass`
AND `stages.DEV.completedAt` 設定為當前時間
AND `currentStage` 跳轉至下一個 pending stage
AND `active-agent.json` 被刪除

### Scenario 3-4: 並行 3 個 developer 其中 1 個 fail 時立即標記 stage completed + fail
GIVEN DEV stage 為 active，parallelTotal = 3，parallelDone = 1
AND developer:inst2 完成（verdict = fail）
WHEN on-stop.js 執行收斂門判斷
THEN `stages.DEV.status` 立即更新為 `completed`
AND `stages.DEV.result` 更新為 `fail`
AND `currentStage` 跳轉至下一個 pending stage
AND `stages.DEV.parallelDone` 遞增（記錄此次完成）
AND `failCount` 遞增

### Scenario 3-5: 先 fail 再 pass 時 stage 結果維持 fail（不被後續 pass 覆蓋）
GIVEN DEV stage 已 completed + fail（parallelDone = 1，parallelTotal = 3）
AND developer:inst3 完成（verdict = pass）到達 on-stop.js
WHEN on-stop.js 嘗試更新已 completed 的 stage
THEN `stages.DEV.result` 保持 `fail`（不改為 pass）
AND `stages.DEV.status` 保持 `completed`
AND `activeAgents` 中的 instanceId 被清除（cleanup 仍執行）
AND timeline 記錄 `agent:complete` 事件（但不重複記錄 `stage:complete`）

### Scenario 3-6: instanceId 從 agentOutput regex 解析成功
GIVEN agent 的輸出（agentOutput）末尾包含文字 `INSTANCE_ID: developer:m3xap2k-f7r9qz`
WHEN on-stop.js 以 `/INSTANCE_ID:\s*(\S+)/` 解析 agentOutput
THEN 取得 instanceId = `developer:m3xap2k-f7r9qz`
AND 以此 instanceId 清除 `activeAgents` 中對應的 entry

### Scenario 3-7: instanceId 解析失敗時 fallback 至最早的同名 instance
GIVEN agentOutput 不含 `INSTANCE_ID:` 文字
AND `activeAgents` 中有 `developer:aaaa01-xxx`（較早）和 `developer:bbbb02-yyy`（較新）
WHEN on-stop.js 嘗試解析 instanceId 失敗
THEN fallback：選取 `activeAgents` 中 key 以 `developer:` 開頭且按字典序最小的 key（`developer:aaaa01-xxx`）
AND 以此 key 清除 `activeAgents` 中的 entry

### Scenario 3-8: active-agent.json 未收斂時不刪除，收斂後才刪除
GIVEN DEV stage parallelTotal = 3，parallelDone = 1
WHEN developer:inst1 完成（第 1 個，未收斂）
THEN `active-agent.json` 仍然存在（不刪除）
AND parallelDone 遞增為 2

GIVEN DEV stage parallelTotal = 3，parallelDone = 2
WHEN developer:inst3 完成（第 3 個，已收斂）
THEN `active-agent.json` 被刪除

### Scenario 3-9: timeline 每個 instance 完成都 emit agent:complete，只有收斂時才 emit stage:complete
GIVEN DEV stage parallelTotal = 3
WHEN developer:inst1 完成（parallelDone 1/3，未收斂）
THEN timeline 記錄 `agent:complete` 事件，包含 instanceId
AND timeline 不記錄 `stage:complete` 事件

WHEN developer:inst3 完成（parallelDone 3/3，已收斂）
THEN timeline 記錄 `agent:complete` 事件
AND timeline 記錄 `stage:complete` 事件

### Scenario 3-10: 非並行場景（parallelTotal 未設定）第一個完成即收斂，行為與舊版一致
GIVEN DEV stage 為 active，不含 `parallelTotal` 欄位，parallelDone 未設定
AND developer:inst1 完成（verdict = pass）
WHEN on-stop.js 執行收斂門判斷
THEN `checkSameStageConvergence` 回傳 true（parallelTotal 視為 1）
AND `stages.DEV.status` 立即更新為 `completed`
AND `stages.DEV.result` 更新為 `pass`
AND 行為與舊版系統完全一致

---

## Feature 4: findActualStageKey 並行場景

### Scenario 4-1: stage active 且 parallelDone 小於 parallelTotal 時仍可被找到
GIVEN `stages.DEV` 為 `{ status: 'active', parallelTotal: 3, parallelDone: 1 }`
WHEN 呼叫 `findActualStageKey(state, 'DEV')`
THEN 回傳 `'DEV'`（active stage 在並行未收斂時仍可被找到）

### Scenario 4-2: stage active 且 parallelDone 等於 parallelTotal 時（已收斂但尚未由 on-stop 標記 completed）仍可被找到
GIVEN `stages.DEV` 為 `{ status: 'active', parallelTotal: 3, parallelDone: 3 }`
WHEN 呼叫 `findActualStageKey(state, 'DEV')`
THEN 回傳 `'DEV'`（active stage 不因 parallelDone 數值而失效）

### Scenario 4-3: stage completed + fail 時仍可被找到（retry 路徑，含並行場景）
GIVEN `stages.DEV` 為 `{ status: 'completed', result: 'fail', parallelTotal: 3, parallelDone: 1 }`
AND 並行中有 1 個 instance fail，stage 已提前標記 completed
WHEN 呼叫 `findActualStageKey(state, 'DEV')`
THEN 回傳 `'DEV'`（後續到達的 instance 的 on-stop 仍能找到此 stage 做 cleanup）

---

## Feature 5: getNextStageHint activeAgents instanceId 格式適配

### Scenario 5-1: activeAgents 使用 instanceId 為 key 時 hint 顯示 agentName 而非 instanceId
GIVEN `activeAgents` 為 `{ 'developer:m3xap2k-f7r9qz': { agentName: 'developer', stage: 'DEV', startedAt: '...' } }`
AND DEV stage 為 active
WHEN 呼叫 `getNextStageHint(state, options)`
THEN hint 文字包含 `developer`（agentName）
AND hint 文字不包含完整的 instanceId（`developer:m3xap2k-f7r9qz`）

### Scenario 5-2: 多個 instanceId 時 hint 顯示所有不重複的 agentName
GIVEN `activeAgents` 包含 `developer:inst1`、`developer:inst2`、`developer:inst3`
AND 三個 entry 的 `agentName` 均為 `developer`
WHEN 呼叫 `getNextStageHint(state, options)`
THEN hint 文字含 `developer`
AND 不重複顯示相同的 agentName（顯示一次即可）

### Scenario 5-3: 無 agentName 欄位時 fallback 到 instanceId 的冒號前半段
GIVEN `activeAgents` 中有 `developer:m3xap2k-f7r9qz`
AND entry 不含 `agentName` 欄位（舊格式）
WHEN 呼叫 `getNextStageHint(state, options)`
THEN hint 文字包含 `developer`（從 `'developer:m3xap2k-f7r9qz'.split(':')[0]` 取得）

---

## Feature 6: statusline × N 回歸驗證

### Scenario 6-1: 單一 developer active 時顯示 developer（無 × N 後綴）
GIVEN `workflow.stages` 中 DEV 為 active，parallelTotal 未設定
AND `active-agent.json` 存在，agent = developer
WHEN statusline.js 計算顯示格式
THEN 顯示 `developer`
AND 不含 `× 2` 或 `× N` 文字

### Scenario 6-2: 單一 stage key 並行時 statusline 不顯示 × N
GIVEN `workflow.stages.DEV` 為 `{ status: 'active', parallelTotal: 3, parallelDone: 1 }`
AND `active-agent.json` 存在，agent = developer（單一物件格式）
WHEN statusline.js 計算顯示格式
THEN 顯示 `developer`
AND 不含 `× 3` 或 `× N` 文字（因為只有一個 stage key DEV 為 active）
AND active-agent.json 格式不變（仍為單一物件，不因並行而變為陣列）
AND statusline 不因 active-agent.json 格式而崩潰
NOTE: × N 僅在有多個不同 stage key 同時為 active 時顯示（如 DEV + DEV:2）；同一個 stage key 的多個 instance 共用同一個 active-agent.json 物件，不觸發 × N 邏輯

---

## Feature 7: 邊界案例與競態條件

### Scenario 7-1: stage 已 completed 但後續 agent 的 on-stop 仍觸發時只做 cleanup
GIVEN DEV stage 已 `completed + fail`（parallelDone = 1，parallelTotal = 3）
AND developer:inst2 的 on-stop 在 stage 已 completed 後到達
WHEN on-stop.js 執行
THEN `stages.DEV.result` 不改變（維持 `fail`）
AND `stages.DEV.status` 不改變（維持 `completed`）
AND `activeAgents` 中 `developer:inst2` 的 entry 被清除
AND timeline 記錄 `agent:complete`（記錄個別 instance 完成）
AND timeline 不重複記錄 `stage:complete`

### Scenario 7-2: 兩個 instance 幾乎同時完成時 atomicWrite CAS 重試保證 parallelDone 正確
GIVEN DEV stage parallelTotal = 2，parallelDone = 0
AND developer:inst1 和 developer:inst2 的 on-stop 幾乎同時觸發
WHEN 兩次 `updateStateAtomic` 近乎並行執行（CAS + 最多 3 次重試）
THEN 最終 `parallelDone = 2`（不漏計）
AND stage 最終標記為 `completed + pass`（若兩個均 pass）
AND 不出現重複標記 completed 的狀況

### Scenario 7-3: PARALLEL_TOTAL prompt 含非數字字串時安全忽略
GIVEN subagent prompt 包含 `PARALLEL_TOTAL: abc`（非法數字）
WHEN pre-task.js 解析 PARALLEL_TOTAL
THEN `parseInt('abc', 10)` 回傳 `NaN`
AND `parallelTotal` 不寫入 stage entry（視同未設定）
AND 不拋出例外

### Scenario 7-4: activeAgents 為空物件時 fallback 靜默失敗不拋出例外
GIVEN `activeAgents` 為空物件 `{}`
AND on-stop.js instanceId 解析失敗（agentOutput 無 INSTANCE_ID）
WHEN on-stop.js 嘗試 fallback 找最早的同名 instance
THEN `candidates` 為空陣列
AND `instanceId` fallback 為 `null`
AND 不拋出例外（`delete s.activeAgents[null]` 靜默忽略）
