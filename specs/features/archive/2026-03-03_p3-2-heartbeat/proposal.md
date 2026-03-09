# Proposal：p3-2-heartbeat

## 功能名稱

`p3-2-heartbeat`（P3.2 心跳引擎 — Heartbeat Daemon + 跨 Session 自主執行）

## 需求背景（Why）

- **問題**：Overtone 目前是「用戶驅動」模式 — 用戶送 prompt → Claude Code 執行 → 停止等待。用戶離開電腦後系統完全停滯，佇列中的待執行任務無人推進，閒置時間無法利用。
- **目標**：建立 Heartbeat Daemon（Bun 常駐程序），透過 `claude -p --plugin-dir` spawn 獨立 Claude Code session，讓 execution-queue.json 的 pending 項目在無人在場時自動執行，實現跨 session 閉環自主控制。
- **優先級**：P3.2 是 Phase 3 的核心功能，PoC 已驗證可行（`claude -p --plugin-dir` 可完整載入 22 skills + 17 agents），是 Level 3 自我進化的關鍵前置件。

## 使用者故事

```
身為 Overtone 使用者
我想要佇列中的任務在我不在時自動執行
以便我隔天回來看到任務已完成，不需守候
```

```
身為 Overtone 使用者
我想要透過 Telegram /run 遠端提交新任務
以便我出門後仍可指派工作給本地 Agent
```

```
身為 Overtone 系統
我想要在連續失敗時自動暫停並通知
以便不在場的使用者能收到警示，防止無謂消耗
```

## 範圍邊界

### 在範圍內（In Scope）— Must

- `scripts/heartbeat.js`：Bun 常駐 daemon（start/stop/status CLI 介面）
- 佇列監聽：polling execution-queue.json（每 N 秒）偵測 pending 項目
- Session spawn：`claude -p "prompt" --plugin-dir <path> --output-format stream-json`
- 安全邊界：最大並行 session = 1、連續失敗 N 次後自動暫停
- PID 檔管理：`~/.overtone/heartbeat.pid`，支援 stop 命令
- Telegram 通知：spawn 開始 / 完成 / 失敗 / 暫停事件（複用現有 TelegramAdapter）
- daemon 啟動/停止：`bun scripts/heartbeat.js start|stop|status`

### 在範圍內（In Scope）— Should

- Telegram `/run <featureName> <workflow>` 命令：遠端觸發新任務寫入佇列並 spawn
- `claude --resume {sessionId}` session 接力（跨 session context 保留）
- daemon 健康檢查：納入 health-check.js（第 8 項：heartbeat PID 存在 + process 活躍）
- 崩潰自動恢復：launchd plist 生成或 Bun process manager 機制

### 不在範圍內（Out of Scope）

- cron 排程觸發（Could，下版）
- 多 session 並行調度（Could，下版）
- Dashboard heartbeat 狀態面板（Could，下版）
- Agent SDK 整合（Won't，本版）
- keyboard/mouse/AppleScript 操控（Won't，屬 P3.3+）

## 子任務清單

### Must（核心，優先執行）

1. **建立 `scripts/heartbeat.js` — daemon 核心**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/heartbeat.js`
   - 說明：CLI 入口（start/stop/status subcommand）+ PID 檔管理（`~/.overtone/heartbeat.pid`）+ polling loop（`setInterval` 每 10 秒讀 execution-queue.json）。start 時先檢查 PID 檔防重複啟動，stop 時 `process.kill(pid, 'SIGTERM')`，status 輸出 PID + 執行狀態。
   - 模式參考：`scripts/lib/sound.js`（spawn + detach + unref）

2. **建立 `scripts/lib/session-spawner.js` — session spawn 封裝**（可與子任務 1 並行）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/session-spawner.js`
   - 說明：組裝 `claude -p "<prompt>" --plugin-dir <PLUGIN_DIR> --output-format stream-json` 完整指令，用 `child_process.spawn` 執行（非阻塞），監聽 stdout 的 stream-json 事件萃取 session_id，支援 `--resume {sessionId}` 選項。回傳 `{ pid, sessionId: Promise<string> }`。
   - `_deps` 注入：`{ spawn }` 支援測試 mock

3. **實作佇列監聽與 spawn 排程**（依賴子任務 1 + 2）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/heartbeat.js`（擴充）、`plugins/overtone/scripts/lib/execution-queue.js`（複用）
   - 說明：polling loop 內呼叫 `executionQueue.getCurrent()` 確認無 in_progress 後，再呼叫 `executionQueue.advanceToNext()` 取得下一項，組裝 prompt（`featureName workflow:standard`），呼叫 session-spawner.js spawn。完成偵測：監聽 stream-json 的 `result` 事件（`subtype: "success"`）後呼叫 `completeCurrent()`。

4. **實作安全邊界**（依賴子任務 3）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/heartbeat.js`（擴充）
   - 說明：daemon 狀態物件 `{ activeSession: null, consecutiveFailures: 0, paused: false }`。`activeSession !== null` 時跳過 polling（最大並行 = 1）。spawn 失敗或 session 異常退出時 `consecutiveFailures++`；≥ 3 次時設 `paused = true` 並發 Telegram 通知。手動 stop 後或成功一次時 reset。

