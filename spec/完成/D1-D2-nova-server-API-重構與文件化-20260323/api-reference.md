# Nova Server API 參考

> nova-server 運行在 `http://127.0.0.1:3457`，是 Nova 系統的唯一常駐服務。

## 認證

| 來源 | 認證方式 |
|------|---------|
| 本機（127.0.0.1 / ::1） | 免認證 |
| 遠端（LAN / WAN） | `Authorization: Bearer {apiToken}` |

apiToken 設定在 `~/.claude/scripts/flow/config.js`。

## 共用錯誤回應

| HTTP 狀態碼 | 說明 | 回應 body |
|:----------:|------|----------|
| 400 | 缺少必填欄位 | `{ "error": "具體錯誤訊息" }` |
| 401 | 未授權（非本機 + 無/錯 token） | `{ "error": "unauthorized" }` |
| 404 | 端點不存在 | `Not Found`（純文字） |
| 429 | 請求過於頻繁（debounce） | `{ "ok": false, "error": "debounce: 請等 5 秒後再試" }` |
| 500 | 伺服器內部錯誤 | `{ "error": "錯誤訊息" }` |

---

## Internal（hook 系統專用）

> 這些端點僅供 hook-client.js 內部呼叫，不應被外部消費者使用。

### POST /dispatch

Hook 事件分發。所有 Claude session hook 事件經此端點路由到對應 handler。

**Request**

```json
{
  "eventType": "PreToolUse",
  "matcher": "Bash|Write",
  "input": {
    "tool_name": "Bash",
    "tool_input": { "command": "ls" },
    "cwd": "/Users/sbu/projects/overtone"
  }
}
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|:----:|------|
| eventType | string | 是 | SessionStart, SessionEnd, UserPromptSubmit, PreToolUse, PostToolUse, Stop, SubagentStop |
| matcher | string | 否 | 工具名稱（`|` 分隔多個），如 `Bash|Write` |
| input | object | 否 | hook 事件的原始 input |

**Response**

```json
{
  "decision": "allow",
  "reason": null,
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "注入的上下文文字..."
  }
}
```

| 欄位 | 型別 | 說明 |
|------|------|------|
| decision | "allow" \| "block" | guard 判定結果 |
| reason | string \| null | block 時的原因 |
| hookSpecificOutput | object \| undefined | 包含 additionalContext 注入內容 |

```bash
curl -X POST http://127.0.0.1:3457/dispatch \
  -H 'Content-Type: application/json' \
  -d '{"eventType":"PreToolUse","matcher":"Bash","input":{"tool_name":"Bash","tool_input":{"command":"ls"}}}'
```

**消費者**：hook-client.js

---

### POST /agent/status

背景 agent 狀態回報（maintainer, learner, judge 等）。

**Request**

```json
{
  "name": "maintainer",
  "status": "running",
  "detail": "Phase B: commit message"
}
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|:----:|------|
| name | string | 是 | agent 名稱 |
| status | string | 是 | "running" \| "done" \| 自訂狀態 |
| detail | string | 否 | 狀態詳情 |

**Response**

```json
{ "ok": true, "activeAgents": 2 }
```

```bash
curl -X POST http://127.0.0.1:3457/agent/status \
  -H 'Content-Type: application/json' \
  -d '{"name":"maintainer","status":"running","detail":"Phase B"}'
```

**消費者**：wrapup.js, maintainer.js

---

### POST /modules/reload

手動觸發 hook 模組熱重載。

**Request**：無 body。

**Response**

```json
{ "status": "reloaded", "modules": 8 }
```

```bash
curl -X POST http://127.0.0.1:3457/modules/reload
```

**消費者**：開發者手動操作

---

## Infrastructure（基礎設施）

> 健康檢查、SSE、進程管理等。Dashboard 和 Control App 皆使用。

### GET /health

系統健康檢查 + 全域狀態快照。

**Response**

