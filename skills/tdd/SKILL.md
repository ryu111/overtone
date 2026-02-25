---
name: tdd
description: 測試驅動開發工作流。TEST:spec → DEV → TEST:verify。先寫行為規格，再實作，最後驗證。
disable-model-invocation: true
---

# 測試驅動開發（TDD）

## 初始化

使用 Bash 執行：
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/init-workflow.js tdd ${CLAUDE_SESSION_ID}
```

## Stages

### 1. TEST:spec — 🧪 BDD 規格

委派 `tester` agent（mode: spec）。

- **輸入**：使用者需求
- **產出**：`openspec/specs/` 中的 GIVEN/WHEN/THEN 行為規格
- 📋 MUST 先定義行為，再寫碼
- 💡 至少包含 3 個場景：happy path、edge case、error case

### 2. DEV — 💻 開發

委派 `developer` agent。

- **輸入**：tester 的 Handoff + BDD spec
- **產出**：Handoff（程式碼變更 + 測試碼）
- 📋 MUST 按 BDD spec 逐一實作每個場景

### 3. TEST:verify — 🧪 測試驗證

委派 `tester` agent（mode: verify）。

- **輸入**：developer 的 Handoff + BDD spec
- **產出**：PASS / FAIL（驗證所有 BDD 場景）

## 失敗處理

TEST FAIL → debugger → developer → tester 迴圈（上限 3 次）。達到上限 → 停止，提示使用者介入。

💡 完整流程與 retry 邏輯：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/auto/references/failure-handling.md`

## 完成條件

- ✅ 所有 BDD 場景驗證通過
- ✅ test 0 fail
