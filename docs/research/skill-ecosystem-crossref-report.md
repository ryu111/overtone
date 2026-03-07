# Skill 生態交叉比較報告

> 日期：2026-03-08
> 範圍：Overtone 25 Skills vs 全網 10 路調研（Anthropic 官方、Microsoft、obra/superpowers、awesome-claude-skills、mcpmarket、mcpservers.org、LobeHub、Agentailor、SkillsMP）

---

## Part 1：Overtone 沒有的 — 推薦清單

### P1（高優先 — 填補明確能力缺口）

#### 1. Prompt Engineering / Skill Authoring Meta-Skill

| 項目 | 說明 |
|------|------|
| **外部來源** | Anthropic `skill-creator`、Agentailor `prompt-engineer`、LobeHub `skill-development`、obra `writing-skills` |
| **功能** | 引導使用者撰寫高品質 prompt / skill，包含結構化模板、反模式偵測、品質評估 |
| **為什麼需要** | Overtone 有 `skill-judge`（評分器）和 `claude-dev`（開發規範），但缺少**創作引導**。skill-judge 是事後評分，不是事前引導。當使用者想為新領域建立 skill 時，沒有一個 skill 能引導他從零開始產出高品質 SKILL.md。`manage-component.js skill create` 只提供骨架，不提供內容引導。 |
| **建議實作** | 擴展 `claude-dev` skill，新增 `references/skill-authoring-guide.md`，包含：(1) 從領域專家訪談到 SKILL.md 的完整流程 (2) Knowledge Delta 篩選方法 (3) 常見失敗模式（The Tutorial、The Dump 等，已有於 skill-judge，可交叉引用） |
| **優先級** | **P1** — Overtone 的自我進化飛輪（evolve + instinct）依賴高品質 skill 產出，缺少創作引導會成為瓶頸 |

#### 2. Thinking / Reasoning Frameworks（思維工具）

| 項目 | 說明 |
|------|------|
| **外部來源** | obra `collision-zone-thinking`、`inversion-exercise`、`meta-pattern-recognition`、`scale-game`、`simplification-cascades`、`when-stuck` |
| **功能** | 結構化思維工具：反向思考、碰撞區思考、模式辨識、規模推演、簡化級聯、卡關脫困 |
| **為什麼需要** | Overtone 的 debugging skill 有 RCA 五步法和 5 Whys，但這些是**診斷型**思維工具。缺少**創造型/策略型**思維工具。當 architect 或 planner 面對複雜設計決策（非 bug）時，沒有結構化的思考框架可用。obra 的 `when-stuck` 特別有價值 — 提供了 AI agent 自我脫困的系統性方法。 |
| **建議實作** | 新建 `thinking` skill，收錄 3-4 個高價值思維框架。不要全搬 obra 的 6 個（很多是 Activation 級知識），精選 Expert 級的：`when-stuck`（卡關脫困）、`inversion-exercise`（反向驗證）、`simplification-cascades`（化繁為簡）。 |
| **優先級** | **P1** — 直接影響 architect/planner 的決策品質，尤其是面對全新設計問題時 |

#### 3. MCP Builder / Tool Integration

| 項目 | 說明 |
|------|------|
| **外部來源** | Anthropic `mcp-builder`、Microsoft `mcp-builder`、Agentailor `mcp-builder` |
| **功能** | 引導建立 MCP server：協議規範、工具定義、錯誤處理、測試策略 |
| **為什麼需要** | Overtone 的 L4 願景是「通用介面 + 直接操控電腦」，MCP 是 Claude Code 連接外部工具的標準協議。目前 `os-control` skill 覆蓋了 AppleScript/JXA 和 Computer Use，但沒有覆蓋 MCP server 開發。隨著 Overtone 擴展到更多工具整合場景（資料庫、API、第三方服務），MCP 開發知識會變成高頻需求。 |
| **建議實作** | 新建 `mcp-dev` skill 或整合到 `claude-dev`。內容：MCP 協議規範速查、工具定義最佳實踐、錯誤處理模式、與 Overtone hook 系統的整合方式。 |
| **優先級** | **P1** — L4 核心能力依賴 |

### P2（中優先 — 品質提升或效率增益）

#### 4. Frontend Design Review

| 項目 | 說明 |
|------|------|
| **外部來源** | Anthropic `frontend-design`、Microsoft `frontend-design-review`、Anthropic `canvas-design`、`brand-guidelines` |
| **功能** | 前端設計審查：元件結構、響應式設計、無障礙、設計系統一致性 |
| **為什麼需要** | Overtone 的 `craft` skill 有 `design-taste.md`（設計品味指南），但聚焦視覺美學層面。缺少**結構化的前端設計審查清單**：元件拆分策略、狀態管理模式、響應式斷點、a11y 檢查、設計 token 一致性。`code-review` skill 的審查維度是通用的（code quality / security / performance / observability），沒有前端專屬維度。 |
| **建議實作** | 擴展 `code-review` skill，新增 `references/frontend-review-checklist.md`：元件拆分、狀態管理、a11y、響應式、設計 token。或者擴展 `craft` 的 `design-taste.md`。 |
| **優先級** | **P2** — Kuji 等前端專案會受益，但非 Overtone 核心能力 |

