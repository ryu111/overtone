# Design：p3-2-heartbeat（P3.2 心跳引擎）

## 技術摘要（What & Why）

### 方案：PID 檔 Daemon + stream-json 完成偵測 + 直接 TelegramAdapter 實例化

- **方案**：以 `bun scripts/heartbeat.js start|stop|status` 啟動常駐 daemon，用 PID 檔（`~/.overtone/heartbeat.pid`）管理生命週期，polling execution-queue.json（每 10 秒），偵測到 pending 項目後透過 `session-spawner.js` spawn `claude -p` 子程序，監聽 stream-json stdout 事件作為完成訊號。
- **理由**：最小依賴、不需要額外基礎設施，PID 檔是 UNIX daemon 標準做法，Bun 原生支援 `process.kill(pid, 0)` 存活確認。
- **取捨**：若 daemon 本身意外崩潰，無自動重啟（Should 版加 launchd，此為 MVP 可接受）。stream-json 解析增加複雜度，但能即時偵測完成，優於 polling 延遲。

---

## Open Questions 決定

### Q1：session 完成偵測策略

**決定：stream-json `result` 事件（即時偵測）+ timeout 兜底**

- 監聽 `claude -p` stdout 的 stream-json 流，解析 `{"type":"result","subtype":"success"|"error_max_turns"|"error_during_stream"}` 作為終止訊號
- 兜底機制：spawn 後設 60 分鐘 timeout（`setTimeout`），timeout 到視為失敗，呼叫 `process.kill(child.pid, 'SIGTERM')`
- stream 關閉（`child.stdout on 'close'`）時也觸發清理，確保不論正常還是 crash 都能解除 `activeSession`
- 理由：stream-json `result` 事件是 Claude Code `--output-format stream-json` 的最終事件，可靠性高；timeout 作為 crash 保障

### Q2：prompt 格式

**決定：自然語言 prompt，讓 UserPromptSubmit hook 接管**

- prompt 格式：`開始執行 {featureName}，workflow: {workflow}`
- 不注入 Overtone Workflow Context（避免 heartbeat 邏輯與 hook 邏輯重複）
- 由 UserPromptSubmit hook（`pre-prompt.js`）的 `/ot:auto` 自動接管，偵測 featureName 並啟動 workflow
- 理由：單一職責原則，heartbeat 只負責「觸發」，workflow 初始化由現有 hook 機制處理

### Q3：projectRoot 傳遞

**決定：daemon 啟動時接受 `--project-root <path>` 參數，fallback 到 `process.cwd()`**

- CLI 介面：`bun scripts/heartbeat.js start [--project-root <path>]`
- 若未提供，使用 `process.cwd()`（在專案目錄執行時自然正確）
- projectRoot 作為 daemon 狀態的一部分，存入 `~/.overtone/heartbeat-state.json`（與 PID 一起）
- 理由：明確傳參比讀 config.json 更簡單可預期，符合最小設計原則

### Q4：Telegram 通知架構

**決定：heartbeat.js 直接實例化 TelegramAdapter，不依賴 EventBus**

- heartbeat.js 在啟動時讀取 `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` 環境變數
- 直接 `new TelegramAdapter(token, null, { chatId })` 並呼叫其 `_sendMessage` 方法（需新增 `notify` 公開方法）
- 缺少 token 時靜默跳過（token 不作為必要條件）
- 理由：heartbeat daemon 是獨立程序，不與 server.js 共存，直接實例化避免跨程序 EventBus 通訊的複雜度

### Q5：`--resume` 策略

**決定：每個佇列項目使用全新 session，不使用 `--resume`**

- 每次 spawn 都是全新的 `claude -p` session（無 `--resume`）
- 理由：佇列中的每個任務是獨立的 feature，不需要跨任務保留 context；新 session 確保隔離，避免 context 污染；`--resume` 留作 Should 版本的選項（若同一 feature 的多步需要 context 接力）

