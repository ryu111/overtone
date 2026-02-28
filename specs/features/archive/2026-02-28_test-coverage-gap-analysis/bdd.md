# Feature: test-coverage-gap-analysis

涵蓋 11 個新測試模組的行為規格（4 unit + 6 integration + 1 E2E）。
對應 tasks.md 的三個 Dev Phase。

---

## Phase 1: Unit Tests

---

### Feature: registry.js 資料完整性

#### Scenario: 所有 15 個 agent 名稱符合 kebab-case 格式
GIVEN registry.js 的 `stages` 物件已載入
WHEN 對每個 stage 取出 `agent` 欄位值
THEN 全部 15 個 agent 名稱都只包含小寫英文字母、數字與連字符
AND 無任何 agent 名稱包含底線、空格或大寫字母

#### Scenario: 所有 stage 名稱存在於至少一個 workflow 的 stages 陣列中
GIVEN registry.js 的 `stages` 與 `workflows` 物件已載入
WHEN 對每個 stage key（如 PLAN、ARCH、DEV 等）進行掃描
THEN 每個 stage key 都能在至少一個 workflow 的 stages 陣列中找到對應項目

#### Scenario: quick workflow 包含正確的 stages 陣列
GIVEN registry.js 的 `workflows` 物件已載入
WHEN 讀取 `workflows['quick'].stages`
THEN stages 陣列長度為 4
AND 陣列依序包含 'DEV'、'REVIEW'、'TEST'、'RETRO'

#### Scenario: timelineEvents 陣列非空且長度合理
GIVEN registry.js 已匯出 `timelineEvents`
WHEN 讀取 `timelineEvents` 的長度
THEN 長度大於 0
AND 每個項目都是非空字串

---

### Feature: paths.js 路徑解析

#### Scenario: OVERTONE_HOME 路徑包含 .overtone 目錄名稱
GIVEN paths.js 已載入並匯出 `OVERTONE_HOME`
WHEN 讀取 `OVERTONE_HOME` 字串
THEN 路徑以 `.overtone` 結尾
AND 路徑為絕對路徑（以 `/` 開頭）

#### Scenario: SESSIONS_DIR 是 OVERTONE_HOME 下的直接子目錄
GIVEN paths.js 已載入並匯出 `OVERTONE_HOME` 和 `SESSIONS_DIR`
WHEN 比較兩個路徑
THEN `SESSIONS_DIR` 以 `OVERTONE_HOME` 作為前綴
AND `SESSIONS_DIR` 結尾為 `sessions`（即 `{OVERTONE_HOME}/sessions`）

#### Scenario: sessionDir(id) 回傳包含 sessionId 的絕對路徑
GIVEN paths.js 已載入並匯出 `sessionDir` 函式
WHEN 以 `sessionId = 'abc-123'` 呼叫 `sessionDir('abc-123')`
THEN 回傳值為字串
AND 回傳路徑包含 'abc-123'
AND 回傳路徑以 SESSIONS_DIR 作為前綴

#### Scenario: CURRENT_SESSION_FILE 路徑在 OVERTONE_HOME 下
GIVEN paths.js 已載入並匯出 `CURRENT_SESSION_FILE`
WHEN 讀取 `CURRENT_SESSION_FILE` 字串
THEN 路徑以 OVERTONE_HOME 作為前綴
AND 路徑結尾為 `.current-session-id`

---

### Feature: extractCommandTag 純函數（post-use.js export）

#### Scenario: npm install 指令提取出 npm tag
GIVEN post-use.js 已匯出 `extractCommandTag` 函式
WHEN 以 `'npm install'` 呼叫 `extractCommandTag`
THEN 回傳值為 `'npm'`

#### Scenario: npx eslint 指令對應到 npm（npx 規範化）
GIVEN post-use.js 已匯出 `extractCommandTag` 函式
WHEN 以 `'npx eslint --fix .'` 呼叫 `extractCommandTag`
THEN 回傳值為 `'npm'`

#### Scenario: bun run test 指令提取出 bun tag
GIVEN post-use.js 已匯出 `extractCommandTag` 函式
WHEN 以 `'bun run test'` 呼叫 `extractCommandTag`
THEN 回傳值為 `'bun'`

