# Feature: Skill Internalization — 經驗內化飛輪

本規格涵蓋 L3.7 Skill Internalization 的六個模組行為：
skill-evaluator、skill-generalizer、experience-index、evolution internalize 子命令、
project-orchestrator 整合、以及 health-check 偵測。

---

## Feature 1: skill-evaluator — 評估知識條目內化門檻

### Scenario 1-1: 條目符合所有門檻時標記為 qualified
@smoke
GIVEN auto-discovered.md 包含一個知識條目
AND scores.jsonl 記錄該條目的 avgScore 為 4.0（>= 3.5）
AND observations.jsonl 記錄 confidence 為 0.8（>= 0.6）
AND usageCount 為 3（>= 2）
WHEN 呼叫 evaluateEntries(autoDiscoveredPath, projectRoot)
THEN 回傳 EvaluationResult 陣列，length 為 1
AND result.qualified 為 true
AND result.reasons 包含通過原因（至少一條）
AND result.domain 為偵測到的 domain 字串或 null

### Scenario 1-2: 條目 avgScore 未達門檻時標記為 not qualified
@edge-case
GIVEN auto-discovered.md 包含一個知識條目
AND scores.jsonl 記錄該條目的 avgScore 為 2.0（< 3.5）
AND usageCount 為 5 且 confidence 為 0.9（其餘門檻均通過）
WHEN 呼叫 evaluateEntries(autoDiscoveredPath, projectRoot)
THEN result.qualified 為 false
AND result.reasons 包含說明 avgScore 不足的訊息

### Scenario 1-3: 條目 usageCount 未達門檻時標記為 not qualified
@edge-case
GIVEN auto-discovered.md 包含一個知識條目
AND usageCount 為 1（< 2）
AND avgScore 為 4.0 且 confidence 為 0.8（其餘門檻均通過）
WHEN 呼叫 evaluateEntries(autoDiscoveredPath, projectRoot)
THEN result.qualified 為 false
AND result.reasons 包含說明 usageCount 不足的訊息

### Scenario 1-4: 呼叫端可透過 options 覆蓋門檻值
@edge-case
GIVEN auto-discovered.md 包含一個知識條目
AND 預設門檻下 usageCount 為 1（不符合 >= 2）
WHEN 呼叫 evaluateEntries(path, projectRoot, { minUsageCount: 1 })
THEN result.qualified 可能為 true（若其餘門檻均通過）
AND 門檻覆蓋生效，不使用預設值

### Scenario 1-5: auto-discovered.md 包含多個條目時分別評估
@smoke
GIVEN auto-discovered.md 以 "---" 分隔包含 3 個條目
AND 第 1 個條目符合所有門檻
AND 第 2 個條目 avgScore 不足
AND 第 3 個條目 confidence 不足
WHEN 呼叫 evaluateEntries(autoDiscoveredPath, projectRoot)
THEN 回傳長度為 3 的陣列
AND 只有第 1 個條目 qualified 為 true

### Scenario 1-6: auto-discovered.md 不存在時回傳空陣列
@error
GIVEN autoDiscoveredPath 指向不存在的檔案
WHEN 呼叫 evaluateEntries(autoDiscoveredPath, projectRoot)
THEN 回傳空陣列（不拋出例外）

---

## Feature 2: skill-generalizer — 移除專案特定內容

### Scenario 2-1: 包含檔案路徑的段落被移除
@smoke
GIVEN 知識條目包含兩段內容
AND 第一段包含 "plugins/overtone/scripts/lib/paths.js" 路徑引用
AND 第二段為通用的方法論描述
WHEN 呼叫 generalizeEntry(content)
THEN result.generalized 不包含第一段
AND result.generalized 包含第二段
AND result.removed 陣列包含被移除的第一段

### Scenario 2-2: 包含版本號的段落被移除
@smoke
GIVEN 知識條目的某段包含 "v0.28.49" 版本號引用
WHEN 呼叫 generalizeEntry(content)
THEN 該段被移除
AND result.removed 包含該段

### Scenario 2-3: 包含 require 模組引用的段落被移除
@edge-case
GIVEN 知識條目的某段包含 "require('./skill-router')" 具體模組名稱
WHEN 呼叫 generalizeEntry(content)
THEN 該段被移除

### Scenario 2-4: 通用化後內容不足 50 字元時標記 isEmpty
@edge-case
GIVEN 知識條目所有段落均含專案特定內容
WHEN 呼叫 generalizeEntry(content)
THEN result.generalized 為空字串或少於 50 字元
AND result.isEmpty 為 true

### Scenario 2-5: 純通用內容的條目不被修改
@smoke
GIVEN 知識條目不含任何路徑、版本號或 require 引用
WHEN 呼叫 generalizeEntry(content)
THEN result.generalized 等於 original（或僅有空白差異）
AND result.removed 為空陣列
AND result.isEmpty 為 false

