# PreCompact Hook — BDD Spec

## Feature 1: 無 sessionId 時靜默退出

### Scenario 1.1: stdin 無 session_id 且無環境變數時輸出空 result
- **Given** PreCompact hook 被觸發
- **And** stdin JSON 不含 `session_id` 欄位
- **And** 環境變數 `CLAUDE_SESSION_ID` 未設定
- **When** hook 腳本執行
- **Then** stdout 輸出 `{"result":""}`
- **And** 不輸出任何 `systemMessage` 欄位
- **And** process exit code 為 0

### Scenario 1.2: stdin 空白時安全退出不拋錯
- **Given** PreCompact hook 被觸發
- **And** stdin 為空字串
- **When** hook 腳本執行
- **Then** `safeReadStdin` 回傳 `{}`
- **And** stdout 輸出 `{"result":""}`
- **And** process exit code 為 0（不阻擋 compaction）

### Scenario 1.3: stdin 畸形 JSON 時安全退出
- **Given** PreCompact hook 被觸發
- **And** stdin 內容為無效 JSON（如 `{broken`）
- **When** hook 腳本執行
- **Then** `safeReadStdin` 回傳 `{}`
- **And** stdout 輸出 `{"result":""}`
- **And** process exit code 為 0

---

## Feature 2: 有 workflow state 時組裝狀態摘要

### Scenario 2.1: standard workflow 執行中組裝完整狀態摘要
- **Given** 有效的 `session_id`（從 stdin 取得）
- **And** workflow.json 存在，`workflowType` 為 `standard`
- **And** stages 為 `PLAN:completed`, `ARCH:completed`, `TEST:pending`, `DEV:pending`, `REVIEW:pending`, `TEST:pending`, `RETRO:pending`, `DOCS:pending`
- **And** `currentStage` 為 `TEST`
- **And** `failCount` 為 0、`rejectCount` 為 0
- **When** hook 腳本執行
- **Then** stdout JSON 包含 `systemMessage` 欄位
- **And** systemMessage 首行為 `[Overtone 狀態恢復（compact 後）]`
- **And** systemMessage 包含 `工作流：standard`
- **And** systemMessage 包含進度條（已完成 stage 標記 ✅，pending 標記 ⬜）
- **And** systemMessage 包含 `目前階段：🧪 測試`
- **And** systemMessage 不包含 `失敗次數` 行（failCount=0 時省略）
- **And** systemMessage 不包含 `拒絕次數` 行（rejectCount=0 時省略）
- **And** systemMessage 末尾包含行動指引（「⛔ 禁止詢問使用者」）

### Scenario 2.2: failCount > 0 時顯示失敗計數
- **Given** 有效的 `session_id`
- **And** workflow.json 的 `failCount` 為 2
- **And** `rejectCount` 為 0
- **When** hook 腳本執行
- **Then** systemMessage 包含 `失敗次數：2/3`
- **And** systemMessage 不包含 `拒絕次數` 行

### Scenario 2.3: rejectCount > 0 時顯示拒絕計數
- **Given** 有效的 `session_id`
- **And** workflow.json 的 `failCount` 為 0
- **And** `rejectCount` 為 1
- **When** hook 腳本執行
- **Then** systemMessage 不包含 `失敗次數` 行
- **And** systemMessage 包含 `拒絕次數：1/3`

### Scenario 2.4: 有活躍 agent 時顯示 activeAgents
- **Given** 有效的 `session_id`
- **And** workflow.json 的 `activeAgents` 為 `{ "developer": { "stage": "DEV", "startedAt": "..." } }`
- **When** hook 腳本執行
- **Then** systemMessage 包含 `活躍 Agents：developer（DEV）`

### Scenario 2.5: 無活躍 agent 時省略 activeAgents 行
- **Given** 有效的 `session_id`
- **And** workflow.json 的 `activeAgents` 為空物件 `{}`
- **When** hook 腳本執行
- **Then** systemMessage 不包含 `活躍 Agents` 行

### Scenario 2.6: workflow.json 不存在時輸出空 result
- **Given** 有效的 `session_id`
- **And** 對應的 workflow.json 檔案不存在
- **When** hook 腳本執行
- **Then** stdout 輸出 `{"result":""}`
- **And** 不輸出任何 `systemMessage` 欄位
- **And** process exit code 為 0