#### 5. Git Worktree / Branch Strategy

| 項目 | 說明 |
|------|------|
| **外部來源** | obra `using-git-worktrees`、`finishing-a-development-branch` |
| **功能** | Git worktree 並行開發、branch 完結策略（squash vs merge vs rebase） |
| **為什麼需要** | Overtone 已有 `commit-convention` 和 `pr` skill 覆蓋 commit 和 PR，但缺少 **branch 層級的策略知識**。特別是 git worktree — 這是 Claude Code 並行開發的關鍵能力（多個 agent 可以在不同 worktree 同時工作），但目前沒有任何 skill 覆蓋 worktree 的使用模式和注意事項。 |
| **建議實作** | 擴展 `commit-convention` skill 為更廣的 `git-strategy` skill，或新增 reference 到現有 skill。 |
| **優先級** | **P2** — 並行開發效率的提升，但 Overtone 的並行模型目前用 subagent 而非 worktree |

#### 6. Documentation / Technical Writing

| 項目 | 說明 |
|------|------|
| **外部來源** | Anthropic `doc-coauthoring`、`internal-comms`、LobeHub `claude-code-mastery` |
| **功能** | 技術文件協作撰寫、內部溝通格式、文件品質標準 |
| **為什麼需要** | Overtone 有 `doc-updater` agent 和 `wording` skill，但 `wording` 聚焦**措詞正確性**（指令強度、模糊量詞），不覆蓋**文件結構和品質**。doc-updater agent 沒有對應的文件品質知識 skill。當需要撰寫大型技術文件（如 overtone.md 規格文件）時，缺少結構化的文件品質標準。 |
| **建議實作** | 新增 `references/doc-quality-checklist.md` 到 `wording` skill，覆蓋：文件結構金字塔、讀者分析、資訊密度控制、範例與反範例比例。 |
| **優先級** | **P2** — 提升 doc-updater agent 的輸出品質 |

#### 7. Subagent-Driven Development / Agent Coordination

| 項目 | 說明 |
|------|------|
| **外部來源** | obra `subagent-driven-development`、`dispatching-parallel-agents`、`testing-skills-with-subagents` |
| **功能** | Subagent 委派模式、並行 agent 協調、agent 測試方法 |
| **為什麼需要** | Overtone 的 `auto` skill 有並行規則和 Mul Agent 機制，`workflow-core` 有並行群組定義。但這些知識散佈在多個 reference 中，且聚焦「workflow 內的 stage 並行」。缺少更泛化的 **agent 協調模式知識**：何時拆分 subagent、如何設計 agent 間的通訊、如何避免 context 遺失、如何驗證 subagent 輸出品質。obra 的 `subagent-driven-development` 提供了一個完整的方法論。 |
| **建議實作** | 擴展 `workflow-core` 的 `parallel-groups.md`，或在 `claude-dev` 新增 `references/agent-coordination-patterns.md`。 |
| **優先級** | **P2** — 提升多 agent 協調品質，但 Overtone 現有機制已可運作 |

#### 8. Observability / Monitoring Patterns

| 項目 | 說明 |
|------|------|
| **外部來源** | mcpmarket 的 monitoring skills、mcpservers.org 的 logging/tracing tools |
| **功能** | 結構化 logging、distributed tracing、metrics 設計、alert 策略 |
| **為什麼需要** | Overtone 的 `code-review` skill 四維度包含 observability，但只是審查維度之一，沒有深入的觀測性知識。`debugging` skill 聚焦事後診斷，不覆蓋事前的觀測性設計。對於 Kuji 等生產系統，缺少觀測性設計指引會導致「出問題了但看不到」。 |
| **建議實作** | 新建 `observability` skill 或在 `debugging` 新增 reference。 |
| **優先級** | **P2** — 生產系統品質保障 |

### P3（低優先 — 錦上添花）

#### 9. File Format Processing（DOCX/PDF/PPTX/XLSX）

| 項目 | 說明 |
|------|------|
| **外部來源** | Anthropic `docx`、`pdf`、`pptx`、`xlsx` |
| **功能** | Office 文件格式的程式化操作（解包 → 編輯 XML → 重打包） |
| **為什麼需要** | 場景有限。Overtone 的主要使用場景是軟體開發，不是文件處理。但如果未來 L4 通用代理需要處理辦公文件，這些 skill 的 OOXML 操作知識（unpack/edit/validate/pack workflow）是非顯而易見的 Expert 知識。 |
| **建議實作** | 按需引入，不預先建立。 |
| **優先級** | **P3** |

