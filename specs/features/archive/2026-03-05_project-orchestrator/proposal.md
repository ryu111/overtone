# Proposal：project-orchestrator

> 產出：2026-03-06 | 階段：PLAN

## 功能名稱

`project-orchestrator`（對應 `specs/features/in-progress/project-orchestrator/`）

## 需求背景（Why）

**問題**：

L3.3 Skill Forge 完成後，系統可以自主建立新 skill；L3.4 深度 PM 完成後，系統可以透過多輪訪談取得精準需求。但這兩個能力是孤立的——使用者必須手動串聯：先訪談、再判斷缺哪些 skill、再手動呼叫 forge、再手動排程迭代。

現在的流程斷點：
1. PM 訪談完成 → 需要人工分析 Project Spec，推導所需 skill
2. Skill 建立完成 → 需要人工排列 feature 優先序並寫入執行佇列
3. 執行佇列跑完一輪 → 需要人工判斷是否繼續迭代

**目標**：

串聯現有基礎設施（interview.js + skill-forge.js + execution-queue.js + knowledge-gap-detector.js），讓系統在收到 Project Spec 後，能自主完成：
- 能力盤點（現有 vs 需建立）
- Skill 批次建構
- Feature 排程至執行佇列

**優先級**：

L3.5 是 L3 完成的最後一個核心模組（之後才能進行 L3.6 Acid Test），也是打通「從需求到產品全自動」的關鍵缺口。路線圖上標記為 L3.6 前的必要條件。

## 使用者故事

```
身為 Overtone 主代理人
我想要在收到 Project Spec 後自動完成能力盤點 + skill 建構 + feature 排程
以便讓系統無需人工介入就能啟動多 feature 的迭代開發循環
```

```
身為開發者（使用者）
我想要透過 `bun scripts/evolution.js orchestrate <specPath>` 觸發全自動建構
以便從一份 Project Spec 直接得到一個已填充的執行佇列，只需等待系統自動完成
```

## 範圍邊界

### 在範圍內（In Scope）

- `project-orchestrator.js`：主核心模組，提供 `orchestrate(projectSpec, options)` API
  - 從 Project Spec 解析文字內容，呼叫 knowledge-gap-detector 偵測缺少的 domain
  - 標記現有 vs 需建立的 skill
  - 批次呼叫 forgeSkill（尊重 dryRun / maxConsecutiveFailures 選項）
  - 將 features 寫入 execution-queue（呼叫 appendQueue 或 writeQueue）
  - 回傳 OrchestrateResult（能力盤點摘要 + forge 結果 + queue 狀態）
- `evolution.js` 擴展：新增 `orchestrate <specPath>` 子命令
  - 解析 `--execute`（預設 dry-run）、`--json` flag
  - 讀取 specPath 的 Project Spec 文字，傳入 orchestrator
  - 文字 / JSON 格式輸出結果
- `orchestrate` 子命令的用法說明（printUsage 擴充）

### 不在範圍內（Out of Scope）

- **PM 整合自動觸發**：interview.js 完成後直接串接 orchestrator——這屬於控制流整合，需要獨立 feature 規劃。本次只確保 API 相容性（generateSpec 的輸出格式能被 orchestrator 消費）
- **Agent 配置自動化**：skill 建立後自動把新 domain 加到 agent frontmatter 的 `skills:` 欄位——依賴 manage-component.js 的 update 介面，屬於 L3.5 後續增強
- **無限迭代推進邏輯**：queue 填充後的自動執行由既有 heartbeat.js + session-stop-handler 負責，不在本模組範圍
- **L3.6 Acid Test**：端到端驗證場景，等 orchestrator 完成後規劃
- **L3.7 Skill Internalization**：專案完成後的知識內化流程

## 子任務清單

依執行順序列出：

