---
feature: test-architecture
status: in-progress
workflow: standard
created: 2026-02-26T22:55:21.380Z
---

## Tasks

- [ ] proposal（需求分析）
- [x] architecture（架構設計）
- [ ] bdd（行為規格）
- [ ] dev（實作）
- [ ] review + test:verify（審查 + 驗證）
- [ ] docs（文件同步）

## Dev Phases

### Phase 1: 基礎建設 (sequential)
- [ ] 建立 tests/helpers/paths.js 路徑 helper | files: tests/helpers/paths.js
- [ ] 建立 bunfig.toml 測試配置 | files: bunfig.toml
- [ ] 建立 docs/reference/testing-guide.md 測試指南 | files: docs/reference/testing-guide.md
- [ ] 建立 plugins/overtone/skills/test/references/testing-conventions.md 測試慣例 | files: plugins/overtone/skills/test/references/testing-conventions.md
- [ ] 建立 plugins/overtone/skills/auto/references/test-scope-dispatch.md 調度規範 | files: plugins/overtone/skills/auto/references/test-scope-dispatch.md

### Phase 2: 測試遷移 (parallel)
- [ ] 遷移 2 個 unit 測試（identify-agent + parse-result）+ 修正 require 路徑 | files: tests/unit/identify-agent.test.js, tests/unit/parse-result.test.js
- [ ] 遷移 11 個 integration 測試 + 修正 require 路徑 | files: tests/integration/utils.test.js, tests/integration/state.test.js, tests/integration/loop.test.js, tests/integration/instinct.test.js, tests/integration/timeline.test.js, tests/integration/specs.test.js, tests/integration/wording.test.js, tests/integration/session-stop.test.js, tests/integration/on-submit.test.js, tests/integration/agent-on-stop.test.js, tests/integration/server.test.js

### Phase 3: 配置 + Prompt 更新 (parallel)
- [ ] 更新 plugins/overtone/package.json test 指令 + 建立 tests/e2e/.gitkeep + 刪除 plugins/overtone/tests/ 舊目錄 | files: plugins/overtone/package.json, tests/e2e/.gitkeep
- [ ] 修改 4 個 Agent Prompts（developer/tester/e2e-runner/qa）加入 Test Scope 和路徑慣例 | files: plugins/overtone/agents/developer.md, plugins/overtone/agents/tester.md, plugins/overtone/agents/e2e-runner.md, plugins/overtone/agents/qa.md
- [ ] 修改 3 個 Skills（auto/test/e2e）加入 Test Scope 調度和路徑說明 | files: plugins/overtone/skills/auto/SKILL.md, plugins/overtone/skills/test/SKILL.md, plugins/overtone/skills/e2e/SKILL.md

### Phase 4: 文件同步 (sequential)
- [ ] 更新 CLAUDE.md 目錄結構和測試指令 + docs/status.md 版本狀態 | files: CLAUDE.md, docs/status.md
