# BDD Spec: dashboard-duplicate-spawn-fix

## 涵蓋範圍

本規格涵蓋四層防線的行為定義：
- Feature 1: `probePort()` — 同步 HTTP port 探測
- Feature 2: `isRunning()` — PID 檢查 + port probe fallback
- Feature 3: `on-start.js` — OVERTONE_NO_DASHBOARD + spawn 控制（移除自動開瀏覽器）
- Feature 4: `server.js` — EADDRINUSE graceful exit

---

# Feature 1: probePort() — 同步 HTTP Port 探測

## Scenario: port 上有 Overtone server 且 /health 回傳 ok:true 時視為存活
GIVEN port 7777 上有 Overtone server 正在執行
AND GET http://localhost:7777/health 回傳 `{ ok: true }`
WHEN `probePort(7777)` 被呼叫
THEN 函式回傳 `true`

## Scenario: port 上無任何程序時回傳 false
GIVEN port 7777 無任何程序在監聽
WHEN `probePort(7777)` 被呼叫
AND curl 執行後收到 connection refused
THEN 函式回傳 `false`

## Scenario: curl 執行超時（server 無回應）時回傳 false
GIVEN port 7777 有程序在監聽但未回應 HTTP 請求
WHEN `probePort(7777)` 被呼叫
AND curl 在 1 秒內未收到回應（--max-time 1 超時）
THEN 函式回傳 `false`
AND 不拋出例外

## Scenario: server 回應非 JSON 格式時回傳 false
GIVEN port 7777 有非 Overtone 的 HTTP server（如 nginx）在執行
AND GET http://localhost:7777/health 回傳非 JSON 的字串（如 HTML 404 頁面）
WHEN `probePort(7777)` 被呼叫
AND JSON.parse() 解析失敗拋出 SyntaxError
THEN 函式回傳 `false`
AND 不拋出例外

## Scenario: server 回應 JSON 但 ok 不為 true 時回傳 false
GIVEN port 7777 有程序在執行
AND GET http://localhost:7777/health 回傳 `{ ok: false }` 或 `{ status: "ok" }`（非 Overtone 格式）
WHEN `probePort(7777)` 被呼叫
THEN 函式回傳 `false`

## Scenario: curl 命令本身不存在或執行失敗時回傳 false
GIVEN 系統環境異常，execSync 呼叫 curl 拋出 Error
WHEN `probePort(7777)` 被呼叫
THEN catch 捕捉到例外
AND 函式回傳 `false`
AND 不拋出例外（靜默降級）

---

# Feature 2: isRunning() — PID 檢查 + Port Probe Fallback

## Scenario: PID 有效且進程存在時直接回傳 true（不呼叫 probePort）
GIVEN dashboard.json 存在，記錄 `{ pid: 12345, port: 7777, startedAt: "..." }`
AND PID 12345 的進程確實存在（process.kill(pid, 0) 不拋出）
WHEN `isRunning({ port: 7777 })` 被呼叫
THEN 函式回傳 `true`
AND probePort() 未被呼叫（PID 驗證已足夠）

## Scenario: dashboard.json 不存在時 fallback 到 probePort，port 有 server 回傳 true
GIVEN dashboard.json 不存在（從未啟動過或已清除）
AND port 7777 上有 Overtone server 正在執行（/health 回傳 ok:true）
WHEN `isRunning({ port: 7777 })` 被呼叫
THEN PID 讀取失敗，觸發 probePort(7777) fallback
AND probePort(7777) 回傳 `true`
AND 函式回傳 `true`

## Scenario: PID 殘留但進程不存在時，fallback 到 probePort，port 無 server 回傳 false
GIVEN dashboard.json 存在，記錄 PID 999999（極大值，必然不存在）
AND port 7777 無任何 Overtone server 在執行
WHEN `isRunning({ port: 7777 })` 被呼叫
THEN process.kill(999999, 0) 拋出 ESRCH
AND 觸發 probePort(7777) fallback
AND probePort(7777) 回傳 `false`
AND 函式回傳 `false`

## Scenario: PID 殘留但進程不存在，port 上仍有 Overtone server 時回傳 true
GIVEN dashboard.json 存在，記錄 PID 999999（stale PID，進程已死）
AND port 7777 上有 Overtone server 正在執行（PID 已更新但 dashboard.json 未同步）
WHEN `isRunning({ port: 7777 })` 被呼叫
THEN process.kill(999999, 0) 拋出 ESRCH
AND 觸發 probePort(7777) fallback
AND probePort(7777) 回傳 `true`
AND 函式回傳 `true`

## Scenario: dashboard.json 不存在且 port 無 server 時回傳 false
GIVEN dashboard.json 不存在
AND port 7777 無任何 Overtone server 在執行
WHEN `isRunning({ port: 7777 })` 被呼叫
THEN PID 讀取失敗，觸發 probePort(7777) fallback
AND probePort(7777) 回傳 `false`
AND 函式回傳 `false`

## Scenario: 未傳入 opts 時向後相容，使用預設 port 7777
GIVEN dashboard.json 不存在
WHEN `isRunning()` 被呼叫（不帶任何參數）
THEN 函式不拋出 TypeError（opts 為 undefined 時安全處理）
AND fallback port 預設為 7777

---

# Feature 3: on-start.js — OVERTONE_NO_DASHBOARD + Spawn 控制

## Scenario: 首次啟動正常 spawn Dashboard server（PM S1）
GIVEN OVERTONE_NO_DASHBOARD 環境變數未設定
AND dashboard.json 不存在（首次啟動）
AND port 7777 無 Overtone server 在執行
AND session_id 有效
WHEN on-start.js hook 被執行
THEN isRunning() 回傳 false（PID 不存在，port probe 也失敗）
AND spawn Dashboard server 子進程（detached: true, stdio: 'ignore'）
AND hook exit code 為 0

