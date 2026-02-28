---
workflow: standard
status: archived
created: 2026-02-28
archivedAt: 2026-02-28T01:57:25.241Z
---
# Tasks: dashboard-duplicate-spawn-fix

## Stages

- [ ] PLAN
- [ ] ARCH
- [ ] TEST
- [ ] DEV
- [ ] REVIEW
- [ ] TEST
- [ ] RETRO
- [ ] DOCS

## Dev Phases

### Phase 1: 核心防護 (parallel)
- [ ] pid.js: 新增 probePort() 函式 + isRunning() 增加 port probe fallback（opts.port 參數） | files: plugins/overtone/scripts/lib/dashboard/pid.js
- [ ] server.js: Bun.serve() try-catch + EADDRINUSE graceful exit（process.exit(0)） | files: plugins/overtone/scripts/server.js
- [ ] on-start.js: 增加 OVERTONE_NO_DASHBOARD early return + 移除自動開瀏覽器 + 移除 OVERTONE_NO_BROWSER + isRunning() 傳入 port | files: plugins/overtone/hooks/scripts/session/on-start.js

### Phase 2: 測試更新 (parallel)
- [ ] 擴充 dashboard-pid.test.js: probePort() 單元場景 + isRunning() port probe fallback 場景 | files: tests/integration/dashboard-pid.test.js
- [ ] 擴充 session-start.test.js: OVERTONE_NO_DASHBOARD 跳過 spawn 場景 + 移除 OVERTONE_NO_BROWSER 殘留 | files: tests/integration/session-start.test.js
- [ ] 清理 hook-runner.js: 移除 OVERTONE_NO_BROWSER 環境變數設定 | files: tests/helpers/hook-runner.js
