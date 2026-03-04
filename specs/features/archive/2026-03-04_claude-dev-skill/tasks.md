---
feature: claude-dev-skill
status: archived
workflow: standard
created: 2026-03-04
archivedAt: 2026-03-04T12:05:16.306Z
---## Stages

- [x] PLAN
- [x] ARCH
- [x] TEST:spec
- [x] DEV
- [x] REVIEW
- [x] TEST:verify
- [x] RETRO
- [x] DOCS

## Tasks

- [ ] 建立 `skills/claude-dev/` 目錄結構（SKILL.md + references/）
- [ ] 撰寫 `hooks-api.md`（hook events、格式、input/output、Overtone 限制）
- [ ] 撰寫 `agent-api.md`（frontmatter 欄位、skills 機制、manage-component 指令）
- [ ] 更新 developer.md frontmatter skills 加入 claude-dev
- [ ] 更新 architect.md frontmatter skills 加入 claude-dev
- [ ] knowledge-gap-detector.js 新增 claude-dev domain 關鍵詞

## Dev Phases

### Phase 1: 建立 SKILL.md + references（sequential）
- [ ] 用 manage-component.js 建立 claude-dev SKILL.md | files: plugins/overtone/skills/claude-dev/SKILL.md

### Phase 2: 撰寫 references + 更新 agents + 更新 detector（parallel, depends: 1）
- [ ] 撰寫 hooks-api.md：9 個事件、三層嵌套格式、input/output、exit codes、Overtone 限制 | files: plugins/overtone/skills/claude-dev/references/hooks-api.md
- [ ] 撰寫 agent-api.md：frontmatter 欄位、skills 機制、manage-component 指令、四模式 prompt | files: plugins/overtone/skills/claude-dev/references/agent-api.md
- [ ] 更新 developer.md + architect.md frontmatter skills | files: plugins/overtone/agents/developer.md, plugins/overtone/agents/architect.md
- [ ] knowledge-gap-detector.js 新增 claude-dev domain（16 個關鍵詞） | files: plugins/overtone/scripts/lib/knowledge-gap-detector.js