### Scenario 2-6: generalizeEntries 只處理 qualified=true 的條目
@edge-case
GIVEN EvaluationResult 陣列包含 3 個條目
AND 其中 2 個 qualified 為 true，1 個為 false
WHEN 呼叫 generalizeEntries(entries)
THEN 回傳陣列長度為 2（只處理 qualified 的條目）

### Scenario 2-7: 呼叫端可傳入 customPatterns 額外篩選
@edge-case
GIVEN 知識條目包含特定關鍵詞 "ACME_PROJECT_SPECIFIC"
AND 該詞不在預設 pattern 清單中
WHEN 呼叫 generalizeEntry(content, { customPatterns: [/ACME_PROJECT_SPECIFIC/] })
THEN 包含該詞的段落被移除

---

## Feature 3: experience-index — 專案經驗索引

### Scenario 3-1: buildIndex 為新專案建立索引條目
@smoke
GIVEN experience-index.json 不存在（首次建立）
WHEN 呼叫 buildIndex(projectRoot, ['testing', 'workflow-core'])
THEN experience-index.json 被建立
AND entries 包含一筆 projectHash 對應此 projectRoot 的條目
AND 條目的 domains 為 ['testing', 'workflow-core']
AND 條目的 sessionCount 為 1
AND 條目的 lastUpdated 為有效 ISO 8601 字串

### Scenario 3-2: buildIndex 對已存在的專案更新條目（upsert 語意）
@smoke
GIVEN experience-index.json 已包含此 projectRoot 的條目（sessionCount: 2）
WHEN 呼叫 buildIndex(projectRoot, ['database', 'testing'])
THEN 該條目 sessionCount 更新為 3
AND domains 合併新舊 domain（union，不重複）
AND lastUpdated 更新為最新時間戳

### Scenario 3-3: queryIndex 根據 specText 關鍵詞推薦 domains
@smoke
GIVEN experience-index.json 包含 3 個不同專案的條目
AND 其中 2 個專案的 domains 包含 "testing"
AND specText 包含 "test" 和 "spec" 等測試相關關鍵詞
WHEN 呼叫 queryIndex(projectRoot, specText)
THEN result.recommendedDomains 包含 "testing"
AND result.matchedProjects >= 1

### Scenario 3-4: queryIndex 當 specText 無對應關鍵詞時回傳空推薦
@edge-case
GIVEN experience-index.json 包含條目
AND specText 與所有條目的 domains 無任何關鍵詞重疊
WHEN 呼叫 queryIndex(projectRoot, specText)
THEN result.recommendedDomains 為空陣列
AND result.matchedProjects 為 0

### Scenario 3-5: readIndex 讀取全部條目
@smoke
GIVEN experience-index.json 包含 5 筆條目
WHEN 呼叫 readIndex(projectRoot)
THEN 回傳長度為 5 的 ExperienceEntry 陣列
AND 每筆條目包含 projectHash、domains、lastUpdated、sessionCount

### Scenario 3-6: experience-index.json 不存在時 readIndex 回傳空陣列
@error
GIVEN experience-index.json 不存在
WHEN 呼叫 readIndex(projectRoot)
THEN 回傳空陣列（不拋出例外）

### Scenario 3-7: projectHash 計算一致性
@edge-case
GIVEN 相同的 projectRoot 路徑
WHEN 兩次分別呼叫 buildIndex
THEN 兩次使用相同的 projectHash（hash 函式為確定性）
AND experience-index.json 中只有一筆對應條目（upsert 而非 append）

---

## Feature 4: evolution.js internalize 子命令

### Scenario 4-1: 預設 dry-run 預覽可內化條目
@smoke
GIVEN auto-discovered.md 包含 5 個條目
AND 其中 3 個達到評估門檻
AND 這 3 個條目均可成功通用化
WHEN 執行 `bun evolution.js internalize`（不含 --execute）
THEN 標準輸出包含 "dry-run" 或 "預覽" 提示
AND 輸出顯示 evaluated: 5, qualified: 3, generalized: 3
AND internalized.md 未被寫入（dry-run 不修改檔案）

### Scenario 4-2: --execute 實際寫入 internalized.md
@smoke
GIVEN auto-discovered.md 包含 3 個達到門檻的條目
AND 這 3 個條目通用化後均超過 50 字元
WHEN 執行 `bun evolution.js internalize --execute`
THEN internalized.md 被建立或更新
AND internalized.md 包含通用化後的知識條目
AND 輸出顯示 written: 3

### Scenario 4-3: --json 輸出結構化 JSON
@smoke
GIVEN auto-discovered.md 包含有效條目
WHEN 執行 `bun evolution.js internalize --json`
THEN 標準輸出為有效 JSON
AND JSON 包含 dryRun、evaluated、qualified、generalized、written、skipped、entries 欄位