#### 10. IaC / Cloud Architecture

| 項目 | 說明 |
|------|------|
| **外部來源** | Microsoft `cloud-solution-architect`、SkillsMP `iac-terraform`、mcpservers.org Azure/GCP skills |
| **功能** | 雲端架構設計、Terraform/Pulumi IaC、多雲策略 |
| **為什麼需要** | Overtone 目前不處理基礎設施，但 Kuji 等專案終究需要部署。目前的 `architecture` skill 聚焦應用層架構，不覆蓋基礎設施。 |
| **建議實作** | 按需引入，不預先建立。 |
| **優先級** | **P3** |

#### 11. API Design / OpenAPI

| 項目 | 說明 |
|------|------|
| **外部來源** | Agentailor `openai-docs`（API 設計參考）、mcpservers.org API design tools |
| **功能** | RESTful API 設計規範、OpenAPI spec 撰寫、版本策略 |
| **為什麼需要** | `architecture` skill 的 reference 覆蓋架構模式和 tradeoff，但沒有 API 設計專屬知識。 |
| **建議實作** | 在 `architecture` 新增 `references/api-design-patterns.md`。 |
| **優先級** | **P3** |

#### 12. Naming / Code Semantics Analysis

| 項目 | 說明 |
|------|------|
| **外部來源** | LobeHub `naming-analyzer` |
| **功能** | 變數/函式/模組命名品質分析、語意一致性檢查 |
| **為什麼需要** | `craft` skill 的 `clean-code-rules.md` 覆蓋命名，但標記為 Activation（Claude 已知）。LobeHub 的 naming-analyzer 更深入，提供語意分析而非規則檢查。但價值有限 — Claude 本身的命名能力已經不錯。 |
| **建議實作** | 不建議引入，現有覆蓋已足夠。 |
| **優先級** | **P3** |

#### 13. Knowledge Gardening / Wiki Management

| 項目 | 說明 |
|------|------|
| **外部來源** | obra `gardening-skills-wiki`、`tracing-knowledge-lineages`、`sharing-skills` |
| **功能** | 知識庫維護、知識溯源、跨團隊知識分享 |
| **為什麼需要** | Overtone 有 `instinct`（內化知識庫）和 `evolve`（進化管理），已覆蓋知識積累和進化。但缺少「知識衰退偵測」和「跨專案知識分享」的系統性方法。`evolve` 有提到「長期未使用的 Skill 應考慮降級」但沒有具體的衰退偵測機制。 |
| **建議實作** | 在 `evolve` 新增 `references/knowledge-decay-detection.md`。 |
| **優先級** | **P3** |

### 明確不推薦引入的外部 Skills

| 外部 Skill | 理由 |
|------------|------|
| Microsoft Azure SDK skills（90+） | 平台特定，非通用知識 |
| SkillsMP 大量低品質 skills | 26% 有漏洞，品質堪憂 |
| mcpmarket TDD 變體（7-8 個） | Overtone testing skill 已有 BDD 全覆蓋，TDD 是子集 |
| Anthropic `algorithmic-art`、`slack-gif-creator` | 娛樂性質，非核心能力 |
| obra `brainstorming`、`writing-plans`、`executing-plans` | Claude 基礎能力，Knowledge Delta 低 |
| obra `remembering-conversations` | Overtone 已有 agent-memory + instinct，更成熟 |
| LobeHub `claude-code-mastery` | Overtone 的 `claude-dev` 已覆蓋且更深入 |

---

## Part 2：Overtone 已有的 — 交叉評分比較

### 1. Testing

| 維度 | Overtone `testing` | 外部對標 |
|------|--------------------|---------|
| **對標** | mcpmarket TDD skills (7-8)、obra `test-driven-development`、obra `testing-anti-patterns`、SkillsMP `test-master` |

**Overtone 優點：**
- **覆蓋面極廣**：11 個 reference 文件覆蓋 BDD 方法論、測試策略、反模式、E2E、並發測試、效能優化、任務拆分 — 這是所有外部 testing skills 中最全面的
- **BDD 深度**：BDD spec guide + methodology + samples 三層遞進，從語法到方法論到範例，形成完整知識鏈
- **反模式品質高**：NEVER 列表每條都有 "because" 解釋（如「BDD scenario 不可包含多個 WHEN — 因為失敗時無法定位」），這是 Expert 級知識
- **與 workflow 整合**：test-scope-dispatch 動態決定測試範圍，這是 Overtone 獨有的 workflow-aware 測試調度
- **並發測試指南**：concurrency-testing-guide 覆蓋 CAS 壓力測試和競爭條件驗證，外部幾乎沒有 skill 覆蓋這個領域

