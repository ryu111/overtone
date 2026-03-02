# BDD Spec: 迭代 2 — Knowledge Domain Chain + E2E Workflow 補強

## 背景

迭代 2 需建立 6 個測試檔案：
1. `tests/unit/knowledge-domain-chain.test.js` — 驗證 7 個 knowledge domain 的 agent → skill → reference 三層鏈路完整性
2. `tests/e2e/tdd-workflow.test.js` — TDD workflow 狀態機（3 stage, sequential）
3. `tests/e2e/debug-workflow.test.js` — Debug workflow 狀態機（3 stage, sequential）
4. `tests/e2e/refactor-workflow.test.js` — Refactor workflow 狀態機（5 stage + quality 並行組）
5. `tests/e2e/full-workflow.test.js` — Full workflow 狀態機（11 stage + 兩層並行組）
6. `tests/e2e/secure-workflow.test.js` — Secure workflow 狀態機（9 stage + 三成員並行組）

---

# Feature A: Knowledge Domain 三層鏈路完整性

7 個 knowledge domain（testing, code-review, commit-convention, security-kb, database, dead-code, workflow-core）的 agent → skill → reference 鏈路必須無斷鏈。

## Scenario A1: 全部 7 個 SKILL.md 的 frontmatter 包含 disable-model-invocation: true
GIVEN 7 個 knowledge domain skill 目錄已建立
WHEN 依序讀取各 domain 的 `plugins/overtone/skills/{domain}/SKILL.md` frontmatter
THEN 每個 SKILL.md 的 `disable-model-invocation` 欄位均為 `true`
AND 不允許任何一個 domain 缺少此欄位或值為 `false`

## Scenario A2: 全部 7 個 SKILL.md 的 frontmatter 包含 user-invocable: false
GIVEN 7 個 knowledge domain skill 目錄已建立
WHEN 依序讀取各 domain 的 `plugins/overtone/skills/{domain}/SKILL.md` frontmatter
THEN 每個 SKILL.md 的 `user-invocable` 欄位均為 `false`
AND 不允許任何一個 domain 缺少此欄位或值為 `true`

## Scenario A3: 每個 SKILL.md 的 name 欄位與 domain 名稱一致
GIVEN 7 個 knowledge domain skill 已建立
WHEN 讀取各 domain 的 SKILL.md frontmatter
THEN testing/SKILL.md 的 name 為 `testing`
AND code-review/SKILL.md 的 name 為 `code-review`
AND commit-convention/SKILL.md 的 name 為 `commit-convention`
AND security-kb/SKILL.md 的 name 為 `security-kb`
AND database/SKILL.md 的 name 為 `database`
AND dead-code/SKILL.md 的 name 為 `dead-code`
AND workflow-core/SKILL.md 的 name 為 `workflow-core`

---

# Feature B: Agent → Skill 連結正確性（Layer 1）

Agent 的 `skills` frontmatter 欄位必須指向存在的 knowledge domain SKILL.md。

## Scenario B1: tester agent 的 skills 欄位包含 testing
GIVEN tester.md agent 設定已完成
WHEN 解析 `plugins/overtone/agents/tester.md` 的 frontmatter
THEN `skills` 欄位包含 `testing`
AND `plugins/overtone/skills/testing/SKILL.md` 檔案存在於磁碟

## Scenario B2: qa agent 的 skills 欄位包含 testing
GIVEN qa.md agent 設定已完成
WHEN 解析 `plugins/overtone/agents/qa.md` 的 frontmatter
THEN `skills` 欄位包含 `testing`
AND `plugins/overtone/skills/testing/SKILL.md` 檔案存在於磁碟

## Scenario B3: developer agent 的 skills 欄位包含 commit-convention
GIVEN developer.md agent 設定已完成
WHEN 解析 `plugins/overtone/agents/developer.md` 的 frontmatter
THEN `skills` 欄位包含 `commit-convention`
AND `plugins/overtone/skills/commit-convention/SKILL.md` 檔案存在於磁碟

## Scenario B4: code-reviewer agent 的 skills 欄位包含 code-review
GIVEN code-reviewer.md agent 設定已完成
WHEN 解析 `plugins/overtone/agents/code-reviewer.md` 的 frontmatter
THEN `skills` 欄位包含 `code-review`
AND `plugins/overtone/skills/code-review/SKILL.md` 檔案存在於磁碟

## Scenario B5: database-reviewer agent 的 skills 欄位包含 database
GIVEN database-reviewer.md agent 設定已完成
WHEN 解析 `plugins/overtone/agents/database-reviewer.md` 的 frontmatter
THEN `skills` 欄位包含 `database`
AND `plugins/overtone/skills/database/SKILL.md` 檔案存在於磁碟

