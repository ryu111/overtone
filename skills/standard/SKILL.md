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
- **產出**：`openspec/specs/` 中的 GIVEN/WHEN/THEN 行為規格
- 💡 此階段撰寫行為規格，不寫測試碼

### 4. DEV — 💻 開發

委派 `developer` agent。

- **輸入**：architect Handoff + BDD spec（openspec/specs/）
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

### 7. DOCS — 📝 文件

委派 `doc-updater` agent。

- **輸入**：所有前面階段的 Handoff
- **產出**：更新的文件（README、API 文件等）

## 並行規則

REVIEW + TEST:verify 屬於 `quality` 並行群組，📋 MUST 同時委派。

## BDD 規則

📋 MUST 在 DEV 前執行 TEST:spec。tester 撰寫行為規格後，developer 依照規格實作。

## 失敗處理

- **TEST FAIL**：failCount < 3 → 委派 debugger → developer → tester
- **REVIEW REJECT**：rejectCount < 3 → 委派 developer（帶 reject 原因）→ code-reviewer
- 達到 3 次上限 → 停止，提示使用者介入

## 完成條件

- ✅ 所有 7 個 stage 完成
- ✅ lint 0 error + test 0 fail + code-review PASS
