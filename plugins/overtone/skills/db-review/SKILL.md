---
name: db-review
description: 資料庫審查。委派 database-reviewer agent 審查 SQL 效能、索引策略、migration 安全性、N+1 查詢。
disable-model-invocation: true
---

# 資料庫審查（DB Review）

## 初始化

使用 Bash 執行：
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/init-workflow.js review-only ${CLAUDE_SESSION_ID}
```

## Stage

委派 `database-reviewer` agent。

- **輸入**：使用者指定的審查範圍（預設 `git diff` 中的 DB 相關變更）
- **產出**：PASS / REJECT（含效能、安全性、最佳實踐三維度報告）

## 審查重點

- **效能**：N+1 查詢、缺少索引、慢查詢
- **安全性**：migration 可逆性、破壞性變更、SQL injection
- **最佳實踐**：Transaction 邊界、connection pool、lock 影響

💡 三維度完整清單：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/db-review/references/database-review-checklist.md`
💡 報告格式範例：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/db-review/examples/db-review-report.md`

## 使用場景

- 資料庫 schema 變更後需要專業審查
- migration 上線前的安全確認
- 效能調優前的問題診斷

## 失敗處理

- **REJECT**：database-reviewer 輸出問題清單（含嚴重程度），使用者自行決定後續

## 完成條件

- ✅ 所有 DB 相關變更已審查，輸出 PASS 或 REJECT 判定
