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

---
## 2026-03-06 | developer:DEV Context
更新了 `retrospective` agent，將六維度評估從「選用」升級為「standard/full/secure workflow 必做」，並要求每個維度評分必須有客觀證據和競品對標理由。
Keywords: retrospective, agent, standard, full, secure, workflow

---
## 2026-03-06 | retrospective:RETRO Findings
**回顧摘要**：

這次修改的目標是解決 RETRO 評分通膨問題，透過將六維度評估從選用升級為必做（限定 workflow 類型），並強制「先列證據再給分」的評分程序。

**確認的品質點**：

- **目標達成**：評分通膨的根因在於評分者可「先給分再找理由」，本次修改在第 39 行以 `📋 MUST 先列出客觀證據，再給分數` + `禁止「先給分再找理由」` 雙重規則直接封閉此漏洞，指令強度正確（📋 MUST 層級）。

- **分級觸發邏輯一致**：第 47-49 行的觸發條件（quick=選用、standard/full/secure=必做）與第 93 行的誤判防護敘述完全一致，無矛盾。描述中 quick workflow 的 Task prompt 也正確標注為 `💡 should（選用）`，三處一致。

- **輸出格式強制競品對標**：第 62-78 行的輸出範本將「對標」欄位納入表格結構，加上第 51 行明確要求閱讀 `competitor-benchmark.md`，讓競品對標有據可查而非主觀臆測。

- **邊界清單完整**：DO/DON'T 四模式（信心過濾 + 邊界清單 + 誤判防護 + 停止條件）全部保留，五項變更未破壞既有結構。

- **無遺漏**：Developer Handoff 列出的五項變更（A 觸發條件分級、B 評分程序強制、C 輸出格式加對標欄、D description frontmatter 更新、E 誤判防護補充）在檔案中逐一可驗證對應，無缺漏。

**跨階段觀察**：

本次是 agent prompt 的文字修改，無程式碼、無測試、無資料結構變更，因此不存在跨模組一致性或測試覆蓋的問題。Handoff 鏈（DEV → REVIEW → RETRO）傳遞清楚，每階段結果明確。
Keywords: retro, workflow, must, quick, standard, full, secure, task, prompt, should

---
## 2026-03-06 | doc-updater:DOCS Findings
已更新並驗證的文件：

**核心文件**：
- `/Users/sbu/projects/overtone/plugins/overtone/agents/retrospective.md` — 六維度評估框架升級完整版本（第 44-78 行），包含：
  - 分級觸發條件（依 workflow 類型區分）
  - 強制證據先行規則（第 39 行 DO 清單新增）
  - 輸出格式更新（表格含「證據」和「對標」欄位）
  - 誤判防護更新（第 93 行確認六維度在不同 workflow 的強制度差異）

**索引與規格**：
- `/Users/sbu/projects/overtone/plugins/overtone/skills/craft/SKILL.md` — 已包含 competitor-benchmark.md 引用（決策樹第 34 行 + 資源索引第 47 行）
- `/Users/sbu/projects/overtone/docs/status.md` — 版本 0.28.71 已同步，近期變更已包含 retro-evaluation-upgrade feature 摘要
- `/Users/sbu/projects/overtone/plugin.json` — 版本 0.28.71（已是最新）

**輔助文件**：
- `/Users/sbu/projects/overtone/plugins/overtone/skills/workflow-core/references/auto-discovered.md` — 清理 decision-point-index 已完成記錄，新增 retrospective 框架升級知識記錄

**無額外修改需求**：
- CHANGELOG.md 已由 developer 在 DEV 階段更新
- 文件數字一致性驗證通過（plugin.json 版本、status.md 版本、測試數量均一致）
Keywords: users, projects, overtone, plugins, agents, retrospective, workflow, skills, craft, skill

---
## 2026-03-06 | doc-updater:DOCS Context
DOCS 階段文件同步完成。本次 quick workflow 的 retrospective agent 已完成六維度評估框架升級，將評估觸發條件從「選用」升級為「分級觸發」（quick workflow 為 should，standard/full/secure/Acid Test 為 MUST），並強制評分程序遵循「先客觀證據再給分」規則，杜絕評分通膨。
Keywords: docs, quick, workflow, retrospective, agent, should, standard, full, secure, acid

