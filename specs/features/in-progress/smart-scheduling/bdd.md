# Feature: smart-scheduling — 智慧排程（失敗率二次排序）

## 背景

suggestOrder 現有邏輯以 WORKFLOW_ORDER（複雜度）作為主排序鍵。
smart-scheduling 新增 failureData 作為二次排序鍵，讓歷史失敗率高的 workflow 排在較後面。
getWorkflowFailureRates 負責從 failures.jsonl 聚合各 workflowType 的失敗率，供呼叫方傳入。

---

## Feature A: suggestOrder with failureData

### Scenario A-1: 無 failureData 時行為與原有邏輯完全相同

GIVEN 佇列中有 ["full-task"(full), "quick-task"(quick), "std-task"(standard)] 三個 pending 項目
WHEN 呼叫 suggestOrder(projectRoot)（不傳 options）
THEN 結果與只依複雜度排序相同：["quick-task", "std-task", "full-task"]
AND changed 為 true
AND 佇列檔案未被修改（原始順序不變）

### Scenario A-2: 有 failureData 時同複雜度項目依低失敗率優先排序

GIVEN 佇列中有 ["proj-A"(standard, failureRate=0.5), "proj-B"(standard, failureRate=0.1)] 兩個 pending 項目
AND failureData = { standard: { count: 5, rate: 0.5 } }（proj-A 所在 workflow 失敗率較高）
WHEN 呼叫 suggestOrder(projectRoot, { failureData })
AND proj-A 使用 standard workflow（rate=0.5），proj-B 使用 quick workflow（rate=0）
THEN 排序結果：proj-B 排前（quick 較簡單），proj-A 排後（standard 較複雜）
AND changed 為 true

GIVEN 佇列中有 ["proj-A"(standard, failureRate=0.5), "proj-B"(standard, failureRate=0.1)] 兩個 pending 項目
AND failureData = { standard: { count: 5, rate: 0.5 }, quick: { count: 1, rate: 0.1 } }
WHEN 呼叫 suggestOrder(projectRoot, { failureData: { standard: { count: 3, rate: 0.6 }, quick: { count: 1, rate: 0.1 } } })
AND 兩個項目 workflow 相同（皆為 standard），但需兩個不同項目比較失敗率
THEN 較低失敗率的項目排在前面

### Scenario A-3: 複雜度差異大於失敗率差異時仍以複雜度為主

GIVEN 佇列中有 ["heavy"(full), "light"(single)] 兩個 pending 項目
AND failureData = { full: { count: 0, rate: 0 }, single: { count: 10, rate: 1.0 } }（single 失敗率極高但複雜度低）
WHEN 呼叫 suggestOrder(projectRoot, { failureData })
THEN "light"(single) 仍排在 "heavy"(full) 之前
AND 複雜度主排序鍵優先於失敗率次排序鍵

### Scenario A-4: failureData 中無對應 workflow 時 rate 預設為 0

GIVEN 佇列中有 ["task-A"(standard), "task-B"(quick)] 兩個 pending 項目
AND failureData = { standard: { count: 3, rate: 0.3 } }（quick 不在 failureData 中）
WHEN 呼叫 suggestOrder(projectRoot, { failureData })
THEN quick 的 failureRate 視為 0
AND 排序結果：quick 排前（複雜度低），standard 排後
AND 不拋出錯誤（缺席 key 不造成 crash）

### Scenario A-5: 空 failureData {} 時退化為原始複雜度邏輯

GIVEN 佇列中有 ["full-task"(full), "single-task"(single)] 兩個 pending 項目
AND failureData = {}（空物件，無任何 workflow 失敗記錄）
WHEN 呼叫 suggestOrder(projectRoot, { failureData: {} })
THEN 排序結果與不傳 failureData 相同：["single-task", "full-task"]
AND 所有 workflow 的失敗率視為 0，複雜度為唯一有效排序鍵

### Scenario A-6: 同複雜度同失敗率時保持原始相對順序（穩定排序）

GIVEN 佇列中有 ["std-1"(standard), "std-2"(standard), "std-3"(standard)] 三個 pending 項目
AND failureData = {}（三者失敗率皆為 0）
WHEN 呼叫 suggestOrder(projectRoot, { failureData: {} })
THEN 輸出順序維持 ["std-1", "std-2", "std-3"]（原始索引為三鍵，保持穩定）
AND changed 為 false（順序未變）

