# BDD 行為規格：數值評分引擎（numeric-score-engine）

> 對應架構設計：`specs/features/in-progress/numeric-score-engine/design.md`
> 撰寫模式：TEST:spec（DEV 前）

---

## Feature 1: saveScore — 評分記錄寫入

### Scenario 1-1: 有效記錄成功寫入 scores.jsonl

@smoke
GIVEN projectRoot 指向一個合法的臨時目錄
AND scores.jsonl 目前不存在
WHEN 呼叫 saveScore(projectRoot, { ts, sessionId, workflowType: "quick", stage: "DEV", agent: "developer", scores: { clarity: 4, completeness: 5, actionability: 3 }, overall: 4.0 })
THEN scores.jsonl 被建立
AND 檔案包含一行有效的 JSON
AND 該行解析後的 stage = "DEV"
AND 該行解析後的 overall = 4.0

### Scenario 1-2: 多次呼叫以 append-only 方式累積記錄

@smoke
GIVEN scores.jsonl 已存在且有一筆記錄
WHEN 再次呼叫 saveScore 寫入第二筆不同 stage 的記錄
THEN scores.jsonl 共有兩行
AND 第一筆記錄未被覆蓋或修改

### Scenario 1-3: 缺少 stage 欄位時拋出錯誤

@error-case
GIVEN 一個缺少 stage 欄位的 record 物件
WHEN 呼叫 saveScore(projectRoot, record)
THEN 拋出含有明確說明的例外
AND scores.jsonl 不被建立或不新增任何內容

### Scenario 1-4: 缺少 scores 子欄位時拋出錯誤

@error-case
GIVEN 一個 scores 物件中缺少 clarity 欄位的 record
WHEN 呼叫 saveScore(projectRoot, record)
THEN 拋出含有明確說明的例外

### Scenario 1-5: 分數目錄不存在時自動建立

@edge-case
GIVEN projectRoot 指向一個全新的臨時目錄（scores 目錄鏈不存在）
WHEN 呼叫 saveScore 寫入一筆有效記錄
THEN 目錄鏈被自動建立（mkdirSync recursive）
AND 記錄成功寫入 scores.jsonl

---

## Feature 2: queryScores — 評分記錄查詢

### Scenario 2-1: 無 filter 回傳全部記錄

@smoke
GIVEN scores.jsonl 有 3 筆不同 stage 的記錄（DEV、REVIEW、TEST）
WHEN 呼叫 queryScores(projectRoot, {})
THEN 回傳陣列長度 = 3
AND 陣列按寫入順序排列

### Scenario 2-2: 按 stage 篩選只回傳符合的記錄

@smoke
GIVEN scores.jsonl 有 DEV 記錄 2 筆、REVIEW 記錄 1 筆
WHEN 呼叫 queryScores(projectRoot, { stage: "DEV" })
THEN 回傳陣列長度 = 2
AND 所有記錄的 stage = "DEV"

### Scenario 2-3: 按 workflowType 篩選

@smoke
GIVEN scores.jsonl 有 workflowType="quick" 記錄 2 筆、workflowType="standard" 記錄 1 筆
WHEN 呼叫 queryScores(projectRoot, { workflowType: "quick" })
THEN 回傳陣列長度 = 2
AND 所有記錄的 workflowType = "quick"

### Scenario 2-4: limit 限制最多回傳筆數（取最新）

@smoke
GIVEN scores.jsonl 有 5 筆同 stage 的記錄（依時間 ts 順序寫入）
WHEN 呼叫 queryScores(projectRoot, { limit: 3 })
THEN 回傳陣列長度 = 3
AND 回傳的是最後 3 筆（最新的）

### Scenario 2-5: scores.jsonl 不存在時回傳空陣列

@edge-case
GIVEN scores.jsonl 不存在
WHEN 呼叫 queryScores(projectRoot, {})
THEN 回傳空陣列
AND 不拋出任何錯誤

### Scenario 2-6: 組合 stage + limit 篩選

@edge-case
GIVEN scores.jsonl 有 DEV 記錄 4 筆、REVIEW 記錄 2 筆
WHEN 呼叫 queryScores(projectRoot, { stage: "DEV", limit: 2 })
THEN 回傳陣列長度 = 2
AND 所有記錄的 stage = "DEV"

### Scenario 2-7: 損壞的 JSON 行被跳過，不影響其他記錄

