# task-adapter.js -- 新任務快速適應機制

## 動機（Why）

- **問題**：Nova 遇到從未處理過的任務類型時，每次都從零開始探索 -- tool-matcher 選工具、suggestDepth 選深度、執行、但結果不會被記住。下次遇到同類任務，又重新探索一遍。capability-boundary.json 只記錄能力強弱（coverageHits/missingHits），不記錄「哪種任務用了什麼工具組合、哪個深度、成功還是失敗」。
- **目標**：建立任務類型索引（task-patterns.json），讓 Nova 遇到新任務時能：(1) 辨識是否為已知類型 (2) 已知類型直接複用成功經驗 (3) 未知類型走探索流程並將結果回饋到索引。
- **不做的代價**：每次 self-drive session 對同類任務重複探索，浪費 token 和時間。工具匹配依賴 LLM 即時推論而非歷史經驗，品質不穩定。

## 範圍

### In-scope

- 任務類型辨識：從任務描述提取類型標籤，比對 task-patterns.json
- 經驗查詢：已知類型回傳成功的工具組合 + 深度 + 信心度
- 探索規劃：未知類型透過 tool-matcher + suggestDepth 產出初始方案
- 結果記錄：session 結束後記錄任務類型 + 工具 + 深度 + 成敗到 task-patterns.json
- 經驗衰減：超過 30 天未使用的模式信心衰減，避免過時經驗主導決策
- 程式化 API + CLI 雙模式

### Out-of-scope

- 自動執行任務（task-adapter 只做「規劃 + 記錄」，執行由 heartbeat/session-spawner 負責）
- 修改 tool-matcher.js / capability-probe.js / session-spawner.js 的 API
- Notion 同步（task-adapter 不直接操作 Notion）
- AI/LLM 呼叫（task-adapter 的分類邏輯為確定性函式，LLM 呼叫委託給 tool-matcher）

## 使用者故事

1. 身為 heartbeat self-drive 模組，我想要呼叫 `planForTask(taskDescription)` 取得工具組合 + 深度建議，以便直接組裝 session prompt 而非每次重新用 AI 分析。
2. 身為 session-spawner.js，我想要在 buildPrompt 時查詢 `lookupPattern(taskDescription)` 取得歷史成功方案，以便在 prompt 中注入「上次這類任務用了哪些工具」的上下文。
3. 身為 capability-probe.js（session 結束時），我想要呼叫 `recordOutcome(taskDescription, tools, depth, success)` 將本次經驗寫回 task-patterns.json，以便下次同類任務直接複用。
4. 身為開發者，我想要用 `bun task-adapter.js list` 查看已學習的任務類型，以便了解 Nova 的經驗累積狀況。

## 行為規格

### 正常路徑

1. 收到任務描述 → `classifyTask(description)` 提取類型標籤
2. 查詢 task-patterns.json 是否有匹配的模式 → `lookupPattern(description)`
3a. **已知類型（confidence >= 0.6）**：回傳歷史成功方案 `{ tools, depth, confidence, source: "pattern" }`
3b. **未知類型**：呼叫 tool-matcher.matchTools + session-spawner.suggestDepth → `{ tools, depth, confidence, source: "exploration" }`
4. 任務完成後，呼叫 `recordOutcome()` 更新 task-patterns.json

### 錯誤路徑

| 錯誤情境 | 預期行為 |
|---------|---------|
| task-patterns.json 不存在 | 視為空索引，所有任務走探索路徑 |
| task-patterns.json 損壞 | 重建空索引，console.error 記錄 |
| tool-matcher 失敗 | 回傳只含 suggestDepth 結果的降級方案，tools 為空陣列 |
| suggestDepth 失敗 | 預設 D2，console.error 記錄 |
| recordOutcome 寫入失敗 | console.error 記錄，不影響任務執行 |

### 邊界條件

- 空任務描述 → 回傳 `{ tools: [], depth: "D2", confidence: 0, source: "fallback" }`
- 模式信心衰減到 0.3 以下 → 視為未知類型，重新探索
- 同一任務類型連續失敗 3 次 → 清除該模式，強制重新探索
- task-patterns.json 超過 100 個模式 → 清除信心最低的 20% 模式

## 資料模型

### 輸入（planForTask）

| 欄位 | 型別 | 必填 | 說明 |
|------|------|:----:|------|
| description | string | 是 | 任務描述（自然語言） |
| context | object | 否 | 額外上下文 `{ priority, type, scope }` |

### 輸出（AdaptationPlan）

| 欄位 | 型別 | 說明 |
|------|------|------|
| taskType | string | 分類後的任務類型標籤 |
| tools | object[] | 推薦工具 `[{ id, name, type, reason }]` |
| depth | string | 推薦深度 D0-D4 |
| confidence | number | 0-1，方案信心度 |
| source | string | `"pattern"` 或 `"exploration"` |
| pattern | object? | 匹配到的歷史模式（若有） |

### 輸入（recordOutcome）

| 欄位 | 型別 | 必填 | 說明 |
|------|------|:----:|------|
| description | string | 是 | 任務描述 |
| tools | string[] | 是 | 實際使用的工具 ID |
| depth | string | 是 | 實際使用的深度 |
| success | boolean | 是 | 是否成功 |
| duration | number | 否 | 執行時間（ms） |

