# Feature: Health Check — 系統健康自動化偵測

## 範圍

- `scripts/health-check.js`：5 項確定性偵測
- `skills/audit/SKILL.md`：`/ot:audit` skill 串接
- 偵測項目：phantom-events、dead-exports、doc-code-drift、unused-paths、duplicate-logic

---

## Feature 1: Phantom Events 偵測

### Scenario: 正常 — 所有 registry 事件都有對應的 emit 呼叫
GIVEN registry.js 的 `timelineEvents` 定義了 22 個事件
AND `plugins/overtone/` 目錄下的 .js 檔案（排除測試和 health-check.js 本身）包含每個事件的 `emit()` 呼叫
WHEN 執行 phantom-events 偵測
THEN findings 中不包含任何 check 為 `phantom-events` 的項目
AND 對應 check 的 `passed` 為 `true`

### Scenario: 異常 — registry 定義了事件但沒有任何 emit 呼叫（phantom event）
GIVEN registry.js 定義了事件 `"stage:retry"`
AND 整個 `plugins/overtone/` 目錄（排除測試和 health-check.js）沒有任何 `emit('stage:retry', ...)` 或 `emit("stage:retry", ...)` 呼叫
WHEN 執行 phantom-events 偵測
THEN findings 包含一筆 `check: "phantom-events"`、`severity: "warning"` 的項目
AND 該 finding 的 `message` 包含 `stage:retry`
AND `file` 指向 `registry.js`

### Scenario: 異常 — 程式碼中 emit 了 registry 未定義的事件（undefined emit）
GIVEN 某個 hook 腳本呼叫 `emit('workflow:ghost', ...)`
AND registry.js 的 `timelineEvents` 中沒有定義 `workflow:ghost`
WHEN 執行 phantom-events 偵測
THEN findings 包含一筆 `check: "phantom-events"`、`severity: "error"` 的項目
AND 該 finding 的 `message` 包含 `workflow:ghost`
AND `file` 指向含有該 emit 呼叫的 hook 腳本路徑

### Scenario: 邊界 — health-check.js 本身和測試檔案的 emit 呼叫被排除
GIVEN health-check.js 本身的程式碼中包含用於掃描的字串 `emit(`
AND `tests/` 目錄下的測試檔案包含 mock 的 `emit()` 呼叫
WHEN 執行 phantom-events 偵測
THEN health-check.js 和測試檔案的 emit 呼叫不被納入掃描範圍
AND 不因這些檔案產生 false positive findings

---

## Feature 2: Dead Exports 偵測

### Scenario: 正常 — 所有 module.exports 函式都被其他模組 require 使用
GIVEN `scripts/lib/state.js` 的 `module.exports` 包含函式 `readState` 和 `writeState`
AND 至少一個其他 .js 檔案透過 `require(...)` 解構取用 `readState` 或 `writeState`
WHEN 執行 dead-exports 偵測
THEN findings 中不包含任何 check 為 `dead-exports` 的項目
AND 對應 check 的 `passed` 為 `true`

### Scenario: 異常 — lib 模組 export 了從未被任何模組 require 的函式
GIVEN `scripts/lib/utils.js` 的 `module.exports` 包含函式 `legacyHelper`
AND 整個 `plugins/overtone/` 目錄（排除 utils.js 本身和測試）沒有任何 `require` 解構或使用 `legacyHelper`
WHEN 執行 dead-exports 偵測
THEN findings 包含一筆 `check: "dead-exports"`、`severity: "warning"` 的項目
AND 該 finding 的 `message` 包含 `legacyHelper`
AND `file` 指向 `utils.js`

### Scenario: 邊界 — 同時支援 require 解構和直接存取兩種模式
GIVEN `scripts/lib/paths.js` 的 export 函式 `getWorkflowPath` 被以 `const { getWorkflowPath } = require(...)` 方式使用
AND `scripts/lib/registry.js` 的 export `stages` 被以 `const reg = require(...); reg.stages` 方式使用
WHEN 執行 dead-exports 偵測
THEN 兩種 require 模式都被正確識別為「有使用」
AND 這兩個 export 不出現在 findings 中

### Scenario: 邊界 — 掃描範圍包含子目錄 dashboard/ 和 remote/
GIVEN `scripts/lib/dashboard/server.js` 的 `module.exports` 包含函式 `startDashboard`
AND 某個 hook 腳本 require 並使用 `startDashboard`
WHEN 執行 dead-exports 偵測
THEN 子目錄 `dashboard/` 和 `remote/` 下的模組也在掃描範圍內
AND `startDashboard` 不被標記為 dead export

---

## Feature 3: Doc-Code Drift 偵測

### Scenario: 正常 — docs 中的關鍵數字與程式碼實際值一致
GIVEN registry.js 的 `timelineEvents` 實際有 22 個事件
AND docs 中描述「22 種 timeline events」
WHEN 執行 doc-code-drift 偵測
THEN findings 中不包含任何 check 為 `doc-code-drift` 的項目
AND 對應 check 的 `passed` 為 `true`