```json
{
  "status": "ok",
  "pid": 12345,
  "title": "nova-server",
  "uptime": 3600.5,
  "modules": 8,
  "moduleList": ["guards.js", "flow-observer.js", "context-injector.js", "heartbeat.js"],
  "connections": 2,
  "memory": { "rss": 45, "heap": 22, "heapTotal": 32, "external": 1 },
  "metrics": {
    "sessions": { "active": 1, "total": 5 },
    "hooks": { "total": 120, "blocked": 3 }
  },
  "anomalies": [],
  "heartbeat": {
    "running": true,
    "mode": "production",
    "interval": 1800000,
    "lastPoll": "2026-03-23T10:00:00.000Z",
    "executing": false,
    "stats": { "sessions": 10, "succeeded": 9, "failed": 1 }
  },
  "activeAgents": {
    "maintainer": { "status": "running", "detail": "Phase A", "startedAt": 1711180800000, "updatedAt": 1711180820000 }
  }
}
```

| 欄位 | 型別 | 說明 |
|------|------|------|
| status | "ok" | 固定值 |
| pid | number | 進程 PID |
| title | "nova-server" | 進程標題（用於身份驗證） |
| uptime | number | 執行秒數 |
| modules | number | 已載入的 handler key 數 |
| moduleList | string[] | 已載入的模組檔案名稱 |
| connections | number | 活躍 SSE 連線數 |
| memory | object | RSS/Heap/HeapTotal/External（MB） |
| metrics | object | 累計指標快照 |
| anomalies | array | 偵測到的異常 |
| heartbeat | object | 全自動引擎狀態 |
| activeAgents | object | 活躍背景 agent |
| warning | string? | RSS > 200MB 時出現 |

```bash
curl http://127.0.0.1:3457/health
```

**消費者**：Dashboard, Control App (macOS), Control App (iOS), hook-client.js

---

### GET /events

Server-Sent Events (SSE) 即時事件流。連線後先回放最近 20 筆事件（帶 `_replay: true`），之後即時推送。

**Response**：`text/event-stream`

```
data: {"type":"hook_trigger","event_type":"PreToolUse","matcher":"Bash","decision":"allow","handler_count":2,"meta":"PreToolUse:Bash → allow (2)","cwd":"/Users/sbu/projects/overtone"}

data: {"type":"session_start","cwd":"/Users/sbu/projects/overtone","meta":"Session started"}
```

每 15 秒發送 heartbeat comment（`: heartbeat\n\n`）。

**事件類型**

| type | 觸發時機 |
|------|---------|
| hook_trigger | 每次 /dispatch 呼叫 |
| session_start | SessionStart hook |
| session_end | SessionEnd hook |
| agent_status | /agent/status 回報 |
| heartbeat_poll | 全自動引擎輪詢 |
| heartbeat_spawn | 全自動引擎啟動 session |
| idle_detected | 閒置偵測 |

```bash
curl -N http://127.0.0.1:3457/events
```

**消費者**：Dashboard, Control App (macOS SSEClient), Control App (iOS SSEClient)

---

### GET /processes

進程狀態（目前僅 heartbeat）。

**Response**

```json
{
  "heartbeat": {
    "pid": 12345,
    "running": true,
    "mode": "production",
    "interval": 1800000,
    "lastPoll": null,
    "executing": false,
    "stats": { "sessions": 0, "succeeded": 0, "failed": 0 }
  }
}
```

```bash
curl http://127.0.0.1:3457/processes
```

**消費者**：Dashboard

---

### POST /processes/:name/start

啟動指定進程。目前僅支援 `heartbeat`。

**URL 參數**：`:name` = 進程名稱（heartbeat）

**Request**：無 body。

**Response**

```json
{ "ok": true, "pid": 12345 }
```

| 錯誤 | 狀態碼 | 回應 |
|------|:------:|------|
| 不支援的進程名稱 | 400 | `{ "ok": false, "error": "unknown process: xxx" }` |
| 啟動失敗 | 500 | `{ "ok": false, "error": "錯誤訊息" }` |

