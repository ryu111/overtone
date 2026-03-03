# BDD 行為規格：跨 Session 長期記憶（cross-session-memory）

> 對應架構設計：`specs/features/in-progress/cross-session-memory/design.md`
> 撰寫模式：TEST:spec（DEV 前）

---

## Feature 1: 畢業機制（graduate）

高信心觀察畢業到全域 store，低信心觀察留在 session。

### Scenario 1-1: 高信心觀察成功畢業到全域 store

@smoke
GIVEN session observations 中有 confidence = 0.8 的觀察
AND 全域 store 目前為空
WHEN 呼叫 graduate(sessionId)
THEN 回傳結果 graduated = 1
AND 全域 store 包含該觀察
AND 全域觀察包含 globalTs 欄位
AND globalTs 為合法的 ISO 8601 時間戳

### Scenario 1-2: 低信心觀察不畢業

@edge-case
GIVEN session observations 中有 confidence = 0.5 的觀察
AND 全域 store 目前為空
WHEN 呼叫 graduate(sessionId)
THEN 回傳結果 graduated = 0
AND 全域 store 保持空白

### Scenario 1-3: 邊界值 confidence = 0.7 剛好畢業

@edge-case
GIVEN session observations 中有 confidence = 0.7 的觀察（剛好等於門檻值）
WHEN 呼叫 graduate(sessionId)
THEN 回傳結果 graduated = 1
AND 全域 store 包含該觀察

### Scenario 1-4: 相同 tag+type 去重合併，保留較高 confidence

@edge-case
GIVEN 全域 store 已有 tag="testing" type="pattern" confidence=0.75 的觀察
AND session observations 中有 tag="testing" type="pattern" confidence=0.9 的觀察
WHEN 呼叫 graduate(sessionId)
THEN 全域 store 中 tag="testing" type="pattern" 的觀察只有一筆
AND 保留的 confidence = 0.9

### Scenario 1-5: 相同 tag+type 去重合併，不降低已有的高 confidence

@edge-case
GIVEN 全域 store 已有 tag="testing" type="pattern" confidence=0.9 的觀察
AND session observations 中有 tag="testing" type="pattern" confidence=0.75 的觀察
WHEN 呼叫 graduate(sessionId)
THEN 全域 store 中該觀察的 confidence 保持 0.9

### Scenario 1-6: 空 session 呼叫 graduate 不出錯

@edge-case
GIVEN session 不存在或 observations 為空
WHEN 呼叫 graduate(sessionId)
THEN 不拋出任何錯誤
AND 回傳結果 graduated = 0
AND 全域 store 保持不變

### Scenario 1-7: graduate 末尾自動執行 decayGlobal

@smoke
GIVEN 全域 store 有超過 1 週未更新的舊觀察
WHEN 呼叫 graduate(sessionId)
THEN 回傳結果包含 decayed 欄位
AND decayed 數字反映實際衰減筆數

---

## Feature 2: 全域查詢（queryGlobal）

依條件篩選全域觀察，支援按 type、tag、minConfidence、limit 篩選。

### Scenario 2-1: 無 filter 回傳全部觀察

@smoke
GIVEN 全域 store 有 3 筆不同觀察
WHEN 呼叫 queryGlobal({})
THEN 回傳 3 筆觀察

### Scenario 2-2: 按 type 篩選

@smoke
GIVEN 全域 store 有 type="pattern" 和 type="preference" 各 2 筆
WHEN 呼叫 queryGlobal({ type: "pattern" })
THEN 只回傳 type="pattern" 的 2 筆觀察

### Scenario 2-3: 按 tag 篩選

@smoke
GIVEN 全域 store 有 tag="testing" 和 tag="debugging" 各 2 筆
WHEN 呼叫 queryGlobal({ tag: "testing" })
THEN 只回傳 tag="testing" 的 2 筆觀察

### Scenario 2-4: 按 minConfidence 篩選

@smoke
GIVEN 全域 store 有 confidence 0.5、0.7、0.9 各一筆
WHEN 呼叫 queryGlobal({ minConfidence: 0.7 })
THEN 回傳 confidence >= 0.7 的 2 筆觀察

### Scenario 2-5: limit 取 top-N 依信心降序排列

@smoke
GIVEN 全域 store 有 5 筆觀察，confidence 分別為 0.9、0.8、0.7、0.75、0.85
WHEN 呼叫 queryGlobal({ limit: 3 })
THEN 只回傳 3 筆觀察
AND 回傳的觀察依 confidence 降序排列
AND 第一筆 confidence = 0.9

### Scenario 2-6: 空全域 store 回傳空陣列

@edge-case
GIVEN 全域 store 目前為空
WHEN 呼叫 queryGlobal({})
THEN 回傳空陣列
AND 不拋出任何錯誤

