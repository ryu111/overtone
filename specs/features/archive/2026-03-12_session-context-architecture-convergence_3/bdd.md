# Feature: SessionContext 架構收斂重構

> 重構的 BDD spec 聚焦在「行為不變」驗證：確保各階段遷移後，相同 input 產生相同 output。
> 不驗證內部實作（路徑變數名稱、中間變數），只驗證可觀測行為。

---

## Feature 1: Handler SessionContext 遷移後行為不變

> 驗證 6 個 handler 遷移至 SessionContext 後，行為與原始實作一致。

### Scenario 1-1: on-submit-handler 讀取 workflow state 行為不變
GIVEN 一個存在 workflow.json 的 session 目錄（含 featureName 和 currentStage）
AND input 物件含有效的 session_id 和 cwd
WHEN 呼叫 handleOnSubmit(input) 後讀取 workflow state
THEN 讀取到的 featureName 和 currentStage 與直接呼叫 state.readStateCtx(ctx) 一致

### Scenario 1-2: on-submit-handler 無活躍 workflow 時早期返回
GIVEN session 目錄存在但無 active-workflow-id 檔案
WHEN 呼叫 handleOnSubmit(input)
THEN 函式不拋出錯誤
AND 回傳結果不含 hookSpecificOutput

### Scenario 1-3: on-submit-handler input 為空路徑時不崩潰
GIVEN input 物件的 cwd 為空字串或缺失
WHEN 呼叫 handleOnSubmit(input)
THEN 函式不拋出例外（最多記錄 hookError 或靜默返回 {}）

---

### Scenario 1-4: session-start-handler sanitize 行為不變
GIVEN 一個含有 invalidStage（舊格式）的 workflow.json
AND input 含有效 session_id 和 cwd
WHEN 呼叫 handleSessionStart(input)
THEN sanitizeCtx 回傳的 fixed 數量與舊 sanitize(projectRoot, sessionId) 一致
AND sanitize 修正後的 workflow.json 內容與舊 API 結果相同

### Scenario 1-5: session-start-handler 已健康 session 不觸發 sanitize
GIVEN 一個格式正確的 workflow.json（currentStage 存在於 stages 中）
WHEN 呼叫 handleSessionStart(input)
THEN sanitizeCtx 回傳 null（無需修正）
AND timeline 有 stage:start 事件被 emit

### Scenario 1-6: session-start-handler session 不存在時不崩潰
GIVEN input 含 session_id 但對應 session 目錄不存在
WHEN 呼叫 handleSessionStart(input)
THEN 函式不拋出例外

---

### Scenario 1-7: session-end-handler timeline emit 行為不變
GIVEN 一個含多個 stage 事件的 timeline.jsonl
AND input 含有效 session_id 和 cwd
WHEN 呼叫 handleSessionEnd(input)
THEN timeline 中新增的事件 type 和 sessionId 與預期一致

### Scenario 1-8: session-end-handler observations 處理行為不變
GIVEN observations.jsonl 含有 2 筆已記錄的 observation
AND workflow state 的 appliedObservationIds 為空
WHEN 呼叫 handleSessionEnd(input)
THEN 回傳結果包含 observations 注入到 additionalContext 的內容

### Scenario 1-9: session-end-handler 無 workflow state 時不崩潰
GIVEN session 目錄存在但 workflow.json 不存在
WHEN 呼叫 handleSessionEnd(input)
THEN 函式不拋出例外

---

### Scenario 1-10: post-use-failure-handler timeline emit 行為不變
GIVEN 一個有效的 session 和 workflow 已初始化
AND input 含 tool_name 為 CRITICAL_TOOLS 之一（如 Bash）
WHEN 呼叫 handlePostUseFailure(input)
THEN timeline 中新增事件的 eventType 為 'tool:failure'
AND 事件資料含有 tool_name 欄位

### Scenario 1-11: post-use-failure-handler 非 CRITICAL_TOOLS 不 emit
GIVEN 一個有效的 session
AND input 含 tool_name 不在 CRITICAL_TOOLS 清單中
WHEN 呼叫 handlePostUseFailure(input)
THEN timeline 不新增任何事件

### Scenario 1-12: post-use-failure-handler 無 workflow 時不崩潰
GIVEN session 存在但無 active-workflow-id
WHEN 呼叫 handlePostUseFailure(input)
THEN 函式不拋出例外

---

### Scenario 1-13: pre-compact-handler state 讀取行為不變
GIVEN 一個已初始化的 workflow（featureName = 'test-feature'）
AND input 含有效 session_id 和 cwd
WHEN 呼叫 handlePreCompact(input)
THEN 讀取到的 state.featureName 與 state.readStateCtx(ctx).featureName 一致

