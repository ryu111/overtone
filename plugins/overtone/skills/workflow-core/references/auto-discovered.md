---
## 2026-03-05 | planner:PLAN Context
**需求**：建立 `docs/spec/overtone-decision-points.md`，將 Overtone 控制流決策點從 6 個散落的層次（registry.js、SKILL.md、pre-task-handler.js、agent-stop-handler.js、session-stop-handler.js、hooks.json）整合成單一可查詢的索引文件。

**為什麼**：設計者目前需要逐一翻讀多個 handler 才能回答「某 stage 結束後系統做什麼」。這份索引的目標是讓任何決策點在 30 秒內可定位，以及讓新功能設計時能快速判斷是否需要新增 user gate。

**PM 已定義的 MVP 範圍（MoSCoW Must）**：
- User Gate 索引（decision tree 格式）
- 自動決策索引（表格格式）
- Stage 轉場摘要（按 workflow 類型）
- standard workflow Mermaid 狀態圖
Keywords: docs, spec, overtone, decision, points, registry, skill, task, handler, agent

---
## 2026-03-05 | architect:ARCH Findings
**技術方案**：

- 純文件方案，新建 `docs/spec/overtone-decision-points.md`
- 5 個 Section：User Gate 索引、自動決策索引、Stage 轉場摘要、Standard Workflow 狀態圖、快速查找索引
- 不引入新的程式模組，不需要測試

**Open Questions 解答**：

- Q1 (entry schema)：統一格式含 Gate ID / 觸發條件 / 觸發時機 / 呈現方式 / Handler 位置 / 選項列表。`呈現方式` 欄位區分「正常互動 gate」（AskUserQuestion）與「異常介入 gate」（停止並等待）。
- Q2 (Mermaid 粒度)：主幹路徑 + subgraph 包圍 retry loop，圖外文字說明重試上限。使用 `stateDiagram-v2` + `<<fork>>`/`<<join>>` 語法。
- Q3 (佇列控制流定位)：納入 Section 二「自動決策索引」的獨立子節 2.4，不與 loop 決策混合。

**User Gate 清單（5 個，UG-01 ~ UG-05）**：
- UG-01：Discovery 模式使用者確認（pm/SKILL.md L84-92）
- UG-02：規劃模式確認（pm/SKILL.md L109-113）
- UG-03：TEST FAIL 上限 3 次（failure-handling.md L31-47）
- UG-04：REVIEW REJECT 上限 3 次（failure-handling.md L61-73）
- UG-05：RETRO ISSUES 上限 3 次（failure-handling.md L119-125）

**自動決策來源**：
- PreToolUse 阻擋：`pre-task-handler.js` L142-172（前置 stage 未完成 → deny）
- SubagentStop 收斂：`agent-stop-handler.js` L100-138（fail/reject 立即標記；全 pass 收斂；PM stage 完成 → 寫佇列）
- Stop hook 退出（7 級優先順序）：`session-stop-handler.js` L152-270
- 佇列控制流：`session-stop-handler.js` L119-218（completeCurrent + getNext + decision:block）

**Stop hook 7 級退出優先順序**（Section 2.3 核心內容）：
1. loopState.stopped → 手動退出
2. iteration >= 100 → 最大迭代退出
3. consecutiveErrors >= 3 → 連續錯誤退出
4. allCompleted + hasFailedStage → workflow abort
5. allCompleted + !hasFailedStage → workflow complete（→ 觸發佇列邏輯）
6. nextStage === 'PM' → 不阻擋（PM 互動模式）
7. 其他 → decision: block（loop 繼續）

**Stage 轉場摘要資料**（來自 registry.js L46-80）：
- 18 個 workflow，3 個並行群組（quality/verify/secure-quality）
- 詳見 design.md 中各 Section 格式規範

**API 介面**：無（純文件任務）

**資料模型**：無（純文件任務）

**檔案結構**：

```
新增：
  docs/spec/overtone-decision-points.md   <- 控制流決策點索引（主要產出）

修改：
  docs/spec/overtone.md                   <- 加入 overtone-decision-points.md 引用

Specs：
  specs/features/in-progress/decision-point-index/design.md   <- 已建立
  specs/features/in-progress/decision-point-index/tasks.md    <- 已建立
```

**Dev Phases**：所有子任務線性依賴（撰寫文件 → 更新索引），無並行可能，省略 Dev Phases 區塊。
Keywords: docs, spec, overtone, decision, points, section, user, gate, stage, standard

---
## 2026-03-05 | developer:DEV Findings
1. **實際行號與 BDD spec 記載一致**：session-stop-handler.js 的 7 級退出條件優先順序（L152 手動退出 → L158 最大迭代 → L165 連續錯誤 → L172 allCompleted → L227 PM 特例 → L244 block）與 BDD scenario 描述吻合。

2. **UG-05（RETRO ISSUES）與 UG-03/04 的本質差異**：UG-05 不是 workflow abort，而是「停止迭代、繼續 workflow」— 文件中特別標注此差異避免誤解。

3. **PM Gate 分拆為 UG-01 和 UG-02**：UG-01 是 discovery workflow 的 AskUserQuestion 互動，UG-02 是 `/ot:pm plan` 的「寫佇列後停止」，兩者呈現方式不同（前者 AskUserQuestion，後者靜默停止）。

4. **Mermaid 語法**：使用 `stateDiagram-v2` + `<<fork>>` / `<<join>>` 語法。`retry_test` 用 `state retry_test {}` subgraph 包圍修復迴圈，符合 BDD 要求。

5. **BDD 第 2 個 scenario（PM 佇列控制流與程式碼一致）**：agent-stop-handler.js L178-188 對應 PM stage 完成後解析佇列表格，session-stop-handler.js L196-218 對應 queueCompleted + getNext decision:block — 均已在 2.4 節詳細描述。
Keywords: spec, session, stop, handler, allcompleted, block, scenario, retro, issues, workflow

---
## 2026-03-05 | code-reviewer:REVIEW Findings
審查了 `docs/spec/overtone-decision-points.md`（新建 358 行）和 `docs/spec/overtone.md`（+1 行引用）。主要檢查：
- 抽查所有標註的 Handler 行號（pm/SKILL.md、session-stop-handler.js、agent-stop-handler.js、pre-task-handler.js、failure-handling.md），全部與實際程式碼一致
- Stop hook 7 級退出優先順序與 session-stop-handler.js if-else 順序完全吻合
- 18 個 workflow 定義與 registry.js L46-72 完全對齊
- 佇列控制流描述（completeCurrent + getNext + decision:block）與實際邏輯一致
- Mermaid stateDiagram-v2 語法正確
- overtone.md 引用行格式一致

無高信心問題。
Keywords: docs, spec, overtone, decision, points, handler, skill, session, stop, agent

