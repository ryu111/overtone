---
feature: skill-internalization
status: archived
workflow: standard
created: 2026-03-05T17:50:15.300Z
archivedAt: 2026-03-05T18:03:26.996Z
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

### Phase 1: 核心模組 (parallel)
- [ ] T1：skill-evaluator.js 實作 + 單元測試 | files: `plugins/overtone/scripts/lib/knowledge/skill-evaluator.js`, `tests/unit/knowledge/skill-evaluator.test.js`
- [ ] T2：skill-generalizer.js 實作 + 單元測試 | files: `plugins/overtone/scripts/lib/knowledge/skill-generalizer.js`, `tests/unit/knowledge/skill-generalizer.test.js`
- [ ] T3：experience-index.js 實作 + paths.js 更新 + 單元測試 | files: `plugins/overtone/scripts/lib/knowledge/experience-index.js`, `plugins/overtone/scripts/lib/paths.js`, `tests/unit/knowledge/experience-index.test.js`

### Phase 2: CLI 整合 (sequential)
- [ ] T4：evolution.js internalize 子命令 + 整合測試 | files: `plugins/overtone/scripts/evolution.js`, `tests/unit/evolution-internalize.test.js`

### Phase 3: 系統整合 (parallel)
- [ ] T5：project-orchestrator.js 整合 experience-index + 測試 | files: `plugins/overtone/scripts/lib/project-orchestrator.js`, `tests/unit/project-orchestrator.test.js`
- [ ] T6：health-check.js checkInternalizationIndex + 測試 | files: `plugins/overtone/scripts/health-check.js`, `tests/unit/health-check.test.js`