@error-case
GIVEN scores.jsonl 包含 2 筆有效記錄和 1 行損壞的 JSON（無效格式）
WHEN 呼叫 queryScores(projectRoot, {})
THEN 回傳陣列長度 = 2
AND 不拋出任何錯誤

---

## Feature 3: getScoreSummary — 平均分摘要

### Scenario 3-1: 有記錄時回傳正確平均值

@smoke
GIVEN scores.jsonl 有 DEV 記錄 2 筆
AND 第一筆 overall = 4.0（clarity=4, completeness=4, actionability=4）
AND 第二筆 overall = 2.0（clarity=2, completeness=2, actionability=2）
WHEN 呼叫 getScoreSummary(projectRoot, "DEV")
THEN 回傳 sessionCount = 2
AND avgOverall = 3.0（兩筆平均）
AND avgClarity = 3.0
AND avgCompleteness = 3.0
AND avgActionability = 3.0

### Scenario 3-2: windowSize 只取最近 N 筆

@smoke
GIVEN scores.jsonl 有 DEV 記錄 15 筆，overall 依序為 1.0 到 5.0（遞增）
WHEN 呼叫 getScoreSummary(projectRoot, "DEV", 5)
THEN 回傳 sessionCount = 5
AND avgOverall 只計算最後 5 筆的平均（不含早期低分記錄）

### Scenario 3-3: 不傳 n 時使用 scoringDefaults.compareWindowSize（預設 10）

@smoke
GIVEN scores.jsonl 有 DEV 記錄 12 筆
WHEN 呼叫 getScoreSummary(projectRoot, "DEV")（不傳 n）
THEN 回傳 sessionCount = 10
AND 只計算最近 10 筆

### Scenario 3-4: 指定 stage 無記錄時回傳 null 平均值

@edge-case
GIVEN scores.jsonl 存在但只有 REVIEW 記錄
WHEN 呼叫 getScoreSummary(projectRoot, "DEV")
THEN 回傳 sessionCount = 0
AND avgClarity = null
AND avgCompleteness = null
AND avgActionability = null
AND avgOverall = null

### Scenario 3-5: scores.jsonl 不存在時回傳空摘要不報錯

@edge-case
GIVEN scores.jsonl 不存在
WHEN 呼叫 getScoreSummary(projectRoot, "DEV")
THEN 回傳 sessionCount = 0
AND avgOverall = null
AND 不拋出任何錯誤

---

## Feature 4: 截斷機制（_trimIfNeeded）

### Scenario 4-1: 某 stage 記錄超過 maxRecordsPerStage 時自動截斷

@smoke
GIVEN scores.jsonl 已有 DEV 記錄 50 筆（達到上限 maxRecordsPerStage = 50）
WHEN 呼叫 saveScore 寫入第 51 筆 DEV 記錄
THEN _trimIfNeeded 被觸發
AND scores.jsonl 中 DEV 記錄仍為 50 筆
AND 保留的是最新的 50 筆（最早的一筆被移除）

### Scenario 4-2: 截斷只影響超限的 stage，其他 stage 記錄不受影響

@edge-case
GIVEN scores.jsonl 有 DEV 記錄 50 筆、REVIEW 記錄 3 筆
WHEN 呼叫 saveScore 寫入第 51 筆 DEV 記錄
THEN DEV 記錄截斷至 50 筆
AND REVIEW 記錄保持 3 筆不變

### Scenario 4-3: 記錄未超過上限時不觸發截斷

@edge-case
GIVEN scores.jsonl 有 DEV 記錄 10 筆（遠低於 50 筆上限）
WHEN 呼叫 saveScore 寫入一筆新的 DEV 記錄
THEN scores.jsonl 共有 11 筆 DEV 記錄
AND 原始記錄均未被移除

### Scenario 4-4: 截斷使用原子寫回（atomicWrite）不產生中間損壞狀態

@edge-case
GIVEN scores.jsonl 有 51 筆 DEV 記錄需要截斷
WHEN _trimIfNeeded 執行截斷
THEN 截斷完成後 scores.jsonl 是合法的 JSONL（每行均可解析）
AND 不產生空檔案或格式損壞

---

## Feature 5: 專案隔離（projectRoot 維度）

### Scenario 5-1: 不同 projectRoot 寫入各自的 scores.jsonl

@smoke
GIVEN projectRoot A 和 projectRoot B 為不同目錄
WHEN 對 projectRoot A 呼叫 saveScore 寫入 DEV 記錄
THEN projectRoot B 的 scores.jsonl 保持空白或不受影響