### 儲存：task-patterns.json

- 位置：`~/.claude/data/task-patterns.json`
- 格式：

```json
{
  "version": 1,
  "patterns": {
    "task-type-label": {
      "type": "task-type-label",
      "keywords": ["keyword1", "keyword2"],
      "successfulPlans": [
        {
          "tools": ["tool:id1", "tool:id2"],
          "depth": "D2",
          "successCount": 3,
          "failCount": 0,
          "lastUsed": "2026-03-17",
          "avgDuration": 120000
        }
      ],
      "totalAttempts": 3,
      "lastSeen": "2026-03-17",
      "confidence": 0.85
    }
  },
  "stats": {
    "totalPatterns": 1,
    "totalAttempts": 3,
    "lastUpdated": "2026-03-17T00:00:00.000Z"
  }
}
```

## 介面契約

### 程式化 API

```javascript
// 任務分類：從描述提取類型標籤
function classifyTask(description: string): { type: string, keywords: string[] }

// 模式查詢：從 task-patterns.json 查找匹配模式
function lookupPattern(description: string, deps?): TaskPattern | null

// 規劃：辨識 + 查詢/探索 → 回傳 AdaptationPlan
async function planForTask(description: string, context?, deps?): Promise<AdaptationPlan>

// 記錄：任務完成後回饋結果
function recordOutcome(description: string, tools: string[], depth: string, success: boolean, duration?: number, deps?): void

// 查詢所有已學習模式
function listPatterns(deps?): TaskPattern[]

// 清理過期模式（信心 < 0.3 或 30 天未使用）
function prunePatterns(deps?): { removed: number, remaining: number }
```

### CLI

```bash
bun task-adapter.js plan "<任務描述>"     # 輸出 AdaptationPlan JSON
bun task-adapter.js list                  # 列出所有已學習模式
bun task-adapter.js prune                 # 清理過期模式
bun task-adapter.js record "<描述>" --tools=id1,id2 --depth=D2 --success  # 手動記錄
```

### 錯誤碼

| 場景 | exit code |
|------|:---------:|
| 正常完成 | 0 |
| 參數錯誤 | 1 |
| task-patterns.json 損壞（已自動重建） | 0 |

## 非功能需求

| 維度 | 要求 |
|------|------|
| 效能 | planForTask < 500ms（不含 LLM 呼叫，LLM 呼叫由 tool-matcher 負責） |
| 行數 | <= 400 行 |
| 依賴 | 只 import 現有腳本（tool-matcher, session-spawner, capability-probe）+ Node.js 內建 |
| 測試 | 所有外部依賴可 DI 注入 |
| 冪等 | recordOutcome 重複呼叫相同參數不產生重複記錄（以 type + tools + depth 去重） |

## 依賴

| 方向 | 模組 | 說明 |
|------|------|------|
| 上游（消費） | tool-matcher.js | matchTools(intent) -- 未知任務的工具探索 |
| 上游（消費） | session-spawner.js | suggestDepth(task) -- 深度建議 |
| 上游（消費） | capability-probe.js | getBoundary() -- 輔助判斷能力邊界 |
| 下游（被消費） | heartbeat self-drive | planForTask() 取得方案 |
| 下游（被消費） | session-spawner.js | lookupPattern() 豐富 prompt |
| 下游（被消費） | capability-probe.js | recordOutcome() 回饋結果 |
| 下游（被消費） | context-injector.js | listPatterns() 注入經驗摘要 |

## 驗收標準

- [ ] `classifyTask("建立 GitHub PR 自動 review")` 回傳類型標籤和關鍵詞
- [ ] `lookupPattern()` 找到匹配模式時回傳歷史成功方案
- [ ] `lookupPattern()` 無匹配時回傳 null
- [ ] `planForTask()` 已知類型回傳 `source: "pattern"`，未知類型回傳 `source: "exploration"`
- [ ] `planForTask()` tool-matcher 失敗時降級回傳 suggestDepth 結果
- [ ] `recordOutcome()` 成功記錄到 task-patterns.json
- [ ] `recordOutcome()` 連續失敗 3 次後清除該模式
- [ ] `prunePatterns()` 清除信心 < 0.3 或 30 天未使用的模式
- [ ] task-patterns.json 超過 100 筆時自動清理
- [ ] 所有函式 DI 可注入（deps 參數）
- [ ] 行數 <= 400 行
- [ ] `bun test` 通過所有測試

## 風險

| 風險 | 機率 | 影響 | 緩解策略 |
|------|:----:|:----:|---------|
| 任務分類不準確（同類任務分到不同類型） | 中 | 中 | 關鍵詞匹配 + 類型合併邏輯，模式查詢使用模糊匹配而非精確比對 |
| 失敗的經驗污染索引（失敗方案被記住） | 低 | 中 | 只有成功方案提升信心，失敗方案增加 failCount 並在連續 3 次失敗後清除 |
| task-patterns.json 過度膨脹 | 低 | 低 | 100 筆上限 + prunePatterns 自動清理 |
| tool-matcher LLM 推論延遲 | 中 | 低 | planForTask 加 timeout；已知類型直接回傳不呼叫 LLM |
| 衰減策略太激進導致有效模式被清除 | 低 | 中 | 30 天 + 0.3 門檻保守設定，成功模式至少 3 次成功才建立足夠信心 |
