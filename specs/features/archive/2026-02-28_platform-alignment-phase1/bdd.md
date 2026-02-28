# Feature: Platform Alignment Phase 1 — 核心強化

## 範圍

5 個平台能力對齊項目：
- **1a. disallowedTools 遷移** — 10 個 agent 改用黑名單取代白名單
- **1b. Agent skills 預載** — 3 個 reference skill + 5 個 agent skills 欄位
- **1c. PreToolUse updatedInput 注入** — pre-task.js 自動注入 workflow context
- **1d. SessionEnd hook** — 新增 session 結束清理 hook（第 8 個）
- **1e. PostToolUseFailure hook** — 新增 tool 失敗監控 hook（第 9 個）

---

## Feature 1a: disallowedTools 遷移

### Scenario 1a-1: 純唯讀 agent 無法使用 Write 工具
GIVEN code-reviewer agent 的 frontmatter 改為 `disallowedTools: [Write, Edit, Task, NotebookEdit]`
AND debugger、security-reviewer、database-reviewer、retrospective 也套用相同設定
WHEN 任一上述 agent 被委派執行並嘗試呼叫 Write 工具
THEN 平台因 disallowedTools 設定拒絕工具呼叫
AND agent 不會在磁碟上建立或修改任何檔案

### Scenario 1a-2: architect 可使用 Write 和 Edit 寫入 specs 文件
GIVEN architect agent 的 frontmatter 改為 `disallowedTools: [Task, NotebookEdit]`
WHEN architect 被委派執行並呼叫 Write 工具寫入 `specs/features/in-progress/{feature}/design.md`
THEN 平台允許 Write 呼叫成功完成
AND architect 也可使用 Edit 工具修改 `tasks.md`
AND architect 無法使用 Task 工具啟動子 agent

### Scenario 1a-3: planner 可使用 Write 和 Edit 寫入 proposal.md
GIVEN planner agent 的 frontmatter 改為 `disallowedTools: [Task, NotebookEdit]`
WHEN planner 被委派執行並呼叫 Write 工具寫入 `specs/features/in-progress/{feature}/proposal.md`
THEN 平台允許 Write 呼叫成功完成
AND planner 也可使用 Edit 工具修改既有文件

### Scenario 1a-4: qa agent 可使用 Write 但無法使用 Edit
GIVEN qa agent 的 frontmatter 改為 `disallowedTools: [Edit, Task, NotebookEdit]`
WHEN qa 被委派執行並呼叫 Write 工具寫入 `qa-handoff.md`
THEN 平台允許 Write 呼叫成功完成
AND qa 嘗試呼叫 Edit 工具時被平台拒絕

### Scenario 1a-5: product-manager 和 designer 保留 Write 和 Edit 能力
GIVEN product-manager agent 的 frontmatter 改為 `disallowedTools: [Task, NotebookEdit]`
AND designer agent 的 frontmatter 改為 `disallowedTools: [Task, NotebookEdit]`
WHEN 兩者分別被委派執行
THEN 兩者皆可呼叫 Write 和 Edit 工具
AND 兩者皆無法使用 Task 或 NotebookEdit 工具

### Scenario 1a-6: grader 維持 tools 白名單不改用 disallowedTools
GIVEN grader agent 的 frontmatter 維持 `tools: [Read, Bash]`（不改為 disallowedTools）
WHEN grader 被委派執行
THEN grader 只能使用 Read 和 Bash 工具
AND grader 無法使用 Write、Edit、Grep、Glob 等其他工具

### Scenario 1a-7: 無 tools 白名單的 agent 不受 disallowedTools 影響
GIVEN developer、tester、e2e-runner、build-error-resolver、refactor-cleaner、doc-updater 的 frontmatter 不含 tools 或 disallowedTools 欄位
WHEN 上述任一 agent 被委派執行
THEN agent 可使用全部平台工具（Read、Write、Edit、Bash、Grep、Glob 等）

### Scenario 1a-8: agent frontmatter 移除舊的 tools 白名單欄位
GIVEN 10 個被遷移的 agent 原有 `tools: [Read, Grep, Glob, Bash]` 欄位
WHEN 遷移完成後讀取這 10 個 agent 的 .md frontmatter
THEN 這 10 個 agent 的 frontmatter 不含 `tools` 欄位
AND 各自包含正確的 `disallowedTools` 欄位

