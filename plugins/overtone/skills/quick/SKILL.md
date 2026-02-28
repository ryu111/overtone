---
name: quick
description: 快速開發工作流。DEV 後並行執行 REVIEW 和 TEST，適用於小 bug 修復和簡單功能。
disable-model-invocation: true
---

# 快速開發（Quick）

## 初始化

使用 Bash 執行：
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/init-workflow.js quick ${CLAUDE_SESSION_ID}
```

## 進度追蹤

初始化後、委派第一個 agent 前，📋 MUST 使用 TaskCreate 建立 pipeline 進度：

| Stage | subject | activeForm |
|-------|---------|------------|
| DEV | [DEV] 開發 | 開發中 |
| REVIEW | [REVIEW] 審查 | 審查中 |
| TEST | [TEST] 測試 | 測試中 |
| RETRO | [RETRO] 回顧 | 回顧中 |

委派 agent 前 → TaskUpdate status: `in_progress`；agent 完成後 → TaskUpdate status: `completed`。

## Stages

### 1. DEV — 💻 開發

委派 `developer` agent。

- **輸入**：使用者需求
- **產出**：Handoff（程式碼變更）

### 2-3. [REVIEW + TEST] — 並行

📋 MUST 在同一訊息中同時委派（兩個 Task 呼叫）：

- `code-reviewer` agent（REVIEW）
  - **輸入**：developer 的 Handoff
  - **產出**：PASS / REJECT

- `tester` agent，mode: verify（TEST:verify）
  - **輸入**：developer 的 Handoff
  - **產出**：PASS / FAIL

### 4. RETRO — 🔁 迭代回顧

委派 `retrospective` agent。

- **輸入**：所有前面階段的 Handoff + 測試結果
- **產出**：PASS（無重要問題）/ ISSUES（有改善建議）
- 📋 ISSUES → Main Agent 📋 MUST 自動委派 developer 修復 → 重回 [REVIEW + TEST] → RETRO（retroCount+1，上限 3 次）

## 並行規則

REVIEW 和 TEST 屬於 `quality` 並行群組，📋 MUST 同時委派。

## 失敗處理

TEST FAIL → debugger → developer → tester 迴圈（上限 3 次）。REVIEW REJECT → developer 帶原因修復 → code-reviewer 再審（上限 3 次）。

💡 完整流程與 retry 邏輯：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/auto/references/failure-handling.md`

## 完成條件

- ✅ REVIEW PASS + TEST PASS + RETRO PASS（或 retroCount 達上限）
- ✅ lint 0 error + test 0 fail + code-review PASS
