---
feature: p3-3-system
status: archived
workflow: standard
created: 2026-03-03T17:22:53.086Z
archivedAt: 2026-03-03T18:42:16.360Z
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

### Phase 1: 核心腳本

- [ ] 實作 process.js（listProcesses/startProcess/killProcess） | files: `plugins/overtone/scripts/os/process.js`, `tests/unit/process.test.js`
- [ ] 實作 clipboard.js（readClipboard/writeClipboard） | files: `plugins/overtone/scripts/os/clipboard.js`, `tests/unit/clipboard.test.js`
- [ ] 實作 system-info.js（getCpuUsage/getMemoryInfo/getDiskInfo/getNetworkInfo） | files: `plugins/overtone/scripts/os/system-info.js`, `tests/unit/system-info.test.js`
- [ ] 實作 notification.js（sendNotification） | files: `plugins/overtone/scripts/os/notification.js`, `tests/unit/notification.test.js`
- [ ] 實作 fswatch.js（watchPath/stopWatch/listWatchers） | files: `plugins/overtone/scripts/os/fswatch.js`, `tests/unit/fswatch.test.js`

### Phase 2: 知識整合

- [ ] 建立 system.md reference（依賴 Phase 1 完成） | files: `plugins/overtone/skills/os-control/references/system.md`
- [ ] 更新 SKILL.md 索引（P3.3 → P3.3 ✅） | files: `plugins/overtone/skills/os-control/SKILL.md`

### Phase 3: Should 範圍

- [ ] pre-bash-guard.js 擴充（新增危險命令規則） | files: `plugins/overtone/hooks/scripts/tool/pre-bash-guard.js`
- [ ] health-check 擴充（新增第 8 項工具可用性偵測） | files: `plugins/overtone/scripts/health-check.js`