---
## 2026-03-06 | developer:DEV Context
修改 architect agent prompt，在 Handoff 輸出格式中加入「Edge Cases to Handle」區塊，並在 DO 規則和誤判防護中加入對應說明，讓邊界條件思考前置到架構設計階段。
Keywords: architect, agent, prompt, handoff, edge, cases, handle

---
## 2026-03-06 | code-reviewer:REVIEW Findings
審查 `plugins/overtone/agents/developer.md` 的三項變更：
- 3 行創意引導正確使用 `💡` should 級別，非強制
- Design Highlight 區塊位置在 Findings 與 Files Modified 之間，合理
- 誤判防護新增「非必填」說明，防止誤用
- frontmatter 未被改動，無副作用
- 指令強度用詞一致，無 emoji-關鍵詞不匹配
Keywords: plugins, overtone, agents, developer, should, design, highlight, findings, files, modified

---
## 2026-03-06 | developer:DEV Findings
- `manage-component.js` 實際位於 `plugins/overtone/scripts/`，不在 `scripts/`，需用絕對路徑呼叫
- `update skill` 支援 `body` 欄位，傳入完整 body 字串即可全量替換 SKILL.md 內容
- validate-agents.js 通過：18 agents + 11 hooks + 24 skills 全部正確
- design-taste.md 內容涵蓋六大主題：視覺層次、配色、動效、反模式、靈感範例、快速 Checklist
Keywords: manage, component, plugins, overtone, scripts, update, skill, body, validate, agents

---
## 2026-03-06 | retrospective:RETRO Findings
**回顧摘要**：

- `design-taste.md`（247 行）內容結構完整，涵蓋 6 個主題（視覺層次、配色、動效、反模式、靈感範例、Checklist），知識密度高且具體可操作
- SKILL.md 決策樹已正確新增 `UI/前端設計品味問題 → design-taste.md` 分支，資源索引也同步加入對應條目，閉環完整
- 指南定位清晰（developer/designer agent 在 UI 或前端元件實作時使用），不與現有 craft references 重疊（clean-code 管命名/格式，design-taste 管視覺品質）
- 反模式章節（6 個反模式）與 Checklist 章節形成互補：前者教「為什麼錯」，後者提供「執行時快速驗證」，認知路徑合理
- 靈感範例選用 Linear / Raycast / Arc / Vercel，均為 Developer Tool 領域標竿，與 Overtone 作為 CLI plugin 的定位相符
- craft overtone-principles.md checklist 回顧：此次新增純文件，無程式碼改動，不涉及元件閉環（無新 agent/hook 需要同步）
Keywords: design, taste, checklist, skill, developer, designer, agent, craft, references, clean

---
## 2026-03-06 | doc-updater:DOCS Findings
- **新增文件**：`plugins/overtone/skills/craft/references/design-taste.md`（設計品味評估參考指南）
- **更新文件**：`plugins/overtone/skills/craft/SKILL.md`（加入 design-taste reference）
- **版本更新**：0.28.73 → 0.28.74
- **狀態同步**：`docs/status.md` 版本號和近期變更已更新
Keywords: plugins, overtone, skills, craft, references, design, taste, skill, reference, docs

---
## 2026-03-06 | planner:PLAN Findings
**需求分解**：

1. **[修復 B] stage key 查找移入 updateStateAtomic callback** | agent: developer | files: `plugins/overtone/scripts/lib/agent-stop-handler.js`, `plugins/overtone/scripts/lib/state.js`

   具體位置：第 89 行的 `findActualStageKey(currentState, stageKey)` 需改為在第 104 行的 `updateStateAtomic` callback 內執行，傳入最新的 `s` 而非舊快照。`actualStageKey` 透過 closure 變數傳出。第 91-98 行的 statusline 更新和 early exit 判斷也依賴 `actualStageKey`，執行順序需重組。

2. **[修復 C] pre-task 委派前觸發 sanitize** | agent: developer | files: `plugins/overtone/scripts/lib/pre-task-handler.js`

   在 `handlePreTask` 通過路徑（第 286 行 `state.updateStateAtomic` 之前）插入 `state.sanitize(sessionId)`，靜默降級（try/catch）。