5. **Telegram 通知整合**（依賴子任務 4）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/heartbeat.js`（擴充）、`plugins/overtone/scripts/lib/remote/telegram-adapter.js`（複用）
   - 說明：heartbeat.js 直接呼叫 TelegramAdapter 的 `_sendMessage`（或新增 `notify` 公開方法）。事件點：spawn 開始、spawn 完成（帶結果）、連續失敗暫停、daemon 啟動/停止。Token 從環境變數讀取（`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`），缺少時靜默跳過。

6. **撰寫單元測試**（依賴子任務 1-5）
   - 負責 agent：tester
   - 相關檔案：`tests/unit/heartbeat.test.js`、`tests/unit/session-spawner.test.js`
   - 說明：`_deps` 注入 mock `spawn`、`executionQueue`、`TelegramAdapter`。測試：(1) start/stop/status CLI 行為；(2) polling 偵測 pending → advanceToNext → spawn 呼叫；(3) 最大並行 = 1（activeSession 存在時不 spawn）；(4) 連續失敗 3 次 → paused；(5) session-spawner 參數組裝正確性；(6) stream-json sessionId 萃取。

### Should（核心完成後）

7. **Telegram `/run` 命令**（依賴子任務 5，可並行子任務 6）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/remote/telegram-adapter.js`（擴充）、`plugins/overtone/scripts/lib/execution-queue.js`（複用）
   - 說明：在 `_handleUpdate()` 加入 `/run <featureName> [workflow]` 分支，解析後呼叫 `executionQueue.writeQueue()` 寫入（workflow 預設 `standard`），回覆確認訊息。heartbeat daemon 的 polling 自動偵測並 spawn。需在 `_handleHelp()` 更新說明。

8. **daemon 健康檢查**（可並行子任務 6）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/health-check.js`（擴充）
   - 說明：新增第 8 項偵測 `heartbeat-daemon`：讀取 `~/.overtone/heartbeat.pid`，用 `process.kill(pid, 0)` 驗證 process 存活（不存在視為 info，非 error）。納入 `runAllChecks()` 陣列，補充測試。

## 優先順序

```
並行組 A（先行）：
  子任務 1（heartbeat.js daemon 骨架）
  子任務 2（session-spawner.js）

依賴 A 完成後：
  子任務 3（佇列監聽 + spawn 排程）

依賴 3 完成後：
  子任務 4（安全邊界）

依賴 4 完成後：
  子任務 5（Telegram 通知）

並行組 B（依賴 5）：
  子任務 6（單元測試）
  子任務 7（Telegram /run 命令，Should）
  子任務 8（health-check 擴充，Should）
```

## 關鍵技術決策（待 architect 確認）

- **polling vs fswatch**：execution-queue.json 更新頻率低（人工 / Telegram 觸發），polling 10 秒間隔足夠，避免 fswatch 的跨平台複雜性。
- **session 完成偵測**：stream-json `{"type":"result","subtype":"success"}` 事件 vs 佇列 status 輪詢。前者即時但需解析，後者簡單但有延遲。
- **PID 檔 vs launchd**：MVP 用 PID 檔，Should 版本才加 launchd plist 生成。
- **TelegramAdapter 耦合**：heartbeat.js 直接實例化 TelegramAdapter，或透過 EventBus？直接實例化較簡單，但與現有 Server（server.js）的 EventBus 分離。

## 開放問題

1. **session 完成偵測策略**：stream-json `subtype:success` 是否可靠？若 Claude Code crash 沒有 success 事件，heartbeat 如何偵測到 session 結束？（是否需要 timeout 兜底）
2. **prompt 格式**：spawn 時傳給 claude -p 的 prompt 內容格式？需要 Overtone Workflow Context 注入嗎？或只需 `開始執行 {featureName}（{workflow}）` 即可讓 UserPromptSubmit hook 和 /auto 接管？
3. **projectRoot 傳遞**：heartbeat.js 如何知道 projectRoot？execution-queue.json 路徑需要 projectHash，而 heartbeat 是獨立程序，無法從 Claude Code 的 `input.cwd` 取得。建議：daemon 啟動時接受 `--project-root <path>` 參數，或讀取 config.json。
4. **Telegram 通知方式**：直接在 heartbeat.js 實例化 TelegramAdapter（簡單），還是透過 server.js 的 EventBus 轉發（一致性）？前者 heartbeat 可獨立運行，後者需要 server.js 同時啟動。
5. **`--resume` 使用時機**：在哪個條件下使用 `--resume {sessionId}`？每次都 resume 同一個 session，還是每個佇列項目用全新 session？新 session 確保隔離，resume 保留 context。