```bash
curl -X POST http://127.0.0.1:3457/processes/heartbeat/start
```

**消費者**：Dashboard

---

### POST /processes/:name/stop

停止指定進程。

**URL 參數**：`:name` = 進程名稱（heartbeat）

**Request**：無 body。

**Response**

```json
{ "ok": true }
```

```bash
curl -X POST http://127.0.0.1:3457/processes/heartbeat/stop
```

**消費者**：Dashboard

---

### GET /

Dashboard HTML 頁面（Flow Visualizer）。

**Response**：`text/html`

```bash
curl http://127.0.0.1:3457/
# 或瀏覽器開啟 http://localhost:3457
```

**消費者**：瀏覽器

---

### GET /flow/:file

Dashboard 靜態資源。白名單：client.css, main.js, graph.js, metro.js, events.js, system.js, logs.js, starfield.js, quality.js, monitor.js, utils.js

**Response**：`text/css` 或 `application/javascript`

```bash
curl http://127.0.0.1:3457/flow/main.js
```

**消費者**：Dashboard HTML

---

## Public API — 讀取（GET）

> 所有 `/api/*` 端點。非本機存取需 Bearer token。

### GET /api/config

Server 設定。

**Response**

```json
{
  "port": 3457,
  "apiToken": null,
  "eventsDir": "/Users/sbu/.claude/data/events"
}
```

```bash
curl http://127.0.0.1:3457/api/config
```

**消費者**：Dashboard

---

### GET /api/graph

Flow 視覺化圖資料。

**Response**

```json
{
  "nodes": [
    { "id": "guards.js", "type": "module", "label": "guards" }
  ],
  "edges": [
    { "from": "PreToolUse:Bash", "to": "guards.js" }
  ]
}
```

```bash
curl http://127.0.0.1:3457/api/graph
```

**消費者**：Dashboard (graph.js)

---

### GET /api/sessions

Session 列表（從 timeline events 建立索引）。

**Response**

```json
[
  {
    "id": 1711180800000,
    "cwd": "/Users/sbu/projects/overtone",
    "startTs": 1711180800000,
    "endTs": 1711184400000,
    "eventCount": 42
  }
]
```

```bash
curl http://127.0.0.1:3457/api/sessions
```

**消費者**：Dashboard (metro.js)

---

### GET /api/sessions/:id/events

指定 session 的事件列表。

**URL 參數**：`:id` = session ID（timestamp）

**Response**

```json
[
  {
    "type": "hook_trigger",
    "event_type": "PreToolUse",
    "matcher": "Bash",
    "decision": "allow",
    "ts": "2026-03-23T10:00:00.000Z"
  }
]
```

```bash
curl http://127.0.0.1:3457/api/sessions/1711180800000/events
```

**消費者**：Dashboard (metro.js)

---

### GET /api/sessions-summary

Session 摘要列表（從 session-summaries.jsonl 讀取，由 SessionEnd 背景任務產出）。

> 注意：與 /api/sessions 資料來源不同。/api/sessions 從 timeline events 建索引，/api/sessions-summary 從 JSONL 摘要檔讀取。

**Response**

```json
[
  {
    "ts": "2026-03-23T10:00:00.000Z",
    "project": "overtone",
    "summary": "修復 guard 邏輯",
    "filesChanged": 3,
    "testsRun": true
  }
]
```

```bash
curl http://127.0.0.1:3457/api/sessions-summary
```

**消費者**：Dashboard (logs.js, system.js, monitor.js)

---

### GET /api/sessions/transcript

Session 對話流（解析 transcript JSONL）。

**Query 參數**

| 參數 | 型別 | 必填 | 說明 |
|------|------|:----:|------|
| project | string | 是 | 專案名稱（如 "overtone"） |
| limit | number | 否 | 訊息數上限，預設 50 |

**Response**

