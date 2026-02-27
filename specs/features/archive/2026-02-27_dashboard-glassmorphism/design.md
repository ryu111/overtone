# Design: Dashboard Glassmorphism 重設計

## 技術摘要（What & Why）

- **方案**：合併 `index.html` + `session.html` 為單一 `dashboard.html`，採用 Alpine.js SPA 模式管理 sidebar session 列表 + main panel（Pipeline / Timeline / History）。JS 拆分為 3 個模組（`pipeline.js` / `timeline.js` / `confetti.js`），CSS 直接替換 `main.css`。
- **理由**：合併頁面消除首頁 → session 頁的全頁跳轉，SSE 連線可在切換 session 時無縫切換而非斷開重建。JS 拆分讓各模組職責清晰，可獨立測試。
- **取捨**：單一 HTML 檔略增首次載入大小，但 Dashboard 用途下可接受；CSS 不拆分多檔案，因 Glassmorphism 全部相互依賴（variables / animations / components 高耦合），單檔維護更簡單。

## API 介面設計

### `/api/registry` 擴充

```
GET /api/registry

// 現有回傳：
{
  stages: { [stageKey]: { label, emoji, color, agent } },
  workflows: { [key]: { label } },
  agents: { [name]: { model, color } },
}

// 擴充後回傳：
{
  stages: { [stageKey]: { label, emoji, color, agent } },      // 不變
  workflows: { [key]: { label, parallelGroups: string[] } },   // 新增 parallelGroups
  parallelGroupDefs: { [groupName]: string[] },                 // 新增
  agents: { [name]: { model, color } },                         // 不變
}

// 範例：
{
  workflows: {
    "standard": { label: "標準功能", parallelGroups: ["quality"] },
    "full":     { label: "完整功能", parallelGroups: ["quality", "verify"] },
    "single":   { label: "單步修改", parallelGroups: [] },
  },
  parallelGroupDefs: {
    "quality":        ["REVIEW", "TEST"],
    "verify":         ["QA", "E2E"],
    "secure-quality": ["REVIEW", "TEST", "SECURITY"],
  },
}
```

### `/api/sessions` 擴充

```
GET /api/sessions

// 回傳增加 workflowType 的關聯資料，sidebar 需要顯示
// 不變，現有 listSessions() 已回傳足夠欄位
```

### 路由調整

```
// 刪除
GET /s/:sessionId   →  移除（不再有獨立 session 頁面）

// 修改
GET /               →  serve dashboard.html（取代 index.html）
GET /index.html     →  redirect 或 serve dashboard.html

// 新增靜態檔案路徑
GET /js/pipeline.js
GET /js/timeline.js
GET /js/confetti.js
```

### SSE 端點（不變）

```
GET /sse/all          →  全 session 監聽（sidebar 列表即時更新）
GET /sse/:sessionId   →  單一 session 監聽（main panel 即時更新）
```

## 資料模型

### workflow.json（不變）

```typescript
interface WorkflowState {
  sessionId: string
  workflowType: string
  createdAt: string              // ISO 8601
  currentStage: string | null
  stages: Record<string, {
    status: 'pending' | 'active' | 'in-progress' | 'completed' | 'failed'
    result: 'pass' | 'fail' | 'reject' | null
    mode?: 'spec' | 'verify'    // TEST stage 限定
  }>
  activeAgents: Record<string, {
    stage: string
    startedAt: string
  }>
  failCount: number
  rejectCount: number
  retroCount: number
  featureName: string | null
}
```

### PipelineSegment（前端運算型別，不儲存）

```typescript
// pipeline.js 輸出的渲染結構
type PipelineSegment =
  | { type: 'stage', key: string, stage: StageState }
  | { type: 'parallel', groupName: string, stages: Array<{ key: string, stage: StageState }> }

// 範例：standard workflow → segments:
// [
//   { type: 'stage', key: 'PLAN', stage: {...} },
//   { type: 'stage', key: 'ARCH', stage: {...} },
//   { type: 'stage', key: 'TEST', stage: {...} },    // TEST:spec（DEV 前）
//   { type: 'stage', key: 'DEV', stage: {...} },
//   { type: 'parallel', groupName: 'quality', stages: [
//       { key: 'REVIEW', stage: {...} },
//       { key: 'TEST:2', stage: {...} },              // TEST:verify（DEV 後）
//   ]},
//   { type: 'stage', key: 'RETRO', stage: {...} },
//   { type: 'stage', key: 'DOCS', stage: {...} },
// ]
```

