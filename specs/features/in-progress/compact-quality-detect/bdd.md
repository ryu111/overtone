# Feature: compact-quality-detect — Auto-Compact 頻率異常偵測

---

## Feature A: detectFrequencyAnomaly 純函式

### Scenario: A-1 空陣列時不回報異常
GIVEN `timestamps` 為空陣列 `[]`
AND `windowMs` 為 300000（5 分鐘）
AND `threshold` 為 3
WHEN 呼叫 `detectFrequencyAnomaly([], windowMs, threshold)`
THEN 回傳 `{ anomaly: false, autoCount: 0 }`

### Scenario: A-2 窗口內次數未達門檻時不回報異常
GIVEN `timestamps` 含 2 個時間戳，均在過去 5 分鐘內
AND `threshold` 為 3
WHEN 呼叫 `detectFrequencyAnomaly(timestamps, windowMs, threshold)`
THEN 回傳 `{ anomaly: false, autoCount: 2 }`

### Scenario: A-3 窗口內次數達到門檻時回報異常
GIVEN `timestamps` 含 3 個時間戳，均在過去 5 分鐘內
AND `threshold` 為 3
WHEN 呼叫 `detectFrequencyAnomaly(timestamps, windowMs, threshold)`
THEN 回傳 `{ anomaly: true, autoCount: 3 }`

### Scenario: A-4 超過門檻次數時 autoCount 正確反映實際數量
GIVEN `timestamps` 含 5 個時間戳，均在過去 5 分鐘內
AND `threshold` 為 3
WHEN 呼叫 `detectFrequencyAnomaly(timestamps, windowMs, threshold)`
THEN 回傳 `{ anomaly: true, autoCount: 5 }`

### Scenario: A-5 窗口外的時間戳不計入判斷
GIVEN `timestamps` 含 3 個時間戳
AND 其中 2 個在過去 5 分鐘內，1 個在 10 分鐘前（窗口外）
AND `threshold` 為 3
WHEN 呼叫 `detectFrequencyAnomaly(timestamps, windowMs, threshold)`
THEN 回傳 `{ anomaly: false, autoCount: 2 }`
AND 窗口外的時間戳不被計入 `autoCount`

### Scenario: A-6 NaN 時間戳自動被過濾不影響計數
GIVEN `timestamps` 含 3 個時間戳，其中 1 個為無效字串（如 `"invalid-date"`）
AND 其餘 2 個在過去 5 分鐘內
AND `threshold` 為 3
WHEN 呼叫 `detectFrequencyAnomaly(timestamps, windowMs, threshold)`
THEN 回傳 `{ anomaly: false, autoCount: 2 }`
AND NaN 時間戳不被計入，亦不拋出錯誤

---

## Feature B: autoTimestamps 追蹤

### Scenario: B-1 首次 auto-compact 寫入 autoTimestamps
GIVEN `compact-count.json` 不含 `autoTimestamps` 欄位（舊格式）
AND 觸發一次 auto-compact
WHEN `handlePreCompact` 執行 auto-compact 流程
THEN `compact-count.json` 包含 `autoTimestamps` 陣列
AND 陣列長度為 1
AND 元素為合法 ISO 8601 時間戳

### Scenario: B-2 舊格式 compact-count.json 向後相容
GIVEN `compact-count.json` 只含 `{ auto: 5, manual: 2 }`（無 `autoTimestamps`）
WHEN `handlePreCompact` 執行 auto-compact 流程
THEN 不拋出任何錯誤
AND `compact-count.json` 新增 `autoTimestamps` 欄位
AND 原有 `auto` 和 `manual` 欄位值不變

### Scenario: B-3 autoTimestamps 超過 20 筆時 FIFO 截斷
GIVEN `compact-count.json` 的 `autoTimestamps` 已有 20 筆時間戳
AND 觸發一次新的 auto-compact
WHEN `handlePreCompact` 執行 auto-compact 流程
THEN `compact-count.json` 的 `autoTimestamps` 長度仍為 20
AND 最新的時間戳出現在陣列末尾
AND 最舊的時間戳（第一筆）被移除

