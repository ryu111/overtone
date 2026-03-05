---
feature: skill-forge-engine
status: archived
workflow: standard
created: 2026-03-05T16:47:59.761Z
archivedAt: 2026-03-05T17:02:38.873Z
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

### Phase 1: 基礎準備（parallel）
- [ ] 補齊 DOMAIN_KEYWORDS 的 3 個 domain（os-control、autonomous-control、craft） | files: plugins/overtone/scripts/lib/knowledge/knowledge-gap-detector.js
- [ ] 建立 skill-forge.js 引擎核心（forgeSkill API + 知識萃取 + SKILL.md 組裝 + 驗證） | files: plugins/overtone/scripts/lib/skill-forge.js

### Phase 2: CLI 整合（sequential，依賴 Phase 1 的 skill-forge.js）
- [ ] evolution.js 新增 forge 子命令（printUsage + VALID_FORGE_DOMAINS + 解析邏輯） | files: plugins/overtone/scripts/evolution.js

### Phase 3: 測試（parallel，依賴 Phase 1 + 2）
- [ ] 建立 skill-forge.js 單元測試（dry-run / conflict / paused / 格式 / execute mock） | files: tests/unit/skill-forge.test.js
- [ ] 建立 evolution-forge.test.js 整合測試（dry-run / 缺參數 / 衝突 / JSON 輸出） | files: tests/integration/evolution-forge.test.js