## Scenario B6: refactor-cleaner agent 的 skills 欄位包含 dead-code
GIVEN refactor-cleaner.md agent 設定已完成
WHEN 解析 `plugins/overtone/agents/refactor-cleaner.md` 的 frontmatter
THEN `skills` 欄位包含 `dead-code`
AND `plugins/overtone/skills/dead-code/SKILL.md` 檔案存在於磁碟

## Scenario B7: security-reviewer agent 的 skills 欄位包含 security-kb
GIVEN security-reviewer.md agent 設定已完成
WHEN 解析 `plugins/overtone/agents/security-reviewer.md` 的 frontmatter
THEN `skills` 欄位包含 `security-kb`
AND `plugins/overtone/skills/security-kb/SKILL.md` 檔案存在於磁碟

## Scenario B8: workflow-core 無直接 agent consumer（由 auto skill 引用）
GIVEN workflow-core skill 已建立
WHEN 遍歷所有 17 個 agent 的 frontmatter
THEN 無任何 agent 的 `skills` 欄位包含 `workflow-core`
AND `plugins/overtone/skills/workflow-core/SKILL.md` 仍存在於磁碟

---

# Feature C: Skill → Reference 鏈路完整性（Layer 2 → Layer 3）

每個 knowledge domain SKILL.md 引用的 reference 和 example 檔案必須存在於磁碟。

## Scenario C1: testing domain 的所有 reference 檔案存在
GIVEN testing knowledge domain 已建立
WHEN 列出 `plugins/overtone/skills/testing/references/` 目錄
THEN 存在 `bdd-spec-guide.md`
AND 存在 `test-scope-dispatch.md`
AND 存在 `bdd-methodology.md`
AND 存在 `testing-conventions.md`
AND 存在 `test-strategy.md`

## Scenario C2: testing domain 的 example 檔案存在
GIVEN testing knowledge domain 已建立
WHEN 列出 `plugins/overtone/skills/testing/examples/` 目錄
THEN 存在 `bdd-spec-samples.md`

## Scenario C3: code-review domain 的所有 reference 檔案存在
GIVEN code-review knowledge domain 已建立
WHEN 列出 `plugins/overtone/skills/code-review/references/` 目錄
THEN 存在 `pr-review-checklist.md`

## Scenario C4: commit-convention domain 的所有 reference 檔案存在
GIVEN commit-convention knowledge domain 已建立
WHEN 列出 `plugins/overtone/skills/commit-convention/references/` 目錄
THEN 存在 `commit-convention.md`

## Scenario C5: security-kb domain 的所有 reference 和 example 檔案存在
GIVEN security-kb knowledge domain 已建立
WHEN 列出 `plugins/overtone/skills/security-kb/references/` 目錄
THEN 存在 `owasp-top10-checklist.md`
WHEN 列出 `plugins/overtone/skills/security-kb/examples/` 目錄
THEN 存在 `security-report.md`

## Scenario C6: database domain 的所有 reference 和 example 檔案存在
GIVEN database knowledge domain 已建立
WHEN 列出 `plugins/overtone/skills/database/references/` 目錄
THEN 存在 `database-review-checklist.md`
WHEN 列出 `plugins/overtone/skills/database/examples/` 目錄
THEN 存在 `db-review-report.md`

## Scenario C7: dead-code domain 的所有 reference 檔案存在
GIVEN dead-code knowledge domain 已建立
WHEN 列出 `plugins/overtone/skills/dead-code/references/` 目錄
THEN 存在 `dead-code-tools-guide.md`

## Scenario C8: workflow-core domain 的所有 reference 檔案存在
GIVEN workflow-core knowledge domain 已建立
WHEN 列出 `plugins/overtone/skills/workflow-core/references/` 目錄
THEN 存在 `completion-signals.md`
AND 存在 `failure-handling.md`
AND 存在 `handoff-protocol.md`
AND 存在 `parallel-groups.md`

---

# Feature D: 引用路徑閉環（Chain 完整性）

所有 knowledge domain SKILL.md 至少被一個 agent 消費（或為已知的無 agent consumer 例外）。

## Scenario D1: 有 agent consumer 的 6 個 domain 各有至少一個 agent 引用
GIVEN 7 個 knowledge domain 中 workflow-core 為已知例外（無直接 agent consumer）
WHEN 遍歷所有 agent frontmatter 統計 skills 引用
THEN testing 被至少 1 個 agent 引用（tester 或 qa）
AND commit-convention 被至少 1 個 agent 引用（developer）
AND code-review 被至少 1 個 agent 引用（code-reviewer）
AND security-kb 被至少 1 個 agent 引用（security-reviewer）
AND database 被至少 1 個 agent 引用（database-reviewer）
AND dead-code 被至少 1 個 agent 引用（refactor-cleaner）

