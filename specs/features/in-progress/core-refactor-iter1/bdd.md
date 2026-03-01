# Feature: 核心精鍊迭代 1 — 表層清理行為不變驗證

> 目的：驗證 4 項重構（grader.js 刪除、state.js setFeatureName 改用 writeState、
> parse-result.js 排除條件提取為常量、timeline.js emit._counter 改為模組級變數）
> 完成後外部可觀測行為與重構前完全一致。
>
> 重構準則：不改變外部行為，只改變內部實作方式。

---

## Feature 1：grader.js 空殼模組刪除

### Scenario: 刪除空殼模組後無任何 require 錯誤
GIVEN grader.js 是只匯出空物件的空殼模組（`module.exports = {}`）
AND plugin 程式碼中沒有任何檔案 require grader.js
WHEN 刪除 grader.js 檔案
THEN 執行 `bun test` 所有測試通過，無任何 Cannot find module 錯誤
AND 執行 health-check.js 回傳正常結果，無 grader 相關錯誤

### Scenario: 其他模組不依賴 grader.js 的匯出值
GIVEN grader.js 目前匯出空物件 `{}`
AND on-stop.js、registry.js、config-api.js 等 plugin 程式碼引用的是 grader agent 設定，而非 grader.js 模組
WHEN 以任意 sessionId 執行完整工作流
THEN 所有 stage 結果解析正常運作
AND grader agent 仍可透過 agents/grader.md 設定被正確委派

### Scenario: 刪除後測試套件完整性不受影響
GIVEN tests/grader.test.js 是針對 grader agent 行為的測試（非針對 grader.js 模組）
WHEN 刪除 grader.js 並執行 `bun test`
THEN grader.test.js 測試通過（不依賴 grader.js 模組路徑）
AND 全部 1225 個（或更多）測試通過，0 個失敗

---

## Feature 2：state.js setFeatureName 改用 writeState

### Scenario: setFeatureName 呼叫後 featureName 正確寫入
GIVEN 一個已初始化的 session 狀態（featureName 為 null）
WHEN 呼叫 setFeatureName(sessionId, 'my-feature')
THEN readState(sessionId).featureName 等於 'my-feature'

### Scenario: setFeatureName 使用 writeState 後其他 state 欄位不受影響
GIVEN 一個已初始化的 session 狀態，包含 workflowType、stages、currentStage 等欄位
WHEN 呼叫 setFeatureName(sessionId, 'new-feature-name')
THEN readState(sessionId).workflowType 值不變
AND readState(sessionId).stages 值不變
AND readState(sessionId).currentStage 值不變
AND readState(sessionId).failCount 值不變

### Scenario: session 不存在時 setFeatureName 靜默返回
GIVEN 一個不存在的 sessionId（無對應 workflow.json）
WHEN 呼叫 setFeatureName(nonexistentSessionId, 'any-name')
THEN 不拋出任何例外
AND 不建立任何新檔案

### Scenario: setFeatureName 可連續更新 featureName
GIVEN 一個 featureName 已設為 'first-feature' 的 session
WHEN 呼叫 setFeatureName(sessionId, 'updated-feature')
THEN readState(sessionId).featureName 等於 'updated-feature'
AND 舊值 'first-feature' 不再存在

---

## Feature 3：parse-result.js 排除條件提取為常量

> 行為驗證：所有 verdict 判斷結果與重構前一致。
> 常量提取是純內部重構，外部介面不變。

### Scenario: REVIEW stage — reject 關鍵字觸發 reject verdict
GIVEN 一個 REVIEW、SECURITY 或 DB-REVIEW stage 的 agent 輸出
WHEN 輸出包含 'reject' 或 '拒絕' 且不含 'no reject' 或 'not reject'
THEN parseResult 回傳 `{ verdict: 'reject' }`

### Scenario: REVIEW stage — false positive 防護正確排除
GIVEN stageKey 為 'REVIEW'
WHEN 輸出包含 'no rejections found' 或 'not rejected' 或 'The code was not rejected'
THEN parseResult 回傳 `{ verdict: 'pass' }`（不誤判為 reject）

### Scenario: TEST stage — fail 關鍵字觸發 fail verdict
GIVEN stageKey 為 'TEST'、'QA'、'E2E' 或 'BUILD-FIX'
WHEN 輸出包含 'fail' 且不含 'no fail'、'0 fail'、'without fail'、'failure mode'
THEN parseResult 回傳 `{ verdict: 'fail' }`

### Scenario: TEST stage — error 關鍵字觸發 fail verdict
GIVEN stageKey 為 'TEST'
WHEN 輸出包含 'error' 且不含 'error handling'、'0 errors'、'error-free'、'without error'
THEN parseResult 回傳 `{ verdict: 'fail' }`

