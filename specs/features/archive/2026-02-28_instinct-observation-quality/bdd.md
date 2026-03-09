# Feature: Instinct 觀察品質提升

Instinct 系統從工作流執行中自動收集多元、有價值的觀察信號，
讓系統能夠學習並逐步進化 Skill 和 Agent。
本 feature 涵蓋 6 個子任務：emit() 飽和閾值、wording code fence 排除、
agent_performance 觀察、workflow_routing 觀察、search-tools 反面糾正、文件同步。

---

## Feature 1: emit() 飽和閾值

當 Instinct 觀察的信心分數達到 1.0 時，停止追加新的 JSONL 行，避免無限膨脹。

### Scenario: 信心未達 1.0 時正常追加觀察
Given 一個 observations.jsonl 檔案中已有 tag=`search-tools`、type=`tool_preferences` 的記錄，信心分數為 0.95
When 呼叫 `instinct.emit()` 傳入相同 tag 和 type
Then 觀察被更新，信心分數升至 1.0（0.95 + 0.05 = 1.0，夾到上限）
And JSONL 檔案新增一行（append）
And count 遞增 1

### Scenario: 信心已達 1.0 時直接回傳，不再追加
Given 一個 observations.jsonl 檔案中已有 tag=`npm-bun`、type=`error_resolutions` 的記錄，信心分數已達 1.0
When 呼叫 `instinct.emit()` 傳入相同 tag 和 type
Then 回傳現有的 instinct 物件（confidence = 1.0）
And JSONL 檔案不增加新行（行數不變）
And 現有記錄的 count 不遞增
And 現有記錄的 confidence 不變（維持 1.0）

### Scenario: 飽和狀態下 lastSeen 不更新（保留衰減能力）
Given 一個 observations.jsonl 中有記錄，信心為 1.0，lastSeen 為一個舊時間戳
When 呼叫 `instinct.emit()` 傳入相同 tag 和 type
Then 回傳的物件 lastSeen 與原始記錄相同（未更新）
And 未來 decay() 執行時，此記錄仍可正常衰減

### Scenario: 飽和後再次 emit 不影響其他不同 tag 的記錄
Given observations.jsonl 中有兩筆記錄：tag=`npm-bun`（信心 1.0）和 tag=`bun-test`（信心 0.5）
When 呼叫 `instinct.emit()` 傳入 tag=`npm-bun`（已飽和）
And 呼叫 `instinct.emit()` 傳入 tag=`bun-test`（未飽和）
Then `npm-bun` 記錄保持不變（不追加）
And `bun-test` 記錄正常更新（信心升至 0.55，新增一行）

---

## Feature 2: wording 偵測排除 code fence

detectWordingMismatch() 在掃描 .md 檔案時，跳過 code fence（三反引號包圍）區塊內的內容，避免誤報。

### Scenario: code fence 外的違規行正常觸發警告
Given 一個 .md 檔案，內容為純文字（無 code fence），包含 `💡 MUST validate inputs`
When 呼叫 `detectWordingMismatch()`
Then 回傳包含此行的警告陣列（length >= 1）

### Scenario: code fence 內的違規行不觸發警告
Given 一個 .md 檔案，包含：
  ```
  正常說明行
  \`\`\`javascript
  💡 MUST validate inputs
  \`\`\`
  ```
When 呼叫 `detectWordingMismatch()`
Then 回傳空陣列（code fence 內的行跳過偵測）

### Scenario: code fence 開啟行本身（``` 那一行）不觸發警告
Given 一個 .md 檔案，第一行為 ` ```javascript `（code fence 開啟行）
When 呼叫 `detectWordingMismatch()`
Then 回傳空陣列（code fence 標記行本身不被偵測）

### Scenario: code fence 關閉後恢復正常偵測
Given 一個 .md 檔案，包含：
  ```
  \`\`\`javascript
  💡 MUST validate（code fence 內，應忽略）
  \`\`\`
  💡 MUST always run tests（code fence 外，應偵測）
  ```
When 呼叫 `detectWordingMismatch()`
Then 警告陣列長度為 1（只有 code fence 外的行）
And 警告訊息包含「💡 MUST always run tests」所在行號

### Scenario: 多個 code fence 區塊交替排列
Given 一個 .md 檔案，包含兩個 code fence 區塊，每個區塊內都有違規行，區塊間夾著正常違規行
When 呼叫 `detectWordingMismatch()`
Then 只有 code fence 外的違規行產生警告
And code fence 內的違規行不產生警告

