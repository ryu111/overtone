---
feature: concurrency-guard-g2
status: archived
workflow: standard
created: 2026-03-07T00:00:00.000Z
archivedAt: 2026-03-06T21:30:26.649Z
---## Stages

- [x] PLAN
- [x] ARCH
- [x] TEST
- [x] DEV
- [x] REVIEW
- [x] TEST
- [x] RETRO
- [x] DOCS

## Tasks

- [ ] registry.js 新增 agent:orphan-cleanup event
- [ ] session-stop-handler.js 實作 detectAndCleanOrphans + 呼叫
- [ ] health-check.js 新增 checkConcurrencyGuards（第 20 項）
- [ ] filesystem-concurrency.md 更新 G1/G2/G3 記錄
- [ ] 撰寫單元與整合測試
- [ ] CLAUDE.md 更新 health-check 說明為 20 項

## Dev Phases

### Phase 1: registry (sequential)
- [ ] registry.js 新增 `agent:orphan-cleanup` timeline event | files: plugins/overtone/scripts/lib/registry.js

### Phase 2: handler + health-check + docs (parallel)
- [ ] session-stop-handler.js 新增 ORPHAN_TTL_MS + detectAndCleanOrphans() + 呼叫 | files: plugins/overtone/scripts/lib/session-stop-handler.js
- [ ] health-check.js 新增 checkConcurrencyGuards()（第 20 項） | files: plugins/overtone/scripts/health-check.js
- [ ] filesystem-concurrency.md 更新 G2 已修復 + G1/G3 已知風險 | files: plugins/overtone/skills/workflow-core/references/filesystem-concurrency.md

### Phase 3: CLAUDE.md (sequential)
- [ ] CLAUDE.md health-check 說明更新為 20 項 + checkConcurrencyGuards | files: CLAUDE.md