### SessionListItem（前端型別，從 /api/sessions 取得）

```typescript
interface SessionListItem {
  sessionId: string
  workflowType: string
  createdAt: string
  currentStage: string | null
  progress: { completed: number, total: number }
  isActive: boolean
  failCount: number
  rejectCount: number
}
```

## Alpine.js State 設計

### Root State (`dashboardState()`)

```javascript
function dashboardState() {
  return {
    // ── Sidebar 狀態 ──
    sessions: [],                  // SessionListItem[]，從 /api/sessions 載入
    selectedSessionId: null,       // 當前選中的 session ID
    allEventSource: null,          // SSE /sse/all 連線（sidebar 用）
    sidebarConnected: false,       // sidebar SSE 連線狀態

    // ── Main Panel 狀態 ──
    sessionId: null,               // 當前顯示的 session ID（= selectedSessionId）
    connected: false,              // session SSE 連線狀態
    eventSource: null,             // SSE /sse/:sessionId 連線
    tab: 'overview',               // 'overview' | 'timeline' | 'history'
    workflow: {},                   // WorkflowState
    events: [],                    // Timeline 事件陣列
    timelineFilter: '',            // 類別篩選
    passatk: null,                 // Pass@k 統計
    confettiPlayed: false,         // Confetti 防重複 flag
    durationTimer: null,           // 持續時間更新定時器

    // ── Registry 快取 ──
    stageRegistry: {},             // stages → { label, emoji, color, agent }
    workflowLabels: {},            // workflowType → label
    agentColors: {},               // agentName → color
    parallelGroupDefs: {},         // groupName → stageKey[]
    workflowParallelGroups: {},    // workflowType → groupName[]

    // ── 類別定義 ──
    categories: [
      { key: 'workflow', label: '工作流' },
      { key: 'stage',    label: '階段' },
      { key: 'agent',    label: '代理' },
      { key: 'loop',     label: '循環' },
      { key: 'parallel', label: '並行' },
      { key: 'handoff',  label: '交接' },
      { key: 'error',    label: '錯誤' },
      { key: 'session',  label: '工作階段' },
    ],

    // ── 生命週期 ──

    init() {
      this.loadRegistry();
      this.loadSessions();
      this.connectSidebarSSE();
      this.durationTimer = setInterval(() => this.$nextTick(() => {}), 10000);
    },

    destroy() {
      if (this.eventSource) this.eventSource.close();
      if (this.allEventSource) this.allEventSource.close();
      if (this.durationTimer) clearInterval(this.durationTimer);
    },

    // ── Computed（Alpine.js getter）──

    get stageEntries()       { ... },  // Object.entries(workflow.stages)
    get completedCount()     { ... },  // 已完成 stage 數
    get totalCount()         { ... },  // 總 stage 數
    get progressPercent()    { ... },  // 百分比
    get workflowLabel()      { ... },  // 中文標籤
    get filteredEvents()     { ... },  // 篩選後的 timeline 事件
    get graderScores()       { ... },  // grader:score 事件
    get activeAgentEntries() { ... },  // Object.entries(workflow.activeAgents)
    get pipelineSegments()   { ... },  // → 委派給 pipeline.js

    get activeSessions()     { ... },  // sessions.filter(s => s.isActive)
    get historySessions()    { ... },  // sessions.filter(s => !s.isActive)

    // ── Methods ──

    // 以下方法簽名見 JS 模組 API 設計
    async loadRegistry()         { ... },
    async loadSessions()         { ... },
    selectSession(sessionId)     { ... },
    connectSidebarSSE()          { ... },
    connectSessionSSE(sessionId) { ... },
    disconnectSessionSSE()       { ... },
    async fetchState()           { ... },
    async fetchTimeline()        { ... },
    async fetchPassatk()         { ... },

    // 輔助
    getStageEmoji(key)           { ... },
    getStageLabel(key)           { ... },
    getAgentColor(name)          { ... },
    getAgentStatus(name)         { ... },  // 新增
    getAgentPulseClass(name)     { ... },  // 新增
    calcDuration(iso)            { ... },
    formatTime(iso)              { ... },
    formatEventDetail(event)     { ... },
    scoreClass(score)            { ... },
  };
}
```

