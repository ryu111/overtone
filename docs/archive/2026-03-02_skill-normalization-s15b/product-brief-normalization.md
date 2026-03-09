# Product Brief: Skill / Agent / Command 正規化

> 產出日期：2026-03-02 | PM Discovery 模式 | Workflow ID: 69e2c615

## 問題陳述

Overtone 目前有 **38 個 skill**，但其中混合了三種本質不同的概念：

| 類型 | 數量 | 本質 | 問題 |
|------|:----:|------|------|
| Stage Shortcut | 14 | 角色呼叫（委派 agent） | 不是知識，是 workflow 命令 |
| Workflow Pipeline | 8 | 工作流模板（stage 序列） | 不是知識，是 workflow 命令 |
| Reference Skill | 3 | 知識參考 | ✅ 正確，但獨立 skill 粒度太細 |
| Utility | 11 | 使用者快捷操作 | 部分是命令，部分含知識 |
| Orchestrator | 1 | 核心選擇器 | 混入了不屬於選擇器的領域知識 |
| Parallel Guide | 1 | 並行開發指引 | 將併入 workflow-core |

**核心矛盾**：Claude Code 官方定義 skill = 「knowledge/capability modifier」（知識＋能力修飾器），但 Overtone 的 skill 目錄中超過 60% 是「角色呼叫」或「workflow 命令」，不是知識。

### 違反的設計原則

1. **角色-能力混淆**：Stage Shortcut（如 `/dev`）實質是「呼叫 developer agent」，不是提供知識
2. **知識碎片化**：同類知識散布於不同 skill 和 agent prompt 中（BDD 知識出現在 auto/references/、test/references/、agent 內嵌）
3. **職責越界**：auto 選擇器兼任 workflow 知識庫（6 個 references/ 含 failure-handling、parallel-groups 等）
4. **粒度不一致**：ref-commit-convention 單獨一個 skill，但 OWASP checklist 藏在 security/references/ 裡

### 產業驗證

| 來源 | 觀點 |
|------|------|
| Google Multi-Agent Patterns | Agent = role + specialization，Skill = capability aligned with role |
| Anthropic Claude Code Docs | Skill = context modifier + permission modifier，Agent = specialized subprocess |
| InfoQ AI Agent 架構 | Role-capability separation 是 multi-agent 系統的基礎設計原則 |

---

## 現況分析

### 38 個 Skill 分類

#### Orchestrator（1 個）
| Skill | references/ | 💡 引用 | 說明 |
|-------|:-----------:|:-------:|------|
| auto | 6 + 1 examples | 7 | 核心選擇器 + workflow 知識庫（混合職責） |

#### Workflow Pipeline（8 個）
| Skill | references/ | 💡 引用 | 說明 |
|-------|:-----------:|:-------:|------|
| standard | 0 | 1 | PLAN→ARCH→T:spec→DEV→[R+T]→RETRO→DOCS |
| full | 0 | 1 | + DESIGN + [QA+E2E] |
| quick | 0 | 1 | DEV→[R+T]→RETRO→DOCS |
| secure | 0 | 1 | + SECURITY 並行 |
| tdd | 0 | 1 | TEST:spec→DEV→TEST:verify |
| debug | 0 | 1 | DEBUG→DEV→TEST |
| refactor | 0 | 1 | ARCH→T:spec→DEV→REVIEW→T:verify |
| pm | 5 | 0 | PM stage + pipeline 導流 |

#### Stage Shortcut（14 個）
| Skill | references/ | 特殊能力 | 說明 |
|-------|:-----------:|---------|------|
| architect | 0 | — | 委派 architect agent |
| build-fix | 0 | — | 委派 build-error-resolver agent |
| clean | 1 | — | 委派 refactor-cleaner agent |
| db-review | 1 | — | 委派 database-reviewer agent |
| design | 0 | allowed-tools, 互動流程 | 委派 designer agent（特殊） |
| dev | 0 | — | 委派 developer agent |
| diagnose | 0 | — | 委派 debugger agent |
| doc-sync | 0 | — | 委派 doc-updater agent |
| e2e | 0 | — | 委派 e2e-runner agent |
| plan | 0 | — | 委派 planner agent |
| qa | 0 | — | 委派 qa agent |
| review | 0 | — | 委派 code-reviewer agent |
| security | 1 | — | 委派 security-reviewer agent |
| test | 2 | — | 委派 tester agent |

