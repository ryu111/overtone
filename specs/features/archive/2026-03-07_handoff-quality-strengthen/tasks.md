---
feature: handoff-quality-strengthen
status: archived
workflow: standard
created: 2026-03-07T03:42:58.477Z
archivedAt: 2026-03-07T03:57:57.069Z
---
## Stages

- [x] PLAN
- [x] ARCH
- [x] TEST
- [x] DEV
- [x] REVIEW
- [x] RETRO
- [x] DOCS

## Tasks

## Dev Phases

### Phase 1: handoff-protocol 欄位定義 (sequential)
- [ ] 更新 handoff-protocol.md：新增 Exit Criteria 欄位規範 + Main Agent 未勾選項目處理規則 | files: plugins/overtone/skills/workflow-core/references/handoff-protocol.md

### Phase 2: 四個 agent 加入 Exit Criteria (parallel)
- [ ] 更新 developer.md：在 Test Scope 後、Open Questions 前加入 5 項 DEV Exit Criteria | files: plugins/overtone/agents/developer.md
- [ ] 更新 code-reviewer.md：在兩種輸出格式加入 5 項 Review Checklist + 強化 DO 區塊 hardcoded 數值指引 | files: plugins/overtone/agents/code-reviewer.md
- [ ] 更新 architect.md：在 Open Questions 前加入 3 項 ARCH Exit Criteria | files: plugins/overtone/agents/architect.md
- [ ] 更新 planner.md：在 Open Questions 前加入 3 項 PLAN Exit Criteria | files: plugins/overtone/agents/planner.md