---

## API 介面設計

### heartbeat.js（CLI 入口）

```
# CLI 介面
bun scripts/heartbeat.js start [--project-root <path>]
bun scripts/heartbeat.js stop
bun scripts/heartbeat.js status
```

### session-spawner.js

```javascript
/**
 * spawn — 啟動新 Claude Code session
 * @param {string} prompt - 傳給 claude -p 的 prompt 文字
 * @param {object} [opts]
 * @param {string} [opts.pluginDir] - plugin 目錄路徑（預設自動偵測）
 * @param {string} [opts.cwd] - 子程序工作目錄（預設 projectRoot）
 * @param {number} [opts.timeout] - 逾時毫秒（預設 3600000 = 60 分鐘）
 * @param {object} [_deps] - 依賴注入（{ spawn }）
 * @returns {SpawnResult}
 */
function spawnSession(prompt, opts = {}, _deps = {})

/**
 * @typedef {Object} SpawnResult
 * @property {ChildProcess} child - 子程序（用於 kill）
 * @property {Promise<SessionOutcome>} outcome - 完成 Promise
 */

/**
 * @typedef {Object} SessionOutcome
 * @property {'success'|'error'|'timeout'|'crash'} status
 * @property {string|null} sessionId - 從 stream-json 解析的 session_id（可能為 null）
 * @property {string|null} errorCode - 錯誤碼（status 非 success 時）
 */
```

### TelegramAdapter 新增公開方法

```javascript
/**
 * 傳送純文字通知（公開方法，heartbeat 使用）
 * @param {string} message
 * @returns {Promise<void>}
 */
async notify(message)
```

---

## 資料模型

### daemon 狀態（記憶體 + 檔案）

heartbeat daemon 的執行狀態存於記憶體，同時持久化到 `~/.overtone/heartbeat-state.json` 供 `status` 命令讀取：

```javascript
// DaemonState（記憶體中）
{
  pid: number,                 // daemon 自身 PID
  projectRoot: string,         // 監聽的專案根目錄
  activeSession: {             // 目前執行中的 session（null 表示空閒）
    child: ChildProcess,
    itemName: string,          // 佇列項目名稱
    startedAt: string,         // ISO 8601
  } | null,
  consecutiveFailures: number, // 連續失敗次數（成功一次 reset 為 0）
  paused: boolean,             // true 時 polling 跳過 spawn
  startedAt: string,           // ISO 8601
}
```

### heartbeat-state.json（持久化，`status` 命令讀取）

儲存位置：`~/.overtone/heartbeat-state.json`

```json
{
  "pid": 12345,
  "projectRoot": "/Users/user/myproject",
  "activeItem": "implement-login",
  "consecutiveFailures": 0,
  "paused": false,
  "startedAt": "2026-03-03T10:00:00Z",
  "lastPollAt": "2026-03-03T10:01:00Z"
}
```

### heartbeat.pid

儲存位置：`~/.overtone/heartbeat.pid`
內容：純文字 PID 數字（如 `12345\n`）

---

## 佇列狀態機

```
pending → in_progress → completed
                      ↘ failed（使用者手動標記，heartbeat 不寫 failed）
```

heartbeat 的操作序列：

```
[polling loop, 每 10 秒]
1. activeSession !== null → 跳過（最大並行 = 1）
2. paused === true → 跳過
3. executionQueue.getCurrent() → 若有 in_progress → 跳過（其他 session 正在執行）
4. executionQueue.getNext() → 無 pending → 跳過
5. executionQueue.advanceToNext() → 將下一項標記為 in_progress
6. sessionSpawner.spawnSession(prompt, { cwd: projectRoot }) → 啟動 claude -p
7. state.activeSession = { child, itemName, startedAt }
8. outcome.then(result => {
     if (result.status === 'success') {
       executionQueue.completeCurrent(projectRoot)
       state.consecutiveFailures = 0
     } else {
       state.consecutiveFailures++
       if (state.consecutiveFailures >= 3) {
         state.paused = true
         telegram.notify('連續 3 次失敗，daemon 暫停')
       }
     }
     state.activeSession = null
   })
```