---

## Feature 1b: Agent skills 預載

### Scenario 1b-1: ref-bdd-guide skill 具備正確的不可觸發設定
GIVEN `skills/ref-bdd-guide/SKILL.md` 已建立
WHEN 讀取該 SKILL.md 的 frontmatter
THEN frontmatter 包含 `disable-model-invocation: true`
AND frontmatter 包含 `user-invocable: false`
AND frontmatter 包含 `name: ref-bdd-guide`

### Scenario 1b-2: ref-bdd-guide 不出現在 `/` 選單
GIVEN ref-bdd-guide SKILL.md 的 `user-invocable: false` 設定
WHEN 使用者在 Claude Code 中輸入 `/`
THEN ref-bdd-guide 不出現在可選 skill 清單中

### Scenario 1b-3: ref-failure-handling skill 具備正確的不可觸發設定
GIVEN `skills/ref-failure-handling/SKILL.md` 已建立
WHEN 讀取該 SKILL.md 的 frontmatter
THEN frontmatter 包含 `disable-model-invocation: true`
AND frontmatter 包含 `user-invocable: false`
AND frontmatter 包含 `name: ref-failure-handling`

### Scenario 1b-4: ref-wording-guide skill 具備正確的不可觸發設定
GIVEN `skills/ref-wording-guide/SKILL.md` 已建立
WHEN 讀取該 SKILL.md 的 frontmatter
THEN frontmatter 包含 `disable-model-invocation: true`
AND frontmatter 包含 `user-invocable: false`
AND frontmatter 包含 `name: ref-wording-guide`

### Scenario 1b-5: tester agent 預載 ref-bdd-guide 和 ref-failure-handling
GIVEN tester agent 的 .md frontmatter 新增 `skills: [ref-bdd-guide, ref-failure-handling]`
WHEN 讀取 `agents/tester.md` 的 frontmatter
THEN frontmatter 的 `skills` 欄位包含 `ref-bdd-guide`
AND frontmatter 的 `skills` 欄位包含 `ref-failure-handling`

### Scenario 1b-6: developer agent 預載 ref-bdd-guide 和 ref-failure-handling
GIVEN developer agent 的 .md frontmatter 新增 `skills: [ref-bdd-guide, ref-failure-handling]`
WHEN 讀取 `agents/developer.md` 的 frontmatter
THEN frontmatter 的 `skills` 欄位包含 `ref-bdd-guide`
AND frontmatter 的 `skills` 欄位包含 `ref-failure-handling`

### Scenario 1b-7: code-reviewer agent 預載 ref-failure-handling 和 ref-wording-guide
GIVEN code-reviewer agent 的 .md frontmatter 新增 `skills: [ref-failure-handling, ref-wording-guide]`
WHEN 讀取 `agents/code-reviewer.md` 的 frontmatter
THEN frontmatter 的 `skills` 欄位包含 `ref-failure-handling`
AND frontmatter 的 `skills` 欄位包含 `ref-wording-guide`

### Scenario 1b-8: qa 預載 ref-bdd-guide，doc-updater 預載 ref-wording-guide
GIVEN qa agent 的 frontmatter 新增 `skills: [ref-bdd-guide]`
AND doc-updater agent 的 frontmatter 新增 `skills: [ref-wording-guide]`
WHEN 讀取兩者的 frontmatter
THEN qa 的 `skills` 欄位包含 `ref-bdd-guide`
AND doc-updater 的 `skills` 欄位包含 `ref-wording-guide`

### Scenario 1b-9: ref skill 內容精簡在 300 token 以內
GIVEN 三個 ref skill SKILL.md 的內容
WHEN 計算每個 SKILL.md 的大致 token 數（以字元數 / 4 估算）
THEN 每個 SKILL.md 的有效內容不超過 1200 字元（約 300 token）

### Scenario 1b-10: 未被指定預載的 agent 不含 skills 欄位
GIVEN architect、planner、security-reviewer、debugger 等未被指定預載的 agent
WHEN 讀取這些 agent 的 frontmatter
THEN frontmatter 不含 `skills` 欄位

---

## Feature 1c: PreToolUse updatedInput 注入

