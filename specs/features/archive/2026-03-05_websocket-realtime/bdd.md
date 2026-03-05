# Feature: WebSocket 即時通訊

提供 `connect`、`send`、`listen` 三個 API，支援 WebSocket 連線、訊息發送與監聽，
並附帶 CLI 入口供指令列直接操作。

---

## Feature 1: connect — 建立連線並接收訊息

### Scenario: 正常連線並接收多筆訊息
GIVEN 一個可用的 WebSocket 伺服器正在 ws://localhost:8080 監聽
WHEN 呼叫 `connect("ws://localhost:8080")`
AND 伺服器在連線期間送出兩筆訊息後關閉連線
THEN 回傳 `{ ok: true, messages: [...], connectedAt: <ISO string>, disconnectedAt: <ISO string> }`
AND `messages` 陣列包含兩筆 `{ data: string, receivedAt: string }` 格式的訊息

### Scenario: 連線在 timeout 期間未斷線則自動逾時結束
GIVEN 一個持續保持連線的 WebSocket 伺服器
WHEN 呼叫 `connect("ws://localhost:8080", { timeout: 500 })`
AND 連線超過 500ms 仍未收到 close 事件
THEN 回傳 `{ ok: true, messages: [...], connectedAt: <ISO string>, disconnectedAt: <ISO string> }`
AND 已收到的訊息包含在 `messages` 中

### Scenario: 無效 URL 格式導致連線失敗
GIVEN 沒有任何 WebSocket 伺服器
WHEN 呼叫 `connect("not-a-valid-url")`
THEN 回傳 `{ ok: false, error: "INVALID_URL", message: <描述字串> }`

### Scenario: 伺服器拒絕連線
GIVEN 沒有可連線的 WebSocket 伺服器在目標位址
WHEN 呼叫 `connect("ws://localhost:19999")`
THEN 回傳 `{ ok: false, error: "CONNECTION_FAILED", message: <描述字串> }`

### Scenario: 連線逾時（伺服器不回應 open）
GIVEN 一個 mock WebSocket，其 `open` 事件永遠不觸發
WHEN 呼叫 `connect("ws://localhost:8080", { timeout: 100 }, { WebSocket: MockWS })`
THEN 回傳 `{ ok: false, error: "TIMEOUT", message: <描述字串> }`

---

## Feature 2: send — 發送訊息並等待回應

### Scenario: 發送訊息並成功收到伺服器回應
GIVEN 一個 WebSocket 伺服器，收到訊息後立即回傳 echo
WHEN 呼叫 `send("ws://localhost:8080", "hello")`
THEN 回傳 `{ ok: true, sent: "hello", sentAt: <ISO string>, response: "hello", responseAt: <ISO string> }`

### Scenario: 發送成功但等待回應逾時
GIVEN 一個 mock WebSocket，`open` 事件正常觸發，但不送出任何訊息
WHEN 呼叫 `send("ws://localhost:8080", "ping", { timeout: 100 }, { WebSocket: MockWS })`
THEN 回傳 `{ ok: false, error: "TIMEOUT", message: <描述字串> }`

### Scenario: 發送訊息失敗（WebSocket 尚未就緒）
GIVEN 一個 mock WebSocket，`send()` 呼叫拋出例外
WHEN 呼叫 `send("ws://localhost:8080", "data", {}, { WebSocket: MockWS })`
THEN 回傳 `{ ok: false, error: "SEND_FAILED", message: <描述字串> }`

### Scenario: 無效 URL 導致 send 失敗
GIVEN 沒有任何 WebSocket 伺服器
WHEN 呼叫 `send("invalid-url", "hello")`
THEN 回傳 `{ ok: false, error: "INVALID_URL", message: <描述字串> }`

---

## Feature 3: listen — 監聽指定時間的訊息

### Scenario: 監聽期間持續收到訊息
GIVEN 一個 mock WebSocket，每 100ms 送出一筆訊息
WHEN 呼叫 `listen("ws://localhost:8080", { duration: 350 }, { WebSocket: MockWS })`
THEN 回傳 `{ ok: true, messages: [...], durationMs: 350, connectedAt: <ISO string>, disconnectedAt: <ISO string> }`
AND `messages` 陣列包含監聽期間收到的訊息