#### Reference Skill（3 個）
| Skill | 消費者 agent | 說明 |
|-------|-------------|------|
| ref-commit-convention | developer | Atomic commit 標準 |
| ref-pr-review-checklist | code-reviewer | 結構化 PR 審查 |
| ref-test-strategy | tester | 五階段測試工作流 |

#### Utility（11 個）
| Skill | references/ | 使用者操作 | 說明 |
|-------|:-----------:|:---------:|------|
| audit | 0 | ✅ | 系統健康檢查 |
| dashboard | 0 | ✅ | 開啟 Dashboard |
| evolve | 1 | ✅ | Instinct 進化分析 |
| issue | 1 | ✅ | GitHub Issue → workflow |
| onboard | 1 | ✅ | 產生 CLAUDE.md 骨架 |
| pr | 1 | ✅ | workflow → GitHub PR |
| remote | 0 | ✅ | Remote 控制設定 |
| specs | 1 | ✅ | Specs 系統操作 |
| status | 0 | ✅ | 系統狀態快照 |
| stop | 0 | ✅ | 停止 Loop |
| verify | 1 | ✅ | 語言命令驗證 |

#### Parallel Guide（1 個）
| Skill | 說明 |
|-------|------|
| mul-dev | DEV 內部並行調度指引 |

### 知識分布熱點圖

```
auto/references/ (6 個)
├── failure-handling.md    ← 被 8 個 workflow skill 引用（最高頻）
├── bdd-spec-guide.md      ← 被 5 個 workflow skill 引用
├── parallel-groups.md     ← 被 auto 引用
├── handoff-protocol.md    ← 被 auto 引用
├── test-scope-dispatch.md ← 被 auto 引用
└── completion-signals.md  ← 被 auto 引用

pm/references/ (5 個)
├── discovery-frameworks.md
├── options-template.md
├── anti-patterns.md
├── product-brief-template.md
└── drift-detection.md

test/references/ (2 個)
├── bdd-methodology.md     ← 與 auto/bdd-spec-guide.md 主題重疊
└── testing-conventions.md

Agent 內嵌知識（未提取）
├── qa: 7 大類邊界條件（~30 行）
├── product-manager: RICE/MoSCoW/Kano 框架（~20 行）
├── database-reviewer: 6 種 false positive 場景（~15 行）
├── security-reviewer: 6 種 false positive 場景（~15 行）
├── designer: 色彩語義 + 設計模板（~25 行）
└── e2e-runner + qa: agent-browser CLI 共用知識（~20 行）
```

### 4 個核心問題

| # | 問題 | 影響 | 嚴重度 |
|---|------|------|:------:|
| P1 | 跨 agent 知識重複 | BDD 知識在 3 處、failure handling 在 8 處 | 中 |
| P2 | 高密度知識未提取 | qa/pm/db/security agent 內嵌專業知識無法共用 | 中 |
| P3 | BDD 參考散布 | auto/bdd-spec-guide + test/bdd-methodology + tester 內嵌 | 低 |
| P4 | Skill 分類模糊 | 38 skill 中 22 個不符合 skill = knowledge 定義 | 高 |

---

## 目標架構

### 設計原則

```
Agent = 角色（WHO）  — 定義身份、職責、行為規則
Skill = 知識（WHAT） — 提供領域知識、方法論、參考資料
Command = 動作（DO） — 使用者或 Main Agent 觸發的工作流捷徑
Hook = 守衛（HOW）   — 記錄、阻擋、提示（不變）
```

### 目標組件數量

| 組件 | 現況 | 目標 | 變化 |
|------|:----:|:----:|:----:|
| Skills | 38 | ~16 | -22（-58%） |
| Commands | 0 | ~27 | +27 |
| Agents | 17 | 17 | 不變 |
| Hooks | 11 | 11 | 不變 |

### Skills 目標（~16 個）

#### 1. Workflow Engine（1 個）
| Skill | 說明 | 變化 |
|-------|------|------|
| auto | 純工作流選擇器 + 所有 workflow 模板（references/） | 吸收 8 個 workflow skill 為 references/ |

auto 吸收方式：原 8 個 workflow skill（standard、full、quick、secure、tdd、debug、refactor、pm）的內容移入 `auto/references/` 作為 workflow 模板。auto/SKILL.md 選擇器指引不變，只更新 💡 引用路徑。

#### 2. Knowledge Domain Skills（10 個 — 全新）