---

## Feature B: getWorkflowFailureRates

### Scenario B-1: failures.jsonl 不存在時回傳空物件

GIVEN projectRoot 對應的 global 目錄下無 failures.jsonl 檔案
WHEN 呼叫 getWorkflowFailureRates(projectRoot)
THEN 回傳 {}
AND 不拋出錯誤

### Scenario B-2: 有失敗記錄時正確按 workflowType 聚合

GIVEN failures.jsonl 中包含以下記錄：
  - { workflowType: "standard", stage: "DEV", verdict: "fail" }
  - { workflowType: "standard", stage: "TEST", verdict: "fail" }
  - { workflowType: "quick", stage: "DEV", verdict: "fail" }
  - { workflowType: "standard", stage: "REVIEW", verdict: "reject" }
WHEN 呼叫 getWorkflowFailureRates(projectRoot)
THEN 回傳物件包含 standard 和 quick 兩個 key
AND standard.count 為 3
AND quick.count 為 1
AND standard.rate + quick.rate 接近 1.0（率加總等於 1）
AND standard.rate 為 0.75（3/4）
AND quick.rate 為 0.25（1/4）

### Scenario B-3: workflowType 為 null 的記錄跳過不計入

GIVEN failures.jsonl 中包含以下記錄：
  - { workflowType: "standard", stage: "DEV", verdict: "fail" }
  - { workflowType: null, stage: "DEV", verdict: "fail" }（舊格式記錄）
  - { workflowType: undefined, stage: "TEST", verdict: "fail" }（缺少欄位）
WHEN 呼叫 getWorkflowFailureRates(projectRoot)
THEN 只有 standard 在結果中
AND standard.count 為 1
AND standard.rate 為 1.0
AND null/undefined workflowType 的記錄不影響計算

### Scenario B-4: 回傳的 rate 四捨五入至小數點後 4 位

GIVEN failures.jsonl 中有 3 筆 standard 失敗，1 筆 quick 失敗（共 4 筆）
WHEN 呼叫 getWorkflowFailureRates(projectRoot)
THEN standard.rate 為 0.75（3/4，精確值）
AND quick.rate 為 0.25（1/4，精確值）
AND 若計算結果為無限循環小數，四捨五入至 4 位（如 1/3 → 0.3333）

### Scenario B-5: 已解決的失敗記錄（resolved）不計入失敗率

GIVEN failures.jsonl 中有以下記錄：
  - { workflowType: "standard", verdict: "fail", resolved: true }（已解決）
  - { workflowType: "standard", verdict: "fail" }（未解決）
WHEN 呼叫 getWorkflowFailureRates(projectRoot)
THEN 只有未解決的 1 筆計入
AND standard.count 為 1
AND standard.rate 為 1.0（行為與 getFailurePatterns 的 _filterResolved 一致）

---

## Feature C: queue.js CLI --smart flag

### Scenario C-1: 不加 --smart 時 suggest-order 維持現有輸出格式

GIVEN 佇列中有複數個 pending 項目
WHEN 執行 bun scripts/queue.js suggest-order
THEN 輸出「建議排序：」標題（現有格式）
AND 不顯示「智慧排序模式」相關說明文字

### Scenario C-2: 加 --smart 時輸出智慧排序模式說明

GIVEN 佇列中有複數個 pending 項目
WHEN 執行 bun scripts/queue.js suggest-order --smart
THEN 輸出包含「智慧排序模式（依複雜度 + 歷史失敗率）：」說明
AND 排序結果正常輸出

### Scenario C-3: --smart 不被誤判為 positional 參數

GIVEN 執行 bun scripts/queue.js suggest-order --smart
WHEN CLI 解析參數
THEN --smart 被識別為 flag，不被誤解為佇列名稱或 workflow 名稱
AND 不產生「Unknown command」或參數解析錯誤

### Scenario C-4: --smart 與 --apply 可同時使用

GIVEN 佇列中有需要重排的 pending 項目
WHEN 執行 bun scripts/queue.js suggest-order --smart --apply
THEN 智慧排序邏輯正確計算新順序
AND --apply 行為正常（套用排序到佇列檔案）
AND 輸出包含「智慧排序模式」說明
