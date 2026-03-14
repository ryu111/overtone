# Hook Dispatcher 架構規格

## 概述

Hook Dispatcher 將 9 個獨立 hook 腳本（各自啟動 Bun process）整合為**單一常駐 daemon**，透過 HTTP dispatch 統一處理所有 hook 事件。

## 架構圖

```
Claude Code
    ↓ stdin JSON
hook-client.js (PreToolUse Bash)
    ↓ HTTP POST /dispatch
dispatcher.js (port 3457, 常駐)
    ├── handlerMap 路由
    │   ├── bash-guard.js    → PreToolUse:Bash
    │   ├── edit-guard.js    → PreToolUse:Write, PreToolUse:Edit
    │   ├── flow-observer.js → SessionStart, SessionEnd, UserPromptSubmit,
    │   │                      SubagentStop, PreToolUse:Agent, PostToolUse
    │   └── notification.js  → Notification
    ├── 結果聚合（block AND 語意）
    ├── xstream event$ pipeline
    │   ├── writeFlowEvent() → JSONL 持久化
    │   └── pool.broadcast() → SSE 推送
    └── 原 server.js 路由（/, /events, /api/*)
         ↓
    Flow Visualizer UI (http://localhost:3457)
```

## 模組介面

### Handler 格式

```javascript
module.exports = {
  on: {
    'EventType[:Matcher]': (input) => ({
      decision: 'allow' | 'block',
      reason?: string,
      events?: FlowEvent[],
    }),
  },
};
```

### Dispatcher API

| 路徑 | 方法 | 說明 |
|------|------|------|
| `POST /dispatch` | POST | `{ eventType, matcher?, input }` → `{ decision, reason? }` |
| `GET /health` | GET | `{ status, uptime, modules, connections }` |
| `POST /modules/reload` | POST | 重新載入模組 → `{ status, modules }` |

### 路由優先順序

1. **精確匹配**：`EventType:Matcher`（如 `PreToolUse:Bash`）
2. **| 展開**：`Write|Edit` → 分別查找 `PreToolUse:Write` 和 `PreToolUse:Edit`
3. **寬鬆匹配**：只用 `EventType`（如 `PostToolUse`）
4. **去重**：同一函式參考只執行一次

### 結果聚合

- **block AND 語意**：任一 handler 返回 block → 整體 block
- **events 合併**：所有 handler 的 events 陣列合併後寫入 JSONL + SSE

## 檔案清單

| 檔案 | 位置 | 行數 | 用途 |
|------|------|------|------|
| dispatcher.js | `~/.claude/hooks/` | ~180 | 常駐 daemon |
| hook-client.js | `~/.claude/hooks/` | ~50 | 統一 hook 入口 |
| flow-observer.js | `~/.claude/hooks/modules/` | ~80 | Flow 事件觀察 |
| bash-guard.js | `~/.claude/hooks/modules/` | ~10 | Bash 安全守衛 |
| edit-guard.js | `~/.claude/hooks/modules/` | ~10 | 編輯守衛 |
| notification.js | `~/.claude/hooks/modules/` | ~15 | macOS 通知 |

## Fallback 策略

hook-client.js 的 `fetch` 失敗時（dispatcher 未啟動），自動 import 舊 hook 腳本的 `evaluate()` 函式。舊腳本保留不刪。

## 遷移策略

1. settings.json 的所有 hook command 改為 `bun ~/.claude/hooks/hook-client.js <EventType> [Matcher]`
2. 啟動 dispatcher：`bun ~/.claude/hooks/dispatcher.js`
3. 未啟動 dispatcher 時自動 fallback，零停機
4. 原 `scripts/flow/server.js` 刪除（路由已合併進 dispatcher）

## 關鍵決策

- **Port 合併 3457**：dispatcher 取代 flow-server，Flow Visualizer URL 不變
- **Guard handler 同步**：bash-guard、edit-guard 的 evaluate() 為純函式，確保 HTTP 回應延遲可控
- **xstream event$**：統一事件管道，取代 watchFile 500ms 輪詢，延遲從 500ms → 即時
