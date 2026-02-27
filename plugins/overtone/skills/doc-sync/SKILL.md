---
name: doc-sync
description: 文件同步。委派 doc-updater agent 根據程式碼變更更新 README、API 文件、設計文件。
disable-model-invocation: true
---

# 文件同步（Doc Sync）

## Stage

委派 `doc-updater` agent。

- **輸入**：前面階段的 Handoff（含 Files Modified 清單）
- **產出**：Handoff（更新的文件清單 + 變更摘要）

## 使用場景（vs DOCS stage）

| | doc-sync skill | DOCS stage |
|--|---------------|------------|
| **觸發方式** | 手動 `/ot:doc-sync` | workflow 自動（standard/full/secure 最後一步） |
| **適用情境** | pipeline 外的獨立文件同步 | pipeline 內的自動同步 |

典型 doc-sync 場景：
- 手動修改後需要補同步文件（未跑 standard/full workflow）
- 多次 quick/single 累積後一次性同步
- 程式碼合併後需要補充文件

## 後續

文件更新完成後工作流結束。
