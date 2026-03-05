# Design: deep-pm-interview-engine

## 技術摘要（What & Why）

- **方案**：新建 `interview.js` 引擎 + 靜態問題庫 + PM agent prompt 升級 + PM skill 新增 reference
- **理由**：PM agent 目前是單輪分析（advisory），升級為多輪結構化訪談（multi-round interrogator）才能在無人值守場景下確保需求完整收集。使用靜態問題庫而非 LLM 生成，原因是靜態問題一致性高、可測試、不增加 latency。
- **取捨**：靜態問題庫無法適應完全陌生的新領域（但 L3.3 Skill Forge 負責領域研究，不在本次範圍）；interview.js 以 CLI 入口方式呼叫（`node -e`），與現有 OS 腳本慣例一致。

## API 介面設計

### interview.js 核心 API

```typescript
// 初始化訪談 session
function init(featureName: string, outputPath: string, options?: InterviewOptions): InterviewSession

// 取得下一個問題
function nextQuestion(session: InterviewSession): Question | null  // null = 訪談結束

// 記錄回答
function recordAnswer(session: InterviewSession, questionId: string, answer: string): InterviewSession

// 檢查是否完成
function isComplete(session: InterviewSession): boolean

// 產生 Project Spec（輸出到 outputPath）
function generateSpec(session: InterviewSession): ProjectSpec

// 載入已有 session（支援中斷恢復）
function loadSession(statePath: string): InterviewSession | null

// 儲存 session 狀態
function saveSession(session: InterviewSession, statePath: string): void
```

### 輸入型別

```typescript
interface InterviewOptions {
  minAnswersPerFacet?: number   // 每面向最少回答數，預設 2
  statePath?: string            // session 狀態儲存路徑（支援中斷恢復）
}

interface Question {
  id: string                    // 唯一識別（如 "func-1"）
  facet: Facet                  // 所屬面向
  text: string                  // 問題文字
  required: boolean             // 必問題（true）vs 補充題（false）
  dependsOn?: string            // 可選：依賴某個問題 id 有答案
}

type Facet =
  | 'functional'     // 功能需求
  | 'flow'           // 操作流程
  | 'ui'             // UI 設計（可選面向）
  | 'edge-cases'     // 邊界條件
  | 'acceptance'     // 驗收標準
```

### 輸出型別

```typescript
interface InterviewSession {
  featureName: string
  outputPath: string
  answers: Record<string, string>   // questionId → answer
  startedAt: string                  // ISO 8601
  completedAt?: string
  options: Required<InterviewOptions>
}

interface ProjectSpec {
  feature: string
  generatedAt: string
  facets: {
    functional: string[]
    flow: string[]
    ui?: string[]
    edgeCases: string[]
    acceptance: BDDScenario[]      // >= 10 個
  }
  rawAnswers: Record<string, string>
}

interface BDDScenario {
  title: string
  given: string
  when: string
  then: string
}
```

### 錯誤處理

| 錯誤情況 | 錯誤碼 / 訊息 |
|---------|-------------|
| featureName 為空 | `INVALID_INPUT: featureName 不可為空` |
| outputPath 無寫入權限 | `WRITE_ERROR: 無法寫入 {outputPath}` |
| session 狀態檔損壞 | 靜默回傳 null（由 loadSession 處理），重新開始訪談 |

## 資料模型

```typescript
// interview-state.json — 儲存訪談進度（支援中斷恢復）
interface InterviewStateFile {
  version: 1
  featureName: string
  outputPath: string
  answers: Record<string, string>
  startedAt: string
  completedAt?: string
  options: {
    minAnswersPerFacet: number
  }
}
```

儲存位置：`~/.overtone/sessions/{sessionId}/interview-state.json`（由 PM agent 透過 statePath 參數指定）
格式：JSON（原子寫入，使用 utils.atomicWrite）

```typescript
// project-spec.md — 訪談結果輸出（放在 specs/features/in-progress/{featureName}/ 下）
// 純 Markdown 文件，由 generateSpec 產生
```

## 問題庫設計

