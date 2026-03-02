# Feature: test-quality-guard — 測試品質防護機制

> 雙管齊下防止低品質 / 重複測試：Knowledge 層（反模式知識文件）+ Perception 層（測試索引注入）。

---

## Feature 1: test-anti-patterns.md 結構完整性

### Scenario: test-anti-patterns.md 包含完整的 6 種反模式定義
GIVEN `plugins/overtone/skills/testing/references/test-anti-patterns.md` 檔案存在
WHEN 閱讀檔案內容
THEN 檔案包含至少 6 種獨立的反模式章節
AND 每種反模式有獨立標題（如 `## Anti-Pattern N：...`）
AND 6 種反模式涵蓋：測試實作細節、重複測試既有行為、過度 mock、測試名稱不具語意、缺少邊界條件、斷言不充分

### Scenario: 每種反模式同時提供壞例與好例
GIVEN `test-anti-patterns.md` 存在且包含 6 種反模式
WHEN 查看任意一種反模式的內容
THEN 該反模式包含「壞例」區塊（標記為 Bad / 壞例 / DON'T 等）
AND 該反模式包含「好例」區塊（標記為 Good / 好例 / DO 等）
AND 壞例和好例都包含具體的程式碼片段或行為描述

### Scenario: 每種反模式提供判斷準則
GIVEN `test-anti-patterns.md` 存在且包含 6 種反模式
WHEN 查看任意一種反模式的內容
THEN 該反模式包含「判斷準則」或「如何識別」說明
AND 說明以可操作的方式描述（例如「若測試會因重構而失敗，但行為未改變，即為此反模式」）

### Scenario: test-anti-patterns.md 被正確納入 testing/SKILL.md 索引
GIVEN `plugins/overtone/skills/testing/SKILL.md` 存在
WHEN 讀取 SKILL.md 的 Reference 索引表
THEN 索引包含第 7 條 reference 指向 `references/test-anti-patterns.md`
AND 第 7 條的讀取時機說明為「verify 模式撰寫測試時 / code review 時」或同等語意

### Scenario: code-review/SKILL.md 包含跨域引用
GIVEN `plugins/overtone/skills/code-review/SKILL.md` 存在
WHEN 讀取 SKILL.md 內容
THEN 檔案包含對 `testing/references/test-anti-patterns.md` 的跨域引用
AND 引用說明 code-reviewer 在審查測試程式碼時應參考此文件
AND 原始的 `test-anti-patterns.md` 內容未被複製到 code-review/references/（遵守 Single Source of Truth）

---

## Feature 2: test-index.js 掃描行為

### Scenario: 掃描有效的 tests/ 目錄並產出正確格式摘要
GIVEN `tests/` 目錄存在且包含 unit/、integration/、e2e/ 子目錄
AND 各子目錄下有 *.test.js 檔案
WHEN 呼叫 `buildTestIndex(testsDir)`
THEN 回傳字串以 `[Test Index] N files (unit: X, integration: Y, e2e: Z)` 開頭
AND 包含 `## unit/`、`## integration/`、`## e2e/` 各節（如該目錄有測試檔）
AND 每個測試檔以 `- {filename}: {describe 名稱}` 格式列出

### Scenario: 每個測試檔擷取 top-level describe 名稱
GIVEN tests/ 下有一個 *.test.js 檔案
AND 該檔案包含 `describe('模組 X 功能', () => { ... })` 的 top-level describe
WHEN 呼叫 `buildTestIndex(testsDir)`
THEN 對應行顯示 `- {filename}: 模組 X 功能`
AND 若檔案有多個 top-level describe，以 ` | ` 分隔顯示所有名稱

### Scenario: maxChars 截斷保護
GIVEN tests/ 目錄有大量測試檔案，預計輸出超過預設 maxChars（4000 字元）
WHEN 呼叫 `buildTestIndex(testsDir)` 不傳入 options
THEN 回傳字串長度不超過 4000 字元
AND 截斷的字串結尾包含 `... (已截斷)` 或同等的截斷標示

### Scenario: 自訂 maxChars 選項
GIVEN tests/ 目錄存在
WHEN 呼叫 `buildTestIndex(testsDir, { maxChars: 100 })`
THEN 回傳字串長度不超過 100 字元
AND 若有截斷，結尾包含截斷標示

### Scenario: tests/ 目錄不存在時回傳空字串
GIVEN 傳入的 testsDir 路徑不存在
WHEN 呼叫 `buildTestIndex('/path/that/does/not/exist')`
THEN 回傳空字串 `''`
AND 不拋出例外

### Scenario: 單一測試檔讀取失敗時跳過繼續處理
GIVEN tests/ 目錄存在且包含 3 個測試檔
AND 其中 1 個檔案無法讀取（如權限問題或損壞）
WHEN 呼叫 `buildTestIndex(testsDir)`
THEN 回傳字串包含其他 2 個可讀取檔案的資訊
AND 失敗的檔案被靜默跳過（不拋出例外）

