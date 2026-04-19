# GitHub 自動化 — 任務追蹤

## 深度路由：D4
planner → 3 executor (並行) → reviewer

## 子任務依賴分析

```
Phase 0（sequential）: 環境預檢（Main 直接做）
Phase 1（parallel）:   executor-1(pr-auto-review) + executor-2(issue-triage) + executor-3(release-notes)
Phase 2（sequential）: Judge 品質閘門（依賴 Phase 1 全部完成）
Phase 3（sequential）: 部署 + Agent 注入（依賴 Phase 2 全部通過）
Phase 4（sequential）: Acid Test 端到端（依賴 Phase 3）
Phase 5（sequential）: 真實驗證（依賴 Phase 4）
Phase 6（sequential）: Reviewer 審查（依賴 Phase 5）
```

## Phase 0：環境預檢

- [ ] T0.1 `gh auth status` 確認認證有效
- [ ] T0.2 `bun ~/.claude/scripts/judge.js` 確認可執行
- [ ] T0.3 `bun ~/.claude/scripts/acid-test.js --help` 確認可執行

## Phase 1：Skill 建立（3 executor 並行）

### Executor-1：pr-auto-review
- [ ] T1.1 建立 `~/.claude/skills/pr-auto-review/` 目錄 + `references/`
- [ ] T1.2 撰寫 SKILL.md（frontmatter + 消費者 + 速查 + 深度參考 + NEVER + 跨領域參考）
- [ ] T1.3 撰寫 `references/review-flow.md`（gh CLI 驅動的 review 流程）
- [ ] T1.4 撰寫 `references/gh-commands.md`（PR 操作命令速查）

### Executor-2：issue-triage
- [ ] T1.5 建立 `~/.claude/skills/issue-triage/` 目錄 + `references/`
- [ ] T1.6 撰寫 SKILL.md（frontmatter + 消費者 + 速查 + 深度參考 + NEVER + 跨領域參考）
- [ ] T1.7 撰寫 `references/triage-decision-tree.md`（分類決策樹）
- [ ] T1.8 撰寫 `references/priority-matrix.md`（優先序矩陣）

### Executor-3：release-notes
- [ ] T1.9 建立 `~/.claude/skills/release-notes/` 目錄 + `references/`
- [ ] T1.10 撰寫 SKILL.md（frontmatter + 消費者 + 速查 + 深度參考 + NEVER + 跨領域參考）
- [ ] T1.11 撰寫 `references/changelog-format.md`（changelog 格式模板）
- [ ] T1.12 撰寫 `references/commit-classification.md`（commit 分類規則）

## Phase 2：Judge 品質閘門

- [ ] T2.1 `bun ~/.claude/scripts/judge.js score skill pr-auto-review` >= 80
- [ ] T2.2 `bun ~/.claude/scripts/judge.js score skill issue-triage` >= 80
- [ ] T2.3 `bun ~/.claude/scripts/judge.js score skill release-notes` >= 80
- [ ] T2.4 未達標者：improve → 重新評分（最多 3 輪）

## Phase 3：部署

- [ ] T3.1 `pr-auto-review` → code-reviewer agent skills
- [ ] T3.2 `issue-triage` → executor agent skills
- [ ] T3.3 `release-notes` → 適當 agent skills
- [ ] T3.4 `bun ~/.claude/scripts/tool-registry.js scan` 更新索引

## Phase 4：Acid Test

- [ ] T4.1 `bun ~/.claude/scripts/acid-test.js --mock` → 6 Phase 全部通過

## Phase 5：真實驗證

- [ ] T5.1 對真實 PR 產出結構化 review
- [ ] T5.2 對真實 Issue 產出分類結果
- [ ] T5.3 從 git log 產出 release notes

## Phase 6：Reviewer 審查

- [ ] T6.1 3 個 SKILL.md knowledge delta 充分性
- [ ] T6.2 跨領域引用正確、無 DRY 違規
- [ ] T6.3 agent frontmatter 更新正確

## 進度追蹤

| Phase | 狀態 | 日期 |
|:-----:|:----:|------|
| 0 | 待執行 | — |
| 1 | 待執行 | — |
| 2 | 待執行 | — |
| 3 | 待執行 | — |
| 4 | 待執行 | — |
| 5 | 待執行 | — |
| 6 | 待執行 | — |
