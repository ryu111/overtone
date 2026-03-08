# Feature: Hook Output 格式修復（hookSpecificOutput.additionalContext 注入）

## 背景

Claude Code Hook API 定義了 `hookSpecificOutput.additionalContext` 欄位，供 hook handler
將注入給 model 的指令明確標記出來。目前五個 handler 在有實質 systemMessage 或 result 時，
均未設定此欄位，導致 model 無法識別哪些內容是 hook 主動注入的。

修復後，所有有實質內容的 hook 回傳必須同時設定：
```js
hookSpecificOutput: {
  hookEventName: '<事件名稱>',
  additionalContext: '<與 systemMessage/result 相同的內容>',
}
```

參考實作：`on-submit-handler.js` 已完成修復。

---

## Feature 1: session-start-handler — buildStartOutput

### Scenario 1-1: msgs 有實質內容時 output 包含 hookSpecificOutput
GIVEN buildStartOutput 被呼叫
AND options.msgs 陣列包含至少一個非 falsy 字串（如 '## Plugin Context\n...'）
WHEN 函式執行並組裝輸出物件
THEN output 包含 systemMessage 欄位
AND output 包含 hookSpecificOutput 欄位
AND hookSpecificOutput.hookEventName 等於 'SessionStart'
AND hookSpecificOutput.additionalContext 等於 output.systemMessage

### Scenario 1-2: msgs 為空時 output 不包含 hookSpecificOutput
GIVEN buildStartOutput 被呼叫
AND options.msgs 為空陣列 []
WHEN 函式執行並組裝輸出物件
THEN output 不包含 systemMessage 欄位
AND output 不包含 hookSpecificOutput 欄位

### Scenario 1-3: msgs 全為 falsy 時行為同空陣列
GIVEN buildStartOutput 被呼叫
AND options.msgs 為 [null, undefined, ''] 等全 falsy 值
WHEN 函式執行並組裝輸出物件
THEN output 不包含 systemMessage 欄位
AND output 不包含 hookSpecificOutput 欄位

### Scenario 1-4: additionalContext 與 systemMessage 內容完全一致
GIVEN buildStartOutput 被呼叫
AND options.msgs 包含兩個字串 'A' 和 'B'
WHEN 函式執行並組裝輸出物件
THEN output.systemMessage 等於 'A\n\nB'
AND output.hookSpecificOutput.additionalContext 等於 'A\n\nB'
AND 兩者完全相同（嚴格相等）

### Scenario 1-5: options 為 undefined 時不包含 hookSpecificOutput
GIVEN buildStartOutput 被呼叫
AND options 參數為 undefined
WHEN 函式執行並組裝輸出物件
THEN output.result 為空字串
AND output 不包含 hookSpecificOutput 欄位

---

## Feature 2: pre-compact-handler — handlePreCompact

### Scenario 2-1: 有 workflow state 時 output 包含 hookSpecificOutput
GIVEN handlePreCompact 被呼叫
AND input 包含有效的 session_id
AND 該 session 已初始化 workflow state（workflowType 和 stages 存在）
WHEN 函式執行並組裝輸出物件
THEN output.output 包含 systemMessage 欄位
AND output.output 包含 hookSpecificOutput 欄位
AND output.output.hookSpecificOutput.hookEventName 等於 'PreCompact'
AND output.output.hookSpecificOutput.additionalContext 等於 output.output.systemMessage

### Scenario 2-2: 無 sessionId 時 output 不包含 hookSpecificOutput
GIVEN handlePreCompact 被呼叫
AND input 為空物件 {} 或不含 session_id
WHEN 函式執行
THEN output.output.result 為 ''
AND output.output 不包含 hookSpecificOutput 欄位

### Scenario 2-3: session 存在但無 workflow state 時不包含 hookSpecificOutput
GIVEN handlePreCompact 被呼叫
AND input 包含有效的 session_id
AND 該 session 目錄存在但無 workflow.json
WHEN 函式執行
THEN output.output.result 為 ''
AND output.output 不包含 hookSpecificOutput 欄位

### Scenario 2-4: additionalContext 與 systemMessage 內容完全一致
GIVEN handlePreCompact 被呼叫
AND 存在有效 workflow state（工作流：quick，stage：DEV）
WHEN 函式執行並組裝輸出物件
THEN output.output.hookSpecificOutput.additionalContext 嚴格等於 output.output.systemMessage
AND additionalContext 包含 'Overtone 狀態恢復'

---

## Feature 3: pre-edit-guard — combinedWarning 路徑

