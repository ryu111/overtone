---
feature: hook-humble-object
status: archived
workflow: refactor
created: 2026-03-04T07:59:46.651Z
archivedAt: 2026-03-04T08:36:52.896Z
---
## Stages

- [x] ARCH
- [x] TEST
- [x] DEV
- [x] REVIEW

## Tasks

## Dev Phases

### Phase 1: 加入 require.main 守衛（sequential）

- [x] 為 10 個缺守衛的 hook 加入 `if (require.main === module)` 守衛和 `module.exports` 骨架 | files: plugins/overtone/hooks/scripts/session/on-start.js, plugins/overtone/hooks/scripts/session/on-stop.js, plugins/overtone/hooks/scripts/session/pre-compact.js, plugins/overtone/hooks/scripts/session/on-session-end.js, plugins/overtone/hooks/scripts/prompt/on-submit.js, plugins/overtone/hooks/scripts/tool/pre-task.js, plugins/overtone/hooks/scripts/tool/pre-edit-guard.js, plugins/overtone/hooks/scripts/tool/pre-bash-guard.js, plugins/overtone/hooks/scripts/task/on-task-completed.js, plugins/overtone/hooks/scripts/notification/on-notification.js

### Phase 2: 抽離純函數並匯出（parallel）

- [x] session hooks 純函數匯出：buildBanner/buildStartOutput（on-start）、buildCompletionSummary/calcDuration/buildContinueMessage（on-stop）、buildCompactMessage（pre-compact） | files: plugins/overtone/hooks/scripts/session/on-start.js, plugins/overtone/hooks/scripts/session/on-stop.js, plugins/overtone/hooks/scripts/session/pre-compact.js
- [x] guard + prompt hooks 純函數匯出：checkDangerousCommand（pre-bash-guard）、checkProtected/checkMemoryLineLimit（pre-edit-guard）、buildSystemMessage（on-submit）、checkSkippedStages（pre-task）、shouldPlaySound（on-notification） | files: plugins/overtone/hooks/scripts/tool/pre-bash-guard.js, plugins/overtone/hooks/scripts/tool/pre-edit-guard.js, plugins/overtone/hooks/scripts/prompt/on-submit.js, plugins/overtone/hooks/scripts/tool/pre-task.js, plugins/overtone/hooks/scripts/notification/on-notification.js

### Phase 3: 新增純函數單元測試（sequential）

- [x] 新增 tests/unit/hook-pure-fns.test.js 並遷移現有整合測試的業務邏輯斷言到純函數直接測試 | files: tests/unit/hook-pure-fns.test.js, tests/integration/session-start.test.js, tests/integration/pre-compact.test.js, tests/integration/on-submit.test.js, tests/integration/pre-task.test.js