---
## 2026-03-05 | retrospective:RETRO Findings
**回顧摘要**：

- 文件內容與程式碼原始碼高度一致：所有 18 個 workflow 的 key、中文標籤、stages 序列、parallelGroups 均與 `/Users/sbu/projects/overtone/plugins/overtone/scripts/lib/registry.js` L46-80 對齊
- User Gate 五個 entry（UG-01 ~ UG-05）的觸發條件、handler 位置（含行號）與實際程式碼路徑一致
- 自動決策索引（2.1 PreToolUse / 2.2 SubagentStop / 2.3 Stop hook / 2.4 佇列控制流）的決策樹描述與各 handler 程式碼邏輯吻合
- `overtone.md` 已在 L35 正確加入引用，說明文字包含「控制流決策點」關鍵字
- 快速查找索引提供 14 個情境，超過 BDD spec 最低要求（7 個），覆蓋範圍完整
- Mermaid 狀態圖語法有效（`stateDiagram-v2`、`<<fork>>`、`<<join>>`、retry 迴圈 `state retry_test`），結構正確
- 純文件任務採用 BDD spec 驗證文件結構完整性與程式碼一致性的做法合適，且可重現（tester 18/18 PASS）
Keywords: workflow, stages, parallelgroups, users, projects, overtone, plugins, scripts, registry, user

---
## 2026-03-05 | doc-updater:DOCS Findings
**文件同步完成：**

1. ✅ `docs/spec/overtone-decision-points.md` — DEV 已新建，內容完整（v1.0，293 行）
   - 五個維度：User Gate × 自動決策 × Stage 轉場 × Standard Workflow 狀態圖 × 快速查找索引
   - 已對照原始碼驗證（session-stop-handler.js、pre-task-handler.js、agent-stop-handler.js、registry.js）

2. ✅ `docs/spec/overtone.md` — 文檔目錄已正確新增引用（L35）
   - 無需修改，DEV 已完成

3. ✅ `docs/status.md` — 文檔索引表更新
   - 新增「決策點」列：`docs/spec/overtone-decision-points.md`
   - 順帶修正：「願景」說明「四層」→「五層」（對照 vision.md）

4. ✅ `CLAUDE.md` — 關鍵文件表更新
   - 新增決策點索引行：「控制流決策點快查（30 秒找到任意決策點）」
   - 置於 overtone.md 之後、status.md 之前（邏輯順序：規格 → 決策點查詢 → 現況 → SoT）
Keywords: docs, spec, overtone, decision, points, user, gate, stage, standard, workflow

---
## 2026-03-05 | product-manager:PM Findings
**目標用戶**：Overtone 開發者（個人 dogfooding），在面對新領域時需要系統自主建構能力堆疊。

**成功指標**：
- L3.3：score < 0.2 的 prompt 自動觸發 Skill Forge，成功率 >= 80%
- L3.4：PM 訪談產出的 Project Spec 包含 >= 10 個 BDD 場景
- L3.5：收到高層目標後，系統自主完成能力盤點 + 排程 + 迭代，人工介入 <= 2 次
- L3.7：專案完成後 skill 通用化 + 納入永久庫的自動化率 >= 90%
- 10 次迭代後，系統指標可量化改善（測試覆蓋率、health-check 通過項、skill 完整度）

**方案比較**：

| 維度 | 方案 A：按 Roadmap 順序 | 方案 B：依賴優化順序 | 方案 C：先清理再建新 |
|------|------------------------|---------------------|---------------------|
| 概述 | L3.3 -> L3.4 -> L3.5 -> L3.7 -> 10x 優化 | L3.4 -> L3.3 -> L3.5 -> L3.7 -> 10x 優化（PM 先行） | 5x 清理/重構 -> L3
Keywords: overtone, dogfooding, score, prompt, skill, forge, project, spec, health, check

---
## 2026-03-05 | product-manager:PM Context
Overtone 已完成 L1（核心大腦）和 L2（感知操控），目前在 L3（自我進化）。L3.1-3.2（Gap Detection + Auto-Fix）已完成。使用者需要完成 L3 剩餘能力（L3.3 Skill Forge、L3.4 深度 PM、L3.5 Project Orchestrator、L3.7 Skill Internalization），加上 10 次自我優化迭代和技術棧清理。

核心問題不是「能不能做」而是「用什麼順序做最高效」。Codebase 分析顯示基礎設施覆蓋率高，許多模組只需串接而非重寫。
Keywords: overtone, detection, auto, skill, forge, project, orchestrator, internalization, codebase

---
## 2026-03-05 | planner:PLAN Findings
**需求分解**：

1. **interview.js 引擎核心**（新建）
   | agent: developer | files: `plugins/overtone/scripts/lib/interview.js`
   建立訪談狀態機，純函式模組，API：`init` / `nextQuestion` / `recordAnswer` / `isComplete` / `generateSpec`

2. **Project Spec 模板**（新建）— 可與任務 1 並行
   | agent: developer | files: `plugins/overtone/skills/pm/references/project-spec-template.md`
   定義含 ≥10 個 BDD 場景骨架的標準格式，供 `generateSpec()` 組裝使用

3. **PM agent prompt 升級**（修改）— 依賴任務 1, 2
   | agent: developer | files: `plugins/overtone/agents/product-manager.md`
   加入訪談模式章節，透過 manage-component.js 更新（受 pre-edit-guard 保護）

4. **PM skill 更新**（修改）— 依賴任務 2
   | agent: developer | files: `plugins/overtone/skills/pm/SKILL.md`
   新增 project-spec-template.md 索引和 interview.js API 摘要，透過 manage-component.js 更新

5. **interview.js 單元測試**（新建）— 依賴任務 1 (parallel with 3, 4)
   | agent: developer | files: `tests/unit/interview.test.js`
   五個核心函式的完整測試（含邊界條件）

6. **整合測試**（新建）— 依賴所有前置任務
   | agent: developer | files: `tests/integration/interview.test.js`
   端到端驗證 10 輪問答流程、五面向覆蓋、Spec 格式正確性

**優先順序**：
- 第一批並行：任務 1 + 任務 2
- 第二批並行（第一批完成後）：任務 3 + 任務 4 + 任務 5
- 最後執行：任務 6

**範圍邊界**：明確不在此次範圍內：
- L3.5 Project Orchestrator 整合（訪談自動觸發）
- 訪談回答的跨 session 持久化
- Dashboard 訪談進度可視化
- 多語言支援
Keywords: interview, agent, developer, files, plugins, overtone, scripts, init, nextquestion, recordanswer

