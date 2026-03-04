---
name: claude-dev
description: Claude Code Plugin 開發知識。hooks.json 格式、hook events、agent frontmatter 欄位。供 developer 和 architect 在開發 plugin 時查詢。
disable-model-invocation: true
user-invocable: false
---

# Claude Dev 知識域

> 來源：Claude Code 官方 hooks + agent API

## 消費者

| Agent | 用途 |
|-------|------|
| developer | 開發 plugin 時查詢 hooks API、hook output 格式、exit codes |
| architect | 設計 plugin 架構時查詢 agent frontmatter 欄位、skills 工作原理 |

## 決策樹：何時查閱哪個參考？

- hooks.json 格式 / hook events / input output / exit codes → hooks-api.md
- agent frontmatter / skills 欄位 / bypassPermissions / manage-component → agent-api.md

## 資源索引

| 檔案 | 說明 |
|------|------|
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/claude-dev/references/hooks-api.md` | Hooks API：事件總覽、hooks.json 格式、input/output、exit codes、Overtone 特有限制 |
| 💡 `${CLAUDE_PLUGIN_ROOT}/skills/claude-dev/references/agent-api.md` | Agent API：frontmatter 欄位、skills 機制、manage-component.js 指令、系統 prompt 設計 |
