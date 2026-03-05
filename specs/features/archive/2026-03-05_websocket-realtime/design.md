# websocket-realtime — 技術設計

## 技術摘要（What & Why）

- **方案**：在 `scripts/os/websocket.js` 實作 Bun 原生 WebSocket client，採用「module + CLI 入口合一」模式（`require.main === module` 區塊）
- **理由**：其他 OS 腳本（process.js / clipboard.js 等）均為純 module，但 WebSocket 需要從 Bash tool 呼叫，必須支援 CLI 入口。合一模式無需另建 wrapper 檔案，維持最小化原則
- **取捨**：CLI 端輸出 JSONL（每行一個 JSON event）而非 JSON 陣列，讓 agent 可漸進式 parse；send 子命令等待第一個 response 後即斷線，避免長時間阻塞

## API 介面設計

### module API（函式介面）

```javascript
// 所有函式的最後一個參數 _deps 供測試注入使用
// _deps = { WebSocket } — 以 Bun 原生 WebSocket 為預設

/**
 * 建立 WebSocket 連線，接收訊息直到斷線或逾時
 * @param {string} url - WebSocket URL（ws:// 或 wss://）
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs] - 連線逾時（預設 30000）
 * @param {object} [_deps]
 * @param {Function} [_deps.WebSocket]
 * @returns {Promise<{ ok: true, messages: MessageEntry[] }
 *                   |{ ok: false, error: string, message: string }>}
 */
async function connect(url, opts = {}, _deps = {}) {}

/**
 * 建立 WebSocket 連線，發送訊息，等待第一個回應後斷線
 * @param {string} url - WebSocket URL
 * @param {string} message - 要發送的訊息字串
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs] - 逾時（預設 10000）
 * @param {object} [_deps]
 * @param {Function} [_deps.WebSocket]
 * @returns {Promise<{ ok: true, sent: string, response: string, responseAt: string }
 *                   |{ ok: false, error: string, message: string }>}
 */
async function send(url, message, opts = {}, _deps = {}) {}

/**
 * 建立 WebSocket 連線，監聽指定時長的訊息流後斷線
 * @param {string} url - WebSocket URL
 * @param {object} [opts]
 * @param {number} [opts.durationMs] - 監聽時長（預設 5000）
 * @param {object} [_deps]
 * @param {Function} [_deps.WebSocket]
 * @returns {Promise<{ ok: true, messages: MessageEntry[], durationMs: number }
 *                   |{ ok: false, error: string, message: string }>}
 */
async function listen(url, opts = {}, _deps = {}) {}

module.exports = { connect, send, listen };
```

### CLI 介面

```bash
# 子命令 1：connect — 建立連線，接收直到斷線（或 --timeout）
bun plugins/overtone/scripts/os/websocket.js connect <url> [--timeout <ms>]

# 子命令 2：send — 發送訊息，等待第一個回應
bun plugins/overtone/scripts/os/websocket.js send <url> <message> [--timeout <ms>]

# 子命令 3：listen — 監聽指定時長的訊息流
bun plugins/overtone/scripts/os/websocket.js listen <url> [--duration <ms>]
```

CLI 的 stdout 輸出：
- `connect` 和 `listen`：每接收一個訊息輸出一行 JSON（JSONL 格式）；結束時輸出 summary JSON
- `send`：等待第一個 response 後輸出單一 JSON 物件
- 失敗時輸出 `{ "ok": false, "error": "ERROR_CODE", "message": "..." }` 到 stdout

## 資料模型

### MessageEntry

```javascript
{
  data: string,         // 訊息內容（text frame）
  receivedAt: string    // ISO 8601 時間戳
}
```

### connect / listen 成功回傳

```javascript
{
  ok: true,
  messages: MessageEntry[],   // 所有收到的訊息
  connectedAt: string,        // 連線建立時間（ISO 8601）
  disconnectedAt: string      // 斷線時間（ISO 8601）
}
```

### send 成功回傳

```javascript
{
  ok: true,
  sent: string,         // 發送的訊息原文
  sentAt: string,       // 發送時間（ISO 8601）
  response: string,     // 第一個回應訊息
  responseAt: string    // 回應時間（ISO 8601）
}
```

### 失敗回傳（統一格式）

```javascript
{
  ok: false,
  error: 'INVALID_URL'           // URL 格式不合法（非 ws:// 或 wss://）
       | 'CONNECTION_FAILED'     // WebSocket 連線失敗（onerror 觸發）
       | 'TIMEOUT'               // 等待回應或連線建立超時
       | 'SEND_FAILED',          // ws.send() 失敗（連線非 OPEN 狀態）
  message: string
}
```