---

## 安全邊界實作

### 最大並行 = 1

polling loop 開頭檢查 `state.activeSession !== null`，有則立即 return。

### 連續失敗暫停

```
consecutiveFailures threshold: 3
paused 條件：consecutiveFailures >= 3
paused 恢復：不提供自動恢復；需 stop + start 手動重啟（或 reset state 後 start）
成功一次：consecutiveFailures = 0
```

### spawn 失敗隔離

`spawnSession()` 的 outcome Promise 不 throw，統一以 `{ status: 'error'|'crash'|'timeout' }` 回傳，heartbeat 只需判斷 `status !== 'success'`。

---

## 錯誤處理策略

| 錯誤情況 | 處理方式 |
|---------|---------|
| PID 檔已存在，process 存活 | `start` 拒絕啟動，輸出「daemon 已在執行（PID: N）」 |
| PID 檔已存在，process 不存在（殭屍） | 刪除 PID 檔，正常啟動（stale PID 自動清理） |
| `stop` 時 PID 不存在 | 輸出「daemon 未在執行」，exit 0 |
| spawn 後子程序立即 crash | `child.stdout` 關閉觸發清理，`consecutiveFailures++` |
| 60 分鐘 timeout | `process.kill(child.pid, 'SIGTERM')`，outcome 以 `timeout` 回傳 |
| execution-queue.json 損壞 | `readQueue` 回傳 null → getNext 回傳 null → 本輪 polling 跳過 |
| Telegram token 不存在 | `this.chatId` 為 null → `_sendMessage` 直接 return |
| SIGTERM 收到（stop 命令） | `process.on('SIGTERM', cleanup)` → 殺活躍子程序 → 刪 PID 檔 → exit 0 |

---

## 與 on-stop.js 的整合（避免重複職責）

- **on-stop.js** 職責：在 Claude Code session 結束時，呼叫 `executionQueue.completeCurrent()` 並 hint 下一項（`queueHint`）。
- **heartbeat.js** 職責：在 session **外部**，偵測佇列 pending 項目並 **spawn** 新 session。
- **潛在重複點**：on-stop.js 已有 `completeCurrent + getNext` 邏輯；heartbeat.js 也會 `completeCurrent`。
- **解決方案**：heartbeat 在 outcome 成功後呼叫 `completeCurrent(projectRoot)`，on-stop.js 在 session 結束時也會呼叫。由於 `completeCurrent` 是冪等的（找不到 in_progress 就 return false），重複呼叫安全。heartbeat 依賴 `outcome.status === 'success'`，而 on-stop.js 依賴 workflow 完成標誌，兩者不衝突。
- **注意**：heartbeat spawn 的 session 執行完整 workflow，on-stop.js 會正常觸發並處理 completeCurrent，heartbeat 的 outcome callback 是第二道保障。

---

## execution-queue.js 修改：新增 failCurrent()

現有 `execution-queue.js` 缺少失敗標記函式。heartbeat 在 session 失敗時需要將 `in_progress` 項目標記為失敗，否則該項目永遠卡在 `in_progress` 狀態，阻擋 polling。

```javascript
/**
 * 將目前正在執行的項目標記為失敗
 * @param {string} projectRoot
 * @param {string} [reason] - 失敗原因描述（可選）
 * @returns {boolean} 是否成功標記
 */
function failCurrent(projectRoot, reason) {
  const queue = readQueue(projectRoot);
  if (!queue) return false;

  const index = queue.items.findIndex(i => i.status === 'in_progress');
  if (index === -1) return false;

  queue.items[index].status = 'failed';
  queue.items[index].failedAt = new Date().toISOString();
  if (reason) queue.items[index].failReason = reason;

  const filePath = _queuePath(projectRoot);
  atomicWrite(filePath, queue);
  return true;
}
```

