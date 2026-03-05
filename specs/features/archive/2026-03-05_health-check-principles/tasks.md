---
feature: health-check-principles
status: archived
workflow: standard
created: 2026-03-05T03:44:07.573Z
archivedAt: 2026-03-05T03:59:40.925Z
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

### Phase 1: 核心實作 (sequential)
- [ ] 在 health-check.js 新增 checkClosedLoop / checkRecoveryStrategy / checkCompletionGap 三個函式，更新 runAllChecks + module.exports + 頂部 JSDoc | files: plugins/overtone/scripts/health-check.js
- [ ] 在 manage-component.js 的 create agent 和 create skill 成功後各新增 1 條 stderr 原則合規提示 | files: plugins/overtone/scripts/manage-component.js

### Phase 2: 文件 + 測試 (parallel)
- [ ] 新增 tests/unit/health-check-principles.test.js（3 個 describe，DI friendly）+ 更新 health-check-proactive.test.js 中 checks.length 斷言（12 → 15）| files: tests/unit/health-check-principles.test.js, tests/unit/health-check-proactive.test.js
- [ ] 更新 docs/spec/overtone-製作規範.md（缺口狀態）和 docs/status.md（health-check 項目數 12 → 15）| files: docs/spec/overtone-製作規範.md, docs/status.md
