# task-adapter.js -- 技術設計

## 深度路由：D2
**理由**：新建 1 個核心檔案 + 1 個測試檔案，消費 3 個現有模組但不修改它們的 API。非安全敏感，無多模組修改風險，D1 不足（跨模組整合需規劃），D3 過度（不需 reviewer）。

---

## 技術摘要

- **方案**：單檔案引擎，任務分類用確定性關鍵詞提取，模式匹配用 keyword overlap 分數，經驗記錄用 JSON 持久化
- **理由**：分類和匹配是高頻操作（每次 session 至少呼叫一次），必須快且確定性；LLM 推論只在未知任務的工具探索階段使用（委託給 tool-matcher）
- **取捨**：分類精度不如 LLM（可能把相似任務分成不同類型），但速度快且零成本；錯誤分類的影響有限（最差情況是多探索一次）

## 方案比較

| 維度 | 方案 A：確定性分類 + 關鍵詞匹配（選擇） | 方案 B：每次都用 LLM 分類 + 語意匹配 |
|------|:--------------------------------------:|:-----------------------------------:|
| 延遲 | < 5ms（純 JS 計算） | 1-5 秒（LLM 推論） |
| 成本 | 零（確定性） | 每次 session 消耗 token |
| 精度 | 中等（關鍵詞有限） | 高（語意理解） |
| 可測試性 | 高（純函式，無 mock LLM） | 低（需 mock LLM，結果不確定） |
| 離線可用 | 是 | 否（依賴本地模型或 API） |
| **結論** | 選擇：速度和成本優先，精度不足由經驗累積補償 | 不選：每次 session 都 LLM 分類太浪費 |

## 模組介面

### 新增檔案

| # | 檔案 | 位置 | 行數 | 用途 |
|---|------|------|------|------|
| 1 | task-adapter.js | `~/.claude/scripts/` | ~350 | 任務分類 + 模式匹配 + 經驗記錄 |

### 修改檔案

無（只消費現有模組 API，不修改）

### 測試檔案

| # | 檔案 | 位置 | 用途 |
|---|------|------|------|
| 1 | task-adapter.test.js | `~/projects/nova-brain/tests/unit/` | 分類 + 匹配 + 規劃 + 記錄 + 清理 |

### API 設計

```javascript
// ─── 資料模型 ────────────────────────────────────────────────────────

/**
 * @typedef {{
 *   type: string,
 *   keywords: string[],
 *   successfulPlans: PlanRecord[],
 *   totalAttempts: number,
 *   lastSeen: string,
 *   confidence: number
 * }} TaskPattern
 *
 * @typedef {{
 *   tools: string[],
 *   depth: string,
 *   successCount: number,
 *   failCount: number,
 *   lastUsed: string,
 *   avgDuration: number
 * }} PlanRecord
 *
 * @typedef {{
 *   taskType: string,
 *   tools: object[],
 *   depth: string,
 *   confidence: number,
 *   source: "pattern" | "exploration" | "fallback",
 *   pattern?: TaskPattern
 * }} AdaptationPlan
 */

// ─── 純函式（無 IO）────────────────────────────────────────────────

/**
 * 從任務描述提取類型標籤 + 關鍵詞
 * 邏輯：
 *   1. 提取英文單詞（2+ 字元）+ 中文 2-3 字元子串
 *   2. 從 TASK_TYPE_MAP 匹配最高分的類型
 *   3. 無匹配 → type = "general"
 */
function classifyTask(description: string): { type: string, keywords: string[] }

/**
 * 計算兩組關鍵詞的重疊分數（0-1）
 * 邏輯：交集數量 / 聯集數量（Jaccard similarity）
 */
function keywordOverlap(kwA: string[], kwB: string[]): number

/**
 * 信心衰減：每 30 天 x0.8（與 capability-probe 相同公式）
 */
function decayConfidence(confidence: number, daysSinceLastSeen: number): number

/**
 * 從 PlanRecord[] 選出最佳方案（成功率最高 → 最近使用 → 時間最短）
 */
function selectBestPlan(plans: PlanRecord[]): PlanRecord | null

// ─── IO 邊界函式 ──────────────────────────────────────────────────

/**
 * 讀取 task-patterns.json；損壞時回傳空模型
 */
function loadPatterns(deps?): { version: number, patterns: Record<string, TaskPattern>, stats: object }

/**
 * 寫入 task-patterns.json
 */
function savePatterns(data, deps?): void

// ─── 主要 API ──────────────────────────────────────────────────────

/**
 * 模式查詢：比對 task-patterns.json 找最接近的已知模式
 * 邏輯：
 *   1. classifyTask 取得 type + keywords
 *   2. 精確比對 type → 找到且 confidence >= 0.6 → 回傳
 *   3. 模糊比對 keywords → keywordOverlap >= 0.4 → 回傳最高分
 *   4. 都沒匹配 → null
 */
function lookupPattern(description: string, deps?): TaskPattern | null

/**
 * 規劃：辨識 → 查詢/探索 → 回傳 AdaptationPlan
 * 邏輯：
 *   1. lookupPattern → 有結果 → selectBestPlan → 回傳 source:"pattern"
 *   2. 無結果 → matchTools(description) + suggestDepth → 回傳 source:"exploration"
 *   3. matchTools 失敗 → 只用 suggestDepth → 回傳 source:"fallback"
 */
async function planForTask(description: string, context?, deps?): Promise<AdaptationPlan>

/**
 * 記錄：任務完成後回饋結果到 task-patterns.json
 * 邏輯：
 *   1. classifyTask 取得 type
 *   2. 找到 pattern → 更新 successfulPlans 中匹配的 PlanRecord
 *   3. 找不到 → 建立新 pattern
 *   4. success → successCount++, confidence 提升
 *   5. !success → failCount++, 連續 3 次失敗 → 清除該 PlanRecord
 *   6. 重新計算 pattern confidence
 *   7. pattern 數量 > 100 → prunePatterns
 */
function recordOutcome(description, tools, depth, success, duration?, deps?): void

/**
 * 列出所有模式
 */
function listPatterns(deps?): TaskPattern[]

/**
 * 清理過期模式：信心 < 0.3 或 30 天未使用
 */
function prunePatterns(deps?): { removed: number, remaining: number }
```

