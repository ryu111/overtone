---
name: code-review
description: >-
  PR Review 知識域：四維度結構化審查（code quality / security / performance / observability）+
  回饋分級。
disable-model-invocation: true
user-invocable: false
---

# Code Review 知識域

> 來源：Anthropic 官方 awattar/claude-code-best-practices

## 消費者

| Agent | 用途 |
|-------|------|
| code-reviewer | PR 審查四維度檢查清單 + 回饋分級標準 |
| developer | （依賴圖自動偵測新增） |

## 資源索引

| 檔案 | 說明 |
|------|------|
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/code-review/references/pr-review-checklist.md` | PR Review 多維度檢查清單 |
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/code-review/references/architecture-review.md` | 架構層面 review patterns（模組耦合、API 一致性、錯誤傳播） |

## 跨域引用

審查測試程式碼時，應同時參考測試反模式指南，識別低品質/重複測試：

💡 測試反模式（6 種）：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/testing/references/test-anti-patterns.md`

> 注意：此引用遵守 Single Source of Truth 原則，內容保留於 testing/references/ 下，不複製到 code-review/references/。
