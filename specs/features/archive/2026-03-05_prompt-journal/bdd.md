# Feature: Prompt Journal — intent_journal 觀察類型

擴展 Instinct 系統，透過 `intent_journal` 觀察類型記錄每次 UserPrompt 原文，並在 session 結束時配對工作流結果。

---

## Feature 1: skipDedup 機制（instinct.emit options）

### Scenario 1-1: emit 帶 skipDedup=true 時每次呼叫建立獨立記錄
GIVEN instinct 的某個 session 已有一筆 type='intent_journal'、tag='journal-abc' 的記錄
WHEN 以相同 type='intent_journal' 和 tag='journal-abc' 再次呼叫 emit()，並帶 options = { skipDedup: true }
THEN 結果中存在兩筆 tag='journal-abc' 的記錄（不合併）
AND 新記錄為一筆全新的物件，不覆蓋舊記錄

### Scenario 1-2: emit 不帶 options 時維持原有 tag+type 去重行為
GIVEN instinct 的某個 session 已有一筆 type='tool_preferences'、tag='pref-x' 的記錄（confidence=0.3）
WHEN 以相同 type 和 tag 呼叫 emit()，不傳第 6 參數
THEN 結果中只有一筆 tag='pref-x' 的記錄（已合併更新）
AND confidence 已更新（被 emit 邏輯修改）

### Scenario 1-3: emit 帶 options = {} 時行為等同於不帶 options（向後相容）
GIVEN 一個全新的 session（無任何 observations）
WHEN 呼叫 emit() 兩次，兩次都帶相同 type、tag，options = {}
THEN 結果中只有一筆記錄（skipDedup 預設為 false，正常去重）

### Scenario 1-4: emit 帶 skipDedup=false 時行為等同於不帶 options（明確關閉去重）
GIVEN 一個全新的 session（無任何 observations）
WHEN 呼叫 emit() 兩次，兩次都帶相同 type、tag，options = { skipDedup: false }
THEN 結果中只有一筆記錄（正常去重）

---

## Feature 2: extraFields 機制（instinct.emit options）

### Scenario 2-1: emit 帶 extraFields 時新建記錄包含額外欄位
GIVEN 一個全新的 session（無任何 observations）
WHEN 呼叫 emit() 帶 options = { skipDedup: true, extraFields: { sessionResult: 'pending', workflowType: 'standard' } }
THEN 建立的新記錄包含 sessionResult='pending' 和 workflowType='standard'
AND 其他標準欄位（id、ts、type、trigger、action、tag、confidence、count）仍正確填入

### Scenario 2-2: extraFields 不影響已存在記錄的去重邏輯（skipDedup=false）
GIVEN 一個全新的 session
WHEN 呼叫 emit() 兩次帶相同 type、tag，第二次帶 extraFields = { foo: 'bar' }，skipDedup=false
THEN 結果中只有一筆記錄（去重仍有效）
AND extraFields 不影響去重條件

### Scenario 2-3: emit 不帶 extraFields 時新建記錄不含多餘欄位
GIVEN 一個全新的 session
WHEN 呼叫 emit() 不傳 extraFields
THEN 建立的記錄不包含 sessionResult 欄位
AND 記錄不包含 workflowType 欄位

---

## Feature 3: registry.js journalDefaults 常數

### Scenario 3-1: journalDefaults 從 registry 正確匯出
GIVEN registry.js 已更新
WHEN require registry.js 並取 journalDefaults
THEN journalDefaults.maxPromptLength 等於 500
AND journalDefaults.loadTopN 等於 10
AND journalDefaults.minResultForGlobal 等於 'pass'

### Scenario 3-2: journalDefaults 是 module.exports 的一部分
GIVEN registry.js 已更新
WHEN 解構 require registry.js
THEN 可直接 const { journalDefaults } = require('./registry') 取得物件

---

## Feature 4: on-submit-handler intent_journal 記錄

### Scenario 4-1: UserPromptSubmit 時記錄 intent_journal（有進行中工作流）
GIVEN 一個有效的 sessionId
AND currentState.workflowType = 'standard'
AND userPrompt = '幫我寫一個登入頁面'
WHEN on-submit-handler 處理 UserPromptSubmit 事件
THEN session 的 observations 中新增一筆 type='intent_journal' 的記錄
AND 記錄的 trigger 等於 prompt 原文（'幫我寫一個登入頁面'）
AND 記錄的 action 包含 '工作流：standard'
AND 記錄的 tag 符合 'journal-' 前綴格式
AND 記錄的 sessionResult = 'pending'

