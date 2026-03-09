---
feature: workflow-multi-instance
status: in-progress
created: 2026-03-09
---

# Design: workflow-multi-instance

## 問題背景

`workflow.json` 以 `sessions/{sessionId}/` 為根，一個 session 只能有一個。當使用者 `Cmd+B` 退至背景後啟動新 workflow，兩個 workflow 共用同一個 `sessionId`，SubagentStop 回寫會覆蓋前景 workflow 的 state。

**根因**：hook 只知道 `sessionId`，無法辨識 agent 歸屬哪個 workflow。

## 解決方案：引入 workflowId 隔離層

在 `sessions/{sessionId}/` 下新增一層 `workflows/{workflowId}/`，讓 state 和 timeline 各自獨立。agent-mapping.json 做 instanceId → workflowId 的路由，讓 SubagentStop 正確識別歸屬。

**選擇理由**：
- 不改變 `sessionId` 語意（session 仍唯一）
- 無需 file lock（agent-mapping 以 instanceId 為 key，原子寫入即可）
- 向後相容（雙讀 fallback，舊 session 不受影響）

---

## 目錄結構

```
~/.overtone/sessions/{sessionId}/
├── loop.json                    # session 層級（不變）
├── observations.jsonl           # session 層級（不變）
├── compact-count.json           # session 層級（不變）
├── active-workflow-id           # 新增：前景目前的 workflowId（純文字）
├── agent-mapping.json           # 新增：{ instanceId -> workflowId }
└── workflows/
    └── {workflowId}/
        ├── workflow.json        # 從根層移入
        ├── timeline.jsonl       # 從根層移入
        └── handoffs/
            ├── DEV.md
            └── ...
```

---

## Open Questions 決策

### Q1：workflowId 生成策略

**決定**：`Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6)`

範例：`lz4abc12-r2xy`（~13 字元）

理由：
- 與現有 instanceId 格式一致（`agentName:timestamp36-random6`）
- 無外部依賴
- 同一 session 兩個 workflow 間隔至少數秒，碰撞機率可忽略

### Q2：active-workflow-id 更新時機

**決定**：workflow 完成後**不清除** `active-workflow-id`。

理由：
- 清除後下一個 UserPromptSubmit 會讀不到 workflowId，on-submit-handler 的進行中 workflow 判斷失效
- on-submit-handler 判斷「所有 stage completed」→ 顯示「無進行中 workflow」提示，此邏輯在 state 層完成，不依賴 active-workflow-id 是否存在
- 保留最後的 workflowId 讓 fallback 鏈更簡單（agent-mapping 找不到時還能嘗試 active-workflow-id）
- 下次 init-workflow.js 執行時覆蓋即可

### Q3：enforceInvariants 的 timeline.emit

**決定**：state 物件記錄 `workflowId` 欄位（initState 時寫入），`enforceInvariants` 從 `state.workflowId` 讀取。

```javascript
// state 物件新增欄位
const state = {
  sessionId,
  workflowId,      // 新增
  workflowType,
  // ...
};

// enforceInvariants 內部
timeline.emit(state.sessionId, state.workflowId, 'system:warning', { ... });
```

理由：不需額外參數，不破壞 enforceInvariants 的純函式語意，從 state 本身讀取最自然。

### Q4：event-bus.js watch 路徑

**決定**：watch `active-workflow-id` 對應的 `workflowFile(sessionId, workflowId)`（前景 workflow）。

實作：`event-bus.js` 啟動時讀取 `active-workflow-id` 取得 workflowId，watch 對應路徑。若 workflowId 不存在（舊 session），fallback 至根層 `workflow.json`（維持現有行為）。

理由：Dashboard 只需顯示前景（active）的 workflow，不需 watch 全部。

### Q5：agent-mapping.json 競態保護

**決定**：不需要 file lock，採用原子讀寫（read → merge → atomicWrite）即可。

理由：
- `writeMapping` 操作是讀取整個 JSON → 加入新條目 → atomicWrite 整個檔案
- 最壞情況：兩個 pre-task hook 同時寫，後者覆蓋前者，導致前者的條目遺失
- 緩解：`updateStateAtomic` 的 CAS 模式（mtime 檢查 + 3 次重試）移植到 `writeMapping`
- 理由：hook 執行窗口 < 50ms，同時委派兩個 agent 的概率極低；即使遺失，on-stop fallback 仍可透過 `active-workflow-id` 找到正確 workflowId