```json
{
  "messages": [
    { "role": "user", "type": "text", "text": "修復這個 bug" },
    { "role": "assistant", "type": "text", "text": "讓我看看..." },
    { "role": "assistant", "type": "tool_use", "tool": "Bash", "desc": "bun test" }
  ]
}
```

| 欄位 | 型別 | 說明 |
|------|------|------|
| role | "user" \| "assistant" | 發言者 |
| type | "text" \| "tool_use" | 訊息類型 |
| text | string? | 文字內容（text 時） |
| tool | string? | 工具名稱（tool_use 時） |
| desc | string? | 工具操作摘要（tool_use 時） |

```bash
curl "http://127.0.0.1:3457/api/sessions/transcript?project=overtone&limit=20"
```

**消費者**：Control App (iOS SessionDetailView)

---

### GET /api/sessions/preview

每個專案最後一條 user/assistant 訊息預覽。

**Response**

```json
{
  "overtone": {
    "lastUser": "修復 guard 邏輯",
    "lastAssistant": "已修復並通過測試",
    "ts": 1711180800
  },
  "nova-control": {
    "lastUser": "加入 LLM 開關",
    "lastAssistant": null,
    "ts": 1711170000
  }
}
```

```bash
curl http://127.0.0.1:3457/api/sessions/preview
```

**消費者**：Control App (iOS SessionListView)

---

### GET /api/hook-errors

最近 10 筆 hook 錯誤記錄。

**Response**

```json
[
  {
    "ts": "2026-03-23T10:00:00.000Z",
    "event": "PreToolUse:Bash",
    "error": "timeout",
    "phase": "dispatch"
  }
]
```

```bash
curl http://127.0.0.1:3457/api/hook-errors
```

**消費者**：Dashboard (quality.js, system.js, monitor.js)

---

### GET /api/daily-logs

每日全自動日誌。

**Response**

```json
[
  {
    "date": "2026-03-23",
    "sessions": 5,
    "highlights": ["修復 guard 邏輯", "更新 API 文件"],
    "issues": []
  }
]
```

```bash
curl http://127.0.0.1:3457/api/daily-logs
```

**消費者**：Dashboard (logs.js)

---

### GET /api/scores

品質評分記錄（最近 500 筆）。

**Response**

```json
[
  {
    "ts": "2026-03-23T10:00:00.000Z",
    "target": "skills/architecture/SKILL.md",
    "score": 85,
    "dimensions": { "completeness": 90, "accuracy": 80 }
  }
]
```

```bash
curl http://127.0.0.1:3457/api/scores
```

**消費者**：Dashboard (quality.js, logs.js)

---

### GET /api/behaviors

行為記錄（learner 產出）。

**Response**

```json
[
  {
    "ts": "2026-03-23T10:00:00.000Z",
    "pattern": "skip-test",
    "description": "跳過測試直接提交",
    "severity": "high"
  }
]
```

```bash
curl http://127.0.0.1:3457/api/behaviors
```

**消費者**：Dashboard (logs.js)

---

### GET /api/improvements

改善建議（judge 產出）。

**Response**

```json
[
  {
    "ts": "2026-03-23T10:00:00.000Z",
    "target": "hooks/modules/guards.js",
    "suggestion": "新增 eval 指令阻擋規則",
    "priority": "medium"
  }
]
```

```bash
curl http://127.0.0.1:3457/api/improvements
```

**消費者**：Dashboard (logs.js, quality.js)

---

### GET /api/decisions

決策日誌（最近 100 筆）。

**Response**

```json
[
  {
    "ts": "2026-03-23T10:00:00.000Z",
    "type": "auto",
    "decision": "建立新 skill",
    "reason": "同一 pattern 出現 3 次"
  }
]
```

```bash
curl http://127.0.0.1:3457/api/decisions
```

**消費者**：Dashboard (logs.js)

---

### GET /api/components

元件統計（rules / skills / agents / hooks 數量）。

**Response**

```json
{
  "rules": 15,
  "skills": 12,
  "agents": 8,
  "hooks": 6
}
```

```bash
curl http://127.0.0.1:3457/api/components
```

