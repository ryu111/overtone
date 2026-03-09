# Feature: queue-workflowid-integration

## 背景

佇列系統（execution-queue.js）與 workflow 狀態（state.js）之間目前缺乏雙向關聯，
造成 guardDiscoveryMode 讀錯路徑、_isRelatedQueueItem 過鬆匹配、queue item 無 workflowId 欄位等問題。

---

## Feature A: guardDiscoveryMode 讀取正確的 workflow state

### Scenario A-1: activeWorkflowId 存在時讀取正確的 workflow state（C1）
GIVEN 一個 discovery workflow 已初始化，且 active-workflow-id 檔案存在
WHEN guardDiscoveryMode 被呼叫
THEN 它讀取 activeWorkflowId 並用 state.readState(sessionId, workflowId) 讀正確路徑
AND 不是讀舊的根層 workflow.json

### Scenario A-2: activeWorkflowId 不存在時放行（C1 邊界）
GIVEN CLAUDE_SESSION_ID 存在但 active-workflow-id 檔案不存在
WHEN guardDiscoveryMode 被呼叫
THEN workflowId 為 null
AND readState(sessionId, null) 讀根層路徑（通常回傳 null）
AND 放行（不 process.exit）

### Scenario A-3: workflowType 非 discovery 時放行
GIVEN 當前 workflow 類型為 'quick'（非 discovery）
WHEN guardDiscoveryMode 被呼叫
THEN 不阻擋
AND 不輸出 error 訊息

---

## Feature B: guardDiscoveryMode PM 完成後放行（m3）

### Scenario B-1: PM stage 仍在進行時阻擋
GIVEN discovery workflow 的 currentStage 為 'PM'（PM 正在進行）
WHEN queue add 被呼叫（不帶 --force）
THEN process.exit(1) 被呼叫
AND 輸出 discovery 模式不允許的錯誤訊息

### Scenario B-2: PM stage 完成後放行
GIVEN discovery workflow 的 currentStage 為 'PM' 以外（如 null 或 'DEV'，PM 已完成）
WHEN guardDiscoveryMode 被呼叫
THEN 不阻擋（放行）
AND 不呼叫 process.exit

### Scenario B-3: --force 旗標跳過所有檢查
GIVEN discovery workflow 的 currentStage 為 'PM'（會正常阻擋）
WHEN guardDiscoveryMode 以 forceFlag=true 呼叫
THEN 立即 return，不讀取任何 state
AND 不呼叫 process.exit

---

## Feature C: updateWorkflowId API（M1）

### Scenario C-1: 成功回寫 workflowId 到 in_progress 佇列項目
GIVEN 一個佇列存在，且有一個 in_progress 的項目名為 'feature-a'
WHEN updateWorkflowId(projectRoot, 'feature-a', 'wf-123') 被呼叫
THEN 回傳 { ok: true }
AND queue.items 中 name === 'feature-a' 的項目 workflowId 被設定為 'wf-123'

### Scenario C-2: 成功回寫 workflowId 到 pending 佇列項目
GIVEN 一個佇列存在，且有一個 pending 的項目名為 'feature-b'
WHEN updateWorkflowId(projectRoot, 'feature-b', 'wf-456') 被呼叫
THEN 回傳 { ok: true }
AND queue.items 中 name === 'feature-b' 的項目 workflowId 為 'wf-456'

### Scenario C-3: 佇列不存在時回傳 QUEUE_NOT_FOUND
GIVEN 指定的 projectRoot 下沒有執行佇列
WHEN updateWorkflowId(projectRoot, 'feature-a', 'wf-123') 被呼叫
THEN 回傳 { ok: false, error: 'QUEUE_NOT_FOUND' }

### Scenario C-4: 佇列項目不存在時回傳 ITEM_NOT_FOUND
GIVEN 佇列存在，但沒有 name === 'nonexistent' 的項目
WHEN updateWorkflowId(projectRoot, 'nonexistent', 'wf-123') 被呼叫
THEN 回傳 { ok: false, error: 'ITEM_NOT_FOUND' }

### Scenario C-5: 其他佇列項目的 workflowId 不受影響
GIVEN 佇列有兩個項目 'feature-a' 和 'feature-b'
WHEN updateWorkflowId(projectRoot, 'feature-a', 'wf-123') 被呼叫
THEN feature-a 的 workflowId 為 'wf-123'
AND feature-b 的 workflowId 未被修改（undefined）

---

