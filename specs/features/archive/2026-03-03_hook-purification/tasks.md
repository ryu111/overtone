---
featureName: hook-purification
workflow: standard
status: archived
archivedAt: 2026-03-03T03:18:37.197Z
---
## Stages

- [x] PLAN
- [x] ARCH
- [x] TEST
- [x] DEV
- [x] REVIEW
- [x] TEST
- [x] RETRO
- [x] DOCS

## Dev Phases

### Phase 1: 新 lib 模組 + shouldSuggestCompact 搬遷 (parallel)
- [ ] 建立 stop-message-builder.js — prompt 組裝純函式 | files: plugins/overtone/scripts/lib/stop-message-builder.js
- [ ] 建立 knowledge-archiver.js — 知識歸檔 + 後處理 | files: plugins/overtone/scripts/lib/knowledge-archiver.js
- [ ] shouldSuggestCompact 從 on-stop.js 搬遷至 hook-utils.js | files: plugins/overtone/scripts/lib/hook-utils.js

### Phase 2: Agent prompt + 靜態知識更新 (parallel)
- [ ] 更新 retrospective.md — dead code 掃描指引 | files: plugins/overtone/agents/retrospective.md
- [ ] 更新 doc-updater.md — docs sync 校驗指引 | files: plugins/overtone/agents/doc-updater.md
- [ ] Grader hint 移至 completion-signals.md | files: plugins/overtone/skills/workflow-core/references/completion-signals.md

### Phase 3: on-stop.js 改寫 (sequential, depends: 1)
- [ ] 改寫 on-stop.js 為薄 orchestrator | files: plugins/overtone/hooks/scripts/agent/on-stop.js

### Phase 4: 測試更新 (sequential, depends: 3)
- [ ] 更新 compact-suggestion.test.js import 路徑 + 新增 stop-message-builder.test.js + knowledge-archiver.test.js | files: tests/integration/compact-suggestion.test.js, tests/unit/stop-message-builder.test.js, tests/unit/knowledge-archiver.test.js
