---
name: claude-dev
description: 委派 claude-developer agent 處理 Plugin 元件開發任務（建立/修改 agent、skill、hook、command）。
---

# Claude Developer

委派 `claude-developer` agent。

- **輸入**：使用者需求（$ARGUMENTS）
- **產出**：Handoff（元件變更）

💡 不走 workflow pipeline，直接委派專職 agent。如需完整 pipeline，改用 `/ot:quick` 或 `/ot:standard`。
