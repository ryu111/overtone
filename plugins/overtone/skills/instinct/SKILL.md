---
name: instinct
description: 跨專案內化知識庫：從 session 學習資料評估並永久保留的通用知識條目，由 skill-internalization 飛輪自動維護。
user-invocable: false
---

# Instinct 知識域（内化知識庫）

> 來源：Skill Internalization 飛輪（skill-evaluator + skill-generalizer + evolution.js internalize）

## 說明

此 skill 儲存從 session 學習資料評估並內化的通用知識條目。由 evolution.js internalize 子命令自動維護，不需 agent frontmatter 引用。

## 資源索引

| 檔案 | 說明 |
|------|------|
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/instinct/references/README.md` | 內化知識參考索引（自動生成） |
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/instinct/internalized.md` | 通用化後的永久知識條目 |