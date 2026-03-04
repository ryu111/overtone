---
feature: core-simplification-guards
status: in-progress
created: 2026-03-04
author: tester
mode: spec
---

# Feature 1: 並行提示修復（A1 + A2）

Stop hook 的 continueMessage 和 PreCompact 的狀態恢復訊息，
應使用 `getNextStageHint()` 產生包含並行群組資訊的提示，取代硬編碼的單步文字。

## Scenario 1-1: Stop hook 下一步為並行群組時顯示並行提示

GIVEN workflow 處於 DEV 已完成、REVIEW 和 TEST 皆為 pending 的狀態
AND REVIEW 和 TEST 屬於同一個 parallelGroups 群組
AND activeAgents 為空（無殘留）
WHEN Stop hook 執行並組裝 continueMessage
THEN continueMessage 包含「並行委派 🔍 code-reviewer + 🧪 tester」格式的文字
AND continueMessage 不包含「委派 ... （單一 agent）」格式的文字

## Scenario 1-2: Stop hook 下一步為單一 stage 時顯示單步提示

GIVEN workflow 處於 ARCH 已完成、TEST:spec 為 pending 的狀態
AND TEST:spec 不屬於任何並行群組，或其並行群組成員均已完成
AND activeAgents 為空
WHEN Stop hook 執行並組裝 continueMessage
THEN continueMessage 包含「委派 🧪 tester（測試）」格式的單步提示
AND continueMessage 不包含「並行委派」文字

## Scenario 1-3: Stop hook 仍有 active agent 時顯示等待提示

GIVEN workflow 有 2 個 active stages（REVIEW:1 和 TEST:2）
AND activeAgents 有對應的 2 個 entry
WHEN Stop hook 執行並組裝 continueMessage
THEN getNextStageHint 回傳「等待並行 agent 完成：...」格式的文字
AND continueMessage 不推進到下一個 pending stage

## Scenario 1-4: PreCompact 恢復訊息顯示並行群組提示

GIVEN workflow 處於 DEV 已完成、REVIEW 和 TEST 皆為 pending 的狀態
AND REVIEW 和 TEST 屬於同一個 parallelGroups 群組
WHEN PreCompact hook 執行並組裝狀態恢復訊息
THEN 恢復訊息中「目前階段」行包含「並行委派 🔍 code-reviewer + 🧪 tester」格式的文字

## Scenario 1-5: PreCompact 恢復訊息在非並行 stage 時顯示單步提示

GIVEN workflow 處於 PLAN 已完成、ARCH 為 pending 的狀態
AND ARCH 不屬於任何並行群組（或群組只剩一個 pending member）
WHEN PreCompact hook 執行並組裝狀態恢復訊息
THEN 恢復訊息中「目前階段」行包含「委派 🏗️ architect（架構）」格式的單步提示

## Scenario 1-6: PreCompact currentStage 為 null 時不顯示目前階段行

GIVEN workflow 所有 stages 均已 completed（currentStage 為 null）
WHEN PreCompact hook 執行並組裝狀態恢復訊息
THEN 恢復訊息中不含「目前階段：」行
AND getNextStageHint 回傳 null，不引發錯誤

---

# Feature 2: 信號源簡化（B1 + B2 + B3）

移除 `active-agent.json` 雙信號源，統一由 `workflow.json` 的 stages.status
和 activeAgents 提供 agent 顯示資訊；PreCompact 壓縮後清空 activeAgents。

## Scenario 2-1: pre-task.js 委派 agent 後不產生 active-agent.json

GIVEN sessionId 有效且 workflow state 存在
WHEN pre-task.js 的 PreToolUse hook 執行（攔截 Task tool 呼叫）
THEN 不在 `~/.overtone/sessions/{sessionId}/active-agent.json` 寫入任何資料
AND workflow.json 的 activeAgents 中有新增對應的 instanceId entry

## Scenario 2-2: agent/on-stop.js 完成後不操作 active-agent.json

GIVEN sessionId 有效且 active-agent.json 不存在（或存在殘留）
WHEN agent/on-stop.js 的 SubagentStop hook 執行
THEN 不呼叫 unlinkSync 刪除 active-agent.json
AND 不呼叫 atomicWrite 更新 active-agent.json
AND workflow.json 的 activeAgents 中對應 instanceId entry 被移除

## Scenario 2-3: statusline.js 從 workflow stages 讀取 active agent

GIVEN workflow.json 有 1 個 stage 的 status 為 'active'（例如 DEV:1）
AND active-agent.json 不存在
WHEN statusline.js 執行 buildAgentDisplay
THEN 回傳包含對應 agent emoji 和名稱的字串（例如「💻 developer」）

## Scenario 2-4: statusline.js 並行場景正確顯示多個 active agents

GIVEN workflow.json 有 2 個 stage 的 status 為 'active'（REVIEW:1 和 TEST:2）
AND 兩者屬於不同的 base stage（REVIEW 和 TEST）
WHEN statusline.js 執行 buildAgentDisplay
THEN 回傳「🔍 code-reviewer + 🧪 tester」格式的字串
AND 若同一 base 有 3 個 active instances，顯示「💻 developer × 3」格式

