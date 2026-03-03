# Heartbeat Engine — 操作指引

## 概述

Heartbeat Engine 是 Overtone 的跨 session 自主執行能力核心。它以 UNIX daemon 模式運行，持續監聽 execution-queue.json，自動 spawn `claude -p` 子 session 執行佇列中的任務。

---

## CLI 操作

```bash
# 啟動 daemon（在專案目錄執行，自動讀取 process.cwd()）
bun scripts/heartbeat.js start

# 指定專案根目錄
bun scripts/heartbeat.js start --project-root /path/to/project

# 停止 daemon
bun scripts/heartbeat.js stop

# 查看 daemon 狀態
bun scripts/heartbeat.js status
```

---

## session-spawner.js API

```javascript
const { spawnSession, _buildArgs } = require('./lib/session-spawner');

// spawn 一個新的 Claude Code session
// @returns { child: ChildProcess, outcome: Promise<SessionOutcome> }
const { child, outcome } = spawnSession(prompt, opts, _deps);

// opts 欄位：
// - pluginDir: string（預設自動偵測 plugins/overtone）
// - cwd: string（工作目錄）
// - timeout: number（毫秒，預設 3600000 = 60 分鐘）
// - outputFormat: string（預設 stream-json）

// SessionOutcome 型別：
// { status: 'success'|'error'|'timeout'|'crash', sessionId: string|null, errorCode: string|null }

// 等待完成
const result = await outcome;
if (result.status === 'success') {
  // 任務完成
} else {
  // 錯誤：result.errorCode 說明原因
}
```

### _buildArgs 組裝邏輯

```javascript
_buildArgs({ pluginDir, outputFormat })
// 回傳 ['-p', '--plugin-dir', pluginDir, '--output-format', outputFormat]
```

---

## execution-queue.js API（含新增 failCurrent）

```javascript
const eq = require('./lib/execution-queue');

// 讀取佇列
eq.readQueue(projectRoot)           // → object | null
eq.writeQueue(projectRoot, items, source) // 建立/覆寫佇列

// 佇列推進
eq.getNext(projectRoot)             // → { item, index } | null（找下一個 pending）
eq.getCurrent(projectRoot)          // → { item, index } | null（找 in_progress 項目）
eq.advanceToNext(projectRoot)       // → { item, index } | null（pending → in_progress）
eq.completeCurrent(projectRoot)     // → boolean（in_progress → completed）
eq.failCurrent(projectRoot, reason) // → boolean（in_progress → failed）

// item 結構：{ name: string, workflow: string, status: string }
// items 輸入：[{ name, workflow }]
```

---

## heartbeat-state.json 資料模型

儲存位置：`~/.overtone/heartbeat-state.json`（由 `paths.HEARTBEAT_STATE_FILE` 參考）

```json
{
  "pid": 12345,
  "projectRoot": "/path/to/project",
  "activeItem": "feature-name",
  "consecutiveFailures": 0,
  "paused": false,
  "startedAt": "2026-03-04T10:00:00Z",
  "lastPollAt": "2026-03-04T10:01:00Z"
}
```

---

## Headless 環境注意事項

Heartbeat daemon 是在 Claude Code session **外部**執行的獨立程序，因此：

1. **AskUserQuestion 不可用**：daemon 沒有使用者互動能力，所有決策必須自動化
2. **使用 Telegram 通知替代螢幕**：配置 `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` 環境變數接收通知
3. **更保守的錯誤處理**：連續 3 次失敗自動暫停（`paused = true`），需手動 `stop + start` 重啟
4. **timeout 兜底**：每個 session 最長 60 分鐘，超時視為失敗

### 環境變數

```bash
TELEGRAM_BOT_TOKEN=xxx  # Telegram Bot token（可選，缺少時靜默）
TELEGRAM_CHAT_ID=xxx    # 接收通知的 chat ID（可選）
```

---

## Prompt 格式

```
開始執行 {featureName}，workflow: {workflow}
```

由 UserPromptSubmit hook（`pre-prompt.js`）的 `/ot:auto` 自動接管，偵測 featureName 並啟動 workflow。

---

## 安全邊界

| 邊界 | 規則 |
|------|------|
| 最大並行 | 1（任何時刻只有一個 session 執行） |
| 連續失敗閾值 | 3 次（`CONSECUTIVE_FAILURE_THRESHOLD`） |
| 暫停恢復 | 不自動恢復，需手動 `stop + start` |
| Timeout | 60 分鐘（`DEFAULT_TIMEOUT_MS`） |

---

## 狀態機

```
pending → in_progress → completed
                     ↘ failed（heartbeat failCurrent 標記）
```
