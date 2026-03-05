# Feature: Project Orchestrator — L3.5 專案自動協調

> 階段：TEST:spec | 撰寫時間：2026-03-06

---

## Feature 1: parseSpecToText — 規格轉純文字

### Scenario 1-1: ProjectSpec 物件輸入 — 合併所有 facets
GIVEN 一個有效的 ProjectSpec 物件，包含 `feature`、`facets.functional`、`facets.flow`、`facets.edgeCases`、`facets.acceptance`
WHEN 呼叫 `parseSpecToText(projectSpec)`
THEN 回傳一個字串，包含 functional 陣列所有項目的文字
AND 包含 flow 陣列所有項目的文字
AND 包含 edgeCases 陣列所有項目的文字
AND 包含 acceptance BDD 場景展平後的文字（title + given + when + then）
AND 包含 feature name

### Scenario 1-2: 純字串輸入 — 直接回傳
GIVEN 一個 Markdown 格式的純字串
WHEN 呼叫 `parseSpecToText(markdownString)`
THEN 直接回傳相同字串，無任何轉換

### Scenario 1-3: ProjectSpec 部分 facets 為空陣列
GIVEN 一個 ProjectSpec 物件，其中 `facets.ui` 和 `facets.flow` 為空陣列
WHEN 呼叫 `parseSpecToText(projectSpec)`
THEN 回傳字串仍包含 functional 和 edgeCases 的內容
AND 不因空陣列而拋出錯誤

### Scenario 1-4: acceptance 中的 BDD 場景展平
GIVEN 一個 ProjectSpec 物件，acceptance 包含 `[{ title: '使用者登入', given: '使用者已註冊', when: '輸入帳密', then: '成功登入' }]`
WHEN 呼叫 `parseSpecToText(projectSpec)`
THEN 回傳字串包含 title、given、when、then 的文字內容
AND 場景內容以可讀文字形式展平（非 JSON 物件）

### Scenario 1-5: 無效輸入（null / undefined）
GIVEN 傳入 null 或 undefined
WHEN 呼叫 `parseSpecToText(null)`
THEN 回傳空字串或拋出 TypeError（明確行為）

---

## Feature 2: extractFeatureList — 提取功能清單

### Scenario 2-1: ProjectSpec 物件 — 從 functional facet 提取
GIVEN 一個 ProjectSpec 物件，`facets.functional` 包含 `['使用者可以上傳圖片', '系統自動壓縮圖片', '管理員可審核圖片']`
WHEN 呼叫 `extractFeatureList(projectSpec, 'standard')`
THEN 回傳包含 3 個項目的陣列
AND 每個項目具有 `name` 和 `workflow` 欄位
AND `name` 為功能原始文字（截斷至 50 字）
AND `workflow` 為 `'standard'`

### Scenario 2-2: workflowTemplate 參數傳遞
GIVEN 一個 ProjectSpec 物件，`facets.functional` 包含 2 個項目
WHEN 呼叫 `extractFeatureList(projectSpec, 'quick')`
THEN 所有回傳項目的 `workflow` 欄位均為 `'quick'`

### Scenario 2-3: workflowTemplate 省略時使用預設值 'standard'
GIVEN 一個 ProjectSpec 物件，`facets.functional` 包含 1 個項目
WHEN 呼叫 `extractFeatureList(projectSpec)`（不傳第二參數）
THEN 回傳項目的 `workflow` 欄位為 `'standard'`

### Scenario 2-4: Markdown 字串輸入 — 從「功能定義」section 提取
GIVEN 一個 Markdown 字串，包含 `## 功能定義` section，下有 `- 功能 A\n- 功能 B\n- 功能 C` 三個列表項
WHEN 呼叫 `extractFeatureList(markdownString, 'standard')`
THEN 回傳 3 個項目，name 分別為 `'功能 A'`、`'功能 B'`、`'功能 C'`

### Scenario 2-5: Markdown 字串無「功能定義」section — fallback 到章節標題
GIVEN 一個 Markdown 字串，無 `## 功能定義` section，但有多個 `## ` 二級標題
WHEN 呼叫 `extractFeatureList(markdownString, 'standard')`
THEN 回傳項目，name 為各章節標題文字

### Scenario 2-6: functional facet 超過 50 字截斷
GIVEN 一個 ProjectSpec 物件，`facets.functional` 包含一個超過 50 字的功能描述字串
WHEN 呼叫 `extractFeatureList(projectSpec)`
THEN 對應項目的 `name` 長度不超過 50 字

### Scenario 2-7: 空輸入 — 回傳空陣列
GIVEN 傳入空物件、空字串或 null
WHEN 呼叫 `extractFeatureList(input)`
THEN 回傳空陣列 `[]`，不拋出錯誤

---

## Feature 3: orchestrate — dry-run 模式（預設行為）

### Scenario 3-1: dry-run 預設不寫入 fs
GIVEN 一個有效的 ProjectSpec 物件
AND `dryRun: true`（或不傳 options，使用預設）
WHEN 呼叫 `orchestrate(projectSpec)`
THEN 回傳 OrchestrateResult 物件，`summary.dryRun === true`
AND `queueResult._preview === true`（標記為預覽）
AND 沒有任何 fs 寫入操作發生（appendQueue/writeQueue 未被呼叫）
AND 沒有任何 forgeSkill 真實執行（dryRun: true 傳遞給 forge）

