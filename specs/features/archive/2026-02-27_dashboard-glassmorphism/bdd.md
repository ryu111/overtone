# Feature: Dashboard Glassmorphism 重設計

## 背景

Overtone Dashboard 從兩頁式（`index.html` + `session.html`）重設計為單頁 SPA（`dashboard.html`），採用 Alpine.js 管理狀態，JS 拆分為 3 個模組（`pipeline.js` / `timeline.js` / `confetti.js`），後端 `/api/registry` 擴充 `parallelGroupDefs` 與每個 workflow 的 `parallelGroups` 欄位。

---

## Feature 1: `buildPipelineSegments()` 純函式

### Scenario 1-1: 空 stages 回傳空陣列
GIVEN `stages` 為空物件 `{}`
AND `workflowType` 為任意字串（例如 `'single'`）
AND `parallelGroupDefs` 為完整的群組定義
AND `workflowParallelGroups` 為完整的 workflow-to-groups 映射
WHEN 呼叫 `buildPipelineSegments({}, 'single', parallelGroupDefs, workflowParallelGroups)`
THEN 回傳 `[]`

### Scenario 1-2: 線性序列（無並行群組）回傳全部 stage 型 segment
GIVEN `stages` 為 `{ DEV: { status: 'pending' } }`
AND `workflowType` 為 `'single'`
AND `workflowParallelGroups['single']` 為 `[]`（無並行群組）
WHEN 呼叫 `buildPipelineSegments(stages, 'single', parallelGroupDefs, workflowParallelGroups)`
THEN 回傳長度為 1 的陣列
AND 回傳的第一個元素 `type` 為 `'stage'`
AND 回傳的第一個元素 `key` 為 `'DEV'`
AND 回傳的第一個元素 `stage` 等於 `stages['DEV']`

### Scenario 1-3: 標準 workflow 含並行群組，REVIEW 和 TEST:2 被合併
GIVEN `stages` 為 `{ PLAN, ARCH, TEST, DEV, REVIEW, 'TEST:2', RETRO, DOCS }`（依此順序）
AND `workflowType` 為 `'standard'`
AND `parallelGroupDefs` 為 `{ quality: ['REVIEW', 'TEST'], verify: ['QA', 'E2E'] }`
AND `workflowParallelGroups['standard']` 為 `['quality']`
WHEN 呼叫 `buildPipelineSegments(stages, 'standard', parallelGroupDefs, workflowParallelGroups)`
THEN 回傳長度為 7 的陣列
AND 前 4 個 segment type 均為 `'stage'`，key 依序為 `'PLAN'`、`'ARCH'`、`'TEST'`、`'DEV'`
AND 第 5 個 segment type 為 `'parallel'`，groupName 為 `'quality'`
AND 第 5 個 segment 的 `stages` 陣列長度為 2，key 依序為 `'REVIEW'`、`'TEST:2'`
AND 第 6、7 個 segment type 為 `'stage'`，key 依序為 `'RETRO'`、`'DOCS'`

### Scenario 1-4: DEV 前的 TEST 不被納入 quality 並行群組
GIVEN `stages` 為 `{ PLAN, ARCH, TEST, DEV, REVIEW, 'TEST:2', RETRO, DOCS }`（standard workflow）
AND `workflowType` 為 `'standard'`
AND `parallelGroupDefs['quality']` 為 `['REVIEW', 'TEST']`
WHEN 呼叫 `buildPipelineSegments(stages, 'standard', parallelGroupDefs, workflowParallelGroups)`
THEN DEV 前的 `'TEST'` segment type 為 `'stage'`（非 parallel）
AND DEV 後的 `'TEST:2'` 被納入 type 為 `'parallel'` 的 segment

