---
feature: github-integration
status: in-progress
workflow: standard
created: 2026-02-28T12:00:00.000Z
---

## Tasks

- [ ] plan
- [ ] arch
- [ ] test:spec
- [ ] dev
- [ ] review
- [ ] test:verify
- [ ] retro
- [ ] docs

## Dev Phases

### Phase 1: 基礎建設 (sequential)
- [ ] on-start.js 新增 gh CLI 可用性檢查 | files: plugins/overtone/hooks/scripts/session/on-start.js

### Phase 2: Skill 建立 (parallel)
- [ ] 建立 /ot:issue skill（SKILL.md + references/label-workflow-map.md） | files: plugins/overtone/skills/issue/SKILL.md, plugins/overtone/skills/issue/references/label-workflow-map.md
- [ ] 建立 /ot:pr skill（SKILL.md + references/pr-body-template.md） | files: plugins/overtone/skills/pr/SKILL.md, plugins/overtone/skills/pr/references/pr-body-template.md
- [ ] 更新 /ot:auto 工作流選擇指南 | files: plugins/overtone/skills/auto/SKILL.md

### Phase 3: 測試與文件 (parallel, depends: 2)
- [ ] 撰寫 gh 偵測邏輯整合測試 | files: tests/integration/gh-check.test.js
- [ ] 更新文件（status.md、overtone.md skill 計數） | files: docs/status.md, docs/spec/overtone.md
