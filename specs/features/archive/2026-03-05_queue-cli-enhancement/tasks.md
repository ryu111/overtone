---
feature: queue-cli-enhancement
status: archived
workflow: standard
created: 2026-03-05T19:56:11.359Z
archivedAt: 2026-03-05T20:05:50.570Z
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

### Phase 1: 核心函式 (sequential)
- [ ] execution-queue.js 新增 insertItem / removeItem / moveItem / getItem / retryItem 五個函式，加入 module.exports | files: plugins/overtone/scripts/lib/execution-queue.js

### Phase 2: CLI + 測試 (parallel)
- [ ] queue.js 新增 cmdInsert / cmdRemove / cmdMove / cmdInfo / cmdRetry，更新 switch + help + module.exports | files: plugins/overtone/scripts/queue.js
- [ ] 單元測試：execution-queue-enhancement.test.js（五個新函式各覆蓋正常路徑 + 邊界情況） | files: tests/unit/execution-queue-enhancement.test.js

### Phase 3: 整合測試 + 文件 (parallel)
- [ ] 整合測試：queue-cli-enhancement.test.js（CLI 子命令 stdout / exit code / flag 解析） | files: tests/integration/queue-cli-enhancement.test.js
- [ ] 更新 CLAUDE.md queue.js 用法說明（補充五個新子命令） | files: CLAUDE.md