### Scenario 3-1: 閉環提示路徑有 combinedWarning 時包含 hookSpecificOutput
GIVEN pre-edit-guard hook 被觸發
AND 目標檔案為 hooks/scripts/ 下的 .js 檔（匹配閉環模式）
AND Main Agent 未自行寫碼（無 DEV pending 狀態或有 activeAgents）
AND combinedWarning 非空字串
WHEN hook 輸出 JSON 到 stdout
THEN JSON 包含 hookSpecificOutput 欄位
AND hookSpecificOutput.hookEventName 等於 'PreToolUse'
AND hookSpecificOutput.additionalContext 等於 combinedWarning
AND JSON 不包含 permissionDecision 欄位（非阻擋路徑）

### Scenario 3-2: deny 路徑（受保護檔案）不包含 additionalContext
GIVEN pre-edit-guard hook 被觸發
AND 目標檔案為 agents/<name>.md（受保護元件）
WHEN hook 輸出 JSON 到 stdout
THEN JSON 包含 hookSpecificOutput.permissionDecision 等於 'deny'
AND JSON 包含 hookSpecificOutput.permissionDecisionReason（說明阻擋原因）
AND hookSpecificOutput 不包含 additionalContext 欄位（deny 路徑語意不同）

### Scenario 3-3: CLAUDE.md 提醒路徑包含 hookSpecificOutput
GIVEN pre-edit-guard hook 被觸發
AND 目標檔案路徑以 '/CLAUDE.md' 結尾
WHEN hook 輸出 JSON 到 stdout
THEN JSON 包含 hookSpecificOutput 欄位
AND hookSpecificOutput.hookEventName 等於 'PreToolUse'
AND hookSpecificOutput.additionalContext 包含 'CLAUDE.md 精簡原則提醒'

### Scenario 3-4: 無 warning（放行路徑）輸出不包含 hookSpecificOutput
GIVEN pre-edit-guard hook 被觸發
AND 目標檔案在 plugin root 之外的一般路徑
AND 無閉環提示、無 CLAUDE.md、無受保護檔案
WHEN hook 輸出 JSON 到 stdout
THEN JSON 包含 result 為空字串
AND JSON 不包含 hookSpecificOutput 欄位

### Scenario 3-5: MEMORY.md deny 路徑不包含 additionalContext
GIVEN pre-edit-guard hook 被觸發
AND 目標檔案為 MEMORY.md
AND 寫入後預估行數超過 200 行上限
WHEN hook 輸出 JSON 到 stdout
THEN hookSpecificOutput.permissionDecision 等於 'deny'
AND hookSpecificOutput 不包含 additionalContext 欄位

---

## Feature 4: post-use-failure-handler — handlePostUseFailure

### Scenario 4-1: Task 工具失敗時 output 包含 hookSpecificOutput
GIVEN handlePostUseFailure 被呼叫
AND input.tool_name 為 'Task'
AND input.session_id 存在
AND input.is_interrupt 為 false
WHEN 函式執行
THEN output.output 包含 result 字串（agent 委派失敗訊息）
AND output.output 包含 hookSpecificOutput 欄位
AND hookSpecificOutput.hookEventName 等於 'PostToolUseFailure'
AND hookSpecificOutput.additionalContext 等於 output.output.result

### Scenario 4-2: Write 工具失敗時 output 包含 hookSpecificOutput
GIVEN handlePostUseFailure 被呼叫
AND input.tool_name 為 'Write'
AND input.session_id 存在
AND input.error 包含錯誤訊息
WHEN 函式執行
THEN output.output 包含 hookSpecificOutput 欄位
AND hookSpecificOutput.hookEventName 等於 'PostToolUseFailure'
AND hookSpecificOutput.additionalContext 包含 'Overtone 工具失敗'

### Scenario 4-3: Edit 工具失敗時 output 包含 hookSpecificOutput
GIVEN handlePostUseFailure 被呼叫
AND input.tool_name 為 'Edit'
AND input.session_id 存在
WHEN 函式執行
THEN output.output 包含 hookSpecificOutput 欄位
AND hookSpecificOutput.hookEventName 等於 'PostToolUseFailure'
AND hookSpecificOutput.additionalContext 包含 'Overtone 工具失敗'

### Scenario 4-4: Bash 工具失敗時不注入 hookSpecificOutput
GIVEN handlePostUseFailure 被呼叫
AND input.tool_name 為 'Bash'（非 CRITICAL_TOOLS）
AND input.session_id 存在
WHEN 函式執行
THEN output.output.result 為 ''
AND output.output 不包含 hookSpecificOutput 欄位

### Scenario 4-5: is_interrupt=true 時不注入 hookSpecificOutput
GIVEN handlePostUseFailure 被呼叫
AND input.tool_name 為 'Task'
AND input.is_interrupt 為 true
WHEN 函式執行
THEN output.output.result 為 ''
AND output.output 不包含 hookSpecificOutput 欄位