**消費者**：Dashboard (logs.js, quality.js)

---

### GET /api/git

Git 活動（nova + overtone 最近 10 筆 commit）。

**Response**

```json
{
  "nova": [
    { "hash": "abc1234", "subject": "fix(guards): 修正阻擋邏輯", "date": "2026-03-23 10:00:00 +0800" }
  ],
  "overtone": [
    { "hash": "def5678", "subject": "test: 新增 architecture 測試", "date": "2026-03-23 09:30:00 +0800" }
  ]
}
```

```bash
curl http://127.0.0.1:3457/api/git
```

**消費者**：Dashboard (logs.js, monitor.js)

---

### GET /api/locks

Lockfile 狀態。

**Response**

```json
[
  { "path": "/tmp/nova-server.lock", "exists": true, "pid": 12345, "age": 3600 },
  { "path": "/tmp/maintainer.lock", "exists": false },
  { "path": "/tmp/learner.lock", "exists": false },
  { "path": "/tmp/judge.lock", "exists": false }
]
```

| 欄位 | 型別 | 說明 |
|------|------|------|
| path | string | lockfile 路徑 |
| exists | boolean | 是否存在 |
| pid | number? | lockfile 內的 PID |
| age | number? | 存在秒數 |

```bash
curl http://127.0.0.1:3457/api/locks
```

**消費者**：Dashboard (logs.js, system.js)

---

### GET /api/daemons

Daemon 日誌（最近 20 行）。

**Response**

```json
{
  "maintainer": ["[2026-03-23] Phase A started", "..."],
  "judge": ["..."],
  "learner": ["..."]
}
```

```bash
curl http://127.0.0.1:3457/api/daemons
```

**消費者**：Dashboard (logs.js, system.js)

---

### GET /api/usage

API 用量 + 活躍 session 偵測。

**Response**

```json
{
  "fiveHour": 0.35,
  "sevenDay": 0.12,
  "sessions": {
    "overtone": { "context": 0.45, "ts": 1711180800, "active": true },
    "nova-control": { "context": 0, "ts": 1711170000, "active": false }
  }
}
```

| 欄位 | 型別 | 說明 |
|------|------|------|
| fiveHour | number \| null | 5 小時用量百分比（0-1） |
| sevenDay | number \| null | 7 天用量百分比（0-1） |
| sessions | object | 各專案 session 狀態 |
| sessions[name].context | number | context window 使用百分比 |
| sessions[name].ts | number | 最後活動 Unix timestamp |
| sessions[name].active | boolean | 是否有活躍 claude 進程 |

```bash
curl http://127.0.0.1:3457/api/usage
```

**消費者**：Control App (macOS UsageSection), Control App (iOS)

---

### GET /api/llm

本地 LLM 健康狀態。

**Response**

```json
{ "status": "online", "model": "Qwen3-8B-4bit", "created": 1711180800 }
```

離線時：

```json
{ "status": "offline" }
```

```bash
curl http://127.0.0.1:3457/api/llm
```

**消費者**：Dashboard (system.js, logs.js), Control App (macOS ControlSection), Control App (iOS)

---

### GET /api/system

系統資源 + 進程資訊。

**Response**

```json
{
  "memory": { "rss": 45, "heap": 22, "heapTotal": 32 },
  "orphanBunProcesses": [
    { "pid": "1234", "cpu": "0.5", "mem": "1.2", "cmd": "bun some-script.js" }
  ],
  "novaProcesses": [
    { "pid": "5678", "cpu": "0.1", "mem": "0.8", "cmd": "nova-server server.js" }
  ]
}
```

```bash
curl http://127.0.0.1:3457/api/system
```

**消費者**：Dashboard (system.js)

---

### GET /api/tasks-todo

本地待做任務數（10 秒快取）。

**Response**

```json
{ "count": 3, "top": "D1-修復-fork-spawn-bug" }
```

```bash
curl http://127.0.0.1:3457/api/tasks-todo
```