---

## API 設計

### paths.js — 新增函式

```typescript
// session.workflowsDir(sessionId) — workflow 集合目錄
session.workflowsDir: (sessionId: string) => string

// session.workflowDir(sessionId, workflowId) — 單一 workflow 目錄
session.workflowDir: (sessionId: string, workflowId: string) => string

// session.workflowFile(sessionId, workflowId) — workflow.json
session.workflowFile: (sessionId: string, workflowId: string) => string

// session.workflowTimeline(sessionId, workflowId) — timeline.jsonl
session.workflowTimeline: (sessionId: string, workflowId: string) => string

// session.workflowHandoffsDir(sessionId, workflowId) — handoffs/
session.workflowHandoffsDir: (sessionId: string, workflowId: string) => string

// session.workflowHandoff(sessionId, workflowId, stageKey) — handoffs/{stageKey}.md
session.workflowHandoff: (sessionId: string, workflowId: string, stageKey: string) => string

// session.activeWorkflowId(sessionId) — active-workflow-id 純文字檔案
session.activeWorkflowId: (sessionId: string) => string

// session.agentMapping(sessionId) — agent-mapping.json
session.agentMapping: (sessionId: string) => string

// 保留舊路徑（deprecated，供 migration fallback）
session.workflow:  (sessionId: string) => string  // @deprecated
session.timeline:  (sessionId: string) => string  // @deprecated
session.handoff:   (sessionId: string, stageKey: string) => string  // @deprecated
```

---

### state.js — API 變更

所有公開函式加入 `workflowId` 參數（第二位）：

```typescript
readState(sessionId: string, workflowId: string): object | null
writeState(sessionId: string, workflowId: string, state: object): void
initState(sessionId: string, workflowId: string, workflowType: string, stageList: string[], options?: object): object
updateStage(sessionId: string, workflowId: string, stageKey: string, update: object): object
setFeatureName(sessionId: string, workflowId: string, name: string): void
updateStateAtomic(sessionId: string, workflowId: string, modifier: Function): object
sanitize(sessionId: string, workflowId: string): { fixed: string[], state: object } | null
```

**state 物件新增 `workflowId` 欄位**（initState 時寫入，供 enforceInvariants 內部讀取）：

```typescript
interface WorkflowState {
  sessionId: string
  workflowId: string   // 新增
  workflowType: string
  // ... 其餘不變
}
```

**Migration fallback**（`readState` 內部邏輯）：

```
1. 若 workflowId 存在 → 讀 workflows/{workflowId}/workflow.json
2. 若不存在（null/undefined）→ 讀根層 workflow.json（舊格式）
3. 兩者皆不存在 → 回傳 null
```

---

### timeline.js — API 變更

所有公開函式加入 `workflowId` 參數（第二位）：

```typescript
emit(sessionId: string, workflowId: string, eventType: string, data?: object): object
query(sessionId: string, workflowId: string, filter?: object): object[]
latest(sessionId: string, workflowId: string, eventType: string): object | null
count(sessionId: string, workflowId: string, filter?: object): number
trimIfNeeded(sessionId: string, workflowId: string): void
passAtK(sessionId: string, workflowId: string): object
cleanupOldSessions(maxAgeDays?: number): { removed: number, kept: number }  // 不變
```

**路徑選擇邏輯**（`emit` 內部）：

```
workflowId 存在 → paths.session.workflowTimeline(sessionId, workflowId)
workflowId 為 null → paths.session.timeline(sessionId)  // deprecated fallback
```

---

### agent-mapping.js — 新模組

```typescript
// readMapping(sessionId) — 讀取完整 mapping，不存在時回傳 {}
readMapping(sessionId: string): Record<string, string>

// writeMapping(sessionId, instanceId, workflowId) — CAS 原子寫入
// 讀取 → 合併 → mtime 檢查 → atomicWrite（最多重試 3 次）
writeMapping(sessionId: string, instanceId: string, workflowId: string): void

// lookupWorkflow(sessionId, instanceId) — 查詢 instanceId 對應的 workflowId
lookupWorkflow(sessionId: string, instanceId: string): string | null

// removeEntry(sessionId, instanceId) — 清除 mapping 條目
removeEntry(sessionId: string, instanceId: string): void
```

