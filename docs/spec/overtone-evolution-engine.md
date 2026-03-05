# Overtone 進化引擎設計文件

> 版本：v1.0 | 最後更新：2026-03-06
> 對應程式版本：v0.28.64

---

## 概覽

進化引擎（Evolution Engine）是 Overtone Layer 3 的核心子系統，負責「自我進化能力」。其職責是：

1. **偵測**：分析元件一致性缺口（gap detection）
2. **修復**：自動修正可修復缺口（auto-fix）
3. **鍛造**：從 codebase 萃取知識並建立 Skill（skill forge）
4. **內化**：將高品質觀察提煉為可複用跨專案知識（internalization）
5. **協調**：從 Project Spec 一鍵協調整個能力建立流程（orchestration）

---

## 模組清單

### 1. gap-analyzer.js

- **位置**：`plugins/overtone/scripts/lib/gap-analyzer.js`
- **職責**：組合 health-check 的四個 check，將 findings 轉換為標準化 Gap 物件
- **來源 checks**：`component-chain` / `closed-loop` / `completion-gap` / `dependency-sync`
- **輸出 GapType**：`broken-chain` / `missing-skill` / `missing-consumer` / `no-references` / `sync-mismatch`
- **主要 API**：

```
analyzeGaps(options?) → GapReport

GapReport: {
  gaps: Gap[],
  summary: {
    total: number,
    byType: Record<GapType, number>,
    bySeverity: { error, warning, info }
  }
}

Gap: {
  type: GapType,
  severity: 'error' | 'warning' | 'info',
  file?: string,
  message: string,
  suggestion: string,
  sourceCheck: string,
  fixable: boolean
}
```

---

### 2. gap-fixer.js

- **位置**：`plugins/overtone/scripts/lib/gap-fixer.js`
- **職責**：對可修復缺口執行自動修復，目前支援兩種修復策略
- **可修復 GapType**：
  - `sync-mismatch` → 呼叫 `fix-consistency.js --fix`（批次，一次呼叫處理全部）
  - `no-references` → 建立 `skills/{domain}/references/` 目錄 + README.md
- **主要 API**：

```
fixGaps(gaps, options) → FixResult

options: {
  dryRun: boolean,        // true = 不執行任何 fs 操作
  typeFilter?: string,    // 只修復指定類型
  pluginRoot?: string     // 覆寫 plugin 根目錄（供測試注入）
}

FixResult: {
  fixed: Gap[],
  skipped: SkippedItem[],
  failed: FailedItem[]
}
```

---

### 3. skill-forge.js

- **位置**：`plugins/overtone/scripts/lib/skill-forge.js`
- **職責**：從 codebase 萃取與指定 domain 相關的知識，建立完整 Skill 目錄結構
- **萃取來源**：
  - 現有 `skills/*/SKILL.md` 提取結構模板
  - `skills/instinct/auto-discovered.md` 的相關條目
  - `CLAUDE.md` 中的相關段落
- **輸出**：`skills/{domain}/SKILL.md` + `skills/{domain}/references/` 目錄
- **防衛機制**：連續失敗 3 次 → `paused` 狀態，阻止無效重試
- **主要 API**：

```
forgeSkill(domainName, context, options) → ForgeResult

options: {
  dryRun?: boolean,
  maxConsecutiveFailures?: number,
  pluginRoot?: string,
  initialFailures?: number,
  enableWebResearch?: boolean
}

ForgeResult: {
  status: 'success' | 'conflict' | 'paused' | 'error',
  domainName: string,
  skillPath?: string,
  preview?: ForgePreview,
  conflictPath?: string,
  consecutiveFailures: number,
  error?: string
}
```

---

### 4. knowledge/knowledge-gap-detector.js

- **位置**：`plugins/overtone/scripts/lib/knowledge/knowledge-gap-detector.js`
- **職責**：分析 prompt 文字中出現的關鍵詞，偵測 agent 尚未具備的知識 domain
- **靜態知識表**：`DOMAIN_KEYWORDS`，覆蓋 15 個 knowledge domain（testing / security-kb / commit-convention / wording / code-review / database / dead-code / workflow-core / debugging / architecture / build-system / os-control / autonomous-control / craft / claude-dev）
- **消費者**：`pre-task-handler.js`（hook 注入 gap 警告）、`project-orchestrator.js`（能力盤點）
- **主要 API**：