**消費者**：Dashboard (system.js)

---

### GET /api/projects

專案列表。

**Response**

```json
{
  "projects": [
    { "name": "overtone", "cwd": "/Users/sbu/projects/overtone", "pinned": true, "lastActiveAt": 1711180800000 },
    { "name": "nova-control", "cwd": "/Users/sbu/projects/nova-control", "pinned": false, "lastActiveAt": 1711170000000 }
  ]
}
```

```bash
curl http://127.0.0.1:3457/api/projects
```

**消費者**：Control App (macOS), Control App (iOS)

---

### GET /api/tasks

多專案待做任務列表。排序：釘選在前，未釘選按 lastActiveAt 降序。

**Response**

```json
{
  "projects": [
    {
      "name": "overtone",
      "cwd": "/Users/sbu/projects/overtone",
      "pinned": true,
      "lastActiveAt": 1711180800000,
      "tasks": [
        {
          "name": "D2-nova-server-API-重構與文件化",
          "type": "change",
          "depth": "D2",
          "priority": null,
          "description": "盤點 40+ API 端點...",
          "created": "2026-03-23"
        }
      ]
    }
  ]
}
```

```bash
curl http://127.0.0.1:3457/api/tasks
```

**消費者**：Control App (macOS TaskSection), Control App (iOS SessionListView)

---

## Public API — 寫入（POST / PATCH / DELETE）

### POST /api/projects

新增專案。

**Request**

```json
{ "name": "my-project", "cwd": "/Users/sbu/projects/my-project" }
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|:----:|------|
| name | string | 是 | 專案名稱 |
| cwd | string | 是 | 專案絕對路徑（必須存在） |

**Response**

```json
{ "ok": true, "projects": [...] }
```

| 錯誤 | 狀態碼 | 回應 |
|------|:------:|------|
| 缺必填欄位 | 400 | `{ "ok": false, "error": "name 和 cwd 為必填" }` |
| 路徑不存在 | 400 | `{ "ok": false, "error": "路徑不存在: /..." }` |
| 已存在 | 400 | `{ "ok": false, "error": "已存在" }` |

```bash
curl -X POST http://127.0.0.1:3457/api/projects \
  -H 'Content-Type: application/json' \
  -d '{"name":"my-project","cwd":"/Users/sbu/projects/my-project"}'
```

**消費者**：Control App (macOS), Control App (iOS)

---

### PATCH /api/projects

釘選或取消釘選專案。

**Request**

```json
{ "name": "overtone", "pinned": true }
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|:----:|------|
| name | string | 是 | 專案名稱 |
| pinned | boolean | 是 | 是否釘選 |

**Response**

```json
{ "ok": true, "projects": [...] }
```

```bash
curl -X PATCH http://127.0.0.1:3457/api/projects \
  -H 'Content-Type: application/json' \
  -d '{"name":"overtone","pinned":true}'
```

**消費者**：Control App (macOS)

---

### DELETE /api/projects

移除專案。

**Request**

```json
{ "name": "my-project" }
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|:----:|------|
| name | string | 是 | 專案名稱 |

**Response**

```json
{ "ok": true, "projects": [...] }
```

```bash
curl -X DELETE http://127.0.0.1:3457/api/projects \
  -H 'Content-Type: application/json' \
  -d '{"name":"my-project"}'
```

**消費者**：Control App (macOS)

---

### POST /api/tasks/delete

刪除任務（移到 spec/完成/ 並標記放棄）。

**Request**

```json
{ "cwd": "/Users/sbu/projects/overtone", "taskName": "D1-修復-bug" }
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|:----:|------|
| cwd | string | 是 | 專案路徑 |
| taskName | string | 是 | 任務名稱 |

**Response**

```json
{ "ok": true }
```

```bash
curl -X POST http://127.0.0.1:3457/api/tasks/delete \
  -H 'Content-Type: application/json' \
  -d '{"cwd":"/Users/sbu/projects/overtone","taskName":"D1-修復-bug"}'
```