#### Scenario: git push 指令提取出 git tag
GIVEN post-use.js 已匯出 `extractCommandTag` 函式
WHEN 以 `'git push origin main'` 呼叫 `extractCommandTag`
THEN 回傳值為 `'git'`

#### Scenario: 未知指令回傳清理後的 tag
GIVEN post-use.js 已匯出 `extractCommandTag` 函式
WHEN 以 `'unknown-cmd --flag'` 呼叫 `extractCommandTag`
THEN 回傳值為 `'unknown-cmd'`
AND 回傳值只包含小寫英文字母、數字與連字符

#### Scenario: vitest 指令對應到 jest（vitest 規範化）
GIVEN post-use.js 已匯出 `extractCommandTag` 函式
WHEN 以 `'vitest run'` 呼叫 `extractCommandTag`
THEN 回傳值為 `'jest'`

---

### Feature: Adapter 基類

#### Scenario: 建立 Adapter 實例後可正常存取 name 屬性
GIVEN adapter.js 的 `Adapter` class 已載入
WHEN 以 `new Adapter('test-adapter', null)` 建立實例
THEN 實例的 `name` 屬性等於 `'test-adapter'`
AND 實例的 `_connected` 屬性為 `false`

#### Scenario: 呼叫 onPush() 未被子類覆寫時不拋出錯誤
GIVEN 建立一個 Adapter 實例
WHEN 呼叫 `adapter.onPush('session-1', 'workflow', { data: 1 })`
THEN 不拋出任何例外
AND 函式正常回傳（靜默）

#### Scenario: connect() / disconnect() 更新 isConnected 狀態
GIVEN 建立一個 Adapter 實例，初始 isConnected 為 false
WHEN 呼叫 `adapter.connect()`
THEN `adapter.isConnected` 變為 `true`
WHEN 呼叫 `adapter.disconnect()`
THEN `adapter.isConnected` 變回 `false`

#### Scenario: 子類可繼承並 override onPush()
GIVEN 定義繼承 Adapter 的子類並 override `onPush()`
WHEN 子類實例呼叫 `onPush(sessionId, eventType, data)`
THEN 子類的 `onPush` 被呼叫（驗證 override 生效）
AND 父類的 `onPush` 不被呼叫

---

## Phase 2: Integration Tests

---

### Feature: dashboard/pid.js

#### Scenario: 寫入 pid 後讀取回傳相同資料
GIVEN 備份並清空現有的 `~/.overtone/dashboard.json`（避免影響真實環境）
WHEN 以 `pid.write({ pid: 12345, port: 7777, startedAt: '2026-01-01T00:00:00.000Z' })` 寫入
THEN `pid.read()` 回傳的物件包含 `pid: 12345` 和 `port: 7777`
AND 測試結束後還原備份

#### Scenario: isRunning() 在 pid 不存在時回傳 false
GIVEN `~/.overtone/dashboard.json` 不存在或 pid 指向不存在的進程
WHEN 呼叫 `pid.isRunning()`
THEN 回傳 `false`（boolean）

#### Scenario: getUrl() 根據 port 回傳正確的 localhost URL
GIVEN `dashboard.json` 已寫入 port 為 7777 的記錄
WHEN 呼叫 `pid.getUrl()`
THEN 回傳 `'http://localhost:7777'`

#### Scenario: dashboard.json 不存在時 getUrl() 回傳 null
GIVEN `~/.overtone/dashboard.json` 不存在
WHEN 呼叫 `pid.getUrl()`
THEN 回傳 `null`

---

### Feature: dashboard/sessions.js

#### Scenario: 無任何 session 目錄時 listSessions() 回傳空陣列
GIVEN SESSIONS_DIR 目錄存在但其中無任何子目錄
AND 若 SESSIONS_DIR 不存在，`listSessions()` 應能優雅處理
WHEN 呼叫 `sessions.listSessions()`
THEN 回傳一個陣列（可為空陣列）
AND 不拋出例外