### Scenario: 監聽期間連線提前斷開
GIVEN 一個 mock WebSocket，在 150ms 後觸發 `close` 事件
WHEN 呼叫 `listen("ws://localhost:8080", { duration: 5000 }, { WebSocket: MockWS })`
THEN 回傳 `{ ok: true, messages: [...], durationMs: <實際持續時間>, connectedAt: <ISO string>, disconnectedAt: <ISO string> }`
AND `durationMs` 反映實際監聽時間而非 5000ms

### Scenario: 監聽期間未收到任何訊息
GIVEN 一個 mock WebSocket，連線成功但不送出任何訊息
WHEN 呼叫 `listen("ws://localhost:8080", { duration: 100 }, { WebSocket: MockWS })`
THEN 回傳 `{ ok: true, messages: [], durationMs: 100, connectedAt: <ISO string>, disconnectedAt: <ISO string> }`

### Scenario: 無效 URL 導致 listen 失敗
GIVEN 沒有任何 WebSocket 伺服器
WHEN 呼叫 `listen("bad://url", { duration: 100 })`
THEN 回傳 `{ ok: false, error: "INVALID_URL", message: <描述字串> }`

---

## Feature 4: CLI 入口

### Scenario: connect 子命令正常呼叫
GIVEN CLI 工具 `scripts/os/websocket.js` 存在
WHEN 執行 `bun scripts/os/websocket.js connect ws://localhost:8080 --timeout 5000`
THEN 程式以 JSON 格式輸出連線結果到 stdout
AND 結果包含 `ok`、`messages`、`connectedAt`、`disconnectedAt` 欄位

### Scenario: send 子命令正常呼叫
GIVEN CLI 工具可存取目標 WebSocket 伺服器
WHEN 執行 `bun scripts/os/websocket.js send ws://localhost:8080 "hello" --timeout 3000`
THEN 程式以 JSON 格式輸出發送結果
AND 結果包含 `ok`、`sent`、`sentAt`、`response`、`responseAt` 欄位

### Scenario: listen 子命令正常呼叫
GIVEN CLI 工具可存取目標 WebSocket 伺服器
WHEN 執行 `bun scripts/os/websocket.js listen ws://localhost:8080 --duration 2000`
THEN 程式以 JSON 格式輸出監聽結果
AND 結果包含 `ok`、`messages`、`durationMs` 欄位

### Scenario: 無效子命令
GIVEN CLI 工具已啟動
WHEN 執行 `bun scripts/os/websocket.js unknown ws://localhost:8080`
THEN 程式輸出使用說明或錯誤提示到 stderr
AND process 以非零 exit code 結束

### Scenario: send 子命令缺少 message 參數
GIVEN CLI 工具已啟動
WHEN 執行 `bun scripts/os/websocket.js send ws://localhost:8080`（不提供 message）
THEN 程式輸出參數錯誤提示
AND process 以非零 exit code 結束

### Scenario: 缺少 URL 參數
GIVEN CLI 工具已啟動
WHEN 執行 `bun scripts/os/websocket.js connect`（不提供 URL）
THEN 程式輸出參數不足提示
AND process 以非零 exit code 結束

---

## Feature 5: 依賴注入（Testability）

### Scenario: 使用 mock WebSocket 取代真實實作
GIVEN 一個符合 WebSocket 介面的 mock 類別（支援 `open`、`message`、`close`、`error` 事件）
WHEN 呼叫 `connect("ws://mock", {}, { WebSocket: MockWebSocket })`
THEN 模組使用 MockWebSocket 而非全域 WebSocket 建立連線
AND 回傳結果與真實 WebSocket 格式相同

### Scenario: mock WebSocket 可模擬訊息序列
GIVEN 一個 mock WebSocket，預設在 open 後立即送出指定訊息陣列，再觸發 close
WHEN 呼叫 `listen("ws://mock", { duration: 1000 }, { WebSocket: MockWebSocket })`
THEN 回傳的 `messages` 與 mock 送出的訊息序列一致
AND 不需要真實網路連線即可完成測試

### Scenario: mock WebSocket 可模擬連線失敗
GIVEN 一個 mock WebSocket，在建立實例後立即觸發 `error` 事件
WHEN 呼叫 `connect("ws://mock", {}, { WebSocket: MockWebSocket })`
THEN 回傳 `{ ok: false, error: "CONNECTION_FAILED", message: <描述字串> }`
AND 不需要真實網路連線即可驗證錯誤處理邏輯