---
## 2026-03-05 | architect:ARCH Findings
**技術方案**：
- 新建 `interview.js`：純 CJS module（符合現有 lib 慣例），提供 `init/nextQuestion/recordAnswer/isComplete/generateSpec/loadSession/saveSession` 七個 API
- 靜態問題庫（五面向：functional/flow/ui/edge-cases/acceptance），每面向必問題 + 補充題，完成門檻可透過 options 覆蓋（預設 minAnswersPerFacet = 2）
- session 狀態存 `~/.overtone/sessions/{sessionId}/interview-state.json`，支援中斷恢復，使用 `utils.atomicWrite` 原子寫入
- Project Spec 直接寫檔到 `specs/features/in-progress/{featureName}/project-spec.md`（非 Handoff 輸出），確保無人值守場景下資料不丟失
- PM agent prompt 和 SKILL.md 透過 `manage-component.js` 更新（pre-edit guard 保護）

**關鍵技術決策和理由**：
- 靜態問題庫 vs LLM 生成 → 靜態：一致性高、可測試、0 latency
- CLI 入口 vs inline → inline（`node -e`）：與 knowledge-gap-detector.js、execution-queue.js 現有模式一致
- 寫檔 vs Handoff → 寫檔：Handoff 在 context compact 後消失，無人值守不可靠
- 無需更新 pre-task-handler.js：interview.js 是 PM agent 主動呼叫的工具，不是 Hook 注入 context

**API 介面**：

```javascript
// 七個核心函式（module.exports）
init(featureName, outputPath, options?)  → InterviewSession
nextQuestion(session)                    → Question | null
recordAnswer(session, questionId, answer) → InterviewSession
isComplete(session)                      → boolean
generateSpec(session)                    → ProjectSpec（並寫入 outputPath）
loadSession(statePath)                   → InterviewSession | null
saveSession(session, statePath)          → void
```

**資料模型**：
- `InterviewSession`：featureName, outputPath, answers(Record), startedAt, completedAt?, options
- `Question`：id（格式 `func-1`）, facet, text, required, dependsOn?
- `ProjectSpec`：feature, generatedAt, facets（functional/flow/ui?/edgeCases/acceptance>=10個BDD）
- `InterviewStateFile`：version:1, featureName, outputPath, answers, startedAt, completedAt?, options

**檔案結構**：

| 檔案 | 操作 | 用途 |
|------|------|------|
| `plugins/overtone/scripts/lib/interview.js` | 新增 | 引擎核心 |
| `plugins/overtone/skills/pm/references/interview-guide.md` | 新增 | PM agent 訪談指引 |
| `plugins/overtone/agents/product-manager.md` | 修改 | 新增多輪訪談模式章節 |
| `plugins/overtone/skills/pm/SKILL.md` | 修改 | 新增 interview-guide.md reference |
| `tests/unit/interview.test.js` | 新增 | 單元測試 |
| `tests/integration/pm-interview-integration.test.js` | 新增 | 整合測試 |

**Dev Phases**：
Keywords: interview, module, init, nextquestion, recordanswer, iscomplete, generatespec, loadsession, savesession, functional

---
## 2026-03-05 | architect:ARCH Context
PM agent 從「單輪分析」升級為「多輪結構化訪談」引擎。核心方案是新建 `interview.js` 引擎模組，提供靜態問題庫（五面向 20 題）+ session 狀態持久化 + BDD Project Spec 產生能力，再升級 PM agent prompt 和 PM SKILL.md 讓 PM agent 主動呼叫。
Keywords: agent, interview, session, project, spec, prompt, skill

---
## 2026-03-05 | doc-updater:DOCS Context
L3.4 深度 PM 多輪訪談引擎已完成開發、測試與代碼審查，進入文件同步階段。主要變更包括：

- **新增核心模組**：interview.js（多輪結構化訪談引擎，7 API，24 題問題庫）
- **新增操作指引**：interview-guide.md（PM 訪談操作指南）
- **升級 Agent**：product-manager.md（新增 Advisory vs Interview 模式）
- **升級 Skill**：pm/SKILL.md（新增 interview-guide.md reference）
- **測試補強**：43 個新增測試（33 unit + 10 integration）
- **版本更新**：0.28.61 → 0.28.62
Keywords: interview, guide, agent, product, manager, advisory, skill, reference, unit, integration

---
## 2026-03-05 | planner:PLAN Findings
**需求分解**：

1. `skill-evaluator.js` — 評估模組 | agent: developer | files: `scripts/lib/skill-evaluator.js`, `scripts/lib/score-engine.js`, `scripts/lib/knowledge/instinct.js`, `scripts/lib/timeline.js`, `scripts/lib/paths.js`

2. `skill-generalizer.js` — 通用化模組 | agent: developer | files: `scripts/lib/skill-generalizer.js`, `scripts/lib/skill-forge.js`, `plugins/overtone/skills/*/references/`

3. `experience-index.js` — 經驗索引模組 | agent: developer | files: `scripts/lib/experience-index.js`, `scripts/lib/paths.js`

4. `evolution.js internalize 子命令` | agent: developer | files: `scripts/evolution.js`（需 T1+T2+T3 完成）

5. `project-orchestrator.js 整合經驗查詢` (parallel with T6) | agent: developer | files: `scripts/lib/project-orchestrator.js`（需 T3 完成）

6. `health-check.js 新增 checkInternalizationIndex` (parallel with T5) | agent: developer | files: `scripts/health-check.js`（需 T3 完成）

7. `測試覆蓋`（unit x3 + integration x1）| agent: tester | files: `tests/unit/skill-evaluator.test.js`, `tests/unit/skill-generalizer.test.js`, `tests/unit/experience-index.test.js`, `tests/integration/skill-internalization.test.js`

**優先順序**：
- Phase 1（可並行）：T1 + T2 + T3
- Phase 2（需等 T1+T2+T3）：T4
- Phase 3（T3 後可並行）：T5 + T6
- Phase 4（全部完成後）：T7

**範圍邊界**：
- 不包含：跨專案 skill 語意合併、SessionEnd 自動觸發、Dashboard 可視化
- 不包含：多語言 skill 支援
Keywords: skill, evaluator, agent, developer, files, scripts, score, engine, knowledge, instinct

---
## 2026-03-05 | planner:PLAN Context
L3.7 Skill Internalization 目標是建立「經驗內化飛輪」：專案完成後，系統性評估哪些 skill 值得永久保留，通用化後合併到永久 skill 庫，並建立跨專案的「什麼樣的專案需要哪些 skill」經驗索引，加速未來專案啟動。

現有基礎設施：
- `score-engine.js`：JSONL append-only 評分記錄（scores.jsonl）
- `knowledge-archiver.js`：SubagentStop 時提取知識片段 → skill-router → auto-discovered.md
- `global-instinct.js`：高信心觀察升級到全域 store
- `timeline.js`：session 事件流（timeline.jsonl）
- `session-digest.js`：SessionEnd 時產生 session 摘要（digests.jsonl）
- `evolution.js`：現有 analyze/fix/forge/orchestrate 子命令，擴展模式已成熟
Keywords: skill, internalization, score, engine, jsonl, append, only, scores, knowledge, archiver

