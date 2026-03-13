# Flow Visualizer 實作計劃

## 深度路由：D3
**理由**：跨 8 個檔案、涉及 hook 整合 + 前端 + SSE + 靜態分析，需規劃 → 執行 → 審查完整流程。非 D4 因為不需逐個 review 再 merge。

---

## 關鍵技術發現

| 項目 | 發現 |
|------|------|
| Port | 3456 被 model-router 佔用 → flow server 用 **3457** |
| session_id | `input.session_id` 從 hook stdin 取得（SessionStart + PreToolUse 皆有） |
| model | 僅 SessionStart 的 `input.model` 有 main model；agent model 需從 `agents/*.md` frontmatter 推斷 |
| hooks | v0.30 `settings.json` 的 `hooks: {}` 是空的 — 事件寫入不走 hook，走 **直接呼叫** |
| skills_failed | pre-task-handler L454-477 已有 gap detection 邏輯，flow-event-writer 可複用 |
| commands | 全部 `.bak` — /flow 是 v0.30 後第一個新 command |

## 架構決策

### D1: flow-event-writer 的呼叫方式

**選項 A**：修改 hook scripts（pre-task.js、on-start.js）加入 flow event 寫入
**選項 B**：修改 handler（pre-task-handler.js、session-start-handler.js）直接呼叫 flow-event-writer

**選擇 B** — handler 是業務邏輯層，已有完整的 session_id、targetAgent、skill 載入結果等資訊。hook thin wrapper 只做 I/O，不該加業務邏輯。

### D2: agent model 來源

pre-task-handler 中無 model 資訊。解法：

1. **SessionStart**：`input.model` 直接取得（main agent model）
2. **PreToolUse(Task)**：從 `agents/{targetAgent}.md` frontmatter 的 `model` 欄位讀取（planner.md/executor.md/reviewer.md 已定義 model）
3. **Fallback**：model 欄位為 `"unknown"`

### D3: 事件格式精化

根據程式碼分析，事件型別分 3 種：

```jsonc
// session_start — 從 session-start-handler 發出
{ "ts": 1710000000000, "session_id": "abc", "event": "session_start",
  "model": "claude-sonnet-4-6", "cwd": "/Users/sbu/projects/xxx",
  "session_type": "normal" }

// agent_dispatch — 從 pre-task-handler 發出
{ "ts": 1710000000000, "session_id": "abc", "event": "agent_dispatch",
  "agent": "executor", "model": "sonnet",
  "skills_loaded": ["testing", "craft"],
  "skills_failed": ["dead-code"],
  "extra_skills": ["thinking"],
  "rules_injected": [],  // Phase 2: 從 buildWorkflowContext 擷取
  "rules_missing": [] }

// agent_complete — 從 agent-stop-handler 發出（Phase 2 擴充）
{ "ts": 1710000000000, "session_id": "abc", "event": "agent_complete",
  "agent": "executor", "verdict": "pass" }
```

### D4: 前端技術棧

**自包含 HTML**（零依賴）：D3.js 從 CDN 載入，其餘純 vanilla JS + CSS Grid。
理由：`~/.claude/` 不適合放 node_modules，自包含檔案最易維護。

---

## 步驟

### Phase 1: 資料層（3 檔案）

| # | 任務 | 執行者 | 產出 |
|---|------|--------|------|
| T1 | 建立 `flow-event-writer.js` | executor | `~/.claude/scripts/lib/flow-event-writer.js` |
| T2 | 修改 `session-start-handler.js` — 在 handleSessionStart 尾部呼叫 writer 寫 `session_start` 事件 | executor | 修改現有檔案 |
| T3 | 修改 `pre-task-handler.js` — 在 agent delegate 成功後呼叫 writer 寫 `agent_dispatch` 事件 | executor | 修改現有檔案 |

**T1 介面設計：**

