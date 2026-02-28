---
feature: precompact-hook
status: archived
workflow: standard
created: 2026-02-28T12:00:00.000Z
archivedAt: 2026-02-28T06:54:42.766Z
---
## Tasks

- [ ] PLAN
- [ ] ARCH
- [ ] TEST
- [ ] DEV
- [ ] REVIEW
- [ ] TEST
- [ ] RETRO
- [ ] DOCS

## Dev Phases

### Phase 1: 基礎建設 (sequential)
- [ ] registry.js 新增 session:compact 事件 + 更新事件計數註解 | files: plugins/overtone/scripts/lib/registry.js
- [ ] hook-utils.js 新增 buildPendingTasksMessage 共用函式 | files: plugins/overtone/scripts/lib/hook-utils.js

### Phase 2: Hook 實作與整合 (parallel)
- [ ] 建立 pre-compact.js hook 腳本 | files: plugins/overtone/hooks/scripts/session/pre-compact.js
- [ ] on-start.js 改用 buildPendingTasksMessage 共用函式 | files: plugins/overtone/hooks/scripts/session/on-start.js

### Phase 3: 配置與文件 (parallel)
- [ ] hooks.json 新增 PreCompact 配置 | files: plugins/overtone/hooks/hooks.json
- [ ] plugin.json 版本 bump 0.17.7 → 0.18.0 | files: plugins/overtone/.claude-plugin/plugin.json
- [ ] docs/spec/overtone-架構.md 更新 Hook 清單 | files: docs/spec/overtone-架構.md