## Scenario 2-5: statusline.js 無 active stage 時回傳 null

GIVEN workflow.json 所有 stage 的 status 均為 'pending' 或 'completed'
AND workflow.json 的 activeAgents 為空物件 `{}`
WHEN statusline.js 執行 buildAgentDisplay
THEN 回傳 null（觸發 statusline 單行模式，不顯示 agent 行）

## Scenario 2-6: statusline.js 不再讀取 active-agent.json

GIVEN active-agent.json 存在且包含 agent 資訊
AND workflow.json 所有 stages 均為 'pending' 或 'completed'
WHEN statusline.js 執行
THEN 不呼叫 readActiveAgent() 函式
AND 回傳 null（active-agent.json 資訊被完全忽略）

## Scenario 2-7: PreCompact 執行後 activeAgents 被清空

GIVEN workflow state 中 activeAgents 有 2 個 entry（模擬壓縮前殘留）
WHEN pre-compact.js 執行壓縮流程（compactCount 更新後）
THEN updateStateAtomic 被呼叫，將 activeAgents 設為空物件 `{}`
AND workflow.json 讀回後 activeAgents 為 `{}`

## Scenario 2-8: statusline.js 無 workflow 時回傳 null

GIVEN sessionId 有效但 workflow.json 不存在（workflow 尚未初始化）
WHEN statusline.js 執行 buildAgentDisplay（傳入 null workflow）
THEN 回傳 null

---

# Feature 3: State 不變量守衛（C1 + C2 + C3）

`updateStateAtomic` 在每次 modifier 執行後、writeState 前，
自動偵測並修復 3 種 state 違規，並在有違規時 emit `system:warning` timeline 事件。

## Scenario 3-1: 孤兒 activeAgent entry 被自動移除

GIVEN workflow state 的 activeAgents 中有 instanceId「tester:abc123」
AND 該 entry 的 stage 欄位為「TEST:999」，但 stages 中不存在「TEST:999」這個 key
WHEN updateStateAtomic 的 modifier 執行後觸發不變量守衛
THEN activeAgents 中「tester:abc123」entry 被移除
AND state 寫入檔案時不含此孤兒 entry

## Scenario 3-2: 合法的 activeAgent entry 不被移除

GIVEN workflow state 的 activeAgents 中有 instanceId「developer:xyz789」
AND 該 entry 的 stage 欄位為「DEV:1」，且 stages 中存在「DEV:1」這個 key
WHEN updateStateAtomic 的 modifier 執行後觸發不變量守衛
THEN activeAgents 中「developer:xyz789」entry 被保留
AND 沒有 warnings 因此條規則被記錄

## Scenario 3-3: stage status 逆轉（completed → active）被修正

GIVEN workflow state 中 stages.DEV:1.status 原為「completed」
WHEN modifier 嘗試將 stages.DEV:1.status 設為「active」
AND 不變量守衛在 modifier 後執行
THEN stages.DEV:1.status 維持「completed」（逆轉被阻止）
AND warnings 中包含 `{ rule: 'status-regression', stageKey: 'DEV:1', from: 'active', to: 'completed' }`

## Scenario 3-4: stage status 逆轉（active → pending，無 completedAt）允許通過

GIVEN workflow state 中 stages.ARCH:1.status 原為「active」且無 completedAt
WHEN modifier 嘗試將 stages.ARCH:1.status 設為「pending」
AND 不變量守衛在 modifier 後執行
THEN stages.ARCH:1.status 變為「pending」（無 completedAt 時允許逆轉，支援 retry 場景）
AND warnings 中不包含 status-regression 記錄

## Scenario 3-5: 合法的 status 轉換不產生 warning

GIVEN workflow state 中 stages.DEV:1.status 原為「active」
WHEN modifier 將 stages.DEV:1.status 設為「completed」
AND 不變量守衛在 modifier 後執行
THEN stages.DEV:1.status 維持「completed」（合法轉換，不阻止）
AND warnings 中不包含 status-regression 記錄

## Scenario 3-6: parallelDone 超出 parallelTotal 被截斷

GIVEN workflow state 中 stages.DEV:1.parallelTotal 為 3
WHEN modifier 將 stages.DEV:1.parallelDone 設為 5（超出上限）
AND 不變量守衛在 modifier 後執行
THEN stages.DEV:1.parallelDone 被修正為 3（parallelTotal 值）
AND warnings 中包含 `{ rule: 'parallel-done-overflow', stageKey: 'DEV:1', parallelDone: 5, parallelTotal: 3 }`

## Scenario 3-7: parallelDone 未超出 parallelTotal 時不截斷

GIVEN workflow state 中 stages.DEV:1.parallelTotal 為 3
WHEN modifier 將 stages.DEV:1.parallelDone 設為 3（等於上限，合法）
AND 不變量守衛在 modifier 後執行
THEN stages.DEV:1.parallelDone 維持 3（不修正）
AND warnings 中不包含 parallel-done-overflow 記錄

