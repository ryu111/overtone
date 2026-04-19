# R4 全自動閉環 -- 端到端整合驗證測試

## 動機（Why）

- **問題**：`r4-self-drive-loop.test.js`（460 行）驗證了 R4 五項能力的獨立運作，但未驗證完整迴圈的串聯。12 個 R4 模組各自通過單元測試，不代表它們串在一起時資料格式相容、狀態正確傳遞、學習反饋真正影響下次決策。
- **目標**：建立端到端整合測試，驗證全自動閉環的三個關鍵面向：(1) 完整迴圈資料流串聯 (2) 跨模組資料格式相容性 (3) 學習反饋閉環（執行結果影響下次決策）。
- **不做的代價**：模組 API 變更時（如 Suggestion 欄位改名），單元測試各自通過但串聯時炸裂。學習反饋假設正確但從未被端到端驗證，可能是空轉。

## 範圍

### In-scope

- **迴圈串聯測試**：gap-discovery → syncToNotion → heartbeat poll → task-adapter plan → session-spawner → recordOutcome → capability-probe → 回到 gap-discovery
- **資料格式相容性**：驗證模組 A 的輸出格式能被模組 B 直接消費，無需轉換
- **學習反饋閉環**：驗證 recordOutcome 的成功/失敗記錄真正改變 planForTask 的下次決策
- **多迴圈累積效應**：驗證連續執行 2-3 輪迴圈後，系統狀態收斂而非發散
- **降級容錯**：驗證迴圈中某環節失敗時，整體迴圈不崩潰且能繼續

### Out-of-scope

- 真實 Notion API、本地模型、claude CLI 的呼叫（全部 mock）
- event-bus 事件流串聯（已有獨立測試）
- 效能基準（本測試關注正確性，不測延遲）
- learner/judge 的語意評分邏輯（已有獨立測試，本測試只驗證其輸出格式被下游消費）

## 使用者故事

1. 身為開發者，我想要在修改任何 R4 模組 API 後，跑一個測試就能確認完整迴圈不被破壞。
2. 身為架構師，我想要驗證學習反饋機制真的有效 -- 成功經驗被記住、失敗經驗被避開、新能力被偵測。
3. 身為 reviewer，我想要看到每個跨模組邊界的資料格式都被明確斷言，作為「活的契約文件」。

## 行為規格

### 場景 1：完整全自動迴圈（Happy Path）

**前提**：系統有 1 個品質缺口（scores.jsonl 中 skill X 評分 F）+ 1 個能力缺口（capability-probe 偵測到 web-scraping missing）

**流程**：
1. gap-discovery 聚合 4 源 → 產出 Suggestion[]
2. syncToNotion 將高信心建議建立為 Notion 任務
3. heartbeat poll 取得待做任務
4. task-adapter planForTask 為任務產出 AdaptationPlan
5. session-spawner（mock）執行任務 → 成功
6. recordOutcome 記錄成功經驗
7. capability-probe 更新 boundary → coverageHits 增加
8. 第二輪 gap-discovery → 該缺口的嚴重度下降或消失

**斷言**：
- 每個環節的輸出格式能被下一環節直接消費
- 第二輪缺口數量 <= 第一輪（系統收斂）
- task-adapter 的 patterns 中有新記錄

### 場景 2：學習反饋閉環

**前提**：未知任務類型 "kubernetes deployment"

**流程**：
1. planForTask → source: "exploration"（首次遇到）
2. recordOutcome(success=true) → patterns 新增
3. 同類任務再次 planForTask → source: "pattern"（複用經驗）
4. recordOutcome(success=false) x3 → pattern 被清除
5. 同類任務再次 planForTask → source: "exploration"（重新探索）

**斷言**：
- source 轉換正確：exploration → pattern → exploration
- confidence 變化方向正確：低 → 升 → 降 → 清除
- patterns 檔案狀態與預期一致

### 場景 3：跨模組資料格式相容性

**驗證邊界**：

| 上游模組 | 輸出 | 下游模組 | 預期欄位 |
|---------|------|---------|---------|
| gap-discovery | Suggestion | syncToNotion | title, description, confidence, suggestedPriority |
| gap-discovery | Suggestion | heartbeat（via Notion task） | id/name, priority |
| heartbeat poll | task | task-adapter planForTask | name/description |
| task-adapter | AdaptationPlan | session-spawner buildPrompt | tools, depth |
| capability-probe | triggeredImprovements | gap-discovery（下輪） | capability, source |
| recordOutcome | patterns update | lookupPattern | confidence, tools, depth |