```
detectKnowledgeGaps(text, agentSkills) → GapResult[]

GapResult: {
  domain: string,
  confidence: number,
  keywords: string[]
}

shouldAutoForge(gaps) → boolean
autoForge(gaps, options) → void
```

---

### 5. project-orchestrator.js

- **位置**：`plugins/overtone/scripts/lib/project-orchestrator.js`
- **職責**：從 ProjectSpec（Markdown 或物件）到填充佇列的端到端協調，串聯 gap 偵測 → skill forge → 佇列排程
- **流程**：
  1. 解析 spec → 純文字
  2. `detectKnowledgeGaps` 掃描所需 domain
  3. 對比 `experience-index`（歷史記錄加速）
  4. 對缺少的 domain 呼叫 `forgeSkill`
  5. 提取 feature 清單 → `appendQueue` 或 `writeQueue`
- **主要 API**：

```
orchestrate(specContent, options) → OrchestrateResult

options: {
  dryRun: boolean,
  execute: boolean,
  workflowTemplate: string,    // 預設 'standard'
  overwriteQueue: boolean,
  projectRoot: string
}

OrchestrateResult: {
  domainAudit: { present: string[], missing: string[], gaps: Gap[] },
  forgeResults: ForgeResult[],
  queueResult: object,
  summary: { totalDomains, presentCount, missingCount, forgedCount, featureCount, dryRun }
}

parseSpecToText(projectSpec) → string
extractFeatureList(projectSpec) → string[]
```

---

### 6. knowledge/skill-evaluator.js

- **位置**：`plugins/overtone/scripts/lib/knowledge/skill-evaluator.js`
- **職責**：評估 `auto-discovered.md` 中的知識條目是否達到內化門檻
- **評估維度**（三軸）：
  - `usageCount`：domain 相關 agent 使用次數（來自 observations.jsonl）
  - `avgScore`：平均評分（來自 scores.jsonl，0-5）
  - `confidence`：觀察信心度（來自 global observations，0-1）
- **預設門檻**：`minUsageCount=2` / `minAvgScore=3.5` / `minConfidence=0.6`
- **主要 API**：

```
evaluateEntries(autoDiscoveredPath, projectRoot, options?) → EvaluationResult[]

EvaluationResult: {
  entry: string,
  domain: string | null,
  score: number,          // 0-1 加權平均
  qualified: boolean,
  reasons: string[]
}
```

---

### 7. knowledge/skill-generalizer.js

- **位置**：`plugins/overtone/scripts/lib/knowledge/skill-generalizer.js`
- **職責**：移除知識條目中的專案特定內容，使其可通用化後跨專案複用
- **策略**：段落級移除（包含專案特定 pattern 的段落整段刪除）
- **偵測 pattern**：絕對路徑 / 相對路徑（`plugins/overtone/`）/ require 路徑 / 版本號 / Session ID
- **主要 API**：

```
generalizeEntry(content, options?) → GeneralizeResult

GeneralizeResult: {
  original: string,
  generalized: string,
  removed: string[],
  isEmpty: boolean     // 通用化後長度 < minLength（預設 50）
}

generalizeEntries(evaluatedEntries) → GeneralizeResult[]
// 只處理 qualified=true 的條目
```

---

### 8. knowledge/experience-index.js

- **位置**：`plugins/overtone/scripts/lib/knowledge/experience-index.js`
- **職責**：維護「什麼專案需要哪些 skill domain」的全域索引，讓 project-orchestrator 能根據歷史經驗加速能力盤點
- **資料路徑**：`~/.overtone/global/{projectHash}/experience-index.json`
- **主要 API**：

```
buildIndex(projectRoot, domains) → void
queryIndex(projectRoot, specText, options?) → IndexQueryResult
readIndex(projectRoot) → ExperienceEntry[]

ExperienceEntry: {
  projectHash: string,
  domains: string[],
  lastUpdated: string,
  sessionCount: number
}
```

---

## 資料流圖