---
## 2026-03-05 | architect:ARCH Context
L3.7 Skill Internalization 的技術設計已完成。目標是建立「經驗內化飛輪」：從 session 學習資料評估知識條目是否值得永久保留，通用化後寫入 `skills/instinct/internalized.md`，並透過 experience-index 支援 project-orchestrator 加速能力盤點。
Keywords: skill, internalization, session, skills, instinct, internalized, experience, index, project, orchestrator

---
## 2026-03-05 | developer:DEV Context
實作 L3.7 Skill Internalization T2：`skill-generalizer.js` — 知識條目通用化處理器。

純函式模組，負責移除知識條目中的專案特定內容（段落級移除策略），使其可通用化後保存至 `skills/instinct/internalized.md`。
Keywords: skill, internalization, generalizer, skills, instinct, internalized

---
## 2026-03-05 | developer:DEV Findings
**根因分析**：
- `~/.overtone/.current-session-id` 是全域共享文件
- `on-submit-instinct.test.js` 執行 `on-submit.js` 子進程，此 hook 會將 `session_id` 寫入該共享文件
- `session-id-bridge.test.js` 的測試 A 先寫入自己的 session ID，再執行 `init-workflow.js`（從共享文件讀取）
- `bun test file1 file2` 同一 invocation 中多個文件並行執行（max-concurrency=20）
- 當這兩個文件在同一個 worker 中並行執行時，`on-submit-instinct.test.js` 的 `runHook` 可能在測試 A 的寫入和讀取之間覆寫共享文件，導致 `init-workflow.js` 讀到錯誤的 session ID，workflow.json 被建立在錯誤目錄

**修復方式**：
- 在 `test-parallel.js` 中新增 `SEQUENTIAL_FILES` 機制
- `session-id-bridge.test.js` 加入此列表，在所有並行 worker 完成後獨立執行
- 使用 `--max-concurrency=1` 確保完全隔離
- 不影響整體測試時間（+~0.3s），無需修改任何實作碼或測試邏輯

**確認**：
- 修復後執行 5 次 `test-parallel.js` 全部 pass
- `bun test` 3864 pass, 0 fail
Keywords: overtone, current, session, submit, instinct, test, hook, bridge, init, workflow

---
## 2026-03-05 | developer:DEV Findings
1. **health-check doc-code-drift** — 執行前已是 `passed: true`，無 drift 發現（doc-sync-engine 只追蹤 agents/skills/commands/hooks 四項，不含 scripts/lib 計數）
2. **docs-sync.test.js** — 28 pass，執行前後皆通過
3. **scripts/lib 實際計數**：
   - 頂層 `.js`：42 個
   - `analyzers/`：7 個
   - `knowledge/`：9 個
   - `dashboard/`：2 個
   - `remote/`：4 個
   - 總計：**64 個**（文件記載 51，差距 13 個）
4. **其他數字確認**：agents 18、skills 24、hooks 11、commands 28、health-check 17 項 — 均已正確
Keywords: health, check, code, drift, passed, true, sync, engine, agents, skills

---
## 2026-03-05 | developer:DEV Findings
**queryPastInterviews(projectRoot, options?)**
- 掃描 `~/.overtone/sessions/{sessionId}/interview-state.json`
- 支援 `options.limit`（預設 10）和 `options.feature`（依 feature 名稱過濾）
- 已完成的訪談（有 completedAt）排在未完成前面
- 無法讀取的 session 靜默跳過
- JSDoc 中避免使用 `*` 萬用字元（Bun 會把 JSDoc 註解中的 glob 路徑當成語法解析）

**extractInsights(sessions)**
- 純函式，無 I/O，輸入含 `answers` 欄位的 session 物件陣列
- functional 回答 → commonRequirements
- edge-cases 回答 → boundaryConditions
- flow + ui 回答 → userPreferences
- 各類別最多 5 筆，重複去重

**設計決策**
- `queryPastInterviews` 使用硬編碼 `~/.overtone` 路徑（與 paths.js 一致，不依賴 projectRoot 來定位 sessions）
- projectRoot 參數保留供未來依專案隔離訪談使用
Keywords: querypastinterviews, projectroot, options, overtone, sessions, sessionid, interview, state, json, limit

---
## 2026-03-05 | developer:DEV Context
實作了 PM agent 的跨 session 記憶能力。在 `interview.js` 新增兩個 export 函式，讓 PM 在開始新訪談前可以查詢並參考過去的訪談記錄。
Keywords: agent, session, interview, export

---
## 2026-03-05 | code-reviewer:REVIEW Findings
無 Critical 或 Major 等級問題。

[n] `extractInsights` 的 JSDoc `@param` 描述的型別是 `queryPastInterviews` 回傳的 sessions 陣列（不含 `answers`），但實際函式需要含 `answers` 欄位的完整 session 物件（來自 `loadSession`）。JSDoc 已在描述中補充「需包含完整 answers，來自 loadSession」，但型別定義與實際需求不一致。不阻擋合併。
Keywords: critical, major, extractinsights, jsdoc, param, querypastinterviews, sessions, answers, session, loadsession

---
## 2026-03-05 | developer:DEV Context
完成 `skill-router-tune`（opt-7）：調優 `skill-router.js` 路由演算法，提升 agent 知識路由的精準度，減少歧義詞造成的 false positive。
Keywords: skill, router, tune, agent, false, positive

---
## 2026-03-05 | developer:DEV Findings
- **格式 2 跨 skill 引用問題**：最初的 regex 錯誤地把跨 skill 引用（如 `auto` skill 引用 `workflow-core/references/handoff-protocol.md`）解析為當前 skill 的路徑，導致 9 個假陽性 error。修正方式：格式 2 改用捕捉完整三部分（`targetSkill`、`type`、`file`），驗證 `skills/{targetSkill}/{type}/{file}` 的實際存在
- **`crossRefs` Set 無效問題**：物件在 Set 中比對引用而非值，需改用字串 key 去重（`${targetSkill}/${type}/${file}`）
- **計數斷言更新**：共 6 個測試檔案有計數斷言需更新（17 → 19），其中 `health-check-internalization.test.js` 未在 MEMORY.md 配套清單中記錄，已補充
Keywords: skill, regex, auto, workflow, core, references, handoff, protocol, error, targetskill

---
## 2026-03-05 | developer:DEV Findings
- registry 匯出 `workflows`（非 `WORKFLOW_TYPES`），timeline 匯出 `emit`（非 `appendEvent`）— 初次斷言錯誤，已根據實際 API 修正
- `evolution.js status` 子命令存在且 exit 0
- `queue.js list` 空佇列時 exit 1 為預期行為，測試接受 `[0, 1]`
- spawn 時加入 `OVERTONE_NO_DASHBOARD=1` 和 `OVERTONE_TEST=1` 避免副作用
- 18 個測試全部通過，執行時間約 2.3s
Keywords: registry, workflows, timeline, emit, appendevent, evolution, status, exit, queue, list

