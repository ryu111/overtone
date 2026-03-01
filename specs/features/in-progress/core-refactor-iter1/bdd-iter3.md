# Feature: 迭代 3 測試覆蓋補強 — JSONL 損壞行容錯、count()、passAtK()

## 背景

本次迭代不修改任何產品程式碼，僅補強 3 個測試區域：

A. JSONL 損壞行容錯（timeline.query/latest/count + instinct._readAll）
B. timeline.count() 獨立測試強化（針對損壞行場景）
C. timeline.passAtK() 獨立測試

損壞行定義：JSONL 中無法被 JSON.parse() 成功解析的行（如截斷字串、亂碼、空行等）。

---

## Feature A: timeline.query() 損壞行容錯

### Scenario: 正常路徑 — 混合損壞行與有效行時回傳所有有效事件
GIVEN timeline JSONL 包含 3 筆有效事件
AND 第 2 行為損壞 JSON（如 `{bad json`）
WHEN 呼叫 timeline.query(sessionId)
THEN 回傳陣列長度為 2（損壞行被略過）
AND 回傳的事件均可正常存取 .type 欄位

### Scenario: 邊界條件 — 所有行均損壞時回傳空陣列
GIVEN timeline JSONL 有 3 行，全部為無效 JSON（如 `CORRUPTED\n!!!\n{bad`）
WHEN 呼叫 timeline.query(sessionId)
THEN 回傳空陣列 []
AND 不拋出例外

### Scenario: 邊界條件 — 混合損壞行時 type filter 仍只返回有效且匹配的事件
GIVEN timeline JSONL 包含 1 筆 stage:complete 事件、1 行損壞 JSON、1 筆 workflow:start 事件
WHEN 呼叫 timeline.query(sessionId, { type: 'stage:complete' })
THEN 回傳陣列長度為 1
AND 回傳事件的 type 為 'stage:complete'

### Scenario: 邊界條件 — 混合損壞行時 category filter 仍正確計算
GIVEN timeline JSONL 包含 2 筆 category 為 'stage' 的事件、1 行損壞 JSON、1 筆 category 為 'workflow' 的事件
WHEN 呼叫 timeline.query(sessionId, { category: 'stage' })
THEN 回傳陣列長度為 2

### Scenario: 邊界條件 — 快速路徑（僅 limit，無 type/category）遇到損壞行時仍正確回傳
GIVEN timeline JSONL 有 5 行：前 2 行為有效事件、第 3 行損壞、後 2 行為有效事件
WHEN 呼叫 timeline.query(sessionId, { limit: 3 })
THEN 回傳陣列長度為 2（第 3 行損壞被略過，實際可解析的有 4 筆，limit 後取最後 3 行，其中 1 行損壞）
AND 不拋出例外

---

## Feature B: timeline.latest() 損壞行容錯

### Scenario: 正常路徑 — 最後一行損壞時回退至上一筆有效匹配事件
GIVEN timeline JSONL 包含 stage:complete 事件
AND 之後追加 1 行損壞 JSON
WHEN 呼叫 timeline.latest(sessionId, 'stage:complete')
THEN 回傳該 stage:complete 事件
AND 不拋出例外

### Scenario: 邊界條件 — 目標事件後方有多行損壞 JSON，仍能反向找到目標
GIVEN timeline JSONL 依序為：有效 stage:complete → 損壞行 → 損壞行 → 損壞行
WHEN 呼叫 timeline.latest(sessionId, 'stage:complete')
THEN 回傳該 stage:complete 事件（反向掃描跳過損壞行）

### Scenario: 邊界條件 — 全部行均損壞時回傳 null
GIVEN timeline JSONL 全部為損壞 JSON
WHEN 呼叫 timeline.latest(sessionId, 'stage:complete')
THEN 回傳 null
AND 不拋出例外

