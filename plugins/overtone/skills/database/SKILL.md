---
name: database
description: 資料庫審查知識。SQL 效能、索引策略、migration 安全審查清單。供 database-reviewer agent 消費。
disable-model-invocation: true
user-invocable: false
---

# 資料庫審查知識庫（Database KB）

消費者：database-reviewer agent

## 資源索引

| # | 檔案 | 用途 |
|---|------|------|
| 1 | 💡 `${CLAUDE_PLUGIN_ROOT}/skills/database/references/database-review-checklist.md` | 資料庫審查三維度清單 |
| 2 | 💡 `${CLAUDE_PLUGIN_ROOT}/skills/database/references/orm-patterns.md` | ORM 特定檢查（N+1、connection pool、migration、lazy loading） |
| 3 | 💡 `${CLAUDE_PLUGIN_ROOT}/skills/database/examples/db-review-report.md` | 資料庫審查報告範例 |
