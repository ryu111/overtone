---
feature: core-simplification-guards
status: archived
workflow: standard
created: 2026-03-03T23:27:56.156Z
archivedAt: 2026-03-04T00:12:25.391Z
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

### A 組：並行提示修復
- [ ] A1: on-stop.js continueMessage 改用 getNextStageHint()
- [ ] A2: pre-compact.js 目前階段顯示改用 getNextStageHint()

### B 組：Status Line 簡化
- [ ] B1: 移除 active-agent.json 寫入與清除邏輯（pre-task.js + agent/on-stop.js）
- [ ] B2: statusline.js 移除 readActiveAgent 和主信號分支
- [ ] B3: PreCompact 壓縮後清空 activeAgents

### C 組：State 不變量守衛
- [ ] C1: updateStateAtomic 加入不變量檢查（3 條規則）與自動修復
- [ ] C2: 違反不變量時 emit system:warning
- [ ] C3: 移除 3 處 TTL workaround（依賴 B3 + C1）

## Dev Phases

### Phase 1: A 組並行提示（parallel）
- [ ] A1: on-stop.js continueMessage 改用 getNextStageHint() | files: plugins/overtone/hooks/scripts/session/on-stop.js
- [ ] A2: pre-compact.js 目前階段顯示改用 getNextStageHint() | files: plugins/overtone/hooks/scripts/session/pre-compact.js

### Phase 2: B+C 組依序（sequential）
- [ ] B1: 移除 active-agent.json 寫入/刪除（pre-task.js + agent/on-stop.js） | files: plugins/overtone/hooks/scripts/tool/pre-task.js, plugins/overtone/hooks/scripts/agent/on-stop.js
- [ ] B2: statusline.js 移除主信號分支 + TTL workaround | files: plugins/overtone/scripts/statusline.js
- [ ] B3: PreCompact 壓縮後清空 activeAgents | files: plugins/overtone/hooks/scripts/session/pre-compact.js
- [ ] C1: updateStateAtomic 不變量守衛（3 條規則自動修復） | files: plugins/overtone/scripts/lib/state.js
- [ ] C2: 違反不變量時 emit system:warning | files: plugins/overtone/scripts/lib/state.js
- [ ] C3: 移除 3 處 TTL workaround | files: plugins/overtone/scripts/lib/state.js, plugins/overtone/hooks/scripts/session/pre-compact.js

### Phase 2（並行）: 測試更新
- [ ] 更新 tests/unit/statusline.test.js（隨 B2 執行） | files: tests/unit/statusline.test.js
- [ ] 更新 tests/integration/on-stop-stale-cleanup.test.js（隨 B1+C3 執行） | files: tests/integration/on-stop-stale-cleanup.test.js
