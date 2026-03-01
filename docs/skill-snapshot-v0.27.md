# Skill 功能快照 — v0.27.2 基線

> 收集時間：2026-03-02 | 用途：正規化重構前的功能對比基線
> 重構後必須逐項確認功能完整性，避免功能流失

---

## 概覽統計

| 分類 | 數量 | 說明 |
|------|:----:|------|
| Orchestrator | 1 | auto（核心選擇器） |
| Workflow Pipeline | 8 | standard, full, quick, secure, tdd, debug, refactor, pm |
| Stage Shortcut | 14 | plan, architect, design, dev, diagnose, doc-sync, e2e, plan, qa, review, security, test, build-fix, clean, db-review |
| Reference Skill | 3 | ref-commit-convention, ref-pr-review-checklist, ref-test-strategy |
| Utility | 11 | audit, dashboard, evolve, issue, mul-dev, onboard, pr, remote, specs, status, stop, verify |
| **總計** | **38** | |

---

## 1. Orchestrator（1 個）

### auto
- **Frontmatter**: `name: auto`, `argument-hint: "[需求描述]"`
- **references/**:
  - `examples/workflow-selection.md`
  - `references/bdd-spec-guide.md`
  - `references/completion-signals.md`
  - `references/failure-handling.md`
  - `references/handoff-protocol.md`
  - `references/parallel-groups.md`
  - `references/test-scope-dispatch.md`
- **💡 引用**: 7 處（bdd-spec-guide, completion-signals, failure-handling, handoff-protocol, parallel-groups, test-scope-dispatch, workflow-selection）
- **消費者**: Main Agent（UserPromptSubmit hook 注入 systemMessage 觸發）
- **功能**: 分析使用者需求 → 選擇 workflow → 委派 agent。包含 18 個 workflow 選擇表、16 個 stage agent 清單、並行規則、BDD 規則、失敗處理、完成條件。115 行。

---

## 2. Workflow Pipeline（8 個）

### standard
- **Frontmatter**: `name: standard`, `disable-model-invocation: true`
- **references/**: 無
- **💡 引用**: 1（failure-handling.md via auto/references/）
- **功能**: PLAN → ARCH → TEST:spec → DEV → [REVIEW + TEST:verify] → RETRO → DOCS

### full
- **Frontmatter**: `name: full`, `disable-model-invocation: true`
- **references/**: 無
- **💡 引用**: 1（failure-handling.md via auto/references/）
- **功能**: PLAN → ARCH → DESIGN → TEST:spec → DEV → [R+T] → [QA+E2E] → RETRO → DOCS

### quick
- **Frontmatter**: `name: quick`, `disable-model-invocation: true`
- **references/**: 無
- **💡 引用**: 1（failure-handling.md via auto/references/）
- **功能**: DEV → [REVIEW + TEST:verify] → RETRO → DOCS

### secure
- **Frontmatter**: `name: secure`, `disable-model-invocation: true`
- **references/**: 無
- **💡 引用**: 1（failure-handling.md via auto/references/）
- **功能**: PLAN → ARCH → TEST:spec → DEV → [REVIEW + TEST + SECURITY] → RETRO → DOCS

### tdd
- **Frontmatter**: `name: tdd`, `disable-model-invocation: true`
- **references/**: 無
- **💡 引用**: 1（failure-handling.md via auto/references/）
- **功能**: TEST:spec → DEV → TEST:verify

### debug
- **Frontmatter**: `name: debug`, `disable-model-invocation: true`
- **references/**: 無
- **💡 引用**: 1（failure-handling.md via auto/references/）
- **功能**: DEBUG → DEV → TEST

### refactor
- **Frontmatter**: `name: refactor`, `disable-model-invocation: true`
- **references/**: 無
- **💡 引用**: 2（bdd-spec-guide.md, failure-handling.md via auto/references/）
- **功能**: ARCH → TEST:spec → DEV → [REVIEW + TEST:verify]

### pm
- **Frontmatter**: `name: pm`, `disable-model-invocation: true`, `argument-hint: "[產品需求]"`
- **references/**:
  - `references/discovery-frameworks.md`
  - `references/options-template.md`
  - `references/anti-patterns.md`
  - `references/product-brief-template.md`
  - `references/drift-detection.md`
- **💡 引用**: 0（references/ 路徑直接寫在 SKILL.md 中）
- **消費者**: product-manager agent
- **功能**: PM stage 四階段（Discovery → Definition → Options → Decision）+ workflow 導流（discovery/product/product-full）。PM 預設 pass（advisory 角色）。

---

## 3. Stage Shortcut（14 個）

### plan
- **Frontmatter**: `name: plan`, `disable-model-invocation: true`
- **references/**: 無
- **功能**: 初始化 workflow → 委派 planner agent

### architect
- **Frontmatter**: `name: architect`, `disable-model-invocation: true`
- **references/**: 無
- **功能**: 初始化 workflow → 委派 architect agent

### design
- **Frontmatter**: `name: design`, `allowed-tools: Read, Grep, Glob, AskUserQuestion, Task`, `argument-hint: "[設計需求]"`
- **references/**: 無
- **特殊**: AskUserQuestion 三維度設計偏好（視覺風格/動畫程度/資訊密度），結果傳入 designer agent prompt
- **功能**: 互動確認偏好 → 初始化 workflow → 委派 designer agent

### dev
- **Frontmatter**: `name: dev`, `disable-model-invocation: true`
- **references/**: 無
- **功能**: 初始化 workflow → 委派 developer agent

### diagnose
- **Frontmatter**: `name: diagnose`, `disable-model-invocation: true`
- **references/**: 無
- **功能**: 初始化 workflow → 委派 debugger agent（唯讀診斷，不修碼）

### doc-sync
- **Frontmatter**: `name: doc-sync`, `disable-model-invocation: true`
- **references/**: 無
- **功能**: 初始化 workflow → 委派 doc-updater agent

### e2e
- **Frontmatter**: `name: e2e`, `disable-model-invocation: true`
- **references/**: 無
- **功能**: 初始化 workflow → 委派 e2e-runner agent

### qa
- **Frontmatter**: `name: qa`, `disable-model-invocation: true`
- **references/**: 無
- **功能**: 初始化 workflow → 委派 qa agent

### review
- **Frontmatter**: `name: review`, `disable-model-invocation: true`
- **references/**: 無
- **功能**: 初始化 workflow → 委派 code-reviewer agent

### security
- **Frontmatter**: `name: security`, `disable-model-invocation: true`
- **references/**:
  - `references/owasp-top10-checklist.md`
  - `examples/security-report.md`
- **功能**: 初始化 workflow → 委派 security-reviewer agent

### test
- **Frontmatter**: `name: test`, `disable-model-invocation: true`
- **references/**:
  - `references/bdd-methodology.md`
  - `references/testing-conventions.md`
  - `examples/bdd-spec-samples.md`
- **功能**: 初始化 workflow → 委派 tester agent（spec 或 verify 模式）

### build-fix
- **Frontmatter**: `name: build-fix`, `disable-model-invocation: true`
- **references/**: 無
- **功能**: 初始化 workflow → 委派 build-error-resolver agent

### clean
- **Frontmatter**: `name: clean`, `disable-model-invocation: true`
- **references/**:
  - `references/dead-code-tools-guide.md`
- **功能**: 初始化 workflow → 委派 refactor-cleaner agent

### db-review
- **Frontmatter**: `name: db-review`, `disable-model-invocation: true`
- **references/**:
  - `references/database-review-checklist.md`
  - `examples/db-review-report.md`
- **功能**: 初始化 workflow → 委派 database-reviewer agent

---

## 4. Reference Skill（3 個）

### ref-commit-convention
- **Frontmatter**: `name: ref-commit-convention`, `disable-model-invocation: true`, `user-invocable: false`
- **消費者**: developer（`skills` frontmatter 引用）
- **功能**: Conventional commit 標準 — type 分類、atomic commit 原則、拆分標準（5 項檢查）、message 格式

### ref-pr-review-checklist
- **Frontmatter**: `name: ref-pr-review-checklist`, `disable-model-invocation: true`, `user-invocable: false`
- **消費者**: code-reviewer（`skills` frontmatter 引用）
- **功能**: PR 審查四維度 — Code Quality / Security / Performance / Observability、回饋分級 Critical/Major/Minor/Nitpick

### ref-test-strategy
- **Frontmatter**: `name: ref-test-strategy`, `disable-model-invocation: true`, `user-invocable: false`
- **消費者**: tester（`skills` frontmatter 引用）
- **功能**: 測試策略五階段 — Assess → Run → Improve → Validate → Report、覆蓋率分析、flaky test 偵測

---

## 5. Utility（11 個）

### audit
- **Frontmatter**: `name: audit`
- **references/**: 無
- **功能**: 執行 health-check.js（6 項偵測：phantom-events, dead-exports, doc-code-drift, unused-paths, duplicate-logic, platform-drift）

### dashboard
- **Frontmatter**: `name: dashboard`, `disable-model-invocation: true`
- **references/**: 無
- **功能**: 開啟 Dashboard 監控面板（port 7777）

### evolve
- **Frontmatter**: `name: evolve`
- **references/**:
  - `references/confidence-scoring.md`
- **功能**: 分析 Instinct observations，摘要知識狀態，建議進化（Instinct → Skill/Agent）

### issue
- **Frontmatter**: `name: issue`, `argument-hint: "[GitHub Issue URL 或 #number]"`
- **references/**:
  - `references/label-workflow-map.md`
- **功能**: 讀取 GitHub Issue → label → workflow 選擇 → feature branch → init workflow

### mul-dev
- **Frontmatter**: `name: mul-dev`, `disable-model-invocation: true`
- **references/**: 無
- **功能**: DEV 並行調度。Mode A（tasks.md Dev Phases）或 Mode B（Main Agent 分析）。一個子任務 → 退化為單一 developer。

### onboard
- **Frontmatter**: `name: onboard`
- **references/**:
  - `references/claudemd-skeleton.md`
- **功能**: 掃描專案結構 → 產生 CLAUDE.md 骨架。建立模式（完整）或補充模式（缺失區塊）。

### pr
- **Frontmatter**: `name: pr`
- **references/**:
  - `references/pr-body-template.md`
- **功能**: 收集 git 變更 + workflow 狀態 → 組裝結構化 PR description → `gh pr create`

### remote
- **Frontmatter**: `name: remote`, `disable-model-invocation: true`
- **references/**: 無
- **功能**: Remote 控制設定（Dashboard SSE + Telegram Bot）

### specs
- **Frontmatter**: `name: specs`, `disable-model-invocation: true`
- **references/**:
  - `examples/tasks-sample.md`（注意：在 examples/ 不是 references/）
- **功能**: Specs 系統 CRUD — 建立/暫停/恢復/歸檔/列表 feature

### status
- **Frontmatter**: `name: status`, `disable-model-invocation: true`
- **references/**: 無
- **功能**: 系統狀態快照 — 版本、元件統計、session 進度、測試結果、specs 狀態

### stop
- **Frontmatter**: `name: stop`, `disable-model-invocation: true`
- **references/**: 無
- **功能**: 停止 Loop（標記 loop.json 停止）

### verify
- **Frontmatter**: `name: verify`, `disable-model-invocation: true`
- **references/**:
  - `references/language-commands.md`
- **功能**: 6 階段統一驗證 — Build → Types → Lint → Tests → Security → Diff

---

## 6. Agent ↔ Skill 消費關係

| Agent | skills 欄位 | 載入知識 |
|-------|-----------|---------|
| developer | ref-commit-convention | Conventional commit 標準 |
| code-reviewer | ref-pr-review-checklist | PR 審查四維度 |
| tester | ref-test-strategy | 測試策略五階段 |
| 其餘 14 個 agent | （無） | — |

---

## 7. References 完整清單（22 個檔案）

### auto/references/（6 個）
| 檔案 | 被引用次數 | 引用者 |
|------|:---------:|-------|
| failure-handling.md | 8 | auto + 7 個 workflow skill |
| bdd-spec-guide.md | 5 | auto + standard + full + secure + refactor |
| parallel-groups.md | 1 | auto |
| handoff-protocol.md | 1 | auto |
| test-scope-dispatch.md | 1 | auto |
| completion-signals.md | 1 | auto |

### auto/examples/（1 個）
| 檔案 | 說明 |
|------|------|
| workflow-selection.md | 邊界情況範例 |

### pm/references/（5 個）
| 檔案 | 說明 |
|------|------|
| discovery-frameworks.md | 五層追問法 |
| options-template.md | 方案比較模板 |
| anti-patterns.md | 反模式指南 |
| product-brief-template.md | Product Brief 範本 |
| drift-detection.md | 目標偏移偵測 |

### test/references/（2 個）+ examples/（1 個）
| 檔案 | 說明 |
|------|------|
| bdd-methodology.md | BDD 方法論 |
| testing-conventions.md | 測試慣例 |
| bdd-spec-samples.md | BDD spec 範例（examples/） |

### security/references/（1 個）+ examples/（1 個）
| 檔案 | 說明 |
|------|------|
| owasp-top10-checklist.md | OWASP Top 10 檢查清單 |
| security-report.md | 安全報告範例（examples/） |

### 其他 skill references/（7 個）
| Skill | 檔案 | 說明 |
|-------|------|------|
| clean | dead-code-tools-guide.md | knip/depcheck 工具指南 |
| db-review | database-review-checklist.md | DB 審查清單 |
| verify | language-commands.md | 各語言驗證命令 |
| evolve | confidence-scoring.md | 信心分數計算 |
| issue | label-workflow-map.md | Label → workflow 映射 |
| onboard | claudemd-skeleton.md | CLAUDE.md 骨架模板 |
| pr | pr-body-template.md | PR body 模板 |

---

## 8. 特殊功能記錄

### design skill 互動流程
1. AskUserQuestion 確認三維度偏好（視覺風格/動畫程度/資訊密度）
2. 偏好結果寫入 designer agent prompt
3. 使用 `allowed-tools` 限制可用工具

### mul-dev 並行模式
- Mode A: 有 specs → 讀 tasks.md `## Dev Phases` → 按 Phase 分批
- Mode B: 無 specs → Main Agent 分析依賴 → 自行編排並行
- 單一子任務 → 退化為單一 developer

### verify 6 階段驗證
1. Build（`bun build`/`npm run build`）
2. Types（`tsc --noEmit`/`bun check`）
3. Lint（`eslint`/`biome`）
4. Tests（`bun test`/`npm test`）
5. Security（`npm audit`/`bun audit`）
6. Diff（`git diff --stat`）

### pm 三種 workflow
- discovery: 純 PM（產品探索）
- product: PM → standard pipeline
- product-full: PM → full pipeline

---

> **基線用途**：此快照記錄重構前 38 個 skill 的完整功能。每次迭代完成後，對照此文件確認：
> 1. 所有 reference 檔案是否可訪問
> 2. Agent skills 欄位載入是否正確
> 3. Workflow 行為是否一致
> 4. 使用者可呼叫的命令是否完整
> 5. 特殊功能（design 互動、mul-dev 並行、verify 驗證）是否保留
