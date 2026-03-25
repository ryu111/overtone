# Nova Server 拆分架構分析

日期：2026-03-25
狀態：討論中（Phase 1，不動手）

## Q1: modules import 方式（已確認）

推薦方案 A：modules 留在 `~/.claude/hooks/modules/`。

server.js 已用絕對路徑 `join(CLAUDE_DIR, 'hooks/modules', file)` import，不依賴相對路徑。
如果拆成獨立專案，nova-server 保持同樣的 `CLAUDE_DIR` 常數（指向 `~/.claude/`），零改動即可 import modules。

## Q2: hook-client fallback 保留與否

**建議：保留。**

### 理由

1. **覆蓋範圍小但關鍵**：fallback 只處理 guards.js 的 3 個函式（evaluateBash / evaluateEdit），對應 PreToolUse:Bash / Write / Edit。這是安全關鍵路徑 — 阻擋危險指令。

2. **server 瞬斷頻率高**：目前 RSS 膨脹導致 OOM restart（每 5-10 分鐘一次）。瞬斷期間（~3 秒）所有 fetch /dispatch 失敗，如果沒有 fallback，guard 完全失效。

3. **成本極低**：fallback 路徑 <15ms（本地 import + evaluate），不需要 HTTP。收益極高（安全兜底）。

### 移除條件

- nova-control 降低 polling 頻率（75 req/s → <5 req/s）
- RSS 穩定在 200MB 以內
- server uptime 穩定 > 1 小時
- 以上三者達成後，可移除 fallback 並觀察 1 週

### 風險

移除 fallback 且 server 瞬斷時，使用者的危險指令（force push、刪除重要檔案等）會被放行，無人攔截。

## Q3: 隱藏依賴清單

### modules 之間

零互相 import（已用 grep 確認所有 `hooks/modules/*.js`）。每個 module 獨立，只依賴 Node.js 內建模組和 `homedir()` 路徑。

### server.js 完整依賴圖

```
server.js
├── hooks/event-bus.js（xstream 事件匯流排）
├── hooks/modules/metrics.js（createMetrics）
├── scripts/flow/config.js（getConfig）
├── scripts/flow/graph-builder.js（buildGraph）
├── scripts/flow/sse.js（SSEPool）
├── scripts/flow/event-writer.js（writeFlowEvent, readRecentEvents）
├── scripts/flow/session-index.js（buildSessionIndex, getSessionEvents）
└── scripts/flow/api-router.js（handleDashboardApi, deliverPendingDispatches, autoCompleteDispatches）
```

### api-router.js 依賴

```
api-router.js
├── scripts/flow/event-writer.js（getEventsFilePath）
├── scripts/lib/decisions.js（getPendingSummary, resolveDecision）
├── scripts/lib/notifications.js（getSettingsForAPI, setGlobalEnabled, toggleType）
├── scripts/lib/branch-scheduler.js（getAllBranchStatus）
├── scripts/lib/apns.js（sendPush — dynamic import）
├── scripts/spec-tasks.js（listTasks — dynamic import）
└── hooks/modules/ 目錄（L398 readdirSync 計數，用於 stats API）
```

### hook-client.js fallback 依賴

```
hook-client.js fallback
├── hooks/modules/guards.js → evaluateBash
├── hooks/modules/guards.js → evaluateEdit
└── hooks/modules/guards.js → evaluateEdit（Write 和 Edit 共用）
```

### 風險點

- `api-router.js` 用 `homedir()` 動態拼路徑，如果未來 nova-server 部署在不同使用者或 remote 機器，路徑會壞
- `event-writer.js` 用 `os.tmpdir()` 存 JSONL，跨機器不共享
- server.js 的 `SESSION_REGISTRY_PATH` 硬編碼 `/tmp/nova-active-sessions.json`

## Q4: 建議的 nova-server 目錄結構

```
~/projects/nova-server/
├── server.js              # 入口（從 ~/.claude/hooks/server.js 搬來）
├── event-bus.js           # xstream 事件匯流排
├── package.json           # bun runtime + xstream 依賴
├── flow/                  # 從 scripts/flow/ 搬來
│   ├── api-router.js      # 或拆成子路由：
│   │   ├── api/sessions.js
│   │   ├── api/timeline.js
│   │   ├── api/manager.js
│   │   ├── api/system.js
│   │   └── api/push.js
│   ├── sse.js
│   ├── event-writer.js
│   ├── session-index.js
│   ├── config.js
│   └── graph-builder.js
├── lib/                   # 從 scripts/lib/ 搬來（共用部分）
│   ├── decisions.js
│   ├── notifications.js
│   ├── branch-scheduler.js
│   ├── apns.js
│   └── registry.js
└── dashboard/             # Flow Visualizer 前端（從 overtone/dashboard/ 搬來）
```

### 不搬的（留在 ~/.claude/）

```
~/.claude/hooks/
├── hook-client.js         # Claude Code hook 入口（不動）
├── modules/               # hook handler 模組（不動）
│   ├── guards.js
│   ├── flow-observer.js
│   ├── context-injector.js
│   ├── notification.js
│   └── heartbeat.js
└── settings.json          # Claude Code hook 設定（不動）
```

nova-server 用 `CLAUDE_DIR = join(homedir(), '.claude')` 絕對路徑 import modules。

## 風險評估

| 風險 | 嚴重度 | 緩解方案 |
|------|:------:|---------|
| 搬遷期間 server 不可用 | 高 | 新舊並行測試，確認後一次切換 |
| hook-client 找不到 server | 中 | hook-client 的 autostart 路徑需更新 |
| 路徑硬編碼壞掉 | 中 | 統一用 CLAUDE_DIR 常數，不用 homedir() |
| 跨 repo 維護成本 | 低 | 兩個 repo 都在本地，git push 即可 |

## 建議優先級

1. **先拆 api-router.js 為 5 個子路由**（低風險、高收益、不動結構）
2. **nova-control 降低 polling 頻率**（解決 RSS 膨脹根因）
3. **最後才考慮拆 nova-server 為獨立專案**（目前 overhead > 收益）
