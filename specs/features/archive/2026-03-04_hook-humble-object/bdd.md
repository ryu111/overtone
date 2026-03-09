# Feature: Hook 純函數匯出契約

驗證 Humble Object 重構後，每個 hook 匯出的純函數可被直接 `require()` 並測試其輸入/輸出契約。

---

## Scenario: buildBanner 組裝完整 banner 字串
GIVEN version 為 "0.28.43"、sessionId 為 "sess-123"、port 為 7777
AND deps 包含 agentBrowserStatus、ghStatus、grayMatterStatus 三個依賴狀態字串
WHEN 呼叫 `buildBanner(version, sessionId, port, deps)`
THEN 回傳字串包含版本號 "0.28.43"
AND 回傳字串包含 sessionId "sess-123"
AND 回傳字串包含 port "7777"

## Scenario: buildBanner 在缺少依賴狀態時仍能產生輸出
GIVEN version 為 "0.28.0"、sessionId 為 "sess-abc"、port 為 7777
AND deps 為空物件 `{}`
WHEN 呼叫 `buildBanner(version, sessionId, port, {})`
THEN 回傳字串（不拋出例外）

## Scenario: buildStartOutput 在 workflow 進行中時組裝含 systemMessage 的輸出
GIVEN input 包含 session_id 和 api_key 欄位
AND options 包含有效的 pendingTasksMsg 及 version
WHEN 呼叫 `buildStartOutput(input, options)`
THEN 回傳物件包含 `result` 字串和 `systemMessage` 字串
AND `systemMessage` 為非空字串

## Scenario: buildStartOutput 在無 workflow 時組裝僅含 result 的輸出
GIVEN input 包含 session_id 欄位
AND options 中的 pendingTasksMsg 為 null（無進行中 workflow）
WHEN 呼叫 `buildStartOutput(input, options)`
THEN 回傳物件包含 `result` 字串
AND `systemMessage` 為 undefined 或空字串

## Scenario: buildStartOutput 回傳值為純資料物件（不含 I/O 副作用）
GIVEN 任意有效 input 和 options
WHEN 呼叫 `buildStartOutput(input, options)`
THEN 回傳物件不含函數、Promise、或 EventEmitter 成員
AND 可安全序列化為 JSON

---

# Feature: session/on-stop.js 純函數匯出契約

驗證 Loop Stop hook 的三個純函數輸入/輸出契約。

---

## Scenario: calcDuration 將 ISO 時間字串轉為可讀耗時格式
GIVEN startIso 為 2 分 30 秒前的 ISO 8601 時間戳記
WHEN 呼叫 `calcDuration(startIso)`
THEN 回傳字串包含分鐘和秒數（例如 "2m 30s" 格式）

## Scenario: calcDuration 處理不足一分鐘的情況
GIVEN startIso 為 45 秒前的 ISO 8601 時間戳記
WHEN 呼叫 `calcDuration(startIso)`
THEN 回傳字串只包含秒數（例如 "45s" 格式）

## Scenario: buildCompletionSummary 組裝完成摘要字串
GIVEN ws 為工作流狀態物件（含 workflowType 和 currentStage）
AND stages 為 stage 名稱陣列（例如 ["PLAN", "ARCH", "DEV"]）
WHEN 呼叫 `buildCompletionSummary(ws, stages)`
THEN 回傳非空字串
AND 字串包含各 stage 名稱

## Scenario: buildCompletionSummary 在 stages 為空陣列時回傳有效字串
GIVEN ws 為任意工作流狀態物件
AND stages 為空陣列
WHEN 呼叫 `buildCompletionSummary(ws, [])`
THEN 回傳字串（不拋出例外）

## Scenario: buildContinueMessage 組裝 loop 繼續訊息
GIVEN ctx 包含 iteration=2、maxIterations=5、completedStages=3、totalStages=5
AND tasksStatus 為 "3/5 tasks done"
WHEN 呼叫 `buildContinueMessage(ctx)`
THEN 回傳字串包含 iteration 資訊
AND 回傳字串包含剩餘工作提示

## Scenario: buildContinueMessage 在達到最大迭代次數時組裝停止訊息
GIVEN ctx 包含 iteration=5、maxIterations=5
WHEN 呼叫 `buildContinueMessage(ctx)`
THEN 回傳字串包含達到上限的提示（不拋出例外）

---

# Feature: session/pre-compact.js 純函數匯出契約

驗證壓縮恢復訊息的純函數契約。

---

