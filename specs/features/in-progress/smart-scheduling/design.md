# Design: smart-scheduling

## 技術摘要（What & Why）

**方案**：在 `failure-tracker.js` 新增 `getWorkflowFailureRates(projectRoot)` 按 `workflowType` 欄位聚合失敗率，並修改 `suggestOrder(projectRoot, options?)` 接受可選的 `options.failureData` 注入失敗率作為二次排序鍵。CLI 透過 `--smart` flag opt-in，由 `queue.js` 負責 IO（載入失敗率後傳入）。

**理由**：
- `byStage` 的 key 是 `DEV`/`TEST` 等 stage 名稱，queue item 的 `workflow` 是 `standard`/`quick` 等 workflow 名稱——兩者不同層級，無法直接映射。必須按 `workflowType` 欄位（已記錄在 failure record 中）重新聚合。
- `suggestOrder` 保持純函式（無 IO），IO 由呼叫方（queue.js CLI）負責，符合現有架構慣例。
- `--smart` 先 opt-in（planner 確認），不改變現有預設行為，向後相容。

**取捨**：
- `failureData` 由呼叫方準備並傳入，若未來其他呼叫方（如 `session-stop-handler`）也需要智慧排序，需自行 require failure-tracker 並傳入——接受此輕微重複換取 `suggestOrder` 的純函式性質。
- 二次排序鍵是 `failureRate`（float），而非 `count`，避免樣本量差異造成偏差（小量失敗也排後面）。

## 解答 Open Questions

**Q1: failureRate 對應鍵**
新增 `getWorkflowFailureRates(projectRoot)` 函式，按 `workflowType` 欄位聚合（非 `byStage`）。failure record 格式已有 `workflowType` 欄位（見 `recordFailure` 的 record 說明），只是 `getFailurePatterns` 沒有輸出此維度。新函式直接從 JSONL 讀取並按 `workflowType` 計算失敗率，回傳 `{ [workflowType]: { count, rate } }` 格式，與 `byStage` 結構對齊，使用一致。

**Q2: failureData 注入點**
`suggestOrder` 保持無 IO。接受 `options.failureData` 作為第二參數，由呼叫方（queue.js）負責呼叫 `getWorkflowFailureRates` 後傳入。優點：`suggestOrder` 單元測試不需要 mock IO，直接構造 `failureData` 物件即可（proposal 測試設計已採用此策略）。

**Q3: --smart 是否設為預設**
維持 opt-in（`--smart` flag 顯式啟用）。理由：失敗率資料在全新環境下為空，第一次使用無資料可用；且 IO 有成本，預設靜默讀取增加認知複雜度。長期若資料夠豐富可再轉為預設。

## API 介面設計

### failure-tracker.js — 新增 getWorkflowFailureRates

```javascript
/**
 * 取得各 workflow 類型的失敗率（用於智慧排序）
 *
 * @param {string} projectRoot
 * @param {number} [window] - 取最近幾筆，預設 warningWindow
 * @returns {{ [workflowType: string]: { count: number, rate: number } }}
 *   workflowType key：如 'standard', 'quick', 'single', 'full'
 *   rate：該 workflowType 失敗次數佔總失敗次數的比率（0~1）
 *   無資料時回傳 {}
 */
function getWorkflowFailureRates(projectRoot, window)
```

**回傳範例**：
```javascript
{
  'standard': { count: 5, rate: 0.5 },
  'quick':    { count: 3, rate: 0.3 },
  'full':     { count: 2, rate: 0.2 },
}
```

注意：`rate` 計算方式與 `byStage` 一致——`count / totalFailures`，四捨五入至小數點後 4 位。

### execution-queue.js — 修改 suggestOrder

```javascript
/**
 * 根據 workflow 複雜度提供排序建議（不修改佇列）
 * 同 workflow 類型內保持原始相對順序（穩定排序）。
 * 不影響已完成/進行中的項目（維持在原位）。
 *
 * @param {string} projectRoot
 * @param {object} [options]
 * @param {object} [options.failureData]
 *   getWorkflowFailureRates() 回傳值，用於二次排序（低失敗率優先）
 *   缺席時退化為原邏輯（只依複雜度排序）
 * @returns {{ suggested: object[]|null, changed: boolean }}
 */
function suggestOrder(projectRoot, options)
```

**排序鍵優先順序**：
1. 主鍵：`WORKFLOW_ORDER[item.workflow] ?? 99`（複雜度，低→高）
2. 次鍵：`options.failureData?.[item.workflow]?.rate ?? 0`（失敗率，低→高）
3. 三鍵：`idx`（原始索引，穩定排序）

### queue.js CLI — 修改 cmdSuggestOrder 支援 --smart