### Scenario: 異常 — docs 記載的 timeline events 數量與 registry 實際不符
GIVEN registry.js 的 `timelineEvents` 有 22 個事件（新增了 2 個）
AND docs/status.md 仍記載「20 種 timeline events」
WHEN 執行 doc-code-drift 偵測
THEN findings 包含一筆 `check: "doc-code-drift"`、`severity: "warning"` 的項目
AND 該 finding 的 `message` 說明 docs 記載的數字（20）與實際值（22）不符
AND `file` 指向含有不一致數字的文件路徑

### Scenario: 異常 — docs 記載的 agent 數量與 registry 實際不符
GIVEN registry.js 的 `stages` 物件定義了 16 個 stage（對應 16 個 agent）
AND 某份 docs 記載「15 個 agent」
WHEN 執行 doc-code-drift 偵測
THEN findings 包含一筆 `check: "doc-code-drift"`、`severity: "warning"` 的項目
AND 該 finding 描述 agent 數量不一致

### Scenario: 邊界 — workflow 數量和 hook 數量也被驗證
GIVEN registry.js 的 `workflows` 定義了 18 個 workflow
AND `plugins/overtone/hooks/` 目錄下有 7 個 hook 腳本
WHEN 執行 doc-code-drift 偵測
THEN workflow 數量和 hook 數量也納入比對範圍
AND 任何 docs 中與實際值不符的數字都產生 warning finding

---

## Feature 4: Unused Paths 偵測

### Scenario: 正常 — paths.js 所有 export 都被其他模組使用
GIVEN `scripts/lib/paths.js` 的 `module.exports` 包含 `getSessionDir`、`getWorkflowPath` 等函式
AND `plugins/overtone/` 下的其他 .js 檔案（排除 paths.js 本身和測試）都有使用這些函式
WHEN 執行 unused-paths 偵測
THEN findings 中不包含任何 check 為 `unused-paths` 的項目
AND 對應 check 的 `passed` 為 `true`

### Scenario: 異常 — paths.js 導出了從未被呼叫的路徑函式
GIVEN `scripts/lib/paths.js` 的 `module.exports` 包含函式 `getLegacyHandoffDir`
AND 整個 `plugins/overtone/` 目錄（排除 paths.js 本身和測試）沒有任何程式碼使用 `getLegacyHandoffDir`
WHEN 執行 unused-paths 偵測
THEN findings 包含一筆 `check: "unused-paths"`、`severity: "info"` 的項目
AND 該 finding 的 `message` 包含 `getLegacyHandoffDir`
AND `file` 指向 `paths.js`

### Scenario: 邊界 — paths.js 本身和測試檔案的自我參照不算作「使用」
GIVEN `scripts/lib/paths.js` 在自身的程式碼中使用了自己的 export 名稱（例如函式內呼叫自身）
AND `tests/helpers/paths.js` require 並使用某個 paths export
WHEN 執行 unused-paths 偵測
THEN paths.js 本身不算作使用者
AND 測試 helper 的 require 不算作「在 plugin 程式碼中被使用」的證據

---

## Feature 5: Duplicate Logic 偵測

### Scenario: 正常 — hook 腳本之間沒有重複的已知 pattern
GIVEN 7 個 hook 腳本各自都使用了不同的邏輯模式
AND 三個已知重複 pattern（agentToStage、calcDuration、findActualStageKey）都只出現在一個 hook 中或已被提取到 lib
WHEN 執行 duplicate-logic 偵測
THEN findings 中不包含任何 check 為 `duplicate-logic` 的項目
AND 對應 check 的 `passed` 為 `true`

### Scenario: 異常 — 已知 pattern 在 2 個以上 hook 中重複出現
GIVEN pattern `agentToStage` 的相關程式碼同時出現在 `subagent-stop.js` 和 `pre-task.js` 中
AND 兩個檔案中的相似邏輯沒有提取到共用 lib
WHEN 執行 duplicate-logic 偵測
THEN findings 包含一筆 `check: "duplicate-logic"`、`severity: "info"` 的項目
AND 該 finding 的 `message` 說明 `agentToStage` pattern 出現在哪些檔案中
AND `detail` 包含重複出現的具體位置

### Scenario: 邊界 — 三個已知 pattern 都被分別偵測
GIVEN hook 腳本中 `calcDuration` 和 `findActualStageKey` pattern 各自在 2+ 個 hook 中出現
WHEN 執行 duplicate-logic 偵測
THEN 每個重複的 pattern 各自產生獨立的 finding
AND findings 不重複計算同一個 pattern 在同一個檔案的多次出現

---

## Feature 6: 輸出格式驗證