### Session 切換流程（`selectSession`）

```
selectSession(sessionId):
  1. if (sessionId === this.selectedSessionId) return  // 避免重複
  2. this.selectedSessionId = sessionId
  3. this.sessionId = sessionId
  4. this.tab = 'overview'               // 切換時重置 tab
  5. this.workflow = {}                   // 清空舊資料
  6. this.events = []
  7. this.passatk = null
  8. this.confettiPlayed = false
  9. disconnectSessionSSE()               // 關閉舊 SSE
  10. fetchState()                         // 載入新 session state
  11. fetchTimeline()                      // 載入新 session timeline
  12. connectSessionSSE(sessionId)         // 建立新 SSE
```

### SSE 連線管理

```
兩條獨立 SSE 連線：

1. sidebarSSE（/sse/all）
   - 生命週期：頁面載入時建立，頁面關閉時斷開
   - 事件：workflow → 重新 loadSessions() 更新列表
   - 重連：onerror → 3 秒後重連

2. sessionSSE（/sse/:sessionId）
   - 生命週期：selectSession 時建立，切換/離開時斷開
   - 事件：
     - connected → this.connected = true
     - workflow → 更新 this.workflow
     - timeline → push + 自動捲動 + confetti 檢查
     - heartbeat → this.connected = true
   - 重連：onerror → 3 秒後重連（只重連當前 selectedSessionId）
   - 切換安全：disconnectSessionSSE() 先 close 舊連線再建新的
```

## JS 模組 API 設計

### `web/js/pipeline.js`

```javascript
/**
 * 將 stages + registry 資料轉換為 pipeline segments
 *
 * @param {Record<string, StageState>} stages - workflow.stages
 * @param {string} workflowType - workflow.workflowType
 * @param {Record<string, string[]>} parallelGroupDefs - groupName → stageKey[]
 * @param {Record<string, string[]>} workflowParallelGroups - workflowType → groupName[]
 * @returns {PipelineSegment[]}
 */
function buildPipelineSegments(stages, workflowType, parallelGroupDefs, workflowParallelGroups) {
  // 見下方演算法
}

// 全域暴露（無 build step）
window.OT = window.OT || {};
window.OT.buildPipelineSegments = buildPipelineSegments;
```

### `web/js/timeline.js`

```javascript
/**
 * 為新進場的 timeline 事件加上動畫 class
 * 在 Alpine.js $nextTick 後呼叫
 *
 * @param {HTMLElement} listEl - timeline-list 容器的 DOM 參考
 */
function animateNewEvent(listEl) {
  // 找到最後一個 .timeline-event，加上 timeline-slide class
}

/**
 * 自動捲動到 timeline 底部
 * @param {HTMLElement} listEl
 */
function scrollToBottom(listEl) {
  if (listEl) listEl.scrollTop = listEl.scrollHeight;
}

window.OT = window.OT || {};
window.OT.animateNewEvent = animateNewEvent;
window.OT.scrollToBottom = scrollToBottom;
```

### `web/js/confetti.js`

```javascript
/**
 * 發射 confetti 慶祝動畫
 * 在 body 上動態建立粒子，使用 CSS animation，結束後自動移除 DOM
 *
 * @param {object} [options]
 * @param {number} [options.count=40] - 粒子數量
 * @param {string[]} [options.colors] - 粒子顏色（預設 8 個 agent 語義色）
 * @param {number} [options.duration=2000] - 動畫持續時間 ms
 * @returns {void}
 */
function fireConfetti(options = {}) {
  // 檢查 prefers-reduced-motion
  // 建立容器 .confetti-overlay（position:fixed, pointer-events:none）
  // 隨機生成粒子（position, size, rotation, color, delay）
  // CSS animation: confetti-fall
  // setTimeout → 移除容器
}

window.OT = window.OT || {};
window.OT.fireConfetti = fireConfetti;
```

