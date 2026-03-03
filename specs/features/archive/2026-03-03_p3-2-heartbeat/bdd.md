# Feature: P3.2 心跳引擎（Heartbeat Daemon + 跨 Session 自主執行）

---

## Feature 1: session-spawner.js — Claude Code session 啟動封裝

### Scenario 1-1: 成功組裝 claude CLI 參數
@smoke
GIVEN session-spawner.js 的 `_buildArgs` 函式
WHEN 傳入 opts `{ cwd: '/proj', pluginDir: '/plugin', timeout: 3600000 }`
THEN 回傳的參數陣列包含 `--plugin-dir /plugin`
AND 包含 `--output-format stream-json`
AND 包含 `-p`

### Scenario 1-2: pluginDir 未提供時自動偵測預設值
@edge-case
GIVEN session-spawner.js 的 `_buildArgs` 函式
AND opts 未包含 `pluginDir` 欄位
WHEN 呼叫 `_buildArgs({ cwd: '/proj' })`
THEN 回傳參數陣列仍包含 `--plugin-dir` 旗標
AND plugin dir 路徑指向 `plugins/overtone`（相對於 `__dirname` 的自動偵測路徑）

### Scenario 1-3: spawnSession 成功 — stream-json 回傳 success 事件
@smoke
GIVEN mock spawn 回傳假的 child 物件，其 stdout 為 EventEmitter
WHEN 呼叫 `spawnSession('開始執行 my-feature，workflow: standard', { cwd: '/proj' }, { spawn: mockSpawn })`
AND stdout emit `{"type":"result","subtype":"success","session_id":"abc-123"}\n`
THEN `outcome` Promise resolve `{ status: 'success', sessionId: 'abc-123' }`

### Scenario 1-4: spawnSession stream-json 回傳 error_max_turns
@error
GIVEN mock spawn 回傳假的 child 物件
WHEN stdout emit `{"type":"result","subtype":"error_max_turns","session_id":"abc-456"}\n`
THEN `outcome` Promise resolve `{ status: 'error', sessionId: 'abc-456', errorCode: 'error_max_turns' }`

### Scenario 1-5: spawnSession stream-json 回傳 error_during_stream
@error
GIVEN mock spawn 回傳假的 child 物件
WHEN stdout emit `{"type":"result","subtype":"error_during_stream"}\n`
THEN `outcome` Promise resolve `{ status: 'error', sessionId: null, errorCode: 'error_during_stream' }`

### Scenario 1-6: stdout 關閉而未收到 result 事件（crash 情境）
@error
GIVEN mock spawn 回傳假的 child 物件
AND stdout 未 emit 任何 result 事件
WHEN stdout emit `close` 事件
THEN `outcome` Promise resolve `{ status: 'crash', sessionId: null }`

### Scenario 1-7: spawn timeout 到期
@edge-case
GIVEN `opts.timeout = 100`（100 毫秒）
AND mock spawn 回傳不結束的 child（stdout 不 emit 任何事件）
WHEN 等待超過 100 毫秒後
THEN `outcome` Promise resolve `{ status: 'timeout', sessionId: null }`
AND `mockChild.kill` 被呼叫（或 `process.kill(child.pid, 'SIGTERM')`）

### Scenario 1-8: stdout 同一 chunk 包含多個 JSON 物件（黏包情境）
@edge-case
GIVEN mock spawn 回傳假的 child 物件
WHEN stdout emit `{"type":"init","session_id":"s-1"}\n{"type":"result","subtype":"success","session_id":"s-1"}\n`（一個 chunk 含兩筆）
THEN `outcome` Promise resolve `{ status: 'success', sessionId: 's-1' }`（正確解析，不因黏包而失敗）

### Scenario 1-9: 非 darwin 平台
@edge-case
GIVEN 執行環境 `process.platform` 非 `darwin`
WHEN 呼叫 `spawnSession` 並確認其不依賴任何 macOS 專屬 API
THEN `spawnSession` 正常回傳 `{ child, outcome }` 物件（不拋出例外）

