---
feature: security-integration
status: archived
workflow: standard
created: 2026-03-05T11:20:19.389Z
archivedAt: 2026-03-05T11:50:24.308Z
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

### Phase 1: Guard 精鍊（sequential）
- [ ] 新增 5 條黑名單規則（14 → 19 條）+ 更新頂部說明 | files: plugins/overtone/hooks/scripts/tool/pre-bash-guard.js
- [ ] 更新 guard 整合測試（5 個新 deny + 3 個 allow 防誤殺）| files: tests/integration/pre-bash-guard.test.js

### Phase 2: health-check 擴展 + SKILL.md 更新（parallel）
- [ ] 擴展 checkOsTools：加 screencapture 偵測 + heartbeat daemon 狀態偵測 | files: plugins/overtone/scripts/health-check.js
- [ ] 更新 os-control SKILL.md：control.md 改為 P3.4 (待建)、realtime.md 改為 P3.5 ✅ | files: plugins/overtone/skills/os-control/SKILL.md（透過 manage-component.js）

### Phase 3: 測試補充（parallel）
- [ ] 新增 health-check 測試：screencapture 偵測 + heartbeat finding 格式驗證 | files: tests/integration/health-check.test.js
- [ ] 新建 OS 腳本整合測試（7 個 smoke test，macOS only）| files: tests/integration/os-scripts.test.js
