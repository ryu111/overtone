# Feature: Deep PM Interview Engine

深度 PM 訪談引擎，提供結構化多輪訪談 API，涵蓋五面向問題庫、session 持久化、以及 BDD Project Spec 產生能力。

---

## Feature 1: init — 初始化訪談 session

### Scenario: 以合法參數建立新訪談 session
GIVEN 一個有效的 featureName（非空字串）和可寫入的 outputPath
WHEN 呼叫 `init(featureName, outputPath)`
THEN 回傳 InterviewSession 物件
AND session.featureName 等於傳入的 featureName
AND session.outputPath 等於傳入的 outputPath
AND session.answers 為空物件 `{}`
AND session.startedAt 為合法的 ISO 8601 時間字串
AND session.completedAt 為 undefined
AND session.options.minAnswersPerFacet 為 2（預設值）

### Scenario: 以自訂 options 初始化 session
GIVEN 一個合法的 featureName 和 outputPath
AND options 帶有 `{ minAnswersPerFacet: 3 }`
WHEN 呼叫 `init(featureName, outputPath, options)`
THEN session.options.minAnswersPerFacet 等於 3
AND 其餘欄位結構與預設初始化相同

### Scenario: featureName 為空時拋出錯誤
GIVEN featureName 為空字串 `""`
WHEN 呼叫 `init("", "/some/path")`
THEN 拋出包含 `INVALID_INPUT` 的錯誤
AND 錯誤訊息包含「featureName 不可為空」

---

## Feature 2: nextQuestion — 取得下一個問題

### Scenario: 全新 session 時返回第一個必問題
GIVEN 一個全新的訪談 session（answers 為空）
WHEN 呼叫 `nextQuestion(session)`
THEN 回傳 Question 物件（非 null）
AND question.required 為 true
AND question.facet 為五面向之一（functional / flow / ui / edge-cases / acceptance）
AND question.id 符合格式 `{facet前綴}-{序號}`（如 `func-1`）

### Scenario: 必問題全部完成後返回補充題
GIVEN 一個 session，所有必問題均已記錄回答
WHEN 呼叫 `nextQuestion(session)`
THEN 回傳 Question 物件（非 null）
AND question.required 為 false

### Scenario: 所有問題（必問 + 補充）均已回答時返回 null
GIVEN 一個 session，所有面向的必問題與補充題均已記錄回答
WHEN 呼叫 `nextQuestion(session)`
THEN 回傳 null

### Scenario: 已達完成門檻但仍有未回答補充題時繼續返回補充題
GIVEN 一個 session，每個必問面向已達 minAnswersPerFacet 門檻
AND 仍有未回答的補充題
WHEN 呼叫 `nextQuestion(session)`
THEN 回傳補充題 Question 物件（非 null）

### Scenario: dependsOn 題目的前置問題尚未回答時跳過該題
GIVEN 問題庫中有一個補充題 `flow-4`，其 `dependsOn` 為 `flow-1`
AND session 中 `flow-1` 尚未回答
WHEN 呼叫 `nextQuestion(session)`
THEN 回傳的問題不是 `flow-4`（跳過依賴未滿足的問題）

---

## Feature 3: recordAnswer — 記錄回答

### Scenario: 正常記錄一個回答
GIVEN 一個有效的訪談 session
AND 問題庫中存在 questionId `func-1`
WHEN 呼叫 `recordAnswer(session, "func-1", "使用者可以新增待辦事項")`
THEN 回傳更新後的 InterviewSession
AND session.answers["func-1"] 等於 "使用者可以新增待辦事項"
AND 其他既有的 answers 保持不變

### Scenario: 對同一 questionId 重複回答時覆蓋舊答案
GIVEN session.answers 中已有 `func-1` 的回答
WHEN 再次呼叫 `recordAnswer(session, "func-1", "新的回答")`
THEN session.answers["func-1"] 等於 "新的回答"
AND session 中只有一筆 `func-1` 的記錄

