---
workflow: standard
status: archived
created: 2026-02-28
archivedAt: 2026-02-28T02:15:28.305Z
---
# Tasks: pipeline-stability-tests

## Stages

- [ ] PLAN
- [x] ARCH
- [ ] TEST
- [ ] DEV
- [ ] REVIEW
- [ ] RETRO
- [ ] DOCS

## Dev Phases

### Phase 1: 模組提取 + Bug 修復 (sequential)
- [ ] 提取 identifyAgent 為 `scripts/lib/identify-agent.js`，修復 alias 只匹配 desc，更新 pre-task.js require + 更新 identify-agent.test.js 改為 require 模組 + 新增回歸測試 | files: plugins/overtone/scripts/lib/identify-agent.js, plugins/overtone/hooks/scripts/tool/pre-task.js, tests/unit/identify-agent.test.js
- [ ] 提取 parseResult 為 `scripts/lib/parse-result.js`，更新 on-stop.js require + 更新 parse-result.test.js 改為 require 模組 | files: plugins/overtone/scripts/lib/parse-result.js, plugins/overtone/hooks/scripts/agent/on-stop.js, tests/unit/parse-result.test.js
- [ ] 建立 test helper `tests/helpers/hook-runner.js`（E2E 共用的 hook 執行函式） | files: tests/helpers/hook-runner.js

### Phase 2: E2E 測試 + Integration 擴充 (parallel)
- [ ] single workflow E2E state machine 測試 | files: tests/e2e/single-workflow.test.js
- [ ] standard workflow E2E state machine 測試（含並行 [REVIEW + TEST:2] 驗證） | files: tests/e2e/standard-workflow.test.js
- [ ] 並行 stage PreToolUse 行為 integration 測試（含 `.test.js` 誤匹配防護） | files: tests/integration/pre-task-parallel.test.js

### Phase 3: 補充 E2E (parallel)
- [ ] quick workflow hook 驅動 state 轉移 E2E | files: tests/e2e/quick-workflow.test.js
- [ ] fail-retry 完整路徑 E2E（TEST FAIL → DEBUGGER → DEV → TEST PASS） | files: tests/e2e/fail-retry-path.test.js