### Scenario 4-2: UserPromptSubmit 時記錄 intent_journal（無進行中工作流）
GIVEN 一個有效的 sessionId
AND currentState = null（無工作流狀態）
AND userPrompt = '查詢 session 列表'
WHEN on-submit-handler 處理 UserPromptSubmit 事件
THEN session 的 observations 中新增一筆 type='intent_journal' 的記錄
AND 記錄的 action 包含 '無進行中工作流'
AND 記錄的 sessionResult = 'pending'

### Scenario 4-3: prompt 超過 500 字時截斷至 500 字
GIVEN userPrompt 長度為 800 字
WHEN on-submit-handler 處理 UserPromptSubmit 事件
THEN intent_journal 記錄的 trigger 長度不超過 500
AND trigger 為原始 prompt 的前 500 字

### Scenario 4-4: prompt 為空字串時記錄 '(empty prompt)'
GIVEN userPrompt = ''（空字串）
WHEN on-submit-handler 處理 UserPromptSubmit 事件
THEN intent_journal 記錄的 trigger = '(empty prompt)'

### Scenario 4-5: intent_journal 記錄使用 skipDedup=true（每次 prompt 產生獨立記錄）
GIVEN 一個 session 已有一筆 intent_journal 記錄
WHEN 同一 session 再次收到 UserPromptSubmit 事件（即使 prompt 相同）
THEN 產生第二筆獨立的 intent_journal 記錄（不合併）
AND 兩筆記錄的 tag 不同（各自唯一）

### Scenario 4-6: intent_journal 記錄失敗時不影響主流程（靜默失敗）
GIVEN on-submit-handler 執行環境中 instinct.emit 拋出例外
WHEN on-submit-handler 處理 UserPromptSubmit 事件
THEN 主流程繼續正常執行（無例外拋出）
AND 其他 systemMessage 處理邏輯不受影響

---

## Feature 5: session-end-handler resolveSessionResult 配對

### Scenario 5-1: completedStages 有內容時 sessionResult = 'pass'
GIVEN currentState.workflowType = 'standard'
AND currentState.completedStages = ['DEV', 'REVIEW']
WHEN 呼叫 resolveSessionResult(currentState)
THEN 回傳 'pass'

### Scenario 5-2: workflowType 存在但 completedStages 為空時 sessionResult = 'fail'
GIVEN currentState.workflowType = 'quick'
AND currentState.completedStages = []（空陣列）
WHEN 呼叫 resolveSessionResult(currentState)
THEN 回傳 'fail'

### Scenario 5-3: workflowType 存在但 completedStages 為 undefined 時 sessionResult = 'fail'
GIVEN currentState.workflowType = 'quick'
AND currentState.completedStages 欄位不存在（undefined）
WHEN 呼叫 resolveSessionResult(currentState)
THEN 回傳 'fail'

### Scenario 5-4: workflowType 為 null 時 sessionResult = 'abort'
GIVEN currentState.workflowType = null
WHEN 呼叫 resolveSessionResult(currentState)
THEN 回傳 'abort'

### Scenario 5-5: currentState 為 null 時 sessionResult = 'abort'
GIVEN currentState = null
WHEN 呼叫 resolveSessionResult(null)
THEN 回傳 'abort'

### Scenario 5-6: session 結束時所有 pending 的 intent_journal 更新 sessionResult
GIVEN 一個 session 有 3 筆 intent_journal 記錄，sessionResult 均為 'pending'
AND currentState.workflowType = 'standard'
AND currentState.completedStages = ['DEV']
WHEN session-end-handler 執行 intent_journal 配對邏輯
THEN 3 筆記錄的 sessionResult 全部更新為 'pass'
AND 3 筆記錄的 workflowType 全部更新為 'standard'

### Scenario 5-7: session 結束時只更新 pending 狀態的記錄（不覆蓋已配對的記錄）
GIVEN 一個 session 有 2 筆 intent_journal 記錄：一筆 sessionResult='pending'，一筆 sessionResult='pass'
WHEN session-end-handler 執行 intent_journal 配對邏輯
THEN 只有 pending 的記錄被更新
AND 已是 'pass' 的記錄維持不變

