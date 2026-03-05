# 即時通訊層（P3.4）

Overtone 即時通訊層提供 WebSocket 連線、訊息發送與監聽能力。
Agent 可以透過這些 API 與 WebSocket 伺服器進行即時通訊，實現數據串流、訊息推播等場景。

---

## API Reference

### websocket.js — WebSocket 即時通訊模組

位置：`plugins/overtone/scripts/os/websocket.js`

所有函式的最後一個參數 `_deps` 供測試注入使用，正常呼叫時可省略。

#### 共同模式

- **不 throw**：所有錯誤以 `{ ok: false, error, message }` 回傳
- **依賴注入**：`_deps = { WebSocket: globalThis.WebSocket }`，測試時可注入 mock
- **URL 驗證**：必須是 `ws://` 或 `wss://` 開頭，否則回傳 `INVALID_URL`
- **Error Codes**：`INVALID_URL`、`CONNECTION_FAILED`、`TIMEOUT`、`SEND_FAILED`

#### MessageEntry 結構

```javascript
{
  data: string,        // 訊息內容
  receivedAt: string   // ISO 8601 接收時間戳
}
```

---

#### `connect(url, opts?, _deps?)`

建立 WebSocket 連線，持續接收訊息直到伺服器關閉連線或逾時。

```javascript
const { connect } = require('./plugins/overtone/scripts/os/websocket');

const result = await connect('ws://localhost:8080');
// => {
//   ok: true,
//   messages: [
//     { data: 'hello', receivedAt: '2026-03-05T10:00:00.001Z' },
//     { data: 'world', receivedAt: '2026-03-05T10:00:00.002Z' },
//   ],
//   connectedAt: '2026-03-05T10:00:00.000Z',
//   disconnectedAt: '2026-03-05T10:00:01.000Z'
// }

// 自訂逾時
const result2 = await connect('ws://localhost:8080', { timeout: 5000 });
```

**參數**：
- `url` (string, 必填)：WebSocket 伺服器 URL（ws:// 或 wss://）
- `opts.timeout` (number, 選填)：逾時毫秒數，預設 `30000`

**回傳**：
- 成功：`{ ok: true, messages: MessageEntry[], connectedAt: string, disconnectedAt: string }`
- 失敗：`{ ok: false, error: 'INVALID_URL'|'CONNECTION_FAILED'|'TIMEOUT', message: string }`

**逾時行為**：
- 若 `open` 事件未在 timeout 內觸發 → `TIMEOUT`
- 若 `open` 已觸發，timeout 到期 → 正常結束，回傳已收到的訊息

---

#### `send(url, message, opts?, _deps?)`

連線到 WebSocket 伺服器，發送一筆訊息，等待第一個回應後斷線。

```javascript
const { send } = require('./plugins/overtone/scripts/os/websocket');

const result = await send('ws://localhost:8080', 'hello');
// => {
//   ok: true,
//   sent: 'hello',
//   sentAt: '2026-03-05T10:00:00.001Z',
//   response: { data: 'hello', receivedAt: '2026-03-05T10:00:00.005Z' },
//   responseAt: '2026-03-05T10:00:00.005Z'
// }
```

**參數**：
- `url` (string, 必填)：WebSocket 伺服器 URL
- `message` (string, 必填)：要發送的訊息
- `opts.timeout` (number, 選填)：等待回應的逾時毫秒數，預設 `10000`

**回傳**：
- 成功：`{ ok: true, sent: string, sentAt: string, response: MessageEntry, responseAt: string }`
- 失敗：`{ ok: false, error: 'INVALID_URL'|'CONNECTION_FAILED'|'TIMEOUT'|'SEND_FAILED', message: string }`

---

#### `listen(url, opts?, _deps?)`

監聽 WebSocket 伺服器的訊息，持續指定時間後回傳所有收到的訊息。

```javascript
const { listen } = require('./plugins/overtone/scripts/os/websocket');

const result = await listen('ws://localhost:8080', { duration: 5000 });
// => {
//   ok: true,
//   messages: [
//     { data: 'event1', receivedAt: '2026-03-05T10:00:01.000Z' },
//     { data: 'event2', receivedAt: '2026-03-05T10:00:02.000Z' },
//   ],
//   durationMs: 5000,          // 實際監聽時間（連線提前斷開時可能較短）
//   connectedAt: '2026-03-05T10:00:00.000Z',
//   disconnectedAt: '2026-03-05T10:00:05.000Z'
// }
```

**參數**：
- `url` (string, 必填)：WebSocket 伺服器 URL
- `opts.duration` (number, 選填)：監聽時間毫秒數，預設 `5000`

**回傳**：
- 成功：`{ ok: true, messages: MessageEntry[], durationMs: number, connectedAt: string, disconnectedAt: string }`
  - `durationMs`：實際監聽時間，連線提前斷開時反映真實持續時間
- 失敗：`{ ok: false, error: 'INVALID_URL'|'CONNECTION_FAILED', message: string }`

---

## CLI 入口

```bash
# 建立連線並接收訊息（JSON 輸出）
bun scripts/os/websocket.js connect ws://localhost:8080 --timeout 5000

# 發送訊息並等待回應（JSON 輸出）
bun scripts/os/websocket.js send ws://localhost:8080 "hello" --timeout 3000

# 監聽指定時間（JSON 輸出）
bun scripts/os/websocket.js listen ws://localhost:8080 --duration 2000
```

**CLI 行為**：
- 無效子命令或缺少參數 → stderr 輸出錯誤提示 + exit code 1
- connect/listen/send：JSON 輸出結果到 stdout

---

## 測試（Mock WebSocket）

測試時使用依賴注入，完全不需要真實網路：

```javascript
const { connect, send, listen } = require('./plugins/overtone/scripts/os/websocket');

// 建立 mock WebSocket
class MockWebSocket {
  constructor(url) {
    this.url = url;
    setImmediate(() => {
      if (this.onopen) this.onopen();
      setTimeout(() => {
        if (this.onmessage) this.onmessage({ data: 'hello' });
        if (this.onclose) this.onclose({ code: 1000 });
      }, 10);
    });
  }
  send(msg) {
    setTimeout(() => {
      if (this.onmessage) this.onmessage({ data: msg });
    }, 5);
  }
  close() {}
}

// 注入 mock
const result = await connect('ws://mock', {}, { WebSocket: MockWebSocket });
// => { ok: true, messages: [{ data: 'hello', receivedAt: '...' }], ... }
```

---

## 共同設計模式

websocket.js 遵循 P3.x 統一設計模式：

1. **不受平台限制**：WebSocket 是跨平台標準協議，無 darwin guard
2. **依賴注入**：`_deps = { WebSocket }` — 方便測試替換
3. **不 throw**：所有錯誤以 `{ ok: false, error, message }` 回傳
4. **Promise-based**：所有 API 回傳 Promise，可用 async/await
5. **Error Codes**：`INVALID_URL`、`CONNECTION_FAILED`、`TIMEOUT`、`SEND_FAILED`