## Scenario 3-8: 違反不變量時 emit system:warning timeline 事件

GIVEN workflow state 有 1 個孤兒 activeAgent entry 和 1 個 status 逆轉
WHEN updateStateAtomic 的 modifier 執行後觸發不變量守衛
THEN 不變量守衛修復所有違規後，呼叫 timeline.emit 寫入 system:warning 事件
AND 事件的 warnings 陣列包含所有違規記錄（2 個）
AND 事件格式符合 `{ type: 'system:warning', category: 'system', label: '系統警告', warnings: [...] }`

## Scenario 3-9: 無違規時不 emit system:warning

GIVEN workflow state 完全合法（無孤兒、無逆轉、parallelDone 未超限）
WHEN updateStateAtomic 的 modifier 執行後觸發不變量守衛
THEN 不呼叫 timeline.emit
AND state 正常寫入不受干擾

## Scenario 3-10: TTL 移除後孤兒 activeAgent 由不變量守衛清除（取代 TTL）

GIVEN workflow state 中 activeAgents 有一個 entry，其 stage 欄位「DEV:1」已 completed
AND stages 中 DEV:1 仍存在（key 存在，但 status 為 completed）
AND 此 entry 建立時間為 60 分鐘前（超過舊 TTL 30 分鐘）
WHEN 下一次 updateStateAtomic 呼叫時，modifier 不改變該 entry
AND 不變量守衛執行規則 1（孤兒清除）
THEN DEV:1 stage 存在（不是孤兒），entry 被保留
AND getNextStageHint 的「等待並行 agent 完成」顯示此 entry（需另行驗證孤兒場景）

## Scenario 3-11: TTL 移除後 getNextStageHint 不含 TTL 過濾邏輯

GIVEN state.js 的 getNextStageHint 移除 TTL 相關程式碼（30 分鐘常數及過濾邏輯）
WHEN 對 getNextStageHint 原始碼進行靜態掃描
THEN 不含「ACTIVE_AGENT_TTL_MS」常數定義
AND 不含 TTL 相關的時間過濾 filter 邏輯

## Scenario 3-12: TTL 移除後 statusline.js activeAgents fallback 不含 TTL 過濾

GIVEN statusline.js 的 buildAgentDisplay 移除 activeAgents fallback 的 TTL 過濾程式碼
WHEN 對 statusline.js 原始碼進行靜態掃描
THEN 不含「ACTIVE_AGENT_TTL_MS」常數定義（statusline.js 中）
AND activeAgents fallback 邏輯本身也已移除（依靠 stages.status 作為主信號）

## Scenario 3-13: TTL 移除後 pre-compact.js 活躍 agents 顯示不含 TTL 過濾

GIVEN pre-compact.js 的活躍 agents 顯示移除 TTL 過濾程式碼
WHEN 對 pre-compact.js 原始碼進行靜態掃描
THEN 不含「ACTIVE_AGENT_TTL_MS」常數定義（pre-compact.js 中）

---

# Feature 4: 整合驗證

確保所有修改組合後系統仍正常運作，無回歸。

## Scenario 4-1: bun test 全套通過（無回歸）

GIVEN 所有 A/B/C 三組修改均已完成
AND statusline.test.js 中依賴 active-agent.json 的測試已更新或移除
AND on-stop-stale-cleanup.test.js 中 TTL 相關測試已更新反映新行為
WHEN 從專案根目錄執行 `bun test`
THEN 所有測試通過（3015+ pass，0 fail）
AND 無任何 .skip 或 xit 測試被跳過（關鍵路徑）

## Scenario 4-2: 壓縮後重新委派的全鏈路正確性

GIVEN workflow 正在進行，activeAgents 有 2 個 active entry
WHEN PreCompact hook 執行（B3：清空 activeAgents）
AND 隨後 pre-task.js 委派新的 agent（寫入 activeAgents entry）
AND statusline.js 讀取 workflow state
THEN PreCompact 後 activeAgents 為空（清空成功）
AND 新 agent 委派後 activeAgents 有對應 entry
AND statusline 正確顯示新 agent 名稱

## Scenario 4-3: updateStateAtomic signature 向後相容

GIVEN state.js 的 updateStateAtomic 加入不變量守衛後
WHEN 現有的所有呼叫方（pre-task.js、on-stop.js 等）直接呼叫 updateStateAtomic(sessionId, modifier)
THEN 呼叫方不需要修改任何程式碼
AND updateStateAtomic 仍然回傳修改後的 state object

## Scenario 4-4: statusline.js buildAgentDisplay 新簽名

GIVEN statusline.js 移除 readActiveAgent 後
WHEN buildAgentDisplay 被呼叫
THEN 函式簽名為 buildAgentDisplay(workflow, registryStages)（2 個參數）
AND 不再接受 activeAgent 作為第一個參數
AND 所有呼叫點均已更新為新簽名