### Scenario 1-5: full workflow 含多個並行群組
GIVEN `stages` 為 `{ PLAN, ARCH, DESIGN, TEST, DEV, REVIEW, 'TEST:2', QA, E2E, RETRO, DOCS }`（依此順序）
AND `workflowType` 為 `'full'`
AND `parallelGroupDefs` 為 `{ quality: ['REVIEW', 'TEST'], verify: ['QA', 'E2E'] }`
AND `workflowParallelGroups['full']` 為 `['quality', 'verify']`
WHEN 呼叫 `buildPipelineSegments(stages, 'full', parallelGroupDefs, workflowParallelGroups)`
THEN 存在一個 type 為 `'parallel'`、groupName 為 `'quality'` 的 segment，包含 `REVIEW` 和 `TEST:2`
AND 存在一個 type 為 `'parallel'`、groupName 為 `'verify'` 的 segment，包含 `QA` 和 `E2E`

### Scenario 1-6: 未知 workflow type（parallelGroups 缺失）回傳全部 stage 型 segment
GIVEN `stages` 為 `{ DEV: { status: 'pending' }, REVIEW: { status: 'pending' } }`
AND `workflowType` 為 `'unknown-workflow'`
AND `workflowParallelGroups` 中不含 `'unknown-workflow'` 的 key
WHEN 呼叫 `buildPipelineSegments(stages, 'unknown-workflow', parallelGroupDefs, workflowParallelGroups)`
THEN 回傳長度為 2 的陣列
AND 兩個 segment 的 type 均為 `'stage'`

### Scenario 1-7: stage key 含冒號後綴（如 TEST:2）以 baseName 比對群組成員
GIVEN stage key 為 `'TEST:2'`
AND `parallelGroupDefs['quality']` 包含 `'TEST'`（不含 `:2`）
AND 該 stage 出現在 DEV 之後
WHEN `buildPipelineSegments` 進行群組成員比對
THEN `'TEST:2'` 的 baseName `'TEST'` 命中 quality 群組
AND `'TEST:2'` 被歸入 type 為 `'parallel'` 的 segment

---

## Feature 2: `/api/registry` 回傳結構擴充

### Scenario 2-1: `/api/registry` 回傳包含 `parallelGroupDefs` 欄位
GIVEN Dashboard server 已啟動
WHEN 發送 `GET /api/registry` 請求
THEN 回應狀態碼為 200
AND 回應 Content-Type 包含 `application/json`
AND 回應 body 包含 `parallelGroupDefs` 欄位
AND `parallelGroupDefs` 為物件，至少包含 `quality`、`verify`、`secure-quality` 三個群組
AND `parallelGroupDefs.quality` 為包含 `'REVIEW'` 和 `'TEST'` 的陣列
AND `parallelGroupDefs.verify` 為包含 `'QA'` 和 `'E2E'` 的陣列
AND `parallelGroupDefs['secure-quality']` 為包含 `'REVIEW'`、`'TEST'`、`'SECURITY'` 的陣列

### Scenario 2-2: `/api/registry` 回傳的 `workflows` 每條含 `parallelGroups` 欄位
GIVEN Dashboard server 已啟動
WHEN 發送 `GET /api/registry` 請求
THEN 回應 body 的 `workflows` 中每個 workflow 物件都含有 `parallelGroups` 欄位
AND `workflows.standard.parallelGroups` 為包含 `'quality'` 的陣列
AND `workflows.full.parallelGroups` 包含 `'quality'` 和 `'verify'`
AND `workflows.single.parallelGroups` 為空陣列 `[]`

### Scenario 2-3: `/api/registry` 回傳的 `stages` 結構保持不變
GIVEN Dashboard server 已啟動
WHEN 發送 `GET /api/registry` 請求
THEN 回應 body 包含 `stages` 欄位
AND `stages` 中每個 stage 物件含有 `label`、`emoji`、`color`、`agent` 四個屬性

### Scenario 2-4: `/api/registry` 的 `workflows` 包含 `label` 欄位（向後相容）
GIVEN Dashboard server 已啟動
WHEN 發送 `GET /api/registry` 請求
THEN 每個 workflow 物件同時包含 `label` 和 `parallelGroups` 欄位
AND `workflows.standard.label` 為非空字串

---

## Feature 3: `GET /` 路由 serve `dashboard.html`

