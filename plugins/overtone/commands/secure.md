---
name: secure
description: 高風險功能開發工作流。PLAN → ARCH → TEST:spec → DEV → [REVIEW + TEST:verify + SECURITY] → DOCS。適用於認證、支付、安全敏感功能。
---

# 高風險功能開發（Secure）

## 初始化

使用 Bash 執行：
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/init-workflow.js secure ${CLAUDE_SESSION_ID} {featureName}
```
# {featureName} 必須是 kebab-case（如 add-user-auth）

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
| SECURITY | [SECURITY] 安全審查 | 安全審查中 |
| RETRO | [RETRO] 回顧 | 回顧中 |
| DOCS | [DOCS] 文件 | 更新文件中 |

委派 agent 前 → TaskUpdate status: `in_progress`；agent 完成後 → TaskUpdate status: `completed`。

## Stages

### 1. PLAN — 📋 規劃

委派 `planner` agent。

- **輸入**：使用者需求
- **產出**：Handoff（需求分解 + 安全需求識別）

### 2. ARCH — 🏗️ 架構

委派 `architect` agent。

- **輸入**：planner 的 Handoff
- **產出**：Handoff（技術方案 + 安全架構設計 + API 介面）

### 3. TEST:spec — 🧪 BDD 規格

委派 `tester` agent（mode: spec）。

- **輸入**：architect 的 Handoff
- **產出**：`specs/features/in-progress/{featureName}/bdd.md` 中的 GIVEN/WHEN/THEN 行為規格
- 📋 安全相關功能的 BDD spec MUST 包含異常路徑和攻擊場景

### 4. DEV — 💻 開發

委派 `developer` agent。

- **輸入**：architect Handoff + BDD spec
- **產出**：Handoff（程式碼變更）
- 📋 MUST 按 BDD spec 實作，特別注意安全防護

### 5-7. [REVIEW + TEST:verify + SECURITY] — 並行

📋 MUST 在同一訊息中同時委派三個 agent：

- `code-reviewer` agent（REVIEW）
  - **輸入**：developer 的 Handoff
  - **產出**：PASS / REJECT

- `tester` agent，mode: verify（TEST:verify）
  - **輸入**：developer 的 Handoff + BDD spec
  - **產出**：PASS / FAIL

- `security-reviewer` agent（SECURITY）
  - **輸入**：developer 的 Handoff + architect 的安全架構設計
  - **產出**：PASS / REJECT（含安全問題嚴重程度分級）

### 8. RETRO — 🔁 迭代回顧

委派 `retrospective` agent。

- **輸入**：所有前面階段的 Handoff（含安全審查結果）
- **產出**：PASS（無重要問題）/ ISSUES（有改善建議）
- 📋 ISSUES → Main Agent 📋 MUST 自動委派 developer 修復 → 重回 [REVIEW + TEST] → RETRO（retroCount+1，上限 3 次）

### 9. DOCS — 📝 文件

委派 `doc-updater` agent。

- **輸入**：所有前面階段的 Handoff（含安全審查結果）
- **產出**：更新的文件

## 並行規則

REVIEW + TEST:verify + SECURITY 屬於 `secure-quality` 並行群組，📋 MUST 同時委派三者。

## BDD 規則

📋 MUST 在 DEV 前執行 TEST:spec。安全功能的 BDD spec 應涵蓋正常認證流程、無效 token 處理、注入攻擊防護、權限越界嘗試。

💡 安全 BDD spec 要求與範例：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/testing/references/bdd-spec-guide.md`

## 失敗處理

TEST FAIL → debugger → developer → tester 迴圈（上限 3 次）。REVIEW REJECT → developer → code-reviewer 再審（上限 3 次）。SECURITY REJECT（Critical/High）→ 📋 MUST 修復後重審，不可忽略。

💡 完整流程與 retry 邏輯：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/workflow-core/references/failure-handling.md`

## 完成條件

- ✅ 所有 9 個 stage 完成
- ✅ lint 0 error + test 0 fail + code-review PASS + security PASS + RETRO PASS（或 retroCount 達上限）