---

## Feature 2: heartbeat.js CLI — start / stop / status 指令

### Scenario 2-1: start 成功 — 無 PID 檔時正常啟動
@smoke
GIVEN `~/.overtone/heartbeat.pid` 不存在
AND `mockDeps.writePid` 可正常執行
WHEN 以 `start --project-root /proj` 模式執行 heartbeat.js
THEN 寫入 PID 檔（呼叫 `writePid`）
AND fork 自身為 detached daemon（呼叫 `spawn` 含 `_daemon` 子命令）
AND parent process 退出（`process.exit(0)`）

### Scenario 2-2: start 失敗 — PID 檔存在且 process 存活
@error
GIVEN `~/.overtone/heartbeat.pid` 存在，內容為合法 PID
AND `process.kill(pid, 0)` 不拋出（代表 process 存活）
WHEN 以 `start` 模式執行 heartbeat.js
THEN 輸出「daemon 已在執行（PID: N）」或等義訊息
AND 不啟動新 daemon
AND 以非零 exit code 結束

### Scenario 2-3: start 成功 — PID 檔存在但 process 不存在（stale PID）
@edge-case
GIVEN `~/.overtone/heartbeat.pid` 存在，內容為已不存在的 PID
AND `process.kill(pid, 0)` 拋出 ESRCH 錯誤
WHEN 以 `start` 模式執行 heartbeat.js
THEN 刪除過期的 PID 檔（呼叫 `deletePid`）
AND 正常啟動新 daemon
AND 寫入新 PID 檔

### Scenario 2-4: stop 成功 — PID 檔存在
@smoke
GIVEN `~/.overtone/heartbeat.pid` 存在，內容為合法 PID
WHEN 以 `stop` 模式執行 heartbeat.js
THEN 對該 PID 發送 SIGTERM（呼叫 `process.kill(pid, 'SIGTERM')`）
AND 輸出「daemon 已停止」或等義訊息

### Scenario 2-5: stop — PID 檔不存在
@edge-case
GIVEN `~/.overtone/heartbeat.pid` 不存在
WHEN 以 `stop` 模式執行 heartbeat.js
THEN 輸出「daemon 未在執行」或等義訊息
AND 以 exit code 0 結束（不報錯）

### Scenario 2-6: status — daemon 執行中
@smoke
GIVEN `~/.overtone/heartbeat.pid` 存在，內容為存活的 PID
AND `~/.overtone/heartbeat-state.json` 存在，含 `{ pid, paused: false, activeItem: 'my-feature', consecutiveFailures: 0 }`
WHEN 以 `status` 模式執行 heartbeat.js
THEN 輸出 PID、activeItem、paused 狀態等關鍵資訊

### Scenario 2-7: status — daemon 未執行
@edge-case
GIVEN `~/.overtone/heartbeat.pid` 不存在
WHEN 以 `status` 模式執行 heartbeat.js
THEN 輸出「daemon 未在執行」或等義訊息
AND 不拋出例外

---

## Feature 3: Daemon 內部 — PID 檔管理

### Scenario 3-1: _daemon 子命令啟動時寫入 PID 檔
@smoke
GIVEN `_daemon` 子命令被呼叫
AND `writePid` mock 已準備
WHEN daemon 初始化
THEN 以自身 `process.pid` 呼叫 `writePid`
AND 寫入 `heartbeat-state.json` 含 `{ pid, projectRoot, startedAt, consecutiveFailures: 0, paused: false }`

### Scenario 3-2: daemon 正常退出時清理 PID 檔
@smoke
GIVEN daemon 正在執行且 PID 檔存在
WHEN daemon 呼叫 cleanup 函式（例如正常退出流程）
THEN 刪除 `~/.overtone/heartbeat.pid`
AND 刪除或清空 `~/.overtone/heartbeat-state.json`

