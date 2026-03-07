---
feature: global-migrate-batch-replace
status: archived
workflow: standard
created: 2026-03-07T06:12:49.691Z
archivedAt: 2026-03-07T06:26:13.647Z
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

### Phase 1：更新 JS 程式碼路徑解析 (parallel)
- [ ] 更新 dependency-graph.js `scanSkillReferences` 支援三種路徑格式（舊 `${CLAUDE_PLUGIN_ROOT}` + 新相對路徑） | files: plugins/overtone/scripts/lib/dependency-graph.js
- [ ] 更新 post-use-handler.js fallback 路徑為 `os.homedir() + '/.claude'` | files: plugins/overtone/scripts/lib/post-use-handler.js
- [ ] 更新 hook-diagnostic.js 路徑解析邏輯 | files: plugins/overtone/scripts/lib/analyzers/hook-diagnostic.js
- [ ] 更新 skill-forge.js SKILL.md 範本改為生成相對路徑 `./references/` 格式 | files: plugins/overtone/scripts/lib/skill-forge.js

### Phase 2：批量替換 SKILL.md（類別 A、B、C）(parallel)
- [ ] 替換 26 個 SKILL.md 中的同 skill references 引用（類別 A）：`${CLAUDE_PLUGIN_ROOT}/skills/{self}/references/` → `./references/` | files: plugins/overtone/skills/*/SKILL.md
- [ ] 替換跨 skill 引用（類別 B，約 7 處）：`${CLAUDE_PLUGIN_ROOT}/skills/{other}/references/` → `../{other}/references/` | files: plugins/overtone/skills/architecture/SKILL.md, plugins/overtone/skills/code-review/SKILL.md, plugins/overtone/skills/auto/SKILL.md, plugins/overtone/skills/craft/SKILL.md
- [ ] 替換 SKILL.md 腳本呼叫（類別 C）：`node/bun ${CLAUDE_PLUGIN_ROOT}/scripts/` → `bun ~/.claude/scripts/` | files: plugins/overtone/skills/specs/SKILL.md, plugins/overtone/skills/pm/SKILL.md, plugins/overtone/skills/issue/SKILL.md, plugins/overtone/skills/auto/SKILL.md

### Phase 3：批量替換 Command .md（類別 D、E）(parallel)
- [ ] 替換 14 個 command .md 中的腳本呼叫（類別 D）和 skill reference 引用（類別 E） | files: plugins/overtone/commands/standard.md, plugins/overtone/commands/quick.md, plugins/overtone/commands/secure.md, plugins/overtone/commands/full.md, plugins/overtone/commands/refactor.md, plugins/overtone/commands/tdd.md, plugins/overtone/commands/debug.md, plugins/overtone/commands/dev.md, plugins/overtone/commands/review.md, plugins/overtone/commands/stop.md, plugins/overtone/commands/e2e.md, plugins/overtone/commands/build-fix.md, plugins/overtone/commands/db-review.md, plugins/overtone/commands/security.md

### Phase 4：更新 claude-dev references 文件（類別 F）(parallel)
- [ ] 更新 hooks-api.md 範例路徑 | files: plugins/overtone/skills/claude-dev/references/hooks-api.md
- [ ] 更新 command-api.md 範例路徑 | files: plugins/overtone/skills/claude-dev/references/command-api.md
- [ ] 更新 skill-api.md 範例路徑 | files: plugins/overtone/skills/claude-dev/references/skill-api.md
- [ ] 更新 overtone-conventions.md 範例路徑 | files: plugins/overtone/skills/claude-dev/references/overtone-conventions.md
- [ ] 更新 settings-api.md 範例路徑 | files: plugins/overtone/skills/claude-dev/references/settings-api.md
