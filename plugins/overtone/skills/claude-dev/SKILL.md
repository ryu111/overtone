---
name: claude-dev
description: Claude Code Plugin 開發知識。hooks、agents、skills、commands 的 API 格式與 Overtone 專有規範。供 developer 和 architect 在開發 plugin 時查詢。
disable-model-invocation: true
user-invocable: false
---

# Claude Dev

> Claude Code plugin 平台知識 + Overtone 規範

## 消費者

| Agent | 用途 |
|-------|------|
| developer | hooks/agent/skill/command API |
| architect | 欄位規格、注入機制 |

## 決策樹

- hooks.json / events / exit codes → `hooks-api.md`
- agent frontmatter / prompt → `agent-api.md`
- skill 結構 / disclosure → `skill-api.md`
- command / workflow pipeline → `command-api.md`

## 資源

| Ref | 內容 |
|-----|------|
| `${CLAUDE_PLUGIN_ROOT}/skills/claude-dev/references/hooks-api.md` | Hooks API |
| `${CLAUDE_PLUGIN_ROOT}/skills/claude-dev/references/agent-api.md` | Agent API |
| `${CLAUDE_PLUGIN_ROOT}/skills/claude-dev/references/skill-api.md` | Skill API |
| `${CLAUDE_PLUGIN_ROOT}/skills/claude-dev/references/command-api.md` | Command API |