---
## 2026-03-05 | retrospective:RETRO Findings
**回顧摘要**：

1. **架構一致性良好**：`extractWebKnowledge` 的設計遵循 Overtone 的降級（graceful fallback）模式 — `tryWithTools()` 失敗或品質不足時自動 fallback 到 `tryWithoutTools()`，符合系統一貫的容錯設計。

2. **快取機制設計合理**：
   - 快取路徑選在 `skills/{domain}/references/web-research.md`，與現有 references/ 目錄結構一致
   - TTL 使用 `fs.statSync().mtimeMs`（基於檔案修改時間）而非寫入後追蹤，語意正確
   - 空字串不寫入快取，邊界情況處理得宜

3. **品質驗證（isQualityResearch）門檻保守但合理**：只檢查是否含 `## 或 ###` 標題。雖然門檻低，但配合 fallback 邏輯（品質不足時再試 without tools），整體防誤判能力足夠。

4. **測試覆蓋完整**：Feature 8（enableWebResearch）+ Feature 9（快取機制）共 15 個新測試涵蓋主要路徑，包含快取命中、未命中、空字串、TTL 過期前（9-3）等場景。

5. **Overtone principles checklist**：
   - 自動修復：`extractWebKnowledge` 有雙層 try-catch + fallback，符合容錯原則
   - 補全能力：快取寫入時自動建立 `references/` 目錄（`mkdirSync recursive`），符合慣例
   - 驗證品質：測試覆蓋到位，新函式全部從 `module.exports` 導出供測試使用

6. **一個觀察（信心不足 70%，不列為 ISSUES）**：`isQualityResearch` 的截斷發生在 `extractWebKnowledge` 之後（先截斷後判斷品質），若截斷恰好切到最後一個 section header 之前理論上可能誤判為低品質。但 5000 字元的截斷上限實際上遠大於任何合法的 section header，此情況在實際執行中概率極低，不構成可報告問題。
Keywords: extractwebknowledge, overtone, graceful, fallback, trywithtools, trywithouttools, skills, domain, references, research

---
## 2026-03-05 | doc-updater:DOCS Findings
本次 commit (507a401) 修復了 PM domain research session 持久化的問題：

**實作變更**：
- `plugins/overtone/scripts/lib/interview.js`：
  - `saveSession()` 新增 `domainResearch: session.domainResearch || null` 序列化
  - `loadSession()` 新增 `domainResearch: data.domainResearch || undefined` 還原
  - 確保含領域研究的 session 在中斷恢復時研究資料完整性

**測試補強**：
- `tests/unit/pm-domain-research.test.js`：新增 2 個 roundtrip 測試
  - Scenario 4-1：含 domainResearch 的 session 存取後完整保留
  - Scenario 4-2：無 domainResearch 的 session 存取後 domainResearch 為 undefined

**更新的文件**：

1. **CHANGELOG.md**：
   - 新增 [0.28.64] bugfix 條目（修復 domainResearch 序列化）
   - 補充 [0.28.63+feature] 說明（pm-domain-research 功能，3 個新 API：researchDomain/startInterview/getResearchQuestions）
   - 測試統計更新（4054 → 4086 → 4088）

2. **docs/status.md**：
   - 更新「最後更新」版本描述（含 pm-domain-research + bugfix）
   - 更新「測試通過」：4054 → 4088 pass（+34 個測試）
   - 更新「近期變更」（3 筆最新）：0.28.64 pm-domain-research + 0.28.63+feature auto-forge-trigger/queue-cli-enhancement + 0.28.62 internalization

3. **docs/roadmap.md**：
   - L3.4 深度 PM 狀態：🟡 部分完成 → ✅ 完成
   - L3.4 子項「領域研究整合」：⬜ → ✅（新增 researchDomain/startInterview/getResearchQuestions 三個 API）

4. **plugins/overtone/skills/pm/references/interview-guide.md**（技術同步）：
   - 新增「領域研究 API」表格（researchDomain/startInterview/getResearchQuestions）
   - 更新「領域研究整合」章節，加入新 API 使用說明與流程
   - 補充呼叫範例：「帶領域研究的完整訪談流程」

5. **plugins/overtone/skills/claude-dev/references/auto-discovered.md**（自動知識記錄）：
   - Hook 自動記錄 pm-domain-research feature 實作訊息
Keywords: commit, domain, research, session, plugins, overtone, scripts, interview, savesession, domainresearch

---
## 2026-03-05 | doc-updater:DOCS Context
pm-domain-research 功能 + bugfix 提交已完成。涉及 interview.js 核心模組（saveSession/loadSession domainResearch 欄位序列化修復）和測試新增（2 個 roundtrip 測試）。
Keywords: domain, research, bugfix, interview, savesession, loadsession, domainresearch, roundtrip

---
## 2026-03-05 | developer:DEV Findings
**主要實作決策：**

1. `buildBDDScenarios` 改為從三個 facet 衍生場景：
   - `acceptance` facet → 驗收場景（given 含「功能已啟用」）
   - `edge-cases` facet → 邊界條件場景（given 含「邊界條件」，title 以「邊界場景：」開頭）
   - `flow` facet → 流程場景（given 含「操作流程」，title 以「流程場景：」開頭）
   - 內建 title 去重（Set 追蹤）

2. `enrichBDDScenarios(scenarios, session)` 新增為獨立導出函式：
   - 先對傳入 base 陣列進行 title 去重（防禦性）
   - 從 `functional` facet 補充 happy path 場景（title 以「功能場景：」開頭）
   - 加入三個通用模板（空輸入、權限不足、網路逾時），但透過關鍵詞比對跳過 edgeCases 已涵蓋的議題
   - Fallback 到 `buildSupplementaryScenarios` 確保到達 10 個

3. `generateSpec` 改為：`enrichBDDScenarios(buildBDDScenarios(session), session)`，雙重保險確保場景數

**函式宣告順序**：`buildBDDScenarios`（330）在 `enrichBDDScenarios`（439）之前，因為兩者均為 `function` 宣告，JavaScript hoisting 正常運作。
Keywords: buildbddscenarios, facet, acceptance, given, edge, cases, title, flow, enrichbddscenarios, scenarios

---
## 2026-03-05 | developer:DEV Context
強化 `interview.js` 的 `buildBDDScenarios()` 函式，新增從多個 facet 自動衍生 BDD 場景的能力，並新增 `enrichBDDScenarios()` 函式確保場景數量達到 PM spec 的最低要求（≥10 個）。
Keywords: interview, buildbddscenarios, facet, enrichbddscenarios, spec