**Overtone 缺點：**
- **缺少 mutation testing 知識**：沒有覆蓋變異測試（修改程式碼驗證測試是否能偵測到），SkillsMP 的 test-master 有提及
- **缺少 visual regression testing**：沒有截圖對比測試的知識（Playwright screenshot comparison 等）
- **缺少 contract testing**：API contract testing（Pact 等）未覆蓋，微服務場景需要
- **Language-specific 知識薄弱**：高度聚焦 Bun/JS 生態，Python pytest / Go testing / Rust 的測試慣例覆蓋不足

**外部優點：**
- mcpmarket 的 Playwright skills 有更細緻的 E2E 操作知識（locator 策略、auto-waiting、trace viewer）
- obra `testing-anti-patterns` 的「preserving productive tensions」概念有趣 — 測試和開發之間的張力是健康的
- SkillsMP `test-master` 覆蓋 mutation testing 和 property-based testing

**外部缺點：**
- mcpmarket TDD skills 有 7-8 個高度重複的變體，品質參差不齊
- 大多數外部 testing skills 是獨立的「島嶼」，不與 workflow 整合
- obra 的 testing skills 偏向方法論描述，缺少具體的 decision tree 和 NEVER list

**結論：** Overtone testing skill 在 BDD 深度、workflow 整合、並發測試方面**領先市場**。建議補強：(1) mutation testing 概念 (2) visual regression testing (3) contract testing。不需要大改，在現有 reference 中補充即可。

---

### 2. Security-KB

| 維度 | Overtone `security-kb` | 外部對標 |
|------|------------------------|---------|
| **對標** | mcpmarket Security Sentinel / OWASP / STRIDE / 滲透測試 skills (15)、LobeHub `security-review`、SkillsMP `secure-code-guardian` |

**Overtone 優點：**
- **嚴重度決策樹**：可利用路徑 → 資料可控性 → 影響範圍 → 緩解措施，四層遞進分類，比外部 skill 的扁平清單更實用
- **False positive 意識**：NEVER 第一條就警告 SAST 工具 30-50% false positive，這是實戰經驗
- **JS/TS 特定模式**：prototype pollution、regex DoS 等 JS 生態特有的安全問題，外部通用 security skill 不覆蓋
- **Async 授權檢查**：「AI 生成的非同步程式碼常見遺漏 await 導致授權函式回傳 Promise」— 這是極其精準的 Expert 知識

**Overtone 缺點：**
- **覆蓋面窄**：只有 3 個 reference（OWASP checklist、JS patterns、report 格式），相比 mcpmarket 15 個 security skills 的廣度差距明顯
- **缺少威脅建模**：沒有 STRIDE / attack tree / threat modeling 方法論，mcpmarket 有完整的 STRIDE skill
- **缺少滲透測試知識**：沒有覆蓋主動安全測試（fuzzing、SQL injection 測試手法），只有防禦性審查
- **缺少 Supply Chain Security**：npm 依賴鏈安全（typosquatting、依賴劫持）未覆蓋
- **缺少 CI/CD Security**：pipeline 安全（secret 管理、artifact 簽名）未覆蓋

**外部優點：**
- mcpmarket STRIDE skill 提供完整的威脅建模框架，從資產識別到威脅分類到緩解策略
- mcpmarket 滲透測試 skill 有實際的測試手法（不只是防禦檢查清單）
- SkillsMP `secure-code-guardian` 覆蓋 supply chain security

**外部缺點：**
- mcpmarket 15 個 security skills 高度重疊，缺乏統一的嚴重度分類
- 大多數外部 security skill 是通用性的，缺少 JS/TS 特定模式
- 沒有外部 skill 有 Overtone 那樣精準的「async await 授權漏洞」警告

**結論：** Overtone 在 **JS 特定安全模式和決策樹品質上領先**，但在**廣度上明顯不足**。建議：(1) 新增 `references/threat-modeling.md`（STRIDE 方法論）(2) 新增 `references/supply-chain-security.md`（npm 依賴鏈安全）(3) 考慮新增 `references/ci-cd-security.md`。這會讓 security-kb 從「code review 輔助」升級為「完整安全知識庫」。

---

### 3. Debugging

| 維度 | Overtone `debugging` | 外部對標 |
|------|----------------------|---------|
| **對標** | obra `systematic-debugging`、`root-cause-tracing`、mcpmarket `CLI Debug Skill`、obra `when-stuck` |