### Scenario 3-3: SIGTERM 優雅關閉 — 無活躍 session
@smoke
GIVEN daemon 正在執行，`state.activeSession === null`
WHEN daemon 收到 SIGTERM 訊號
THEN 直接清理 PID 檔
AND 以 exit code 0 退出

### Scenario 3-4: SIGTERM 優雅關閉 — 有活躍 session
@edge-case
GIVEN daemon 正在執行，`state.activeSession` 不為 null，持有 mock child
WHEN daemon 收到 SIGTERM 訊號
THEN 對活躍子程序發送 SIGTERM（`child.kill('SIGTERM')` 或 `process.kill(child.pid, 'SIGTERM')`）
AND 清理 PID 檔
AND 以 exit code 0 退出

---

## Feature 4: 佇列監聽與 session 排程（Polling Loop）

### Scenario 4-1: polling 偵測到 pending 項目時觸發 spawn
@smoke
GIVEN daemon 狀態 `{ activeSession: null, paused: false }`
AND mock executionQueue.getNext() 回傳 `{ featureName: 'my-feature', workflow: 'standard' }`
AND mock executionQueue.getCurrent() 回傳 null（無 in_progress 項目）
WHEN polling loop 執行一次
THEN 呼叫 `executionQueue.advanceToNext(projectRoot)`
AND 呼叫 `spawnSession` 並傳入 prompt `'開始執行 my-feature，workflow: standard'`
AND `state.activeSession` 設為非 null

### Scenario 4-2: 無 pending 項目時不 spawn
@edge-case
GIVEN daemon 狀態 `{ activeSession: null, paused: false }`
AND mock executionQueue.getNext() 回傳 null
WHEN polling loop 執行一次
THEN 不呼叫 `spawnSession`
AND `state.activeSession` 維持 null

### Scenario 4-3: 已有活躍 session 時不並行 spawn（最大並行 = 1）
@edge-case
GIVEN daemon 狀態 `{ activeSession: { child: mockChild, itemName: 'first-feature' }, paused: false }`
AND mock executionQueue.getNext() 回傳另一個 pending 項目
WHEN polling loop 執行一次
THEN 不呼叫 `spawnSession`（直接 return）

### Scenario 4-4: daemon 已暫停時 polling 跳過 spawn
@edge-case
GIVEN daemon 狀態 `{ activeSession: null, paused: true }`
AND mock executionQueue.getNext() 回傳 pending 項目
WHEN polling loop 執行一次
THEN 不呼叫 `spawnSession`（直接 return）

### Scenario 4-5: session 成功完成後推進佇列
@smoke
GIVEN daemon 已 spawn 一個 session（`state.activeSession` 不為 null）
WHEN outcome Promise resolve `{ status: 'success', sessionId: 'abc' }`
THEN 呼叫 `executionQueue.completeCurrent(projectRoot)`
AND `state.consecutiveFailures` 重設為 0
AND `state.activeSession` 設為 null
AND 下次 polling 可繼續處理下一個 pending 項目

### Scenario 4-6: session 失敗後 consecutiveFailures 遞增
@error
GIVEN daemon 已 spawn 一個 session
WHEN outcome Promise resolve `{ status: 'error', sessionId: null }`
THEN 呼叫 `executionQueue.failCurrent(projectRoot, reason)`
AND `state.consecutiveFailures` 增加 1
AND `state.activeSession` 設為 null

### Scenario 4-7: execution-queue.json 損壞時 polling 靜默跳過
@error
GIVEN mock executionQueue.getNext() 拋出例外（或回傳 null，模擬損壞）
WHEN polling loop 執行一次
THEN 不拋出未捕獲例外
AND `state.activeSession` 維持 null
AND 下一輪 polling 照常繼續

### Scenario 4-8: polling 每次執行後更新 lastPollAt
@edge-case
GIVEN daemon 正在執行
WHEN polling loop 每次執行完畢
THEN `heartbeat-state.json` 的 `lastPollAt` 欄位更新為最近時間戳記（ISO 8601 格式）

