---
feature: specs-archive-fix
status: archived
workflow: standard
created: 2026-03-03T03:50:27.590Z
archivedAt: 2026-03-03T04:24:12.540Z
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

### Phase 1: Registry 事件登記 (sequential)
- [ ] 新增 specs:archive-skipped 和 specs:tasks-missing 到 timelineEvents | files: plugins/overtone/scripts/lib/registry.js

### Phase 2: Hook 修復 + Command 更新 (parallel, depends: 1)
- [ ] 修復 1：agent/on-stop.js auto-sync 加 specsConfig 過濾 | files: plugins/overtone/hooks/scripts/agent/on-stop.js
- [ ] 修復 2+3：session/on-stop.js 歸檔前 workflow 匹配驗證 + tasksStatus 診斷警告 | files: plugins/overtone/hooks/scripts/session/on-stop.js
- [ ] 修復 4：6 個 command 模板加 featureName 參數提示 | files: plugins/overtone/commands/standard.md, plugins/overtone/commands/full.md, plugins/overtone/commands/secure.md, plugins/overtone/commands/refactor.md, plugins/overtone/commands/tdd.md, plugins/overtone/commands/quick.md

### Phase 3: 測試新增 (parallel, depends: 2)
- [ ] agent-on-stop.test.js 新增修復 1 測試場景 | files: tests/integration/agent-on-stop.test.js
- [ ] session-stop.test.js 新增修復 2+3 測試場景 | files: tests/integration/session-stop.test.js
