# Feature: evolution-engine-auto-create（P4.2）

Gap analyzer 偵測到缺口後，可自動修復 sync-mismatch 和 no-references 兩種類型的缺口。

---

## Feature 1: gap-analyzer — Gap 物件新增 fixable / fixAction 欄位

### Scenario: sync-mismatch 缺口標記為可修復
GIVEN gap-analyzer 分析 agent frontmatter 後發現 SKILL.md 消費者表缺少該 agent
WHEN analyzeGaps() 回傳缺口清單
THEN 該缺口的 fixable 為 true
AND fixAction 為 "fix-consistency: 在 SKILL.md 消費者表新增缺少的 agent"

### Scenario: no-references 缺口標記為可修復
GIVEN gap-analyzer 分析某個 skill 後發現 references/ 目錄不存在
WHEN analyzeGaps() 回傳缺口清單
THEN 該缺口的 fixable 為 true
AND fixAction 為 "create-references: 建立 references/ 目錄和 README.md 佔位"

### Scenario: missing-skill 缺口標記為不可修復
GIVEN gap-analyzer 發現 agent 使用了不存在的 skill
WHEN analyzeGaps() 回傳缺口清單
THEN 該缺口的 fixable 為 false
AND fixAction 為空字串 ""

### Scenario: broken-chain 缺口標記為不可修復
GIVEN gap-analyzer 發現依賴鏈斷裂（如 skill reference 指向不存在的檔案）
WHEN analyzeGaps() 回傳缺口清單
THEN 該缺口的 fixable 為 false
AND fixAction 為空字串 ""

### Scenario: missing-consumer 缺口標記為不可修復
GIVEN gap-analyzer 發現某 skill 未被任何 agent 消費
WHEN analyzeGaps() 回傳缺口清單
THEN 該缺口的 fixable 為 false
AND fixAction 為空字串 ""

### Scenario: 既有缺口欄位不受影響
GIVEN gap-analyzer 回傳包含各類型缺口的清單
WHEN 讀取每個缺口物件
THEN 每個缺口仍包含原有欄位：type、severity、file、message、suggestion、sourceCheck
AND 新增的 fixable、fixAction 欄位與原有欄位共存

---

## Feature 2: gap-fixer — fixGaps() 核心修復行為

### Scenario: dry-run 模式不執行任何 fs 操作
GIVEN 缺口清單包含 1 個 sync-mismatch 和 1 個 no-references 缺口
WHEN 以 dryRun: true 呼叫 fixGaps()
THEN 回傳的 fixed 陣列為空（未執行任何修復）
AND 回傳的 skipped 陣列包含 2 個項目，reason 均為 'dry-run'
AND 磁碟上沒有新增或修改任何檔案

### Scenario: 成功修復 no-references 缺口（建立 references/README.md）
GIVEN 某個 skill 目錄不存在 references/ 子目錄
AND 缺口清單包含對應的 no-references 缺口
WHEN 以 dryRun: false 呼叫 fixGaps()
THEN 回傳的 fixed 陣列包含該缺口項目
AND skills/{skillName}/references/ 目錄被建立
AND skills/{skillName}/references/README.md 內容為 "# References\n"

### Scenario: 成功修復 sync-mismatch 缺口（批次執行 fix-consistency.js）
GIVEN 缺口清單包含 3 個不同 skill 的 sync-mismatch 缺口
WHEN 以 dryRun: false 呼叫 fixGaps()
THEN fix-consistency.js --fix 只被呼叫一次（批次修復，不逐個執行）
AND 回傳的 fixed 陣列包含所有 3 個缺口項目

### Scenario: typeFilter 只修復指定類型
GIVEN 缺口清單包含 2 個 sync-mismatch 和 2 個 no-references 缺口
WHEN 以 typeFilter: 'no-references'、dryRun: false 呼叫 fixGaps()
THEN 回傳的 fixed 陣列只包含 no-references 的缺口（2 項）
AND 回傳的 skipped 陣列包含 sync-mismatch 的缺口（2 項），reason 為 'type-filter'

### Scenario: fixable: false 的缺口一律跳過
GIVEN 缺口清單包含 1 個 missing-skill 缺口和 1 個 no-references 缺口
WHEN 以 dryRun: false 呼叫 fixGaps()
THEN missing-skill 缺口出現在 skipped 陣列，reason 為 'not-fixable'
AND no-references 缺口出現在 fixed 陣列

### Scenario: typeFilter 為不可修復類型時全部跳過
GIVEN 缺口清單包含 2 個 no-references 和 1 個 sync-mismatch 缺口
WHEN 以 typeFilter: 'missing-skill'、dryRun: false 呼叫 fixGaps()
THEN 所有缺口出現在 skipped 陣列，reason 為 'type-filter'
AND fixed 陣列為空

### Scenario: 缺口清單為空時回傳空結果
GIVEN 缺口清單為空陣列
WHEN 以 dryRun: false 呼叫 fixGaps()
THEN 回傳的 fixed、skipped、failed 陣列均為空

### Scenario: no-references 修復失敗時記錄到 failed 陣列
GIVEN 缺口清單包含 1 個 no-references 缺口
AND references/ 目錄因權限問題無法建立
WHEN 以 dryRun: false 呼叫 fixGaps()
THEN 回傳的 failed 陣列包含該缺口，並附帶 error 訊息
AND fixed 陣列不包含該缺口