### Scenario: 回答為空字串時仍可記錄（不強制非空）
GIVEN 一個有效的訪談 session
WHEN 呼叫 `recordAnswer(session, "func-2", "")`
THEN session.answers["func-2"] 等於 ""
AND 不拋出任何錯誤

---

## Feature 4: isComplete — 完成度判斷

### Scenario: 每個必問面向均達到 minAnswersPerFacet 門檻時回傳 true
GIVEN 一個 session，options.minAnswersPerFacet 為 2
AND functional 面向已有 2 個必問題回答
AND flow 面向已有 2 個必問題回答
AND edge-cases 面向已有 2 個必問題回答
AND acceptance 面向已有 2 個必問題回答
WHEN 呼叫 `isComplete(session)`
THEN 回傳 true

### Scenario: 任一必問面向未達門檻時回傳 false
GIVEN 一個 session，functional 面向只有 1 個必問題回答（門檻為 2）
WHEN 呼叫 `isComplete(session)`
THEN 回傳 false

### Scenario: ui 面向（全補充題）不影響完成度判斷
GIVEN 一個 session，所有必問面向均達門檻
AND ui 面向沒有任何回答
WHEN 呼叫 `isComplete(session)`
THEN 回傳 true（ui 面向可跳過）

### Scenario: minAnswersPerFacet 為 3 時需要更多回答才算完成
GIVEN 一個 session，options.minAnswersPerFacet 為 3
AND functional 面向只有 2 個必問題回答
WHEN 呼叫 `isComplete(session)`
THEN 回傳 false

### Scenario: 全新 session（無任何回答）時回傳 false
GIVEN 一個全新的 session，answers 為空物件
WHEN 呼叫 `isComplete(session)`
THEN 回傳 false

---

## Feature 5: generateSpec — 產生 Project Spec

### Scenario: 訪談完成後產生合法的 ProjectSpec 物件並寫入檔案
GIVEN 一個完成的訪談 session（所有必問面向均達門檻）
AND outputPath 指向可寫入的臨時目錄
WHEN 呼叫 `generateSpec(session)`
THEN 回傳 ProjectSpec 物件
AND ProjectSpec.feature 等於 session.featureName
AND ProjectSpec.generatedAt 為合法的 ISO 8601 時間字串
AND ProjectSpec.facets.acceptance 陣列長度 >= 10（BDD 場景數）
AND 在 outputPath 建立 `project-spec.md` 檔案
AND project-spec.md 存在且非空

### Scenario: BDD 場景數量不足 10 時自動從 edge-cases + acceptance 補充
GIVEN 一個 session，acceptance 面向只有 3 個回答
AND edge-cases 面向有 3 個回答
WHEN 呼叫 `generateSpec(session)`
THEN ProjectSpec.facets.acceptance 陣列長度仍 >= 10
AND 補充的 BDD 場景來自 edge-cases 或 acceptance 的拆分

### Scenario: 每個 BDD 場景均包含 title、given、when、then 欄位
GIVEN 一個完成的訪談 session
WHEN 呼叫 `generateSpec(session)`
THEN ProjectSpec.facets.acceptance 中每個 BDDScenario 均包含非空的 title 字串
AND 每個 BDDScenario 均包含非空的 given 字串
AND 每個 BDDScenario 均包含非空的 when 字串
AND 每個 BDDScenario 均包含非空的 then 字串

### Scenario: outputPath 無寫入權限時拋出 WRITE_ERROR
GIVEN outputPath 指向一個沒有寫入權限的路徑
AND 訪談 session 已完成
WHEN 呼叫 `generateSpec(session)`
THEN 拋出包含 `WRITE_ERROR` 的錯誤
AND 錯誤訊息包含 outputPath

### Scenario: 產生的 project-spec.md 包含 Markdown GIVEN/WHEN/THEN 格式
GIVEN 一個完成的訪談 session，有充足的回答
WHEN 呼叫 `generateSpec(session)`
THEN project-spec.md 的內容包含「GIVEN」關鍵字
AND project-spec.md 的內容包含「WHEN」關鍵字
AND project-spec.md 的內容包含「THEN」關鍵字

---

