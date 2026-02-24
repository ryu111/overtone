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

## 使用場景

- 需要補充文件更新（未跑 standard/full 的任務）
- 單獨更新特定文件
- 程式碼合併後需要補充文件

## 後續

文件更新完成後工作流結束。