## 資料模型

- 儲存格式：JSON
- 儲存位置：`~/.claude/data/task-patterns.json`
- 清理策略：prunePatterns 自動清理（信心 < 0.3 或 30 天未使用）+ 100 筆上限

## 任務分類詳細邏輯

### TASK_TYPE_MAP（預設類型映射）

```javascript
const TASK_TYPE_MAP = {
  "code-review":   ["review", "pr", "審查", "code review"],
  "bug-fix":       ["fix", "bug", "修復", "修正", "錯誤"],
  "feature":       ["feat", "feature", "功能", "新增", "建立"],
  "refactor":      ["refactor", "重構", "cleanup", "整理"],
  "test":          ["test", "測試", "驗證", "coverage"],
  "docs":          ["doc", "文件", "文檔", "readme"],
  "security":      ["security", "安全", "guard", "auth"],
  "deploy":        ["deploy", "部署", "ci", "cd", "release"],
  "data":          ["data", "資料", "database", "sql", "migration"],
  "ui":            ["ui", "frontend", "css", "component", "介面"],
  "infra":         ["infra", "server", "daemon", "hook", "config"],
  "skill":         ["skill", "forge", "知識", "學習"],
};
```

### 分類演算法

1. 從 description 提取 tokens（英文 + 中文，復用 tool-matcher 的 extractTokens 邏輯）
2. 對每個 TASK_TYPE_MAP 類型計算 matchCount（tokens 與該類型 keywords 的交集）
3. 取 matchCount 最高者，若 matchCount === 0 → type = "general"
4. keywords = tokens（全部保留，用於後續模糊匹配）

### 模式匹配演算法

1. **精確匹配**：classifyTask 的 type 與 patterns 的 key 相同
2. **模糊匹配**：Jaccard similarity(input keywords, pattern keywords) >= 0.4
3. **信心門檻**：匹配到的 pattern confidence 必須 >= 0.6 才視為「已知類型」
4. **衰減後判斷**：查詢時先衰減 confidence，再判斷門檻

### 信心計算

```
初始 confidence = 0.5（首次探索）
每次成功 → confidence = min(1.0, confidence + 0.1)
每次失敗 → confidence = max(0.0, confidence - 0.15)
衰減：每 30 天 × 0.8
```

## 資料流

```
                     ┌──────────────────┐
                     │  任務描述（自然語言）│
                     └────────┬─────────┘
                              │
                              ▼
                     ┌──────────────────┐
                     │  classifyTask()  │
                     │  提取 type + kw  │
                     └────────┬─────────┘
                              │
                    ┌─────────┴──────────┐
                    ▼                    ▼
          ┌─────────────────┐   ┌────────────────┐
          │ lookupPattern() │   │ (未匹配)        │
          │ task-patterns   │   │                │
          │ .json 查詢      │   │                │
          └───────┬─────────┘   └───────┬────────┘
                  │                     │
           confidence                   │
            >= 0.6?                     │
           ┌──┴──┐                     │
           ▼     ▼                     │
         yes    no ─────────────────────┘
          │                     │
          ▼                     ▼
  ┌───────────────┐    ┌────────────────────┐
  │ selectBestPlan│    │ tool-matcher        │
  │ → source:     │    │  .matchTools()      │
  │   "pattern"   │    │ + suggestDepth()    │
  └───────┬───────┘    │ → source:           │
          │            │   "exploration"     │
          │            └────────┬────────────┘
          │                     │
          └─────────┬───────────┘
                    ▼
            AdaptationPlan
                    │
            (任務執行中...)
                    │
                    ▼
          ┌─────────────────┐
          │ recordOutcome() │
          │ → 更新           │
          │ task-patterns   │
          │ .json           │
          └─────────────────┘
```

