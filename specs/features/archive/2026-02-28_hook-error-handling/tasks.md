---
feature: hook-error-handling
status: archived
workflow: standard
archivedAt: 2026-02-28T06:34:55.892Z
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
- [ ] 建立 hook-utils.js 模組（safeReadStdin + safeRun + hookError） | files: plugins/overtone/scripts/lib/hook-utils.js

### Phase 2: Hook 重構 (parallel)
- [ ] 重構 on-start.js — 引入 safeReadStdin + safeRun | files: plugins/overtone/hooks/scripts/session/on-start.js
- [ ] 重構 on-submit.js — 引入 safeReadStdin + safeRun | files: plugins/overtone/hooks/scripts/prompt/on-submit.js
- [ ] 重構 pre-task.js — 引入 safeReadStdin + safeRun | files: plugins/overtone/hooks/scripts/tool/pre-task.js
- [ ] 重構 on-stop.js (SubagentStop) — 引入 safeReadStdin + safeRun | files: plugins/overtone/hooks/scripts/agent/on-stop.js
- [ ] 重構 post-use.js — 同步化 + 引入 safeReadStdin + safeRun | files: plugins/overtone/hooks/scripts/tool/post-use.js
- [ ] 重構 on-stop.js (Stop) — 引入 safeReadStdin + safeRun | files: plugins/overtone/hooks/scripts/session/on-stop.js
