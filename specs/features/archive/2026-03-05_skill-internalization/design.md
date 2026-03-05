# L3.7 Skill Internalization — 技術設計

## 技術方案摘要

建立「經驗內化飛輪」：從 session 學習資料（scores、digests、global-instinct observations）評估哪些 auto-discovered 知識值得永久保留為正式 skill，通用化後寫入 `skills/instinct/internalized.md`，並透過 experience-index.json 支援 project-orchestrator.js 加速能力盤點。

### Open Questions 決策

1. **評估門檻**：硬編碼為函式參數預設值（`usageCount >= 2, avgScore >= 3.5, confidence >= 0.6`），呼叫端可透過 options 覆蓋。不引入 config 系統（30 行以下邏輯不值得獨立模組）。

2. **通用化粒度**：段落級移除（以空行分段）。行級粒度過細，判斷成本高且誤判率高。段落包含專案特定關鍵詞時整段移除。

3. **merge 策略**：通用化後的知識 append 到 `skills/instinct/internalized.md`（新建檔案）。與 auto-discovered.md 分開管理：auto-discovered 是暫存、internalized 是永久。

4. **experience-index 相似度算法**：關鍵詞匹配（domain keywords overlap）。語意相似度需要 embedding，過重；關鍵詞匹配已足夠且和現有 knowledge-gap-detector.js 的演算法一致。

5. **experience-index 路徑**：`~/.overtone/global/{projectHash}/experience-index.json`，與其他全域資料（scores.jsonl、observations.jsonl）並存。paths.js 新增 `global.experienceIndex(projectRoot)` 函式。

---

## 模組 API 介面定義

### T1: skill-evaluator.js

位置：`plugins/overtone/scripts/lib/knowledge/skill-evaluator.js`

評估 skills/instinct/auto-discovered.md 中的知識條目是否達到內化門檻。

```
EvaluationCriteria:
  usageCount:  number  // 出現次數（來自 digests 或 auto-discovered 記錄）
  avgScore:    number  // 平均評分（來自 scores.jsonl，0-5）
  confidence:  number  // 信心分數（來自 global observations，0-1）

EvaluationResult:
  entry:       string        // 原始條目內容
  domain:      string|null   // 偵測到的 domain（null = 無法路由）
  score:       number        // 綜合評分（0-1，加權平均）
  qualified:   boolean       // 是否達到門檻
  reasons:     string[]      // 通過或不通過的原因清單

evaluateEntries(
  autoDiscoveredPath: string,
  projectRoot:        string,
  options?: {
    minUsageCount?:  number,   // 預設 2
    minAvgScore?:    number,   // 預設 3.5
    minConfidence?:  number,   // 預設 0.6
  }
) => EvaluationResult[]
```

**依賴**：
- `fs.readFileSync` 讀取 auto-discovered.md
- `score-engine.js` 的 `queryScores()` 取得 avgScore
- `global-instinct.js` 的 `queryGlobal()` 取得 confidence
- `knowledge-gap-detector.js` 的 `DOMAIN_KEYWORDS` 做 domain 偵測

### T2: skill-generalizer.js

位置：`plugins/overtone/scripts/lib/knowledge/skill-generalizer.js`

移除知識條目中的專案特定內容，使其通用化。

```
GeneralizeResult:
  original:    string   // 原始內容
  generalized: string   // 通用化後的內容（可能為空字串，代表整條不適合保留）
  removed:     string[] // 被移除的段落（debug 用）
  isEmpty:     boolean  // 通用化後為空（整條應捨棄）

// 專案特定內容偵測：段落包含以下任一模式時整段移除
PROJECT_SPECIFIC_PATTERNS: RegExp[]
  - 檔案路徑（/path/to/ 或 plugins/overtone/ 等）
  - 版本號（v0.28.xx）
  - 特定 session ID（sha 格式）
  - 程式碼片段中的具體 module 名稱（require('./xxx')）

generalizeEntry(
  content: string,
  options?: {
    customPatterns?: RegExp[]  // 額外的專案特定 pattern
  }
) => GeneralizeResult

generalizeEntries(
  entries: EvaluationResult[],  // 只處理 qualified=true 的條目
  options?: { customPatterns?: RegExp[] }
) => GeneralizeResult[]
```

**依賴**：純函式，無外部依賴。

### T3: experience-index.js

位置：`plugins/overtone/scripts/lib/knowledge/experience-index.js`

維護「什麼專案需要哪些 skill domain」的索引。