**消費者**：Control App (macOS TaskSection)

---

### POST /api/spawn

觸發新 Claude session（5 秒 debounce）。

**Request**

```json
{
  "cwd": "/Users/sbu/projects/overtone",
  "prompt": "執行任務：D2-nova-server-API-重構"
}
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|:----:|------|
| cwd | string | 是 | 專案路徑 |
| prompt | string | 是 | 傳給 `claude -p` 的 prompt |

**Response**

```json
{ "ok": true, "pid": 12345 }
```

| 錯誤 | 狀態碼 | 回應 |
|------|:------:|------|
| debounce 中 | 429 | `{ "ok": false, "error": "debounce: 請等 5 秒後再試" }` |

```bash
curl -X POST http://127.0.0.1:3457/api/spawn \
  -H 'Content-Type: application/json' \
  -d '{"cwd":"/Users/sbu/projects/overtone","prompt":"bun test"}'
```

**消費者**：Control App (macOS), Control App (iOS)

---

### POST /api/terminal/send

送指令到既有 Claude session（透過 iTerm2 AppleScript 匹配 TTY）。

**Request**

```json
{
  "cwd": "/Users/sbu/projects/overtone",
  "command": "/ask 這個 bug 怎麼修？"
}
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|:----:|------|
| cwd | string | 是 | 專案路徑（用於匹配 session） |
| command | string | 是 | 要注入的指令文字 |

**Response**

```json
{ "ok": true, "tty": "ttys003" }
```

| 錯誤 | 狀態碼 | 回應 |
|------|:------:|------|
| 找不到對應 session | 404 | `{ "ok": false, "error": "找不到對應的 Claude session" }` |

```bash
curl -X POST http://127.0.0.1:3457/api/terminal/send \
  -H 'Content-Type: application/json' \
  -d '{"cwd":"/Users/sbu/projects/overtone","command":"/ask 進度如何？"}'
```

**消費者**：Control App (macOS), Control App (iOS)

---

### POST /api/terminal/interrupt

中斷既有 Claude session（送 Ctrl+C 到 iTerm2）。

> 待實作 — iOS 客戶端已呼叫但後端尚未實作。

**Request**

```json
{
  "cwd": "/Users/sbu/projects/overtone",
  "command": ""
}
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|:----:|------|
| cwd | string | 是 | 專案路徑 |
| command | string | 否 | 忽略（保持與 terminal/send 相同介面） |

**Response**

```json
{ "ok": true, "tty": "ttys003" }
```

```bash
curl -X POST http://127.0.0.1:3457/api/terminal/interrupt \
  -H 'Content-Type: application/json' \
  -d '{"cwd":"/Users/sbu/projects/overtone","command":""}'
```

**消費者**：Control App (iOS)

---

### POST /api/llm/toggle

啟動或關閉本地 LLM（透過 launchctl 管理 vllm-mlx LaunchAgent）。

**Request**

```json
{ "enabled": true }
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|:----:|------|
| enabled | boolean | 是 | true = 啟動, false = 關閉 |

**Response**

```json
{ "ok": true, "status": "start" }
```

```bash
curl -X POST http://127.0.0.1:3457/api/llm/toggle \
  -H 'Content-Type: application/json' \
  -d '{"enabled":true}'
```

**消費者**：Control App (macOS ControlSection), Control App (iOS)

---

### POST /api/heartbeat/toggle

啟動或停止全自動引擎（heartbeat）。

> 待實作 — iOS 客戶端已呼叫但後端尚未實作。

**Request**

```json
{ "cwd": "/Users/sbu/projects/overtone", "prompt": "start" }
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|:----:|------|
| cwd | string | 是 | 忽略（保持介面一致） |
| prompt | string | 是 | "start" = 啟動, "stop" = 停止 |

**Response**

```json
{ "ok": true }
```

```bash
curl -X POST http://127.0.0.1:3457/api/heartbeat/toggle \
  -H 'Content-Type: application/json' \
  -d '{"cwd":"/tmp","prompt":"start"}'
