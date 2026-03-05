---
feature: project-orchestrator
status: archived
workflow: standard
created: 2026-03-05T17:25:30.030Z
archivedAt: 2026-03-05T17:38:34.186Z
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

### Phase 1: 核心模組（sequential）
- [ ] 實作 project-orchestrator.js（parseSpecToText + extractFeatureList + orchestrate API） | files: plugins/overtone/scripts/lib/project-orchestrator.js

### Phase 2: CLI 與測試（parallel）
- [ ] 擴展 evolution.js 新增 orchestrate 子命令 + printUsage | files: plugins/overtone/scripts/evolution.js
- [ ] 撰寫單元測試（parseSpecToText / extractFeatureList / orchestrate dry-run / forgeSkill 批次 / pause 行為） | files: tests/unit/project-orchestrator.test.js
- [ ] 撰寫整合測試（evolution.js orchestrate CLI 端到端 + temp dir fs 隔離） | files: tests/integration/project-orchestrator.integration.test.js
