---
feature: prompt-journal
status: archived
workflow: standard
created: 2026-03-05T02:48:43.594Z
archivedAt: 2026-03-05T03:10:52.182Z
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

### Phase 1：基礎能力 (parallel)
- [ ] T1：`instinct.js` emit() 新增 options 第 6 參數（skipDedup + extraFields） | files: `plugins/overtone/scripts/lib/knowledge/instinct.js`
- [ ] T2：`registry.js` 新增 journalDefaults | files: `plugins/overtone/scripts/lib/registry.js`

### Phase 2：記錄與配對 (parallel)
- [ ] T3：`on-submit-handler.js` 新增 intent_journal 記錄邏輯 | files: `plugins/overtone/scripts/lib/on-submit-handler.js`
- [ ] T4：`session-end-handler.js` 新增 resolveSessionResult + 配對邏輯 | files: `plugins/overtone/scripts/lib/session-end-handler.js`

### Phase 3：全域整合 (sequential)
- [ ] T5：`global-instinct.js` queryGlobal 新增 excludeTypes 過濾 | files: `plugins/overtone/scripts/lib/knowledge/global-instinct.js`
- [ ] T6：`session-start-handler.js` 全域觀察加 excludeTypes + 最近常做的事摘要 | files: `plugins/overtone/scripts/lib/session-start-handler.js`

### Phase 4：可選工具 (independent)
- [ ] T7：`data.js` 新增 query journal 子命令 | files: `plugins/overtone/scripts/data.js`

### Phase 5：測試覆蓋 (parallel)
- [ ] T8a：新建 `instinct-skip-dedup.test.js` | files: `tests/unit/instinct-skip-dedup.test.js`
- [ ] T8b：擴展 `on-submit-handler.test.js` 加 intent_journal 測試 | files: `tests/unit/on-submit-handler.test.js`
- [ ] T8c：新建 `session-end-handler.test.js` 加 sessionResult 配對測試 | files: `tests/unit/session-end-handler.test.js`