```

**消費者**：Control App (iOS)

---

### POST /api/actions/clear-locks

清除過期 lockfile（存在超過 300 秒的 maintainer/learner/judge lock）。

**Request**：無 body。

**Response**

```json
{ "cleared": ["/tmp/maintainer.lock"] }
```

```bash
curl -X POST http://127.0.0.1:3457/api/actions/clear-locks
```

**消費者**：Dashboard (system.js)

---

### POST /api/actions/trigger-maintainer

手動觸發 maintainer 背景任務。

**Request**：無 body。

**Response**

```json
{ "triggered": true }
```

```bash
curl -X POST http://127.0.0.1:3457/api/actions/trigger-maintainer
```

**消費者**：Dashboard (system.js)

---

## 端點總覽

| # | Method | Path | 分類 | 消費者 |
|---|--------|------|------|--------|
| 1 | POST | /dispatch | Internal | hook-client |
| 2 | POST | /agent/status | Internal | wrapup, maintainer |
| 3 | POST | /modules/reload | Internal | 開發者 |
| 4 | GET | /health | Infra | All |
| 5 | GET | /events | Infra | Dashboard, Control App |
| 6 | GET | /processes | Infra | Dashboard |
| 7 | POST | /processes/:name/start | Infra | Dashboard |
| 8 | POST | /processes/:name/stop | Infra | Dashboard |
| 9 | GET | / | Static | 瀏覽器 |
| 10 | GET | /flow/:file | Static | Dashboard HTML |
| 11 | GET | /api/config | Public-R | Dashboard |
| 12 | GET | /api/graph | Public-R | Dashboard |
| 13 | GET | /api/sessions | Public-R | Dashboard |
| 14 | GET | /api/sessions/:id/events | Public-R | Dashboard |
| 15 | GET | /api/sessions-summary | Public-R | Dashboard |
| 16 | GET | /api/sessions/transcript | Public-R | iOS |
| 17 | GET | /api/sessions/preview | Public-R | iOS |
| 18 | GET | /api/hook-errors | Public-R | Dashboard |
| 19 | GET | /api/daily-logs | Public-R | Dashboard |
| 20 | GET | /api/scores | Public-R | Dashboard |
| 21 | GET | /api/behaviors | Public-R | Dashboard |
| 22 | GET | /api/improvements | Public-R | Dashboard |
| 23 | GET | /api/decisions | Public-R | Dashboard |
| 24 | GET | /api/components | Public-R | Dashboard |
| 25 | GET | /api/git | Public-R | Dashboard |
| 26 | GET | /api/locks | Public-R | Dashboard |
| 27 | GET | /api/daemons | Public-R | Dashboard |
| 28 | GET | /api/usage | Public-R | Control App |
| 29 | GET | /api/llm | Public-R | Dashboard, Control App |
| 30 | GET | /api/system | Public-R | Dashboard |
| 31 | GET | /api/tasks-todo | Public-R | Dashboard |
| 32 | GET | /api/projects | Public-R | Control App |
| 33 | GET | /api/tasks | Public-R | Control App |
| 34 | POST | /api/projects | Public-W | Control App |
| 35 | PATCH | /api/projects | Public-W | Control App |
| 36 | DELETE | /api/projects | Public-W | Control App |
| 37 | POST | /api/tasks/delete | Public-W | Control App |
| 38 | POST | /api/spawn | Public-W | Control App |
| 39 | POST | /api/terminal/send | Public-W | Control App |
| 40 | POST | /api/terminal/interrupt | Public-W | iOS (待實作) |
| 41 | POST | /api/llm/toggle | Public-W | Control App |
| 42 | POST | /api/heartbeat/toggle | Public-W | iOS (待實作) |
| 43 | POST | /api/actions/clear-locks | Public-W | Dashboard |
| 44 | POST | /api/actions/trigger-maintainer | Public-W | Dashboard |