### Scenario 3-1: `GET /` 回傳 dashboard.html 內容
GIVEN Dashboard server 已啟動
AND `plugins/overtone/web/dashboard.html` 檔案存在
WHEN 發送 `GET /` 請求
THEN 回應狀態碼為 200
AND 回應 Content-Type 包含 `text/html`
AND 回應 body 包含 `dashboard.html` 的內容（非空 HTML）

### Scenario 3-2: `GET /` 回傳的 HTML 不含 SSR template 替換標記
GIVEN Dashboard server 已啟動
WHEN 發送 `GET /` 請求
THEN 回應 body 不含 `{{SESSION_ID}}` 等 template 標記
AND 回應 body 不含未展開的 mustache 語法

### Scenario 3-3: 靜態 JS 模組路由可正確取得
GIVEN Dashboard server 已啟動
AND `plugins/overtone/web/js/pipeline.js` 存在
AND `plugins/overtone/web/js/timeline.js` 存在
AND `plugins/overtone/web/js/confetti.js` 存在
WHEN 分別發送 `GET /js/pipeline.js`、`GET /js/timeline.js`、`GET /js/confetti.js`
THEN 三個請求的回應狀態碼均為 200
AND 回應 Content-Type 包含 `application/javascript`

### Scenario 3-4: 移除 `/s/:sessionId` 路由後回傳 404
GIVEN Dashboard server 已啟動（已移除獨立 session 頁面路由）
WHEN 發送 `GET /s/some-session-id` 請求
THEN 回應狀態碼為 404

---

## Feature 4: `fireConfetti()` 慶祝動畫

### Scenario 4-1: 首次呼叫產生 confetti 粒子 DOM
GIVEN 目前文件的 body 中不存在 `.confetti-overlay` 元素
AND `window.matchMedia('(prefers-reduced-motion: reduce)').matches` 為 false
WHEN 呼叫 `window.OT.fireConfetti()`
THEN body 中出現一個 `.confetti-overlay` 元素
AND `.confetti-overlay` 內包含粒子元素（預設 40 個）
AND 每個粒子都有 CSS animation 屬性（confetti-fall）

### Scenario 4-2: 動畫完成後自動清除 DOM
GIVEN `fireConfetti` 以 `duration: 100` 呼叫（短時間測試用）
WHEN 動畫 duration 過後（setTimeout 觸發）
THEN `.confetti-overlay` 從 body 中移除
AND body 中不再有 `.confetti-overlay` 元素

### Scenario 4-3: `prefers-reduced-motion` 為 true 時不產生粒子
GIVEN `window.matchMedia('(prefers-reduced-motion: reduce)').matches` 為 true
WHEN 呼叫 `window.OT.fireConfetti()`
THEN body 中不出現 `.confetti-overlay` 元素
AND 函式直接 return，無任何副作用

### Scenario 4-4: `confettiPlayed` flag 由 Alpine.js state 控制，防止重複觸發
GIVEN Alpine.js state 中 `confettiPlayed` 為 false
AND SSE 收到表示工作流完成的 timeline 事件
WHEN Dashboard 偵測到完成事件並呼叫 `fireConfetti()`
THEN `confettiPlayed` 被設為 true
AND 後續再次收到相同事件時，`confettiPlayed` 為 true 故不再呼叫 `fireConfetti()`

### Scenario 4-5: 可自訂粒子數量
GIVEN `prefers-reduced-motion` 為 false
WHEN 呼叫 `window.OT.fireConfetti({ count: 10 })`
THEN `.confetti-overlay` 內恰好包含 10 個粒子元素

---

## Feature 5: 多 session 切換時 SSE 管理

### Scenario 5-1: 切換 session 時舊 SSE 連線關閉，新 SSE 連線建立
GIVEN 使用者已選取 session A，`/sse/:sessionA` SSE 連線已建立（`readyState` 為 1）
WHEN 使用者點擊 sidebar 選取 session B（呼叫 `selectSession('session-B')`）
THEN 舊連線 `eventSource.close()` 被呼叫（`readyState` 變為 2）
AND 新 `EventSource('/sse/session-B')` 被建立
AND `selectedSessionId` 更新為 `'session-B'`