---

## Feature 3: 有活躍 feature 時注入未完成任務清單

### Scenario 3.1: 有未完成任務時注入任務清單
- **Given** 有效的 `session_id` 且 workflow.json 存在
- **And** `specs/features/in-progress/` 下有一個活躍 feature `my-feature`
- **And** 該 feature 的 tasks.md 有 3 個未勾選任務和 2 個已勾選任務（共 5 個）
- **When** hook 腳本執行
- **Then** systemMessage 包含未完成任務段落
- **And** 顯示「Feature：my-feature（2/5 完成）」
- **And** 列出至多 5 個 `- [ ] TASK` 項目
- **And** 包含「→ 請使用 TaskCreate 重建以上任務的 TaskList，然後繼續執行。」

### Scenario 3.2: 未完成任務超過 5 個時截斷並顯示剩餘數量
- **Given** 有效的 `session_id` 且 workflow.json 存在
- **And** 活躍 feature 的 tasks.md 有 8 個未勾選任務
- **When** hook 腳本執行
- **Then** systemMessage 只顯示前 5 個未勾選任務
- **And** 顯示 `... 還有 3 個`

### Scenario 3.3: 所有任務已完成時不注入任務清單
- **Given** 有效的 `session_id` 且 workflow.json 存在
- **And** 活躍 feature 的 tasks.md 所有任務均已勾選（allChecked=true）
- **When** hook 腳本執行
- **Then** systemMessage 不包含未完成任務段落
- **And** systemMessage 仍包含 workflow 狀態摘要

### Scenario 3.4: 無活躍 feature 時不注入任務清單
- **Given** 有效的 `session_id` 且 workflow.json 存在
- **And** `specs/features/in-progress/` 目錄下沒有任何 feature
- **When** hook 腳本執行
- **Then** systemMessage 不包含未完成任務段落
- **And** systemMessage 包含 workflow 狀態摘要

### Scenario 3.5: specs 讀取失敗時跳過任務清單繼續輸出 workflow 摘要
- **Given** 有效的 `session_id` 且 workflow.json 存在
- **And** specs 目錄無讀取權限或格式損壞（specs.getActiveFeature 拋出例外）
- **When** hook 腳本執行
- **Then** stdout 仍輸出含 `systemMessage` 的 JSON（workflow 狀態摘要）
- **And** systemMessage 不包含未完成任務段落（跳過，不拋錯）
- **And** process exit code 為 0

---

## Feature 4: systemMessage 長度截斷保護

### Scenario 4.1: systemMessage 未超過 2000 字元時完整輸出
- **Given** 有效的 `session_id` 且 workflow.json 存在
- **And** 組裝後的 systemMessage 長度為 500 字元
- **When** hook 腳本執行
- **Then** stdout 的 systemMessage 與組裝結果完全一致
- **And** 不含截斷提示

### Scenario 4.2: systemMessage 超過 2000 字元時截斷並附提示
- **Given** 有效的 `session_id` 且 workflow.json 存在
- **And** 活躍 feature 有大量未完成任務，使 systemMessage 組裝後超過 2000 字元
- **When** hook 腳本執行
- **Then** stdout 的 systemMessage 長度不超過 2000 字元
- **And** systemMessage 末尾包含 `... (已截斷，完整狀態請查看 workflow.json)`

---

## Feature 5: timeline 事件 session:compact

### Scenario 5.1: 有 workflow 時正確 emit session:compact 事件
- **Given** 有效的 `session_id`
- **And** workflow.json 存在，`workflowType` 為 `quick`，`currentStage` 為 `REVIEW`
- **When** hook 腳本執行
- **Then** timeline.jsonl 新增一筆 `session:compact` 事件
- **And** 事件包含 `workflowType: "quick"`
- **And** 事件包含 `currentStage: "REVIEW"`
- **And** 事件包含 `ts`（ISO 8601 時間戳）和 `category: "session"`

### Scenario 5.2: session:compact 是已知的 registry timeline 事件
- **Given** registry.js 的 `timelineEvents`
- **When** 查詢 `session:compact` 鍵
- **Then** 回傳 `{ label: 'Context 壓縮', category: 'session' }`
- **And** 不拋出「未知的 timeline 事件類型」錯誤