## Feature D: failCurrent name 精確匹配（M2 相關）

### Scenario D-1: 提供正確 name 時成功標記失敗
GIVEN 一個 in_progress 的佇列項目名為 'feature-a'
WHEN failCurrent(projectRoot, 'some reason', 'feature-a') 被呼叫
THEN 回傳 true
AND 該項目 status 變為 'failed'
AND 該項目 failReason 為 'some reason'

### Scenario D-2: 提供錯誤 name 時回傳 false
GIVEN 一個 in_progress 的佇列項目名為 'feature-a'
WHEN failCurrent(projectRoot, 'reason', 'wrong-name') 被呼叫
THEN 回傳 false
AND 該項目 status 維持 'in_progress'（不被修改）

### Scenario D-3: 不提供 name 時向後相容（匹配任何 in_progress）
GIVEN 一個 in_progress 的佇列項目名為 'feature-a'
WHEN failCurrent(projectRoot, 'reason') 被呼叫（不傳第三個參數）
THEN 回傳 true
AND 該項目 status 變為 'failed'

### Scenario D-4: 無 in_progress 項目時回傳 false
GIVEN 佇列只有 pending 項目（沒有 in_progress）
WHEN failCurrent(projectRoot, 'reason', 'feature-a') 被呼叫
THEN 回傳 false

---

## Feature E: _isRelatedQueueItem 精確匹配（m1）

### Scenario E-1: 相同名稱（normalize 後）匹配成功
GIVEN 佇列項目名稱為 'auth-feature'，featureName 為 'auth-feature'
WHEN _isRelatedQueueItem 被呼叫
THEN 回傳 true

### Scenario E-2: 大小寫不同但 normalize 後相同時匹配成功
GIVEN 佇列項目名稱為 'Auth-Feature'，featureName 為 'auth_feature'
WHEN _isRelatedQueueItem 被呼叫
THEN 回傳 true（normalize 後均為 'authfeature'）

### Scenario E-3: 子字串關係不再匹配（精確匹配修復）
GIVEN 佇列項目名稱為 'auth'，featureName 為 'oauth-refactor'
WHEN _isRelatedQueueItem 被呼叫
THEN 回傳 false（精確匹配 'auth' !== 'oauthrefactor'）

### Scenario E-4: 舊邏輯的 false positive 案例：'newkuji' vs 'kuji'
GIVEN 佇列項目名稱為 'new-kuji'，featureName 為 'kuji'
WHEN _isRelatedQueueItem 被呼叫
THEN 回傳 false（精確匹配 'newkuji' !== 'kuji'）

### Scenario E-5: name 或 featureName 為空時回傳 false
GIVEN 佇列項目名稱為空字串，featureName 為 'feature-a'
WHEN _isRelatedQueueItem 被呼叫
THEN 回傳 false

### Scenario E-6: 完全相同（無分隔符差異）匹配成功
GIVEN 佇列項目名稱為 'queue-workflowid-integration'，featureName 為 'queue-workflowid-integration'
WHEN _isRelatedQueueItem 被呼叫
THEN 回傳 true

---

## Feature F: init-workflow.js 回寫 workflowId（m2）

### Scenario F-1: featureName 存在且佇列有匹配項目時回寫成功
GIVEN featureName 為 'my-feature' 且佇列中有 name === 'my-feature' 的 pending 項目
WHEN init-workflow.js 執行完畢（workflowId 已生成）
THEN executionQueue.updateWorkflowId 被呼叫，傳入 featureName 和新生成的 workflowId
AND 該佇列項目的 workflowId 被正確設定

### Scenario F-2: featureName 不存在時跳過回寫
GIVEN featureName 未提供（argv[4] 為 undefined）
WHEN init-workflow.js 執行
THEN updateWorkflowId 不被呼叫
AND workflow 正常初始化完成（不因跳過回寫而失敗）

### Scenario F-3: 佇列不存在時靜默忽略
GIVEN featureName 為 'my-feature' 但當前 projectRoot 下沒有執行佇列
WHEN init-workflow.js 執行
THEN updateWorkflowId 回傳 QUEUE_NOT_FOUND
AND workflow 仍然正常初始化完成（失敗不影響主流程）

### Scenario F-4: 回寫時序正確（在 state.initState 之前）
GIVEN 一個完整的 init-workflow.js 執行流程
WHEN 執行順序被檢查
THEN updateWorkflowId 在 state.initState 呼叫之前執行
AND workflowId 生成後立即回寫到佇列
