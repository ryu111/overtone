# Feature: phase2-finalize — P4 文件同步 + S19 Agent 量化分析

> 範圍：純文件修改（CLAUDE.md、docs/vision.md、docs/roadmap.md、docs/analysis/agent-specialization.md）
> 建立日期：2026-03-03
> 模式：spec（TEST:spec）

---

## Feature 1：CLAUDE.md knowledge domain 清單補充

### Scenario: 目錄結構 code block 內補充 11 個 domain 清單
GIVEN CLAUDE.md 的目錄結構 code block 中，`skills/` 行只有「19 個 Skill（WHAT — 知識域 + orchestrator + utilities-with-refs）」的說明
WHEN developer 在 `skills/` 行的下一行追加 11 個 knowledge domain 清單
THEN CLAUDE.md 中的 `skills/` 行下方出現以 `# 11 knowledge domains:` 開頭的清單
AND 清單包含全部 11 個 domain：testing、workflow-core、security-kb、database、dead-code、commit-convention、code-review、wording、debugging、architecture、build-system
AND 清單以縮排次行的形式呈現，格式與同 code block 內其他次行說明一致
AND code block 的整體格式和其他行不受影響

### Scenario: domain 清單與 docs/status.md 的 Knowledge Domain 數保持一致
GIVEN docs/status.md 第 23 行記載「Knowledge Domain 數 | 11（testing、workflow-core、security-kb、...）」
WHEN developer 確認 CLAUDE.md 新增的 domain 清單
THEN CLAUDE.md 清單中的 domain 名稱和順序與 status.md 的 Knowledge Domain 數一行完全對應
AND 兩份文件的 domain 數量同為 11

### Scenario: 未修改 code block 外的任何內容
GIVEN CLAUDE.md 包含多個 ## 章節和其他說明內容
WHEN developer 只修改 `skills/` 行的下一行（在 code block 內）
THEN CLAUDE.md 中 code block 外的所有章節內容不變
AND skills/ 行本身（第一行說明文字）不變
AND 無其他欄位被意外增刪

---

## Feature 2：docs/vision.md Layer 1 表格補充 domain 數量

### Scenario: 學習框架欄位補充 Knowledge Engine domain 數量
GIVEN docs/vision.md Layer 1 表格中，「學習框架」列的「現有實現」cell 顯示「Instinct + Knowledge Engine」
WHEN developer 在「Knowledge Engine」後補充「（11 domains）」
THEN vision.md 中該 cell 內容變為「Instinct + Knowledge Engine（11 domains）」
AND 表格格式（Markdown table）維持正確，其他欄位不變

### Scenario: 其他 Layer 1 表格列不受影響
GIVEN vision.md 的 Layer 1 表格有 7 列（守衛框架、學習框架、評分框架、收斂框架、回饋迴路、任務引擎、進化引擎）
WHEN 只修改「學習框架」列
THEN 其餘 6 列的「框架」、「職責」、「現有實現」欄位內容均不變
AND 表格結構（| 分隔符 | 對齊）維持不變

### Scenario: 修改後 vision.md 與 status.md 的 domain 數字一致
GIVEN status.md 的 Knowledge Domain 數明確記為 11
WHEN vision.md 更新後
THEN vision.md 顯示的 domain 數量（11）與 status.md 記載的數量（11）一致
AND 兩份文件不存在數字衝突

---

## Feature 3：docs/roadmap.md 狀態與說明更新

### Scenario: P1 說明細化反映實際完成數量
GIVEN roadmap.md P1 行說明為「新建 3 domain + 強化 5 既有 domain + 17 新 reference 檔案」
WHEN developer 更新 P1 說明
THEN P1 行說明改為「新建 3 domain（debugging、architecture、build-system）+ 強化 8 既有 domain，共 11 domains + 17 新 reference 檔案」
AND P1 狀態欄維持「✅」不變