## Scenario D2: 所有 reference 和 example 檔案內容非空
GIVEN 所有 knowledge domain 目錄已建立
WHEN 讀取所有 references/ 和 examples/ 下的 .md 檔案
THEN 每個檔案的位元組大小大於 0
AND 每個檔案可被讀取（不拋出異常）

---

# Feature E: TDD Workflow 狀態機

TDD workflow 定義：stages = ['TEST', 'DEV', 'TEST']，parallelGroups = []。
初始化後 stageKeys = ['TEST', 'DEV', 'TEST:2']（共 3 個）。

## Scenario E1: 初始化 tdd workflow 建立正確的 stage 結構
GIVEN 一個新的 session ID
WHEN 執行 init-workflow tdd
THEN 回傳 exit code 為 0
AND workflow state 包含 stageKeys ['TEST', 'DEV', 'TEST:2']（共 3 個）
AND TEST.mode 為 'spec'（DEV 前的 TEST）
AND TEST:2.mode 為 'verify'（DEV 後的 TEST）
AND 所有 stage 初始狀態為 'pending'

## Scenario E2: TDD 第一段 TEST(spec) 完成後推進至 DEV
GIVEN tdd workflow 已初始化
WHEN 委派 tester 執行 TEST(spec) 階段
AND tester 回報 VERDICT: pass
THEN TEST.status 為 'completed'
AND DEV.status 推進為 'active' 或 session 準備接受 DEV 委派

## Scenario E3: DEV 完成後推進至 TEST:2(verify)
GIVEN TEST(spec) 已完成，DEV 已被委派
WHEN developer 回報 VERDICT: pass
THEN DEV.status 為 'completed'
AND TEST:2 成為下一個待執行的 stage

## Scenario E4: 完整 sequential 路徑 TEST(spec) -> DEV -> TEST:2(verify) 全部完成
GIVEN tdd workflow 已初始化
WHEN 依序完成 TEST(spec)（tester）、DEV（developer）、TEST:2(verify)（tester）
THEN TEST.status 為 'completed'
AND DEV.status 為 'completed'
AND TEST:2.status 為 'completed'
AND 所有 3 個 stage 均為 'completed'

---

# Feature F: Debug Workflow 狀態機

Debug workflow 定義：stages = ['DEBUG', 'DEV', 'TEST']，parallelGroups = []。
初始化後 stageKeys = ['DEBUG', 'DEV', 'TEST']（共 3 個）。

## Scenario F1: 初始化 debug workflow 建立正確的 stage 結構
GIVEN 一個新的 session ID
WHEN 執行 init-workflow debug
THEN 回傳 exit code 為 0
AND workflow state 包含 stageKeys ['DEBUG', 'DEV', 'TEST']（共 3 個）
AND TEST.mode 為 'verify'（DEV 之後的唯一 TEST，無 PLAN/ARCH 前置）
AND 所有 stage 初始狀態為 'pending'

## Scenario F2: DEBUG 完成後推進至 DEV
GIVEN debug workflow 已初始化
WHEN 委派 debugger 執行 DEBUG 階段
AND debugger 回報 VERDICT: pass
THEN DEBUG.status 為 'completed'
AND DEV 成為下一個待執行的 stage

## Scenario F3: DEV 完成後推進至 TEST(verify)
GIVEN DEBUG 已完成，DEV 已被委派
WHEN developer 回報 VERDICT: pass
THEN DEV.status 為 'completed'
AND TEST 成為下一個待執行的 stage

## Scenario F4: 完整 sequential 路徑 DEBUG -> DEV -> TEST(verify) 全部完成
GIVEN debug workflow 已初始化
WHEN 依序完成 DEBUG（debugger）、DEV（developer）、TEST(verify)（tester）
THEN DEBUG.status 為 'completed'
AND DEV.status 為 'completed'
AND TEST.status 為 'completed'
AND 所有 3 個 stage 均為 'completed'

---

# Feature G: Refactor Workflow 狀態機

Refactor workflow 定義：stages = ['ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST']，parallelGroups = ['quality']。
quality 並行組 = ['REVIEW', 'TEST']。
初始化後 stageKeys = ['ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST:2']（共 5 個）。