### Scenario: 縮排的 code fence 也被正確識別
Given 一個 .md 檔案，code fence 前有空格縮排（如 `  \`\`\`javascript`）
When 呼叫 `detectWordingMismatch()`
Then 縮排的 code fence 也被識別，其內部行跳過偵測

---

## Feature 3: agent_performance 觀察記錄

on-stop.js 在每次 agent 完成時，自動記錄 agent 表現到 Instinct 系統。

### Scenario: developer agent PASS 後記錄 agent_performance 觀察
Given 一個進行中的 workflow，developer agent 正在執行 DEV stage
When developer agent 以 PASS 完成（輸出含「VERDICT: pass」）
Then on-stop.js 在 timeline emit 後，呼叫 instinct.emit() 記錄觀察
And 觀察 type 為 `agent_performance`
And 觀察 tag 為 `agent-developer`
And 觀察 trigger 包含 `developer` 和 `pass` 和 `DEV`
And observations.jsonl 新增一行對應記錄

### Scenario: tester agent FAIL 後也記錄 agent_performance 觀察
Given 一個進行中的 workflow，tester agent 正在執行 TEST stage
When tester agent 以 FAIL 完成（輸出含測試失敗訊息）
Then on-stop.js 記錄 instinct.emit()
And 觀察 type 為 `agent_performance`
And 觀察 tag 為 `agent-tester`
And 觀察 trigger 包含 `tester` 和 `fail`

### Scenario: code-reviewer agent REJECT 後也記錄 agent_performance 觀察
Given 一個進行中的 workflow，code-reviewer agent 正在執行 REVIEW stage
When code-reviewer agent 以 REJECT 完成
Then on-stop.js 記錄 instinct.emit()
And 觀察 type 為 `agent_performance`
And 觀察 tag 為 `agent-code-reviewer`
And 觀察 trigger 包含 `code-reviewer` 和 `reject`

### Scenario: 同一 agent 多次完成後信心累積（confirm 機制）
Given 同一 session 中，developer agent 已完成一次 DEV stage（存在 tag=`agent-developer` 的觀察）
When developer agent 再次完成 DEV stage（第二次）
Then emit() 偵測到相同 tag + type 的記錄，觸發 confirm（信心 +0.05）
And observations.jsonl 追加更新記錄
And count 遞增為 2

### Scenario: instinct.emit() 失敗時不影響 hook 主流程
Given on-stop.js 正常執行中，但 observations.jsonl 目錄無寫入權限（模擬 emit 失敗）
When agent 完成並觸發 on-stop.js
Then hook 仍正常輸出 result 訊息（含 ✅ 或 ❌ 提示）
And hook 以 exit code 0 結束（不崩潰）

---

## Feature 4: workflow_routing 觀察記錄

on-submit.js 在偵測到進行中的 workflow 時，記錄使用者 prompt 和 workflow 類型的對應關係。

### Scenario: 已有進行中 workflow 時記錄 workflow_routing
Given 一個 session 中已有 workflow.json，workflowType 為 `standard`，currentStage 為 `DEV`
When 使用者送出 prompt「請繼續完成開發」
Then on-submit.js 呼叫 instinct.emit() 記錄觀察
And 觀察 type 為 `workflow_routing`
And 觀察 tag 為 `wf-standard`
And 觀察 trigger 為使用者 prompt 前 80 字元
And 觀察 action 包含 `standard`

### Scenario: 首次 prompt（無 workflow state）不記錄 workflow_routing
Given 一個全新 session，尚無 workflow.json（currentState 為 null）
When 使用者送出首次 prompt「請幫我實作登入功能」
Then on-submit.js 不呼叫 workflow_routing 的 instinct.emit()
And observations.jsonl 不存在或不含 type=`workflow_routing` 的記錄
And systemMessage 正常注入 /auto 指引

### Scenario: 使用者 prompt 超過 80 字元時截斷作為 trigger
Given 一個 session 有進行中的 `quick` workflow
When 使用者送出長達 200 字元的 prompt
Then 觀察 trigger 只包含前 80 字元（截斷）
And tag 為 `wf-quick`

### Scenario: 使用者 prompt 為空字串時使用預設 trigger
Given 一個 session 有進行中的 `tdd` workflow
When 使用者送出空字串 prompt（極少見場景）
Then 觀察 trigger 為 `(empty prompt)` 字串
And 觀察仍正常記錄，type=`workflow_routing`，tag=`wf-tdd`