## 執行步驟

### Phase 1：核心引擎（sequential）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 1 | task-adapter.js | 純函式：classifyTask + keywordOverlap + decayConfidence + selectBestPlan |
| 2 | task-adapter.js | IO 邊界：loadPatterns + savePatterns |
| 3 | task-adapter.js | 主要 API：lookupPattern + planForTask + recordOutcome + listPatterns + prunePatterns |
| 4 | task-adapter.js | CLI 入口：plan / list / prune / record 子命令 |

### Phase 2：測試（sequential，依賴 Phase 1）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 5 | task-adapter.test.js | 純函式測試：classifyTask / keywordOverlap / decayConfidence / selectBestPlan |
| 6 | task-adapter.test.js | 整合測試：lookupPattern / planForTask / recordOutcome / prunePatterns |
| 7 | task-adapter.test.js | 邊界條件：空輸入 / 損壞 JSON / 100 筆上限 / 連續失敗 |

## Pre-mortem

**假設這個功能上線後失敗了，最可能的原因是什麼？**

| # | 失敗情境 | 機率 | 影響 | 預防措施 |
|---|---------|:----:|:----:|---------|
| 1 | 分類太粗糙 -- 「建立 API」和「建立 UI 元件」被歸為同類型，推薦錯誤的工具組合 | 中 | 中 | 分類結合 type + keywords 雙層匹配；模糊匹配使用 Jaccard >= 0.4 門檻；PlanRecord 按工具組合分開記錄 |
| 2 | 衰減太快 -- 有效模式 30 天沒用就被清除 | 低 | 中 | 30 天衰減 x0.8 保守設定（3 次成功 → confidence 0.8 → 90 天後才降到 0.41）；prunePatterns 門檻 0.3 |
| 3 | task-patterns.json 並行寫入衝突（多個 session 同時 recordOutcome） | 低 | 低 | 寫入前讀取最新版本再寫（Last-Write-Wins 語意）；JSON 格式單次原子寫入 |
| 4 | tool-matcher LLM 推論 timeout 導致 planForTask 過慢 | 中 | 低 | 已知類型直接回傳不呼叫 LLM；未知類型 tool-matcher 本身有 8 秒 CLI timeout |
| 5 | 測試通過但真實 session 的任務描述與預設 TASK_TYPE_MAP 風格不同 | 中 | 低 | TASK_TYPE_MAP 覆蓋中英雙語關鍵詞；fallback 到 "general" 類型仍可運作 |

## 測試策略

| 測試檔案 | 驗收條件 |
|---------|---------|
| task-adapter.test.js | classifyTask 正確分類 12 種內建類型 + "general" fallback |
| task-adapter.test.js | keywordOverlap Jaccard 計算正確（含邊界 0/0、完全相同） |
| task-adapter.test.js | decayConfidence 30 天衰減 x0.8、60 天衰減 x0.64 |
| task-adapter.test.js | selectBestPlan 按成功率排序，平手時取最近使用 |
| task-adapter.test.js | lookupPattern 精確匹配 > 模糊匹配 > null |
| task-adapter.test.js | lookupPattern 信心 < 0.6 → 回傳 null |
| task-adapter.test.js | planForTask 已知類型 → source: "pattern" |
| task-adapter.test.js | planForTask 未知類型 → source: "exploration"（mock matchTools） |
| task-adapter.test.js | planForTask tool-matcher 失敗 → source: "fallback" |
| task-adapter.test.js | recordOutcome 建立新模式 + 更新現有模式 |
| task-adapter.test.js | recordOutcome 連續失敗 3 次 → 清除 PlanRecord |
| task-adapter.test.js | prunePatterns 清除低信心 + 過期模式 |
| task-adapter.test.js | 100 筆上限觸發自動 prune |
| task-adapter.test.js | 空輸入 / 損壞 JSON 容錯 |

## 不做什麼

1. **不修改 tool-matcher.js**：task-adapter 消費 matchTools API，不改其內部邏輯
2. **不做語意分類（embedding / LLM）**：分類用確定性關鍵詞映射，精度不足由經驗累積補償
3. **不做跨機器同步**：task-patterns.json 是本地檔案，不同步到 Notion 或其他外部系統
4. **不做即時回饋**：recordOutcome 是事後記錄，不在 session 執行中即時更新模式