```javascript
// 簽名不變，新增 smartFlag 參數
function cmdSuggestOrder(projectRoot, applyFlag, smartFlag)

// --smart 時，在呼叫 suggestOrder 前先載入 failureData：
// const { getWorkflowFailureRates } = require('./lib/failure-tracker');
// const failureData = smartFlag ? getWorkflowFailureRates(projectRoot) : undefined;
// const { suggested, changed } = executionQueue.suggestOrder(projectRoot, { failureData });
```

**CLI 輸出補充**（有 --smart 時在「建議排序」標題前加一行說明）：
```
智慧排序模式（依複雜度 + 歷史失敗率）：
```

**無 --smart 時**（維持現有輸出不變）。

## 資料模型

### failureData 格式（getWorkflowFailureRates 回傳值）

```javascript
// 輸入：failures.jsonl 中的 record
{
  ts: string,           // ISO 8601
  sessionId: string,
  workflowType: string, // 'standard' | 'quick' | 'single' | 'full' | null
  stage: string,        // 'DEV' | 'TEST' | ...
  agent: string,
  verdict: 'fail' | 'reject',
  retryAttempt?: number
}

// 輸出：{ [workflowType]: { count, rate } }
{
  'standard': { count: number, rate: number },  // rate = count / totalFailures
  'quick':    { count: number, rate: number },
  // workflowType 為 null/undefined 的記錄跳過
}
```

儲存位置：不新增儲存，從現有 `~/.overtone/global/{projectHash}/failures.jsonl` 讀取。

## 檔案結構

```
修改的檔案：
  plugins/overtone/scripts/lib/failure-tracker.js
    ← 新增：getWorkflowFailureRates(projectRoot, window?)
    ← 新增 module.exports 匯出此函式

  plugins/overtone/scripts/lib/execution-queue.js
    ← 修改：suggestOrder(projectRoot, options?) 新增可選第二參數
    ← 排序邏輯加入二次排序鍵（failureRate）

  plugins/overtone/scripts/queue.js
    ← 修改：cmdSuggestOrder 新增 smartFlag 參數
    ← main() 解析 --smart flag 並傳入 cmdSuggestOrder
    ← --smart 時 require failure-tracker 並傳入 failureData

新增的檔案：
  tests/unit/queue-smart-schedule.test.js
    ← 在現有測試檔案末尾追加 'suggestOrder with failureData' describe 區塊
    （注意：此檔案已存在，需用 Edit 工具追加，不可覆寫）
```

## 關鍵技術決策

### 決策 1：byWorkflow 聚合放在 failure-tracker.js 還是直接在 queue.js 計算

- **選項 A（選擇）：在 failure-tracker.js 新增 getWorkflowFailureRates** — 集中失敗資料操作的知識，保持 `execution-queue.js` 不依賴 `failure-tracker.js`（兩個模組現在沒有相互依賴，保持隔離）。呼叫方只需傳入結果物件，不需知道 JSONL 結構。
- **選項 B（未選）：在 queue.js CLI 直接讀取 failures.jsonl 並計算** — 洩露了 failure-tracker 的內部儲存細節，違反封裝原則。

### 決策 2：suggestOrder 接受 failureData 還是 projectRoot 時自行讀取

- **選項 A（選擇）：接受 failureData 注入（純函式）** — 測試不需要 mock IO，直接傳入構造好的 failureData 物件。proposal 的測試案例設計已假設此方式，與測試策略對齊。
- **選項 B（未選）：suggestOrder 自行讀取（有 projectRoot 時）** — 破壞純函式特性，使現有測試更難撰寫，且與 planner 已確認的設計決策相違。

### 決策 3：rate vs count 作為二次排序鍵

- **選項 A（選擇）：用 rate（失敗率）** — 避免樣本量差異造成偏差。`standard` 失敗 2 次（共 4 筆）= rate 0.5，`quick` 失敗 3 次（共 20 筆）= rate 0.15，用 rate 排序 quick 排前面，符合直覺。
- **選項 B（未選）：用 count（次數）** — `quick` 失敗 3 次排後面，但實際成功率更高，反直覺。

## 實作注意事項

- `getWorkflowFailureRates` 需套用 `_filterResolved` 過濾（與 `getFailurePatterns` 一致），避免已解決的失敗影響失敗率計算。
- `workflowType` 為 `null` 或 `undefined` 的記錄（舊格式記錄、或記錄時沒有 workflow context）應跳過，不計入任何 bucket。
- `suggestOrder` 向後相容：現有無 `options` 的呼叫方（如測試、其他程式碼）行為完全不變，`options` 為 `undefined` 時 failureData 視為缺席，退化為原邏輯。
- queue.js 的 `optionKeys` 陣列需加入 `'--smart'`，避免被誤認為 positional 參數。