### Scenario: P2 說明細化反映實際完成內容（architect + retrospective 已降級）
GIVEN roadmap.md P2 行說明為「評估 agent 拆分機會、職責邊界精鍊、model 降級空間（→ S19）」
WHEN developer 更新 P2 說明
THEN P2 行說明改為「architect + retrospective 降級 opus → sonnet（v0.28.18）；S19 量化分析完成」
AND P2 狀態欄維持「✅」不變

### Scenario: P4 狀態從「進行中」更新為「完成」
GIVEN roadmap.md P4 行狀態欄顯示「🔵 進行中」
WHEN developer 在文件修改全部完成後更新 P4 狀態
THEN P4 行狀態欄變為「✅」
AND P4 說明內容不變（「vision.md + roadmap.md + status.md + CLAUDE.md 全面對齊」）

### Scenario: S19 狀態從「🔵」更新為「✅」
GIVEN roadmap.md S19 行狀態欄顯示「🔵」
WHEN developer 完成 agent-specialization.md 新建後更新 S19 狀態
THEN S19 行狀態欄變為「✅」
AND S19 說明內容不變（「評估 agent 拆分機會 + Model 降級空間 + skill 完善度與 model 需求的關係量化」）

### Scenario: roadmap.md 標頭當前 Phase 說明更新
GIVEN roadmap.md 第 3 行標頭說明為「當前 Phase：核心穩固（Level 1 → Level 2，P4 進行中）」
WHEN P4 完成後更新標頭
THEN 第 3 行變為「當前 Phase：核心穩固（Level 1 → Level 2，P4 完成）」
AND 日期「最後更新：2026-03-03」不變

### Scenario: roadmap.md 整體結構不受影響（其餘行不變）
GIVEN roadmap.md 包含 Phase 總覽表、Level 1 完成項、系統強化 4-Phase 表、Level 2 表、S 系列技術路線等多個章節
WHEN 只修改 P1 說明、P2 說明、P4 狀態、S19 狀態、標頭說明 共 5 個位置
THEN 其他所有章節和行內容不變
AND Phase 總覽表（P0/P1/P2/P3/P4 五行）中，P0~P3 的狀態和說明不變
AND Level 2 表所有行不變
AND S 系列技術路線除 S19 外的所有行不變

---

## Feature 4：docs/analysis/agent-specialization.md 新建（S19）

### Scenario: 新建 docs/analysis/ 目錄和 agent-specialization.md 文件
GIVEN docs/ 目錄下不存在 analysis/ 子目錄
WHEN developer 建立 docs/analysis/agent-specialization.md
THEN docs/analysis/ 目錄存在
AND docs/analysis/agent-specialization.md 文件存在且非空

### Scenario: 文件包含 17 個 agent 的完整評分總表
GIVEN agent-specialization.md 的評分總表章節設計為每個 agent 一行
WHEN developer 填寫評分總表
THEN 表格包含恰好 17 行 agent 資料（不多不少）
AND 17 個 agent 涵蓋：product-manager、planner、architect、developer、tester、code-reviewer、security-reviewer、retrospective、doc-updater、qa、debugger、designer、build-error-resolver、database-reviewer、e2e-runner、refactor-cleaner、grader
AND 每行包含全部 6 個欄位：職責專一度（1-5）、推理複雜度（1-5）、Skill 依賴度（1-5）、決策確定性（1-5）、建議 Model、當前 Model

### Scenario: 評分數字符合各維度的 1-5 定義範圍
GIVEN 每個量化維度的值域定義為 1 到 5 的整數
WHEN developer 填入評分
THEN 所有 agent 的職責專一度、推理複雜度、Skill 依賴度、決策確定性欄位的值均為 1~5 之間的整數
AND 不存在空值、0 或 6 以上的值

### Scenario: 降級建議欄位與降級條件邏輯一致
GIVEN 降級至 haiku 的條件為「職責專一度 ≥4 AND Skill 依賴度 ≥4 AND 決策確定性 ≥4」
AND 降級至 sonnet 的條件為「職責專一度 ≥3 AND（Skill 依賴度 ≥3 OR 決策確定性 ≥3）」
WHEN developer 填入「建議 Model」欄位
THEN 被建議降至 haiku 的 agent，其前 4 維度評分需同時滿足 haiku 降級條件
AND 被建議維持 opus 的 agent，不滿足 sonnet 降級條件（或推理複雜度 ≥4）
AND 沒有任何 agent 的建議 Model 與降級條件產生邏輯矛盾

