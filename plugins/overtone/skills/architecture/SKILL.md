---
name: architecture
description: 系統架構設計、ADR 決策記錄、設計模式選擇、技術 tradeoff 分析框架。
disable-model-invocation: true
user-invocable: false
---

# Architecture 知識域

> 來源：MADR 4.0 標準 + 軟體設計模式最佳實踐

## 消費者

| Agent | 用途 |
|-------|------|
| architect | 進行技術決策時查詢設計模式、撰寫 ADR、使用 tradeoff 框架評估方案 |

## 資源索引

| 檔案 | 說明 |
|------|------|
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/architecture/references/adr-template.md` | MADR 4.0 模板、Y-Statement 格式、ADR 使用指南 |
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/architecture/references/architectural-patterns.md` | 架構層級設計模式決策樹（建構/結構/行為），含 tradeoff 和反模式 |
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/architecture/references/tradeoff-framework.md` | 技術決策 tradeoff 分析框架、常見場景決策指引 |
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/architecture/references/state-sync-patterns.md` | 跨元件/頁面狀態同步四種模式（Props/Store/EventBus/Server State）+ 決策樹 |
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/architecture/examples/adr-sample.md` | ADR 範例：使用 Bun 作為 runtime 的決策記錄 |

## 跨域引用

程式碼層級的設計模式（Strategy/Observer/Factory）見 craft skill：

💡 程式碼模式：`${CLAUDE_PLUGIN_ROOT}/skills/craft/references/code-level-patterns.md`

> 注意：此 skill 聚焦 **架構層級** 的模式與決策，程式碼層級模式保留於 craft skill（SoT 原則）。