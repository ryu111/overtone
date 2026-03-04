---
feature: statusline-ttl
status: archived
workflow: standard
created: 2026-03-04T15:01:12.538Z
archivedAt: 2026-03-04T15:32:25.157Z
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

### Phase 1: TTL 實作與測試 (parallel)
- [ ] 在 `read()` 加入 TTL 過期邏輯（`TTL_MS` 常數 + mtime 檢查） | files: plugins/overtone/scripts/lib/statusline-state.js
- [ ] 新增 TTL 單元測試（TTL-1 / TTL-2 / TTL-3 scenarios，使用 `utimesSync`） | files: tests/unit/statusline-ttl.test.js
