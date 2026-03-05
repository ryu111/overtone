# Design：project-orchestrator

> 產出：2026-03-06 | 階段：ARCH

## Open Questions 決策

### Q1：extractFeatureList 的 workflow 推導

**決策**：使用 `options.workflowTemplate` 預設值（預設 `'standard'`），不做文字推導。

**理由**：
- ProjectSpec 的 functional facet 是字串陣列（如 `"使用者可以上傳圖片"`），從自然語言推導 workflow 類型屬於語意模糊決策，不適合程式碼硬判斷
- `options.workflowTemplate` 給呼叫端完整控制權，比暗黑推導邏輯更可預期
- 若未來需要細粒度控制，可在 feature 項目格式中加入 workflow 欄位（向後相容）

**實作**：`extractFeatureList(projectSpec, workflowTemplate = 'standard')` — name 取 functional 項目原始文字（截斷 50 字），workflow 固定用 workflowTemplate 參數。

### Q2：detectKnowledgeGaps 的 minScore

**決策**：Project Spec 長文本場景使用 `minScore = 0.15`（比 proposal 建議的還低），同時加 `maxGaps = 10` 上限防止誤報過多。

**理由**：
- Project Spec 是結構化 Markdown，domain 命中率相對均勻，minScore 0.2 在跨域專案可能遺漏邊緣 domain
- 0.15 比預設值低，但 maxGaps = 10 限制輸出，配合「skip 已有 skill」過濾，誤報成本低（只是多 dry-run 一個 domain）
- 真實誤報的後果是 forgeSkill conflict（domain 已存在） → status: 'conflict' → 跳過，不會破壞任何東西

**實作**：`detectKnowledgeGaps(specText, [], { minScore: 0.15, maxGaps: 10 })`，已存在的 skill 在比對 skills/ 目錄後排除。

### Q3：writeQueue vs appendQueue

**決策**：預設 `appendQueue`（累加），提供 `options.overwriteQueue` flag（預設 false）切換為 `writeQueue`。

**理由**：
- 若使用者有進行中的佇列，覆蓋會清掉尚未完成的任務——這是破壞性操作，需要明確授權
- append 語意更安全：多次 orchestrate 不同 spec 時自然累加
- CLI 提供 `--overwrite` flag 對應 `overwriteQueue: true`

### Q4：domain 名稱與 skills/ 目錄映射

**決策**：DOMAIN_KEYWORDS 的 15 個 key 名稱與 skills/ 目錄名稱完全一致。

**驗證**：
```
DOMAIN_KEYWORDS keys（15 個）：
  testing, security-kb, commit-convention, wording, code-review, database,
  dead-code, workflow-core, debugging, architecture, build-system, claude-dev,
  os-control, autonomous-control, craft

skills/ 子目錄（23 個，含非 knowledge domain 的 utility skills）：
  architecture ✓, auto, autonomous-control ✓, build-system ✓, claude-dev ✓,
  code-review ✓, commit-convention ✓, craft ✓, database ✓, dead-code ✓,
  debugging ✓, evolve, issue, onboard, os-control ✓, pm, pr,
  security-kb ✓, specs, testing ✓, verify, wording ✓, workflow-core ✓
```

結論：15 個 knowledge domain 名稱與 skills/ 子目錄名稱完全對應。orchestrator 直接用 `fs.existsSync(path.join(skillsDir, domain, 'SKILL.md'))` 判斷即可。

---

## 技術方案

### 核心架構

`project-orchestrator.js` 是 **純協調模組**（coordinator），不持有任何業務邏輯：
- 呼叫 `knowledge-gap-detector.detectKnowledgeGaps()` 做 domain 分析
- 呼叫 `skill-forge.forgeSkill()` 建立缺少的 skill
- 呼叫 `execution-queue.appendQueue()`/`writeQueue()` 排程 features

這個設計與 evolution.js 的既有架構一致（evolution.js 也是協調 gap-analyzer + gap-fixer + skill-forge）。

### 資料流

```
Project Spec（字串 or ProjectSpec 物件）
    ↓ parseSpecToText()
spec 文字（合並所有 facets）
    ↓ detectKnowledgeGaps()
domainAudit: { present: string[], missing: string[] }
    ↓ forgeSkill() × missing domains
forgeResults: ForgeResult[]
    ↓ extractFeatureList()
features: [{ name, workflow }]
    ↓ appendQueue() / writeQueue()
queueResult: { items, autoExecute, source }
    ↓
OrchestrateResult
```

---

## API 介面

### project-orchestrator.js

