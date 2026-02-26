---
name: refactor
description: 重構工作流。ARCH → TEST:spec → DEV → REVIEW → TEST:verify。先設計再重構，確保品質不下降。
disable-model-invocation: true
---

# 重構（Refactor）

## 初始化

使用 Bash 執行：
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/init-workflow.js refactor ${CLAUDE_SESSION_ID}
```

## Stages

### 1. ARCH — 🏗️ 架構設計

委派 `architect` agent。

- **輸入**：使用者的重構需求
- **產出**：Handoff（重構方案 + 目標架構 + 影響範圍）
- 💡 重構前先設計目標架構，避免無方向的修改

### 2. TEST:spec — 🧪 BDD 規格

委派 `tester` agent（mode: spec）。

- **輸入**：architect 的 Handoff
- **產出**：`specs/features/in-progress/{featureName}/bdd.md` 中的行為規格
- 📋 MUST 為重構涉及的功能撰寫行為規格，確保重構不改變行為

### 3. DEV — 💻 重構實作

委派 `developer` agent。

- **輸入**：architect Handoff + BDD spec
- **產出**：Handoff（重構後的程式碼變更）
- ⛔ 不可改變外部行為（public API 保持不變）

### 4. REVIEW — 🔍 審查

委派 `code-reviewer` agent。

- **輸入**：developer 的 Handoff
- **產出**：PASS / REJECT
- 💡 審查重點：重構是否符合目標架構、是否改變了行為

### 5. TEST:verify — 🧪 測試驗證

委派 `tester` agent（mode: verify）。

- **輸入**：developer 的 Handoff + BDD spec
- **產出**：PASS / FAIL
- 📋 MUST 驗證重構未改變行為

## BDD 規則

📋 MUST 在 DEV 前執行 TEST:spec。重構的 BDD spec 聚焦在「行為不變」的驗證。

💡 BDD 語法與最佳實踐：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/auto/references/bdd-spec-guide.md`

## 失敗處理

TEST FAIL → debugger → developer → tester 迴圈（上限 3 次）。REVIEW REJECT → developer → code-reviewer 再審（上限 3 次）。

💡 完整流程與 retry 邏輯：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/auto/references/failure-handling.md`

## 完成條件

- ✅ 所有 5 個 stage 完成
- ✅ 重構後行為不變 + code-review PASS + test 0 fail