## Feature 6: loadSession / saveSession — 中斷恢復

### Scenario: saveSession 將 session 寫入指定路徑
GIVEN 一個有效的 InterviewSession 物件
AND statePath 指向可寫入的臨時目錄下的 interview-state.json
WHEN 呼叫 `saveSession(session, statePath)`
THEN statePath 的檔案存在
AND 檔案內容為合法 JSON
AND JSON 的 version 欄位為 1
AND JSON 的 featureName 與 session.featureName 相同
AND JSON 的 answers 與 session.answers 相同

### Scenario: loadSession 從已有狀態檔還原 session
GIVEN statePath 指向一個合法的 interview-state.json（已由 saveSession 寫入）
WHEN 呼叫 `loadSession(statePath)`
THEN 回傳 InterviewSession 物件（非 null）
AND 還原的 session.featureName 與原 session 相同
AND 還原的 session.answers 與原 session 相同
AND 還原的 session.options.minAnswersPerFacet 與原 session 相同

### Scenario: 狀態檔不存在時回傳 null
GIVEN statePath 指向一個不存在的路徑
WHEN 呼叫 `loadSession(statePath)`
THEN 回傳 null（不拋出錯誤）

### Scenario: 狀態檔內容損壞（非合法 JSON）時靜默回傳 null
GIVEN statePath 指向一個內容為 `{ broken json` 的檔案
WHEN 呼叫 `loadSession(statePath)`
THEN 回傳 null（不拋出錯誤）

### Scenario: 中斷恢復完整流程
GIVEN 一個訪談 session，已回答 3 個問題並呼叫 saveSession 儲存
WHEN 呼叫 `loadSession(statePath)` 還原 session
AND 呼叫 `nextQuestion(restoredSession)` 取得下一個問題
THEN 返回的問題不是已回答的 3 個問題之一
AND 訪談可繼續進行

---

## Feature 7: 問題庫結構完整性

### Scenario: 問題庫包含五個面向的問題
GIVEN 訪談引擎已載入
WHEN 查詢問題庫的面向分佈
THEN 包含 functional 面向問題（至少 3 個必問 + 2 個補充）
AND 包含 flow 面向問題（至少 2 個必問 + 2 個補充）
AND 包含 ui 面向問題（0 個必問 + 至少 3 個補充）
AND 包含 edge-cases 面向問題（至少 2 個必問 + 2 個補充）
AND 包含 acceptance 面向問題（至少 3 個必問 + 2 個補充）

### Scenario: 所有問題的 id 符合格式規範
GIVEN 訪談引擎已載入
WHEN 列出所有問題的 id
THEN 每個 id 符合正規表達式 `/^[a-z-]+-\d+$/`（如 func-1、edge-2）
AND 所有 id 在問題庫中唯一（無重複）

### Scenario: 問題庫總題數不超過合理範圍
GIVEN 訪談引擎已載入
WHEN 計算問題庫總題數
THEN 總題數在 15 到 30 之間（含端點）

---

## Feature 8: 邊界條件與防禦性行為

### Scenario: nextQuestion 在 session 物件結構異常時不崩潰
GIVEN session.answers 為 null（非正常輸入）
WHEN 呼叫 `nextQuestion(session)`
THEN 不拋出未處理的例外
AND 回傳 Question 或 null（以合理方式處理）

### Scenario: recordAnswer 不改變傳入的原始 session 物件（純函式）
GIVEN 一個有效的 session，session.answers 中有 1 筆記錄
WHEN 呼叫 `recordAnswer(session, "func-2", "答案")`
THEN 原始 session 物件不被修改
AND 回傳值為新的 InterviewSession 物件（或原物件的安全更新）

### Scenario: 多次呼叫 generateSpec 不產生重複檔案衝突
GIVEN 一個完成的訪談 session
AND outputPath 下已存在 project-spec.md
WHEN 再次呼叫 `generateSpec(session)`
THEN 覆蓋既有的 project-spec.md（不拋出錯誤）
AND 新產生的 ProjectSpec.generatedAt 晚於舊檔案的時間戳