```javascript
/**
 * OrchestrateOptions
 * @typedef {object} OrchestrateOptions
 * @property {boolean}  [dryRun=true]               - 預設 dry-run（不寫入任何 fs）
 * @property {string}   [pluginRoot]                 - plugin 根目錄（供測試注入）
 * @property {string}   [projectRoot]                - project 根目錄（佇列路徑用）
 * @property {number}   [maxConsecutiveFailures=3]   - forgeSkill 連續失敗暫停門檻
 * @property {boolean}  [enableWebResearch=false]    - 啟用 forgeSkill 外部研究
 * @property {string}   [workflowTemplate='standard'] - 排程 feature 時的預設 workflow
 * @property {boolean}  [overwriteQueue=false]       - true 時用 writeQueue 覆蓋，false 用 appendQueue 累加
 * @property {string}   [source]                     - 佇列來源描述（預設自動生成）
 */

/**
 * OrchestrateResult
 * @typedef {object} OrchestrateResult
 * @property {DomainAudit}    domainAudit    - 能力盤點結果
 * @property {ForgeResult[]}  forgeResults   - 每個 missing domain 的 forge 結果
 * @property {object|null}    queueResult    - 寫入的佇列物件（dry-run 時為預覽）
 * @property {OrchestrateSum} summary        - 摘要
 */

/**
 * DomainAudit
 * @typedef {object} DomainAudit
 * @property {string[]} present   - 已有 skill 的 domain 清單
 * @property {string[]} missing   - 缺少 skill 的 domain 清單
 * @property {Array<{domain: string, score: number, matchedKeywords: string[]}>} gaps - detectKnowledgeGaps 原始輸出
 */

/**
 * OrchestrateSum
 * @typedef {object} OrchestrateSum
 * @property {number} totalDomains      - 偵測到的 domain 總數
 * @property {number} presentCount      - 已有 skill 數
 * @property {number} missingCount      - 缺少 skill 數
 * @property {number} forgedCount       - 成功 forge 的 skill 數（dry-run 為 preview 數）
 * @property {number} featureCount      - 排程的 feature 數
 * @property {boolean} dryRun           - 是否為 dry-run
 */

/**
 * 主協調 API
 * @param {string|object} projectSpec - Project Spec 文字 or ProjectSpec 物件（interview.generateSpec 產出）
 * @param {OrchestrateOptions} [options]
 * @returns {OrchestrateResult}
 */
function orchestrate(projectSpec, options = {}) {}

/**
 * 將 ProjectSpec 物件或 Markdown 字串轉換為純文字（供 detectKnowledgeGaps 消費）
 * @param {string|object} projectSpec
 * @returns {string}
 */
function parseSpecToText(projectSpec) {}

/**
 * 從 ProjectSpec 物件或 Markdown 提取 feature 清單
 * @param {string|object} projectSpec
 * @param {string} [workflowTemplate='standard']
 * @returns {Array<{name: string, workflow: string}>}
 */
function extractFeatureList(projectSpec, workflowTemplate = 'standard') {}

module.exports = { orchestrate, parseSpecToText, extractFeatureList };
```

### parseSpecToText 邏輯

| 輸入型別 | 處理方式 |
|---------|---------|
| `string` | 直接回傳 |
| `object`（ProjectSpec）| 合並 `facets.functional`、`facets.flow`、`facets.edgeCases`、`facets.acceptance`（BDD 場景展平為文字）+ feature name |

### extractFeatureList 邏輯

| 輸入型別 | 處理方式 |
|---------|---------|
| ProjectSpec 物件 | 取 `facets.functional` 陣列，每項截斷 50 字為 name，workflow 用 workflowTemplate |
| Markdown 字串 | 找 `## 功能定義` section，按 `- ` 列表項目分割；找不到則用 `## ` 章節標題 |
| 空值 / 無 | 回傳 `[]` |

### evolution.js 子命令擴展

```
bun scripts/evolution.js orchestrate <specPath>           # dry-run 預覽
bun scripts/evolution.js orchestrate <specPath> --execute # 實際執行
bun scripts/evolution.js orchestrate <specPath> --json    # JSON 輸出
bun scripts/evolution.js orchestrate <specPath> --overwrite  # 覆蓋現有佇列
bun scripts/evolution.js orchestrate <specPath> --workflow <template>  # 指定 workflow 類型
```

**文字輸出格式**：
```
Project Orchestrator — Dry Run 預覽
=====================================
能力盤點：
  已有：testing, code-review, ... (N 個)
  需建立：new-domain-a, new-domain-b (M 個)

Skill Forge 結果：
  [success/preview] new-domain-a
  [conflict] existing-but-detected-domain

Feature 排程（standard workflow）：
  - feature-name-1
  - feature-name-2

摘要：N present / M missing / K forged / J features 排程
（dry-run，加 --execute 執行）
```

