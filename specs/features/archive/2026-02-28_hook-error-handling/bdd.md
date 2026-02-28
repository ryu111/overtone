# Feature 1: safeReadStdin — 安全 stdin JSON 解析

## Scenario: 正常 JSON stdin 成功解析
GIVEN stdin 包含合法的 JSON 字串（如 `{"session_id":"abc123","tool_input":{}}`）
WHEN 呼叫 `safeReadStdin()`
THEN 回傳值等於解析後的 JSON 物件
AND 不寫入任何內容到 stderr

## Scenario: 畸形 JSON stdin 回傳空物件
GIVEN stdin 包含非 JSON 的字串（如 `{not valid json`）
WHEN 呼叫 `safeReadStdin()`
THEN 回傳值為 `{}`
AND stderr 收到包含 `[overtone/` 前綴的警告訊息

## Scenario: 空 stdin 回傳空物件
GIVEN stdin 為空字串（長度為 0）
WHEN 呼叫 `safeReadStdin()`
THEN 回傳值為 `{}`
AND stderr 收到包含 `[overtone/` 前綴的警告訊息

## Scenario: stdin 讀取失敗（ENOENT）回傳空物件
GIVEN `/dev/stdin` 不可讀取（ENOENT 或 EBADF）
WHEN 呼叫 `safeReadStdin()`
THEN 回傳值為 `{}`
AND stderr 收到包含 `[overtone/` 前綴的警告訊息
AND 不拋出例外（不 crash）

---

# Feature 2: safeRun — 頂層 try/catch 包裹

## Scenario: 正常函式執行，hook 自行控制 stdout
GIVEN 一個同步函式 fn，執行期間呼叫 `process.stdout.write` 並 exit 0
WHEN 呼叫 `safeRun(fn)`
THEN fn 正常執行完成
AND stdout 輸出由 fn 自行決定
AND process exit code 為 0

## Scenario: 函式拋出未預期錯誤，輸出 defaultOutput 並 exit 0
GIVEN 一個同步函式 fn，執行時拋出 `new Error("unexpected")`
WHEN 呼叫 `safeRun(fn)`（defaultOutput 使用預設 `{ result: '' }`）
THEN stdout 輸出 `{"result":""}` 的 JSON 字串
AND exit code 為 0
AND stderr 收到包含 `[overtone/` 前綴的錯誤訊息

## Scenario: 自訂 defaultOutput（additionalContext）
GIVEN 一個同步函式 fn，執行時拋出錯誤
AND safeRun 以 `{ additionalContext: '' }` 作為 defaultOutput 呼叫
WHEN 呼叫 `safeRun(fn, { additionalContext: '' })`
THEN stdout 輸出 `{"additionalContext":""}` 的 JSON 字串
AND exit code 為 0

## Scenario: exit code 永遠為 0（正常或錯誤路徑均不 crash）
GIVEN safeRun 在任何情況下執行（成功或失敗）
WHEN hook 進程結束
THEN exit code 一律為 0
AND Claude Code 不收到非零 exit code

---

# Feature 3: hookError — 統一 stderr 錯誤記錄

## Scenario: stderr 格式正確包含 hookName 和 message
GIVEN hookName 為 `'on-start'`，message 為 `'stdin parse failed'`
WHEN 呼叫 `hookError('on-start', 'stdin parse failed')`
THEN stderr 收到字串 `[overtone/on-start] stdin parse failed\n`
AND stdout 沒有任何輸出

## Scenario: 不同 hookName 輸出對應前綴
GIVEN hookName 為 `'pre-task'`，message 為 `'state read error'`
WHEN 呼叫 `hookError('pre-task', 'state read error')`
THEN stderr 收到字串 `[overtone/pre-task] state read error\n`

## Scenario: hookError 不影響 stdout
GIVEN hookError 被呼叫多次
WHEN 呼叫 `hookError('on-stop', 'some error')`
THEN stdout 保持空白（無任何輸出）
AND 只有 stderr 有寫入

---

# Feature 4: Hook 重構後正常輸入行為不變

## Scenario: on-start.js 正常輸入 — session 目錄初始化與 timeline emit
GIVEN stdin 包含合法 JSON `{"session_id":"test-session-123"}`
AND OVERTONE_NO_DASHBOARD=1 已設定
WHEN 執行 on-start.js
THEN session 目錄 `~/.overtone/sessions/test-session-123/` 被建立
AND timeline.jsonl 寫入一筆 `session:start` 事件
AND 進程以 exit code 0 結束

## Scenario: on-submit.js 正常輸入 — additionalContext 注入
GIVEN stdin 包含合法 JSON `{"session_id":"abc","prompt":"請幫我實作功能 X"}`
AND workflow state 不存在（無 active workflow）
WHEN 執行 on-submit.js
THEN stdout 輸出包含 `additionalContext` 欄位的 JSON
AND 進程以 exit code 0 結束