---

## Feature 3: evolution.js fix 子命令 — 純文字輸出

### Scenario: 預設 dry-run 輸出修復計劃預覽
GIVEN 系統存在 2 個 fixable 缺口（1 個 sync-mismatch + 1 個 no-references）
WHEN 執行 bun scripts/evolution.js fix（不加 --execute）
THEN 標準輸出顯示 dry-run 模式提示
AND 顯示每個 fixable 缺口的預覽計劃（缺口描述 + fixAction）
AND process exit code 為 0
AND 磁碟上沒有任何修改

### Scenario: --execute 旗標觸發真實修復並回報結果
GIVEN 系統存在 2 個 fixable 缺口
WHEN 執行 bun scripts/evolution.js fix --execute
THEN 標準輸出顯示修復結果：fixed N / skipped M / failed K
AND process exit code 為 0（假設全部修復成功）

### Scenario: 修復後驗證仍有缺口時 exit 1
GIVEN 系統存在 sync-mismatch 缺口
AND fix-consistency.js 執行後缺口仍未消除（驗證失敗）
WHEN 執行 bun scripts/evolution.js fix --execute
THEN 標準錯誤輸出列出仍存在的缺口清單
AND process exit code 為 1

### Scenario: --type 旗標限制修復範圍
GIVEN 系統存在 sync-mismatch 和 no-references 缺口各 2 個
WHEN 執行 bun scripts/evolution.js fix --execute --type sync-mismatch
THEN 只有 sync-mismatch 缺口被修復
AND 輸出報告顯示 no-references 缺口被略過
AND process exit code 為 0

### Scenario: --type 為無效值時 exit 1
GIVEN 任何系統狀態
WHEN 執行 bun scripts/evolution.js fix --execute --type invalid-type
THEN 標準錯誤輸出顯示無效 type 錯誤訊息
AND process exit code 為 1

### Scenario: 系統無任何缺口時輸出摘要並 exit 0
GIVEN 系統無任何 gap（analyzeGaps 回傳空陣列）
WHEN 執行 bun scripts/evolution.js fix
THEN 標準輸出顯示「無缺口需要修復」或類似訊息
AND process exit code 為 0

### Scenario: 系統有缺口但全部不可修復時 exit 0
GIVEN 系統存在 2 個 missing-skill 缺口（fixable: false）
AND 系統不存在任何 fixable: true 的缺口
WHEN 執行 bun scripts/evolution.js fix
THEN 標準輸出顯示無可修復缺口的摘要
AND 輸出提示哪些缺口需要手動處理
AND process exit code 為 0

---

## Feature 4: evolution.js fix 子命令 — JSON 輸出模式

### Scenario: --json 旗標輸出結構化結果（dry-run）
GIVEN 系統存在 fixable 缺口
WHEN 執行 bun scripts/evolution.js fix --json
THEN 標準輸出為合法 JSON 物件
AND JSON 包含 dryRun: true
AND JSON 包含 fixable 缺口清單（含 fixAction 描述）

### Scenario: --json 搭配 --execute 輸出修復結果
GIVEN 系統存在 2 個 fixable 缺口
WHEN 執行 bun scripts/evolution.js fix --execute --json
THEN 標準輸出為合法 JSON 物件
AND JSON 包含 fixed、skipped、failed 陣列
AND JSON 包含 remainingGaps 欄位（修復後驗證的剩餘缺口）

### Scenario: --json 模式下 exit code 語意不變
GIVEN 修復後仍有缺口存在
WHEN 執行 bun scripts/evolution.js fix --execute --json
THEN 標準輸出為合法 JSON（含 remainingGaps）
AND process exit code 仍為 1

---

## Feature 5: 安全邊界

### Scenario: 預設保護 — 不加 --execute 永遠不執行真實修復
GIVEN 任何系統狀態（有或無缺口）
WHEN 執行 bun scripts/evolution.js fix（不加任何旗標）
THEN fix-consistency.js 不被呼叫
AND 磁碟上無任何新增或修改的檔案
AND process exit code 為 0

### Scenario: missing-skill 永遠不被自動修復
GIVEN 系統存在 missing-skill 類型缺口
WHEN 以任何 options 呼叫 fixGaps()
THEN 該缺口出現在 skipped 陣列，reason 為 'not-fixable'
AND fixGaps 不嘗試建立 skill 目錄或任何相關檔案

### Scenario: broken-chain 永遠不被自動修復
GIVEN 系統存在 broken-chain 類型缺口
WHEN 以 dryRun: false 呼叫 fixGaps()
THEN 該缺口出現在 skipped 陣列，reason 為 'not-fixable'

### Scenario: missing-consumer 永遠不被自動修復
GIVEN 系統存在 missing-consumer 類型缺口
WHEN 以 dryRun: false 呼叫 fixGaps()
THEN 該缺口出現在 skipped 陣列，reason 為 'not-fixable'

### Scenario: fix 子命令修復後必定重新驗證
GIVEN 系統存在 1 個 no-references 缺口
WHEN 執行 bun scripts/evolution.js fix --execute
THEN 修復動作執行後，analyzeGaps() 被再次呼叫驗證
AND 輸出報告明確顯示修復後的驗證結果（通過或仍有缺口）