---
## 2026-03-05 | retrospective:RETRO Findings
**回顧摘要**：

1. **架構一致性良好** — `buildBDDScenarios` 內部在場景不足 10 個時呼叫 `enrichBDDScenarios`，`generateSpec` 又以 `enrichBDDScenarios(buildBDDScenarios(session), session)` 組合兩層。表面上看像雙重調用，但邏輯正確：`buildBDDScenarios` 內部的 `enrichBDDScenarios` 呼叫只發生在場景 < 10 時，且 `generateSpec` 的外層 `enrichBDDScenarios` 是幂等的（`seenTitles` 去重保護），不會造成重複或錯誤。

2. **去重邏輯一致** — `buildBDDScenarios` 與 `enrichBDDScenarios` 皆使用 `Set` 追蹤 `seenTitles`，兩個函式邊界清晰，互不破壞對方的不變量。

3. **測試覆蓋結構合理** — 16 個測試橫跨 Feature A（場景衍生）、Feature B（補充邏輯）、Feature C（generateSpec 整合），涵蓋邊界情境（空輸入、極少回答、已滿場景、去重）。

4. **純函式設計確認** — `enrichBDDScenarios` 不修改傳入的 `scenarios` 陣列（Scenario B-4 驗證），符合不可變原則。

5. **Overtone 原則 Checklist 對照**：
   - 測試通過（DEV Handoff 確認）
   - 行為符合規格（場景 ≥10、多 facet 衍生、去重）
   - `generateSpec` 的錯誤路徑有 `try-catch` 保護並拋出帶 code 的 Error

6. **一個觀察（信心 < 70%，不列為 ISSUES）** — `generateSpec` 在 `acceptance` facet 的處理為 `enrichBDDScenarios(buildBDDScenarios(session), session)`，其中 `buildBDDScenarios` 本身在場景不足時已內部呼叫 `enrichBDDScenarios`，外層再包一次雖然幂等但稍顯冗餘。這是設計選擇而非缺陷，且無法量化其對行為的影響，因此不升為 ISSUES。
Keywords: buildbddscenarios, enrichbddscenarios, generatespec, session, seentitles, feature, scenarios, scenario, overtone, checklist

---
## 2026-03-05 | code-reviewer:REVIEW Findings
審查了以下面向，未發現高信心問題：
- **功能完整性**：buildBDDScenarios 的多 facet 衍生 + enrichBDDScenarios 的三層補充策略 + generateSpec 整合，均符合需求
- **去重機制**：title-based Set 去重在 buildBDDScenarios 和 enrichBDDScenarios 中各有獨立實作，防禦性足夠
- **Error handling**：answers[q.id] 為空時 `if (!answer) continue` 正確處理、enrichBDDScenarios 對空陣列輸入有防禦
- **測試覆蓋**：16 個新測試涵蓋 facet 衍生、補充策略、去重、immutability、通用模板條件判斷、generateSpec 整合
- **向後相容**：33 個既有 interview.test.js 測試全部通過
- **安全性**：無硬編碼 secrets、無外部輸入注入風險

[m] 雙重 enrichBDDScenarios 呼叫是有意設計（雙重保險），功能正確但略增認知負擔。
Keywords: buildbddscenarios, facet, enrichbddscenarios, generatespec, title, based, error, handling, answers, answer

---
## 2026-03-05 | doc-updater:DOCS Findings
- ✅ 無新 CLI 指令
- ✅ 無新 agent/hook/skill 配置
- ✅ 無公開 API 新增（enrichBDDScenarios 是內部實現）
- ✅ 無架構決策點變更
- ✅ README/CHANGELOG 無需同步
Keywords: agent, hook, skill, enrichbddscenarios, readme, changelog

---
## 2026-03-05 | doc-updater:DOCS Context
開發完成 pm-spec-bdd-enrichment feature，變更限於：
- `plugins/overtone/scripts/lib/interview.js` — 內部函式強化（buildBDDScenarios 多 facet 衍生、enrichBDDScenarios 補充場景）
- `tests/unit/pm-bdd-enrichment.test.js` — 新增 16 個測試
Keywords: spec, enrichment, feature, plugins, overtone, scripts, interview, buildbddscenarios, facet, enrichbddscenarios

---
## 2026-03-05 | developer:DEV Findings
- `config-io.js` 導出 8 個函式：`resolveCommand`、`readAgentFile`、`readSkillFile`、`readHooksJson`、`getHookHandler`、`readRegistryData`、`writeRegistryData`、`readPluginJson`、`writePluginJson`
- 使用 tmpdir 隔離，`beforeEach` 建立、`afterEach` 清理，符合現有測試慣例
- `rmSync` 需加 `{ force: true }` 以防前一個測試（如 `writeRegistryData`）沒有預建目標檔案的情況（初始 `makeTmpPluginRoot` 不預建 `registry-data.json`）
- `getHookHandler` 有副本不污染原始物件的測試，驗證 spread 行為
Keywords: config, resolvecommand, readagentfile, readskillfile, readhooksjson, gethookhandler, readregistrydata, writeregistrydata, readpluginjson, writepluginjson

---
## 2026-03-05 | developer:DEV Findings
- `config-validator.js` 有 6 個公開導出（`validateAgent`、`validateHook`、`validateSkill`、`validateAll`、`validateAgentFrontmatter`、`validateSkillFrontmatter`），測試全部覆蓋。
- `loop.js` 有 4 個公開導出（`readLoop`、`writeLoop`、`exitLoop`、`readTasksStatus`），測試全部覆蓋。
- **關鍵發現**：`readTasksCheckboxes` 只解析 `## Stages` 或 `## Tasks` 區塊的 checkbox，測試 tasks.md 必須包含這些標頭；未含標頭的測試會得到 null 回傳值。
- **關鍵發現**：`validateHook` 的 `resolveCommand` 只替換 `${CLAUDE_PLUGIN_ROOT}` 佔位符，測試中 hooks.json 的 command 必須使用此格式。
- `exitLoop` 會向 timeline.jsonl emit 兩個事件（`loop:complete` + `session:end`），測試透過真實 session 目錄操作驗證。
- 全部 41 個新測試通過，整體 4167 pass, 0 fail。
Keywords: config, validator, validateagent, validatehook, validateskill, validateall, validateagentfrontmatter, validateskillfrontmatter, loop, readloop

---
## 2026-03-05 | developer:DEV Findings
**根因分析**：
- `failure-tracker.js` 的 `recordResolution()` 函數把 `verdict: 'resolved'` 的記錄寫入 `failures.jsonl`，格式為 `{ ts, sessionId, stage, verdict: 'resolved' }`（無 `agent` 欄位），這是設計行為，用於 `_filterResolved()` 的去重機制
- `health-check.js` 的驗證規則要求 `failures.jsonl` 所有記錄必須含 `agent` 欄位，且 `verdict` 只允許 `'fail'` 或 `'reject'`，未考慮 `resolved` 記錄的存在
- 受影響資料：`~/.overtone/global/7f2b45a9/failures.jsonl` 中 101 行有 50 行 `resolved` 記錄，損壞率 49.5%（遠超 10% 觸發門檻）