## Scenario: buildCompactMessage 組裝含工作流狀態的恢復訊息
GIVEN currentState 包含 workflowType="standard"、currentStage="DEV"、featureName="my-feature"
AND pendingMsg 為非空字串
AND stages 為 ["PLAN", "ARCH", "DEV", "TEST"]
WHEN 呼叫 `buildCompactMessage({ currentState, pendingMsg, queueSummary: null, stages, parallelGroups: [] })`
THEN 回傳字串包含 workflowType "standard"
AND 回傳字串包含 currentStage "DEV"
AND 回傳字串長度大於 0

## Scenario: buildCompactMessage 在訊息超過 MAX_MESSAGE_LENGTH 時截斷輸出
GIVEN currentState 包含有效工作流狀態
AND MAX_MESSAGE_LENGTH 設為 100（極小值）
WHEN 呼叫 `buildCompactMessage({ ..., MAX_MESSAGE_LENGTH: 100 })`
THEN 回傳字串長度不超過 100 字元

## Scenario: buildCompactMessage 在無 workflow 時回傳最小化訊息
GIVEN currentState 為 null 或 undefined
AND 其他參數為空/null
WHEN 呼叫 `buildCompactMessage({ currentState: null, pendingMsg: null, queueSummary: null, stages: [], parallelGroups: [] })`
THEN 回傳字串（不拋出例外）

---

# Feature: prompt/on-submit.js 純函數匯出契約

驗證三種分支的 systemMessage 組裝邏輯。

---

## Scenario: buildSystemMessage 在有 workflow override 時組裝 override 分支訊息
GIVEN userPrompt 包含有效的 workflow 覆蓋指令（例如 "/single"）
AND validWorkflowOverride 為 "single"
AND currentState 為無 workflow 進行中的狀態
WHEN 呼叫 `buildSystemMessage({ userPrompt, currentState, validWorkflowOverride, activeFeatureContext: null, workflows })`
THEN 回傳字串包含 workflow "single" 的相關指引

## Scenario: buildSystemMessage 在有進行中 workflow 時組裝進行中分支訊息
GIVEN validWorkflowOverride 為 null
AND currentState.status 為 "running"、currentStage 為 "DEV"
AND activeFeatureContext 為有效的 feature 資訊物件
WHEN 呼叫 `buildSystemMessage({ userPrompt: "繼續", currentState, validWorkflowOverride: null, activeFeatureContext, workflows })`
THEN 回傳字串包含當前 stage "DEV"
AND 回傳字串包含 feature 資訊

## Scenario: buildSystemMessage 在無 workflow 時回傳空字串或 null
GIVEN validWorkflowOverride 為 null
AND currentState 為 null 或 status 為 "idle"
AND activeFeatureContext 為 null
WHEN 呼叫 `buildSystemMessage({ userPrompt: "隨意問題", currentState: null, validWorkflowOverride: null, activeFeatureContext: null, workflows })`
THEN 回傳空字串或 null（不拋出例外）

## Scenario: buildSystemMessage 回傳值始終為字串或 null（型別契約）
GIVEN 任意合法的輸入組合
WHEN 呼叫 `buildSystemMessage({ ... })`
THEN 回傳值為 string 型別或 null
AND 不回傳 undefined 或其他型別

---

# Feature: tool/pre-task.js 純函數匯出契約

驗證跳過 stage 偵測邏輯。

---

## Scenario: checkSkippedStages 在所有前置 stage 已完成時回傳空陣列
GIVEN currentState 中 PLAN 和 ARCH stage 均為 "completed"
AND targetStage 為 "DEV"
AND stages 包含 PLAN → ARCH → DEV 的順序定義
WHEN 呼叫 `checkSkippedStages(currentState, "DEV", stages)`
THEN 回傳空陣列 `[]`

## Scenario: checkSkippedStages 偵測到前置 stage 被跳過時回傳跳過清單
GIVEN currentState 中 PLAN 為 "pending"（未完成）、ARCH 為 "pending"
AND targetStage 為 "DEV"
AND stages 定義 DEV 需要前置 PLAN 和 ARCH
WHEN 呼叫 `checkSkippedStages(currentState, "DEV", stages)`
THEN 回傳非空陣列，包含被跳過的 stage 描述

## Scenario: checkSkippedStages 在 targetStage 為第一個 stage 時回傳空陣列
GIVEN currentState 為空（無已完成 stage）
AND targetStage 為 "PLAN"（第一個 stage，無前置依賴）
WHEN 呼叫 `checkSkippedStages(currentState, "PLAN", stages)`
THEN 回傳空陣列 `[]`

