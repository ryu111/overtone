---
name: dashboard
description: 開啟或控制 Overtone Dashboard 即時監控面板。顯示工作流進度、事件串流、session 歷史。
disable-model-invocation: true
---

# Dashboard

Overtone Dashboard 在瀏覽器中即時顯示：
- **概覽**：工作流進度、Stage 狀態、執行中的 Agent
- **時間軸**：所有事件的即時串流，支援分類篩選

## 自動啟動

Dashboard 在 SessionStart 時自動啟動並開啟瀏覽器。
若未自動啟動，手動執行：

```bash
bun run ${CLAUDE_PLUGIN_ROOT}/scripts/server.js
```

然後開啟：`http://localhost:7777/s/${CLAUDE_SESSION_ID}`

## 環境變數

- `OVERTONE_PORT`：Dashboard 端口（預設 7777）

## 狀態檢查

- PID 檔案：`~/.overtone/dashboard.json`
- 健康檢查：`curl http://localhost:7777/health`