```
ExperienceEntry:
  projectHash:  string    // paths.projectHash(projectRoot)
  domains:      string[]  // 此專案用到的 skill domains
  lastUpdated:  string    // ISO 8601
  sessionCount: number    // 貢獻此索引的 session 數量

IndexQueryResult:
  recommendedDomains: string[]  // 建議此專案使用的 domains（依命中率排序）
  matchedProjects:    number    // 相似專案數量

buildIndex(
  projectRoot: string,
  domains:     string[]   // 本 session/workflow 用到的 domains
) => void  // append/update experience-index.json

queryIndex(
  projectRoot: string,
  specText:    string,    // 專案描述或 spec 文字
  options?: {
    maxRecommendations?: number,  // 預設 5
    minOverlap?:         number,  // 最少共同 domain 數，預設 1
  }
) => IndexQueryResult

readIndex(projectRoot: string) => ExperienceEntry[]
```

**資料模型**（`~/.overtone/global/{projectHash}/experience-index.json`）：
```json
{
  "version": 1,
  "entries": [
    {
      "projectHash": "a1b2c3d4",
      "domains": ["testing", "workflow-core", "database"],
      "lastUpdated": "2026-03-06T00:00:00.000Z",
      "sessionCount": 3
    }
  ]
}
```

**依賴**：
- `paths.js` 的 `projectHash()` 和 `global.experienceIndex()`
- `knowledge-gap-detector.js` 的 `DOMAIN_KEYWORDS` 做 specText 匹配
- `fs`（atomicWrite + readFileSync）

### T4: evolution.js internalize 子命令

位置：`plugins/overtone/scripts/evolution.js`（擴充現有檔案）

```
新增子命令：
  internalize              預覽可內化條目（dry-run）
  internalize --execute    實際執行內化
  internalize --json       JSON 格式輸出

InternalizeResult:
  dryRun:       boolean
  evaluated:    number             // 評估總數
  qualified:    number             // 達到門檻數
  generalized:  number             // 通用化後有效數
  written:      number             // 實際寫入 internalized.md 的條目數
  skipped:      string[]           // 通用化後為空而略過的條目
  entries:      InternalizeEntry[] // dry-run 時為預覽

InternalizeEntry:
  original:     string
  generalized:  string
  domain:       string|null
  score:        number
```

**流程**：
1. 讀取 `skills/instinct/auto-discovered.md`
2. `evaluateEntries()` → 篩出 qualified
3. `generalizeEntries()` → 通用化
4. dry-run: 輸出預覽；execute: append 到 `skills/instinct/internalized.md`

### T5: project-orchestrator.js 整合

位置：`plugins/overtone/scripts/lib/project-orchestrator.js`（修改）

在 `orchestrate()` 的步驟 2（detectKnowledgeGaps）之前插入 experience-index 查詢：

```
orchestrate(projectSpec, options) 新增邏輯：
  // 步驟 1.5：查詢 experience-index 取得加速建議
  if (options.projectRoot) {
    const specText = parseSpecToText(projectSpec)
    const indexResult = queryIndex(options.projectRoot, specText)
    // 將 indexResult.recommendedDomains 合入 domainAudit 的 present/missing 分類
  }

orchestrate() 回傳的 OrchestrateResult 新增欄位：
  experienceHints?: {
    recommendedDomains: string[]
    matchedProjects: number
  }
```

### T6: health-check.js checkInternalizationIndex

位置：`plugins/overtone/scripts/health-check.js`（擴充）

```
新增第 17 項偵測：
  17. internalization-index — 檢查 experience-index 是否存在、格式是否正確

checkInternalizationIndex(globalDirOverride?: string) => Finding[]

Finding 條件：
  - info: experience-index.json 不存在（尚未建立索引）
  - warning: experience-index.json 格式損壞（JSON parse 失敗）
  - warning: entries[].domains 為空陣列（無效條目）
  - info: 所有條目最後更新超過 30 天（索引可能過時）
```

---

## 資料模型

### experience-index.json Schema

```json
{
  "version": 1,
  "entries": [
    {
      "projectHash": "string (8 hex chars)",
      "domains": ["string"],
      "lastUpdated": "ISO 8601 string",
      "sessionCount": "number (integer >= 1)"
    }
  ]
}
```

路徑：`~/.overtone/global/{projectHash}/experience-index.json`

### skills/instinct/internalized.md 格式

```markdown
---
source: skill-internalization
version: 1
lastUpdated: 2026-03-06T00:00:00.000Z
---

## {domain} — {ts}

{generalized content}

---
```

每條內化知識以 `---` 分隔，包含 domain 和時間戳。