## pipelineSegments 演算法

### 輸入

```
stages: { PLAN: {...}, ARCH: {...}, TEST: {...}, DEV: {...}, REVIEW: {...}, 'TEST:2': {...}, RETRO: {...}, DOCS: {...} }
workflowType: 'standard'
parallelGroupDefs: { quality: ['REVIEW', 'TEST'], verify: ['QA', 'E2E'] }
workflowParallelGroups: { standard: ['quality'], full: ['quality', 'verify'] }
```

### 演算法（Pseudo Code）

```
function buildPipelineSegments(stages, workflowType, parallelGroupDefs, workflowParallelGroups):
  stageKeys = Object.keys(stages)             // 保持 workflow.json 中的順序
  groupNames = workflowParallelGroups[workflowType] || []

  // Step 1: 建立 stageKey → groupName 反向映射
  // 注意：stageKey 可能是 'TEST:2'，需要用 base name 'TEST' 比對 parallelGroupDefs
  stageToGroup = {}
  for groupName in groupNames:
    members = parallelGroupDefs[groupName] || []
    for key in stageKeys:
      baseName = key.split(':')[0]
      if baseName in members:
        stageToGroup[key] = groupName

  // Step 2: 識別連續的同群組 stage，合併為 parallel segment
  segments = []
  i = 0
  while i < stageKeys.length:
    key = stageKeys[i]
    group = stageToGroup[key]

    if group is defined:
      // 收集從 i 開始的連續同群組 stage
      groupStages = []
      while i < stageKeys.length AND stageToGroup[stageKeys[i]] === group:
        groupStages.push({ key: stageKeys[i], stage: stages[stageKeys[i]] })
        i++
      segments.push({ type: 'parallel', groupName: group, stages: groupStages })
    else:
      segments.push({ type: 'stage', key, stage: stages[key] })
      i++

  return segments
```

### 範例輸出

Standard workflow (`PLAN → ARCH → TEST → DEV → [REVIEW | TEST:2] → RETRO → DOCS`):

```
stageKeys: ['PLAN', 'ARCH', 'TEST', 'DEV', 'REVIEW', 'TEST:2', 'RETRO', 'DOCS']
quality group members: ['REVIEW', 'TEST']
stageToGroup: { 'REVIEW': 'quality', 'TEST:2': 'quality' }
  注意：'TEST'（第一個）不在此群組，因為它出現在 REVIEW 之前（不連續）

問題：'TEST' 的 baseName 是 'TEST'，也在 quality 群組中。
如何區分 TEST（spec）和 TEST:2（verify）？
```

### 關鍵邊界處理：TEST stage 去重

```
改良：只有在 DEV 之後出現的 TEST/REVIEW/SECURITY 才參與並行群組判定。

修正演算法 Step 1:
  devIndex = stageKeys.findIndex(k => k.split(':')[0] === 'DEV')

  for groupName in groupNames:
    members = parallelGroupDefs[groupName] || []
    for key in stageKeys:
      keyIndex = stageKeys.indexOf(key)
      // 只有 DEV 之後的 stage 才參與並行群組
      if keyIndex <= devIndex: continue
      baseName = key.split(':')[0]
      if baseName in members:
        stageToGroup[key] = groupName
```

這確保 `TEST`（DEV 前的 spec）不被歸入 quality 群組，而 `TEST:2`（DEV 後的 verify）正確歸入。

## 檔案結構