```javascript
// flow-event-writer.js
// 路徑：~/.claude/projects/{encodedCwd}/flow-events.jsonl
// encodedCwd = cwd.replaceAll('/', '-').replace(/^-/, '')
// 與 Claude Code 現有 projects/ 結構對齊（state.json、timeline.jsonl 同目錄）
function getFlowEventsPath(cwd) {
  const encoded = cwd.replaceAll('/', '-').replace(/^-/, '');
  return path.join(os.homedir(), '.claude', 'projects', encoded, 'flow-events.jsonl');
}

/**
 * @param {object} event - 事件物件（必須含 event 欄位）
 * 自動補上 ts 欄位。appendFileSync，失敗靜默降級（hookError）。
 */
function writeFlowEvent(event) { ... }

/**
 * 從 pre-task-handler 的已有變數組裝 agent_dispatch 事件
 * @param {string} sessionId
 * @param {string} targetAgent
 * @param {string|null} skillContextStr - buildSkillContext 回傳值
 * @param {string[]} agentSkills - 從 frontmatter 解析的 skills 陣列
 * @param {string[]} extraSkills - 從 prompt 解析的 extra skills
 * @param {object} gaps - detectKnowledgeGaps 的回傳值
 */
function writeAgentDispatch(sessionId, targetAgent, { agentSkills, extraSkills, skillContextStr, gaps }) { ... }

/**
 * 從 session-start-handler 的已有變數組裝 session_start 事件
 */
function writeSessionStart(sessionId, model, cwd) { ... }
```

**T2-T3 修改策略：** 在現有邏輯的最後、return 前，加入 try/catch 包裹的 flow event 寫入。失敗靜默降級，不影響 hook 主要功能。

### Phase 2: Server 層（4 檔案）

| # | 任務 | 執行者 | 產出 |
|---|------|--------|------|
| T4 | 建立 `config.js` — 預設參數 + deep merge `~/.claude/flow-config.json`（GET /api/config 提供給前端） | executor | `~/.claude/scripts/flow/config.js` |
| T5 | 建立 `watcher.js` — glob watch `~/.claude/projects/*/flow-events.jsonl`，新行時 parse 並 emit（自動偵測所有專案） | executor | `~/.claude/scripts/flow/watcher.js` |
| T6 | 建立 `sessions.js` — session 清單管理（enable/disable/auto-rotate） | executor | `~/.claude/scripts/flow/sessions.js` |
| T7 | 建立 `sse.js` — SSE 連線池 + broadcast | executor | `~/.claude/scripts/flow/sse.js` |
| T8 | 建立 `server.js` — HTTP 路由（GET / → client.html, GET /events → SSE, GET /api/graph, GET /api/config） | executor | `~/.claude/scripts/flow/server.js` |

**T4-T7 可並行**（操作不同檔案、無邏輯依賴），但 T7 import T4-T6。

**sessions.js 核心邏輯：**
- `Map<session_id, { enabled, last_event_ts, session_type, events[] }>`
- `enable(id)` / `disable(id)` / `toggleTestBlock()`
- 自動策略：新事件進來時，若 enabled 數 > 4，disable `last_event_ts` 最舊的
- test block 開啟時，`session_type === 'test'` 的 session 自動 disable

### Phase 3: 靜態拓撲 + 斷鏈偵測（1 檔案）

