# Proposal: L3.7 Skill Internalization（技能內化飛輪）

## 需求背景

Overtone 目前已完成 L3.1–L3.5 的自我進化能力：
- L3.1 gap-detect：偵測知識缺口
- L3.2 auto-create：自動修復元件缺口
- L3.3 skill-forge：從 codebase 萃取知識建立新 skill
- L3.4 deep-pm：多輪訪談引擎
- L3.5 project-orchestrator：專案 → gap → forge → queue 端到端協調

**核心問題**：每個專案完成後，為該專案建立的 skill 和累積的知識會隨著 session 消散，沒有系統性地內化為永久能力。下一個類似專案必須重新起步。

L3.7 目標是建立「**經驗內化飛輪**」：

```
專案完成 → 評估 skill 價值 → 通用化處理 → 納入永久 skill 庫 → 建立經驗索引 → 下個專案加速啟動
```

## 使用者故事

### 故事一：skill 自動評估

GIVEN 一個專案剛完成（workflow 全部 stages PASS），系統持有 session 的 timeline + observations + scores
WHEN 使用者執行 `evolution.js internalize` 或系統自動觸發
THEN 系統分析 session 中哪些 skill domain 被頻繁使用、品質評分高，輸出「值得內化」清單（附評估理由與分數）

### 故事二：通用化內化

GIVEN 一個被判斷為「值得內化」的 skill（可能含專案特定內容，如 feature name、特定 API）
WHEN 執行 internalize --execute
THEN 系統將 skill 中的專案特定內容替換/移除，合併或更新到永久 skill 庫（plugins/overtone/skills/{domain}/references/），不覆蓋現有有效內容

### 故事三：經驗索引建立

GIVEN 一個已完成的專案（workflowType, featureName, 使用的 skill domains 已知）
WHEN 內化完成後
THEN 系統在全域目錄（~/.overtone/global/{projectHash}/）寫入一筆「專案經驗記錄」，記載：專案類型 / 使用的 skill domain / 品質分數 / 關鍵成功/失敗模式

### 故事四：未來專案加速啟動

GIVEN 新專案開始，featureName / 需求描述已知
WHEN L3.5 orchestrate 執行 gap 偵測
THEN 系統查詢過去相似專案的經驗索引，在 gap 分析報告中附帶「推薦 skill 清單」（基於歷史相似度）

## 範圍邊界

### In Scope
- skill 使用頻率 + 品質評分計算（從 timeline + scores + observations 推導）
- skill 通用化規則（移除專案特定 featureName、TODO 殘留、範圍限定詞）
- 通用化後的 skill 內容合併到現有 skill references
- 全域經驗索引寫入/查詢（JSONL append-only 模式）
- evolution.js 新增 `internalize` 子命令（dry-run + execute + json 三模式）
- health-check 新增一項：checkInternalizationIndex（偵測經驗索引是否有效）
- 單元測試與整合測試

### Out of Scope（延後）
- 跨專案 skill 合併（涉及語意對比，複雜度高）
- 自動觸發（目前為手動執行；SessionEnd hook 整合列為後續 Phase）
- Dashboard 可視化（UI 層）
- 多語言 skill 支援

## 子任務清單

### T1: skill-evaluator.js — 評估模組

- agent: architect（設計）+ developer（實作）
- 位置：`plugins/overtone/scripts/lib/skill-evaluator.js`
- 說明：
  - 輸入：sessionId + projectRoot
  - 從 `timeline.jsonl` 計算各 stage 中哪些 skill domain 被使用（可從 pre-task-handler 的 skill injection log 反推，或從 knowledge-archiver 的 archived 計數推導）
  - 從 `scores.jsonl` 查詢各 agent 在 session 中的品質評分
  - 從 `observations.jsonl` 查詢高信心觀察（confidence >= 0.7）歸屬的 domain
  - 輸出：`EvaluationResult[]`，每筆含 `{ domain, usageCount, avgScore, confidence, recommendation: 'internalize'|'skip' }`
  - 判斷門檻：usageCount >= 2 AND avgScore >= 3.5 AND confidence >= 0.6 → 推薦 internalize（門檻可設定，architect 決定）
- 相關檔案：`scripts/lib/score-engine.js`, `scripts/lib/knowledge/instinct.js`, `scripts/lib/timeline.js`, `scripts/lib/paths.js`

### T2: skill-generalizer.js — 通用化模組

- agent: architect（設計）+ developer（實作）
- 位置：`plugins/overtone/scripts/lib/skill-generalizer.js`
- 說明：
  - 輸入：skill 內容（Markdown 字串）+ featureName（用於偵測並移除專案特定詞）
  - 通用化規則：
    1. 移除含 featureName 的具體場景（段落級移除）
    2. 將「此專案的 X」替換為泛化表達（pattern-based 替換）
    3. 移除 TODO / WIP / 草稿標記段落
  - 輸出：通用化後的 Markdown 字串 + `{ removedSections: number, replacements: number }`
  - 乾跑模式：輸出 diff 而非直接修改
  - 與 skill-forge.js 協作：可呼叫 `forgeSkill()` 重新生成或補充通用化後的 skill