### Scenario 5-2: 查詢只回傳當前 projectRoot 的記錄

@smoke
GIVEN projectRoot A 有 DEV 記錄 2 筆
AND projectRoot B 有 REVIEW 記錄 3 筆
WHEN 對 projectRoot A 呼叫 queryScores(projectRootA, { stage: "DEV" })
THEN 回傳 2 筆 DEV 記錄
AND 不包含 projectRoot B 的任何記錄

### Scenario 5-3: 兩個 projectRoot 的 scores.jsonl 路徑不同

@smoke
GIVEN projectRoot A = "/tmp/project-a"
AND projectRoot B = "/tmp/project-b"
WHEN 分別呼叫 paths.global.scores(projectRootA) 和 paths.global.scores(projectRootB)
THEN 兩個回傳路徑不同
AND 各自的路徑格式為 ~/.overtone/global/{projectHash}/scores.jsonl

---

## Feature 6: stop-message-builder 整合 — PASS 階段評分提示

### Scenario 6-1: 在 gradedStages 中的 stage PASS 時出現評分提示訊息

@smoke
GIVEN stageKey = "DEV"（在 gradedStages 清單中）
AND result = "pass"
AND scoringConfig.gradedStages = ["DEV", "REVIEW", "TEST"]
WHEN 呼叫 buildStopMessages 並傳入 scoringConfig 和 stageKey
THEN 回傳的 messages 包含一條「建議委派 grader 評分」的提示
AND 提示中包含 STAGE=DEV 和 AGENT={agentName}

### Scenario 6-2: 不在 gradedStages 中的 stage PASS 時不出現評分提示

@edge-case
GIVEN stageKey = "DOCS"（不在 gradedStages 清單中）
AND result = "pass"
WHEN 呼叫 buildStopMessages 並傳入 scoringConfig 和 stageKey
THEN 回傳的 messages 不包含任何「grader 評分」相關提示

### Scenario 6-3: 未傳入 scoringConfig 時不出現評分提示（向後相容）

@edge-case
GIVEN scoringConfig 未傳入（undefined）
AND stageKey = "DEV"
AND result = "pass"
WHEN 呼叫 buildStopMessages
THEN 回傳的 messages 不包含任何「grader 評分」相關提示
AND 函式不拋出錯誤

### Scenario 6-4: result = "fail" 時不觸發評分提示

@edge-case
GIVEN stageKey = "TEST"（在 gradedStages 中）
AND result = "fail"
WHEN 呼叫 buildStopMessages 並傳入 scoringConfig
THEN 回傳的 messages 不包含「grader 評分」提示

### Scenario 6-5: 有上次低分記錄時附加低分警告訊息

@smoke
GIVEN stageKey = "DEV"（在 gradedStages 中）
AND result = "pass"
AND lastScore.avgOverall = 2.5（低於 lowScoreThreshold = 3.0）
WHEN 呼叫 buildStopMessages 並傳入 scoringConfig 和 lastScore
THEN 回傳的 messages 包含低分警告訊息
AND 警告訊息包含平均分數值 2.5

### Scenario 6-6: 有上次記錄但分數高於閾值時不出現警告

@edge-case
GIVEN stageKey = "DEV"
AND result = "pass"
AND lastScore.avgOverall = 4.2（高於 lowScoreThreshold = 3.0）
WHEN 呼叫 buildStopMessages 並傳入 scoringConfig 和 lastScore
THEN 回傳的 messages 不包含低分警告訊息
AND 評分提示仍然存在

### Scenario 6-7: lastScore.avgOverall = null（尚無歷史記錄）時不出現警告

@edge-case
GIVEN stageKey = "DEV"
AND result = "pass"
AND lastScore.avgOverall = null（空的摘要）
WHEN 呼叫 buildStopMessages 並傳入 scoringConfig 和 lastScore
THEN 不出現低分警告訊息
AND 評分提示正常出現

---

## Feature 7: 低分閾值觸發 instinct quality_signal

### Scenario 7-1: overall 低於 lowScoreThreshold 時發出 quality_signal

@smoke
GIVEN on-stop.js 收到 grader 輸出 overall = 2.5
AND scoringConfig.lowScoreThreshold = 3.0
AND stageKey = "DEV"（在 gradedStages 中）
WHEN on-stop.js 處理 emitQualitySignal stateUpdate
THEN instinct.emit 被呼叫，type = "quality_signal"
AND tag 包含 agentName