### Scenario: 正常 — 輸出是合法的 JSON 且符合 HealthCheckOutput schema
GIVEN health-check.js 執行完畢
WHEN 讀取 stdout 的內容
THEN stdout 是合法的 JSON 字串（可被 JSON.parse 解析）
AND 頂層物件包含 `version`（string）、`timestamp`（ISO 8601 string）、`checks`（array）、`findings`（array）、`summary`（object）欄位
AND `summary` 包含 `total`（number）、`errors`（number）、`warnings`（number）、`infos`（number）、`passed`（boolean）

### Scenario: checks 陣列包含所有 5 個偵測項目的結果
GIVEN health-check.js 執行完畢
WHEN 解析 stdout 的 JSON
THEN `checks` 陣列長度為 5
AND 包含 name 分別為 `phantom-events`、`dead-exports`、`doc-code-drift`、`unused-paths`、`duplicate-logic` 的項目
AND 每個 check 項目包含 `name`（string）、`passed`（boolean）、`findingsCount`（number）

### Scenario: findings 陣列中每一筆都符合 Finding schema
GIVEN health-check.js 偵測到至少一個問題
WHEN 解析 stdout 的 JSON 並檢查 `findings` 陣列
THEN 每一筆 finding 包含 `check`（string）、`severity`（"error" | "warning" | "info"）、`file`（string）、`message`（string）欄位
AND `check` 的值只能是 `phantom-events`、`dead-exports`、`doc-code-drift`、`unused-paths`、`duplicate-logic` 之一
AND `severity` 的值只能是 `error`、`warning`、`info` 之一

### Scenario: summary 數字與 findings 陣列一致
GIVEN health-check.js 偵測到 2 個 warning 和 1 個 error
WHEN 解析 stdout 的 JSON
THEN `summary.total` 為 3
AND `summary.errors` 為 1
AND `summary.warnings` 為 2
AND `summary.infos` 為 0
AND `summary.passed` 為 `false`

---

## Feature 7: Exit Code 行為

### Scenario: 系統健康時 exit 0
GIVEN health-check.js 執行後所有 5 項偵測都沒有發現問題
AND `findings` 陣列為空
WHEN 等待 health-check.js 進程結束
THEN 進程退出碼為 0
AND `summary.passed` 為 `true`

### Scenario: 發現任何 finding 時 exit 1
GIVEN health-check.js 執行後至少有 1 個 finding（無論 severity 為何）
WHEN 等待 health-check.js 進程結束
THEN 進程退出碼為 1
AND `summary.passed` 為 `false`

### Scenario: severity 為 info 的 finding 也觸發 exit 1
GIVEN health-check.js 偵測到 1 個 `severity: "info"` 的 unused-paths finding
AND 沒有 error 或 warning 的 finding
WHEN 等待 health-check.js 進程結束
THEN 進程退出碼仍為 1
AND `summary.total` 為 1
AND `summary.infos` 為 1

### Scenario: 腳本執行過程中發生非預期錯誤
GIVEN health-check.js 在執行某項偵測時遭遇非預期的例外（如檔案讀取失敗）
WHEN 等待 health-check.js 進程結束
THEN 進程退出碼為 1
AND stderr 或 stdout 包含可識別的錯誤訊息（不是空輸出）

---

## Feature 8: /ot:audit Skill 串接

### Scenario: /ot:audit skill 成功執行 health-check.js 並格式化報告
GIVEN 使用者在 Claude Code 中輸入 `/ot:audit`
AND health-check.js 可正常執行
WHEN skill 被觸發
THEN skill 透過 Bash 執行 `bun scripts/health-check.js`
AND 捕獲 JSON stdout 輸出
AND Main Agent 直接解析 JSON 並格式化為可讀報告

### Scenario: Main Agent 針對 findings 產出優先級分類和修復建議
GIVEN /ot:audit skill 取得了包含多個 findings 的 JSON 輸出
AND findings 包含 error、warning、info 不同 severity 的問題
WHEN Main Agent 分析 findings
THEN 輸出包含按 severity 分類的問題清單
AND 每個問題附有修復建議或下一步行動
AND error 類問題排在最高優先級

### Scenario: health-check.js 無任何 findings 時 skill 回報系統健康
GIVEN health-check.js 執行後 findings 陣列為空且 exit code 為 0
WHEN /ot:audit skill 取得結果
THEN skill 向使用者回報「系統衛生狀態良好，無發現任何問題」

### Scenario: health-check.js 執行失敗時 skill 回報錯誤
GIVEN health-check.js 因系統錯誤而退出（非正常 findings 導致的 exit 1）
AND stdout 不是合法的 JSON
WHEN /ot:audit skill 嘗試解析輸出
THEN skill 向使用者回報腳本執行失敗
AND 說明可能的原因（如 Bun 未安裝、腳本路徑錯誤等）
AND 不因解析錯誤而本身崩潰