**資料結構**：

```json
{
  "developer:lz4abc12-r2xy": "lz4abc12-r2xy",
  "tester:lz4def34-m5no": "lz4def34-m5no"
}
```

---

### init-workflow.js — 流程變更

```
1. 生成 workflowId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6)
2. mkdirSync(paths.session.workflowDir(sessionId, workflowId), { recursive: true })
3. mkdirSync(paths.session.workflowHandoffsDir(sessionId, workflowId), { recursive: true })
4. writeFileSync(paths.session.activeWorkflowId(sessionId), workflowId)
5. state.initState(sessionId, workflowId, workflowType, stages, options)
6. timeline.emit(sessionId, workflowId, 'workflow:start', ...)
7. console.log 輸出 workflowId（供 debug 用）
```

---

### pre-task-handler.js — 委派流程

```
讀取 workflowId：
  1. readFileSync(paths.session.activeWorkflowId(sessionId)) → workflowId
  2. 失敗 → workflowId = null（migration fallback）

生成 instanceId 後：
  agentMapping.writeMapping(sessionId, instanceId, workflowId)

其餘：
  state.readState(sessionId, workflowId)
  state.updateStateAtomic(sessionId, workflowId, ...)
  timeline.emit(sessionId, workflowId, ...)
```

---

### agent-stop-handler.js — workflowId 解析順序（核心修復）

```
1. 解析 resolvedInstanceId（現有 regex，保留）
2. agentMapping.lookupWorkflow(sessionId, resolvedInstanceId) → workflowId
3. 若 null：讀 active-workflow-id → workflowId（hookError 記錄 fallback）
4. 若仍 null：workflowId = null（使用根層路徑，migration 場景）
5. agentMapping.removeEntry(sessionId, resolvedInstanceId)（完成後清除）

讀 state：state.readState(sessionId, workflowId)
寫 state：state.updateStateAtomic(sessionId, workflowId, ...)
寫 handoff：paths.session.workflowHandoff(sessionId, workflowId, actualStageKey)
```

---

### on-submit-handler.js — 讀取 workflowId

```
讀取 workflowId（靜默降級）：
  try { workflowId = readFileSync(paths.session.activeWorkflowId(sessionId)) }
  catch { workflowId = null }

state.readState(sessionId, workflowId)
```

---

### hook-utils.js / pre-edit-guard.js — 讀取 workflowId

`buildWorkflowContext` 新增 `workflowId` 選項參數：

```typescript
buildWorkflowContext(sessionId: string, projectRoot: string, options?: {
  maxLength?: number
  workflowId?: string  // 新增
}): string | null
```

呼叫方（pre-task-handler、pre-edit-guard）負責讀取 `active-workflow-id` 並傳入。

---

## Migration 策略

### 原則：雙讀 fallback，不中斷現有 session

| 讀取點 | 新路徑 | Fallback（舊路徑） |
|--------|--------|-------------------|
| `readState` | `workflows/{workflowId}/workflow.json` | 根層 `workflow.json` |
| `timeline.emit` | `workflows/{workflowId}/timeline.jsonl` | 根層 `timeline.jsonl` |
| `handoff 讀寫` | `workflows/{workflowId}/handoffs/` | 根層 `handoffs/` |
| `event-bus watch` | `workflows/{workflowId}/workflow.json` | 根層 `workflow.json` |

**不做的事**：
- 不自動遷移舊 session 的檔案
- 不刪除舊路徑定義（保留 @deprecated 標記）

---

## 狀態同步策略（前景 ↔ 背景 workflow）

此功能為純後端，無前端 store。Dashboard 透過 `event-bus.js` watch `workflow.json`。

**策略**：event-bus 啟動時讀取 `active-workflow-id`，watch 前景 workflow 的 `workflow.json`。背景 workflow 的 state 變化不主動推送（不需要，使用者已知其在背景）。