靜態問題庫內嵌在 `interview.js` 中（不獨立檔案，30 行以內）：

| 面向 | 必問數 | 補充問題數 |
|------|-------|-----------|
| functional（功能） | 3 | 2 |
| flow（操作流程） | 3 | 2 |
| ui（UI 設計） | 0 | 3（全補充） |
| edge-cases（邊界） | 2 | 2 |
| acceptance（驗收） | 3 | 2 |

完成門檻：每個必問面向（functional/flow/edge-cases/acceptance）至少 `minAnswersPerFacet`（預設 2）個必問題已回答，且 ui 面向可選跳過。

## 檔案結構

```
新增：
  plugins/overtone/scripts/lib/interview.js
    ← 訪談引擎核心（init/nextQuestion/recordAnswer/isComplete/generateSpec/loadSession/saveSession）

  plugins/overtone/skills/pm/references/interview-guide.md
    ← PM agent 訪談指引（問題策略 + 何時追問 + 如何引用 interview.js）

新增（測試）：
  tests/unit/interview.test.js
    ← interview.js 單元測試

  tests/integration/pm-interview-integration.test.js
    ← PM agent 觸發完整訪談流程的整合測試

修改：
  plugins/overtone/agents/product-manager.md
    ← 升級 prompt：新增「多輪訪談模式」章節（使用 manage-component.js update agent）

  plugins/overtone/skills/pm/SKILL.md
    ← 新增 interview-guide.md 到 Reference 索引（使用 manage-component.js update skill）
```

## 關鍵技術決策

### 決策 1：interview.js 呼叫介面

- **選項 A（選擇）**：純 module（module.exports）+ 支援 `require.main === module` CLI 入口 — PM agent 用 `node -e "const i = require('...'); ..."` inline 呼叫，與 knowledge-gap-detector.js、execution-queue.js 等現有模式一致；可測試、不需外部 CLI 工具
- **選項 B（未選）**：獨立 CLI 腳本 — PM agent 要記憶 CLI 參數格式，且難以 inline 串接邏輯

### 決策 2：問題生成策略

- **選項 A（選擇）**：靜態問題庫（約 20 題） — 一致性高、可測試、0 latency，五面向覆蓋 PM 五層追問法
- **選項 B（未選）**：LLM 動態生成 — 靈活但不穩定、難測試、latency 高；領域適應交給 L3.3 Skill Forge

### 決策 3：Project Spec 寫入路徑

- **選項 A（選擇）**：直接寫檔到 `specs/features/in-progress/{featureName}/project-spec.md` — 與 design.md/tasks.md 同路徑，architect/tester 可直接讀取；與 specs 系統一致
- **選項 B（未選）**：Handoff 輸出 — 存在 context window，一旦 compact 就消失，無人值守場景不可靠

### 決策 4：訪談完成度門檻

- 每個必問面向最少 2 個問題有回答（`minAnswersPerFacet = 2`）
- 函式參數預設值 + options 覆蓋，測試友好（無需 config 系統）
- ui 面向全補充題，可跳過，適用純 API/CLI 功能

### 決策 5：pre-task-handler.js 更新

- 無需修改 — interview.js 是供 PM agent 主動呼叫的工具，不是 Hook 注入的 context；PM agent prompt 升級後自帶完整使用指引

## 實作注意事項

給 developer 的提醒：

- `interview.js` 必須是 CJS 模組（`'use strict'; module.exports = ...`），與現有 lib 一致
- `saveSession` / `loadSession` 使用 `utils.atomicWrite` 原子寫入，防止 JSON 損壞
- `generateSpec` 輸出的 BDD 場景須 >= 10 個（不足時從 edge-cases + acceptance 的回答拆分補充）
- PM agent prompt 升級必須透過 `manage-component.js update agent product-manager + body 欄位`（pre-edit guard 保護）
- SKILL.md 更新必須透過 `manage-component.js update skill pm + body 欄位`
- 問題庫中問題的 `id` 格式：`{facet前綴}-{序號}`（如 `func-1`、`flow-2`、`edge-1`）