### Scenario 1c-1: 有 workflow state 時自動注入 workflow context 到 Task prompt
GIVEN 有效的 sessionId 且 workflow.json 存在（workflowType 為 standard）
AND pre-task.js 通過所有前置階段檢查（允許 agent 被委派）
AND toolInput.prompt 為 `「請執行 DEV 階段任務」`
WHEN pre-task.js 執行通過分支
THEN stdout 包含 `hookSpecificOutput.updatedInput.prompt`
AND updatedInput.prompt 以 `[Overtone Workflow Context]` 開頭
AND updatedInput.prompt 包含 `工作流：standard`
AND updatedInput.prompt 在 context block 後包含 `---`
AND updatedInput.prompt 在分隔線後包含原始 prompt `「請執行 DEV 階段任務」`

### Scenario 1c-2: workflow context 包含進度條和當前階段資訊
GIVEN workflow.json 的 workflowType 為 `standard`
AND stages 為 PLAN:completed, ARCH:completed, TEST:pending, DEV:pending
AND currentStage 為 `DEV`
WHEN buildWorkflowContext(sessionId, projectRoot) 執行
THEN 回傳字串包含進度條（已完成 stage 有 ✅ 標記）
AND 回傳字串包含 `目前階段：💻 開發`
AND 回傳字串包含前階段摘要（PLAN 和 ARCH 的結果）

### Scenario 1c-3: 有活躍 feature 時 context 包含 specs 路徑
GIVEN workflow.json 的 featureName 為 `my-feature`
AND `specs/features/in-progress/my-feature/` 目錄存在
WHEN buildWorkflowContext(sessionId, projectRoot) 執行
THEN 回傳字串包含 `Feature：my-feature`
AND 回傳字串包含 `Specs：specs/features/in-progress/my-feature/`

### Scenario 1c-4: 無 featureName 時 context 省略 specs 資訊
GIVEN workflow.json 的 featureName 為 null 或空字串
WHEN buildWorkflowContext(sessionId, projectRoot) 執行
THEN 回傳字串不包含 `Feature：` 行
AND 回傳字串不包含 `Specs：` 行

### Scenario 1c-5: context 超過 1500 字元時截斷並附提示
GIVEN 工作流有大量前階段摘要，使 context 超過 1500 字元
WHEN buildWorkflowContext(sessionId, projectRoot, { maxLength: 1500 }) 執行
THEN 回傳字串長度不超過 1500 字元
AND 回傳字串末尾包含 `... (已截斷)`

### Scenario 1c-6: 無 workflow state 時回傳 null 並輸出空 result
GIVEN sessionId 有效但 workflow.json 不存在
WHEN pre-task.js 執行通過分支
THEN buildWorkflowContext 回傳 null
AND stdout 輸出 `{"result":""}` 而非 updatedInput
AND permissionDecision 仍為 allow（不影響 agent 委派）

### Scenario 1c-7: 非 Overtone agent 不注入 workflow context
GIVEN toolInput 的 subagent_type 不是 `ot:` 前綴格式
AND identifyAgent 也無法識別此 agent
WHEN pre-task.js 執行
THEN 程式在辨識失敗後以 `{"result":""}` 早期退出
AND updatedInput 不被注入

### Scenario 1c-8: deny 分支不受 updatedInput 注入邏輯影響
GIVEN 目標 agent 有未完成的必要前置階段（應被阻擋）
WHEN pre-task.js 執行
THEN 程式輸出 `permissionDecision: "deny"` 並提前退出
AND updatedInput 注入邏輯不被執行

### Scenario 1c-9: hookSpecificOutput 包含正確的 hookEventName 和 permissionDecision
GIVEN 有 workflow context 且 agent 通過前置階段檢查
WHEN pre-task.js 執行並組裝 updatedInput
THEN stdout JSON 包含 `hookSpecificOutput.hookEventName: "PreToolUse"`
AND 包含 `hookSpecificOutput.permissionDecision: "allow"`
AND 包含 `hookSpecificOutput.updatedInput.prompt`（非空字串）

---

## Feature 1d: SessionEnd hook

### Scenario 1d-1: 正常 session 結束時 emit session:end 事件
GIVEN 有效的 sessionId 且 loop.json 存在（stopped: false）
AND SessionEnd hook 接收到 reason 為 `prompt_input_exit` 的 stdin
WHEN on-session-end.js 執行
THEN timeline.jsonl 新增一筆 `session:end` 事件
AND 事件包含 `reason: "prompt_input_exit"`
AND 事件包含有效的 ts（ISO 8601 時間戳）