### Scenario 4-4: 通用化後為空的條目被計入 skipped
@edge-case
GIVEN auto-discovered.md 包含一個達到門檻但所有段落均含專案特定內容的條目
WHEN 執行 `bun evolution.js internalize --execute`
THEN 該條目出現在 skipped 清單中
AND written 數量不含此條目

### Scenario 4-5: auto-discovered.md 不存在時優雅退出
@error
GIVEN auto-discovered.md 不存在
WHEN 執行 `bun evolution.js internalize`
THEN 程序以非零狀態碼結束
AND 錯誤訊息說明 auto-discovered.md 找不到

### Scenario 4-6: internalize 執行後 experience-index 被更新
@smoke
GIVEN --execute 模式下內化成功
WHEN 執行 `bun evolution.js internalize --execute`
THEN experience-index.json 被更新
AND 包含本次內化涉及的 domains

---

## Feature 5: project-orchestrator.js 整合 experience-index

### Scenario 5-1: orchestrate 回傳 experienceHints 欄位
@smoke
GIVEN experience-index.json 包含相似專案的條目
AND options.projectRoot 已提供
WHEN 呼叫 orchestrate(projectSpec, { projectRoot })
THEN 回傳結果包含 experienceHints 欄位
AND experienceHints.recommendedDomains 為字串陣列
AND experienceHints.matchedProjects 為非負整數

### Scenario 5-2: 無 experience-index 時 orchestrate 仍正常執行
@edge-case
GIVEN experience-index.json 不存在（首次使用）
AND options.projectRoot 已提供
WHEN 呼叫 orchestrate(projectSpec, { projectRoot })
THEN 回傳結果不含 experienceHints 或 experienceHints.recommendedDomains 為空陣列
AND orchestrate 主流程（detectKnowledgeGaps 等）正常執行，不拋出例外

### Scenario 5-3: 未提供 projectRoot 時跳過 experience-index 查詢
@edge-case
GIVEN options 不含 projectRoot（options 為空物件）
WHEN 呼叫 orchestrate(projectSpec, {})
THEN orchestrate 正常回傳
AND 結果不含 experienceHints（或為 undefined）
AND 不拋出例外

### Scenario 5-4: recommendedDomains 合入 domainAudit 的分類
@smoke
GIVEN experience-index 推薦 ['database', 'testing'] 兩個 domains
AND 當前專案 domainAudit 中 'testing' 已在 present
AND 'database' 不在 present 也不在 missing
WHEN 呼叫 orchestrate(projectSpec, { projectRoot })
THEN 'database' 被納入分析（不被靜默忽略）
AND 'testing' 仍維持 present 狀態（不重複計算）

---

## Feature 6: health-check.js checkInternalizationIndex

### Scenario 6-1: experience-index.json 不存在時回傳 info level finding
@smoke
GIVEN experience-index.json 不存在（尚未建立索引）
WHEN 呼叫 checkInternalizationIndex(globalDirOverride)
THEN 回傳 Finding 陣列
AND 包含一筆 level 為 "info" 的 finding
AND finding 訊息說明索引尚未建立

### Scenario 6-2: experience-index.json 格式損壞時回傳 warning level finding
@error
GIVEN experience-index.json 存在但內容為無效 JSON（如 "{ corrupted"）
WHEN 呼叫 checkInternalizationIndex(globalDirOverride)
THEN 回傳包含 level 為 "warning" 的 finding
AND finding 訊息說明 JSON parse 失敗

### Scenario 6-3: entries 中有 domains 為空陣列的條目時回傳 warning
@error
GIVEN experience-index.json 存在且格式正確
AND 其中一筆 entry 的 domains 為空陣列 []
WHEN 呼叫 checkInternalizationIndex(globalDirOverride)
THEN 回傳包含 level 為 "warning" 的 finding
AND finding 訊息指出無效條目

### Scenario 6-4: 所有條目最後更新超過 30 天時回傳 info level finding
@edge-case
GIVEN experience-index.json 存在且格式正確
AND 所有條目的 lastUpdated 均超過 30 天前
WHEN 呼叫 checkInternalizationIndex(globalDirOverride)
THEN 回傳包含 level 為 "info" 的 finding
AND finding 訊息說明索引可能過時

### Scenario 6-5: 索引健康時回傳空 Finding 陣列（或無 error/warning）
@smoke
GIVEN experience-index.json 存在、格式正確
AND 所有 entry 的 domains 非空
AND lastUpdated 均在 30 天內
WHEN 呼叫 checkInternalizationIndex(globalDirOverride)
THEN 回傳 Finding 陣列不含任何 warning 或 error level 的項目

### Scenario 6-6: health-check 主流程包含第 17 項 internalization-index 偵測
@smoke
GIVEN health-check.js 正常執行
WHEN 執行完整 health-check（runAllChecks 或對等函式）
THEN 輸出報告包含 "internalization-index" 項目
AND 系統顯示共 17 項偵測（而非 16 項）