### Scenario: 所有測試檔讀取失敗時回傳空字串
GIVEN tests/ 目錄存在但所有檔案都無法讀取
WHEN 呼叫 `buildTestIndex(testsDir)`
THEN 回傳空字串 `''`

### Scenario: CLI 模式直接執行
GIVEN test-index.js 存在於 `plugins/overtone/scripts/test-index.js`
WHEN 執行 `bun plugins/overtone/scripts/test-index.js`（或 `node scripts/test-index.js`）
THEN 程式輸出測試索引摘要到 stdout
AND 程式以 exit code 0 結束

### Scenario: 沒有 describe 的測試檔顯示為空 describe 名稱
GIVEN tests/ 下有一個 *.test.js 檔案
AND 該檔案不包含任何 describe 區塊（只有 it/test 呼叫）
WHEN 呼叫 `buildTestIndex(testsDir)`
THEN 對應行仍列出該檔案名稱
AND describe 欄位顯示為空或以「（無 describe）」標示，不崩潰

---

## Feature 3: pre-task.js 注入行為

### Scenario: tester agent 委派時注入 test-index 摘要
GIVEN 當前工作流 session 存在且狀態正常
AND `targetAgent` 被識別為 `tester`
AND tests/ 目錄存在且有測試檔案
WHEN pre-task.js 處理 Task hook 事件
THEN `updatedInput.prompt` 包含 test-index 摘要內容
AND 摘要以 `[Test Index]` 開頭的區塊形式出現
AND 摘要位於 workflowContext 之後、原始 prompt 之前（或作為前置附加）

### Scenario: developer agent 委派時注入 test-index 摘要
GIVEN 當前工作流 session 存在且狀態正常
AND `targetAgent` 被識別為 `developer`
AND tests/ 目錄存在且有測試檔案
WHEN pre-task.js 處理 Task hook 事件
THEN `updatedInput.prompt` 包含 test-index 摘要內容
AND 摘要以 `[Test Index]` 開頭的區塊形式出現

### Scenario: 非 tester/developer agent 不注入 test-index 摘要
GIVEN `targetAgent` 被識別為 `planner`、`architect`、`code-reviewer` 或其他非 tester/developer agent
WHEN pre-task.js 處理 Task hook 事件
THEN `updatedInput.prompt` 不包含 `[Test Index]` 區塊
AND 其他注入行為（workflowContext）不受影響

### Scenario: 識別不到 targetAgent 時不注入 test-index 摘要
GIVEN Task hook 事件中無法識別目標 agent（targetAgent 為 null）
WHEN pre-task.js 處理 Task hook 事件
THEN hook 正常結束（允許或不擋）
AND 不注入 test-index 摘要（不拋出例外）

### Scenario: tests/ 目錄不存在時不注入（靜默降級）
GIVEN `targetAgent` 為 `tester`
AND 專案中 tests/ 目錄不存在或 buildTestIndex 回傳空字串
WHEN pre-task.js 處理 Task hook 事件
THEN `updatedInput.prompt` 不包含空的 `[Test Index]` 區塊
AND hook 正常結束，其他功能（skip 阻擋、workflow context 注入）不受影響

### Scenario: 注入後保留所有原始 toolInput 欄位
GIVEN `targetAgent` 為 `tester` 且 test-index 摘要非空
AND 原始 toolInput 包含 `subagent_type`、`description`、`prompt` 等欄位
WHEN pre-task.js 注入 test-index 摘要
THEN `updatedInput` 保留原始 `subagent_type`、`description` 等欄位
AND 只有 `prompt` 欄位被修改（追加摘要內容）

---

## Feature 4: agent DON'T 規則更新

### Scenario: tester.md 包含測試反模式 DON'T 規則
GIVEN `plugins/overtone/agents/tester.md` 存在
WHEN 讀取 tester.md 的 DON'T 規則段落
THEN 包含至少 2 條與測試反模式相關的 DON'T 規則
AND 規則明確禁止「重複撰寫已存在的測試」
AND 規則明確禁止常見反模式（如過度 mock、測試實作細節等）

### Scenario: developer.md 包含測試反模式 DON'T 規則
GIVEN `plugins/overtone/agents/developer.md` 存在
WHEN 讀取 developer.md 的 DON'T 規則段落
THEN 包含至少 2 條與測試反模式相關的 DON'T 規則
AND 規則明確引導 developer 避免寫低品質測試

### Scenario: agent 規則更新透過 manage-component.js 完成
GIVEN tester.md 和 developer.md 受 pre-edit-guard 保護
WHEN 需要更新這兩個檔案的 DON'T 規則
THEN 更新必須透過 `manage-component.js update agent` 命令完成
AND 直接 Edit 這兩個檔案的操作被 pre-edit-guard 阻擋