#### Scenario: 有效 session 目錄存在時 listSessions() 包含該 session 摘要
GIVEN 建立一個含有 workflow.json 的測試 session 目錄
AND 初始化 quick workflow state
WHEN 呼叫 `sessions.listSessions()`
THEN 回傳陣列包含該 session 的摘要物件
AND 摘要包含 `sessionId`、`workflowType`、`progress` 欄位

#### Scenario: getSessionSummary() 對不存在的 session 回傳 null
GIVEN 不存在任何 session ID 為 `'nonexistent-abc-9999'` 的目錄
WHEN 呼叫 `sessions.getSessionSummary('nonexistent-abc-9999')`
THEN 回傳 `null`

---

### Feature: session/on-start.js hook（子進程）

#### Scenario: 傳入有效 session_id 時 hook exit 0 並建立 session 目錄
GIVEN 環境變數 `OVERTONE_NO_DASHBOARD=1`（跳過 Dashboard spawn）
WHEN 以 stdin `{"session_id": "test-start-001"}` 啟動 on-start.js 子進程
THEN 子進程 exit code 為 0
AND `~/.overtone/sessions/test-start-001/` 目錄已建立
AND `~/.overtone/sessions/test-start-001/handoffs/` 子目錄已建立

#### Scenario: hook 在建立目錄後向 timeline 寫入 session:start 事件
GIVEN 環境變數 `OVERTONE_NO_DASHBOARD=1`
WHEN 以 stdin `{"session_id": "test-start-002"}` 啟動 on-start.js 子進程
AND 子進程成功完成
THEN `timeline.jsonl` 檔案存在（或稍後能由 timeline 模組讀取）
AND timeline 中包含 `session:start` 類型的事件

#### Scenario: 無 session_id 時 hook 仍 exit 0（靜默跳過）
GIVEN 無任何 sessionId 資訊（空 stdin `{}`）
AND 環境變數中無 CLAUDE_SESSION_ID
WHEN 啟動 on-start.js 子進程
THEN 子進程 exit code 為 0
AND 無任何目錄被建立（靜默，不報錯）

---

### Feature: tool/pre-task.js hook（子進程）

#### Scenario: 目標 stage 的前置 stage 已全部完成時允許通過
GIVEN 初始化一個 quick workflow（DEV → REVIEW → TEST → RETRO）
AND DEV stage 已標記為 completed
WHEN 以指向 code-reviewer（REVIEW stage）的 task 描述啟動 pre-task.js 子進程
THEN 子進程輸出 `result` 為空字串（允許執行）

#### Scenario: 前置必要 stage 尚未完成時阻擋並回傳警告
GIVEN 初始化一個 quick workflow（DEV → REVIEW → TEST → RETRO）
AND DEV stage 狀態為 pending（尚未完成）
WHEN 以指向 code-reviewer（REVIEW stage）的 task 描述啟動 pre-task.js 子進程
THEN 子進程輸出 `result` 包含警告訊息（非空字串）
AND 警告訊息提及被跳過的 stage 名稱（DEV）

#### Scenario: 無法辨識的 agent_type 時允許通過
GIVEN 任意 workflow state
WHEN 以描述中包含完全未知 agent 的 task 啟動 pre-task.js 子進程
THEN 子進程輸出 `result` 為空字串（不阻擋）

#### Scenario: 無 session_id 時允許通過
GIVEN 無環境變數 CLAUDE_SESSION_ID
WHEN 以任意 task 描述啟動 pre-task.js 子進程（stdin 中無 session_id）
THEN 子進程輸出 `result` 為空字串（靜默放行）

---

### Feature: tool/post-use.js observeBashError（子進程）

#### Scenario: Bash exit 0 時無錯誤守衛輸出
GIVEN 一個有效的 sessionId 和 `OVERTONE_NO_DASHBOARD=1`
WHEN 以 stdin 傳入 `{ tool_name: 'Bash', tool_input: { command: 'bun test' }, tool_response: { exit_code: 0, stdout: 'OK', stderr: '' } }` 啟動 post-use.js
THEN 子進程輸出的 `result` 為空字串或無錯誤守衛關鍵詞