**Overtone 優點：**
- **RCA 決策樹**：從症狀觀察到根因分類的完整決策路徑，比 obra 的描述性方法論更可操作
- **並發除錯專門指南**：Race Condition / TOCTOU / Deadlock 分類 + 症狀辨識，這是極高價值的 Expert 知識
- **實戰範例**：rca-walkthrough 用真實的 SubagentStop 重複觸發問題做 RCA 示範
- **NEVER 品質極高**：「不用 sleep 修競態」「不同時改多個變數」「不霰彈槍除錯」— 每條都是血淚教訓

**Overtone 缺點：**
- **缺少「卡關脫困」策略**：obra `when-stuck` 提供了 AI agent 自我脫困的系統性方法（換角度、降低問題規模、尋求外部輸入），Overtone 的 debugging 假設問題總能按 RCA 流程解決，但現實中有些問題需要先跳出框架
- **缺少 performance debugging**：profiling、memory leak 追蹤、CPU hotspot 分析的系統性方法未覆蓋
- **過度聚焦 JS**：js-error-patterns.md 覆蓋 JS/Node.js，其他語言的錯誤模式未覆蓋

**外部優點：**
- obra `systematic-debugging` 的「形成假設再驗證」哲學與 Overtone 相似但表述更清晰
- obra `when-stuck` 的脫困策略是獨特且有價值的（Overtone 完全缺少）
- obra `root-cause-tracing` 強調「追蹤到根因而非修修停停」

**外部缺點：**
- obra 的 debugging skills 偏方法論，缺少具體的決策樹和 lookup table
- mcpmarket CLI Debug Skill 功能單薄，只是 CLI 操作指引
- 沒有外部 skill 有 Overtone 那樣深入的並發除錯指南

**結論：** Overtone 在 **RCA 流程和並發除錯上領先**，但建議引入 obra `when-stuck` 的脫困策略概念（見 Part 1 推薦 #2）。

---

### 4. Code Review

| 維度 | Overtone `code-review` | 外部對標 |
|------|------------------------|---------|
| **對標** | obra `requesting-code-review`、`receiving-code-review`、LobeHub `claude-code-analyzer` |

**Overtone 優點：**
- **信心過濾**：「信心 < 80% 時不報問題」— 這是實戰中減少 false positive 的關鍵規則
- **數量控制**：「不超過 10 個 issue」— 避免 review 疲勞
- **跨域引用**：連結 testing anti-patterns，審查測試程式碼時自動引入測試知識
- **架構層面 review**：architecture-review.md 覆蓋模組耦合和 API 一致性

**Overtone 缺點：**
- **只覆蓋「做 review」**：缺少「請求 review」和「接收 review」的知識 — obra 將 code review 視為雙向互動，Overtone 只有審查者視角
- **缺少 review 優先級框架**：當 10 個 issue 都重要時，如何排序？目前只說「優先排序」但沒有具體框架
- **缺少增量 review 策略**：大 PR 的分段審查方法未覆蓋

**外部優點：**
- obra 將 review 視為雙向溝通（requesting + receiving），更完整
- LobeHub `claude-code-analyzer` 有靜態分析整合概念

**外部缺點：**
- obra 的 review skills 偏溝通技巧，缺少技術維度的審查清單
- 外部 skills 沒有信心過濾機制

**結論：** Overtone 的技術審查深度領先，但缺少「被審查者視角」。建議在 `code-review` 新增 `references/review-response-guide.md`，引導 developer agent 如何回應 review 意見。

---

### 5. Craft（Software Craftsmanship）

| 維度 | Overtone `craft` | 外部對標 |
|------|-------------------|---------|
| **對標** | LobeHub `claude-code-mastery`、obra `preserving-productive-tensions` |

**Overtone 優點：**
- **Knowledge Delta 分層**：明確區分 Expert / Activation / Redundant，每個 reference 標注 delta 級別 — 這是 skill 設計的最佳實踐
- **設計品味指南**：design-taste.md 覆蓋視覺/配色/動效/反模式，這在所有外部 skill 中是獨一無二的
- **Overtone 專有原則**：overtone-principles.md 是高度定制化的製作原則，不是泛泛的 Clean Code
- **競品基準矩陣**：六維度評估框架（competitor-benchmark.md），用於 Acid Test

**Overtone 缺點：**
- **重構手法偏基礎**：refactoring-catalog.md 標記為 Mixed，部分內容 Claude 已知
- **缺少「生產性張力」概念**：obra 的 `preserving-productive-tensions` 提出了一個有趣的觀點 — 某些看似矛盾的設計原則之間的張力是有益的（如「DRY vs 清晰度」），不應該強行解決
- **程式碼模式覆蓋面一般**：code-level-patterns.md 只覆蓋 Strategy/Observer/Factory 等經典模式

**外部缺點：**
- LobeHub `claude-code-mastery` 是通用最佳實踐彙編，Knowledge Delta 低
- 外部 skill 沒有 Overtone 的 Knowledge Delta 分層意識