### Scenario 5.3: 無 workflow 時不 emit timeline 事件
- **Given** 有效的 `session_id`
- **And** workflow.json 不存在
- **When** hook 腳本執行
- **Then** timeline.jsonl 不新增 `session:compact` 事件

---

## Feature 6: 任何失敗 fallback 到 { result: '' }

### Scenario 6.1: workflow.json JSON 損壞時 fallback 到空 result
- **Given** 有效的 `session_id`
- **And** workflow.json 存在但內容為無效 JSON（如 `{broken`）
- **When** hook 腳本執行
- **Then** stdout 輸出 `{"result":""}`
- **And** process exit code 為 0（不阻擋 compaction）

### Scenario 6.2: timeline.emit 拋出例外時 fallback 到空 result
- **Given** 有效的 `session_id` 且 workflow.json 存在
- **And** timeline emit 因磁碟滿或權限問題拋出例外
- **When** hook 腳本執行
- **Then** safeRun 攔截例外
- **And** stdout 輸出 `{"result":""}`
- **And** process exit code 為 0

### Scenario 6.3: 整個 hook 邏輯拋出未預期例外時 fallback
- **Given** 任何導致 hook 主邏輯拋出未捕獲例外的情況
- **When** hook 腳本執行
- **Then** safeRun 攔截例外並寫入 stderr（含 `[overtone/safeRun]` 前綴）
- **And** stdout 輸出 `{"result":""}`
- **And** process exit code 為 0

---

## Feature 7: buildPendingTasksMessage 共用函式

### Scenario 7.1: 有未完成任務時回傳格式化訊息字串
- **Given** `buildPendingTasksMessage(projectRoot)` 被呼叫
- **And** projectRoot 下有活躍 feature，有 3 個未完成任務
- **When** 函式執行
- **Then** 回傳非 null 字串
- **And** 字串包含 `📋 **未完成任務**`
- **And** 字串包含 `Feature：{name}（{checked}/{total} 完成）`
- **And** 字串包含至多 5 個 `- [ ] ` 任務項目

### Scenario 7.2: 無活躍 feature 時回傳 null
- **Given** `buildPendingTasksMessage(projectRoot)` 被呼叫
- **And** projectRoot 下無任何 in-progress feature
- **When** 函式執行
- **Then** 回傳 `null`

### Scenario 7.3: 所有任務已完成時回傳 null
- **Given** `buildPendingTasksMessage(projectRoot)` 被呼叫
- **And** 活躍 feature 的所有任務均已勾選
- **When** 函式執行
- **Then** 回傳 `null`

### Scenario 7.4: specs 讀取拋出例外時回傳 null 而非拋出
- **Given** `buildPendingTasksMessage(projectRoot)` 被呼叫
- **And** specs.getActiveFeature 拋出例外
- **When** 函式執行
- **Then** 函式內部 try/catch 攔截例外
- **And** 回傳 `null`

---

## Feature 8: on-start.js 改用 buildPendingTasksMessage 後行為不變

### Scenario 8.1: SessionStart 有未完成任務時 systemMessage 格式與重構前相同
- **Given** SessionStart hook 被觸發（session 開始）
- **And** 活躍 feature 有 3 個未完成任務（0/3 待完成，共 3）
- **When** on-start.js 使用 `buildPendingTasksMessage` 替代原有內聯邏輯
- **Then** 輸出的 `systemMessage` 內容與重構前完全一致
- **And** 包含 `📋 **未完成任務（上次 session 中斷）**`
- **And** 包含任務清單與 `→ 請使用 TaskCreate 重建以上任務的 TaskList，然後繼續執行。`

### Scenario 8.2: SessionStart 無活躍 feature 時不輸出 systemMessage
- **Given** SessionStart hook 被觸發
- **And** 無任何 in-progress feature
- **When** on-start.js 使用 `buildPendingTasksMessage`
- **Then** 輸出 JSON 不含 `systemMessage` 欄位（與重構前行為相同）

### Scenario 8.3: SessionStart 的 featureName 同步邏輯不受重構影響
- **Given** SessionStart hook 被觸發
- **And** 有活躍 feature `my-feature`
- **And** workflow.json 存在但 `featureName` 為 null
- **When** on-start.js 執行
- **Then** `state.setFeatureName` 仍被呼叫（featureName 同步邏輯保留）
- **And** workflow.json 的 `featureName` 被更新為 `my-feature`