### Scenario: 邊界條件 — 有效事件夾在損壞行之間時仍可找到
GIVEN timeline JSONL 依序為：損壞行 → stage:complete → 損壞行 → workflow:complete
WHEN 呼叫 timeline.latest(sessionId, 'stage:complete')
THEN 回傳 stage:complete 事件（反向掃描：workflow:complete 損壞跳過，stage:complete 匹配返回）
AND 結果的 type 為 'stage:complete'

---

## Feature C: timeline.count() 損壞行容錯

### Scenario: 正常路徑 — 無 filter 模式：損壞行計入行數（不解析 JSON）
GIVEN timeline JSONL 包含 2 筆有效事件和 1 行損壞 JSON
WHEN 呼叫 timeline.count(sessionId)（無 filter）
THEN 回傳 3（行計數模式，不解析 JSON，損壞行也計入）
AND 不拋出例外

### Scenario: 正常路徑 — type filter 模式：損壞行被略過，只計有效且匹配的事件
GIVEN timeline JSONL 包含 2 筆 stage:complete 事件、1 行損壞 JSON、1 筆 workflow:start
WHEN 呼叫 timeline.count(sessionId, { type: 'stage:complete' })
THEN 回傳 2（損壞行解析失敗被 catch，只計匹配的 2 筆）

### Scenario: 邊界條件 — 全部行均損壞時，type filter 模式回傳 0
GIVEN timeline JSONL 全部為損壞 JSON（3 行）
WHEN 呼叫 timeline.count(sessionId, { type: 'stage:complete' })
THEN 回傳 0
AND 不拋出例外

### Scenario: 邊界條件 — 全部行均損壞時，category filter 模式回傳 0
GIVEN timeline JSONL 全部為損壞 JSON
WHEN 呼叫 timeline.count(sessionId, { category: 'stage' })
THEN 回傳 0
AND 不拋出例外

---

## Feature D: timeline.passAtK() 獨立行為測試

### Scenario: 正常路徑 — 單一 stage 第一次嘗試即 pass
GIVEN timeline 包含 1 筆 stage:complete 事件（stage: 'DEV', result: 'pass'）
WHEN 呼叫 timeline.passAtK(sessionId)
THEN 回傳物件包含 stages.DEV
AND stages.DEV.pass1 為 true
AND stages.DEV.pass3 為 true
AND stages.DEV.passConsecutive3 為 null（嘗試次數 < 3）
AND overall.stageCount 為 1
AND overall.pass1Count 為 1
AND overall.pass1Rate 為 1.0

### Scenario: 正常路徑 — 單一 stage 前兩次 fail，第三次 pass（pass@3 成立）
GIVEN timeline 依時間順序包含：
AND 第 1 筆：stage:complete（stage: 'DEV', result: 'fail', ts: T1）
AND 第 2 筆：stage:complete（stage: 'DEV', result: 'fail', ts: T2）
AND 第 3 筆：stage:complete（stage: 'DEV', result: 'pass', ts: T3）
WHEN 呼叫 timeline.passAtK(sessionId)
THEN stages.DEV.pass1 為 false（第一次 fail）
AND stages.DEV.pass3 為 true（前 3 次中有 pass）
AND stages.DEV.passConsecutive3 為 null（嘗試次數恰好等於 3，取最後 3 筆，[fail, fail, pass]，不全為 pass → false）
AND stages.DEV.attempts 長度為 3

### Scenario: 正常路徑 — 多個 stage 混合結果，overall 統計正確
GIVEN timeline 包含：
AND DEV：1 筆 pass（pass1=true, pass3=true）
AND REVIEW：fail 後 pass（pass1=false, pass3=true）
AND TEST：3 筆 fail（pass1=false, pass3=false）
WHEN 呼叫 timeline.passAtK(sessionId)
THEN overall.stageCount 為 3
AND overall.pass1Count 為 1
AND overall.pass3Count 為 2
AND overall.pass1Rate 為 0.3333（四捨五入保留 4 位小數）
AND overall.pass3Rate 為 0.6667