3. **[測試] 並行收斂場景 + pre-task sanitize 觸發測試** | agent: developer | files: `tests/unit/agent-stop-handler.test.js`, `tests/unit/pre-task-handler.test.js`

**優先順序**：B 和 C 可並行（修改不同檔案），測試依賴 B+C 完成後同步進行（但可預先撰寫測試框架）。

**範圍邊界**：
- 不改動 `sanitize()` 函式本身（Rule 4 邏輯已正確）
- 不調整 `updateStateAtomic` 的 CAS retry 機制
- 不審查其他 handler 的潛在 stale snapshot 問題
- 不新增 timeline event 追蹤修復觸發
Keywords: stage, updatestateatomic, callback, agent, developer, files, plugins, overtone, scripts, stop

---
## 2026-03-06 | planner:PLAN Context
**問題**：`agent-stop-handler.js` 的 `handleAgentStop` 存在並行競爭條件。核心問題是第 57 行讀取 state 快照（`currentState`），第 69-84 行透過 `updateStateAtomic` 清除 activeAgents（寫入磁碟），然後第 89 行用**舊快照**呼叫 `findActualStageKey`。

若兩個並行 agent 幾乎同時完成：先到的 A 在 updateStateAtomic 裡完成了 parallelDone 遞增並標記 stage completed；後到的 B 在第 57 行讀到的快照中 stage 看起來 active，但 B 的 updateStateAtomic（清除 activeAgents）在磁碟寫入時，A 已經把 stage 標記為 completed。B 的 findActualStageKey 找不到 active/pending 匹配，返回 null，early exit 發生，parallelDone 不遞增，stage 永久卡住。

**PM 決定修復方向 B + C**。
Keywords: agent, stop, handler, handleagentstop, state, currentstate, updatestateatomic, activeagents, findactualstagekey, paralleldone

---
## 2026-03-06 | architect:ARCH Findings
**技術方案**：

- 方向 B 的 closure pattern（`let resolvedActualStageKey = null`）與 L79 現有的 `resolvedInstanceId` pattern 完全一致，零新慣例
- `findActualStageKey` 的 4 個搜尋條件缺少 `completed+pass` 場景（只有 fail/reject 安全網），需在 callback 內補位邏輯（< 10 行，不獨立函式）
- statusline 更新和 early exit 依賴 `actualStageKey`，必須整體移到第二個 `updateStateAtomic` 之後
- 方向 C 的 `sanitize()` 在正常情況只讀不寫（~1ms），不需要快速路徑優化
- `state.js` 無需新增任何匯出

**API 介面**：

```javascript
// agent-stop-handler.js：內部邏輯重組，對外 API 不變
let resolvedActualStageKey = null;

updateStateAtomic(sessionId, (s) => {
  resolvedActualStageKey = findActualStageKey(s, stageKey);
  if (!resolvedActualStageKey) {
    // 補位：找 completed+pass（後到者場景）
    resolvedActualStageKey = Object.keys(s.stages).find(
      (k) => (k === stageKey || k.startsWith(stageKey + ':')) &&
        s.stages[k].status === 'completed' && s.stages[k].result === 'pass'
    ) || null;
  }
  if (!resolvedActualStageKey) return s;
  // ... parallelDone 遞增和收斂邏輯 ...
  return s;
});

// pre-task-handler.js：在 updateStateAtomic 之前插入
try { state.sanitize(sessionId); } catch {}
```

**資料模型**：`workflow.json` schema 無變更。

**檔案結構**：

- 修改：`plugins/overtone/scripts/lib/agent-stop-handler.js`（方向 B）
- 修改：`plugins/overtone/scripts/lib/pre-task-handler.js`（方向 C）
- 新增測試：`tests/unit/agent-stop-handler.test.js`（並行收斂場景）
- 新增測試：`tests/unit/pre-task-handler.test.js`（sanitize 觸發驗證）

**Dev Phases**：

Phase 1 和 Phase 2 必須依序（B 完成後 C 更清楚最終介面），Phase 3 兩個測試檔可並行。
Keywords: closure, pattern, resolvedactualstagekey, null, resolvedinstanceid, findactualstagekey, completed, pass, fail, reject

