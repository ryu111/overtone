---
feature: test-quality-guard
workflow: standard
status: archived
archivedAt: 2026-03-02T12:32:55.733Z
---
# test-quality-guard

## Tasks

- [ ] 建立 test-anti-patterns.md（6 種反模式 + 好壞例 + 判斷準則）
- [ ] 更新 testing/SKILL.md 索引（加第 7 條 reference）
- [ ] 更新 code-review/SKILL.md（加跨域 reference）
- [ ] 建立 test-index.js 掃描工具（掃描 tests/ 產出摘要）
- [ ] 在 pre-task.js 注入 test-index 摘要（tester/developer 路徑）
- [ ] 更新 tester.md 和 developer.md 的 DON'T 規則（透過 manage-component.js）
- [ ] 撰寫 test-index.test.js 測試

## Dev Phases

### Phase 1: Knowledge 層文件 (parallel)
- [ ] 建立 test-anti-patterns.md | files: plugins/overtone/skills/testing/references/test-anti-patterns.md
- [ ] 更新 testing/SKILL.md 索引加第 7 條 reference | files: plugins/overtone/skills/testing/SKILL.md
- [ ] 更新 code-review/SKILL.md 加跨域 reference | files: plugins/overtone/skills/code-review/SKILL.md

### Phase 2: Perception 層工具 (sequential)
- [ ] 建立 test-index.js 掃描工具 | files: plugins/overtone/scripts/test-index.js
- [ ] 在 pre-task.js 注入 test-index 摘要 | files: plugins/overtone/hooks/scripts/tool/pre-task.js

### Phase 3: Agent 規則更新 + 測試 (parallel, depends: 2)
- [ ] 更新 tester.md DON'T 規則 | files: plugins/overtone/agents/tester.md
- [ ] 更新 developer.md DON'T 規則 | files: plugins/overtone/agents/developer.md
- [ ] 撰寫 test-index.test.js | files: tests/unit/test-index.test.js
