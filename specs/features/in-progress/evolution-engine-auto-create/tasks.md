---
feature: evolution-engine-auto-create
status: in-progress
workflow: standard
created: 2026-03-05T12:18:32.892Z
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

### Phase 1: 並行基礎層 (parallel)
- [ ] 擴展 gap-analyzer.js — Gap 物件新增 fixable + fixAction 欄位（sync-mismatch/no-references 為 true，其餘為 false） | files: plugins/overtone/scripts/lib/gap-analyzer.js
- [ ] 新建 gap-fixer.js — 實作 fixGaps(gaps, options) API，sync-mismatch 用 Bun.spawnSync 呼叫 fix-consistency.js --fix，no-references 用 fs 建立 references/ + README.md | files: plugins/overtone/scripts/lib/gap-fixer.js

### Phase 2: CLI + 測試 (parallel)
- [ ] 更新 evolution.js — 新增 fix 子命令（--execute/--type/--json）、flow（analyze→filter→fix→驗證）、printUsage | files: plugins/overtone/scripts/evolution.js
- [ ] unit 測試 — 擴展 gap-analyzer.test.js（fixable/fixAction 欄位）+ 新建 gap-fixer.test.js（dryRun/typeFilter/FixResult 結構） | files: tests/unit/gap-analyzer.test.js, tests/unit/gap-fixer.test.js

### Phase 3: Integration 測試 (sequential)
- [ ] 新建 evolution-fix.test.js — fix --dry-run / fix --execute / fix --type 過濾 / 無效 type / usage 顯示 | files: tests/integration/evolution-fix.test.js
