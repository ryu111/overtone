---
name: architecture
description: 系統架構設計、ADR 決策記錄、設計模式選擇、技術 tradeoff 分析框架。
user-invocable: false
disable-model-invocation: true
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
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/architecture/references/design-patterns.md` | 設計模式決策樹（建構/結構/行為），含 tradeoff 和反模式 |
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/architecture/references/tradeoff-framework.md` | 技術決策 tradeoff 分析框架、常見場景決策指引 |
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/architecture/examples/adr-sample.md` | ADR 範例：使用 Bun 作為 runtime 的決策記錄 |