**結論：** Overtone 的 Knowledge Delta 分層和設計品味指南**在市場上獨一無二**。建議：(1) 精簡 Activation 級內容 (2) 考慮引入「生產性張力」概念。

---

### 6. Architecture

| 維度 | Overtone `architecture` | 外部對標 |
|------|-------------------------|---------|
| **對標** | Microsoft `cloud-solution-architect`、Anthropic `webapp-testing`（架構層面） |

**Overtone 優點：**
- **ADR 標準化**：MADR 4.0 模板 + Y-Statement 格式 + 實際範例，提供了完整的架構決策記錄方法
- **並發策略決策樹**：Atomic Write / CAS / JSONL Append / flock / 分割策略 — 這是 Overtone 實戰中提煉的高價值知識
- **狀態同步模式**：Props/Store/EventBus/Server State 四種模式 + 決策樹
- **Tradeoff 框架**：結構化的技術決策分析方法

**Overtone 缺點：**
- **缺少分散式系統模式**：CAP 定理、一致性模型、分散式事務等未覆蓋
- **缺少 API 設計模式**：RESTful / GraphQL / gRPC 選擇決策樹未覆蓋
- **缺少可擴展性模式**：水平擴展、分片、讀寫分離等未覆蓋
- **聚焦單機應用**：並發模式以檔案系統操作為主，網路層面的並發（連線池、背壓）未覆蓋

**外部優點：**
- Microsoft `cloud-solution-architect` 覆蓋雲端架構的完整 landscape
- 外部 architecture skills 通常覆蓋更廣的場景（微服務、事件驅動、CQRS）

**外部缺點：**
- 外部 architecture skills 往往是知識彙編，缺少 Overtone 那樣的決策樹
- Microsoft 的 132 個 skills 中，architecture 相關的太過 Azure-specific

**結論：** Overtone 在**決策樹品質和 ADR 流程上領先**，但覆蓋面限於單機/小型系統。隨著 Kuji 等專案成長，建議逐步補充分散式系統模式。不急，P3 層級。

---

### 7. Autonomous Control

| 維度 | Overtone `autonomous-control` | 外部對標 |
|------|-------------------------------|---------|
| **對標** | 無直接對標（Overtone 獨有） |

**Overtone 優點：**
- **市場獨有**：heartbeat daemon + 佇列管理 + session spawner 的自主控制能力，沒有任何外部 skill 覆蓋
- **三層安全防護**：OVERTONE_SPAWNED=1 + 敏感 env 過濾 + 遞迴防護，安全設計成熟
- **跨 session 執行**：真正的自主代理能力，不是單一 session 的自動化

**Overtone 缺點：**
- 無外部對標可比較

**結論：** 這是 Overtone 的**核心競爭力之一**，市場上沒有對標產品。

---

### 8. Instinct + Evolve（自我進化飛輪）

| 維度 | Overtone `instinct` + `evolve` | 外部對標 |
|------|--------------------------------|---------|
| **對標** | obra `gardening-skills-wiki`、`tracing-knowledge-lineages`、Agentailor `agentic-eval` |

**Overtone 優點：**
- **完整的進化飛輪**：觀察收集 → 評估過濾 → 泛化提煉 → 永久寫入，形成閉環
- **信心分數機制**：量化的進化門檻（>=70%），避免噪音汙染
- **降級機制**：長期未使用的知識可降級回 Instinct 或廢棄
- **跨專案驗證要求**：必須跨 2+ 專案/場景驗證，避免偶發模式被內化

**Overtone 缺點：**
- **實際運作效果待驗證**：飛輪設計完整但 L3.6 Acid Test 尚未完成，實際進化品質未經大規模驗證
- **缺少知識衰退偵測的具體實作**：evolve NEVER 提到「定期評估並廢棄」但沒有自動化的衰退偵測

**外部優點：**
- obra `gardening-skills-wiki` 的「知識花園」隱喻強調持續維護而非只是添加
- obra `tracing-knowledge-lineages` 的知識溯源概念有助於理解知識的來源和演變

**外部缺點：**
- obra 的知識管理 skills 是描述性的，沒有 Overtone 的量化機制（信心分數、進化門檻）
- 沒有外部 skill 有真正的「自我進化」能力

**結論：** Overtone 的自我進化機制**在市場上獨一無二且設計成熟**。建議：等 Acid Test 完成後根據實際數據調整進化參數。

---

### 9. Workflow Core

| 維度 | Overtone `workflow-core` | 外部對標 |
|------|--------------------------|---------|
| **對標** | obra `executing-plans`、`dispatching-parallel-agents`（部分對標） |

