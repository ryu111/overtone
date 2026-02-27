---
workflow: standard
status: completed
created: 2026-02-27
---

# Tasks: test-coverage-gap-analysis

## 子任務

- [x] registry.js 資料完整性 unit test
- [x] paths.js 路徑解析 unit test
- [x] extractCommandTag 純函數 unit test（含 post-use.js export 修改）
- [x] Adapter 基類 unit test
- [x] dashboard/pid.js 整合測試
- [x] dashboard/sessions.js 整合測試
- [x] session/on-start.js hook 整合測試
- [x] tool/pre-task.js hook 完整流程整合測試
- [x] tool/post-use.js observeBashError 整合測試
- [x] EventBus 核心方法測試
- [x] 完整 workflow 生命週期 E2E 測試

## Dev Phases

### Phase 1: Unit Tests (parallel)
- [x] registry.js 資料完整性 unit test | files: tests/unit/registry.test.js
- [x] paths.js 路徑解析 unit test | files: tests/unit/paths.test.js
- [x] extractCommandTag 純函數 unit test | files: tests/unit/extract-command-tag.test.js, plugins/overtone/hooks/scripts/tool/post-use.js
- [x] Adapter 基類 unit test | files: tests/unit/adapter.test.js

### Phase 2: Integration Tests (parallel, depends: 1)
- [x] dashboard/pid.js 整合測試 | files: tests/integration/dashboard-pid.test.js
- [x] dashboard/sessions.js 整合測試 | files: tests/integration/dashboard-sessions.test.js
- [x] session/on-start.js hook 整合測試 | files: tests/integration/session-start.test.js
- [x] tool/pre-task.js hook 完整流程整合測試 | files: tests/integration/pre-task.test.js
- [x] tool/post-use.js observeBashError 整合測試 | files: tests/integration/post-use-bash.test.js
- [x] EventBus 核心方法測試 | files: tests/integration/event-bus.test.js

### Phase 3: E2E Test (sequential, depends: 2)
- [x] 完整 workflow 生命週期 E2E 測試 | files: tests/e2e/workflow-lifecycle.test.js