### Scenario 1-14: pre-compact-handler 更新 compactCount 行為不變
GIVEN compact-count.json 不存在（首次 compact）
WHEN 呼叫 handlePreCompact(input)
THEN compact-count.json 被建立且 count 為 1

### Scenario 1-15: pre-compact-handler 無 workflow 時不崩潰
GIVEN session 存在但 workflow.json 不存在
WHEN 呼叫 handlePreCompact(input)
THEN 函式不拋出例外

---

## Feature 2: state.js Ctx API 等價性

> 驗證每個 Ctx 函式與對應舊 overload 函式對同一資料回傳相同結果。

### Scenario 2-1: readStateCtx 與舊 readState 回傳相同資料
GIVEN 一個已存在的 workflow.json（含 currentStage、stages 等欄位）
WHEN 分別呼叫 readStateCtx(ctx) 和 readState(projectRoot, sessionId, workflowId)
THEN 兩者回傳的 JSON.stringify 結果完全相同

### Scenario 2-2: initStateCtx 與舊 initState 產生相同初始狀態
GIVEN 相同的 workflowType('quick') 和 stageList(['DEV', 'REVIEW'])
WHEN 分別呼叫 initStateCtx(ctx, 'quick', stageList) 和 initState(sessionId, workflowId, 'quick', stageList)
THEN 兩者回傳的 state 物件的 stages 結構、currentStage、status 相同（排除時間戳）

### Scenario 2-3: writeStateCtx 與舊 writeState 寫入相同內容
GIVEN 一個 state 物件
WHEN 分別用 writeStateCtx(ctx, state) 和 writeState(projectRoot, sessionId, workflowId, state) 寫入兩個不同目錄
THEN 兩個目錄的 workflow.json 內容完全相同

### Scenario 2-4: updateStageCtx 與舊 updateStage 更新結果相同
GIVEN 一個已初始化的 workflow state（DEV 階段 pending）
WHEN 分別用 updateStageCtx(ctx, 'DEV', { status: 'completed' }) 和舊 updateStage
THEN 兩者更新後讀回的 stages.DEV.status 均為 'completed'

### Scenario 2-5: sanitizeCtx 與舊 sanitize 修正相同問題
GIVEN 一個 currentStage 指向不存在 stage 的 workflow.json
WHEN 分別用 sanitizeCtx(ctx) 和舊 sanitize(projectRoot, sessionId)
THEN 兩者的 fixed 數量相同，修正後的 currentStage 相同

### Scenario 2-6: setFeatureNameCtx 與舊 setFeatureName 寫入相同值
GIVEN 一個已初始化的 workflow state
WHEN 分別用 setFeatureNameCtx(ctx, 'my-feature') 和舊 setFeatureName
THEN 讀回的 featureName 均為 'my-feature'

### Scenario 2-7: updateStateAtomicCtx 與舊 updateStateAtomic 保持原子性
GIVEN 一個已存在的 workflow.json
WHEN 用 updateStateAtomicCtx(ctx, modifier) 修改 status 為 'completed'
THEN 讀回的 state.status 為 'completed'
AND 操作過程中 modifier 只執行一次（無競爭條件下）

---

## Feature 3: timeline.js Ctx API 等價性

> 驗證 Ctx 版函式與舊 overload 版行為一致。

### Scenario 3-1: emitCtx 與舊 emit 寫入相同格式事件
GIVEN 一個空的 timeline.jsonl
WHEN 分別用 emitCtx(ctx, 'stage:start', { agentName: 'tester' }) 和舊 emit 寫入不同目錄
THEN 兩個 timeline.jsonl 的第一行事件（排除 timestamp 和 id）結構相同
AND 兩筆事件的 eventType 均為 'stage:start'

### Scenario 3-2: queryCtx 與舊 query 回傳相同事件集合
GIVEN 一個含 3 個 'stage:start' 和 2 個 'stage:complete' 事件的 timeline.jsonl
WHEN 分別用 queryCtx(ctx, { type: 'stage:start' }) 和舊 query 篩選
THEN 兩者回傳陣列的長度均為 3
AND 每個事件的 eventType 和 agentName 相同

### Scenario 3-3: countCtx 與舊 count 回傳相同數量
GIVEN 一個含 5 個 'tool:use' 事件的 timeline.jsonl
WHEN 分別用 countCtx(ctx, { type: 'tool:use' }) 和舊 count 計算
THEN 兩者均回傳 5

### Scenario 3-4: latestCtx 與舊 latest 回傳相同最後事件
GIVEN 一個含多個 'stage:complete' 事件的 timeline.jsonl
WHEN 分別用 latestCtx(ctx, 'stage:complete') 和舊 latest 查詢
THEN 兩者回傳的事件 timestamp 相同
AND 兩者回傳的事件 data 內容相同

