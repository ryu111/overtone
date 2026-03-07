# Feature: 並行收斂門根因修復（convergence-gate-fix）

## Feature A：收斂門根因修復（方向 B — findActualStageKey 移入 updateStateAtomic）

## Scenario A-1: 兩個並行 agent 依序完成，stage 正確標記 completed
GIVEN 一個 workflow state 其中 TEST:1 和 TEST:2 為 parallelTotal=2 的並行 stage
AND TEST:1 和 TEST:2 的 status 均為 active
WHEN 第一個 agent（TEST:1）完成，handleAgentStop 被呼叫
AND 第二個 agent（TEST:2）完成，handleAgentStop 被呼叫
THEN 兩次呼叫後 stage 的 parallelDone 累計為 2
AND stage 的 status 標記為 completed
AND stage 的 result 標記為 pass

## Scenario A-2: 後到者補位場景 — 先到者已將 stage 標記 completed+pass
GIVEN 一個 workflow state 其中 TEST:1 的 status 已被先到者標記為 completed，result 為 pass，parallelDone 為 1，parallelTotal 為 2
AND 後到者（TEST:2）呼叫 handleAgentStop，stageKey 解析為相同基底 stage
WHEN findActualStageKey 在舊快照中找不到 active stage（因已被標記 completed）
AND updateStateAtomic callback 內使用最新 state，completed+pass 補位邏輯找到該 stage key
THEN 後到者正確將 parallelDone 從 1 遞增為 2
AND stage 的最終 parallelDone 等於 parallelTotal（2）
AND 收斂完成

## Scenario A-3: callback 內無匹配 stage，安全 early exit 不修改 state
GIVEN 一個 workflow state 其中不存在任何對應 stageKey 的 stage（active、pending 或 completed+pass 皆無）
WHEN handleAgentStop 被呼叫，updateStateAtomic callback 執行
AND findActualStageKey 和 completed+pass 補位邏輯皆回傳 null
THEN callback 回傳原始 state，不做任何修改
AND resolvedActualStageKey 為 null
AND 函式從 callback 外的 early exit 安全退出
AND 不拋出任何例外

---

## Feature B：Mid-session sanitize（方向 C — pre-task 委派前觸發 sanitize）

## Scenario B-1: PreToolUse(Task) 委派前觸發 sanitize，修復孤兒 active stage
GIVEN 一個 workflow state 其中有一個 stage 的 status 仍為 active（孤兒）
AND 該 stage 對應的 agent 實際上已不在 activeAgents 清單中
WHEN handlePreTask 被呼叫，通過路徑執行到 updateStateAtomic 之前
THEN state.sanitize(sessionId) 在寫入 activeAgents 之前被呼叫
AND 孤兒 active stage 被修復為 pending
AND 後續的 updateStateAtomic 使用已修復的 state

## Scenario B-2: sanitize 靜默處理 — workflow.json 不存在時不 throw
GIVEN sessionId 對應的 workflow.json 不存在於磁碟
WHEN handlePreTask 在通過路徑執行並呼叫 state.sanitize(sessionId)
THEN sanitize 內 readState 回傳 null，不拋出例外
AND try/catch 靜默捕獲任何錯誤
AND handlePreTask 正常繼續執行委派流程，不中斷

---

## Feature C：退化場景

## Scenario C-1: parallelTotal=1 時正常完成（非並行路徑）
GIVEN 一個 workflow state 其中某 stage 的 parallelTotal 未設定或為 1
WHEN handleAgentStop 被呼叫完成該 stage
THEN stage 正確標記為 completed
AND 不因 parallelTotal 缺失觸發任何錯誤
AND 收斂邏輯正常通過（checkSameStageConvergence 在 parallelTotal 未設定時回傳 true）