**斷言**：每個邊界的欄位存在性、型別、值域。

### 場景 4：降級容錯 -- 迴圈中某環節失敗

**子場景**：
- 4a：gap-discovery 某源失敗 → 其餘源仍產出建議
- 4b：session spawn 失敗 → heartbeat state 正確恢復 + task reset
- 4c：recordOutcome 寫入失敗 → 不阻塞後續迴圈

**斷言**：迴圈不崩潰，降級行為符合各模組的錯誤規格。

### 場景 5：多迴圈累積 -- 系統收斂

**流程**：模擬 3 輪完整迴圈（gap → plan → execute → record → probe → gap...）

**斷言**：
- 成功修復的缺口在後續輪次不再出現
- task-adapter 的 pattern confidence 隨成功次數遞增
- capability-probe 的 coverageHits 累積正確
- 無記憶體洩漏（patterns 數量有上限）

## 資料模型

### 測試輸入（Mock 資料）

沿用 `r4-self-drive-loop.test.js` 已定義的 MOCK 常數，擴展以下：

| Mock | 用途 | 格式 |
|------|------|------|
| MOCK_GAPS | gap-analyzer 輸出 | `[{ id, category, severity, priority, repairHint, context }]` |
| MOCK_WEAK_CAPS | capability-probe 輸出 | `[{ name, strength, missingHits }]` |
| MOCK_SCORES | scores.jsonl 內容 | JSONL 字串 |
| MOCK_ROADMAP | roadmap.md 內容 | Markdown 字串 |
| MOCK_NOTION_TASKS | Notion 任務列表 | `[{ id, name, priority }]` |

### 測試輸出（斷言對象）

| 模組 | 輸出型別 | 關鍵斷言欄位 |
|------|---------|-------------|
| discoverGaps | DiscoveryReport | suggestions[].{id, title, confidence, sources, suggestedPriority} |
| syncToNotion | SyncResult | {created, skipped, failed} |
| poll | PollResult | {action, task?} |
| planForTask | AdaptationPlan | {taskType, tools, depth, confidence, source} |
| recordOutcome | void（副作用） | patterns 檔案內容 |
| probeSession | ProbeResult | {triggeredImprovements[], updatedBoundary} |

## 非功能需求

| 維度 | 要求 |
|------|------|
| 執行時間 | 全部測試 < 2 秒（純 mock，無 IO 等待） |
| 獨立性 | 每個 test 用獨立 tmpdir，afterEach 清理 |
| 無外部依賴 | mock Notion API、本地模型、claude CLI |
| 與現有測試共存 | 新檔案 r4-e2e-integration.test.js，不修改 r4-self-drive-loop.test.js |
| 可讀性 | 每個 test 標題含「上游 → 下游」說明資料流方向 |

## 驗收標準

- [ ] 場景 1（完整迴圈 Happy Path）測試通過
- [ ] 場景 2（學習反饋閉環）測試通過
- [ ] 場景 3（跨模組資料格式相容性）所有 6 個邊界斷言通過
- [ ] 場景 4（降級容錯）3 個子場景通過
- [ ] 場景 5（多迴圈累積）收斂性斷言通過
- [ ] `bun test` 全量通過（含既有測試不迴歸）
- [ ] 測試檔案行數 <= 600 行

## 風險

| 風險 | 機率 | 影響 | 緩解策略 |
|------|:----:|:----:|---------|
| mock 層太厚導致測試脆弱 — 真實模組 API 改了但 mock 沒更新 | 中 | 高 | 使用真實模組邏輯 + 只 mock 外部系統（Notion/LLM/CLI），mock 資料沿用現有測試的常數 |
| 測試之間狀態洩漏（tmpdir 未清理） | 低 | 中 | afterEach 強制 rmSync + 每個 test 獨立目錄 |
| 模組 import 順序造成副作用（import.meta.main 觸發） | 低 | 中 | 所有模組在 import 時不執行副作用（已確認現有模組用 `if (import.meta.main)` 保護） |
| 測試行數超過 600 行 | 中 | 低 | 場景 3 用表格驅動測試壓縮行數；共用 helper 提取到 describe 外層 |
