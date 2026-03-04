---
name: quick
description: 快速開發工作流。DEV 後執行 REVIEW，適用於小 bug 修復和簡單功能。
---

# 快速開發（Quick）

## 初始化

使用 Bash 執行：
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/init-workflow.js quick ${CLAUDE_SESSION_ID} {featureName}
```
# {featureName} 必須是 kebab-case（如 add-user-auth）

## 進度追蹤

初始化後、委派第一個 agent 前，📋 MUST 使用 TaskCreate 建立 pipeline 進度：

| Stage | subject | activeForm |
|-------|---------|------------|
| DEV | [DEV] 開發 | 開發中 |
| REVIEW | [REVIEW] 審查 | 審查中 |
| RETRO | [RETRO] 回顧 | 回顧中 |

委派 agent 前 → TaskUpdate status: `in_progress`；agent 完成後 → TaskUpdate status: `completed`。

## Stages

### 1. DEV — 💻 開發

委派 `developer` agent。

- **輸入**：使用者需求
- **產出**：Handoff（程式碼變更）

💡 **並行**：若任務包含 2+ 個獨立子任務（操作不同檔案、無邏輯依賴），📋 MUST 在同一訊息中委派多個同類型 agent。判斷標準與調度方式：讀取 `${CLAUDE_PLUGIN_ROOT}/commands/mul-agent.md`（Mode B）

### 2. REVIEW — 🔍 審查

委派 `code-reviewer` agent。

- **輸入**：developer 的 Handoff
- **產出**：PASS / REJECT

### 3. RETRO — 🔁 迭代回顧

委派 `retrospective` agent。

- **輸入**：所有前面階段的 Handoff
- **產出**：PASS（無重要問題）/ ISSUES（有改善建議）
- 📋 ISSUES → Main Agent 📋 MUST 自動委派 developer 修復 → 重回 REVIEW → RETRO（retroCount+1，上限 3 次）

## 失敗處理

REVIEW REJECT → developer 帶原因修復 → code-reviewer 再審（上限 3 次）。

💡 完整流程與 retry 邏輯：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/workflow-core/references/failure-handling.md`

## 完成條件

- ✅ REVIEW PASS + RETRO PASS（或 retroCount 達上限）
- ✅ lint 0 error + code-review PASS
