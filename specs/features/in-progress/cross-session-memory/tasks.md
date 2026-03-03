---
feature: cross-session-memory
status: in-progress
workflow: standard
created: 2026-03-03T06:33:09.824Z
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

### Phase 1: 基礎路徑與設定 (parallel)
- [ ] DEV-1：paths.js 新增 GLOBAL_DIR 和 global 路徑物件 | files: plugins/overtone/scripts/lib/paths.js
- [ ] DEV-2：registry.js 新增 globalInstinctDefaults 並更新 module.exports | files: plugins/overtone/scripts/lib/registry.js

### Phase 2: 核心模組 (sequential, depends: 1)
- [ ] DEV-3：建立 global-instinct.js（graduate / queryGlobal / summarizeGlobal / decayGlobal / pruneGlobal） | files: plugins/overtone/scripts/lib/global-instinct.js

### Phase 3: Hook 整合與 Unit Test (parallel, depends: 2)
- [ ] DEV-4：SessionEnd hook 新增畢業機制（步驟 3b，try/catch 隔離） | files: plugins/overtone/hooks/scripts/session/on-session-end.js
- [ ] DEV-5：SessionStart hook 新增全域觀察載入注入 systemMessage | files: plugins/overtone/hooks/scripts/session/on-start.js
- [ ] DEV-6：unit 測試 global-instinct.js（graduate / queryGlobal / summarize / decay / prune / 去重邏輯） | files: tests/unit/global-instinct.test.js

### Phase 4: Integration Test (sequential, depends: 3)
- [ ] DEV-7：integration 測試完整流程（session end 畢業 → session start 載入 systemMessage） | files: tests/integration/cross-session-memory.test.js
