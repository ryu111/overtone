# 心跳引擎（R3.1 — L3 感知操控）

## 動機（Why）

- **問題**：Nova 目前只能在使用者主動開 session 時運作。Notion 待做佇列中的任務需要人工逐一 claim → 開 session → 執行。缺乏「跨 session 自主執行」能力
- **目標**：常駐 daemon 輪詢 Notion → 發現待做任務 → 自動 spawn `claude -p` session → 自主執行 → 標記完成
- **不做的代價**：L3「感知操控」第一步無法達成，系統永遠需要人類手動觸發，無法真正自主

## 範圍

### In-scope

- heartbeat.js daemon：start/stop/status CLI + PID 管理 + polling loop
- session-spawner.js：spawn `claude -p` + stream-json 解析 + timeout + 安全防護
- Notion 輪詢整合：讀 Notion「待做」→ claim → spawn → complete
- binary copy 命名：`~/.claude/bin/nova-heartbeat`
- 防重複啟動（lockfile + PID 驗證）
- 連續失敗暫停（3 次後暫停）
- macOS 通知（啟動 / 完成 / 失敗）

### Out-of-scope

- 多任務並行（v1 一次只跑一個 session）
- Telegram 通知（延後，用 macOS 原生通知）
- 佇列優先序排程（v1 按 Notion 排序，先進先出）
- GUI 控制面板
- 自動恢復（暫停後需人工 restart）

## 使用者故事

身為 Nova 系統，我想要在 Notion 有待做任務時自動 spawn session 執行，以便實現無人值守的自主運作。

身為開發者，我想要用 `bun heartbeat.js start/stop/status` 控制 daemon，以便隨時啟停自主執行能力。

## 行為規格

### 正常路徑

1. `bun heartbeat.js start` → binary copy 到 `~/.claude/bin/nova-heartbeat` → spawn detached daemon
2. daemon 啟動 → 寫 PID 到 `/tmp/nova-heartbeat.lock` → 回報 nova-server agent/status
3. polling loop 開始（預設 60 秒間隔）
4. 每次 poll：呼叫 `notion-tasks.js list 待做` → 有任務 → `claim` 第一個
5. claim 成功 → spawn `claude -p "{task prompt}"` via session-spawner
6. session 完成 → `notion-tasks.js complete {id} "{結果}"`
7. 回到 step 4
8. `bun heartbeat.js stop` → 讀 PID → `kill -SIGTERM` → 清理 lockfile

### 錯誤路徑

| 錯誤情境 | 預期行為 |
|---------|---------|
| Notion API 不可用 | log error → 等下次 poll，不暫停 |
| session spawn 失敗 | log error → consecutiveFailures++ → 3 次暫停 |
| session timeout（60 分鐘） | SIGTERM → 標記任務 failed → consecutiveFailures++ |
| daemon 已在跑 | `start` 拒絕啟動，顯示現有 PID |
| lockfile 殘留但 process 不存在 | 清理 stale lockfile → 正常啟動 |
| nova-heartbeat binary 不存在 | 自動 copy |
| OVERTONE_SPAWNED=1 環境中啟動 | 拒絕啟動（防遞迴） |

### 邊界條件

- 無待做任務 → 靜默等待下次 poll
- Notion 回傳 0 筆 → 繼續 polling
- session 在 claim 後、spawn 前 crash → 任務卡在「進行中」→ 需手動處理
- 連續失敗 3 次 → paused: true → 需手動 `stop + start` 恢復

## 資料模型

### 輸入

| 欄位 | 型別 | 必填 | 說明 |
|------|------|:----:|------|
| --poll-interval | number | 否 | 輪詢間隔（秒），預設 60 |
| --max-session-time | number | 否 | session timeout（分鐘），預設 60 |

### 輸出

| 欄位 | 型別 | 說明 |
|------|------|------|
| pid | number | daemon PID |
| status | string | running / paused / stopped |
| activetask | string / null | 目前執行的任務名稱 |
| consecutiveFailures | number | 連續失敗次數 |

### 儲存

- 狀態檔：`~/.claude/data/heartbeat-state.json`
- Lockfile：`/tmp/nova-heartbeat.lock`
- Log：`/tmp/nova-heartbeat.log`
- Binary：`~/.claude/bin/nova-heartbeat`

```json
{
  "pid": 12345,
  "status": "running",
  "activeTask": null,
  "consecutiveFailures": 0,
  "startedAt": "2026-03-16T10:00:00Z",
  "lastPollAt": "2026-03-16T10:01:00Z",
  "totalTasksCompleted": 0,
  "totalTasksFailed": 0
}
```

## 介面契約

### heartbeat.js CLI

```bash
bun heartbeat.js start [--poll-interval 60] [--max-session-time 60]
bun heartbeat.js stop
bun heartbeat.js status
```

### session-spawner.js

```javascript
export function spawnSession(prompt, opts) → { child, outcome: Promise<SessionOutcome> }
// opts: { timeout, cwd }
// SessionOutcome: { status: 'success'|'error'|'timeout'|'crash', sessionId, errorCode }

export function buildPrompt(task) → string
// 從 Notion 任務物件組裝 claude -p prompt
```

### heartbeat.js（內部 API，export 供測試）

```javascript
export async function poll(config) → { action: 'idle'|'execute'|'paused', task? }
export async function executeTask(task, config) → { status: 'success'|'failed', duration }
export function readState(fileOverride) → HeartbeatState
export function writeState(state, fileOverride) → void
```

## 非功能需求

| 維度 | 要求 |
|------|------|
| 可靠性 | daemon crash 後 lockfile 自動清理（stale PID 偵測） |
| 安全 | OVERTONE_SPAWNED=1 防遞迴 + 敏感 env 過濾 |
| 資源 | daemon idle 時 CPU < 1%、記憶體 < 50MB |
| 延遲 | 從任務出現到 session spawn < 2 分鐘（poll interval + spawn） |

## 依賴

| 方向 | 模組 | 說明 |
|------|------|------|
| 上游 | notion-tasks.js | Notion CRUD（list/claim/complete） |
| 上游 | nova-server（port 3457） | agent/status 回報 |
| 下游 | `claude -p` | session spawn 目標 |
| 下游 | ~/.claude/bin/nova-heartbeat | binary copy 命名 |

## 驗收標準

- [ ] `bun heartbeat.js start` 成功啟動 daemon，PID 寫入 lockfile
- [ ] `bun heartbeat.js status` 顯示 running/paused/stopped
- [ ] `bun heartbeat.js stop` 停止 daemon 並清理 lockfile
- [ ] daemon 成功輪詢 Notion 取得待做任務
- [ ] session-spawner 成功 spawn `claude -p` 並解析結果
- [ ] 任務完成後自動標記為已完成
- [ ] 連續失敗 3 次後暫停
- [ ] OVERTONE_SPAWNED=1 環境下拒絕啟動
- [ ] stale lockfile 自動清理
- [ ] `bun test` 所有 heartbeat 測試通過

## 風險

| 風險 | 機率 | 影響 | 緩解策略 |
|------|:----:|:----:|---------|
| `claude -p` 行為變更（CLI 更新） | 中 | 高 | session-spawner 抽象化，隔離 CLI 細節 |
| Notion API rate limit | 低 | 中 | 60 秒 poll interval + 指數退避 |
| daemon 記憶體洩漏（長時間運行） | 低 | 中 | heartbeat-state.json 追蹤啟動時間，定期自動重啟 |
| 任務卡在「進行中」 | 中 | 中 | status 指令顯示 activeTask + 手動 complete/fail |