### Scenario: instinct.emit() 失敗時 on-submit.js 繼續正常輸出
Given 一個 session 有進行中的 workflow，但 observations.jsonl 無法寫入
When 使用者送出 prompt
Then on-submit.js 的 instinct 觀察靜默失敗（try/catch 捕獲）
And systemMessage 仍正常輸出 additionalContext（hook 主流程不受影響）

---

## Feature 5: search-tools 反面糾正

post-use.js 改為在 Bash 指令中偵測到 grep/find/rg 時記錄反面觀察，不再為每次 Grep/Glob 工具使用記錄正面觀察。

### Scenario: Bash 指令中使用 grep 觸發反面觀察
Given 一個有效的 session
When Bash 工具執行 `grep -r "pattern" ./src`（exit code 0 或非零）
Then post-use.js 呼叫 instinct.emit() 記錄反面觀察
And 觀察 type 為 `tool_preferences`
And 觀察 tag 為 `search-tools`
And 觀察 action 包含「建議改用 Grep/Glob 工具」
And 觀察 trigger 包含 Bash 指令的前 80 字元

### Scenario: Bash 指令中使用管道 grep（`cat file | grep`）也觸發觀察
Given 一個有效的 session
When Bash 工具執行 `cat package.json | grep "version"`
Then post-use.js 偵測到指令中含 `grep`（word boundary 匹配）
And 觀察被正常記錄，tag=`search-tools`

### Scenario: Bash 指令中使用 rg（ripgrep）觸發反面觀察
Given 一個有效的 session
When Bash 工具執行 `rg "TODO" ./plugins`
Then post-use.js 偵測到 `rg` 指令（word boundary `\brg\b`）
And 觀察 type=`tool_preferences`，tag=`search-tools` 被記錄

### Scenario: 使用 Grep 或 Glob 工具時不記錄觀察
Given 一個有效的 session
When Claude Code 呼叫 Grep 工具進行搜尋
Then post-use.js 不呼叫 `search-tools` 的 instinct.emit()
And observations.jsonl 不新增 tag=`search-tools` 的記錄

### Scenario: 含 grep 的字串但非獨立 word 不觸發（fingerprint、aggregate 等）
Given 一個有效的 session
When Bash 工具執行 `node -e "console.log(fingerprint)"`
Then post-use.js 不偵測到 grep（word boundary `\bgrep\b` 不匹配 `fingerprint`）
And observations.jsonl 不新增 tag=`search-tools` 的記錄

### Scenario: Bash grep 觀察獨立於 exit code（成功或失敗都記錄）
Given 一個有效的 session
When Bash 工具執行 `grep "pattern" ./no-match-file`（exit code 1，沒有找到匹配行）
Then post-use.js 仍記錄 search-tools 反面觀察（不以成敗區分）
And 觀察 type=`tool_preferences`，tag=`search-tools`

---

## Feature 6: 文件同步

evolve/SKILL.md 和 confidence-scoring.md 反映新增的觀察類型，確保 evolve skill 執行時有正確的知識基礎。

### Scenario: evolve SKILL.md 包含所有 V1 觀察類型
Given 修改完成後的 `plugins/overtone/skills/evolve/SKILL.md`
When 閱讀 V1 觀察類型說明段落
Then 包含 `error_resolutions` 類型的說明
And 包含 `tool_preferences` 類型的說明
And 包含 `agent_performance` 類型的說明
And 包含 `workflow_routing` 類型的說明
And 不再有「只收集 2 種 pattern」或「只收集 error_resolutions 和 tool_preferences」的舊描述

### Scenario: confidence-scoring.md 觀察類型表格包含所有類型
Given 修改完成後的 `plugins/overtone/skills/evolve/references/confidence-scoring.md`
When 閱讀 V1 支援的觀察類型表格
Then 表格包含 `agent_performance` 行，說明「Agent 執行表現」
And 表格包含 `workflow_routing` 行，說明「工作流選擇偏好」
And 表格包含 `wording_mismatch` 行，說明「措詞不匹配偵測」
And 表格的 `tool_preferences` 行說明更新為反映反面偵測邏輯（Bash grep/find）

### Scenario: 文件更新不破壞 evolve skill 的正常讀取
Given evolve/SKILL.md 和 confidence-scoring.md 已更新
When evolve skill 被執行（讀取 SKILL.md 及其 references）
Then skill 能正常讀取並理解所有 4 種觀察類型
And 不存在 YAML frontmatter 錯誤或 Markdown 語法破損