### JSONL CLI 輸出（connect / listen 每訊息一行）

```json
{"type":"message","data":"...","receivedAt":"2026-03-05T10:00:00.000Z"}
{"type":"message","data":"...","receivedAt":"2026-03-05T10:00:01.000Z"}
{"type":"summary","ok":true,"count":2,"connectedAt":"...","disconnectedAt":"..."}
```

## 檔案結構

```
新增的檔案：
  plugins/overtone/scripts/os/websocket.js       ← 新增：WebSocket client module + CLI 入口
  plugins/overtone/skills/os-control/references/realtime.md  ← 新增：WebSocket CLI 使用指南（取代佔位符）
  tests/unit/websocket.test.js                   ← 新增：依賴注入模式測試

修改的檔案：
  plugins/overtone/skills/os-control/SKILL.md   ← 修改：realtime.md 條目狀態 P3.4 → P3.5 ✅（修改管理：manage-component.js 路徑）
```

## 關鍵技術決策

### 決策 1：module + CLI 合一（而非拆分 module / runner）

- **選擇**：在 `websocket.js` 底部加 `if (require.main === module)` 的 CLI 入口區塊
- **理由**：現有 OS 腳本都是 pure module，但 WebSocket 需要從 Bash tool 呼叫，需要 CLI。合一模式符合最小化原則，不需要額外的 wrapper 檔案
- **未選**：另建 `websocket-cli.js` — 過度拆分，30 行以下的 CLI 入口不值得獨立模組

### 決策 2：Promise + setTimeout 逾時模式

- **選擇**：用 `new Promise()` 包裝事件導向 WebSocket，搭配 `setTimeout` 做逾時控制，resolve/reject 一次後用 settled flag 避免重複調用
- **理由**：Bun 原生 WebSocket 是事件導向（onopen/onmessage/onerror/onclose），CLI 場景需要 async/await；settled flag 防止 onclose 在 timeout 後再次 reject
- **實作重點**：`let settled = false`；所有 resolve/reject 前先檢查 `if (settled) return`；呼叫後設 `settled = true`

### 決策 3：send 子命令等待第一個 response 後斷線

- **選擇**：onmessage 收到第一個訊息後立即 `ws.close()` 並 resolve
- **理由**：agent 使用場景（幣安 API 查詢、IoT 訊號回應）通常是 request/response 模式，等待完整串流不合理；listen 子命令才用於監聽串流
- **未選**：等待斷線 — 部分 WebSocket server 不主動斷線，會造成阻塞

### 決策 4：逾時預設值

- `connect`：30000ms（30 秒）— 連線建立 + 等待斷線，允許較長時間
- `send`：10000ms（10 秒）— request/response 場景，10 秒足夠
- `listen`：5000ms（5 秒）— 預設短時間採樣；可透過 `--duration` 覆蓋

### 決策 5：URL 驗證

- 只允許 `ws://` 和 `wss://` scheme，其他回傳 `INVALID_URL`
- 不做 hostname 格式深度驗證（交給 WebSocket 建構子）

### 決策 6：SKILL.md 更新路徑

- 使用 `manage-component.js update skill os-control` + body 欄位替換（agents/*.md 同樣受 pre-edit guard 保護，skills 的 SKILL.md 也受保護）
- Developer 必須先 Read SKILL.md，在正確位置修改後傳入完整 body

### 決策 7：realtime.md 為新建文件（非更新佔位符）

- 現有 `realtime.md` 只有兩行（佔位符），直接 Write 新內容覆蓋
- 格式參照 `system.md`：API Reference + CLI 範例 + 場景示例

## 實作注意事項

1. **Bun WebSocket 在 require.main 判斷**：Bun 中 `require.main === module` 等效判斷是 `import.meta.main`（ESM 語法）；但本專案用 CommonJS（`module.exports`）。需確認 Bun 對 CJS 的 `require.main` 支援。如不支援，改用 `process.argv[1].endsWith('websocket.js')` 判斷
2. **CLI 引數解析**：不引入 minimist 等套件，手動解析 `process.argv`（參考現有模式 — 其他 OS 腳本若有 CLI 入口也是手動解析）
3. **Binary frame 忽略**：只處理 text frame（string 類型訊息），binary frame 跳過（不影響正常使用場景）
4. **SKILL.md guard**：直接 Edit 會被 PreToolUse guard 阻擋，必須用 `manage-component.js update skill os-control` + body 欄位
5. **plugin.json 版本**：本次新增 websocket.js 是功能性程式碼變更，需 bump-version（patch）