| # | Skill 名稱 | 來源 | references/ 內容 | 消費者 Agent |
|---|-----------|------|-----------------|-------------|
| 1 | testing | auto/bdd-spec-guide + auto/test-scope-dispatch + test/refs + ref-test-strategy | bdd-spec-guide.md, test-scope-dispatch.md, bdd-methodology.md, testing-conventions.md, test-strategy.md | tester, qa |
| 2 | security | security/refs + security-reviewer 內嵌 | owasp-top10-checklist.md, false-positives.md | security-reviewer |
| 3 | database | db-review/refs + database-reviewer 內嵌 | database-review-checklist.md, false-positives.md | database-reviewer |
| 4 | code-review | ref-pr-review-checklist | pr-review-checklist.md | code-reviewer |
| 5 | commit | ref-commit-convention | commit-convention.md | developer |
| 6 | dead-code | clean/refs | dead-code-tools-guide.md | refactor-cleaner |
| 7 | browser-automation | qa + e2e-runner 內嵌 | agent-browser-guide.md | e2e-runner, qa |
| 8 | design-system | designer 內嵌 | color-semantics.md, design-templates.md | designer |
| 9 | workflow-core | auto/refs（非選擇器部分） | failure-handling.md, parallel-groups.md, handoff-protocol.md, completion-signals.md | （auto 引用） |
| 10 | pm-frameworks | pm/refs | discovery-frameworks.md, options-template.md, anti-patterns.md, product-brief-template.md, drift-detection.md | product-manager |

#### 3. Utility Skills（5 個 — 保留含知識的）

| Skill | references/ | 說明 |
|-------|:-----------:|------|
| evolve | 1 | Instinct 進化（含 confidence-scoring 知識） |
| issue | 1 | GitHub Issue 整合（含 label-workflow-map 知識） |
| onboard | 1 | 專案 onboard（含 claudemd-skeleton 模板） |
| pr | 1 | GitHub PR 整合（含 pr-body-template 模板） |
| specs | 1 | Specs 系統（含 feature-lifecycle 知識） |

不含知識的 utility（audit、dashboard、remote、status、stop、verify）→ 遷移為 commands/。

### Commands 目標（~27 個）

#### Workflow Commands（8 個）
| Command | 原 Skill | 說明 |
|---------|---------|------|
| standard | skills/standard/ | 讀取 auto/references/standard.md |
| full | skills/full/ | 讀取 auto/references/full.md |
| quick | skills/quick/ | 讀取 auto/references/quick.md |
| secure | skills/secure/ | 讀取 auto/references/secure.md |
| tdd | skills/tdd/ | 讀取 auto/references/tdd.md |
| debug | skills/debug/ | 讀取 auto/references/debug.md |
| refactor | skills/refactor/ | 讀取 auto/references/refactor.md |
| pm | skills/pm/ | PM stage + pipeline 導流 |

#### Stage Commands（14 個）
| Command | 原 Skill | 說明 |
|---------|---------|------|
| architect | skills/architect/ | init + 委派 architect agent |
| build-fix | skills/build-fix/ | init + 委派 build-error-resolver agent |
| clean | skills/clean/ | init + 委派 refactor-cleaner agent |
| db-review | skills/db-review/ | init + 委派 database-reviewer agent |
| design | skills/design/ | init + 委派 designer agent |
| dev | skills/dev/ | init + 委派 developer agent |
| diagnose | skills/diagnose/ | init + 委派 debugger agent |
| doc-sync | skills/doc-sync/ | init + 委派 doc-updater agent |
| e2e | skills/e2e/ | init + 委派 e2e-runner agent |
| plan | skills/plan/ | init + 委派 planner agent |
| qa | skills/qa/ | init + 委派 qa agent |
| review | skills/review/ | init + 委派 code-reviewer agent |
| security | skills/security/ | init + 委派 security-reviewer agent |
| test | skills/test/ | init + 委派 tester agent |

#### Utility Commands（5 個）
| Command | 原 Skill | 說明 |
|---------|---------|------|
| audit | skills/audit/ | 系統健康檢查 |
| dashboard | skills/dashboard/ | 開啟 Dashboard |
| remote | skills/remote/ | Remote 控制設定 |
| status | skills/status/ | 系統狀態快照 |
| stop | skills/stop/ | 停止 Loop |

> **保留為 skill 的 utility**：evolve、issue、onboard、pr、specs、verify — 因含知識性 references/。

### Hook 影響分析

**結論：11 個 hook 全部不受影響。**