```
刪除的檔案：
  plugins/overtone/web/index.html       ← 刪除：整合進 dashboard.html
  plugins/overtone/web/session.html     ← 刪除：整合進 dashboard.html

新增的檔案：
  plugins/overtone/web/dashboard.html   ← 新增：合併後的單頁 Dashboard
  plugins/overtone/web/js/pipeline.js   ← 新增：Pipeline segments 演算法
  plugins/overtone/web/js/timeline.js   ← 新增：Timeline 動畫輔助
  plugins/overtone/web/js/confetti.js   ← 新增：Confetti 慶祝動畫

修改的檔案：
  plugins/overtone/web/styles/main.css          ← 完整替換：Glassmorphism 設計系統
  plugins/overtone/scripts/server.js            ← 修改：路由調整 + /api/registry 擴充
  tests/integration/server.test.js              ← 修改：新增 registry 擴充欄位測試
```

## 關鍵技術決策

### 決策 1：CSS 不拆分多檔案

- **選擇**：維持單一 `main.css` 直接替換
- **未選**：拆分為 `variables.css` + `animations.css` + `components.css`
- **理由**：Glassmorphism 的 variables、animations、components 高度耦合（animation 引用 variable，component 引用 animation），拆分增加管理成本且無快取效益（Dashboard 不是高流量公網應用）。單檔全量替換最簡單。

### 決策 2：JS 模組用 `window.OT` namespace 暴露，非 ES Module

- **選擇**：`window.OT.buildPipelineSegments = ...` + `<script>` 標籤載入
- **未選**：ES Module `import/export`
- **理由**：Alpine.js 的 `x-data` 在全域作用域執行，ES Module 有作用域隔離問題。使用 namespace 暴露最簡單，與現有 Alpine.js 整合無縫。

### 決策 3：sidebar SSE 沿用 `/sse/all`，不新增端點

- **選擇**：sidebar 透過現有 `/sse/all` 端點接收 workflow 事件，收到後呼叫 `loadSessions()` 重新拉取列表
- **未選**：新增 `/sse/sessions` 推送 session 列表差異
- **理由**：`/sse/all` 已存在且功能完整。sidebar 更新頻率低（agent 狀態變化時），用 REST 拉取即可。不需要新端點。

### 決策 4：Pipeline 並行判定用 DEV 位置作為分界

- **選擇**：只有 DEV 之後的 stage 參與 parallelGroupDefs 匹配
- **理由**：BDD workflow 的 TEST:spec 在 DEV 前、TEST:verify 在 DEV 後，baseName 相同但語義不同。用 DEV 位置分界是最簡單且正確的判定方式，與現有 `state.js` 的 `initState()` 中 TEST mode 判定邏輯一致。

### 決策 5：合併頁面後首頁路由保持 `/`

- **選擇**：`GET /` 直接 serve `dashboard.html`，移除 `/s/:sessionId` 路由
- **理由**：單頁模式下不需要 session 子路由。如果使用者直接存取 `/s/:id`，可返回 404（未來可考慮 URL hash 導航，但本次不實作）。

## 實作注意事項

給 developer 的提醒：

- `dashboard.html` 不使用伺服端模板替換（`{{SESSION_ID}}` 等），所有資料透過 API 載入。`server.js` 的 `serveSessionPage()` 和 `serveIndexPage()` 中的 template replacement 邏輯可移除。
- `server.js` 的 `renderSessionCards()` 函式不再需要（HTML SSR 改為前端 Alpine.js 渲染），可直接刪除。
- CSS 中所有 Glassmorphism 效果需要 `backdrop-filter` 支援。Bun Dashboard 主要在 Chrome/Safari 使用，兩者都支援，不需 prefix。
- `confetti.js` 必須檢查 `window.matchMedia('(prefers-reduced-motion: reduce)').matches`，若為 true 則跳過動畫。
- `pipeline.js` 的 `buildPipelineSegments()` 是純函式，無副作用，容易單元測試。
- Timeline 事件的 `timeline-slide` 動畫 class 只加在 SSE push 的新事件上，初次 `fetchTimeline()` 載入的歷史事件不加動畫。
- Sidebar 的 session 列表每次收到 `/sse/all` 的 workflow 事件時重新 `loadSessions()`，不做差異更新（簡單且正確）。