```
╔══════════════════════════════════════════════════════════════════╗
║                     進化引擎完整資料流                            ║
╚══════════════════════════════════════════════════════════════════╝

  [使用者執行 evolution.js 子命令] 或 [pre-task-handler 自動觸發]
                        │
          ┌─────────────▼──────────────┐
          │      health-check.js       │   掃描元件一致性
          │  (component-chain /        │   (health-check.js 提供
          │   closed-loop /            │    check 函式)
          │   completion-gap /         │
          │   dependency-sync)         │
          └─────────────┬──────────────┘
                        │ findings[]
          ┌─────────────▼──────────────┐
          │      gap-analyzer.js       │   findings → Gap 物件
          │   analyzeGaps()            │   標準化格式 + severity
          └──────┬──────────┬──────────┘
                 │          │
         fixable│    not-fixable (需人工)
                 │
  ┌──────────────▼──────────────────┐
  │         gap-fixer.js            │
  │   fixGaps()                     │
  │                                 │
  │  sync-mismatch → fix-consistency│
  │  no-references → mkdir + README │
  └─────────────────────────────────┘


  ── 知識鍛造流程 ──

  [evolution.js forge <domain>] 或 [orchestrate 內部呼叫]
                        │
   ┌──────────────────────────────────┐
   │  knowledge-gap-detector.js       │
   │  detectKnowledgeGaps(text)       │  分析 prompt 關鍵詞
   └─────────────┬────────────────────┘
                 │ gaps[]（缺少的 domain）
   ┌─────────────▼────────────────────┐
   │  experience-index.js             │
   │  queryIndex(projectRoot, text)   │  歷史記錄加速盤點
   └─────────────┬────────────────────┘
                 │ missing domains
   ┌─────────────▼────────────────────┐
   │       skill-forge.js             │
   │   forgeSkill(domain)             │  萃取知識 + 建立 Skill
   │                                  │
   │   知識來源：                      │
   │   ・現有 skills/*/SKILL.md        │
   │   ・auto-discovered.md           │
   │   ・CLAUDE.md 相關段落            │
   └─────────────┬────────────────────┘
                 │
   plugins/overtone/skills/{domain}/
      ├── SKILL.md
      └── references/


  ── 知識內化流程 ──

  [PostToolUse hook] → [instinct.js]
                         │
                         ▼
             skills/instinct/auto-discovered.md   (觀察累積)
                         │
  [evolution.js internalize]
                         │
          ┌──────────────▼──────────────┐
          │     skill-evaluator.js      │
          │   evaluateEntries()         │  三軸評估（用量/評分/信心）
          └──────────────┬──────────────┘
                         │ qualified entries
          ┌──────────────▼──────────────┐
          │    skill-generalizer.js     │
          │   generalizeEntries()       │  移除專案特定內容
          └──────────────┬──────────────┘
                         │
          ┌──────────────▼──────────────┐
          │     skills/instinct/        │
          │     internalized.md         │  可跨專案複用的知識
          └──────────────┬──────────────┘
                         │
          ┌──────────────▼──────────────┐
          │    experience-index.js      │
          │    buildIndex()             │  更新全域專案索引
          └─────────────────────────────┘


  ── 專案協調流程 ──

  [evolution.js orchestrate <specPath>]
                        │
                        ▼
             讀取 specContent（Markdown）
                        │
          ┌─────────────▼──────────────┐
          │ project-orchestrator.js    │
          │   orchestrate()            │
          │                           │
          │ 1. parseSpecToText()       │  Markdown → 純文字
          │ 2. detectKnowledgeGaps()   │  偵測所需 domain
          │ 3. queryIndex()            │  歷史記錄輔助
          │ 4. forgeSkill() × missing  │  建立缺少的 Skill
          │ 5. extractFeatureList()    │  提取 feature 清單
          │ 6. appendQueue/writeQueue  │  排程到執行佇列
          └─────────────┬──────────────┘
                        │
              execution-queue.json     （按 workflow 模板排程）
```

---

## CLI 入口（evolution.js）

`plugins/overtone/scripts/evolution.js` 統一作為所有子命令的 CLI 入口。

