---
name: build-fix
description: 修構建錯誤工作流。只委派 build-error-resolver agent 用最小修改修復編譯和構建錯誤。
disable-model-invocation: true
---

# 修構建錯誤（Build Fix）

## 初始化

使用 Bash 執行：
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/init-workflow.js build-fix ${CLAUDE_SESSION_ID}
```

## Stages

### 1. BUILD-FIX — 🔨 修復構建

委派 `build-error-resolver` agent。

- **輸入**：構建錯誤訊息或使用者描述
- **產出**：Handoff（修復方式 + 驗證結果）
- 💡 agent 自帶停止條件：3 次修復失敗或新錯 > 修錯時自動停止

## 完成條件

- ✅ build 命令成功（零錯誤）
