---
name: standard
description: 標準功能開發工作流。PLAN → ARCH → TEST:spec → DEV → [REVIEW + TEST:verify] → DOCS。適用於中型新功能。
disable-model-invocation: true
---

# 標準功能開發（Standard）

## 初始化

使用 Bash 執行：
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/init-workflow.js standard ${CLAUDE_SESSION_ID}
```

## 進度追蹤

初始化後、委派第一個 agent 前，📋 MUST 使用 TaskCreate 建立 pipeline 進度：

| Stage | subject | activeForm |
|-------|---------|------------|
| PLAN | [PLAN] 規劃 | 規劃中 |
| ARCH | [ARCH] 架構 | 設計架構中 |
| TEST:spec | [TEST] BDD 規格 | 撰寫規格中 |
| DEV | [DEV] 開發 | 開發中 |
| REVIEW | [REVIEW] 審查 | 審查中 |
| TEST:verify | [TEST] 測試驗證 | 驗證中 |
| RETRO | [RETRO] 回顧 | 回顧中 |
| DOCS | [DOCS] 文件 | 更新文件中 |

委派 agent 前 → TaskUpdate status: `in_progress`；agent 完成後 → TaskUpdate status: `completed`。

## Stages

### 1. PLAN — 📋 規劃

委派 `planner` agent。

- **輸入**：使用者需求
- **產出**：Handoff（需求分解 + 子任務清單 + 優先順序）

### 2. ARCH — 🏗️ 架構

委派 `architect` agent。

- **輸入**：planner 的 Handoff
- **產出**：Handoff（技術方案 + API 介面 + 資料模型 + 檔案結構）

### 3. TEST:spec — 🧪 BDD 規格

委派 `tester` agent（mode: spec）。

- **輸入**：architect 的 Handoff
- **產出**：`specs/features/in-progress/{featureName}/bdd.md` 中的 GIVEN/WHEN/THEN 行為規格
- 此階段撰寫行為規格，不寫測試碼

### 4. DEV — 💻 開發

委派 `developer` agent。

- **輸入**：architect Handoff + BDD spec（`specs/features/in-progress/{featureName}/bdd.md`）
- **產出**：Handoff（程式碼變更 + 實作說明）
- 📋 MUST 按 BDD spec 實作所有行為

### 5-6. [REVIEW + TEST:verify] — 並行

📋 MUST 在同一訊息中同時委派：

- `code-reviewer` agent（REVIEW）
  - **輸入**：developer 的 Handoff
  - **產出**：PASS / REJECT

- `tester` agent，mode: verify（TEST:verify）
  - **輸入**：developer 的 Handoff + BDD spec
  - **產出**：PASS / FAIL

### 7. RETRO — 🔁 迭代回顧

委派 `retrospective` agent。

- **輸入**：所有前面階段的 Handoff + 測試結果 + review 結果
- **產出**：PASS（無重要問題）/ ISSUES（有改善建議）
- 📋 ISSUES → Main Agent 📋 MUST 自動委派 developer 修復 → 重回 [REVIEW + TEST] → RETRO（retroCount+1，上限 3 次）

### 8. DOCS — 📝 文件

委派 `doc-updater` agent。

- **輸入**：所有前面階段的 Handoff
- **產出**：更新的文件（README、API 文件等）

## 並行規則

REVIEW + TEST:verify 屬於 `quality` 並行群組，📋 MUST 同時委派。

## BDD 規則

📋 MUST 在 DEV 前執行 TEST:spec。tester 撰寫行為規格後，developer 依照規格實作。

💡 BDD 語法與最佳實踐：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/auto/references/bdd-spec-guide.md`

## 失敗處理

TEST FAIL → debugger → developer → tester 迴圈（上限 3 次）。REVIEW REJECT → developer 帶原因修復 → code-reviewer 再審（上限 3 次）。

💡 完整流程與 retry 邏輯：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/auto/references/failure-handling.md`

## 完成條件

- ✅ 所有 8 個 stage 完成
- ✅ lint 0 error + test 0 fail + code-review PASS + RETRO PASS（或 retroCount 達上限）