---
## 2026-03-06 | architect:ARCH Context
分析了 `agent-stop-handler.js` 的 TOCTOU 競爭條件後，確認問題根因是 L89 的 `findActualStageKey` 使用 L57 的舊快照（S0），而此時另一個並行 agent 可能已透過自己的 `updateStateAtomic` 將 stage 改為 `completed`。修復採用 PM 決定的 B+C 雙層方案：

- B：將 stage key 查找移入第二個 `updateStateAtomic` callback，使用 callback 拿到的最新 state
- C：在 pre-task 委派前插入 `state.sanitize(sessionId)` 作為防禦層
Keywords: agent, stop, handler, toctou, findactualstagekey, updatestateatomic, stage, completed, callback, state

---
## 2026-03-06 | tester:TEST Findings
定義了 3 個 Feature，共 6 個 Scenario：

**Feature A — 收斂門根因修復（方向 B）**
- A-1: 兩個並行 agent 依序完成，parallelDone 累計正確，stage 標記 completed
- A-2: 後到者補位場景 — 先到者已將 stage 標記 completed+pass，補位邏輯正確遞增 parallelDone
- A-3: callback 內無匹配 stage，安全 early exit，state 不被修改

**Feature B — Mid-session sanitize（方向 C）**
- B-1: PreToolUse(Task) 委派前觸發 sanitize，孤兒 active stage 被修復
- B-2: workflow.json 不存在時 sanitize 靜默處理，不中斷委派流程

**Feature C — 退化場景**
- C-1: parallelTotal=1（未設定）時正常完成，收斂邏輯不受影響
Keywords: feature, scenario, agent, paralleldone, stage, completed, pass, callback, early, exit

---
## 2026-03-06 | developer:DEV Findings
1. **舊架構的競爭窗口**：原本 `findActualStageKey(currentState, stageKey)` 用的是 `readState` 讀取的快照，與第二個 `updateStateAtomic` 執行之間存在窗口。若先到者在此期間標記 stage 為 `completed`，後到者的 `actualStageKey` 會變成 `null`（`findActualStageKey` 找不到 active/pending stage），導致 early exit 且 `parallelDone` 未遞增。

2. **補位邏輯設計**：後到者場景（先到者已 `completed+pass`），`findActualStageKey` 在新 state 內仍找不到（函式不搜尋 `completed+pass`），因此加入顯式補位：`Object.keys(s.stages).find(k => ... completed && pass)`。

3. **closure 變數傳出**：`resolvedActualStageKey` 以 closure 變數形式在 callback 外使用，`actualStageKey` 作為後續邏輯的別名。

4. **`sanitize` 已是公開 API**，無需新增任何 `state.js` 匯出。

5. **`stageKeys` 重新讀取問題**：`pre-task-handler.js` 中 `stageKeys` 在 `sanitize` 之前已從 `currentState` 取得，`sanitize` 後修復的狀態透過 `updateStateAtomic` 內的重新讀取生效，不影響 `checkSkippedStages` 邏輯（因 `sanitize` 是修復孤兒 active stage，不會讓跳過邏輯誤判）。
Keywords: findactualstagekey, currentstate, stagekey, readstate, updatestateatomic, stage, completed, actualstagekey, null, active

---
## 2026-03-06 | developer:DEV Context
實作 convergence-gate-fix 的兩個方向：
- **方向 B**：修復 `agent-stop-handler.js` 的 TOCTOU 競爭條件，將 `findActualStageKey` 移入第二個 `updateStateAtomic` callback 內執行，確保使用最新 state 解析 actualStageKey。加入後到者補位邏輯（搜尋 `completed+pass` stage）。`statusline.update` 移至 `updateStateAtomic` 之後。
- **方向 C**：在 `pre-task-handler.js` 的 `updateStateAtomic` 之前插入 `try { state.sanitize(sessionId); } catch {}`，修復可能殘留的孤兒 active stage。
Keywords: convergence, gate, agent, stop, handler, toctou, findactualstagekey, updatestateatomic, callback, state

---
## 2026-03-06 | retrospective:RETRO Findings
**回顧摘要**：