---

## 資料模型

### ProjectSpec 物件格式（interview.generateSpec 產出）

```javascript
{
  feature: string,           // 功能名稱
  generatedAt: string,       // ISO 時間戳
  facets: {
    functional: string[],    // 功能定義陣列（自然語言）
    flow: string[],          // 操作流程陣列
    ui: string[],            // UI 設計陣列（可能為空）
    edgeCases: string[],     // 邊界條件陣列
    acceptance: BDDScenario[] // BDD 場景物件陣列
  }
}

BDDScenario: { title, given, when, then }
```

### OrchestrateResult 完整結構

```javascript
{
  domainAudit: {
    present: ['testing', 'code-review'],     // 已有 skill 的 domain
    missing: ['trading', 'financial-calc'],   // 缺少 skill 的 domain
    gaps: [                                   // detectKnowledgeGaps 原始輸出
      { domain: 'testing', score: 0.4, matchedKeywords: [...] },
      ...
    ]
  },
  forgeResults: [                             // missing domains 的 forge 結果
    { status: 'success'|'conflict'|'paused'|'error', domainName, ... }
  ],
  queueResult: {                              // appendQueue/writeQueue 回傳值
    items: [{ name, workflow, status: 'pending' }],
    autoExecute: true,
    source: 'Project Orchestrator 2026-03-06',
    createdAt: '...'
  },                                          // dry-run 時為 preview 物件（不寫入 fs）
  summary: {
    totalDomains: 4,
    presentCount: 2,
    missingCount: 2,
    forgedCount: 1,    // 成功 forge 數（dry-run 為 preview 數）
    featureCount: 3,
    dryRun: true
  }
}
```

---

## 檔案結構

### 新增檔案

| 檔案 | 說明 |
|------|------|
| `plugins/overtone/scripts/lib/project-orchestrator.js` | 主核心模組（orchestrate API + parseSpecToText + extractFeatureList） |
| `tests/unit/project-orchestrator.test.js` | 單元測試 |
| `tests/integration/project-orchestrator.integration.test.js` | 整合測試 |

### 修改檔案

| 檔案 | 說明 |
|------|------|
| `plugins/overtone/scripts/evolution.js` | 新增 `orchestrate` 子命令分支 + printUsage 擴充 |

### 依賴關係（project-orchestrator.js imports）

```javascript
const { detectKnowledgeGaps } = require('./knowledge/knowledge-gap-detector');
const { forgeSkill } = require('./skill-forge');
const { appendQueue, writeQueue } = require('./execution-queue');
const path = require('path');
const fs = require('fs');
```

---

## 實作細節

### orchestrate() 執行流程

```
1. options 解構 + 預設值設定
2. parseSpecToText(projectSpec)  → specText
3. detectKnowledgeGaps(specText, [], { minScore: 0.15, maxGaps: 10 }) → gaps
4. 比對 skills/ 目錄：gaps 中每個 domain → present vs missing
5. dry-run 分支：
   a. missing domains → 逐個呼叫 forgeSkill(domain, {}, { dryRun: true, initialFailures, ... })
   b. extractFeatureList(projectSpec, workflowTemplate) → features
   c. 組裝 queueResult preview（不呼叫 appendQueue/writeQueue）
   d. 回傳 OrchestrateResult（全為預覽，無 fs 操作）
6. execute 分支：
   a. missing domains → 逐個呼叫 forgeSkill（dryRun: false，initialFailures 隔離失敗計數）
   b. extractFeatureList → features
   c. overwriteQueue ? writeQueue(...) : appendQueue(...)
   d. 回傳 OrchestrateResult
```

### 連續失敗計數隔離

沿用 skill-forge.js 的 `initialFailures` 注入模式：
- 每次呼叫 `forgeSkill` 時傳入上一次的 `forgeResult.consecutiveFailures` 作為下一次的 `initialFailures`
- 遇到 `status: 'paused'` 時停止後續 domain 的 forge，已排程的 features 仍正常寫入佇列

### dry-run 的 queueResult preview

dry-run 時不呼叫 appendQueue/writeQueue，但回傳相同結構的 preview 物件（加上 `_preview: true` 標記），供 CLI 文字輸出使用。

---

## 實作考量

- **無副作用原則**：parseSpecToText 和 extractFeatureList 是純函式（pure function），不依賴 fs，易於單元測試
- **錯誤隔離**：forgeSkill 內部吸收所有錯誤（回傳 status: 'error'），orchestrate 不 throw，整體 try-catch 只在最外層 CLI 做
- **向後相容**：evolution.js 既有的 analyze / fix / forge 子命令不受影響，只新增 orchestrate 分支
