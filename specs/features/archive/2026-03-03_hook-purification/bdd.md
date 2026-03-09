# Feature: Hook 純化 — P3 Hook Purification

## 概述

將 `on-stop.js`（441 行）重構為薄 orchestrator（< 200 行），提取兩個獨立 lib 模組：
- `stop-message-builder.js`：純函式，負責 prompt 組裝
- `knowledge-archiver.js`：副作用函式，負責知識歸檔
- `shouldSuggestCompact`：搬遷至 `hook-utils.js`

同時修改 `retrospective.md` 和 `doc-updater.md` agent prompt，將 RETRO dead-code 掃描與 DOCS sync 校驗的觸發責任從 hook 移至 agent 本身。

---

## Feature 1: stop-message-builder.js — PASS 路徑

### Scenario 1-1: PASS 且有 nextHint — 輸出階段完成 + 下一步提示
GIVEN `buildStopMessages` 被呼叫
AND `ctx.verdict` 為 `'pass'`
AND `ctx.nextHint` 為非空字串（例如「委派 tester 執行測試」）
WHEN 函式執行
THEN 回傳的 `messages` 包含標示「完成」的訊息（含 ✅）
AND `messages` 包含下一步提示（含 nextHint 內容）
AND `messages` 包含 TaskList 更新提示
AND `timelineEvents` 為空陣列（無條件性事件）
AND `stateUpdates` 為空陣列

### Scenario 1-2: PASS 且無 nextHint — 輸出所有階段已完成
GIVEN `buildStopMessages` 被呼叫
AND `ctx.verdict` 為 `'pass'`
AND `ctx.nextHint` 為 `null`
WHEN 函式執行
THEN `messages` 包含「所有階段已完成」（含 🎉）
AND `messages` 包含建議委派 planner 的提示
AND `timelineEvents` 為空陣列

### Scenario 1-3: PASS 且有 featureName — 輸出 specs 路徑提示
GIVEN `buildStopMessages` 被呼叫
AND `ctx.verdict` 為 `'pass'`
AND `ctx.featureName` 為 `'my-feature'`
AND `ctx.nextHint` 為非空字串
WHEN 函式執行
THEN `messages` 包含 `specs/features/in-progress/my-feature/` 路徑字串

### Scenario 1-4: PASS + parallel convergence — 輸出收斂提示且 emit parallel:converge
GIVEN `buildStopMessages` 被呼叫
AND `ctx.verdict` 為 `'pass'`
AND `ctx.convergence` 為 `{ group: 'REVIEW+TEST' }`
WHEN 函式執行
THEN `messages` 包含並行群組收斂提示
AND `timelineEvents` 包含一個 `{ type: 'parallel:converge', data: { group: 'REVIEW+TEST' } }` 事件

### Scenario 1-5: PASS + compactSuggestion.suggest=true — 輸出 compact 建議且 emit session:compact-suggestion
GIVEN `buildStopMessages` 被呼叫
AND `ctx.verdict` 為 `'pass'`
AND `ctx.nextHint` 為非空字串
AND `ctx.compactSuggestion` 為 `{ suggest: true, transcriptSize: '6.2 MB', reason: '...' }`
WHEN 函式執行
THEN `messages` 包含 compact 建議字串（含 transcript 大小）
AND `timelineEvents` 包含一個 `type: 'session:compact-suggestion'` 事件

---

## Feature 2: stop-message-builder.js — FAIL 路徑

### Scenario 2-1: FAIL 且 failCount 未達上限 — 輸出重試提示且 emit stage:retry
GIVEN `buildStopMessages` 被呼叫
AND `ctx.verdict` 為 `'fail'`
AND `ctx.state.failCount` 為 `1`（retryDefaults.maxRetries 為 `3`）
WHEN 函式執行
THEN `messages` 包含失敗標記（含 ❌）且含 failCount/maxRetries 比例
AND `messages` 包含「委派 DEBUGGER」的下一步提示
AND `timelineEvents` 包含一個 `type: 'stage:retry'` 事件

