---
featureName: fs-scanner
workflow: standard
status: archived
archivedAt: 2026-03-07T02:03:14.652Z
---## Stages

- [x] PLAN
- [x] ARCH
- [x] TEST
- [x] DEV
- [x] REVIEW
- [x] TEST
- [x] RETRO
- [x] DOCS

## Dev Phases

### Phase 1: fs-scanner.js 新模組 (sequential)
- [ ] 建立 fs-scanner.js — collectJsFiles/collectMdFiles/safeRead/clearCache + module cache | files: plugins/overtone/scripts/lib/fs-scanner.js

### Phase 2: 消費者改造 (parallel, depends: 1)
- [ ] health-check.js 移除重複實作，改 require fs-scanner | files: plugins/overtone/scripts/health-check.js
- [ ] dead-code-scanner.js 移除重複實作，re-export from fs-scanner | files: plugins/overtone/scripts/lib/analyzers/dead-code-scanner.js

### Phase 3: 測試新增 (sequential, depends: 1)
- [ ] 新增 fs-scanner.test.js — cache/clearCache/node_modules 排除/collectMdFiles | files: tests/unit/fs-scanner.test.js
