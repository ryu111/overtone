---
name: pr
description: 從 Overtone workflow 結果自動建立 GitHub Pull Request。收集 git 變更和 workflow 狀態，組裝結構化 PR description。
disable-model-invocation: false
---

# PR 知識域

> GitHub Pull Request 建立與品質管理

## 消費者

此 Skill 為 utility，由 /ot:pr command 觸發。

## 資源索引

| 檔案 | 說明 |
|------|------|
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/pr/references/pr-body-template.md` | PR body 模板：Summary + Changes + Test Results 結構 |
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/pr/references/pr-quality-checklist.md` | PR 品質檢查清單：title format / diff size / 合併策略決策樹 |