需同時更新 `module.exports` 加入 `failCurrent`。

---

## 測試策略

### session-spawner.test.js

`_deps` 注入 `{ spawn }`：

- mock spawn 回傳假的 `child`，stdout 為 `EventEmitter`
- 測試 stream-json 正常流：emit success result → outcome resolves `{ status: 'success', sessionId: '...' }`
- 測試 stream-json 錯誤流：emit error result → outcome resolves `{ status: 'error' }`
- 測試 stdout close（crash）：emit close → outcome resolves `{ status: 'crash' }`
- 測試 timeout：`opts.timeout = 100ms` → outcome resolves `{ status: 'timeout' }`
- 測試 prompt/參數組裝：驗證 spawn 呼叫的 args 含 `--plugin-dir`、`--output-format stream-json`

### heartbeat.test.js

`_deps` 注入 `{ executionQueue, spawnSession, telegram, readPid, writePid, deletePid }`：

- 測試 `start`：無 PID 時正常啟動，寫 PID 檔
- 測試 `start`：PID 存在且 process 存活時拒絕
- 測試 `start`：PID 存在但 process 不存在時清理後啟動（stale PID）
- 測試 `stop`：發 SIGTERM 到 PID，刪 PID 檔
- 測試 polling：無 pending → 不 spawn
- 測試 polling：pending 存在 → advanceToNext → spawnSession 呼叫
- 測試 polling：activeSession 存在 → 不 spawn（並行 = 1）
- 測試 polling：paused → 不 spawn
- 測試連續失敗：3 次失敗 → paused = true + telegram.notify 呼叫
- 測試成功一次：consecutiveFailures reset = 0

---

## 檔案結構

```
新增的檔案：
  plugins/overtone/scripts/heartbeat.js            ← 新增：daemon CLI 入口
  plugins/overtone/scripts/lib/session-spawner.js  ← 新增：claude -p spawn 封裝
  tests/unit/heartbeat.test.js                     ← 新增：daemon 單元測試
  tests/unit/session-spawner.test.js               ← 新增：spawner 單元測試

修改的檔案：
  plugins/overtone/scripts/lib/remote/telegram-adapter.js
    ← 修改：新增 notify(message) 公開方法
  plugins/overtone/scripts/lib/remote/telegram-adapter.js（Should）
    ← 修改：新增 /run 命令處理
  plugins/overtone/scripts/health-check.js（Should）
    ← 修改：新增 heartbeat-daemon 偵測項目
```

---

## 實作注意事項

1. **daemon fork 模式**：`start` 命令 spawn 自身（`bun scripts/heartbeat.js _daemon --project-root <path>`）為 detached 子程序，`child.unref()`，parent exit。子程序執行 polling loop。
2. **stream-json 解析**：stdin buffer 可能有多個 JSON 物件黏在一起，需用換行分割後逐行 `JSON.parse`。
3. **heartbeat-state.json 更新**：每次 polling 結束更新 `lastPollAt`，每次狀態變更更新對應欄位，使用 `atomicWrite`（from `utils.js`）避免並發寫入損壞。
4. **PLUGIN_DIR 自動偵測**：`session-spawner.js` 中 `PLUGIN_DIR` 預設為 `path.resolve(__dirname, '..', '..')`（即 `plugins/overtone`），可被 opts.pluginDir 覆蓋。
5. **`notify` 方法**：TelegramAdapter 加 `async notify(message)` → `if (!this.chatId) return; await this._sendMessage(this.chatId, message)`，不修改 `_sendMessage`。
6. **paths.js 擴充**：新增 `HEARTBEAT_PID_FILE` 和 `HEARTBEAT_STATE_FILE` 常數供 heartbeat.js 和 health-check.js 共用（避免魔術字串）。