---

## 檔案結構

### 新增檔案

| 路徑 | 說明 |
|------|------|
| `plugins/overtone/scripts/lib/knowledge/skill-evaluator.js` | T1：評估門檻判斷 |
| `plugins/overtone/scripts/lib/knowledge/skill-generalizer.js` | T2：通用化邏輯（純函式） |
| `plugins/overtone/scripts/lib/knowledge/experience-index.js` | T3：經驗索引讀寫 |
| `tests/unit/knowledge/skill-evaluator.test.js` | T1 單元測試 |
| `tests/unit/knowledge/skill-generalizer.test.js` | T2 單元測試 |
| `tests/unit/knowledge/experience-index.test.js` | T3 單元測試 |
| `tests/unit/evolution-internalize.test.js` | T4 CLI 整合測試 |

### 修改檔案

| 路徑 | 變更 |
|------|------|
| `plugins/overtone/scripts/evolution.js` | T4：新增 `internalize` 子命令 |
| `plugins/overtone/scripts/lib/project-orchestrator.js` | T5：整合 experience-index 查詢 |
| `plugins/overtone/scripts/health-check.js` | T6：新增 `checkInternalizationIndex` + 更新 header 為 17 項 |
| `plugins/overtone/scripts/lib/paths.js` | 新增 `global.experienceIndex(projectRoot)` |
| `tests/unit/project-orchestrator.test.js` | 新增 experience-index 整合測試案例 |
| `tests/unit/health-check.test.js` | 新增 checkInternalizationIndex 測試案例 |

---

## 架構決策

### ADR-1：experience-index 放全域 store 而非 plugin 內

**決策**：`~/.overtone/global/{projectHash}/experience-index.json`

**理由**：
- 與 scores.jsonl、observations.jsonl 同一目錄，維護一致
- 跨 session 持久化，與 paths.js 既有的 global 路徑模式一致
- 避免在 plugin 目錄增加執行期產生的資料檔案

### ADR-2：internalized.md 與 auto-discovered.md 分開

**決策**：新建 `skills/instinct/internalized.md`，不修改 auto-discovered.md

**理由**：
- auto-discovered.md 由 skill-router.js 管理（有大小上限和截斷邏輯），不應由 internalization 污染
- internalized.md 是永久儲存，不截斷、不自動清除
- 兩個檔案職責清晰分離

### ADR-3：skill-generalizer.js 為純函式模組

**決策**：不依賴任何 Overtone 模組，只做字串處理

**理由**：
- 便於單元測試（無 side effect，無 I/O）
- 通用化邏輯是確定性的（不依賴外部狀態）
- 保持 T2 與 T1/T3 的依賴方向清晰

### ADR-4：experience-index 使用 JSON（非 JSONL）

**決策**：`experience-index.json` 使用完整 JSON，而非 JSONL append-only

**理由**：
- 每個 projectHash 只有一筆 entry，更新語意是 upsert（不是 append）
- 條目數量少（一個 global 目錄下不會超過數十個專案）
- atomicWrite 已提供 race condition 保護

---

## Dev Phases

### Phase 1: 核心模組（parallel）

- [ ] T1：skill-evaluator.js 實作 + 單元測試 | files: `plugins/overtone/scripts/lib/knowledge/skill-evaluator.js`, `tests/unit/knowledge/skill-evaluator.test.js`
- [ ] T2：skill-generalizer.js 實作 + 單元測試 | files: `plugins/overtone/scripts/lib/knowledge/skill-generalizer.js`, `tests/unit/knowledge/skill-generalizer.test.js`
- [ ] T3：experience-index.js 實作 + paths.js 更新 + 單元測試 | files: `plugins/overtone/scripts/lib/knowledge/experience-index.js`, `plugins/overtone/scripts/lib/paths.js`, `tests/unit/knowledge/experience-index.test.js`

### Phase 2: CLI 整合（sequential，需 T1+T2+T3）

- [ ] T4：evolution.js internalize 子命令 + 整合測試 | files: `plugins/overtone/scripts/evolution.js`, `tests/unit/evolution-internalize.test.js`

### Phase 3: 系統整合（parallel，需 T3）

- [ ] T5：project-orchestrator.js 整合 experience-index + 測試 | files: `plugins/overtone/scripts/lib/project-orchestrator.js`, `tests/unit/project-orchestrator.test.js`
- [ ] T6：health-check.js checkInternalizationIndex + 測試 | files: `plugins/overtone/scripts/health-check.js`, `tests/unit/health-check.test.js`