### Scenario 5-8: session 結束時 intent_journal 配對失敗不影響主流程（靜默失敗）
GIVEN _readAll 或 _writeAll 拋出例外
WHEN session-end-handler 執行 intent_journal 配對邏輯
THEN 主流程繼續完成（session 正常結束）
AND 不對外拋出例外

---

## Feature 6: queryGlobal excludeTypes 過濾

### Scenario 6-1: excludeTypes 過濾掉指定 type 的記錄
GIVEN 全域 observations 包含 type='intent_journal' 的記錄和 type='tool_preferences' 的記錄
WHEN 呼叫 queryGlobal(projectRoot, { excludeTypes: ['intent_journal'] })
THEN 回傳結果不包含任何 type='intent_journal' 的記錄
AND 回傳結果仍包含 type='tool_preferences' 的記錄

### Scenario 6-2: excludeTypes 為空陣列時不過濾任何記錄
GIVEN 全域 observations 包含多種 type 的記錄
WHEN 呼叫 queryGlobal(projectRoot, { excludeTypes: [] })
THEN 回傳結果包含所有 type 的記錄（與不帶 excludeTypes 相同）

### Scenario 6-3: excludeTypes 不傳時不過濾任何記錄（向後相容）
GIVEN 全域 observations 包含 type='intent_journal' 的記錄
WHEN 呼叫 queryGlobal(projectRoot, {})（不帶 excludeTypes）
THEN 回傳結果包含 type='intent_journal' 的記錄
AND 行為與舊版本一致（無破壞性變更）

### Scenario 6-4: excludeTypes 可同時排除多個 type
GIVEN 全域 observations 包含 type='intent_journal'、type='tool_preferences'、type='user_corrections' 的記錄
WHEN 呼叫 queryGlobal(projectRoot, { excludeTypes: ['intent_journal', 'tool_preferences'] })
THEN 回傳結果不包含 intent_journal 和 tool_preferences 類型
AND 回傳結果仍包含 type='user_corrections' 的記錄

### Scenario 6-5: excludeTypes 與 type filter 可同時使用（雙重過濾）
GIVEN 全域 observations 包含多種 type
WHEN 呼叫 queryGlobal(projectRoot, { type: 'tool_preferences', excludeTypes: ['intent_journal'] })
THEN 回傳結果只包含 type='tool_preferences' 的記錄
AND intent_journal 記錄被排除（儘管 type filter 未指定到它）

---

## Feature 7: SessionStart 注入「最近常做的事」摘要

### Scenario 7-1: 有 sessionResult=pass 的 intent_journal 時注入摘要
GIVEN 全域 observations 包含 3 筆 type='intent_journal'、sessionResult='pass' 的記錄
WHEN session-start-handler 建立 systemMessage
THEN systemMessage 包含 '最近常做的事' 段落
AND 每筆記錄以 '- [workflowType] prompt前60字' 格式列出

### Scenario 7-2: 無 sessionResult=pass 的記錄時不注入摘要
GIVEN 全域 observations 中 intent_journal 記錄全部 sessionResult='fail' 或 'abort'
WHEN session-start-handler 建立 systemMessage
THEN systemMessage 不包含 '最近常做的事' 段落

### Scenario 7-3: 全域觀察一般載入時排除 intent_journal（excludeTypes）
GIVEN 全域 observations 包含 type='intent_journal' 和 type='tool_preferences' 的記錄
WHEN session-start-handler 載入一般全域觀察（非最近常做的事段落）
THEN 一般全域觀察段落不包含任何 intent_journal 記錄
AND tool_preferences 記錄仍被包含

### Scenario 7-4: prompt 超過 60 字的 trigger 在摘要中截斷並加 '...'
GIVEN 一筆 intent_journal 記錄的 trigger 長度為 100 字
AND sessionResult = 'pass'
WHEN session-start-handler 建立「最近常做的事」摘要
THEN 摘要中該記錄的 trigger 顯示前 60 字後加 '...'

### Scenario 7-5: 查詢 intent_journal 失敗時靜默跳過（不中斷 SessionStart）
GIVEN globalInstinct.queryGlobal 拋出例外
WHEN session-start-handler 建立 systemMessage
THEN SessionStart 流程正常完成
AND systemMessage 不包含 '最近常做的事' 段落（靜默失敗）
