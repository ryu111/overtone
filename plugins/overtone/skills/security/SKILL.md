---
name: security
description: 純安全掃描工作流。只委派 security-reviewer agent 執行 OWASP Top 10 安全掃描。
disable-model-invocation: true
---

# 純安全掃描（Security Only）

## 初始化

使用 Bash 執行：
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/init-workflow.js security-only ${CLAUDE_SESSION_ID}
```

## Stages

### 1. SECURITY — 🛡️ 安全掃描

委派 `security-reviewer` agent。

- **輸入**：使用者指定的掃描範圍（預設全專案）
- **產出**：PASS / REJECT（含安全問題嚴重程度分級：Critical/High/Medium/Low）

💡 OWASP Top 10 完整清單與修復指引：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/security/references/owasp-top10-checklist.md`
💡 報告格式範例：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/security/examples/security-report.md`

## 失敗處理

- **REJECT**：security-reviewer 輸出安全問題清單，使用者自行決定後續

## 完成條件

- ✅ 安全掃描完成，輸出 PASS 或 REJECT 判定
