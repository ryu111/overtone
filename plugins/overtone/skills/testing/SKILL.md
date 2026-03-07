---
name: testing
description: 測試知識領域。BDD 方法論、測試策略、測試慣例、並行測試隔離、scope 調度規則、效能優化。供 tester 和 qa agent 消費。
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
| developer | （依賴圖自動偵測新增） |

## Reference 索引

| # | 檔案 | 用途 | 讀取時機 |
|---|------|------|--------|
| 1 | references/bdd-spec-guide.md | GIVEN/WHEN/THEN 語法 + 安全 BDD + tag 系統 | spec 模式撰寫規格時 |
| 2 | references/test-scope-dispatch.md | DEV 後動態決定委派哪些測試 agent | workflow 選擇器調度時 |
| 3 | references/bdd-methodology.md | BDD 方法論（Scenario Outline、Data Table、tag 分類） | spec 模式深入設計時 |
| 4 | references/testing-conventions.md | 測試目錄結構、paths.js 用法、spec/verify 操作流程、並行測試隔離 | verify 模式執行時 |
| 5 | references/test-strategy.md | 五階段測試流程（Assess→Run→Improve→Validate→Report） | verify 模式規劃策略時 |
| 6 | examples/bdd-spec-samples.md | BDD spec 範例 | spec 模式參考範例時 |
| 7 | references/test-anti-patterns.md | 7 種測試反模式 + 壞例/好例/判斷準則 | verify 模式撰寫測試時 / code review 時 |
| 8 | references/e2e-patterns.md | E2E 測試核心模式（POM、Locator 策略、Anti-Flakiness） | E2E 測試設計時 |
| 9 | references/concurrency-testing-guide.md | 並發測試策略（CAS 壓力測試、競爭條件驗證、JSONL 並發寫入） | 並發功能測試設計時 |
| 10 | references/task-splitting-guide.md | 任務拆分決策指南（DEV 階段並行拆分評估） | 並行開發任務拆分時 |
| 11 | references/test-performance-guide.md | 測試效能優化（lazy cache、shared fixture、spawn reduction、量測方法） | verify 模式撰寫測試時 / 優化現有測試時 |

## 按需讀取

💡 BDD 語法與最佳實踐：讀取 `./references/bdd-spec-guide.md`

💡 Test Scope 動態調度規則：讀取 `./references/test-scope-dispatch.md`

💡 BDD 完整方法論：讀取 `./references/bdd-methodology.md`

💡 測試操作規範與慣例：讀取 `./references/testing-conventions.md`

💡 五階段測試策略：讀取 `./references/test-strategy.md`

💡 BDD spec 完整範例：讀取 `./examples/bdd-spec-samples.md`

💡 測試反模式（避免低品質/重複測試）：讀取 `./references/test-anti-patterns.md`

💡 E2E 測試模式（POM、Fixtures、Locator 策略）：讀取 `./references/e2e-patterns.md`

💡 並發測試策略（CAS 壓力、競爭條件）：讀取 `./references/concurrency-testing-guide.md`

💡 任務拆分決策（DEV 並行評估）：讀取 `./references/task-splitting-guide.md`

💡 測試效能優化（lazy cache、shared fixture、重量級 I/O）：讀取 `./references/test-performance-guide.md`