### Scenario 2-7: 組合多個 filter 條件

@edge-case
GIVEN 全域 store 有 4 筆觀察，分別為 tag="testing"/confidence=0.9、tag="testing"/confidence=0.5、tag="debugging"/confidence=0.9、tag="debugging"/confidence=0.5
WHEN 呼叫 queryGlobal({ tag: "testing", minConfidence: 0.7 })
THEN 只回傳 1 筆觀察（tag="testing" 且 confidence=0.9 那筆）

---

## Feature 3: 全域衰減（decayGlobal）

週衰減機制，避免舊觀察永久佔用空間。

### Scenario 3-1: 超過一週的觀察衰減固定 0.02

@smoke
GIVEN 全域 store 有一筆 confidence=0.8 的觀察，updatedAt 為 2 週前
WHEN 呼叫 decayGlobal()
THEN 該觀察的 confidence 減少 0.02（每次呼叫固定衰減，無論超過幾週）
AND 回傳結果 decayed = 1

### Scenario 3-2: 衰減後 confidence < 0.2 自動刪除

@smoke
GIVEN 全域 store 有一筆 confidence=0.22 的觀察，updatedAt 為 2 週前
WHEN 呼叫 decayGlobal()
THEN 衰減後 confidence < 0.2
AND 該觀察被自動刪除
AND 回傳結果 pruned = 1

### Scenario 3-3: 更新時間未超過一週的觀察不衰減

@edge-case
GIVEN 全域 store 有一筆 confidence=0.8 的觀察，updatedAt 為 3 天前
WHEN 呼叫 decayGlobal()
THEN 該觀察的 confidence 不變
AND 回傳結果 decayed = 0

### Scenario 3-4: 空全域 store 呼叫 decayGlobal 不出錯

@edge-case
GIVEN 全域 store 目前為空
WHEN 呼叫 decayGlobal()
THEN 不拋出任何錯誤
AND 回傳結果 decayed = 0
AND 回傳結果 pruned = 0

---

## Feature 4: SessionEnd 畢業整合

SessionEnd hook 觸發 graduate，且錯誤不影響主流程。

### Scenario 4-1: SessionEnd 成功觸發 graduate 並記錄結果

@smoke
GIVEN 有有效的 sessionId
AND session observations 中有 confidence >= 0.7 的觀察
WHEN SessionEnd hook 執行
THEN graduate(sessionId) 被呼叫
AND 畢業的觀察出現在全域 store

### Scenario 4-2: graduate 拋出錯誤不影響 SessionEnd 其他清理步驟

@error-case
GIVEN graduate 函式執行時拋出例外
WHEN SessionEnd hook 執行
THEN hook 不拋出未捕獲例外
AND SessionEnd 其他清理步驟照常完成
AND 錯誤被靜默捕獲（try/catch 隔離）

### Scenario 4-3: 全域 store 目錄不存在時自動建立

@edge-case
GIVEN 全域 store 目錄 ~/.overtone/global/ 不存在
WHEN SessionEnd hook 執行並呼叫 graduate
THEN 目錄自動建立
AND graduate 正常完成

---

## Feature 5: SessionStart 載入整合

SessionStart hook 載入全域觀察注入 systemMessage。

### Scenario 5-1: SessionStart 載入 top-50 全域觀察注入 systemMessage

@smoke
GIVEN 全域 store 有 60 筆觀察，confidence 各不同
WHEN SessionStart hook 執行
THEN 注入的 systemMessage 包含全域觀察的摘要
AND 最多載入 50 筆（依 confidence 降序取 top-50）

### Scenario 5-2: 全域 store 為空時靜默跳過，不影響 session 啟動

@edge-case
GIVEN 全域 store 目前為空
WHEN SessionStart hook 執行
THEN hook 正常完成
AND 不拋出任何錯誤
AND systemMessage 不包含全域觀察相關區塊

### Scenario 5-3: 全域 store 讀取失敗時不影響 session 啟動

@error-case
GIVEN 全域 store 檔案損壞或不可讀取
WHEN SessionStart hook 執行
THEN hook 不拋出未捕獲例外
AND session 正常啟動
AND 錯誤被靜默捕獲

### Scenario 5-4: 全域 store 僅有少量觀察時全部載入

@edge-case
GIVEN 全域 store 只有 5 筆觀察
WHEN SessionStart hook 執行
THEN 5 筆全部載入
AND 不因未達 50 筆而報錯

---

## Feature 6: 路徑與設定

paths.js 和 registry.js 正確暴露全域路徑與預設設定。

### Scenario 6-1: paths.global.dir() 回傳正確路徑

@smoke
GIVEN paths.js 已載入
WHEN 呼叫 paths.global.dir()
THEN 回傳路徑以 ~/.overtone/global 結尾
AND 路徑不包含硬編碼的使用者家目錄字串（應使用 os.homedir() 動態解析）