#### Scenario: Bash exit 1 + 重要工具 + 實質 stderr 時輸出錯誤守衛訊息
GIVEN 一個有效的 sessionId
WHEN 以 stdin 傳入 exit_code=1、tool_name='Bash'、command='bun test'、stderr 超過 20 字的錯誤訊息
THEN 子進程輸出的 `result` 包含 '[Overtone 錯誤守衛]'
AND result 包含指令名稱（bun）
AND result 包含 'MUST NOT'（禁止 workaround 的指引）

#### Scenario: Bash exit 1 + 不重要工具時不輸出錯誤守衛
GIVEN 一個有效的 sessionId
WHEN 以 stdin 傳入 exit_code=1、command='my-custom-script'、stderr 為非空字串
THEN 子進程輸出的 `result` 不包含 '[Overtone 錯誤守衛]'

#### Scenario: 非 Bash 工具的 PostToolUse 不觸發 observeBashError
GIVEN 一個有效的 sessionId
WHEN 以 stdin 傳入 `tool_name='Grep'`（非 Bash）啟動 post-use.js
THEN 子進程 exit 0
AND 輸出的 `result` 不包含錯誤守衛訊息

---

### Feature: EventBus 核心方法

#### Scenario: register 後 push 事件會呼叫 adapter.onPush()
GIVEN 建立 EventBus 實例
AND 建立一個記錄呼叫的 mock Adapter（override onPush 記錄參數）
AND 以 `eventBus.register(mockAdapter)` 註冊
WHEN 呼叫 `eventBus.push('session-1', 'workflow', { stages: {} })`
THEN mockAdapter 的 `onPush` 被呼叫一次
AND 呼叫參數為 `('session-1', 'workflow', { stages: {} })`

#### Scenario: handleControl('stop') 將 loop 標記為停止
GIVEN 建立 EventBus 實例
AND 初始化一個測試 session 並建立 loop.json（stopped: false）
WHEN 呼叫 `eventBus.handleControl(sessionId, 'stop')`
THEN 回傳 `{ ok: true, message: 'Loop 已標記為停止' }`
AND 讀取 loop.json 時 `stopped` 為 `true`

#### Scenario: 未 register 的 adapter 不在 push 分發中
GIVEN 建立 EventBus 實例（adapters 為空集合）
WHEN 呼叫 `eventBus.push('session-1', 'heartbeat', { ts: '2026-01-01' })`
THEN 不拋出例外（無 adapter 時靜默）

#### Scenario: handleControl 傳入未知命令回傳 ok: false
GIVEN 建立 EventBus 實例
WHEN 以未知命令 `'nonexistent-command'` 呼叫 `handleControl(null, 'nonexistent-command')`
THEN 回傳 `{ ok: false, error: ... }`（error 為非空字串）

---

## Phase 3: E2E Test

---

### Feature: 完整 workflow 生命週期

#### Scenario: on-start hook 建立 session 目錄後 init-workflow.js 可初始化 quick workflow
GIVEN 一個全新的唯一 sessionId（如 `e2e-lifecycle-{timestamp}`）
AND 環境變數 `OVERTONE_NO_DASHBOARD=1`
WHEN 執行 on-start.js 子進程（stdin 傳入 session_id）
AND 等待子進程完成（exit 0）
AND 再執行 `bun scripts/init-workflow.js quick {sessionId}`
THEN init-workflow.js exit 0
AND `~/.overtone/sessions/{sessionId}/workflow.json` 存在
AND workflow.json 中 `workflowType` 為 `'quick'`
AND workflow.json 中 stages 包含 DEV、REVIEW、TEST、RETRO

#### Scenario: 所有 stages 標記完成後 on-stop hook 偵測到完成狀態
GIVEN 一個已初始化 quick workflow 的 sessionId
AND 手動將所有 stages（DEV、REVIEW、TEST、RETRO）標記為 completed
WHEN 執行 on-stop.js 子進程（stdin 傳入 session_id 和任意 last_assistant_message）
THEN 子進程輸出的 `result` 包含所有階段已完成的提示（含 '🎉' 或 '所有階段已完成'）

#### Scenario: 完整生命週期 exit 0，無殘留進程
GIVEN 完整執行上述兩個 Scenario 的所有步驟
WHEN 所有子進程執行完畢
THEN 所有子進程 exit code 均為 0
AND 測試結束後清理測試 session 目錄（不留垃圾）