Dashboard 多 workflow 支援可於未來需求時擴充（watch `workflows/` 目錄），本次不實作。

---

## 檔案清單

### 修改檔案（~/.claude/）

| 檔案 | 變更 |
|------|------|
| `scripts/lib/paths.js` | 新增 7 個路徑函式 |
| `scripts/lib/state.js` | 所有函式加 workflowId 參數 + migration fallback |
| `scripts/lib/timeline.js` | 所有函式加 workflowId 參數 + migration fallback |
| `scripts/init-workflow.js` | 生成 workflowId + 目錄建立 + active-workflow-id 寫入 |
| `scripts/lib/pre-task-handler.js` | 讀 active-workflow-id + 呼叫 writeMapping |
| `scripts/lib/agent-stop-handler.js` | lookupWorkflow + removeEntry + workflowId 傳入 |
| `scripts/lib/on-submit-handler.js` | 讀 active-workflow-id + workflowId 傳入 state |
| `scripts/lib/hook-utils.js` | buildWorkflowContext 加 workflowId 選項 |
| `hooks/scripts/tool/pre-edit-guard.js` | 讀 active-workflow-id + workflowId 傳入 |
| `scripts/lib/session-stop-handler.js` | 讀 active-workflow-id |
| `scripts/lib/pre-compact-handler.js` | handoff 讀取路徑改 workflow 層級 |
| `scripts/lib/feature-sync.js` | 讀 active-workflow-id |
| `scripts/lib/baseline-tracker.js` | 讀 active-workflow-id |
| `scripts/lib/session-digest.js` | 讀 active-workflow-id |
| `scripts/lib/dashboard/sessions.js` | 讀 active-workflow-id |
| `scripts/lib/remote/event-bus.js` | watch 路徑改 workflow 層級 |
| `scripts/lib/remote/dashboard-adapter.js` | 讀 active-workflow-id |

### 新增檔案（~/.claude/）

| 檔案 | 用途 |
|------|------|
| `scripts/lib/agent-mapping.js` | agent-mapping 讀寫工具 |

### 修改檔案（tests/）

| 檔案 | 變更 |
|------|------|
| `tests/unit/paths.test.js` | 新路徑函式覆蓋 |
| `tests/unit/state.test.js` | 新 signature 覆蓋 |
| `tests/unit/timeline.test.js` | 新 signature 覆蓋 |

### 新增檔案（tests/）

| 檔案 | 用途 |
|------|------|
| `tests/unit/agent-mapping.test.js` | 新模組 unit test |
| `tests/integration/multi-workflow.test.js` | 多 workflow 並行隔離場景 |
| `tests/integration/migration.test.js` | 舊格式 fallback 場景 |

---

## Edge Cases

| 邊界條件 | 風險類型 | 緩解 |
|---------|---------|------|
| agent 輸出無 INSTANCE_ID → lookupWorkflow 失敗 | 並行競爭 | fallback 至 active-workflow-id；hookError 記錄 |
| 兩個 pre-task 同時 writeMapping 競爭 | 並行競爭 | CAS 模式（mtime + retry），後者不會覆蓋前者 |
| init-workflow 寫 active-workflow-id 後、pre-task 讀之前，使用者切換前景 | 並行競爭（TOCTOU）| 窗口 < 50ms，可接受；binding 後靠 mapping 不受影響 |
| 舊 session 無 active-workflow-id → readState fallback 至根層 workflow.json | 資料邊界 | 保留舊路徑定義，靜默 fallback |
| enforceInvariants 讀 state.workflowId 但 state 物件來自舊格式（無此欄位）| 語意陷阱 | enforceInvariants 判斷 `state.workflowId` 存在才傳，否則 timeline.emit 用 null（fallback 至舊路徑）|
| agent-mapping.json 累積未清除的條目（on-stop 未執行）| 資料邊界 | session 清理時整個目錄刪除；即使累積 100 筆也僅 ~3KB |
| event-bus watch workflowId 變更後監聽失效（新 workflow 啟動）| 狀態組合 | Dashboard 本次只 watch 啟動時的 workflowId，多 workflow watch 列為未來工作 |
