---
name: dev
description: 單步開發工作流。只委派 developer agent 完成程式碼修改，適用於一行修改、改設定、小改動。
disable-model-invocation: true
---

# 單步開發（Single）

## 初始化

使用 Bash 執行：
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/init-workflow.js single ${CLAUDE_SESSION_ID}
```

## Stages

### 1. DEV — 💻 開發

委派 `developer` agent。

- **輸入**：使用者需求
- **產出**：Handoff（程式碼變更）

## 完成條件

- ✅ developer 完成修改
- 💡 如需驗證，可手動執行 `/ot:verify`
