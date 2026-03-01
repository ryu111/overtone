---
feature: testing-knowledge-domain
workflow: standard
status: in-progress
created: 2026-03-02
---

# testing-knowledge-domain

建立 `testing` knowledge domain skill，合併 4 處散布的 BDD/testing 知識。

## Stages

- [x] PLAN
- [x] ARCH
- [ ] TEST:spec
- [ ] DEV
- [ ] REVIEW
- [ ] TEST:verify
- [ ] RETRO
- [ ] DOCS

## Tasks

- [ ] 建立 `skills/testing/` 目錄結構（SKILL.md + references/ + examples/）
- [ ] 搬移 5 個 reference 檔案到 `testing/references/`
- [ ] 搬移 1 個 example 檔案到 `testing/examples/`
- [ ] 更新 tester.md agent skills 欄位：ref-test-strategy -> testing
- [ ] 新增 qa.md agent skills 欄位：testing
- [ ] 更新 6 個 SKILL.md 的引用路徑（auto, standard, full, secure, refactor, test）
- [ ] 刪除 `ref-test-strategy/` 目錄
- [ ] 刪除 `test/references/` 和 `test/examples/` 目錄
- [ ] 更新 platform-alignment-skills.test.js 測試

## Dev Phases

### Phase 1: 建立目錄 + 搬移檔案 (sequential)
- [ ] 建立 `skills/testing/` 結構並搬移所有 reference/example 檔案 + 寫入 SKILL.md | files: plugins/overtone/skills/testing/SKILL.md, plugins/overtone/skills/testing/references/bdd-spec-guide.md, plugins/overtone/skills/testing/references/test-scope-dispatch.md, plugins/overtone/skills/testing/references/bdd-methodology.md, plugins/overtone/skills/testing/references/testing-conventions.md, plugins/overtone/skills/testing/references/test-strategy.md, plugins/overtone/skills/testing/examples/bdd-spec-samples.md

### Phase 2: 更新引用路徑 + agent 設定 + 刪除舊檔 (parallel)
- [ ] 更新 auto/SKILL.md + standard/SKILL.md + full/SKILL.md + secure/SKILL.md + refactor/SKILL.md 的 bdd-spec-guide 和 test-scope-dispatch 引用路徑 | files: plugins/overtone/skills/auto/SKILL.md, plugins/overtone/skills/standard/SKILL.md, plugins/overtone/skills/full/SKILL.md, plugins/overtone/skills/secure/SKILL.md, plugins/overtone/skills/refactor/SKILL.md
- [ ] 更新 test/SKILL.md 引用路徑 + tester.md skills 欄位 + qa.md skills 欄位 + 刪除舊目錄 | files: plugins/overtone/skills/test/SKILL.md, plugins/overtone/agents/tester.md, plugins/overtone/agents/qa.md, plugins/overtone/skills/ref-test-strategy/SKILL.md, plugins/overtone/skills/test/references/bdd-methodology.md, plugins/overtone/skills/test/references/testing-conventions.md, plugins/overtone/skills/test/examples/bdd-spec-samples.md

### Phase 3: 更新測試 (sequential, depends: 2)
- [ ] 更新 platform-alignment-skills.test.js：新增 testing skill 驗證 + 更新 ref-test-strategy 斷言 | files: tests/unit/platform-alignment-skills.test.js