| # | 任務 | 執行者 | 產出 |
|---|------|--------|------|
| T8 | 建立 `graph-builder.js` — 讀 agents/*.md + skills/ + hooks/ 建靜態拓撲 + 斷鏈偵測 | executor | `~/.claude/scripts/flow/graph-builder.js` |

**斷鏈偵測邏輯：**

| 檢查 | 來源 | 結果 |
|------|------|------|
| skill dangling reference | agent.md frontmatter skills 指向不存在的 skill 目錄 | ❌ 檔案不存在 |
| 孤立 skill | skills/ 下有目錄但無 agent 引用 | ⚠️ 未注入 |
| hook script 不存在 | hooks.json/settings.json 指向不存在的腳本 | ❌ 檔案不存在 |
| buildSkillContext 注入失敗 | 執行期 agent_dispatch 事件的 skills_failed | ⚠️ 未注入（執行期） |
| Guard 未攔截 | hook 未註冊或 disabled | ⚠️ 未注入 |

**靜態拓撲 JSON 結構：**
```jsonc
{
  "nodes": [
    { "id": "agent:planner", "type": "agent", "model": "opus", "skills": ["architecture", "thinking"] },
    { "id": "skill:testing", "type": "skill", "status": "ok" },
    { "id": "skill:dead-code", "type": "skill", "status": "dangling" },
    { "id": "hook:pre-task", "type": "hook", "status": "ok" },
    { "id": "rule:MUST-no-silent-fail", "type": "rule", "status": "ok" }
  ],
  "edges": [
    { "from": "agent:planner", "to": "skill:architecture", "status": "ok" },
    { "from": "agent:planner", "to": "skill:dead-code", "status": "broken" }
  ],
  "breaks": [
    { "type": "dangling_ref", "agent": "planner", "skill": "dead-code", "reason": "SKILL.md not found" }
  ]
}
```

### Phase 4: 前端（1 檔案）

| # | 任務 | 執行者 | 產出 |
|---|------|--------|------|
| T9 | 建立 `client.html` — 自包含前端（D3 流程圖 + tabs + split screen + SSE） | executor | `~/.claude/scripts/flow/client.html` |

**前端功能：**
- **Tab 列**：每個 session 一個 tab，點擊 toggle enable/disable
- **Split screen**：⊞ 按鈕切換，1/2/3/4 佈局（CSS Grid）
  - 1: `grid-template: 1fr / 1fr`
  - 2: 視窗寬 > 高 → `1fr / 1fr 1fr`，否則 `1fr 1fr / 1fr`
  - 3: 視窗寬 > 高 → `1fr / 1fr 1fr 1fr`，否則 `1fr 1fr 1fr / 1fr`
  - 4: 永遠 `1fr 1fr / 1fr 1fr`
- **Test block**：🧪 按鈕 toggle，UI 狀態顯示在 tab 列右側
- **流程圖**：D3 force-directed layout
  - 節點：Hook（方形）→ Agent（圓形，顯示 model badge）→ Skill（菱形）→ Rule（六角形）
  - 邊：正常（灰）/ ⚠️ 未注入（橙）/ ❌ 不存在（紅）
  - 即時更新：SSE 事件進來時高亮觸發路徑（pulse + fade，2 秒）
- **SSE 連線**：`EventSource('/events')` + 自動重連

**UI/UX 設計規範（AI 科技感，低刺激）：**

所有視覺參數集中在 `flow/config.js`（server 讀取），透過 `GET /api/config` 提供給前端。前端用 CSS variables 套用，不硬編碼任何顏色或時間值。

**`flow/config.js` 結構：**

```javascript
// 預設值。可被 ~/.claude/flow-config.json 覆蓋（存在才讀，不強制）
const DEFAULTS = {
  port: 3457,
  maxSplitSessions: 4,
  theme: {
    bg:          '#0d1117',
    nodeFill:    '#0f172a',
    tabBar:      '#111827',
    font:        "'JetBrains Mono', monospace",
    // 節點邊框（按類型）
    hookBorder:  '#3b82f6',
    agentBorder: '#10b981',
    skillBorder: '#8b5cf6',
    ruleBorder:  '#f59e0b',
    // Agent model badge
    modelHaiku:  '#6366f1',
    modelSonnet: '#10b981',
    modelOpus:   '#f59e0b',
    // 邊狀態
    edgeNormal:  '#334155',
    edgeActive:  '#00d4aa',
    edgeBroken:  '#ef4444',
    // 按鈕
    btnBorder:   '#334155',
    btnHover:    '#10b981',
    tabActive:   '#10b981',
  },
  animation: {
    flowDuration:  1500,   // ms，活躍邊流動速度
    pulseDuration: 2000,   // ms，觸發 glow fade
    sseRetry:      1000,   // ms，SSE 重連間隔
  },
};
```

**覆蓋方式**：`~/.claude/flow-config.json` 存在時做 deep merge，只覆蓋有寫的欄位。其餘維持 DEFAULTS。

| 元素 | CSS variable（前端套用） |
|------|------------------------|
| 背景色 | `--bg` |
| Hook 邊框 | `--hook-border` |
| Agent 邊框 | `--agent-border` |
| Skill 邊框 | `--skill-border` |
| Rule 邊框 | `--rule-border` |
| 活躍邊 | `--edge-active` |
| 動畫時間 | `--flow-duration`, `--pulse-duration` |

### Phase 5: Command + 整合（1 檔案）

| # | 任務 | 執行者 | 產出 |
|---|------|--------|------|
| T10 | 建立 `/flow` command | executor | `~/.claude/commands/flow.md` |

**Command 行為：**
1. 檢查 port 3457 是否已被佔用（`lsof -i :3457`）
2. 若未佔用 → `Bun.spawn` 背景啟動 server.js，等待 ready
3. 若已佔用 → 跳過啟動（server 已在跑）
4. 開瀏覽器 `open http://localhost:3457`（macOS `open` 指令）
5. 輸出：「Flow Visualizer 已啟動：http://localhost:3457」

### Phase 6: 測試（6 檔案）

| # | 任務 | 執行者 | 產出 |
|---|------|--------|------|
| T11 | flow-event-writer 單元測試 | executor | `~/projects/overtone/tests/unit/flow-event-writer.test.js` |
| T12 | watcher + sessions 單元測試 | executor | `~/projects/overtone/tests/unit/flow-sessions.test.js` |
| T13 | graph-builder 單元測試（含斷鏈偵測） | executor | `~/projects/overtone/tests/unit/flow-graph-builder.test.js` |
| T14 | server HTTP 路由整合測試 | executor | `~/projects/overtone/tests/unit/flow-server.test.js` |
| T15 | SSE broadcast 測試 | executor | `~/projects/overtone/tests/unit/flow-sse.test.js` |
| T16 | pre-task-handler / session-start-handler 修改回歸 | executor | 修改現有測試檔案 |

**T11-T15 可全部並行**（操作不同檔案）。T16 需等 T2-T3 完成。

### Phase 7: 審查

| # | 任務 | 執行者 |
|---|------|--------|
| T17 | Code review：斷鏈偵測覆蓋率 + SSE 記憶體洩漏 + JSONL 併發寫入安全性 | reviewer |

---

## 依賴圖

```
T1 ──┬── T2（修改 session-start-handler）
     └── T3（修改 pre-task-handler）

T4, T5, T6 ── T7（server 組裝）

T8（graph-builder，獨立）

T9（client.html，依賴 T7 的 API 合約但可並行開發）

T10（command，依賴 T7）

T11-T15（測試，依賴對應實作）
T16（回歸，依賴 T2+T3）

T17（審查，依賴全部）
```

**並行執行方案：**
- **Batch 1**：T1（同步）
- **Batch 2**：T2 + T3 + T4 + T5 + T6 + T8（全部並行，操作不同檔案）
- **Batch 3**：T7 + T9（T7 依賴 T4-T6；T9 依賴 API 合約）
- **Batch 4**：T10 + T11-T16（全部並行）
- **Batch 5**：T17（審查）

---

## 測試策略

| 驗收條件 | 方法 |
|---------|------|
| flow-events.jsonl 正確寫入 | T11：mock fs，驗證 appendFileSync 呼叫格式 |
| session 自動 enable/disable（>4 時最舊的被 disable） | T12：建 5 個 session，驗證第 5 個進來時最舊被 disable |
| 靜態拓撲正確建構 | T13：建假 agents/ + skills/ 目錄，驗證 nodes/edges 結構 |
| 斷鏈偵測（dangling ref、孤立 skill、hook 不存在） | T13：各建一個壞情境，驗證 breaks 陣列 |
| SSE broadcast 不漏事件 | T15：連 3 個 client，發 1 事件，3 個都收到 |
| SSE 連線斷開後不洩漏 | T15：連線後斷開，驗證連線池 size 歸零 |
| server GET / 回傳 HTML | T14：fetch / 驗證 content-type + status 200 |
| server GET /events 回傳 SSE | T14：驗證 content-type text/event-stream |
| server GET /api/graph 回傳 JSON | T14：驗證結構含 nodes/edges/breaks |
| 現有測試不壞 | T16：`bun test` 全部通過 |
| JSONL 併發寫入安全 | T17 reviewer 確認：appendFileSync 是原子操作（單行 < PIPE_BUF） |
| 瀏覽器不重複開啟 | T10 command 邏輯：lsof 檢查 port 佔用 |

---

## 風險

| 風險 | 緩解 |
|------|------|
| JSONL 併發寫入（多個 hook 同時 append） | appendFileSync + 單行 < 4096 bytes（PIPE_BUF），OS 保證原子 |
| D3 CDN 離線時前端壞掉 | client.html 頂部加 fallback 提示：「無法載入 D3，請確認網路」 |
| flow-events.jsonl 無限增長 | server.js 啟動時 truncate 超過 7 天的事件；或 watcher 只讀最近 1000 行 |
| model-router 未啟動時 port 3457 衝突 | 無衝突，3456 是 router、3457 是 flow，獨立 port |
| v0.30 hooks 為空，事件無法觸發 | 不依賴 hook 攔截 — 直接在 handler 層呼叫 writer（D1 決策） |