### Scenario 3-2: dry-run 時 domainAudit 正確分類 present / missing
GIVEN 一個 ProjectSpec 物件，specText 含有測試相關關鍵字（命中 'testing' domain）
AND 現有 skills/ 目錄中已有 `testing/SKILL.md`
WHEN 呼叫 `orchestrate(projectSpec)` 使用 dry-run 模式
THEN `domainAudit.present` 包含 `'testing'`
AND `domainAudit.missing` 不包含 `'testing'`

### Scenario 3-3: dry-run 時 forgeResults 為預覽結果
GIVEN 一個 ProjectSpec 物件，偵測到 2 個 missing domains
WHEN 呼叫 `orchestrate(projectSpec)` 使用 dry-run 模式
THEN `forgeResults` 陣列長度為 2
AND 每個 forgeResult 的 status 不為 'success'（因為 dryRun 不真實 forge）

### Scenario 3-4: dry-run 時 summary 數字正確
GIVEN 一個 ProjectSpec 物件，偵測到 2 個 present domains 和 1 個 missing domain，提取到 3 個 features
WHEN 呼叫 `orchestrate(projectSpec)` 使用 dry-run 模式
THEN `summary.presentCount === 2`
AND `summary.missingCount === 1`
AND `summary.featureCount === 3`
AND `summary.dryRun === true`

---

## Feature 4: orchestrate — execute 模式（--execute flag）

### Scenario 4-1: execute 模式真實呼叫 appendQueue
GIVEN 一個有效的 ProjectSpec 物件，`facets.functional` 包含 2 個 features
AND `dryRun: false`（execute 模式）
AND `overwriteQueue: false`（預設）
WHEN 呼叫 `orchestrate(projectSpec, { dryRun: false })`
THEN `appendQueue` 被呼叫一次，傳入提取到的 feature 清單
AND `writeQueue` 未被呼叫
AND `queueResult` 包含真實的佇列寫入回傳值（非 _preview）

### Scenario 4-2: execute 模式 + overwriteQueue 切換為 writeQueue
GIVEN 一個有效的 ProjectSpec 物件
AND `dryRun: false, overwriteQueue: true`
WHEN 呼叫 `orchestrate(projectSpec, { dryRun: false, overwriteQueue: true })`
THEN `writeQueue` 被呼叫一次（覆蓋模式）
AND `appendQueue` 未被呼叫

### Scenario 4-3: execute 模式 forgeSkill 呼叫所有 missing domains
GIVEN 一個 ProjectSpec 物件，偵測到 2 個 missing domains
AND `dryRun: false`
WHEN 呼叫 `orchestrate(projectSpec, { dryRun: false })`
THEN `forgeSkill` 被呼叫 2 次，分別傳入各 missing domain 名稱
AND 每次呼叫時 `dryRun: false`

### Scenario 4-4: forgeSkill 失敗不中斷流程
GIVEN 一個 ProjectSpec 物件，偵測到 3 個 missing domains
AND 第 2 個 domain 的 forgeSkill 回傳 `status: 'error'`
WHEN 呼叫 `orchestrate(projectSpec, { dryRun: false })`
THEN `forgeResults` 包含 3 個結果
AND 第 2 個結果 `status === 'error'` 且帶有 `error` 欄位
AND 第 3 個 domain 的 forgeSkill 仍被呼叫（流程未中斷）
AND queueResult 仍正常寫入佇列

### Scenario 4-5: forgeSkill 連續失敗達門檻暫停後續 forge
GIVEN 一個 ProjectSpec 物件，偵測到 4 個 missing domains
AND 前 3 個 domain 的 forgeSkill 連續回傳 `status: 'paused'`
AND `maxConsecutiveFailures: 3`
WHEN 呼叫 `orchestrate(projectSpec, { dryRun: false, maxConsecutiveFailures: 3 })`
THEN 第 4 個 domain 的 forgeSkill 不被呼叫（因達暫停門檻）
AND 已提取的 features 仍正常寫入佇列（forge 暫停不影響排程）

### Scenario 4-6: 連續失敗計數跨 domain 正確傳遞
GIVEN 一個 ProjectSpec 物件，偵測到 2 個 missing domains
AND `dryRun: false`
WHEN 第 1 次 forgeSkill 回傳 `{ consecutiveFailures: 1 }`
THEN 第 2 次 forgeSkill 呼叫時，`initialFailures` 參數值為 1

---

## Feature 5: orchestrate — CLI 端到端行為

### Scenario 5-1: CLI dry-run 預覽輸出格式
GIVEN 一個有效的 spec 檔案路徑
WHEN 執行 `bun scripts/evolution.js orchestrate <specPath>`（不加 --execute）
THEN 標準輸出包含 "Dry Run" 相關文字
AND 包含 "能力盤點" 或 present/missing domain 清單
AND 包含 feature 排程預覽清單
AND 包含摘要行（present 數量 / missing 數量 / forged 數量 / features 數量）
AND 包含提示文字（如加 --execute 執行）
AND 結束代碼為 0