**修復方式**：
- `required` 欄位從 `['ts', 'stage', 'agent', 'verdict']` 改為 `['ts', 'stage', 'verdict']`（resolved 無需 agent）
- 合法 `verdict` 值擴充為 `fail` / `reject` / `resolved`
- 針對 `fail`/`reject` 記錄額外驗證 `agent` 欄位存在

**測試前後**：修改前 test-parallel.js 15 fail，修改後 14 fail（少了 1 個 — data-quality 的 spawn 測試不再失敗，無新增失敗）
Keywords: failure, tracker, recordresolution, verdict, resolved, failures, jsonl, sessionid, stage, agent

---
## 2026-03-05 | developer:DEV Findings
**設計決策：**
- `extractWebKnowledge` 回傳格式從 `string` 改為 `{ content, error, duration? }` 物件
- `assembleSkillBody` 向後相容：`webResearch` 欄位同時接受新格式物件（取 `.content`）或舊格式字串，避免破壞現有直接傳字串的呼叫方
- `forgeSkill` 從 `webResult.content` 取字串，並額外保存 `extracts.webResearchMeta`（供未來診斷使用）
- timeout 偵測透過 Bun.spawnSync 的 `signalCode === 'SIGTERM'` 或 `exitCode === null` 判斷
- spawn 失敗透過 catch 塊捕捉，回傳 `error: 'spawn_failed', detail: err.message`

**Feature 10 測試策略：**
- Scenario 10-1、10-2：驗證結構化格式的 shape（無法真實觸發 timeout 不讓測試變慢，改用格式驗證）
- Scenario 10-3：用快取命中路徑驗證成功格式
- Scenario 10-4：測試環境 claude 不可用時不拋出，回傳含 error 的物件
- Scenario 10-5、10-6：驗證 `assembleSkillBody` 新格式相容性
- Scenario 10-7：驗證 `forgeSkill` graceful fallback
Keywords: extractwebknowledge, string, content, error, duration, assembleskillbody, webresearch, forgeskill, webresult, extracts

---
## 2026-03-05 | developer:DEV Findings
- `interview.test.js` 已有 33 個測試，覆蓋了主要功能路徑；邊界情況（null/undefined 答案、roundtrip 欄位完整性、問題池耗盡等）未被覆蓋
- `enrichBDDScenarios` 已從 `module.exports` 匯出，可直接 require 測試
- `buildBDDScenarios` 未匯出，透過 `generateSpec` 間接驗證
- `Scenario D-2`（skipFacets 跳過所有必問面向）：`isComplete` 的邏輯是 `facetsToCheck` 為空陣列時 for loop 不執行，直接返回 true — 行為符合設計
Keywords: interview, test, null, undefined, roundtrip, enrichbddscenarios, module, exports, require, buildbddscenarios

---
## 2026-03-05 | developer:DEV Findings
- 選定場景：**Markdown 部落格生成器（`md-blog`）CLI 工具**
  - 理由：Overtone 完全不熟悉 static-site-generation 領域，確保 Skill Forge 會真實觸發
  - 涵蓋 L3 全鏈路：deep-pm（L3.4）→ Skill Forge（L3.3）→ Orchestrator（L3.5）→ Internalization（L3.7）
- proposal.md 結構完整：場景描述 / 系統能力觸發 / BDD 驗收（6 個 Scenario）/ 執行計劃（6 步）/ 風險矩陣 / 成功定義
- 唯一預期人工介入點：Step 2 PM 訪談問答（其餘全自動）
- roadmap.md 的 L3.6 從「場景待定」升級為含完整觸發能力表和驗收說明，並連結到 proposal.md
Keywords: markdown, blog, overtone, static, site, generation, skill, forge, deep, orchestrator

---
## 2026-03-05 | developer:DEV Findings
- 進化引擎共 8 個模組：`gap-analyzer` / `gap-fixer` / `skill-forge` / `knowledge-gap-detector` / `project-orchestrator` / `skill-evaluator` / `skill-generalizer` / `experience-index`
- CLI 入口為 `evolution.js`，支援 6 個子命令（status / analyze / fix / forge / orchestrate / internalize）
- 整合點有 5 個：health-check（上游資料）/ pre-task-handler（即時警告）/ execution-queue（任務排程）/ instinct + PostToolUse（觀察來源）/ score-engine（評分資料）
- `overtone.md` 已更新，進化引擎文件加在 decision-points 和 workflow-diagram 之間
Keywords: analyzer, fixer, skill, forge, knowledge, detector, project, orchestrator, evaluator, generalizer

---
## 2026-03-05 | developer:DEV Context
修復 health-check 的 `quality-trends` warning（`warnings: 1` → `warnings: 0`）。

根本原因：整合測試與 e2e 測試透過子進程執行 hook 腳本時，未設定 `OVERTONE_TEST=1` 環境變數，導致子進程內的 `failure-tracker.recordFailure` 直接寫入真實的 `~/.overtone/global/{projectHash}/failures.jsonl`，累積 40 筆測試假資料，使 TEST stage 失敗計數達到 15 次，觸發門檻 10 次的 warning。
Keywords: health, check, quality, trends, warning, warnings, hook, failure, tracker, recordfailure

---
## 2026-03-05 | developer:DEV Findings
- `init-workflow.js` 需要 workflowType 和 sessionId 兩個參數，`atomicWrite` 會自動建立目錄。
- 每個 workflow 用獨立的臨時 sessionId（`smoke-test-wf-{name}-{timestamp}`），`afterAll` 自動清理，不污染真實環境。
- `beforeAll` 僅計算 sessionId，不預建目錄，由 `init-workflow.js` 的 `initState` 透過 `atomicWrite` 自動建立。
- 新增 18 個測試後，smoke.test.js 共 36 個測試，全部通過（2.61s）。
- `init-workflow.js` 執行時還會推進 execution-queue，但在測試環境（`OVERTONE_NO_DASHBOARD=1`, `OVERTONE_TEST=1`）中不會有副作用。
Keywords: init, workflow, workflowtype, sessionid, atomicwrite, smoke, test, name, timestamp, afterall