### Scenario 1d-2: session:end emit 後重置 loop.json 為 stopped: true
GIVEN 有效的 sessionId 且 loop.json 存在（stopped: false）
WHEN on-session-end.js 執行完畢
THEN loop.json 的 `stopped` 欄位值為 true
AND loop.json 其他欄位（如 iterations）不被清除

### Scenario 1d-3: session 正常完成後 Stop hook 已處理，SessionEnd 跳過 emit
GIVEN loop.json 的 `stopped` 欄位已為 true（Stop hook 在工作流完成時已設定）
AND SessionEnd hook 接收到 reason 為 `prompt_input_exit` 的 stdin
WHEN on-session-end.js 執行
THEN timeline.jsonl 不新增 `session:end` 事件（避免重複 emit）
AND loop.json 的 stopped 維持 true（不重複設定）

### Scenario 1d-4: 清理 .current-session-id 檔案
GIVEN `~/.overtone/.current-session-id` 檔案存在且內容為當前 sessionId
WHEN on-session-end.js 執行完畢
THEN `~/.overtone/.current-session-id` 檔案被刪除或內容被清空

### Scenario 1d-5: clear reason 觸發時也正常執行清理
GIVEN SessionEnd hook 接收到 reason 為 `clear` 的 stdin
AND loop.json 存在（stopped: false）
WHEN on-session-end.js 執行
THEN 執行與 prompt_input_exit 相同的清理流程
AND emit session:end 事件且 reason 為 `clear`
AND loop.json 被重置為 stopped: true

### Scenario 1d-6: logout reason 觸發時正常執行清理
GIVEN SessionEnd hook 接收到 reason 為 `logout` 的 stdin
WHEN on-session-end.js 執行
THEN 執行標準清理流程（emit + loop.json 重置 + current-session-id 清理）

### Scenario 1d-7: 無 sessionId 時靜默退出
GIVEN stdin JSON 不含 `session_id` 欄位
AND 環境變數 `CLAUDE_SESSION_ID` 未設定
WHEN on-session-end.js 執行
THEN stdout 輸出 `{"result":""}`
AND 不嘗試讀取 workflow.json 或 loop.json
AND process exit code 為 0

### Scenario 1d-8: stdin 為畸形 JSON 時安全退出
GIVEN stdin 內容為無效 JSON（如 `{broken`）
WHEN on-session-end.js 執行
THEN safeReadStdin 回傳 `{}`
AND stdout 輸出 `{"result":""}`
AND process exit code 為 0

### Scenario 1d-9: loop.json 不存在時跳過重置並繼續其他清理
GIVEN sessionId 有效
AND 對應的 loop.json 檔案不存在（session 從未啟動 loop）
WHEN on-session-end.js 執行
THEN emit session:end 仍正常執行（若 loop.json 沒有 stopped: true 記錄）
AND loop.json 重置步驟跳過（不建立新 loop.json）
AND .current-session-id 清理仍正常執行

### Scenario 1d-10: SessionEnd hook 在 hooks.json 正確設定
GIVEN `plugins/overtone/hooks/hooks.json` 被讀取
WHEN 搜尋 event 為 `SessionEnd` 的設定
THEN 找到一個 type 為 `command` 的 hook 設定
AND command 指向 `on-session-end.js` 腳本

### Scenario 1d-11: 任何例外都 fallback 到空 result 不阻擋 session 結束
GIVEN 任何導致 hook 主邏輯拋出未捕獲例外的情況（如磁碟滿）
WHEN on-session-end.js 執行
THEN safeRun 攔截例外並寫入 stderr（含 `[overtone/safeRun]` 前綴）
AND stdout 輸出 `{"result":""}`
AND process exit code 為 0

---

## Feature 1e: PostToolUseFailure hook

### Scenario 1e-1: Task 工具失敗時 emit tool:failure 事件並注入 systemMessage
GIVEN PostToolUseFailure hook 接收到 tool_name 為 `Task` 的失敗
AND error 為 `agent not found: ot:unknown-agent`
AND is_interrupt 為 false
WHEN post-use-failure.js 執行
THEN timeline.jsonl 新增一筆 `tool:failure` 事件
AND 事件包含 `toolName: "Task"` 和 `error` 欄位
AND stdout JSON 包含 `result` 欄位（含 systemMessage 文字）
AND systemMessage 說明 agent 委派失敗並建議重試或人工介入

