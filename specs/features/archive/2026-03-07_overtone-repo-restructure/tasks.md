---
feature: overtone-repo-restructure
status: archived
workflow: standard
created: 2026-03-07T08:25:13.386Z
archivedAt: 2026-03-07T08:44:22.684Z
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

### Phase 1: 前置準備 (sequential)
- [ ] 建立 `~/.claude/plugin.json`（含 name + version，從 plugins/overtone/.claude-plugin/plugin.json 複製版本號） | files: `~/.claude/plugin.json`

### Phase 2: 測試路徑修正 + 文件更新 (parallel)
- [ ] 修正類別一測試路徑（docs-sync.test.js、pre-compact-handler.test.js、impact-cli.test.js、websocket.test.js、timeline-js.test.js、confetti-js.test.js、pipeline.test.js） | files: `tests/unit/docs-sync.test.js`, `tests/unit/pre-compact-handler.test.js`, `tests/unit/impact-cli.test.js`, `tests/unit/websocket.test.js`, `tests/unit/timeline-js.test.js`, `tests/unit/confetti-js.test.js`, `tests/unit/pipeline.test.js`
- [ ] 修正類別二測試路徑（7 個 OS 模組測試）+ 類別三字串更新（session-spawner、session-start-handler、dead-code-guard、statusline-state、pre-bash-guard） | files: `tests/unit/clipboard.test.js`, `tests/unit/screenshot.test.js`, `tests/unit/fswatch.test.js`, `tests/unit/system-info.test.js`, `tests/unit/window.test.js`, `tests/unit/notification.test.js`, `tests/unit/process.test.js`, `tests/unit/session-spawner.test.js`, `tests/unit/session-start-handler.test.js`, `tests/unit/dead-code-guard.test.js`, `tests/unit/statusline-state.test.js`, `tests/integration/os-scripts.test.js`, `tests/integration/pre-bash-guard.test.js`
- [ ] 更新 CLAUDE.md + docs/ 文件路徑引用 | files: `CLAUDE.md`, `docs/spec/overtone-decision-points.md`, `docs/spec/overtone-evolution-engine.md`, `docs/reference/testing-guide.md`, `docs/reference/performance-baselines.md`, `specs/README.md`, `README.md`

### Phase 3: 刪除副本 (sequential)
- [ ] 刪除 `plugins/overtone/` 整個目錄，再刪除 `plugins/` 空目錄 | files: `plugins/`