### Scenario 4-6: 無 sessionId 時不注入 hookSpecificOutput
GIVEN handlePostUseFailure 被呼叫
AND input 不含有效 session_id
WHEN 函式執行
THEN output.output.result 為 ''
AND output.output 不包含 hookSpecificOutput 欄位

### Scenario 4-7: additionalContext 與 result 完全一致
GIVEN handlePostUseFailure 被呼叫
AND input.tool_name 為 'Task'
AND input.session_id 存在
WHEN 函式執行
THEN output.output.hookSpecificOutput.additionalContext 嚴格等於 output.output.result

---

## Feature 5: post-use-handler — handlePostUse

### Scenario 5-1: 重大 Bash 錯誤時 output 包含 hookSpecificOutput
GIVEN handlePostUse 被呼叫
AND input.tool_name 為 'Bash'
AND input.session_id 存在
AND toolResponse.exit_code 為非零值（如 1）
AND toolResponse.stderr 包含超過 20 字元的錯誤訊息
AND 指令為重大工具（如 'bun test' 或 'git push'）
WHEN 函式執行
THEN output.output 包含非空 result（Bash 錯誤守衛訊息）
AND output.output 包含 hookSpecificOutput 欄位
AND hookSpecificOutput.hookEventName 等於 'PostToolUse'
AND hookSpecificOutput.additionalContext 等於 output.output.result

### Scenario 5-2: wording mismatch 偵測到時 output 包含 hookSpecificOutput
GIVEN handlePostUse 被呼叫
AND input.tool_name 為 'Edit' 或 'Write'
AND input.session_id 存在
AND 目標 .md 檔案包含 emoji-關鍵詞不匹配（如 📋 後面跟 should 而非 MUST）
WHEN 函式執行
THEN output.output 包含非空 result（措詞警告訊息）
AND output.output 包含 hookSpecificOutput 欄位
AND hookSpecificOutput.hookEventName 等於 'PostToolUse'
AND hookSpecificOutput.additionalContext 包含 'Overtone 措詞檢查'

### Scenario 5-3: Bash 成功執行時不注入 hookSpecificOutput
GIVEN handlePostUse 被呼叫
AND input.tool_name 為 'Bash'
AND toolResponse.exit_code 為 0（成功）
WHEN 函式執行
THEN output.output.result 為 ''
AND output.output 不包含 hookSpecificOutput 欄位

### Scenario 5-4: 無 sessionId 時不注入 hookSpecificOutput
GIVEN handlePostUse 被呼叫
AND input 不含有效 session_id
WHEN 函式執行
THEN output.output.result 為 ''
AND output.output 不包含 hookSpecificOutput 欄位

### Scenario 5-5: Bash grep 使用記錄但無重大錯誤時不注入 hookSpecificOutput
GIVEN handlePostUse 被呼叫
AND input.tool_name 為 'Bash'
AND toolInput.command 包含 'grep' 指令
AND toolResponse.exit_code 為 0（成功）
WHEN 函式執行
THEN 記錄 tool_preferences instinct 觀察（副作用）
AND output.output.result 為 ''
AND output.output 不包含 hookSpecificOutput 欄位

### Scenario 5-6: additionalContext 與 result 完全一致
GIVEN handlePostUse 被呼叫，重大 Bash 錯誤路徑
AND 所有必要條件已滿足（exit_code 非零，重大工具，有實質 stderr）
WHEN 函式執行
THEN output.output.hookSpecificOutput.additionalContext 嚴格等於 output.output.result

---

## 跨功能驗證（Cross-Feature）

### Scenario X-1: hookEventName 必須與事件名稱精確匹配
GIVEN 任何 handler 觸發 hookSpecificOutput 路徑
WHEN 輸出包含 hookSpecificOutput
THEN hookEventName 必須為下列之一：
  - 'SessionStart'（session-start-handler）
  - 'PreCompact'（pre-compact-handler）
  - 'PreToolUse'（pre-edit-guard）
  - 'PostToolUseFailure'（post-use-failure-handler）
  - 'PostToolUse'（post-use-handler）

### Scenario X-2: additionalContext 不可為空字串
GIVEN 任何 handler 觸發 hookSpecificOutput 路徑
WHEN 輸出包含 hookSpecificOutput.additionalContext
THEN additionalContext 為非空字串（length > 0）
AND additionalContext 包含有意義的 hook 注入內容

### Scenario X-3: 空值路徑不可出現 hookSpecificOutput
GIVEN 任何 handler 的「無實質內容」路徑（result 為空或 systemMessage 未定義）
WHEN handler 執行
THEN output 不包含 hookSpecificOutput 欄位（完全不存在，而非 undefined 值）
