---
name: refactor
description: 重構工作流。ARCH → TEST:spec → DEV → [REVIEW + TEST:verify]。先設計再重構，確保品質不下降。
---

# 重構（Refactor）

## 初始化

使用 Bash 執行：
```bash
bun ~/.claude/scripts/init-workflow.js refactor ${CLAUDE_SESSION_ID} {featureName}
```
# {featureName} 必須是 kebab-case（如 add-user-auth）

## 進度追蹤

初始化後、委派第一個 agent 前，📋 MUST 使用 TaskCreate 建立 pipeline 進度：

| Stage | subject | activeForm |
|-------|---------|------------|
| ARCH | [ARCH] 架構設計 | 設計架構中 |
| TEST:spec | [TEST] BDD 規格 | 撰寫規格中 |
| DEV | [DEV] 重構實作 | 重構中 |
| REVIEW | [REVIEW] 審查 | 審查中 |
| TEST:verify | [TEST] 測試驗證 | 驗證中 |

委派 agent 前 → TaskUpdate status: `in_progress`；agent 完成後 → TaskUpdate status: `completed`。

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

📋 **並行委派**：讀取 `tasks.md` 的 `## Dev Phases`。`(parallel)` Phase → 同一訊息發多個 Agent tool call（每個子任務一個）；`(sequential)` Phase → 單一 agent；等當前 Phase 全部完成才啟動下一 Phase。無 Dev Phases 或只有一個子任務 → 單一 agent。

### 4-5. [REVIEW + TEST:verify] — 並行

📋 MUST 在同一訊息中同時委派：

- `code-reviewer` agent（REVIEW）
  - **輸入**：developer 的 Handoff
  - **產出**：PASS / REJECT
  - 💡 審查重點：重構是否符合目標架構、是否改變了行為

- `tester` agent，mode: verify（TEST:verify）
  - **輸入**：developer 的 Handoff + BDD spec
  - **產出**：PASS / FAIL
  - 📋 MUST 驗證重構未改變行為

## 並行規則

REVIEW + TEST:verify 屬於 `quality` 並行群組，📋 MUST 同時委派。

## BDD 規則

📋 MUST 在 DEV 前執行 TEST:spec。重構的 BDD spec 聚焦在「行為不變」的驗證。

💡 BDD 語法與最佳實踐：讀取 `~/.claude/skills/testing/references/bdd-spec-guide.md`

## 失敗處理

TEST FAIL → debugger → developer → tester 迴圈（上限 3 次）。REVIEW REJECT → developer → code-reviewer 再審（上限 3 次）。

💡 完整流程與 retry 邏輯：讀取 `~/.claude/skills/workflow-core/references/failure-handling.md`

## 完成條件

- ✅ 所有 5 個 stage 完成
- ✅ 重構後行為不變 + code-review PASS + test 0 fail