- 相關檔案：`scripts/lib/skill-forge.js`, `plugins/overtone/skills/{domain}/references/`

### T3: experience-index.js — 經驗索引模組

- agent: developer
- 位置：`plugins/overtone/scripts/lib/experience-index.js`
- 說明：
  - 全域 store：`~/.overtone/global/{projectHash}/experience-index.jsonl`（需在 paths.js 新增路徑）
  - 記錄結構：`{ ts, sessionId, featureName, workflowType, domains: string[], avgScore, keyPatterns: string[], outcome: 'pass'|'fail' }`
  - API：`recordExperience(sessionId, projectRoot, evaluationResults)` — 寫入一筆記錄
  - API：`queryExperience(query, projectRoot)` — 關鍵詞比對，回傳相似專案的 domain 推薦清單
  - JSONL append-only 模式（同 scores.jsonl、baselines.jsonl 一致性）
  - 需在 `paths.js` 新增 `global.experienceIndex` 路徑
- 相關檔案：`scripts/lib/paths.js`, `scripts/lib/score-engine.js`（參考 JSONL 模式）

### T4: evolution.js 新增 internalize 子命令

- agent: developer
- 位置：`plugins/overtone/scripts/evolution.js`
- 說明：
  - 子命令語法：`evolution.js internalize [--session <id>] [--execute] [--json]`
  - 預設 dry-run：呼叫 skill-evaluator.js → 輸出評估報告（推薦 internalize 清單）
  - `--execute`：呼叫 skill-generalizer.js 通用化 + 寫入 skill references + 呼叫 experience-index.js 記錄
  - `--json`：JSON 格式輸出（供程式消費）
  - 錯誤處理：無有效 sessionId 時提示錯誤（可讀 CURRENT_SESSION_FILE）
  - 遵循現有 evolution.js 擴展模式（positional 解析 + 呼叫 lib/ 模組）
- 相關檔案：`scripts/evolution.js`, `scripts/lib/skill-evaluator.js`, `scripts/lib/skill-generalizer.js`, `scripts/lib/experience-index.js`

### T5: project-orchestrator.js 整合經驗查詢

- agent: developer
- 位置：`plugins/overtone/scripts/lib/project-orchestrator.js`
- 說明：
  - 在 `orchestrate()` 函式中，gap 偵測完成後呼叫 `queryExperience()` 查詢歷史相似專案
  - 將推薦 skill 清單附加到 `domainAudit.experienceSuggestions`（新欄位）
  - 不阻斷主流程（try/catch 降級）
  - OrchestrateResult 加入 `experienceSuggestions?: string[]` 欄位
- 相關檔案：`scripts/lib/project-orchestrator.js`, `scripts/lib/experience-index.js`

### T6: health-check 新增 checkInternalizationIndex

- agent: developer
- 位置：`plugins/overtone/scripts/health-check.js`
- 說明：
  - 偵測項目：若存在 `experience-index.jsonl`，驗證每筆記錄結構完整性（ts, sessionId, domains 必要欄位）
  - 若有 parse error 記錄 → warning（不 block）
  - 若索引存在但所有記錄 outcome 均 fail → info 提示
  - 參考現有 checkQualityTrends / checkDataQuality 模式擴展
- 相關檔案：`scripts/health-check.js`, `scripts/lib/experience-index.js`

### T7: 測試覆蓋

- agent: tester
- 說明：
  - T7a：`tests/unit/skill-evaluator.test.js` — 評估邏輯（門檻計算、空資料降級）
  - T7b：`tests/unit/skill-generalizer.test.js` — 通用化規則（featureName 移除、TODO 移除、乾跑 diff）
  - T7c：`tests/unit/experience-index.test.js` — recordExperience + queryExperience（相似度匹配、JSONL 讀寫）
  - T7d：`tests/integration/skill-internalization.test.js` — 端到端流程（evaluator → generalizer → experience-index → evolution CLI）
  - 測試使用依賴注入模式（paths 可注入，避免污染全域目錄）

## 依賴關係

```
T1 (evaluator) ─┬─→ T4 (evolution CLI)
T2 (generalizer)─┘
T3 (index)    ───→ T4 (evolution CLI)
                 ─→ T5 (orchestrator 整合)
T1,T2,T3,T4   ───→ T7 (測試)
T3            ───→ T6 (health-check)
```

可並行執行的任務組：
- T1 + T2 + T3 可並行（相互無依賴，只共享 paths.js 介面）
- T4 需等待 T1, T2, T3 完成
- T5, T6 可在 T3 完成後並行
- T7 需等待 T1–T6 完成

## 開放問題（架構師決定）

1. **評估門檻**：usageCount, avgScore, confidence 的具體數值是否合理？是否設為可設定（config-api）或寫死？
2. **通用化粒度**：skill-generalizer.js 是段落級移除還是行級移除？影響設計複雜度
3. **merge 策略**：通用化後的 skill 與現有 references 的合併方式？（append 到 auto-discovered.md vs. 更新對應 reference 檔案）
4. **experience-index 查詢相似度算法**：關鍵詞匹配（簡單）vs. domain overlap 計算（更準確）？
5. **paths.js 新路徑命名**：`global.experienceIndex` 是否符合現有命名慣例？