### Scenario 6-2: paths.global.observations() 回傳正確路徑

@smoke
GIVEN paths.js 已載入
WHEN 呼叫 paths.global.observations()
THEN 回傳路徑以 ~/.overtone/global/observations.jsonl 結尾

### Scenario 6-3: registry 包含 globalInstinctDefaults 設定

@smoke
GIVEN registry.js 已載入
WHEN 讀取 globalInstinctDefaults
THEN graduationThreshold = 0.7
AND loadTopN = 50

---

## Feature 7: 自動壓縮（auto-compaction）

全域 store 行數超過去重後唯一數的 2 倍時自動壓縮。

### Scenario 7-1: 行數超過唯一數 2 倍時觸發自動壓縮

@smoke
GIVEN 全域 store 有 10 筆唯一觀察，但因歷史 append 造成行數為 25 行
WHEN 新增一筆觀察到全域 store（或呼叫任何 write 操作）
THEN 壓縮被觸發
AND 壓縮後行數 <= 唯一觀察數 × 2
AND 所有觀察的最新版本被保留

### Scenario 7-2: 壓縮後保留每個 tag+type 鍵的最新版本

@edge-case
GIVEN 全域 store 中同一個 tag+type 有 3 個歷史版本，confidence 分別為 0.7、0.8、0.9
AND 行數超過閾值
WHEN 壓縮被觸發
THEN 只保留 confidence = 0.9 那一筆

### Scenario 7-3: 行數未超過閾值時不壓縮

@edge-case
GIVEN 全域 store 有 5 筆唯一觀察，行數為 8 行
WHEN 執行 write 操作
THEN 不觸發壓縮
AND 行數不變

---

## Feature 8: 統計摘要（summarizeGlobal）

summarizeGlobal 正確統計全域觀察。

### Scenario 8-1: 正確統計 total 和 byType

@smoke
GIVEN 全域 store 有 pattern 類型 3 筆、preference 類型 2 筆
WHEN 呼叫 summarizeGlobal()
THEN total = 5
AND byType.pattern = 3
AND byType.preference = 2

### Scenario 8-2: 正確統計 byTag

@smoke
GIVEN 全域 store 有 tag="testing" 2 筆、tag="debugging" 1 筆
WHEN 呼叫 summarizeGlobal()
THEN byTag.testing = 2
AND byTag.debugging = 1

### Scenario 8-3: 正確統計 applicable（confidence >= 0.7 的觀察）

@smoke
GIVEN 全域 store 有 confidence 0.9、0.7、0.5 各一筆
WHEN 呼叫 summarizeGlobal()
THEN applicable = 2（0.9 和 0.7 符合 >= 0.7 門檻）
AND total = 3

### Scenario 8-4: 空全域 store 的統計

@edge-case
GIVEN 全域 store 目前為空
WHEN 呼叫 summarizeGlobal()
THEN total = 0
AND applicable = 0
AND byType 為空物件
AND byTag 為空物件

---

## Feature 9: 專案維度隔離（projectHash）

不同專案的觀察儲存在各自的全域 store 中，互不干擾。

### Scenario 9-1: 不同專案的觀察存入各自的 store

@smoke
GIVEN 專案 A 的 projectRoot 為 "/path/to/project-a"
AND 專案 B 的 projectRoot 為 "/path/to/project-b"
WHEN 專案 A 的 session 畢業了 2 筆觀察
AND 專案 B 的 session 畢業了 3 筆觀察
THEN 專案 A 的全域 store 有 2 筆觀察
AND 專案 B 的全域 store 有 3 筆觀察
AND 兩個 store 的檔案路徑不同

### Scenario 9-2: 查詢只回傳當前專案的觀察

@smoke
GIVEN 專案 A 的全域 store 有 tag="bun-test" 的觀察
AND 專案 B 的全域 store 有 tag="npm-test" 的觀察
WHEN 在專案 A 的 context 中呼叫 queryGlobal({})
THEN 只回傳 tag="bun-test" 的觀察
AND 不包含 tag="npm-test" 的觀察

### Scenario 9-3: paths.global.observations(projectRoot) 依專案回傳不同路徑

@smoke
GIVEN projectRoot 為 "/Users/me/projects/overtone"
WHEN 呼叫 paths.global.observations(projectRoot)
THEN 路徑包含由 projectRoot 衍生的 hash
AND 路徑格式為 ~/.overtone/global/{projectHash}/observations.jsonl

### Scenario 9-4: projectHash 穩定且可重現

@edge-case
GIVEN 同一個 projectRoot "/Users/me/projects/overtone"
WHEN 多次呼叫 paths.global.observations(projectRoot)
THEN 每次回傳完全相同的路徑
AND hash 不隨時間變化
