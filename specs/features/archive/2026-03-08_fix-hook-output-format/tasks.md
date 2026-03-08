---
feature: fix-hook-output-format
status: archived
workflow: standard
created: 2026-03-08T11:15:05.305Z
archivedAt: 2026-03-08T11:31:13.291Z
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

### Phase 1: 修改 handler 實作（parallel）
- [ ] 修改 session-start-handler.js `buildStartOutput()` 加入 hookSpecificOutput | files: `~/.claude/scripts/lib/session-start-handler.js`
- [ ] 修改 pre-compact-handler.js `handlePreCompact()` 加入 hookSpecificOutput | files: `~/.claude/scripts/lib/pre-compact-handler.js`
- [ ] 修改 pre-edit-guard.js 兩個路徑加入 hookSpecificOutput | files: `~/.claude/hooks/scripts/tool/pre-edit-guard.js`
- [ ] 修改 post-use-failure-handler.js 重大失敗路徑加入 hookSpecificOutput | files: `~/.claude/scripts/lib/post-use-failure-handler.js`
- [ ] 修改 post-use-handler.js 兩個回傳路徑加入 hookSpecificOutput | files: `~/.claude/scripts/lib/post-use-handler.js`

### Phase 2: 更新對應測試（parallel，依賴 Phase 1）
- [ ] 更新 session-start-handler.test.js | files: `tests/unit/session-start-handler.test.js`
- [ ] 更新 pre-compact-handler.test.js | files: `tests/unit/pre-compact-handler.test.js`
- [ ] 更新 post-use-failure-handler.test.js | files: `tests/unit/post-use-failure-handler.test.js`
- [ ] 更新 post-use-handler.test.js | files: `tests/unit/post-use-handler.test.js`