---

## Feature 5: 安全邊界 — 連續失敗暫停

### Scenario 5-1: 連續 3 次失敗觸發暫停
@smoke
GIVEN daemon 狀態 `{ consecutiveFailures: 2, paused: false }`
WHEN 第 3 次 session 失敗（outcome status 非 `success`）
THEN `state.consecutiveFailures` 變為 3
AND `state.paused` 設為 true
AND 呼叫 `telegram.notify` 並傳入包含「連續失敗」或「daemon 暫停」的訊息

### Scenario 5-2: 連續失敗未達閾值不暫停
@edge-case
GIVEN daemon 狀態 `{ consecutiveFailures: 1, paused: false }`
WHEN 第 2 次 session 失敗
THEN `state.consecutiveFailures` 變為 2
AND `state.paused` 維持 false
AND 不呼叫 `telegram.notify`（或呼叫但訊息不含「暫停」）

### Scenario 5-3: 成功一次後 consecutiveFailures 重設
@smoke
GIVEN daemon 狀態 `{ consecutiveFailures: 2, paused: false }`
WHEN session 成功完成（outcome status `success`）
THEN `state.consecutiveFailures` 重設為 0

### Scenario 5-4: 暫停狀態持久化到 heartbeat-state.json
@edge-case
GIVEN daemon 因連續 3 次失敗而 `state.paused = true`
WHEN polling loop 將狀態持久化
THEN `heartbeat-state.json` 的 `paused` 欄位為 `true`
AND `consecutiveFailures` 欄位為 3

---

## Feature 6: Telegram 通知

### Scenario 6-1: spawn 開始時發送通知
@smoke
GIVEN `telegram.notify` mock 已準備
AND daemon 偵測到 pending 項目並準備 spawn
WHEN `spawnSession` 被呼叫前或後發送通知
THEN `telegram.notify` 被呼叫一次，訊息包含 featureName 或「開始執行」等字樣

### Scenario 6-2: session 成功完成時發送通知
@smoke
GIVEN `telegram.notify` mock 已準備
WHEN outcome resolve `{ status: 'success' }`
THEN `telegram.notify` 被呼叫一次，訊息包含「完成」或「success」等字樣

### Scenario 6-3: session 失敗時發送通知（未達暫停閾值）
@error
GIVEN `telegram.notify` mock 已準備
AND daemon 狀態 `{ consecutiveFailures: 0 }`
WHEN outcome resolve `{ status: 'error' }`
THEN `telegram.notify` 被呼叫，訊息包含「失敗」或 featureName

### Scenario 6-4: 連續 3 次失敗暫停時發送暫停通知
@error
GIVEN `telegram.notify` mock 已準備
AND daemon 狀態 `{ consecutiveFailures: 2 }`
WHEN 第 3 次失敗觸發暫停
THEN `telegram.notify` 被呼叫，訊息明確包含「暫停」

### Scenario 6-5: Telegram token 不存在時靜默跳過
@edge-case
GIVEN TelegramAdapter 實例化時 `chatId` 為 null 或未提供
WHEN 任何通知事件觸發時呼叫 `telegram.notify`
THEN `notify` 內部靜默返回，不拋出例外
AND 不發送任何 HTTP 請求

---

## Feature 7: TelegramAdapter.notify() 公開方法

### Scenario 7-1: chatId 存在時 notify 成功發送訊息
@smoke
GIVEN TelegramAdapter 實例 `{ chatId: '12345', token: 'valid-token' }`
AND `_sendMessage` mock 回傳 resolved Promise
WHEN 呼叫 `adapter.notify('Hello from heartbeat')`
THEN `_sendMessage` 被呼叫，傳入 `'12345'` 和 `'Hello from heartbeat'`

### Scenario 7-2: chatId 為 null 時 notify 靜默 return
@edge-case
GIVEN TelegramAdapter 實例 `{ chatId: null }`
WHEN 呼叫 `adapter.notify('any message')`
THEN `_sendMessage` 不被呼叫
AND 函式正常返回（不拋出例外）

