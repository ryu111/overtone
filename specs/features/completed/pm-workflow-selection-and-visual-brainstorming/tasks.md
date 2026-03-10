---
feature: pm-workflow-selection-and-visual-brainstorming
status: in-progress
workflow: standard
created: 2026-03-10T14:58:48.642Z
---

## Stages

- [x] PLAN
- [x] ARCH
- [x] TEST
- [x] DEV
- [x] REVIEW
- [x] RETRO
- [ ] DOCS

## Tasks

## Dev Phases

### Phase 1: 新增 reference 檔案 (parallel)
- [ ] 撰寫 workflow-selection-guide.md（複雜度矩陣 + 邊界案例 + 範例） | files: ~/.claude/skills/pm/references/workflow-selection-guide.md
- [ ] 撰寫 visual-brainstorming.md（HTML 模板 + Chrome MCP 流程 + 觸發決策樹） | files: ~/.claude/skills/thinking/references/visual-brainstorming.md

### Phase 2: 更新 SKILL.md 索引 (parallel)
- [ ] 更新 pm/SKILL.md — Workflow 建議矩陣下加引用行 | files: ~/.claude/skills/pm/SKILL.md
- [ ] 更新 thinking/SKILL.md — 資源索引表格加 visual-brainstorming.md 行 | files: ~/.claude/skills/thinking/SKILL.md

### Phase 3: 更新 product-manager.md (sequential)
- [ ] 更新 product-manager.md DO 區塊 — 加 workflow 複雜度選擇規則 | files: ~/.claude/agents/product-manager.md
- [ ] 更新 product-manager.md frontmatter skills — 加 thinking | files: ~/.claude/agents/product-manager.md