### Scenario 7-2: overall 等於 lowScoreThreshold 時不觸發（須嚴格低於）

@edge-case
GIVEN lastScore.avgOverall = 3.0（剛好等於閾值）
AND lowScoreThreshold = 3.0
WHEN 呼叫 buildStopMessages
THEN stateUpdates 不包含 emitQualitySignal
AND 不發出 quality_signal

### Scenario 7-3: stageKey 不在 gradedStages 時不查分數也不發 instinct

@edge-case
GIVEN stageKey = "DOCS"（不在 gradedStages）
AND result = "pass"
WHEN on-stop.js 執行 PASS 處理
THEN getScoreSummary 不被呼叫（或被跳過）
AND instinct.emit 不被呼叫

### Scenario 7-4: getScoreSummary 拋出例外時靜默捕獲，不影響主流程

@error-case
GIVEN getScoreSummary 執行時拋出任意例外
AND stageKey = "DEV"（在 gradedStages 中）
WHEN on-stop.js 執行 PASS 處理
THEN 例外被靜默捕獲（try/catch 隔離）
AND stop-message-builder 仍然被呼叫（lastScore = null）
AND on-stop.js 不崩潰

---

## Feature 8: 損壞 JSONL 容錯

### Scenario 8-1: scores.jsonl 全部為無效 JSON 時回傳空陣列

@error-case
GIVEN scores.jsonl 內容為完全無效的文字（非 JSON）
WHEN 呼叫 queryScores(projectRoot, {})
THEN 回傳空陣列
AND 不拋出任何錯誤

### Scenario 8-2: 部分行損壞時跳過損壞行，保留有效記錄

@error-case
GIVEN scores.jsonl 有 3 行：第 1 行有效、第 2 行損壞、第 3 行有效
WHEN 呼叫 queryScores(projectRoot, {})
THEN 回傳 2 筆有效記錄
AND 損壞行被靜默跳過

### Scenario 8-3: scores.jsonl 為空檔案時回傳空陣列

@edge-case
GIVEN scores.jsonl 存在但內容為空
WHEN 呼叫 queryScores(projectRoot, {})
THEN 回傳空陣列
AND 不拋出任何錯誤

---

## Feature 9: registry.js 設定常數

### Scenario 9-1: scoringConfig 包含必要欄位

@smoke
GIVEN registry.js 已載入
WHEN 讀取 scoringConfig
THEN scoringConfig.gradedStages 是非空陣列
AND scoringConfig.gradedStages 包含 "DEV"、"REVIEW"、"TEST"
AND scoringConfig.lowScoreThreshold = 3.0

### Scenario 9-2: scoringDefaults 包含必要欄位

@smoke
GIVEN registry.js 已載入
WHEN 讀取 scoringDefaults
THEN scoringDefaults.compareWindowSize = 10
AND scoringDefaults.maxRecordsPerStage = 50

### Scenario 9-3: scoringConfig 和 scoringDefaults 可從 module.exports 取得

@smoke
GIVEN registry.js 以 require 載入
WHEN 解構取出 { scoringConfig, scoringDefaults }
THEN 兩者均為物件（非 undefined）

---

## Feature 10: paths.js 全域評分路徑

### Scenario 10-1: paths.global.scores(projectRoot) 回傳正確路徑格式

@smoke
GIVEN paths.js 已載入
AND projectRoot = "/Users/me/projects/overtone"
WHEN 呼叫 paths.global.scores(projectRoot)
THEN 回傳路徑以 "scores.jsonl" 結尾
AND 路徑包含由 projectRoot 衍生的 hash（非 projectRoot 字串本身）
AND 路徑格式為 ~/.overtone/global/{projectHash}/scores.jsonl

### Scenario 10-2: 相同 projectRoot 多次呼叫回傳相同路徑（穩定性）

@edge-case
GIVEN projectRoot = "/Users/me/projects/overtone"
WHEN 連續呼叫 paths.global.scores(projectRoot) 三次
THEN 三次回傳完全相同的路徑

### Scenario 10-3: 不同 projectRoot 回傳不同路徑

@smoke
GIVEN projectRoot A = "/tmp/project-a"
AND projectRoot B = "/tmp/project-b"
WHEN 分別呼叫 paths.global.scores(projectRootA) 和 paths.global.scores(projectRootB)
THEN 兩個路徑不相同