**Overtone 優點：**
- **完整的 pipeline 語意**：失敗重試、並行群組、Handoff 協議、完成信號 — 形成完整的工作流引擎知識
- **檔案系統並發模式**：atomicWrite / CAS / JSONL / invariants — 這是實戰中解決並發寫入問題的完整方案
- **NEVER 品質極高**：每條都有 "because" 解釋，涵蓋了真實的 pipeline 失敗場景

**Overtone 缺點：**
- **Overtone 專屬**：這些知識高度綁定 Overtone 的工作流機制，不具通用性
- **缺少 pipeline 視覺化知識**：如何讓使用者理解 pipeline 狀態的視覺設計

**結論：** 這是 Overtone 的**核心基礎設施知識**，設計成熟，不需要外部借鑑。

---

### 10. Skill Judge

| 維度 | Overtone `skill-judge` | 外部對標 |
|------|------------------------|---------|
| **對標** | Agentailor `agentic-eval`、LobeHub `skill-development` |

**Overtone 優點：**
- **8 維度 120 分制**：Knowledge Delta / Mindset / Anti-Pattern / Spec Compliance / Progressive Disclosure / Freedom Calibration / Pattern Recognition / Usability — 這是最完整的 skill 品質評估框架
- **「Knowledge Delta」核心理念**：「Good Skill = Expert-only Knowledge - What Claude Already Knows」— 這個公式精準定義了 skill 的價值
- **9 種失敗模式**：The Tutorial / The Dump / The Orphan References 等 — 每種都是從實戰中提煉的反模式
- **Meta-Question**：「Would an expert say 'this captures knowledge that took me years to learn'?」— 終極品質檢驗

**Overtone 缺點：**
- **CLI 評分 vs AI 評分差距**：skill-score.js 程式化評分與 AI 評分差 +19 分，語意維度（D1/D2）不適合程式化
- **缺少自動化改善建議**：評完分後缺少「如何從 C 升到 B」的具體行動建議

**外部優點：**
- Agentailor `agentic-eval` 聚焦 agent 行為評估而非 skill 品質，是不同但互補的評估維度

**外部缺點：**
- 外部沒有任何 skill 品質評估框架能與 skill-judge 相比
- LobeHub 的 skill-development 只是一般性的 meta-skill 指引

**結論：** Overtone skill-judge 在**品質評估框架設計上無競爭者**。建議改善 CLI 評分的語意維度準確度（已記錄在待改進清單）。

---

### 11. OS Control

| 維度 | Overtone `os-control` | 外部對標 |
|------|------------------------|---------|
| **對標** | mcpservers.org 的 Google/Azure automation tools（間接對標） |

**Overtone 優點：**
- **雙策略設計**：AppleScript/JXA 原生優先 + Computer Use 兜底，策略清晰
- **安全意識高**：7 條 NEVER 涵蓋 Accessibility 授權、沙盒限制、Retina scaling、截圖敏感視窗等實戰陷阱
- **平台偵測**：自動偵測 macOS 環境和可用工具

**Overtone 缺點：**
- **僅 macOS**：完全不覆蓋 Linux/Windows，L4 通用代理需要跨平台
- **reference 檔案路徑缺失**：SKILL.md 中多處 `💡` 連結為空（如「讀取 」），reference 檔案可能尚未建立或路徑遺失
- **缺少 Linux 的 xdotool / xclip 等工具知識**

**結論：** macOS 深度足夠，但跨平台覆蓋是明顯短板。L4 階段需要補充 Linux/Windows 的 OS 操控知識。

---

### 12. Database

| 維度 | Overtone `database` | 外部對標 |
|------|----------------------|---------|
| **對標** | mcpservers.org `Database Schema Designer`、SkillsMP database skills |

**Overtone 優點：**
- **Production 安全意識**：expand-contract pattern、CONCURRENTLY 索引、migration 回滾策略 — 這是 DBA 級的 Expert 知識
- **嚴重度決策樹**：從資料遺失到 N+1 到 SELECT *，逐級分類，實用性高
- **ORM 反模式**：N+1、connection pool、lazy loading — 常見但非顯而易見的問題

**Overtone 缺點：**
- **缺少 schema 設計知識**：正規化/反正規化決策、資料建模方法未覆蓋
- **缺少多資料庫比較**：PostgreSQL vs MySQL vs MongoDB 的場景選擇未覆蓋
- **聚焦審查而非設計**：skill 定位是「資料庫審查」，不是「資料庫設計」

**結論：** 審查品質高，但如果需要從零設計資料庫（如 Kuji），會缺少設計指引。建議在 `architecture` skill 補充資料建模模式。

---

### 13. PM（Product Manager）

| 維度 | Overtone `pm` | 外部對標 |
|------|---------------|---------|
| **對標** | 無直接外部對標（PM-as-skill 是 Overtone 獨有概念） |

