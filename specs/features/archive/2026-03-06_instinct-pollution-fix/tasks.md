---
feature: instinct-pollution-fix
status: archived
workflow: standard
created: 2026-03-06T10:21:53.179Z
archivedAt: 2026-03-06T10:33:11.934Z
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

### Dev Phases

**Phase 1：分析污染條目**（sequential）
- [ ] 掃描全部 15 個 auto-discovered.md，找出含 `projects/md-blog/`、`projects/kuji/` 路徑的外部污染條目，輸出保留清單 | files: `plugins/overtone/skills/*/references/auto-discovered.md`

**Phase 2：實作來源過濾 + 清理污染**（parallel）
- [ ] 在 `knowledge-archiver.js` 的 fragment 迴圈加入 `_isExternalFragment` 過濾邏輯（外部知識 → instinct gap-observation，skipped++，不路由），加入 `_deps` 注入，回傳加 `skipped` 欄位 | files: `plugins/overtone/scripts/lib/knowledge/knowledge-archiver.js`
- [ ] 移除 `auto-discovered.md` 中的外部專案污染條目（md-blog PM Findings + planner PLAN Findings 兩個區塊） | files: `plugins/overtone/skills/claude-dev/references/auto-discovered.md`

**Phase 3：測試擴展**（sequential，依賴 Phase 2）
- [ ] 新增 3 個 scenarios：Scenario A（外部路徑 → archived=0,skipped=1）、Scenario B（Overtone 路徑 → archived>0 回歸）、Scenario C（外部路徑+sessionId → mock instinct.emit 被呼叫） | files: `tests/unit/knowledge-archiver.test.js`
- [ ] 執行 `bun scripts/test-parallel.js` 確認全部測試通過
