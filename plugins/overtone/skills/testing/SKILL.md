---
name: testing
description: 測試知識領域。BDD 方法論、測試策略、測試慣例、scope 調度規則。供 tester 和 qa agent 消費。
disable-model-invocation: true
user-invocable: false
---

# Testing 知識領域

測試相關知識的集中索引。tester 和 qa agent 按需讀取對應的 reference。

## 消費者

| Agent | 用途 |
|-------|------|
| tester | BDD spec 撰寫（spec 模式）+ 測試執行（verify 模式）+ 測試策略 |
| qa | 行為驗證的 BDD 標準 |

## Reference 索引

| # | 檔案 | 用途 | 讀取時機 |
|---|------|------|---------|
| 1 | references/bdd-spec-guide.md | GIVEN/WHEN/THEN 語法 + 安全 BDD + tag 系統 | spec 模式撰寫規格時 |
| 2 | references/test-scope-dispatch.md | DEV 後動態決定委派哪些測試 agent | workflow 選擇器調度時 |
| 3 | references/bdd-methodology.md | BDD 方法論（Scenario Outline、Data Table、tag 分類） | spec 模式深入設計時 |
| 4 | references/testing-conventions.md | 測試目錄結構、paths.js 用法、spec/verify 操作流程 | verify 模式執行時 |
| 5 | references/test-strategy.md | 五階段測試流程（Assess→Run→Improve→Validate→Report） | verify 模式規劃策略時 |
| 6 | examples/bdd-spec-samples.md | BDD spec 範例 | spec 模式參考範例時 |

## 按需讀取

💡 BDD 語法與最佳實踐：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/testing/references/bdd-spec-guide.md`

💡 Test Scope 動態調度規則：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/testing/references/test-scope-dispatch.md`

💡 BDD 完整方法論：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/testing/references/bdd-methodology.md`

💡 測試操作規範與慣例：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/testing/references/testing-conventions.md`

💡 五階段測試策略：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/testing/references/test-strategy.md`

💡 BDD spec 完整範例：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/testing/examples/bdd-spec-samples.md`