### Scenario 3-5: passAtKCtx 與舊 passAtK 計算相同通過率
GIVEN 一個含完整 stage:start / stage:complete 事件序列的 timeline.jsonl
WHEN 分別用 passAtKCtx(ctx) 和舊 passAtK 計算
THEN 兩者回傳的 overall.pass1Rate 和 pass3Rate 相同

### Scenario 3-6: trimIfNeededCtx 超過上限時裁剪行為不變
GIVEN 一個含 1200 行事件的 timeline.jsonl（超過裁剪上限）
WHEN 呼叫 trimIfNeededCtx(ctx)
THEN timeline.jsonl 行數減少
AND 保留的是最新的事件（舊事件被刪除）

---

## Feature 4: alias 行為完全等同 Ctx API（Phase 3 過渡期）

> 驗證 Phase 3 加的 alias（`readState = readStateCtx`）與 Ctx API 行為一致。

### Scenario 4-1: alias readState 與 readStateCtx 回傳相同結果
GIVEN state.readState 指向 readStateCtx（alias）
AND 一個已存在的 workflow.json
WHEN 分別呼叫 state.readState(ctx) 和 state.readStateCtx(ctx)
THEN 兩者回傳值的 JSON.stringify 完全相同

### Scenario 4-2: alias initState 與 initStateCtx 產生相同初始 state
GIVEN state.initState 指向 initStateCtx（alias）
WHEN 分別呼叫 state.initState(ctx, 'quick', ['DEV']) 和 state.initStateCtx(ctx, 'quick', ['DEV'])
THEN 兩者回傳的 state 結構相同（排除時間戳）

### Scenario 4-3: alias emit 與 emitCtx 寫入相同格式
GIVEN timeline.emit 指向 emitCtx（alias）
WHEN 分別呼叫 timeline.emit(ctx, 'stage:start', {}) 和 timeline.emitCtx(ctx, 'stage:start', {})
THEN 兩者寫入的事件結構相同

### Scenario 4-4: 舊 overload 格式呼叫 alias 時拋出型別錯誤
GIVEN state.readState 指向 readStateCtx（alias，只接受 ctx 物件）
WHEN 以舊格式呼叫 state.readState(projectRoot, sessionId, workflowId)（字串參數）
THEN 函式拋出 TypeError 或回傳 null（不靜默成功）

---

## Feature 5: session-factory 測試工廠

> 驗證 session-factory 提供的工廠函式行為正確，可作為測試的標準建立方式。

### Scenario 5-1: makeTmpProject 建立獨立隔離目錄
GIVEN 呼叫 makeTmpProject() 兩次
WHEN 比較兩個回傳路徑
THEN 兩個路徑不同（互相隔離）
AND 兩個目錄都實際存在於 tmpdir

### Scenario 5-2: createCtx 建立有效的 SessionContext
GIVEN projectRoot = makeTmpProject() 的回傳值
WHEN 呼叫 createCtx(projectRoot)
THEN 回傳的 ctx 是 SessionContext 實例
AND ctx.sessionDir() 對應的目錄存在

### Scenario 5-3: createCtx 不指定 sessionId 時自動產生唯一 ID
GIVEN 同一 projectRoot 呼叫 createCtx() 兩次
WHEN 比較兩次回傳的 ctx.sessionId
THEN 兩個 sessionId 不同

### Scenario 5-4: setupWorkflow 與直接呼叫 initStateCtx 產生相同結果
GIVEN ctx = createCtx(projectRoot)
AND workflowType = 'quick'，stageList = ['DEV', 'REVIEW']
WHEN 分別用 setupWorkflow(ctx, 'quick', ['DEV', 'REVIEW']) 和直接呼叫 state.initStateCtx(ctx, 'quick', ['DEV', 'REVIEW'])（不同的 ctx）
THEN 兩者回傳的 state 物件的 stages、currentStage、status 完全相同（排除時間戳）

### Scenario 5-5: cleanupProject 清理後目錄不存在
GIVEN projectRoot = makeTmpProject() 且目錄存在
WHEN 呼叫 cleanupProject(projectRoot)
THEN 對應目錄不再存在於 filesystem

### Scenario 5-6: cleanupProject 傳入 null 時不崩潰
GIVEN cleanupProject 被呼叫且參數為 null 或 undefined
WHEN 執行 cleanupProject(null)
THEN 函式不拋出例外

### Scenario 5-7: setupWorkflow 回傳的 state 可被後續 readStateCtx 讀取
GIVEN ctx = createCtx(projectRoot)
AND setupWorkflow(ctx, 'standard', ['PLAN', 'DEV', 'REVIEW']) 已執行
WHEN 呼叫 state.readStateCtx(ctx)
THEN 讀回的 state 與 setupWorkflow 回傳值的 stages、currentStage 一致