### Scenario 5-2: CLI --execute 真實執行
GIVEN 一個有效的 spec 檔案路徑
AND 使用 temp dir 隔離的 projectRoot
WHEN 執行 `bun scripts/evolution.js orchestrate <specPath> --execute`
THEN 佇列檔案被寫入（`~/.overtone/sessions/...` 或 temp dir）
AND 標準輸出不包含 "Dry Run"
AND 結束代碼為 0

### Scenario 5-3: CLI --json 輸出可被解析
GIVEN 一個有效的 spec 檔案路徑
WHEN 執行 `bun scripts/evolution.js orchestrate <specPath> --json`
THEN 標準輸出為有效的 JSON 字串
AND JSON 解析後包含 `domainAudit`、`forgeResults`、`queueResult`、`summary` 欄位

### Scenario 5-4: CLI --overwrite 使用 writeQueue
GIVEN 佇列中已有現有項目
AND 一個有效的 spec 檔案路徑
WHEN 執行 `bun scripts/evolution.js orchestrate <specPath> --execute --overwrite`
THEN 現有佇列被覆蓋（舊項目不保留）
AND 結束代碼為 0

### Scenario 5-5: CLI --workflow 指定 workflow 類型
GIVEN 一個有效的 spec 檔案路徑
WHEN 執行 `bun scripts/evolution.js orchestrate <specPath> --json --workflow quick`
THEN JSON 輸出中所有 queueResult items 的 workflow 均為 `'quick'`

### Scenario 5-6: CLI specPath 不存在時報錯
GIVEN 一個不存在的 spec 檔案路徑 `/tmp/nonexistent.md`
WHEN 執行 `bun scripts/evolution.js orchestrate /tmp/nonexistent.md`
THEN 標準錯誤包含錯誤訊息（如 "找不到" 或 "not found"）
AND 結束代碼不為 0

### Scenario 5-7: CLI 無 specPath 時顯示 usage
GIVEN 不傳任何 specPath
WHEN 執行 `bun scripts/evolution.js orchestrate`
THEN 標準輸出或標準錯誤包含使用說明（usage 文字）
AND 結束代碼不為 0

---

## Feature 6: orchestrate — detectKnowledgeGaps 參數正確性

### Scenario 6-1: minScore 和 maxGaps 傳遞正確
GIVEN 一個 ProjectSpec 物件
WHEN 呼叫 `orchestrate(projectSpec)`
THEN `detectKnowledgeGaps` 被呼叫時，options 包含 `minScore: 0.15` 和 `maxGaps: 10`

### Scenario 6-2: 已存在 skill 的 domain 從 missing 排除
GIVEN specText 觸發 3 個 gap domains：`['testing', 'database', 'new-domain']`
AND `testing` 和 `database` 在 skills/ 目錄中已有對應 SKILL.md
AND `new-domain` 的 SKILL.md 不存在
WHEN 呼叫 `orchestrate(projectSpec)`
THEN `domainAudit.present` 包含 `'testing'` 和 `'database'`
AND `domainAudit.missing` 只包含 `'new-domain'`
AND `forgeSkill` 只被呼叫一次（只針對 `'new-domain'`）

### Scenario 6-3: 無 gap 時 forgeResults 為空陣列且 queueResult 只含 features
GIVEN 一個 ProjectSpec 物件，所有偵測到的 domains 都已有對應 SKILL.md
WHEN 呼叫 `orchestrate(projectSpec, { dryRun: false })`
THEN `forgeResults` 為空陣列
AND `domainAudit.missing` 為空陣列
AND `queueResult` 仍包含 feature 排程（features 不受 forge 影響）

---

## Feature 7: OrchestrateResult 結構完整性

### Scenario 7-1: 回傳值包含所有必要欄位
GIVEN 任意有效的 ProjectSpec 輸入
WHEN 呼叫 `orchestrate(projectSpec)`
THEN 回傳物件具有 `domainAudit`、`forgeResults`、`queueResult`、`summary` 四個頂層欄位
AND `domainAudit` 包含 `present`、`missing`、`gaps` 欄位
AND `summary` 包含 `totalDomains`、`presentCount`、`missingCount`、`forgedCount`、`featureCount`、`dryRun` 欄位

### Scenario 7-2: summary.forgedCount 在 execute 模式計算正確
GIVEN 一個 ProjectSpec 物件，偵測到 3 個 missing domains
AND 2 個 forgeSkill 回傳 `status: 'success'`，1 個回傳 `status: 'error'`
AND `dryRun: false`
WHEN 呼叫 `orchestrate(projectSpec, { dryRun: false })`
THEN `summary.forgedCount === 2`（只計算 success，不計 error）

### Scenario 7-3: summary.totalDomains 等於 present + missing
GIVEN 任意有效的 ProjectSpec 輸入，偵測到 P 個 present 和 M 個 missing domains
WHEN 呼叫 `orchestrate(projectSpec)`
THEN `summary.totalDomains === summary.presentCount + summary.missingCount`
