---
feature: deep-pm-interview-engine
status: archived
workflow: standard
created: 2026-03-05T16:12:54.940Z
archivedAt: 2026-03-05T16:41:42.803Z
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

### Phase 1: 引擎核心 + 問題庫 (sequential)
- [ ] 建立 interview.js 引擎（init/nextQuestion/recordAnswer/isComplete/generateSpec/loadSession/saveSession + 靜態問題庫） | files: plugins/overtone/scripts/lib/interview.js

### Phase 2: 文件 + 升級 (parallel)
- [ ] 新增 interview-guide.md（PM agent 訪談指引） | files: plugins/overtone/skills/pm/references/interview-guide.md
- [ ] 升級 PM agent prompt（新增多輪訪談模式章節） | files: plugins/overtone/agents/product-manager.md
- [ ] 更新 PM SKILL.md（新增 interview-guide.md reference 索引項目） | files: plugins/overtone/skills/pm/SKILL.md

### Phase 3: 測試 (parallel, depends: 1)
- [ ] 撰寫 interview.js 單元測試 | files: tests/unit/interview.test.js
- [ ] 撰寫 PM 訪談整合測試 | files: tests/integration/pm-interview-integration.test.js