## Scenario: checkSkippedStages 在 currentState 為 null 時不拋出例外
GIVEN currentState 為 null
AND targetStage 為任意字串
WHEN 呼叫 `checkSkippedStages(null, "DEV", stages)`
THEN 回傳陣列（不拋出例外）

---

# Feature: tool/pre-edit-guard.js 純函數匯出契約

驗證受保護路徑檢查和記憶行數限制檢查的邏輯。

---

## Scenario: checkProtected 對受保護路徑回傳 label 和 api
GIVEN filePath 為 "plugins/overtone/agents/developer.md"（受保護的 agent 檔案）
AND pluginRoot 為 "/path/to/plugins/overtone"
WHEN 呼叫 `checkProtected(filePath, pluginRoot)`
THEN 回傳物件包含 `label` 字串
AND 回傳物件包含 `api` 字串（管理 API 指引）

## Scenario: checkProtected 對不受保護路徑回傳 null
GIVEN filePath 為 "src/utils/helper.js"（普通檔案）
AND pluginRoot 為任意有效路徑
WHEN 呼叫 `checkProtected(filePath, pluginRoot)`
THEN 回傳 null

## Scenario: checkProtected 偵測 hooks.json 為受保護路徑
GIVEN filePath 包含 "hooks.json"
AND pluginRoot 包含此路徑
WHEN 呼叫 `checkProtected(filePath, pluginRoot)`
THEN 回傳物件（不回傳 null）

## Scenario: checkMemoryLineLimit 在行數未超出時回傳 exceeded=false
GIVEN filePath 為 "MEMORY.md"
AND toolInput 的內容預計行數為 100
AND limit 為 200
WHEN 呼叫 `checkMemoryLineLimit(filePath, "Write", toolInput, 200)`
THEN 回傳 `{ exceeded: false, estimatedLines: 100 }`（estimatedLines 約為 100）

## Scenario: checkMemoryLineLimit 在行數超出限制時回傳 exceeded=true
GIVEN filePath 為 "MEMORY.md"
AND toolInput 的 content 包含超過 200 行的文字
AND limit 為 200
WHEN 呼叫 `checkMemoryLineLimit(filePath, "Write", toolInput, 200)`
THEN 回傳 `{ exceeded: true, estimatedLines: N }`（N > 200）

## Scenario: checkMemoryLineLimit 對非 MEMORY.md 路徑回傳 exceeded=false
GIVEN filePath 為 "src/utils/helper.js"
AND limit 為 200
WHEN 呼叫 `checkMemoryLineLimit(filePath, "Write", toolInput, 200)`
THEN 回傳 `{ exceeded: false, estimatedLines: 0 }`（不檢查非 MEMORY 檔案）

---

# Feature: tool/pre-bash-guard.js 純函數匯出契約

驗證危險命令偵測邏輯。

---

## Scenario: checkDangerousCommand 對危險命令回傳危險類別字串
GIVEN command 為 "rm -rf /"（危險的刪除根目錄命令）
WHEN 呼叫 `checkDangerousCommand("rm -rf /")`
THEN 回傳非空字串（如 "刪除根目錄" 或對應的危險類別描述）

## Scenario: checkDangerousCommand 對安全命令回傳 null
GIVEN command 為 "ls -la /tmp"（安全的列目錄命令）
WHEN 呼叫 `checkDangerousCommand("ls -la /tmp")`
THEN 回傳 null

## Scenario: checkDangerousCommand 偵測 fork bomb
GIVEN command 為 ":(){ :|:& };:"（fork bomb 命令）
WHEN 呼叫 `checkDangerousCommand(":(){ :|:& };:")`
THEN 回傳非空字串（不回傳 null）

## Scenario: checkDangerousCommand 對空字串不拋出例外
GIVEN command 為空字串
WHEN 呼叫 `checkDangerousCommand("")`
THEN 回傳 null（不拋出例外）

---

# Feature: notification/on-notification.js 純函數匯出契約

驗證播音判斷邏輯。

---

## Scenario: shouldPlaySound 在通知類型在允許清單中時回傳 true
GIVEN notificationType 為 "AskUserQuestion"
AND soundTypes 陣列包含 "AskUserQuestion"
WHEN 呼叫 `shouldPlaySound("AskUserQuestion", ["AskUserQuestion", "Error"])`
THEN 回傳 true