### Scenario: B-4 manual compact 不寫入 autoTimestamps
GIVEN `compact-count.json` 的 `autoTimestamps` 為空陣列
AND 觸發一次 manual compact
WHEN `handlePreCompact` 執行 manual-compact 流程
THEN `compact-count.json` 的 `autoTimestamps` 長度仍為 0
AND `manual` 計數加 1

---

## Feature C: timeline event emit

### Scenario: C-1 偵測到頻率異常時 emit quality:compact-frequency 事件
GIVEN `autoTimestamps` 在過去 5 分鐘內已有 3 筆記錄
AND 觸發新的 auto-compact
WHEN `handlePreCompact` 偵測到 `anomaly === true`
THEN emit `quality:compact-frequency` timeline 事件
AND 事件 payload 包含 `{ autoCount, windowMs, threshold, windowStartIso }`
AND `autoCount` 等於窗口內的時間戳數量
AND `windowStartIso` 為合法 ISO 8601 字串

### Scenario: C-2 未達異常門檻時不 emit 事件
GIVEN `autoTimestamps` 在過去 5 分鐘內只有 2 筆記錄
AND 觸發新的 auto-compact
WHEN `handlePreCompact` 偵測到 `anomaly === false`
THEN 不 emit `quality:compact-frequency` 事件

### Scenario: C-3 emit 失敗時不阻擋 compaction 流程
GIVEN `timeline.emit` 拋出例外錯誤
AND `autoTimestamps` 達到異常門檻
WHEN `handlePreCompact` 嘗試 emit `quality:compact-frequency`
THEN emit 失敗被靜默處理（catch 住）
AND compaction 流程正常繼續執行
AND `compact-count.json` 仍正常更新

---

## Feature D: health-check checkCompactFrequency

### Scenario: D-1 sessions 目錄不存在時回傳空陣列
GIVEN sessions 目錄路徑不存在於檔案系統
WHEN 呼叫 `checkCompactFrequency(nonExistentDir)`
THEN 回傳空陣列 `[]`
AND 不拋出任何錯誤

### Scenario: D-2 有異常 session 時回傳 warning finding
GIVEN sessions 目錄下有一個 session，其 `compact-count.json` 的 `autoTimestamps` 在過去 5 分鐘內有 3 筆記錄
WHEN 呼叫 `checkCompactFrequency(sessionsDir)`
THEN 回傳包含一個 finding 的陣列
AND finding 的 `check` 為 `'compact-frequency'`
AND finding 的 `severity` 為 `'warning'`
AND finding 包含異常 session 的相關資訊

### Scenario: D-3 所有 session 均無異常時回傳空陣列
GIVEN sessions 目錄下有多個 session
AND 每個 session 的 `autoTimestamps` 窗口內次數均未達門檻
WHEN 呼叫 `checkCompactFrequency(sessionsDir)`
THEN 回傳空陣列 `[]`

### Scenario: D-4 session 的 compact-count.json 不含 autoTimestamps 時跳過
GIVEN sessions 目錄下有一個 session，其 `compact-count.json` 不含 `autoTimestamps` 欄位
WHEN 呼叫 `checkCompactFrequency(sessionsDir)`
THEN 該 session 不被納入 finding
AND 回傳空陣列 `[]`
AND 不拋出任何錯誤

### Scenario: D-5 多個 session 各自獨立判斷
GIVEN sessions 目錄下有 3 個 session
AND 其中 2 個 session 的 `autoTimestamps` 窗口內達到異常門檻
AND 第 3 個 session 未達門檻
WHEN 呼叫 `checkCompactFrequency(sessionsDir)`
THEN 回傳包含 2 個 finding 的陣列
AND 每個 finding 各自對應一個異常 session