### Scenario 2-2: FAIL 且 failCount 達上限 — 輸出人工介入提示且 emit error:fatal
GIVEN `buildStopMessages` 被呼叫
AND `ctx.verdict` 為 `'fail'`
AND `ctx.state.failCount` 等於 `retryDefaults.maxRetries`（例如 3）
WHEN 函式執行
THEN `messages` 包含「已達重試上限」（含 ⛔）
AND `messages` 包含「人工介入」字串
AND `timelineEvents` 包含一個 `type: 'error:fatal'` 事件

### Scenario 2-3: FAIL + rejectCount > 0 — 輸出雙重失敗協調提示
GIVEN `buildStopMessages` 被呼叫
AND `ctx.verdict` 為 `'fail'`
AND `ctx.state.failCount` 為 `1`（未達上限）
AND `ctx.state.rejectCount` 為 `1`
WHEN 函式執行
THEN `messages` 包含「雙重失敗」或「協調策略」提示字串
AND `messages` 不包含普通的「委派 DEBUGGER」單一路徑提示（替換為協調策略）

---

## Feature 3: stop-message-builder.js — REJECT 路徑

### Scenario 3-1: REJECT 且 rejectCount 未達上限 — 輸出審查拒絕提示
GIVEN `buildStopMessages` 被呼叫
AND `ctx.verdict` 為 `'reject'`
AND `ctx.state.rejectCount` 為 `1`
WHEN 函式執行
THEN `messages` 包含審查拒絕標記（含 🔙）
AND `messages` 包含「委派 DEVELOPER 修復」的下一步提示
AND `timelineEvents` 不包含 `stage:retry`（reject 不 emit stage:retry）

### Scenario 3-2: REJECT 且 rejectCount 達上限 — 輸出人工介入提示且 emit error:fatal
GIVEN `buildStopMessages` 被呼叫
AND `ctx.verdict` 為 `'reject'`
AND `ctx.state.rejectCount` 等於 `retryDefaults.maxRetries`
WHEN 函式執行
THEN `messages` 包含「審查拒絕已達上限」（含 ⛔）
AND `messages` 包含「人工介入」字串
AND `timelineEvents` 包含一個 `type: 'error:fatal'` 事件

### Scenario 3-3: REJECT + failCount > 0 — 輸出雙重失敗協調提示
GIVEN `buildStopMessages` 被呼叫
AND `ctx.verdict` 為 `'reject'`
AND `ctx.state.rejectCount` 為 `1`（未達上限）
AND `ctx.state.failCount` 為 `1`
WHEN 函式執行
THEN `messages` 包含「雙重失敗」或「協調策略」提示字串
AND `messages` 包含 TEST FAIL 優先的協調策略說明

---

## Feature 4: stop-message-builder.js — ISSUES 路徑

### Scenario 4-1: ISSUES 且 retroCount 遞增 — 輸出回顧完成訊息
GIVEN `buildStopMessages` 被呼叫
AND `ctx.verdict` 為 `'issues'`
AND 當前 `retroCount` 為 `0`（遞增後為 `1`）
WHEN 函式執行
THEN `messages` 包含「回顧完成」字串且含 retroCount 比例（如 `1/3`）
AND `stateUpdates` 包含一個 retroCount 遞增函式
AND `messages` 包含「可選觸發 /auto」的提示

### Scenario 4-2: ISSUES 且 retroCount 達上限 — 輸出迭代上限提示
GIVEN `buildStopMessages` 被呼叫
AND `ctx.verdict` 為 `'issues'`
AND 遞增後 `retroCount` 達到 `3`
WHEN 函式執行
THEN `messages` 包含「已達迭代上限」字串
AND `messages` 包含「建議繼續完成剩餘 stages」提示

---

## Feature 5: stop-message-builder.js — 附加條件場景