1. **project-orchestrator.js 核心模組**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/project-orchestrator.js`（新建）
   - 說明：
     - `orchestrate(projectSpec, options)` 主 API，projectSpec 接受字串（Project Spec Markdown）或物件（generateSpec 回傳的 ProjectSpec）
     - 呼叫 `detectKnowledgeGaps(specText, [], { minScore: 0.15, maxGaps: 10 })` 推導所需 domain 清單，minScore 設低一點以捕捉更多潛在缺口
     - 比對 `plugins/overtone/skills/` 目錄中現有 skill 資料夾，標記 present vs missing
     - 對 missing 清單批次呼叫 forgeSkill（使用 initialFailures 隔離失敗計數）
     - 從 projectSpec 的 functional facet 或 features 欄位提取 feature 清單，寫入 execution-queue
     - 回傳 `OrchestrateResult: { domainAudit, forgeResults, queueResult, summary }`
     - options: `dryRun`, `pluginRoot`, `projectRoot`, `maxConsecutiveFailures`, `enableWebResearch`, `workflowTemplate`（預設 'standard'）

2. **Project Spec 解析輔助函式**（可與任務 1 並行開發，但邏輯上屬於 1 的子函式）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/project-orchestrator.js`（同上）
   - 說明：
     - `parseSpecToText(projectSpec)` — 處理兩種輸入形式（字串直接用；ProjectSpec 物件展平為文字，合並 functional + flow + edgeCases + acceptance 的文字內容）
     - `extractFeatureList(projectSpec)` — 從 ProjectSpec 物件的 functional facet 提取 feature 項目，或從 Markdown 的 `## 功能定義` section 拆分；回傳 `[{ name, workflow }]` 格式（供 writeQueue 消費）

3. **evolution.js orchestrate 子命令**（依賴任務 1 完成）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/evolution.js`
   - 說明：
     - 在 `main()` 新增 `else if (subcommand === 'orchestrate')` 分支
     - 解析 `positional[1]` 為 specPath（必填），讀取檔案內容
     - 呼叫 `orchestrate(specText, { dryRun: !execute, ... })`
     - 文字輸出格式：能力盤點表格（present/missing）+ forge 結果清單 + queue 排程摘要
     - JSON 輸出：直接回傳 OrchestrateResult
     - 更新 printUsage() 說明

4. **單元測試**（可與任務 3 並行，依賴任務 1 完成）
   - 負責 agent：tester
   - 相關檔案：`tests/unit/project-orchestrator.test.js`（新建）
   - 說明：
     - `parseSpecToText`：字串輸入直通、物件輸入展平
     - `extractFeatureList`：從 ProjectSpec 物件提取 features、從 Markdown 提取、空輸入防禦
     - `orchestrate`：dry-run 模式回傳正確結構（stub forgeSkill + writeQueue）、missing domain 批次 forge、已有 domain 跳過 forge（skill 存在衝突處理）、連續失敗 pause 行為

5. **整合測試**（依賴任務 1、3、4 完成）
   - 負責 agent：tester
   - 相關檔案：`tests/integration/project-orchestrator.integration.test.js`（新建）
   - 說明：
     - 使用 temp dir 隔離 fs 操作（避免污染真實 skills/ 目錄）
     - `evolution.js orchestrate <specPath>` 端到端跑通
     - dry-run 模式不寫入任何檔案
     - execute 模式在 temp dir 建立 skill + 寫入 queue

## 開放問題

1. **Project Spec 的 features 欄位格式**：interview.js 的 `generateSpec` 回傳的 ProjectSpec 物件中，feature 項目在 `facets.functional` 下，是字串陣列，不是 `{ name, workflow }` 格式。orchestrator 需要自行推導 workflow 類型（預設 'standard'），還是讓使用者傳入 options 覆蓋？建議：`extractFeatureList` 生成 name 用 functional 項目的前 30 字，workflow 用 options.workflowTemplate 預設值——此決策交給 architect 確認。

2. **detectKnowledgeGaps 的 minScore 調校**：用 Project Spec 全文跑偵測時，spec 文字較長、domain 命中率可能偏高，導致誤報。是否需要對 orchestrator 場景使用不同的 minScore（如 0.3）？或者加上白名單過濾已知 domain？交給 architect 決定。

3. **skills/ 目錄現有 skill 的掃描策略**：orchestrator 判斷 domain 是否「已有」的方式是檢查 `skills/{domain}/SKILL.md` 是否存在。但 DOMAIN_KEYWORDS 的 15 個 domain 名稱可能與 skills/ 子目錄名稱不完全對應（如 `code-review` vs `code-review/`）。需確認映射關係。

4. **execution-queue 的寫入模式**：已有未完成佇列時，`orchestrate` 應用 `writeQueue`（覆蓋）還是 `appendQueue`（累加）？建議預設 append + 提供 `--overwrite` flag，但此決策交給 architect。