**Overtone 優點：**
- **研究先行原則**：強制 PM agent 先做市場研究再提問，避免泛泛問題
- **五層追問法**：L1-L5 從表面需求到成功定義的完整探索路徑
- **Drift 偵測**：目標偏移、範圍膨脹、方案先行等 5 種 drift 信號
- **interview.js 引擎**：結構化五面向問答 + 中斷恢復，用於深度產品探索
- **AskUserQuestion 強制使用**：確保每個問題都通過工具呈現，保持互動品質

**Overtone 缺點：**
- **220 行 SKILL.md 偏長**：接近 Progressive Disclosure 的上限，部分內容可移入 reference
- **缺少市場分析框架**：RICE / MoSCoW / Kano 都是需求管理工具，但缺少 TAM/SAM/SOM 等市場規模分析框架
- **缺少用戶研究方法**：使用者訪談技巧、問卷設計、A/B 測試設計等未覆蓋

**結論：** PM-as-skill 是**市場獨有的創新**。220 行的 SKILL.md 長度可優化。

---

### 14. Wording

| 維度 | Overtone `wording` | 外部對標 |
|------|---------------------|---------|
| **對標** | 無直接外部對標（指令強度校準是 Overtone 獨有概念） |

**Overtone 優點：**
- **四級指令強度**：NEVER / MUST / should / may 的 emoji-關鍵詞對照，確保 AI 正確理解指令強度
- **被動語態警告**：「被動語態隱藏了『誰』必須執行」— 這是 AI prompt 工程中的深刻洞察
- **繁中技術寫作慣例**：zh-tw-conventions.md 覆蓋中英混排、標點等實用知識

**結論：** 完全獨有且高價值。沒有外部 skill 覆蓋「AI 指令措詞的精確性」這個領域。

---

### 15. Commit Convention

| 維度 | Overtone `commit-convention` | 外部對標 |
|------|------------------------------|---------|
| **對標** | obra `finishing-a-development-branch`（間接） |

**Overtone 優點：**
- **Knowledge Delta 意識**：明確標記「Claude 已知 conventional commit 基礎，此 Skill 聚焦 Overtone 專有規則」
- **體積判斷規則**：< 50 行單一 commit / 50-200 行檢查 / > 200 行 MUST 拆分 — 量化標準
- **Plugin Version Bump 規則**：Overtone 專屬但實用

**Overtone 缺點：**
- **缺少 branch 策略**：如 Part 1 #5 所述

**結論：** 設計精練，Knowledge Delta 意識好。覆蓋面適當。

---

## 總結

### Overtone 獨有競爭力（市場無對標）

1. **自我進化飛輪**（instinct + evolve）：量化信心分數 + 跨專案驗證 + 降級機制
2. **自主控制**（autonomous-control）：heartbeat + queue + session spawner
3. **PM-as-Skill**（pm）：研究先行 + 五層追問 + drift 偵測
4. **Skill 品質評估**（skill-judge）：8 維度 120 分制 + Knowledge Delta 理念
5. **措詞校準**（wording）：四級指令強度 + 被動語態警告
6. **工作流引擎知識**（workflow-core + auto）：完整 pipeline 語意

### Overtone 領先市場（有對標但更好）

1. **Testing**：BDD 深度 + workflow 整合 + 並發測試
2. **Debugging**：RCA 決策樹 + 並發除錯指南
3. **Craft**：Knowledge Delta 分層 + 設計品味指南
4. **Architecture**：ADR 流程 + 並發策略決策樹

### Overtone 需要補強（外部有更好的或覆蓋更廣）

1. **Security-KB**：廣度不足（缺 STRIDE、supply chain、CI/CD security）
2. **OS Control**：僅 macOS，跨平台缺口
3. **Database**：審查有但設計沒有

### 推薦行動佇列

| # | 行動 | 優先級 | 工作量 |
|---|------|--------|--------|
| 1 | 新建 `thinking` skill（卡關脫困 + 反向思考 + 化繁為簡） | P1 | 中 |
| 2 | 擴展 `claude-dev` 新增 skill authoring guide | P1 | 小 |
| 3 | 新建 `mcp-dev` skill（MCP server 開發知識） | P1 | 中 |
| 4 | 擴展 `security-kb` 新增 STRIDE + supply chain security | P2 | 中 |
| 5 | 擴展 `code-review` 新增 frontend review checklist | P2 | 小 |
| 6 | 擴展 `wording` 新增 doc quality checklist | P2 | 小 |
| 7 | 擴展 `testing` 補充 mutation/visual regression/contract testing | P2 | 小 |
| 8 | 擴展 `workflow-core` 或 `claude-dev` 新增 agent coordination patterns | P2 | 中 |
| 9 | 新建 `observability` skill | P2 | 中 |
| 10 | 補充 `os-control` 跨平台知識 | P2 | 大（L4 階段） |