### Scenario 1e-2: Write 工具失敗時 emit tool:failure 並注入 systemMessage
GIVEN PostToolUseFailure hook 接收到 tool_name 為 `Write` 的失敗
AND error 為 `permission denied: /restricted/path`
AND is_interrupt 為 false
WHEN post-use-failure.js 執行
THEN timeline.jsonl 新增一筆 `tool:failure` 事件
AND stdout JSON 的 `result` 包含 systemMessage 文字
AND systemMessage 說明檔案寫入失敗並建議檢查路徑和權限

### Scenario 1e-3: Edit 工具失敗時行為與 Write 失敗相同
GIVEN PostToolUseFailure hook 接收到 tool_name 為 `Edit` 的失敗
AND is_interrupt 為 false
WHEN post-use-failure.js 執行
THEN timeline.jsonl 新增 `tool:failure` 事件
AND stdout 包含 systemMessage（高嚴重程度）

### Scenario 1e-4: Bash 工具平台層級失敗時只記錄不注入 systemMessage
GIVEN PostToolUseFailure hook 接收到 tool_name 為 `Bash` 的失敗
AND is_interrupt 為 false
WHEN post-use-failure.js 執行
THEN timeline.jsonl 新增 `tool:failure` 事件
AND Instinct 觀察系統新增一筆 error_resolutions 類型的觀察
AND stdout JSON 的 `result` 為空字串（不注入 systemMessage）

### Scenario 1e-5: 其他工具失敗時只記錄 Instinct 不 emit timeline
GIVEN PostToolUseFailure hook 接收到 tool_name 為 `Grep` 的失敗
AND is_interrupt 為 false
WHEN post-use-failure.js 執行
THEN Instinct 觀察系統新增一筆 error_resolutions 類型的觀察
AND stdout JSON 的 `result` 為空字串

### Scenario 1e-6: is_interrupt 為 true 時不記錄 Instinct
GIVEN PostToolUseFailure hook 接收到任意 tool 的失敗
AND is_interrupt 為 true（使用者手動中斷）
WHEN post-use-failure.js 執行
THEN Instinct 觀察系統不新增觀察（非系統錯誤，不影響學習）
AND stdout 輸出 `{"result":""}`

### Scenario 1e-7: tool:failure 是 registry 中已定義的 timeline 事件
GIVEN registry.js 的 timelineEvents
WHEN 查詢 `tool:failure` 鍵
THEN 回傳 `{ label: '工具失敗', category: 'tool' }`
AND 不拋出「未知的 timeline 事件類型」錯誤

### Scenario 1e-8: 無 sessionId 時靜默退出
GIVEN stdin JSON 不含 `session_id` 欄位
AND 環境變數 `CLAUDE_SESSION_ID` 未設定
WHEN post-use-failure.js 執行
THEN stdout 輸出 `{"result":""}`
AND 不嘗試讀取 workflow.json
AND process exit code 為 0

### Scenario 1e-9: stdin 為畸形 JSON 時安全退出
GIVEN stdin 內容為無效 JSON
WHEN post-use-failure.js 執行
THEN safeReadStdin 回傳 `{}`
AND stdout 輸出 `{"result":""}`
AND process exit code 為 0

### Scenario 1e-10: PostToolUseFailure hook 在 hooks.json 正確設定
GIVEN `plugins/overtone/hooks/hooks.json` 被讀取
WHEN 搜尋 event 為 `PostToolUseFailure` 的設定
THEN 找到一個 type 為 `command` 的 hook 設定
AND command 指向 `post-use-failure.js` 腳本

### Scenario 1e-11: PostToolUseFailure 與 PostToolUse 互斥不重複觸發
GIVEN Bash 工具執行並回傳非零 exit code（應用層級失敗，工具本身成功完成）
WHEN 平台觸發 PostToolUse（不是 PostToolUseFailure）
THEN 只有 post-use.js 的 observeBashError 邏輯被觸發
AND post-use-failure.js 不被呼叫（因為工具本身未失敗）

### Scenario 1e-12: 任何例外都 fallback 到空 result
GIVEN 任何導致 hook 主邏輯拋出未捕獲例外的情況
WHEN post-use-failure.js 執行
THEN safeRun 攔截例外並寫入 stderr
AND stdout 輸出 `{"result":""}`
AND process exit code 為 0

