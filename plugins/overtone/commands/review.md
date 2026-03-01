---
name: review
description: 純程式碼審查工作流。只委派 code-reviewer agent 審查目前的程式碼變更。
disable-model-invocation: true
---

# 純審查（Review Only）

## 初始化

使用 Bash 執行：
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/init-workflow.js review-only ${CLAUDE_SESSION_ID}
```

## Stages

### 1. REVIEW — 🔍 審查

委派 `code-reviewer` agent。

- **輸入**：使用者指定的審查範圍（預設 `git diff`）
- **產出**：PASS / REJECT

## 失敗處理

- **REJECT**：code-reviewer 輸出具體問題列表，使用者自行決定後續

## 完成條件

- ✅ 審查完成，輸出 PASS 或 REJECT 判定