| 檢查項 | 結果 | 原因 |
|--------|:----:|------|
| Hook 依賴 skill 路徑？ | ❌ | Hook 依賴 workflow.json + registry.js |
| Hook 依賴 skill 名稱？ | ❌ | Hook 不引用 skill |
| registry.js 需要改？ | ❌ | Registry 管 stage/agent/workflow 映射，不管 skill |
| init-workflow.js 需要改？ | ❌ | 初始化依據 workflowType 字串，不依據 skill 路徑 |
| Dashboard/StatusLine 影響？ | ❌ | 依賴 timeline.jsonl + workflow.json |

### Agent Skills 欄位更新

| Agent | 現況 skills | 目標 skills |
|-------|-----------|------------|
| tester | ref-test-strategy | testing |
| developer | ref-commit-convention | commit |
| code-reviewer | ref-pr-review-checklist | code-review |
| security-reviewer | （無） | security |
| database-reviewer | （無） | database |
| refactor-cleaner | （無） | dead-code |
| e2e-runner | （無） | browser-automation |
| qa | （無） | testing, browser-automation |
| designer | （無） | design-system |
| product-manager | （無） | pm-frameworks |

---

## 方案比較

### 方案 A：全面正規化（推薦 ✅）

將 38 skills 正規化為 ~16 skills + ~27 commands。

| 維度 | 評估 |
|------|------|
| 概念清晰度 | ★★★★★ — 徹底解決角色-知識混淆 |
| 風險 | ★★★☆☆ — 大量搬遷，需功能快照對比 |
| 工作量 | 9 次迭代，每次 quick/standard workflow |
| 可回滾性 | 每次迭代獨立 commit，可逐次回滾 |

### 方案 B：僅提取知識領域

只建立 10 個 knowledge domain skill，不動 Stage Shortcut 和 Workflow。

| 維度 | 評估 |
|------|------|
| 概念清晰度 | ★★★☆☆ — 解決知識碎片，但 skill 分類仍模糊 |
| 風險 | ★★☆☆☆ — 只新增不刪除 |
| 工作量 | 6 次迭代 |
| 可回滾性 | 極高 |

### 方案 C：不動

維持現況，只在文件中標記概念分類。

| 維度 | 評估 |
|------|------|
| 概念清晰度 | ★☆☆☆☆ — 問題持續 |
| 風險 | ★☆☆☆☆ — 零風險 |
| 工作量 | 極低 |
| 可回滾性 | N/A |

**推薦方案 A**：概念混淆是架構債，會隨功能增長持續惡化。每次新增 agent 都要問「知識放 skill 還是 agent prompt？」，現在沒有一致答案。正規化建立明確規則，未來所有擴展遵循 Agent=角色、Skill=知識、Command=動作。

---

## 迭代計畫

### 原則

- **PoC 先行**：第 1 次迭代做 testing domain 驗證方法可行
- **慢步重構**：每次迭代小範圍，降低出錯機率
- **功能快照對比**：每次迭代前後執行 `bun test`，確保 0 regression
- **獨立 commit**：每次迭代一個 commit，可獨立回滾

### 9 次迭代序列

| # | 名稱 | 範圍 | Workflow | 預計影響 |
|---|------|------|:--------:|---------|
| 1 | PoC: testing domain | 建立 testing skill，合併 auto/bdd-spec-guide + auto/test-scope-dispatch + test/refs + ref-test-strategy | quick | 驗證 skill 合併 + agent skills 欄位更新方法 |
| 2 | workflow-core | 提取 auto/refs 中的 failure-handling、parallel-groups、handoff-protocol、completion-signals 到 workflow-core skill | quick | auto 職責歸位 |
| 3 | security + database + dead-code | 3 個 knowledge domain skill | quick | 3 個 agent 新增 skills 欄位 |
| 4 | code-review + commit | 吸收 ref-pr-review-checklist、ref-commit-convention | quick | 刪除 2 個 ref-* 獨立 skill |
| 5 | browser-automation + design-system | 從 agent prompt 提取新知識 | standard | 新建 2 個 skill + 修改 3 個 agent prompt |
| 6 | pm-frameworks | 吸收 pm/references/ | quick | PM skill 拆分為 command + knowledge |
| 7 | Stage Shortcuts → commands/ | 14 個 stage skill 轉為 command | standard | 大量搬遷 |
| 8 | Workflow + Utility → commands/ | 8 workflow + 6 utility skill 轉為 command | standard | 大量搬遷 |
| 9 | 收尾：Registry + Tests + Docs | 清理測試、更新所有文件 | quick | 文件同步 |

### PoC（迭代 1）驗收標準

