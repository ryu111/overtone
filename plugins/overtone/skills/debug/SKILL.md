---
name: debug
description: 除錯工作流。DEBUG → DEV → TEST。先診斷根因，再修復，最後驗證。
disable-model-invocation: true
---

# 除錯（Debug）

## 初始化

使用 Bash 執行：
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/init-workflow.js debug ${CLAUDE_SESSION_ID}
```

## Stages

### 1. DEBUG — 🔧 診斷

委派 `debugger` agent。

- **輸入**：使用者描述的問題（錯誤訊息、重現步驟等）
- **產出**：Handoff（根因分析 + 假設驗證 + 修復建議）
- ⛔ debugger 不寫碼，只做診斷

### 2. DEV — 💻 修復

委派 `developer` agent。

- **輸入**：debugger 的 Handoff（含根因和修復建議）
- **產出**：Handoff（程式碼修復 + 修改說明）
- 📋 MUST 按 debugger 的診斷結果修復

### 3. TEST — 🧪 驗證

委派 `tester` agent（mode: verify）。

- **輸入**：developer 的 Handoff
- **產出**：PASS / FAIL
- 💡 驗證 bug 已修復且未引入新問題

## 失敗處理

TEST FAIL → 回到 DEBUG（重新診斷）→ DEV → TEST 迴圈（上限 3 次）。達到上限 → 停止，提示使用者介入。

💡 完整流程與 retry 邏輯：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/auto/references/failure-handling.md`

## 完成條件

- ✅ bug 修復且測試通過
- ✅ test 0 fail