## Scenario: 已有 Dashboard server 執行中時不重複 spawn（PM S2）
GIVEN OVERTONE_NO_DASHBOARD 環境變數未設定
AND isRunning({ port: 7777 }) 回傳 true（PID 存在且進程健在）
AND session_id 有效
WHEN on-start.js hook 被執行
THEN shouldSpawnDashboard 為 false
AND 不觸發 spawn 子進程
AND hook exit code 為 0

## Scenario: PID 不存在但 port 有 Overtone server 時不重複 spawn（PM S4）
GIVEN OVERTONE_NO_DASHBOARD 環境變數未設定
AND dashboard.json 不存在（PID 檔案不存在）
AND port 7777 上有 Overtone server 在執行（/health 回傳 ok:true）
AND session_id 有效
WHEN on-start.js hook 被執行
THEN isRunning() PID 檢查失敗後觸發 probePort fallback
AND probePort(7777) 回傳 true
AND shouldSpawnDashboard 為 false
AND 不觸發 spawn 子進程

## Scenario: OVERTONE_NO_DASHBOARD=1 時跳過 Dashboard 所有邏輯（PM S6）
GIVEN OVERTONE_NO_DASHBOARD='1' 已設定為環境變數
AND session_id 有效
WHEN on-start.js hook 被執行
THEN skipDashboard 為 truthy
AND shouldSpawnDashboard 為 false（不檢查 isRunning，直接跳過）
AND 不觸發 spawn 子進程
AND hook exit code 為 0
AND banner 訊息正常輸出（不影響非 Dashboard 功能）

## Scenario: 移除自動開瀏覽器後 hook 不執行 open/xdg-open 指令
GIVEN OVERTONE_NO_DASHBOARD 未設定
AND session_id 有效
AND Dashboard spawn 已觸發
WHEN on-start.js hook 執行完成
THEN 不呼叫 open 或 xdg-open 指令
AND 不檢查 OVERTONE_NO_BROWSER 環境變數

## Scenario: OVERTONE_NO_DASHBOARD 設定時 banner 正常輸出不受影響
GIVEN OVERTONE_NO_DASHBOARD='1' 已設定
AND session_id 有效
WHEN on-start.js hook 被執行
THEN stdout 包含 banner 輸出（或 JSON systemMessage）
AND hook exit code 為 0
AND stderr 無錯誤訊息

---

# Feature 4: server.js — EADDRINUSE Graceful Exit

## Scenario: port 衝突時 server 靜默退出（exit 0）（PM S5）
GIVEN port 7777 已被另一個 Overtone server 佔用
WHEN server.js 被啟動，Bun.serve({ port: 7777 }) 執行
AND Bun.serve() 拋出含 EADDRINUSE 的 Error
THEN catch 捕捉到 EADDRINUSE 錯誤
AND 向 stderr 輸出提示訊息（「Port 7777 已被佔用，Dashboard 已有 instance 在執行中」）
AND process.exit(0)（graceful exit，exit code 為 0）
AND pid.write() 未被執行（未成功 bind port）

## Scenario: port 衝突時錯誤 message 含 "address already in use" 也觸發 graceful exit
GIVEN port 7777 已被佔用
WHEN Bun.serve() 拋出 Error，其 message 包含 "address already in use"（但 code 非 EADDRINUSE）
THEN 同樣被 catch 捕捉
AND process.exit(0)

## Scenario: 其他非 port 衝突錯誤時正常拋出
GIVEN Bun.serve() 因其他原因拋出 Error（如設定參數錯誤，code 非 EADDRINUSE）
WHEN server.js 執行
THEN 錯誤被 re-throw（不被 catch 吞掉）
AND process 以非 0 exit code 退出

## Scenario: port 無衝突時 server 正常啟動並寫入 PID（PM S1 的 server 端）
GIVEN port 7777 無其他程序佔用
WHEN server.js 被啟動，Bun.serve({ port: 7777 }) 執行
THEN Bun.serve() 成功回傳 server 物件
AND pid.write({ pid, port, startedAt }) 被執行（在 try-catch 之後）
AND server 正常監聽 port 7777

---

# Feature 5: 端到端多 Session 啟動競爭防護

## Scenario: 兩個 session 近乎同時啟動，只有一個 Dashboard 存活（PM S7）
GIVEN session A 的 on-start.js 先執行，isRunning() 回傳 false
AND session A spawn Dashboard server，server 開始 bind port 7777
AND session B 的 on-start.js 在 server A bind port 前執行（isRunning 可能仍回傳 false）
WHEN session B 也嘗試 spawn 一個 Dashboard server
THEN 其中一個 server 成功 bind port 7777，正常啟動並寫入 PID
AND 另一個 server 因 EADDRINUSE 觸發 graceful exit（process.exit(0)）
AND 最終只有一個 Dashboard instance 在執行

## Scenario: PID 殘留但 server 已死時，新 session 能清理重啟（PM S3）
GIVEN dashboard.json 存在，記錄 PID 99999（進程已不存在）
AND port 7777 無任何 Overtone server 在執行（前次 server 已停止）
AND session_id 有效，OVERTONE_NO_DASHBOARD 未設定
WHEN on-start.js hook 被執行
THEN isRunning() 執行：process.kill(99999, 0) 拋出 ESRCH
AND probePort(7777) 也回傳 false（port 無活躍 server）
AND isRunning() 最終回傳 false
AND shouldSpawnDashboard 為 true
AND spawn 新的 Dashboard server 子進程
AND hook exit code 為 0
