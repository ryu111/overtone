---
feature: global-migrate-test-adapt
status: archived
workflow: standard
created: 2026-03-07T06:52:14.903Z
archivedAt: 2026-03-07T07:10:15.005Z
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

### Phase 1: 更新 paths.js (sequential)
- [ ] T1：更新 `tests/helpers/paths.js` — PLUGIN_ROOT 改為 `process.env.OVERTONE_PLUGIN_ROOT || join(homedir(), '.claude')`，引入 `const { homedir } = require('os')` | files: `tests/helpers/paths.js`

### Phase 2: 修復直接硬編碼 (parallel)
- [ ] T2：修復 unit/ 下 39 個 A 類 scripts/lib 引用 — 在頂部加 `{ SCRIPTS_LIB } = require('../helpers/paths')`，替換所有 `require('../../plugins/overtone/scripts/lib/xxx')` | files: `tests/unit/*.test.js`（排除 knowledge/、hook-pure-fns、extract-command-tag、paths.test.js）
- [ ] T3：修復 knowledge/ 子目錄 3 個 B 類引用 — `../../helpers/paths` 路徑引入 SCRIPTS_LIB，替換 `../../../plugins/overtone/scripts/lib/...` | files: `tests/unit/knowledge/auto-forge-trigger.test.js`, `skill-evaluator.test.js`, `skill-generalizer.test.js`
- [ ] T4：修復 C 類 hooks 路徑 + paths.test.js — hook-pure-fns 改用 HOOKS_DIR；extract-command-tag 改用 join(HOOKS_DIR)；paths.test.js 改用 join(SCRIPTS_LIB) | files: `tests/unit/hook-pure-fns.test.js`, `tests/unit/extract-command-tag.test.js`, `tests/unit/paths.test.js`

### Phase 3: 驗證 (sequential)
- [ ] T5：執行 `bun scripts/test-parallel.js`，確認全數通過（4670+ pass，無 Cannot find module） | files: 無