### Scenario: 邊界條件 — timeline 中無任何 stage:complete 事件
GIVEN timeline 包含 workflow:start 和 workflow:complete，無 stage:complete
WHEN 呼叫 timeline.passAtK(sessionId)
THEN overall.stageCount 為 0
AND overall.pass1Rate 為 null
AND overall.pass3Rate 為 null
AND stages 為空物件 {}

### Scenario: 邊界條件 — timeline 檔案不存在時優雅回傳
GIVEN 不存在的 sessionId（無任何 timeline 檔案）
WHEN 呼叫 timeline.passAtK(sessionId)
THEN 不拋出例外
AND overall.stageCount 為 0
AND overall.pass1Rate 為 null

### Scenario: 邊界條件 — 單一 stage 只有 1 次嘗試時 passConsecutive3 為 null
GIVEN timeline 包含 1 筆 stage:complete（stage: 'DEV', result: 'pass'）
WHEN 呼叫 timeline.passAtK(sessionId)
THEN stages.DEV.passConsecutive3 為 null（n < 3，不計算連續通過率）
AND stages.DEV.pass1 為 true

### Scenario: 邊界條件 — stage 事件沒有 stage 欄位時被忽略
GIVEN timeline 包含 1 筆 stage:complete 事件但沒有 stage 欄位（異常資料）
WHEN 呼叫 timeline.passAtK(sessionId)
THEN overall.stageCount 為 0（沒有 stage 欄位的事件被 if (!e.stage) continue 跳過）

### Scenario: 正常路徑 — passConsecutive3 在有 3 次或以上且最後 3 次全 pass 時為 true
GIVEN timeline 依時間順序包含 4 筆 stage:complete（stage: 'DEV'）：fail → pass → pass → pass
WHEN 呼叫 timeline.passAtK(sessionId)
THEN stages.DEV.passConsecutive3 為 true（最後 3 筆均為 pass）
AND stages.DEV.pass3 為 true（前 3 筆中 index=1 已是 pass）

---

## Feature E: instinct._readAll() 損壞行容錯

### Scenario: 正常路徑 — 混合損壞行與有效記錄時回傳所有有效 instinct
GIVEN observations.jsonl 包含 2 筆有效 instinct 記錄
AND 第 1 行為損壞 JSON
WHEN 呼叫 instinct.query(sessionId)（內部呼叫 _readAll）
THEN 回傳 2 筆有效 instinct
AND 損壞行被略過，不拋出例外

### Scenario: 邊界條件 — 全部行均損壞時回傳空陣列
GIVEN observations.jsonl 全部為損壞 JSON（3 行）
WHEN 呼叫 instinct.query(sessionId)
THEN 回傳空陣列 []
AND 不拋出例外

### Scenario: 邊界條件 — 損壞行夾在有效記錄中間，同 id 合併邏輯仍正確運作
GIVEN observations.jsonl 依序為：id='A' 有效記錄 → 損壞行 → id='A' 更新記錄（confidence 更高）
WHEN 呼叫 instinct.query(sessionId)
THEN 回傳 1 筆，id 為 'A'，confidence 為最後一筆的值（後者覆蓋前者）
AND 損壞行不影響合併結果

### Scenario: 錯誤處理 — 損壞行不觸發 auto-compact 的誤判（有效唯一條目計算正確）
GIVEN observations.jsonl 包含 2 筆唯一有效記錄（id A 和 B）
AND 包含 3 行損壞 JSON
WHEN 呼叫 instinct.query(sessionId)（觸發 _readAll）
THEN 損壞行 filter 後不計入有效 items（map 回傳 null，filter(Boolean) 移除）
AND merged 長度為 2（唯一 id 數量）
AND auto-compact 觸發條件判斷（lines.length > merged.length * 2）以原始行數 5 對比 merged * 2 = 4 → 5 > 4 為 true，觸發壓縮