| 子命令 | 功能 | 核心模組 | 預設行為 |
|--------|------|----------|----------|
| `status` | 快速顯示系統進化狀態 | gap-analyzer + experience-index | 輸出摘要 |
| `analyze` | 執行 gap 分析 | gap-analyzer | 輸出報告，有缺口 exit 1 |
| `fix` | 修復可修復缺口 | gap-fixer | dry-run（加 `--execute` 才執行） |
| `forge <domain>` | 為指定 domain 建立 Skill | skill-forge | dry-run（加 `--execute` 才執行） |
| `forge --auto` | 自動偵測並批次 forge | gap-analyzer + skill-forge | dry-run |
| `orchestrate <specPath>` | 從 ProjectSpec 端到端協調 | project-orchestrator | dry-run |
| `internalize` | 提煉知識到 internalized.md | skill-evaluator + skill-generalizer | dry-run |

**通用旗標**：
- `--json`：以 JSON 格式輸出（供程式消費）
- `--execute`：關閉 dry-run，實際執行 fs 操作
- `--help`：顯示說明

---

## 整合點

### 1. health-check.js（上游資料來源）

`gap-analyzer.js` 直接呼叫 health-check 的四個 check 函式：

| health-check 項目 | 說明 | 映射 GapType |
|------------------|------|-------------|
| `component-chain` | Skill → Agent → Hook 依賴鏈斷裂偵測 | `broken-chain` / `missing-skill` |
| `closed-loop` | 有 emit 但無 consumer 的孤立 timeline 事件 | `missing-consumer` |
| `completion-gap` | Skill 缺少 `references/` 子目錄 | `no-references` |
| `dependency-sync` | SKILL.md 消費者表 vs agent frontmatter 不一致 | `sync-mismatch` |

### 2. pre-task-handler.js（即時警告注入）

`knowledge-gap-detector.js` 被 `pre-task-handler.js` 呼叫，在 Task 工具呼叫前分析 prompt，若偵測到 agent 尚未掌握的 domain 則在 `updatedInput` 注入 gap 警告提示。

### 3. execution-queue.js（任務排程）

`project-orchestrator.js` 完成 gap 偵測 + skill forge 後，呼叫 `appendQueue` 或 `writeQueue` 將 feature 任務排入執行佇列。排程方式由 `workflowTemplate` 控制（預設 `standard`）。

### 4. instinct.js + PostToolUse hook（觀察來源）

`PostToolUse` hook 觸發 `instinct.js`，將 agent 觀察記錄到 `skills/instinct/auto-discovered.md`。這是 `skill-evaluator.js` 的上游資料來源，形成「觀察 → 評估 → 內化」的飛輪。

### 5. score-engine.js + observations.jsonl（評分資料）

`skill-evaluator.js` 從 `score-engine.js`（`queryScores`）和全域 observations 讀取歷史評分，作為三軸評估的數值依據。

---

## 狀態持久化

| 資料 | 路徑 | 格式 | 管理模組 |
|------|------|------|----------|
| 自動發現的知識條目 | `plugins/overtone/skills/instinct/auto-discovered.md` | Markdown | instinct.js |
| 內化後的通用知識 | `plugins/overtone/skills/instinct/internalized.md` | Markdown（含 frontmatter） | evolution.js runInternalize() |
| 全域專案索引 | `~/.overtone/global/{projectHash}/experience-index.json` | JSON | experience-index.js |
| Skill 目錄 | `plugins/overtone/skills/{domain}/` | 目錄 + SKILL.md | skill-forge.js |

---

## 設計原則

1. **預設 dry-run**：`fix` / `forge` / `orchestrate` / `internalize` 所有寫入操作預設不執行，必須明確加 `--execute` 旗標
2. **純函式優先**：業務邏輯與 CLI 分離，核心模組匯出可測試的純函式，CLI 層做 I/O
3. **health-check 是唯一來源**：gap-analyzer 不重複實作偵測邏輯，直接委派 health-check check 函式
4. **連續失敗防衛**：skill-forge 內建 `consecutiveFailures` 計數器，超過門檻自動暫停
5. **歷史加速**：experience-index 記錄專案 × domain 歷史，orchestrate 優先查詢再 forge，避免重複工作