### Scenario 5-1: tasksCheckboxWarning 非空 — 訊息最前面含警告
GIVEN `buildStopMessages` 被呼叫
AND `ctx.verdict` 為 `'pass'`
AND `ctx.tasksCheckboxWarning` 為非空字串（如 `'EACCES: permission denied'`）
WHEN 函式執行
THEN `messages` 包含 tasks.md 勾選失敗警告（含 ⚠️）
AND 警告字串出現在其他提示訊息之前

### Scenario 5-2: grader hint 不在 messages 中（已移至 completion-signals.md）
GIVEN `buildStopMessages` 被呼叫
AND `ctx.verdict` 為 `'pass'`
AND `ctx.nextHint` 為非空字串
WHEN 函式執行
THEN `messages` 中不包含 `'grader'` 或 `'ot:grader'` 字串
AND `messages` 中不包含「評估此階段輸出品質」字串

### Scenario 5-3: compactSuggestion.suggest=false — 無 compact 相關訊息
GIVEN `buildStopMessages` 被呼叫
AND `ctx.verdict` 為 `'pass'`
AND `ctx.compactSuggestion` 為 `{ suggest: false }`
WHEN 函式執行
THEN `messages` 中不包含「compact」或「/compact」字串
AND `timelineEvents` 中不包含 `session:compact-suggestion` 事件

---

## Feature 6: knowledge-archiver.js — archiveKnowledge

### Scenario 6-1: 輸出含 Findings 區塊 — archived > 0
GIVEN `archiveKnowledge` 被呼叫
AND `agentOutput` 包含 `### Findings` 區塊且有具體技術知識內容（如「使用 describe/it 組織 BDD 測試」）
AND `ctx.agentName` 為 `'developer'`
AND `ctx.projectRoot` 指向真實的 overtone 專案根目錄
WHEN 函式執行
THEN 回傳值的 `archived` 大於 `0`
AND 回傳值的 `errors` 為 `0`
AND 函式不拋出例外

### Scenario 6-2: 空輸出 — archived = 0
GIVEN `archiveKnowledge` 被呼叫
AND `agentOutput` 為空字串
AND `ctx.agentName` 為 `'developer'`
WHEN 函式執行
THEN 回傳值的 `archived` 為 `0`
AND 回傳值的 `errors` 為 `0`

### Scenario 6-3: 單個 fragment 寫入失敗 — errors 遞增但不拋錯
GIVEN `archiveKnowledge` 被呼叫
AND `agentOutput` 包含可提取的知識 fragment
AND `ctx.projectRoot` 指向一個 skill 目錄不存在或不可寫入的路徑
WHEN 函式執行
THEN 回傳值的 `errors` 大於 `0`
AND 函式不拋出例外（靜默容錯）

### Scenario 6-4: 多 fragments 但部分失敗 — 繼續處理其餘 fragments
GIVEN `archiveKnowledge` 被呼叫
AND `agentOutput` 包含多個可提取的知識 fragment
AND 其中部分 fragment 路由失敗
WHEN 函式執行
THEN 成功的 fragment 的 `archived` 計數正確
AND 失敗的 fragment 的 `errors` 計數正確
AND 函式不因任一 fragment 失敗而中止

### Scenario 6-5: instinct performance 觀察紀錄 — 成功歸檔時不干擾主流程
GIVEN `archiveKnowledge` 被呼叫
AND `agentOutput` 包含可提取的知識
AND `ctx.sessionId` 為有效的 session ID（session 目錄存在）
WHEN 函式執行
THEN 函式正常回傳（不因 instinct 操作失敗而拋錯）

---

## Feature 7: shouldSuggestCompact 搬遷至 hook-utils.js

### Scenario 7-1: 從 hook-utils.js import 行為與原版一致
GIVEN `hook-utils.js` 匯出 `shouldSuggestCompact` 函式
AND `on-stop.js` 不再匯出 `shouldSuggestCompact`
AND transcript 檔案大小超過閾值
AND 距上次 compact 後已有 2 個以上 stage:complete
WHEN 呼叫 `shouldSuggestCompact({ transcriptPath, sessionId })`
THEN 回傳 `{ suggest: true, transcriptSize: ..., reason: ... }`