### Scenario: TEST stage — false positive 防護正確排除（fail 系列）
GIVEN stageKey 為 'TEST'
WHEN 輸出為 'No failures found. All 42 tests passed.'
THEN parseResult 回傳 `{ verdict: 'pass' }`
WHEN 輸出為 'Tests: 42 passed, 0 failed'
THEN parseResult 回傳 `{ verdict: 'pass' }`
WHEN 輸出為 'Completed without failure'
THEN parseResult 回傳 `{ verdict: 'pass' }`

### Scenario: TEST stage — false positive 防護正確排除（error 系列）
GIVEN stageKey 為 'TEST'
WHEN 輸出為 'Added proper error handling for edge cases'
THEN parseResult 回傳 `{ verdict: 'pass' }`
WHEN 輸出為 'Lint: 0 errors, 0 warnings'
THEN parseResult 回傳 `{ verdict: 'pass' }`
WHEN 輸出為 'The test suite is now error-free after fixes'
THEN parseResult 回傳 `{ verdict: 'pass' }`
WHEN 輸出為 'all tests ran without error in failure mode analysis'
THEN parseResult 回傳 `{ verdict: 'pass' }`

### Scenario: RETRO stage — issues 關鍵字觸發 issues verdict
GIVEN stageKey 為 'RETRO'
WHEN 輸出包含 'issues'、'改善建議' 或 '建議優化'
AND 不含 'no issues'、'0 issues'、'no significant issues'、'without issues'
THEN parseResult 回傳 `{ verdict: 'issues' }`

### Scenario: RETRO stage — false positive 防護正確排除
GIVEN stageKey 為 'RETRO'
WHEN 輸出包含 '0 issues found'、'no issues'、'Sprint completed without issues'
THEN parseResult 回傳 `{ verdict: 'pass' }`（不誤判為 issues）

### Scenario: 結構化 VERDICT 標記優先於字串匹配
GIVEN 任意 stageKey
WHEN 輸出包含 `<!-- VERDICT: {"result": "PASS"} -->` 且文字中也含有 'fail' 關鍵字
THEN parseResult 回傳 `{ verdict: 'pass' }`（結構化標記勝出）

### Scenario: 無效 VERDICT JSON 降級為字串匹配
GIVEN stageKey 為 'TEST'
WHEN 輸出包含 `<!-- VERDICT: {invalid} -->` 且文字包含 'Test passed with 0 failures'
THEN parseResult 降級為字串匹配，回傳 `{ verdict: 'pass' }`

### Scenario: 其他 stage 預設回傳 pass
GIVEN stageKey 為 'DEV'、'PLAN'、'ARCH' 或 'PM'
WHEN 輸出為任意文字（包含 fail 關鍵字）
THEN parseResult 回傳 `{ verdict: 'pass' }`

---

## Feature 4：timeline.js emit._counter 改為模組級變數

> 行為驗證：截斷觸發機制（每 100 次 emit 檢查一次）行為不變。
> 模組級變數取代函式屬性是純內部重構，外部可觀測行為相同。

### Scenario: emit 每 100 次觸發一次 trimIfNeeded
GIVEN 一個 timeline 檔案已有超過 MAX_EVENTS（2000）筆事件
WHEN 連續呼叫 emit 第 100 次（counter 達到 100 的倍數）
THEN timeline 檔案的行數被截斷至最近 2000 筆
AND 截斷後最新的事件仍被保留在檔案末端

### Scenario: emit 第 99 次不觸發截斷
GIVEN 一個 timeline 檔案已有超過 MAX_EVENTS 筆事件
WHEN 連續呼叫 emit 第 99 次（counter 未達 100 的倍數）
THEN timeline 檔案的行數不被截斷
AND 檔案行數 = 原始行數 + 99

### Scenario: emit 正常寫入事件，counter 行為對呼叫者透明
GIVEN 任意 sessionId 和合法的 eventType
WHEN 呼叫 emit(sessionId, 'workflow:start', {})
THEN 回傳包含 ts、type、category、label 欄位的事件物件
AND timeline JSONL 檔案新增一行

### Scenario: emit 使用未知 eventType 拋出錯誤
GIVEN 任意 sessionId
WHEN 呼叫 emit(sessionId, 'unknown:type:xyz', {})
THEN 拋出錯誤訊息包含 '未知的 timeline 事件類型'

### Scenario: counter 跨 session 累積，截斷正確針對當前 session
GIVEN 模組已被多次 emit 呼叫，counter 累積至某個值
WHEN 在 session-A 和 session-B 交替呼叫 emit，總計第 100 次時
THEN 只有 counter 達到 100 倍數時的那個 session 觸發 trimIfNeeded
AND 兩個 session 的事件都正確寫入各自的 timeline 檔案