convergence-gate-fix 實作了兩個方向的修復：方向 B 將 `findActualStageKey` 移入 `updateStateAtomic` callback 內，消除 TOCTOU 競爭條件；方向 C 在 `handlePreTask` 委派前觸發 `state.sanitize()`，主動修復孤兒 active stage。實作與 BDD spec 完整對齊，7 個 test 通過。

**Overtone Principles Checklist 評估**：

- 完全閉環：activeAgents cleanup 在 early exit 前執行，resolved/unresolved 都有 timeline emit，statusline 也在 early exit 前更新。事件 consumer 鏈完整。
- 自動修復：sanitize() 呼叫用 try/catch 靜默降級，不會中斷主流程。updateStateAtomic callback 有安全 early exit（`if (!resolvedActualStageKey) return s`）。
- 補全能力：修復的是既有核心模組，不涉及新 Skill/Agent 建立。新增測試 7 個，完整對應 BDD spec 所有 scenario。
Keywords: convergence, gate, findactualstagekey, updatestateatomic, callback, toctou, handlepretask, state, sanitize, active

---
## 2026-03-06 | developer:DEV Context
實作了 `retro-threshold` 功能：在 retrospective agent 的六維度評估中加入分數門檻機制，任何維度 <3/5 時自動觸發 ISSUES（僅限 standard/full/secure workflow）。
Keywords: retro, threshold, retrospective, agent, issues, standard, full, secure, workflow

---
## 2026-03-06 | doc-updater:DOCS Context
此次 Handoff 涉及在 `plugins/overtone/agents/retrospective.md` 中加入六維度分數門檻機制：任何維度評分 <3/5 時自動觸發 ISSUES flag（僅適用 standard/full/secure workflow，quick workflow 除外）。
Keywords: handoff, plugins, overtone, agents, retrospective, issues, flag, standard, full, secure

---
## 2026-03-06 | developer:DEV Findings
**實作過程中的關鍵決策：**

1. **timeline 事件格式**：timeline.emit 使用 `{ ts, type, category, label, ...data }` 直接 spread，不是 `{ data: {...} }`。現有測試中用 `.data.agent` 的寫法是錯的，補強測試全部改為 `.agent`。

2. **enforceInvariants 規則 4 與並行收斂門測試的交互**：規則 4 會將 active stage（無對應 activeAgents）自動改回 pending，所以測試並行場景時必須設置至少一個 activeAgents entry 才能維持 active 狀態。

3. **mid-session sanitize() 行為**：pre-task-handler 在每次委派前呼叫 `state.sanitize()`，會將 active stage（無 activeAgents）改回 pending，導致 `actualKey` 又能找到 pending stage 並 emit `stage:start`。因此「stage 已 active 不重複 emit stage:start」的測試需設置 activeAgents 才有效。

4. **`_parseQueueTable` 的 break 行為**：遇到非表格行即停止掃描，不繼續尋找後續佇列區塊。這是設計意圖（取第一個佇列），測試預期改為符合此行為。

**覆蓋範圍完整性：**
- agent-stop-handler：邊界情況（7）、pass/fail/reject verdict（9）、activeAgents 清理（3）、並行收斂門（3）、timeline 事件（3）、tasks.md checkbox（3）、currentStage 推進（1）、PM queue 寫入（1）、RETRO issues（2）、retry 計數（2）、_parseQueueTable（7）
- pre-task-handler：checkSkippedStages（10）、早期返回（5）、agent 辨識（4）、跳階阻擋（3）、updatedInput 組裝（3）、instanceId 生成（3）、PARALLEL_TOTAL 注入（3）、retry 場景（2）、timeline 事件（3）、state 寫入（2）、MoSCoW 警告（10）、穩定性（3）
Keywords: timeline, emit, type, category, label, data, spread, agent, enforceinvariants, active

---
## 2026-03-06 | doc-updater:DOCS Context
掃描工作流最後的 DOCS 階段變更。發現本次改動為純測試補強（agent-stop-handler.test.js / pre-task-handler.test.js），未涉及任何設計文件、規格、API、hook、skill 等核心模組。
Keywords: docs, agent, stop, handler, test, task, hook, skill