---

## Feature 1f: buildWorkflowContext 共用函式

### Scenario 1f-1: 有 workflow state 時回傳完整 context 字串
GIVEN `buildWorkflowContext(sessionId, projectRoot)` 被呼叫
AND workflow.json 存在，workflowType 為 `standard`
AND currentStage 為 `DEV`
WHEN 函式執行
THEN 回傳非 null 字串
AND 字串首行為 `[Overtone Workflow Context]`
AND 字串包含 `工作流：standard`
AND 字串包含進度條
AND 字串包含 `目前階段：💻 開發`

### Scenario 1f-2: 無 workflow state 時回傳 null
GIVEN `buildWorkflowContext(sessionId, projectRoot)` 被呼叫
AND workflow.json 不存在
WHEN 函式執行
THEN 回傳 `null`

### Scenario 1f-3: maxLength 參數控制截斷
GIVEN `buildWorkflowContext(sessionId, projectRoot, { maxLength: 500 })` 被呼叫
AND workflow.json 存在且 context 超過 500 字元
WHEN 函式執行
THEN 回傳字串長度不超過 500 字元
AND 回傳字串末尾包含 `... (已截斷)`

### Scenario 1f-4: 未提供 maxLength 時預設為 1500
GIVEN `buildWorkflowContext(sessionId, projectRoot)` 被呼叫（不提供 options）
AND workflow.json 存在
WHEN 函式執行
THEN 使用 1500 字元作為長度上限

### Scenario 1f-5: 讀取 state 或 specs 失敗時回傳 null 而非拋出
GIVEN `buildWorkflowContext(sessionId, projectRoot)` 被呼叫
AND state.readState 拋出例外（如檔案格式損壞）
WHEN 函式執行
THEN 函式內部 try/catch 攔截例外
AND 回傳 `null`

### Scenario 1f-6: 前階段摘要從 workflow.json 的 stage results 讀取
GIVEN workflow.json 的 stages 中 PLAN 的 status 為 completed 且有 result 欄位
AND ARCH 的 status 為 completed 且有 result 欄位
WHEN `buildWorkflowContext(sessionId, projectRoot)` 執行
THEN 回傳字串包含前階段摘要段落
AND 段落包含 PLAN 和 ARCH 的 result 摘要

---

## Feature 1g: hooks.json 更新（SessionEnd + PostToolUseFailure）

### Scenario 1g-1: hooks.json 包含 SessionEnd hook 設定
GIVEN hooks.json 被讀取
WHEN 解析 hooks 陣列
THEN 找到 event 為 `SessionEnd` 的 hook 設定
AND type 為 `command`
AND command 路徑包含 `on-session-end.js`

### Scenario 1g-2: hooks.json 包含 PostToolUseFailure hook 設定
GIVEN hooks.json 被讀取
WHEN 解析 hooks 陣列
THEN 找到 event 為 `PostToolUseFailure` 的 hook 設定
AND type 為 `command`
AND command 路徑包含 `post-use-failure.js`

### Scenario 1g-3: 新增兩個 hook 後 hooks.json 仍是合法 JSON
GIVEN hooks.json 新增了 SessionEnd 和 PostToolUseFailure 兩個 hook 設定
WHEN 執行 `JSON.parse(fs.readFileSync('hooks.json'))`
THEN 解析成功不拋錯
AND 結果物件包含合法的 hooks 陣列

---

## Feature 1h: registry.js tool:failure 事件

### Scenario 1h-1: tool:failure 事件已定義在 timelineEvents
GIVEN registry.js 的 `timelineEvents` 物件
WHEN 存取 `timelineEvents['tool:failure']`
THEN 回傳 `{ label: '工具失敗', category: 'tool' }`
AND 不回傳 undefined

### Scenario 1h-2: 新增 tool:failure 後 timelineEvents 共有 23 個事件
GIVEN registry.js 的 `timelineEvents` 物件
WHEN 計算 Object.keys(timelineEvents).length
THEN 結果為 23

### Scenario 1h-3: tool:failure 的 category 為 tool（新分類）
GIVEN `timelineEvents['tool:failure']`
WHEN 讀取其 `category` 欄位
THEN 值為 `'tool'`
