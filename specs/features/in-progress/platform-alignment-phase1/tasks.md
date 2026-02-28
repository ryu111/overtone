---
feature: platform-alignment-phase1
status: in-progress
workflow: standard
created: 2026-03-01T00:00:00Z
---
## Tasks

- [x] PLAN
- [x] ARCH
- [x] TEST
- [x] DEV
- [x] REVIEW
- [x] TEST
- [x] RETRO
- [x] DOCS

## Dev Phases

### Phase 1: 基礎建設 (sequential)
- [x] 新增 registry.js tool:failure event type | files: plugins/overtone/scripts/lib/registry.js
- [x] 新增 hook-utils.js buildWorkflowContext 函式 | files: plugins/overtone/scripts/lib/hook-utils.js

### Phase 2: Agent 遷移 + Reference Skills (parallel)
- [x] 修改 10 個 agent frontmatter（disallowedTools 遷移）| files: plugins/overtone/agents/architect.md, plugins/overtone/agents/planner.md, plugins/overtone/agents/code-reviewer.md, plugins/overtone/agents/security-reviewer.md, plugins/overtone/agents/debugger.md, plugins/overtone/agents/database-reviewer.md, plugins/overtone/agents/retrospective.md, plugins/overtone/agents/product-manager.md, plugins/overtone/agents/qa.md, plugins/overtone/agents/designer.md
- [x] 新增 3 個 reference skill + 修改 5 個 agent skills 欄位 | files: plugins/overtone/skills/ref-bdd-guide/SKILL.md, plugins/overtone/skills/ref-failure-handling/SKILL.md, plugins/overtone/skills/ref-wording-guide/SKILL.md, plugins/overtone/agents/tester.md, plugins/overtone/agents/qa.md, plugins/overtone/agents/developer.md, plugins/overtone/agents/code-reviewer.md, plugins/overtone/agents/doc-updater.md

### Phase 3: Hook 實作 (parallel)
- [x] pre-task.js updatedInput 注入邏輯 | files: plugins/overtone/hooks/scripts/tool/pre-task.js
- [x] 新增 on-session-end.js（SessionEnd hook）| files: plugins/overtone/hooks/scripts/session/on-session-end.js, plugins/overtone/hooks/hooks.json
- [x] 新增 post-use-failure.js（PostToolUseFailure hook）| files: plugins/overtone/hooks/scripts/tool/post-use-failure.js, plugins/overtone/hooks/hooks.json