## Scenario: shouldPlaySound 在通知類型不在允許清單中時回傳 false
GIVEN notificationType 為 "Info"
AND soundTypes 陣列不包含 "Info"
WHEN 呼叫 `shouldPlaySound("Info", ["AskUserQuestion", "Error"])`
THEN 回傳 false

## Scenario: shouldPlaySound 在 soundTypes 為空陣列時回傳 false
GIVEN soundTypes 為空陣列
AND notificationType 為任意字串
WHEN 呼叫 `shouldPlaySound("AskUserQuestion", [])`
THEN 回傳 false

---

# Feature: require.main 守衛

驗證所有 hook 腳本在被 `require()` 時不會自動執行 stdin 讀取和 process.exit。

---

## Scenario: require() hook 腳本不觸發 stdin 監聽
GIVEN session/on-start.js 已加入 `require.main === module` 守衛
WHEN 在測試中以 `require('./on-start.js')` 載入模組
THEN 不啟動 stdin 的 `data` 事件監聽
AND 不呼叫 `process.stdin.resume()` 或等待輸入
AND 模組載入完成（不掛起）

## Scenario: require() hook 腳本不呼叫 process.exit
GIVEN 任意一個已加入守衛的 hook 腳本（例如 on-stop.js）
WHEN 在測試中以 `require()` 載入該腳本
THEN 不呼叫 `process.exit()`
AND 測試進程不被意外終止

## Scenario: require() hook 腳本後可取得 module.exports 匯出物件
GIVEN session/on-start.js 已加入守衛並匯出 buildBanner、buildStartOutput
WHEN 在測試中以 `const { buildBanner, buildStartOutput } = require('./on-start.js')` 載入
THEN `buildBanner` 為 function 型別
AND `buildStartOutput` 為 function 型別

## Scenario: 無可匯出純函數的 hook（on-session-end, on-task-completed）require 後模組可正常載入
GIVEN session/on-session-end.js 僅加入守衛、無 module.exports 純函數
WHEN 在測試中以 `require('./on-session-end.js')` 載入
THEN 不拋出 require 錯誤
AND 模組載入完成（不掛起）

---

# Feature: Hook CLI 行為不變（stdin/stdout 協定）

驗證重構後 hook 作為子進程執行時，stdin/stdout JSON 協定與重構前完全相同。

---

## Scenario: session/on-start.js 子進程執行後回傳有效的 JSON output
GIVEN 以 `Bun.spawnSync` 啟動 on-start.js 子進程
AND 透過 stdin 傳入有效的 JSON（含 session_id 和其他必要欄位）
WHEN 子進程執行完畢
THEN stdout 輸出為有效 JSON
AND JSON 包含 `result` 字串欄位

## Scenario: tool/pre-bash-guard.js 子進程對危險命令回傳 deny 決策
GIVEN 以 `Bun.spawnSync` 啟動 pre-bash-guard.js 子進程
AND stdin 傳入包含危險命令的 JSON（如 `{ "tool_name": "Bash", "tool_input": { "command": "rm -rf /" } }`）
WHEN 子進程執行完畢
THEN stdout 為有效 JSON
AND JSON 的 `hookSpecificOutput.permissionDecision` 為 "deny"

## Scenario: tool/pre-bash-guard.js 子進程對安全命令回傳 allow 決策
GIVEN 以 `Bun.spawnSync` 啟動 pre-bash-guard.js 子進程
AND stdin 傳入包含安全命令的 JSON（如 `{ "tool_name": "Bash", "tool_input": { "command": "ls -la" } }`）
WHEN 子進程執行完畢
THEN stdout 為有效 JSON
AND JSON 的 `hookSpecificOutput.permissionDecision` 為 "allow"

## Scenario: tool/pre-edit-guard.js 子進程對受保護路徑回傳 deny 決策
GIVEN 以 `Bun.spawnSync` 啟動 pre-edit-guard.js 子進程
AND stdin 傳入包含受保護路徑的 Write 工具呼叫（如 agents/developer.md）
WHEN 子進程執行完畢
THEN stdout 為有效 JSON
AND JSON 的 `hookSpecificOutput.permissionDecision` 為 "deny"

## Scenario: notification/on-notification.js 子進程對支援的通知類型正常執行
GIVEN 以 `Bun.spawnSync` 啟動 on-notification.js 子進程
AND stdin 傳入含 notification_type="AskUserQuestion" 的 JSON
WHEN 子進程執行完畢
THEN 子進程退出碼為 0
AND stdout 輸出為有效 JSON（不崩潰）
