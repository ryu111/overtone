---
feature: evolution-engine-gap-detect
status: in-progress
workflow: standard
created: 2026-03-05T11:55:45.036Z
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
- [ ] 建立 gap-analyzer.js — 整合四個 check 函式、型別映射、去重、suggestion 生成 | files: plugins/overtone/scripts/lib/gap-analyzer.js

### Phase 2: CLI 入口（sequential，依賴 Phase 1）
- [ ] 建立 evolution.js — analyze subcommand、純文字/JSON 雙輸出、exit code | files: plugins/overtone/scripts/evolution.js

### Phase 3: 測試（parallel，依賴 Phase 1+2）
- [ ] 撰寫 gap-analyzer.js 單元測試 — 五種 GapType mapping、去重邏輯、summary 計算 | files: tests/unit/gap-analyzer.test.js
- [ ] 撰寫 evolution CLI 整合測試 — analyze 輸出格式、--json 模式、exit code | files: tests/integration/evolution-analyze.test.js