### Scenario 5-2: 切換 session 時狀態被清空
GIVEN 使用者已選取 session A，`workflow`、`events`、`passatk` 均有資料
WHEN 使用者切換到 session B（呼叫 `selectSession('session-B')`）
THEN `workflow` 被重設為 `{}`
AND `events` 被重設為 `[]`
AND `passatk` 被重設為 `null`
AND `confettiPlayed` 被重設為 `false`
AND `tab` 被重設為 `'overview'`

### Scenario 5-3: 重複點擊同一 session 不建立新連線
GIVEN 使用者已選取 session A，`selectedSessionId` 為 `'session-A'`
WHEN 使用者再次點擊 session A（呼叫 `selectSession('session-A')`）
THEN `disconnectSessionSSE()` 不被呼叫
AND `connectSessionSSE()` 不被呼叫
AND `eventSource` 維持原有連線不變

### Scenario 5-4: sidebar SSE（/sse/all）在切換 session 時保持連線
GIVEN sidebar SSE 已連線至 `/sse/all`，`sidebarConnected` 為 true
WHEN 使用者切換到 session B
THEN `allEventSource` 的連線不被關閉
AND sidebar SSE 保持 `readyState` 為 1

### Scenario 5-5: session SSE 收到 workflow 事件時更新 state
GIVEN 使用者已選取 session A，SSE 連線已建立
WHEN `/sse/session-A` 推送類型為 `workflow` 的 SSE 事件，資料為新的 `WorkflowState`
THEN `this.workflow` 被更新為新的 WorkflowState
AND `pipelineSegments` computed 值隨之更新

### Scenario 5-6: session SSE 斷線後重連指數退避
GIVEN session SSE 連線已建立
WHEN SSE `onerror` 事件觸發（網路斷線）
THEN 系統安排指數退避重連（首次 1s，之後 2s→4s→8s→16s，最多 5 次）
AND 重連目標為當前 `selectedSessionId` 對應的端點
AND 重連成功後 `_reconnectAttempts` 重設為 0

---

## Feature 6: Timeline 新事件 slide-in 動畫

### Scenario 6-1: SSE push 的新事件加入後有 `timeline-slide` class
GIVEN timeline 容器 `listEl` 已有若干 `.timeline-event` 元素
AND 新事件透過 SSE push 加入 Alpine.js `events` 陣列
WHEN Alpine.js DOM 更新後呼叫 `window.OT.animateNewEvent(listEl)`
THEN 容器中最後一個 `.timeline-event` 元素含有 `timeline-slide` class

### Scenario 6-2: 初次載入的歷史事件不加 `timeline-slide` class
GIVEN 使用者切換到 session，`fetchTimeline()` 一次性載入歷史事件
WHEN 歷史事件批次插入 DOM
THEN 所有歷史事件的 `.timeline-event` 元素均不含 `timeline-slide` class
AND `animateNewEvent()` 不被呼叫於歷史事件載入流程

### Scenario 6-3: `scrollToBottom()` 呼叫後捲動到容器底部
GIVEN timeline 容器 `listEl` 的 `scrollHeight` 大於 `clientHeight`（內容溢出）
WHEN 呼叫 `window.OT.scrollToBottom(listEl)`
THEN `listEl.scrollTop` 等於 `listEl.scrollHeight`

### Scenario 6-4: `animateNewEvent()` 對空容器安全執行（無 throw）
GIVEN timeline 容器 `listEl` 內無任何 `.timeline-event` 元素
WHEN 呼叫 `window.OT.animateNewEvent(listEl)`
THEN 函式正常 return，不拋出例外

### Scenario 6-5: `scrollToBottom()` 傳入 null 時安全執行（無 throw）
GIVEN `listEl` 為 `null`
WHEN 呼叫 `window.OT.scrollToBottom(null)`
THEN 函式正常 return，不拋出例外