---
## 2026-03-05 | developer:DEV Findings
- 現有 `skill-forge.test.js` 已覆蓋 API 行為（status、conflict、paused）和 SKILL.md 三 section 存在性（Feature 7），本次測試聚焦在現有測試未涵蓋的品質面向
- `assembleSkillBody` 確認輸出 `# {domain} 知識域` 格式的標題，且 `buildSkillContent` 產生的 description 固定包含 domain 名稱（`${domainName} 知識域。提供 ${domainName} 相關的知識和參考資料。`），因此品質門檻測試全部通過
- 不需要調整模板（模板品質已足夠）
- 測試使用 `TMP_BASE` 統一清理策略，`beforeAll` 建立目錄，`afterAll` 遞迴清理
- 20 個測試，15ms 執行時間（純函數呼叫，無 spawn）
Keywords: skill, forge, test, status, conflict, paused, section, feature, assembleskillbody, domain

---
## 2026-03-06 | planner:PLAN Findings
**需求分解**：

1. **建立 tts.js 核心模組** | agent: developer | files: `plugins/overtone/scripts/os/tts.js`
   — speak() + listVoices() + CLI 入口，仿照 sound.js 非阻塞 + notification.js 不 throw 慣例

2. **建立 tts-templates.js 口語模板**（可與 1 並行）| agent: developer | files: `plugins/overtone/scripts/lib/tts-templates.js`
   — 事件鍵 → 自然口語字串映射表，`getTemplate(eventKey, params)` 統一入口

3. **建立 tts-strategy.js 事件語音策略**（依賴 1、2）| agent: developer | files: `plugins/overtone/scripts/lib/tts-strategy.js`
   — shouldSpeak(eventKey, level) + buildSpeakArgs()，讀取 config tts.level

4. **Hook 整合**（依賴 3）| agent: developer | files: `agent-stop-handler.js`、`session-stop-handler.js`、`hooks/scripts/notification/on-notification.js`
   — 在 stage completed / workflow completed / elicitation_dialog 路徑觸發語音

5. **單元測試**（依賴 1-4）| agent: tester | files: `tests/unit/os/tts.test.js`、`tests/unit/lib/tts-templates.test.js`、`tests/unit/lib/tts-strategy.test.js`

**優先順序**：
- 任務 1 和 2 可並行先做（互不依賴）
- 任務 3 需等 1 和 2 完成
- 任務 4（hook 整合）需等 3 完成
- 任務 5（測試）伴隨 1-4 同步撰寫或最後集中補齊

**範圍邊界**：
- 非 macOS 平台不在此版本
- 無 Dashboard UI 控制介面
- 無串流 TTS、無語音辨識
- level=3 的 PostToolUse 整合待 architect 確認後決定是否納入
Keywords: agent, developer, files, plugins, overtone, scripts, speak, listvoices, sound, notification

---
## 2026-03-06 | planner:PLAN Context
使用者要為 Overtone 加入語音輸出能力。核心動機是：使用者背對螢幕工作時，現有的 Hero.aiff 音效資訊量不足，需要口語說出工作進度。MVP 聚焦在 macOS `say` 指令封裝 + 三級事件語音策略 + Hook 整合。

架構上有清楚的先例可循：`sound.js`（spawn + detach 非阻塞）、`notification.js`（依賴注入 + 不 throw）、`screenshot.js`（UNSUPPORTED_PLATFORM 模式），tts.js 的慣例已完全確定。
Keywords: overtone, hero, aiff, macos, hook, sound, spawn, detach, notification, throw

---
## 2026-03-06 | retrospective:RETRO Findings
**回顧摘要**：

**架構一致性 — 良好**
三層模組分工明確：`tts.js`（OS 底層）、`tts-templates.js`（純資料）、`tts-strategy.js`（決策引擎）。各層職責單一，無跨層污染。Hook 整合三處（agent-stop-handler、session-stop-handler、on-notification）模式完全一致，均採 try/catch fire-and-forget，符合設計規格。

**BDD 對齊度 — 完整**
BDD spec 共 30 個 Scenario，實作測試 64 個（覆蓋率超越 spec）。逐一核查：所有 Scenario 均有對應測試，模板鍵、level 邊界值、設定合併邏輯均在測試範圍內。

**Command Injection 風險評估 — 可接受**
`_buildSayArgs` 在 `execSync` 路徑使用字串拼接，`text` 做了 `replace(/"/g, '\\"')` 跳脫雙引號，`voice` 未做跳脫（第 134 行 `` -v "${opts.voice}" ``）。

評估：`voice` 值的來源是 `~/.overtone/tts.json` 由使用者自己設定，屬本機信任邊界內的設定欄位，不存在遠端攻擊面。攻擊者若能控制該設定檔，等同已控制本機，風險等級不構成信心 >=70% 的安全問題。此外 `speakBackground` 使用 `spawn` 陣列形式，無 shell injection 問題。

**測試品質 — 扎實**
依賴注入完整覆蓋所有 OS 呼叫。邊界值（空字串、空白字串、非 darwin 平台、設定欄位型別轉換）均有測試。三個測試檔共 64 個測試，結構清晰無重複。

**Hook 整合安全性 — 符合規範**
三處整合均在 `try/catch` 內以 `require()` 懶加載，確保主流程隔離。`speakBackground` 回傳值未被使用（fire-and-forget 語意正確）。

**潛在觀察（信心 <70%，不列為問題）**
- `_buildSayArgs`（execSync 路徑）與 `_buildSayArgsArray`（spawn 路徑）並存。前者因歷史設計使用字串拼接，若未來有需求可統一改為 spawn，但目前功能正確，不構成問題。
- `docs/status.md` 未提及 TTS 新增的三個模組，但 status.md 的更新職責屬於 doc-updater 階段，不在此回顧範圍內。
Keywords: templates, strategy, hook, agent, stop, handler, session, notification, catch, fire

---
## 2026-03-06 | doc-updater:DOCS Context
更新 tts-voice-system 功能的所有文件，確保文件與實作一致。本次變更包括：
- 新增 3 個模組：`plugins/overtone/scripts/os/tts.js`、`tts-templates.js`、`tts-strategy.js`
- 新增 3 個測試檔，共 64 個新測試
- Hook 整合：agent-stop-handler + session-stop-handler + on-notification
- 64 個新測試 → 總測試數 4381（對應 194 個測試檔）
Keywords: voice, system, plugins, overtone, scripts, templates, strategy, hook, agent, stop

---

---
## 2026-03-06 | developer:DEV Context
實作 Instinct 知識歸檔來源過濾（`instinct-pollution-fix` feature），防止 Overtone 在外部專案工作時將外部知識污染 skill 的 `auto-discovered.md`。同步清理 5 個 domain 的既有污染條目。
Keywords: instinct, pollution, feature, overtone, skill, auto, discovered, domain

---
## 2026-03-06 | tester:TEST:2 Context
模式：verify
執行 instinct-pollution-fix feature 的 BDD 規格驗證。BDD spec 已歸檔至 `/Users/sbu/projects/overtone/specs/features/archive/2026-03-06_instinct-pollution-fix/bdd.md`（非 in-progress）。
Keywords: verify, instinct, pollution, feature, spec, users, projects, overtone, specs, features

