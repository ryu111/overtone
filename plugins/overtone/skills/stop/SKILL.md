---
name: stop
description: 退出 Overtone Loop 模式。標記 loop 為停止狀態，下次 Stop hook 觸發時允許退出。
disable-model-invocation: true
---

# 停止 Loop

執行以下命令停止 Overtone Loop：

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/stop-loop.js ${CLAUDE_SESSION_ID}
```

Loop 已標記為停止。下次回覆結束時將允許退出。

如需恢復 Loop，重新啟動工作流即可。
