# Event Bus Refactor — 規格

## 動機

server.js（494 行）混合 4 個職責：HTTP server、sync dispatch、heartbeat loop、self-drive。heartbeat + self-drive 用命令式 setInterval + if-else + 內嵌 notify()，無法獨立測試、無法增減 lifecycle 模組。

## 目標

1. server.js 瘦身至 ~250 行：只保留 HTTP server + sync dispatch + SSE + 模組載入
2. heartbeat、self-drive、notification 提取為獨立 lifecycle 模組
3. 新增 event-bus.js 作為非同步事件匯流排，統一 lifecycle 模組的通訊管道
4. 維持現有 sync dispatch 路徑（guards block/allow）完全不變
5. heartbeat.js（scripts/）清除死碼，只保留純業務邏輯

## 架構分界

### 雙路徑：sync dispatch vs async events

| 路徑 | 用途 | 機制 | 延遲要求 |
|------|------|------|---------|
| **sync dispatch** | hook handler（guards, observer, injector） | `dispatch(eventType, matcher, input)` 同步呼叫 | <10ms |
| **async events** | lifecycle 模組通訊（heartbeat, self-drive, notification） | `emit(type, data)` → xstream `all$` | best-effort |

sync dispatch 路徑不經過 event-bus，維持現有行為。

## 事件清單

### Lifecycle 事件（async，經過 event-bus）

| 事件 | 發射者 | 消費者 | Payload |
|------|--------|--------|---------|
| `hb:tick` | event-bus timer | heartbeat | `{ ts }` |
| `hb:idle` | heartbeat | self-drive | `{ consecutiveIdles, lastPoll }` |
| `hb:paused` | heartbeat | （log） | `{ reason }` |
| `task:start` | heartbeat | notification | `{ task: { name, priority } }` |
| `task:success` | heartbeat | notification | `{ task, result, proofOfWork }` |
| `task:failed` | heartbeat | notification | `{ task, error, proofOfWork }` |
| `sd:start` | self-drive | notification | `{ prompt_preview }` |
| `sd:done` | self-drive | notification | `{ exitCode, duration }` |

### 現有 flow 事件（經過 pushEvent → event$ stream）

維持不變：`session_start`, `session_end`, `prompt_submit`, `agent_dispatch`, `agent_complete`, `tool_use`, `hook_trigger`, `agent_status`, `anomaly_detected`

### 事件合流

lifecycle 事件和 flow 事件合流到同一條 `all$` stream → SSE broadcast + JSONL 持久化 + metrics。

## 模組介面

### 現有 hook 模組（不變）

```javascript
// guards.js, flow-observer.js, context-injector.js, notification.js（現有部分）
export const on = {
  'PreToolUse:Bash': (input) => ({ decision, events, hookSpecificOutput }),
  'SessionStart': (input) => ({ decision, events, hookSpecificOutput }),
};
```

### 新 lifecycle 模組

```javascript
export default {
  name: 'heartbeat',              // 模組識別名
  subscribe: ['hb:tick'],         // 訂閱哪些 async 事件
  init: async (ctx) => { ... },   // server 啟動時呼叫一次
  handler: async (event, ctx) => { ... },  // 收到訂閱事件時呼叫
  destroy: async () => { ... },   // server 關閉時呼叫
};
```

### Context 物件（per-module）

```typescript
interface ModuleContext {
  emit(type: string, data?: object): void;   // 發射 async 事件
  timer(type: string, ms: number): void;     // 建立定時事件源
  clearTimer(type: string): void;            // 清除定時事件源
  getState(): object;                        // 讀取模組私有狀態
  setState(partial: object): void;           // 更新模組私有狀態
}
```

## API 變更

### 新增

| 端點 | 方法 | 說明 |
|------|------|------|
| — | — | 無新增 HTTP API |

### 修改

| 端點 | 變更 |
|------|------|
| `GET /health` | `heartbeat` 欄位改從 event-bus module state 取得（資料結構不變） |
| `GET /processes` | 改從 event-bus module state 取得（資料結構不變） |
| `POST /processes/heartbeat/start` | 委派給 event-bus `initModule('heartbeat')` |
| `POST /processes/heartbeat/stop` | 委派給 event-bus `destroyModule('heartbeat')` |

### 刪除

無。所有現有 API 保持向後相容。

## 約束

1. xstream ^11.14.0 已是依賴，直接使用
2. sync dispatch 必須保留同步語意（guards block/allow），不走 event-bus
3. 現有 5 個 hook 模組的 `on = {}` 介面不變
4. lifecycle 模組用 `subscribe + handler + init/destroy` 介面
5. server.js 受 guard 保護，需用 Bash 修改
6. 798 個現有測試必須通過
7. 每個 lifecycle 模組的 handler 為 async，event-bus 逐一 await（同一事件不並行 fan-out，避免競態）

## 驗收條件

1. `bun test` — 798+ tests 全部通過
2. server.js 行數 <= 280 行
3. heartbeat.js（scripts/）行數 <= 350 行（刪除 runDaemonLoop + CLI + makeListTasks）
4. event-bus.js 行數 <= 120 行
5. heartbeat lifecycle 模組正確訂閱 `hb:tick`，每 60 秒 poll 一次
6. self-drive lifecycle 模組正確訂閱 `hb:idle`，cooldown 30 分鐘
7. notification lifecycle 模組訂閱 task:* 和 sd:* 事件
8. `/health` API 回傳的 heartbeat 欄位資料結構不變
9. SSE broadcast 包含 lifecycle 事件
10. `curl http://127.0.0.1:3457/health | jq .heartbeat` 回傳正確狀態