### Scenario: 文件包含評分方法論說明章節
GIVEN agent-specialization.md 的設計要求包含 6 維度定義和降級條件說明
WHEN developer 建立文件
THEN 文件包含「評分方法論」章節，說明各維度的定義和評分標準
AND 文件包含降級安全條件的明確說明（haiku / sonnet / opus 的條件各一段）

### Scenario: 文件包含深度分析章節（決策層 agents）
GIVEN 目前有 opus/opusplan 等高成本 model 的 agent 需要深度分析
WHEN developer 撰寫深度分析章節
THEN 文件包含針對 product-manager、planner、code-reviewer、security-reviewer 的個別深度分析
AND 每個深度分析包含：職責描述、各維度評分理由、降級可行性分析
AND 已完成降級的 architect 和 retrospective 有降級回顧說明（版本、理由、觀察）

### Scenario: 文件包含結論與建議章節
GIVEN agent-specialization.md 的目的是提供降級決策依據
WHEN developer 撰寫結論章節
THEN 文件包含「可降級項目」清單（有充分依據、附降級路徑）
AND 文件包含「建議維持項目」清單（附理由）
AND 文件包含「Skill 強化優先項」建議（需先強化哪些 Skill 才能提高降級安全度）

---

## Feature 5：docs/status.md 一致性確認（唯讀驗收）

### Scenario: status.md 的 Knowledge Domain 數已正確記載 11 個 domain
GIVEN docs/status.md 第 23 行應已記載 11 個 knowledge domain 的名稱
WHEN developer 唯讀確認 status.md 內容
THEN status.md 的「Knowledge Domain 數」行包含完整的 11 個 domain 名稱清單
AND 數量顯示為 11
AND 不需要對 status.md 做任何修改

### Scenario: status.md 的 Skill 數量記載與實際一致
GIVEN status.md 的「Skill 數量」行應正確反映現有的 19 個 Skill
WHEN developer 確認 status.md 的 Skill 數量
THEN status.md 顯示「Skill 數量 | 19（11 knowledge domain + orchestrator + pm + specs + 5 utility-with-refs）」
AND 分類說明正確（11 knowledge domain 的數量與 domain 清單一致）

### Scenario: P4 完成後 status.md 無需更新即保持一致
GIVEN status.md 的「近期變更」和「核心指標」反映 v0.28.21 的狀態
AND P4 是文件修改不涉及測試數量或版本號變動
WHEN developer 確認 status.md
THEN status.md 的所有核心指標數值與實際狀態一致（無缺口）
AND status.md 不需要因 P4 文件修改而更新

---

## Feature 6：現有測試套件不受影響

### Scenario: 純文件修改後 bun test 全數通過
GIVEN 專案目前測試通過數為 2408 pass / 0 fail（101 個測試檔）
AND P4/S19 的修改範圍僅限 .md 文件
WHEN developer 完成所有文件修改後執行 `bun test`
THEN 測試結果為 2408 pass，0 fail
AND 測試檔數量維持 101 個

### Scenario: 無新增測試檔（純文件修改不需測試覆蓋）
GIVEN P4/S19 只修改 .md 文件，無程式碼變更
WHEN developer 完成修改
THEN 不新增任何 .test.js 測試檔
AND 不修改任何現有的 .test.js 測試檔

### Scenario: docs-sync 測試仍通過（路徑引用完整性）
GIVEN tests/unit/docs-sync.test.js 驗證文件索引中引用的路徑存在性
WHEN developer 新建 docs/analysis/agent-specialization.md
THEN docs/analysis/ 目錄和 agent-specialization.md 正確建立，路徑可達
AND docs-sync.test.js 的現有測試項目不因新增 analysis/ 目錄而失敗