---

## Feature 8: on-stop.js 整體行為（重構後）

### Scenario 8-1: RETRO 完成後 hook result 不含 dead code 掃描結果
GIVEN `on-stop.js` 重構完成後以子進程執行
AND 輸入 `agent_type: 'ot:retrospective'`
AND 輸入 `last_assistant_message` 包含 `'VERDICT: pass'`
AND workflow state 中 RETRO stage 為 active
WHEN hook 執行
THEN hook 的 `result` JSON 輸出不包含「Dead Code 掃描」字串
AND `result` 不包含「未使用 exports」或「孤立檔案」字串
AND `result` 包含 ✅（RETRO 正常完成）

### Scenario 8-2: DOCS 完成後 hook result 不含 docs sync 結果
GIVEN `on-stop.js` 重構完成後以子進程執行
AND 輸入 `agent_type: 'ot:doc-updater'`
AND 輸入 `last_assistant_message` 包含 `'VERDICT: pass'`
AND workflow state 中 DOCS stage 為 active
WHEN hook 執行
THEN hook 的 `result` JSON 輸出不包含「文件數字自動修復」字串
AND `result` 不包含「docs sync」相關字串
AND `result` 包含 ✅（DOCS 正常完成）

### Scenario 8-3: grader hint 不在 hook result 中
GIVEN `on-stop.js` 重構完成後以子進程執行
AND 輸入 `agent_type: 'ot:developer'`
AND 輸入 `last_assistant_message` 包含 `'VERDICT: pass'`
AND workflow state 中 DEV stage 為 active 且後續還有 stages
WHEN hook 執行
THEN hook 的 `result` JSON 輸出不包含 `'grader'` 字串
AND `result` 不包含「評估此階段輸出品質」字串

### Scenario 8-4: on-stop.js module.exports 為空物件
GIVEN `on-stop.js` 重構完成
WHEN `require('on-stop.js')` 被呼叫
THEN 回傳值等於 `{}`
AND `shouldSuggestCompact` 不在 exports 中
AND `formatSize` 不在 exports 中

---

## Feature 9: Agent Prompt 行為

### Scenario 9-1: retrospective.md 含 dead code 掃描指引（系統通知語意）
GIVEN `retrospective.md` agent prompt 已更新
WHEN 讀取 `plugins/overtone/agents/retrospective.md` 內容
THEN 文件的 body 包含關於 dead code 掃描的指引文字
AND 指引說明「系統自動掃描」（非要求 agent 手動執行）
AND 指引使用 💡 標記（軟引導層級，非 📋 強制）

### Scenario 9-2: doc-updater.md 含 docs sync 校驗指引（系統通知語意）
GIVEN `doc-updater.md` agent prompt 已更新
WHEN 讀取 `plugins/overtone/agents/doc-updater.md` 內容
THEN 文件的 body 包含關於 docs sync 校驗的指引文字
AND 指引說明「系統自動執行校驗」（非要求 agent 手動執行）
AND 指引使用 💡 標記（軟引導層級，非 📋 強制）

---

## Feature 10: compact-suggestion.test.js import 路徑更新

### Scenario 10-1: shouldSuggestCompact 從 hook-utils.js import 且測試全部通過
GIVEN `compact-suggestion.test.js` 已將 import 路徑從 `on-stop.js` 改為 `hook-utils.js`
AND `formatSize` 已從 `utils.js` import
WHEN 執行 `bun test tests/integration/compact-suggestion.test.js`
THEN 所有 12 個 scenario 全部通過（0 fail）

---

## Feature 11: on-stop.js 行數目標

### Scenario 11-1: 重構後 on-stop.js 行數不超過 200 行
GIVEN `on-stop.js` 重構完成
WHEN 統計 `on-stop.js` 的實際程式碼行數
THEN 總行數（含空白行和註解）不超過 200 行
AND 檔案仍能正確執行（現有整合測試全部通過）