## Scenario G1: 初始化 refactor workflow 建立正確的 stage 結構
GIVEN 一個新的 session ID
WHEN 執行 init-workflow refactor
THEN 回傳 exit code 為 0
AND workflow state 包含 stageKeys ['ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST:2']（共 5 個）
AND TEST.mode 為 'spec'（DEV 前的 TEST）
AND TEST:2.mode 為 'verify'（DEV 後的 TEST）
AND 所有 stage 初始狀態為 'pending'

## Scenario G2: 前半 sequential ARCH -> TEST(spec) -> DEV 依序完成
GIVEN refactor workflow 已初始化
WHEN 依序完成 ARCH（architect）、TEST(spec)（tester）、DEV（developer）
THEN ARCH.status 為 'completed'
AND TEST.status 為 'completed'
AND DEV.status 為 'completed'
AND currentStage 推進至 REVIEW

## Scenario G3: DEV 完成後 REVIEW 和 TEST:2 同時進入 active 狀態（quality 並行組）
GIVEN ARCH、TEST(spec)、DEV 均已完成
WHEN 委派 code-reviewer 執行 REVIEW
AND 委派 tester 執行 TEST:2(verify)
THEN REVIEW.status 為 'active'
AND TEST:2.status 為 'active'

## Scenario G4: quality 並行組第一個完成時不觸發整體收斂
GIVEN REVIEW 和 TEST:2 均為 active
WHEN 只完成 REVIEW（code-reviewer 回報 VERDICT: pass）
THEN REVIEW.status 為 'completed'
AND TEST:2.status 仍為 'active'（尚未收斂）
AND workflow 尚未完成

## Scenario G5: quality 並行組全部完成後所有 5 個 stage 均為 completed
GIVEN REVIEW 已完成，TEST:2 為 active
WHEN 完成 TEST:2（tester 回報 VERDICT: pass）
THEN TEST:2.status 為 'completed'
AND 所有 5 個 stage（ARCH, TEST, DEV, REVIEW, TEST:2）均為 'completed'

---

# Feature H: Full Workflow 狀態機

Full workflow 定義：stages = ['PLAN', 'ARCH', 'DESIGN', 'TEST', 'DEV', 'REVIEW', 'TEST', 'QA', 'E2E', 'RETRO', 'DOCS']，parallelGroups = ['quality', 'verify']。
quality 並行組 = ['REVIEW', 'TEST']，verify 並行組 = ['QA', 'E2E']。
初始化後 stageKeys = ['PLAN', 'ARCH', 'DESIGN', 'TEST', 'DEV', 'REVIEW', 'TEST:2', 'QA', 'E2E', 'RETRO', 'DOCS']（共 11 個）。

## Scenario H1: 初始化 full workflow 建立正確的 11 個 stage
GIVEN 一個新的 session ID
WHEN 執行 init-workflow full
THEN 回傳 exit code 為 0
AND workflow state 包含 11 個 stageKey
AND stageKeys 依序為 PLAN, ARCH, DESIGN, TEST, DEV, REVIEW, TEST:2, QA, E2E, RETRO, DOCS
AND TEST.mode 為 'spec'（DEV 前的 TEST）
AND TEST:2.mode 為 'verify'（DEV 後的 TEST）
AND 所有 stage 初始狀態為 'pending'

## Scenario H2: 前半 sequential PLAN -> ARCH -> DESIGN -> TEST(spec) -> DEV 依序完成
GIVEN full workflow 已初始化
WHEN 依序完成 PLAN（planner）、ARCH（architect）、DESIGN（designer）、TEST(spec)（tester）、DEV（developer）
THEN 5 個 stage 均為 'completed'
AND currentStage 推進至 REVIEW

## Scenario H3: quality 並行組 REVIEW + TEST:2 同時進入 active 狀態
GIVEN 前半 5 個 stage 均已完成
WHEN 委派 code-reviewer 執行 REVIEW
AND 委派 tester 執行 TEST:2(verify)
THEN REVIEW.status 為 'active'
AND TEST:2.status 為 'active'

## Scenario H4: quality 並行組第一個完成時不觸發收斂
GIVEN REVIEW 和 TEST:2 均為 active
WHEN 只完成 REVIEW（code-reviewer 回報 VERDICT: pass）
THEN REVIEW.status 為 'completed'
AND TEST:2.status 仍為 'active'
AND QA 尚未被推進（仍為 pending）

## Scenario H5: quality 並行組全部完成後收斂並推進至 verify 並行組
GIVEN REVIEW 已完成，TEST:2 為 active
WHEN 完成 TEST:2（tester 回報 VERDICT: pass）
THEN TEST:2.status 為 'completed'
AND currentStage 推進至 QA（verify 並行組啟動）