## Scenario: on-submit.js 使用者已輸入 /ot: 命令時不注入
GIVEN stdin 包含 `{"session_id":"abc","prompt":"/ot:auto"}`
WHEN 執行 on-submit.js
THEN stdout 輸出 `{"additionalContext":""}`
AND 進程以 exit code 0 結束

## Scenario: pre-task.js 正常輸入 — 非 Overtone agent 不擋
GIVEN stdin 包含合法 JSON `{"session_id":"abc","tool_input":{"description":"非 Overtone 任務","prompt":"..."}}`
AND 無法從 description/prompt 識別 Overtone agent
WHEN 執行 pre-task.js
THEN stdout 輸出 `{"result":""}`
AND 進程以 exit code 0 結束

## Scenario: on-stop.js（SubagentStop）正常輸入 — 非 Overtone agent 跳過
GIVEN stdin 包含合法 JSON `{"session_id":"abc","agent_type":"custom-agent","last_assistant_message":"..."}`
AND agent_type 不在 Overtone stages 映射中
WHEN 執行 agent/on-stop.js
THEN stdout 輸出 `{"result":""}`
AND 進程以 exit code 0 結束

## Scenario: post-use.js 正常輸入 — 無 session 時靜默退出（sync 化後）
GIVEN stdin 包含合法 JSON `{"tool_name":"Bash","tool_input":{},"tool_response":{}}`
AND JSON 中無 session_id 且無 CLAUDE_SESSION_ID 環境變數
WHEN 執行 post-use.js（已改為同步）
THEN stdout 輸出 `{"result":""}`
AND 進程以 exit code 0 結束

## Scenario: on-stop.js（Stop）正常輸入 — 無 workflow 時不擋
GIVEN stdin 包含合法 JSON `{"session_id":"abc"}`
AND 該 session 無 workflow state（readState 回傳 null）
WHEN 執行 session/on-stop.js
THEN stdout 輸出 `{"result":""}`
AND 進程以 exit code 0 結束

---

# Feature 5: 各 Hook Crash 保護

## Scenario: on-start.js 接收畸形 stdin 時不 crash
GIVEN stdin 包含非 JSON 字串（如 `INVALID`）
WHEN 執行 on-start.js
THEN 進程以 exit code 0 結束
AND stdout 輸出合法 JSON（至少為 `{"result":""}` 或空字串輸出）
AND stderr 有警告訊息（不拋 uncaught exception）

## Scenario: on-submit.js 接收畸形 stdin 時不 crash
GIVEN stdin 包含畸形 JSON（如 `not json`）
WHEN 執行 on-submit.js
THEN 進程以 exit code 0 結束
AND stdout 輸出 `{"additionalContext":""}`
AND stderr 有 `[overtone/on-submit]` 前綴的警告

## Scenario: pre-task.js 接收畸形 stdin 時不 crash
GIVEN stdin 包含畸形 JSON
WHEN 執行 pre-task.js
THEN 進程以 exit code 0 結束
AND stdout 輸出 `{"result":""}` （等同允許通過，不擋）
AND stderr 有 `[overtone/pre-task]` 前綴的警告

## Scenario: agent/on-stop.js 接收畸形 stdin 時不 crash
GIVEN stdin 包含畸形 JSON
WHEN 執行 agent/on-stop.js
THEN 進程以 exit code 0 結束
AND stdout 輸出 `{"result":""}`
AND stderr 有 `[overtone/on-stop]` 前綴的警告

## Scenario: post-use.js 接收畸形 stdin 時不 crash（sync 化後）
GIVEN stdin 包含畸形 JSON
WHEN 執行 post-use.js（已改為同步模式）
THEN 進程以 exit code 0 結束
AND stdout 輸出 `{"result":""}`
AND stderr 有 `[overtone/post-use]` 前綴的警告

## Scenario: session/on-stop.js 接收畸形 stdin 時不 crash
GIVEN stdin 包含畸形 JSON
WHEN 執行 session/on-stop.js
THEN 進程以 exit code 0 結束
AND stdout 輸出 `{"result":""}` （等同允許退出，不 block loop）
AND stderr 有 `[overtone/on-stop]` 前綴的警告

## Scenario: on-start.js 業務邏輯拋錯時不 crash（Dashboard spawn 失敗）
GIVEN stdin 包含合法 JSON `{"session_id":"abc"}`
AND Dashboard spawn 拋出意外錯誤（如 EPERM）
WHEN 執行 on-start.js
THEN 進程以 exit code 0 結束
AND stdout 輸出合法 JSON
AND stderr 有 `[overtone/on-start]` 前綴的錯誤訊息

## Scenario: agent/on-stop.js 業務邏輯拋錯時不 crash（state 寫入失敗）
GIVEN stdin 包含合法 JSON `{"session_id":"abc","agent_type":"ot:developer","last_assistant_message":"done"}`
AND updateStateAtomic 在所有重試後仍拋出 Error
WHEN 執行 agent/on-stop.js
THEN 進程以 exit code 0 結束
AND stdout 輸出 `{"result":""}`
AND stderr 有 `[overtone/on-stop]` 前綴的錯誤訊息