```gherkin
Scenario: testing knowledge domain skill 建立
  Given 現有 BDD/testing 知識散布在 auto/references/、test/references/、ref-test-strategy
  When 合併為 skills/testing/ 並更新 tester agent 的 skills 欄位
  Then tester agent 啟動時自動載入 testing skill 全部內容
  And auto/SKILL.md 的 💡 引用更新為 testing skill 路徑
  And bun test 全部通過（0 regression）
  And 現有 workflow 行為不變
```

---

## MVP 範圍（MoSCoW）

### Must（不可跳過）

- 10 個 knowledge domain skill 建立
- Agent skills 欄位全面更新（10 個 agent）
- auto/references/ 重新分配
- 功能快照 before/after 對比
- `bun test` 全部通過

### Should（重要但不阻擋）

- Stage Shortcut → commands/ 遷移
- Workflow → commands/ 遷移（auto 吸收）
- Utility → commands/ 遷移

### Could（有了加分）

- 從 agent prompt 提取嵌入式知識（browser-automation、design-system）
- Agent prompt 精簡（提取知識後）

### Won't（本次排除）

- Agent 結構變更（角色定義不動）
- Hook 變更（確認無影響）
- Registry 變更（確認無需求）
- Dashboard / StatusLine 變更

---

## 假設 & 風險

| # | 類型 | 描述 | 影響 | 緩解 |
|---|:----:|------|:----:|------|
| A1 | 假設 | Claude Code 的 commands/ 和 skills/ 行為一致（merged since v2.1.3） | 高 | PoC 迭代 1 驗證 |
| A2 | 假設 | Agent skills 欄位更新後行為不變 | 高 | 每次迭代跑完整測試 |
| R1 | 風險 | 搬遷過程中功能遺失 | 高 | 功能快照 before/after 逐項對比 |
| R2 | 風險 | workflow skill 引用路徑斷裂 | 中 | 迭代 2 集中處理，全文搜尋 💡 引用 |
| R3 | 風險 | commands/ 目錄不支援 references/ 子目錄 | 中 | PoC 驗證，fallback 保留為 skill |
| R4 | 風險 | 平台限制（nested skills/ 不支援） | 低 | 已確認維持扁平結構 |

---

## 功能對比檢查清單

重構前後必須逐項確認的功能點：

### Workflow 功能
- [ ] 18 個 workflow 模板全部可選擇和執行
- [ ] `/auto` 路由準確
- [ ] `/standard`、`/quick` 等快捷呼叫正常
- [ ] BDD spec 前置生成（含 PLAN/ARCH 的 workflow）
- [ ] 失敗重試迴圈（TEST FAIL → debugger → dev → tester）
- [ ] 並行 stage 執行（[REVIEW + TEST]、[QA + E2E]）

### Agent 功能
- [ ] 17 個 agent 全部可委派
- [ ] Agent skills 欄位載入正確知識
- [ ] bypassPermissions 維持
- [ ] model 分配不變

### Hook 功能
- [ ] 11 個 hook 全部正常觸發
- [ ] PreToolUse 映射正確
- [ ] SubagentStop 記錄正確
- [ ] Loop 迴圈正常
- [ ] 音效通知正常
- [ ] Status Line 正常

### 知識載入
- [ ] 💡 Reference 按需載入正常
- [ ] Agent 啟動時自動載入 skill 知識
- [ ] references/ 路徑全部可訪問

### 使用者體驗
- [ ] 所有 `/*` 命令可呼叫
- [ ] argument-hint 顯示正常
- [ ] SessionStart banner 正常
- [ ] Dashboard 顯示正常

---

## 建議 Workflow

整體正規化 = **9 次迭代**，每次使用 quick 或 standard workflow。

建議新增 roadmap 項目 **S15b: Skill/Agent/Command 正規化**，與 S15 CBP 對齊平行規劃。

---

## Open Questions

1. commands/ 是否支援 references/ 子目錄？（PoC 驗證）
2. `mul-dev` 併入 auto/references/ 還是獨立保留？
3. `verify` skill（含 language-commands.md）歸為 utility skill 還是 knowledge domain？
4. PM skill 的 workflow 部分和知識部分如何拆分？（pm command + pm-frameworks skill）

---

> **PM 直言**：這不是一次「整理資料夾」的小事。這是為 Overtone 建立永久的組件分類標準：Agent 是角色、Skill 是知識、Command 是動作。做完之後，每次新增功能都有明確答案：「這是知識？放 skill。是操作？放 command。是角色？放 agent。」架構債的利息會隨功能增長複利累積，現在還清成本最低。