### Scenario 7-3: _sendMessage 拋出例外時 notify 不向外傳播
@error
GIVEN TelegramAdapter 實例 `{ chatId: '12345' }`
AND `_sendMessage` mock 拋出網路錯誤
WHEN 呼叫 `adapter.notify('message')`
THEN `notify` 捕獲例外不向外拋出
OR `notify` 本身是 `async` 方法，呼叫方可選擇 await 或 fire-and-forget

---

## Feature 8: execution-queue.js — failCurrent() 新增方法

### Scenario 8-1: 成功將 in_progress 項目標記為 failed
@smoke
GIVEN execution-queue.json 存在，含一個 `in_progress` 項目
AND `writeQueue` mock（或實際 atomicWrite）可正常執行
WHEN 呼叫 `failCurrent(projectRoot, '60分鐘 timeout')`
THEN 該項目的 `status` 變為 `'failed'`
AND 該項目新增 `failedAt` 欄位（ISO 8601 格式）
AND 該項目新增 `failReason` 欄位，值為 `'60分鐘 timeout'`
AND 函式回傳 `true`

### Scenario 8-2: 無 in_progress 項目時回傳 false
@edge-case
GIVEN execution-queue.json 存在，但所有項目均為 `pending` 或 `completed`
WHEN 呼叫 `failCurrent(projectRoot, 'reason')`
THEN 函式回傳 `false`
AND 佇列檔案不被修改

### Scenario 8-3: reason 參數省略時不加 failReason 欄位
@edge-case
GIVEN execution-queue.json 存在，含一個 `in_progress` 項目
WHEN 呼叫 `failCurrent(projectRoot)` 不傳入 reason
THEN 該項目的 `status` 變為 `'failed'`
AND `failedAt` 欄位存在
AND `failReason` 欄位不存在（或為 undefined）
AND 函式回傳 `true`

### Scenario 8-4: execution-queue.json 不存在時回傳 false
@error
GIVEN `projectRoot` 下不存在 execution-queue.json（readQueue 回傳 null）
WHEN 呼叫 `failCurrent(projectRoot, 'reason')`
THEN 函式回傳 `false`
AND 不拋出例外

### Scenario 8-5: failCurrent 冪等性 — 已 failed 的項目不重複標記
@edge-case
GIVEN execution-queue.json 存在，含一個已是 `failed` 的項目（無 `in_progress`）
WHEN 連續呼叫 `failCurrent(projectRoot, 'reason')` 兩次
THEN 兩次均回傳 `false`
AND 佇列內容不改變

---

## Feature 9: paths.js — HEARTBEAT 路徑常數

### Scenario 9-1: HEARTBEAT_PID_FILE 路徑指向正確位置
@smoke
GIVEN paths.js 已匯入
WHEN 讀取 `HEARTBEAT_PID_FILE` 常數
THEN 路徑以 `~/.overtone/` 開頭（或展開後的等義路徑）
AND 路徑以 `heartbeat.pid` 結尾

### Scenario 9-2: HEARTBEAT_STATE_FILE 路徑指向正確位置
@smoke
GIVEN paths.js 已匯入
WHEN 讀取 `HEARTBEAT_STATE_FILE` 常數
THEN 路徑以 `~/.overtone/` 開頭（或展開後的等義路徑）
AND 路徑以 `heartbeat-state.json` 結尾

### Scenario 9-3: heartbeat.js 和 health-check.js 使用相同路徑常數（不魔術字串）
@edge-case
GIVEN heartbeat.js 中對 PID 檔和 state 檔的路徑參考
WHEN 檢查原始碼
THEN 不包含 `'~/.overtone/heartbeat.pid'` 的 hardcoded 字串
AND 改從 paths.js import `HEARTBEAT_PID_FILE` / `HEARTBEAT_STATE_FILE`
