---
name: e2e
description: 純 E2E 測試工作流。只委派 e2e-runner agent 執行端對端自動化測試。
disable-model-invocation: true
---

# 純 E2E 測試（E2E Only）

## 初始化

使用 Bash 執行：
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/init-workflow.js e2e-only ${CLAUDE_SESSION_ID}
```

## Stages

### 1. E2E — 🌐 端對端測試

委派 `e2e-runner` agent。

- **輸入**：使用者指定的測試範圍或全部 E2E 測試
- **產出**：PASS / FAIL（含測試結果摘要）
- 📋 **路徑慣例**：E2E 測試放 `tests/e2e/`，命名 `*.spec.js`；瀏覽器操作使用 agent-browser CLI（定義於 e2e-runner agent prompt）

## 完成條件

- ✅ E2E 測試執行完成，輸出 PASS 或 FAIL
