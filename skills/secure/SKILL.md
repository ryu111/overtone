---
name: secure
description: 高風險功能開發工作流。PLAN → ARCH → TEST:spec → DEV → [REVIEW + TEST:verify + SECURITY] → DOCS。適用於認證、支付、安全敏感功能。
disable-model-invocation: true
---

# 高風險功能開發（Secure）

## 初始化

使用 Bash 執行：
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/init-workflow.js secure ${CLAUDE_SESSION_ID}
```

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
- **產出**：`openspec/specs/` 中的 GIVEN/WHEN/THEN 行為規格
- 💡 安全相關功能的 BDD spec 應包含異常路徑和攻擊場景

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

### 8. DOCS — 📝 文件

委派 `doc-updater` agent。

- **輸入**：所有前面階段的 Handoff（含安全審查結果）
- **產出**：更新的文件

## 並行規則

REVIEW + TEST:verify + SECURITY 屬於 `secure-quality` 並行群組，📋 MUST 同時委派三者。

## BDD 規則

📋 MUST 在 DEV 前執行 TEST:spec。安全功能的 BDD spec 應涵蓋：
- 正常認證/授權流程
- 無效/過期 token 處理
- 注入攻擊防護
- 權限越界嘗試

## 失敗處理

- **TEST FAIL**：failCount < 3 → 委派 debugger → developer → tester
- **REVIEW REJECT**：rejectCount < 3 → 委派 developer → code-reviewer
- **SECURITY REJECT（Critical/High）**：📋 MUST 修復後再重審，不可忽略
- 達到 3 次上限 → 停止，提示使用者介入

## 完成條件

- ✅ 所有 8 個 stage 完成
- ✅ lint 0 error + test 0 fail + code-review PASS + security PASS