## Scenario H6: verify 並行組 QA + E2E 同時進入 active 狀態
GIVEN quality 並行組已收斂
WHEN 委派 qa 執行 QA
AND 委派 e2e-runner 執行 E2E
THEN QA.status 為 'active'
AND E2E.status 為 'active'

## Scenario H7: verify 並行組第一個完成時不觸發收斂
GIVEN QA 和 E2E 均為 active
WHEN 只完成 QA（qa 回報 VERDICT: pass）
THEN QA.status 為 'completed'
AND E2E.status 仍為 'active'
AND RETRO 尚未被推進（仍為 pending）

## Scenario H8: verify 並行組全部完成後收斂並推進至 RETRO
GIVEN QA 已完成，E2E 為 active
WHEN 完成 E2E（e2e-runner 回報 VERDICT: pass）
THEN E2E.status 為 'completed'
AND currentStage 推進至 RETRO

## Scenario H9: 後半 sequential RETRO -> DOCS 完成後所有 11 個 stage 均為 completed
GIVEN verify 並行組已收斂
WHEN 依序完成 RETRO（retrospective）和 DOCS（doc-updater）
THEN RETRO.status 為 'completed'
AND DOCS.status 為 'completed'
AND 所有 11 個 stage 均為 'completed'

---

# Feature I: Secure Workflow 狀態機

Secure workflow 定義：stages = ['PLAN', 'ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST', 'SECURITY', 'RETRO', 'DOCS']，parallelGroups = ['secure-quality']。
secure-quality 並行組 = ['REVIEW', 'TEST', 'SECURITY']（三成員）。
初始化後 stageKeys = ['PLAN', 'ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST:2', 'SECURITY', 'RETRO', 'DOCS']（共 9 個）。

## Scenario I1: 初始化 secure workflow 建立正確的 9 個 stage
GIVEN 一個新的 session ID
WHEN 執行 init-workflow secure
THEN 回傳 exit code 為 0
AND workflow state 包含 9 個 stageKey
AND stageKeys 依序為 PLAN, ARCH, TEST, DEV, REVIEW, TEST:2, SECURITY, RETRO, DOCS
AND TEST.mode 為 'spec'（DEV 前的 TEST）
AND TEST:2.mode 為 'verify'（DEV 後的 TEST）
AND 所有 stage 初始狀態為 'pending'

## Scenario I2: 前半 sequential PLAN -> ARCH -> TEST(spec) -> DEV 依序完成
GIVEN secure workflow 已初始化
WHEN 依序完成 PLAN（planner）、ARCH（architect）、TEST(spec)（tester）、DEV（developer）
THEN 4 個 stage 均為 'completed'
AND currentStage 推進至 REVIEW

## Scenario I3: secure-quality 並行組三成員同時進入 active 狀態
GIVEN 前半 4 個 stage 均已完成
WHEN 委派 code-reviewer 執行 REVIEW
AND 委派 tester 執行 TEST:2(verify)
AND 委派 security-reviewer 執行 SECURITY
THEN REVIEW.status 為 'active'
AND TEST:2.status 為 'active'
AND SECURITY.status 為 'active'

## Scenario I4: secure-quality 並行組第一個成員完成時不觸發收斂
GIVEN REVIEW、TEST:2、SECURITY 均為 active
WHEN 只完成 REVIEW（code-reviewer 回報 VERDICT: pass）
THEN REVIEW.status 為 'completed'
AND TEST:2.status 仍為 'active'
AND SECURITY.status 仍為 'active'
AND RETRO 尚未被推進（仍為 pending）

## Scenario I5: secure-quality 並行組第二個成員完成時仍不觸發收斂
GIVEN REVIEW 已完成，TEST:2 和 SECURITY 仍為 active
WHEN 完成 TEST:2（tester 回報 VERDICT: pass）
THEN TEST:2.status 為 'completed'
AND SECURITY.status 仍為 'active'
AND RETRO 尚未被推進（仍為 pending）

## Scenario I6: secure-quality 並行組三成員全部完成後收斂並推進至 RETRO
GIVEN REVIEW 和 TEST:2 已完成，SECURITY 為 active
WHEN 完成 SECURITY（security-reviewer 回報 VERDICT: pass）
THEN SECURITY.status 為 'completed'
AND currentStage 推進至 RETRO

## Scenario I7: 後半 sequential RETRO -> DOCS 完成後所有 9 個 stage 均為 completed
GIVEN secure-quality 並行組已收斂
WHEN 依序完成 RETRO（retrospective）和 DOCS（doc-updater）
THEN RETRO.status 為 'completed'
AND DOCS.status 為 'completed'
AND 所有 9 個 stage 均為 'completed'
