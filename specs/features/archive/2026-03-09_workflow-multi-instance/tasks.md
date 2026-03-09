---
feature: workflow-multi-instance
status: archived
workflow: standard
created: 2026-03-09T08:23:14.061Z
archivedAt: 2026-03-09T08:49:27.963Z
---
## Stages

- [x] PLAN
- [x] ARCH
- [x] TEST
- [x] DEV
- [x] REVIEW
- [x] RETRO
- [x] DOCS

## Requirements

### 問題陳述

目前 workflow state 以 `sessions/{sessionId}/workflow.json` 為單例儲存。當使用者用 `Cmd+B` 將任務退至背景後再啟動新 workflow 時，兩者共用同一個 `workflow.json`，產生競態條件：

1. workflow A 啟動，寫入 `workflow.json`
2. `Cmd+B` 退至背景，背景 agent 繼續執行
3. 前景啟動 workflow B，`init-workflow.js` 覆蓋 `workflow.json`
4. 背景 agent 完成，SubagentStop 寫回 state，覆蓋 workflow B 的 state

### 根因

- `workflow.json` 以 `sessionId` 為唯一 key，一個 session 只能有一個
- `Cmd+B` 不產生新 session，前景背景共用同一個 `sessionId`
- SubagentStop hook 只知道 `sessionId`，無法辨識 agent 屬於哪個 workflow

### 目標目錄結構

```
sessions/{sessionId}/
├── loop.json                   <- session 層級（不變）
├── active-workflow-id          <- 新增：前景目前的 workflow ID
├── agent-mapping.json          <- 新增：{ agentInstanceId -> workflowId }
├── observations.jsonl          <- session 層級（不變）
└── workflows/
    └── {workflowId}/
        ├── workflow.json       <- 從根層移入
        ├── timeline.jsonl      <- 從根層移入
        └── handoffs/
            ├── DEV.md
            ├── REVIEW.md
            └── TEST.md
```

### 層級歸屬確認

| 檔案 | 層級 | 理由 |
|------|------|------|
| `loop.json` | session | 控制 session 是否接續，跨 workflow |
| `observations.jsonl` | session | 學習觀察跨 workflow 累積 |
| `compact-count.json` | session | compact 次數是 session 屬性 |
| `active-workflow-id` | session | 標記前景當前操作的 workflow |
| `agent-mapping.json` | session | 跨 workflow 的 agent 路由表 |
| `workflow.json` | workflow | 各自獨立 state |
| `timeline.jsonl` | workflow | 各自獨立事件流 |
| `handoffs/` | workflow | 各自獨立產出 |

## Tasks

### T1：paths.js — 新增 workflow 層級路徑（底層，最優先）

**agent**: developer
**files**: `~/.claude/scripts/lib/paths.js`
**依賴**: 無（底層，所有後續任務依賴它）

新增以下路徑函式到 `session` 物件：

- `workflowDir(sessionId, workflowId)` — workflow 子目錄
- `workflowFile(sessionId, workflowId)` — workflow.json
- `workflowTimeline(sessionId, workflowId)` — timeline.jsonl
- `workflowHandoffsDir(sessionId, workflowId)` — handoffs/
- `workflowHandoff(sessionId, workflowId, stageKey)` — handoffs/{stageKey}.md
- `activeWorkflowId(sessionId)` — active-workflow-id 檔案
- `agentMapping(sessionId)` — agent-mapping.json

保留舊路徑（`session.workflow`、`session.timeline`、`session.handoff`）並標記 deprecated，供 migration fallback 讀取使用。

**驗收**：unit test 確認所有新路徑函式回傳正確字串。

---

### T2：state.js — 所有函式加入 workflowId 參數（底層）

**agent**: developer
**files**: `~/.claude/scripts/lib/state.js`
**依賴**: T1

改動：

- `readState(sessionId, workflowId)` — 路徑改用 `paths.session.workflowFile`
- `writeState(sessionId, workflowId, state)` — 同上
- `initState(sessionId, workflowId, workflowType, stageList, options)` — 新增參數，state 物件記錄 `workflowId` 欄位
- `updateStage(sessionId, workflowId, stageKey, update)`
- `setFeatureName(sessionId, workflowId, name)`
- `updateStateAtomic(sessionId, workflowId, modifier)` — 路徑使用 workflowFile
- `sanitize(sessionId, workflowId)`
- `enforceInvariants` 內部呼叫 `timeline.emit` 時，從 `state.workflowId` 取得 workflowId（避免額外參數）

**驗收**：既有 state.js 單元測試仍 pass，新 signature 有測試覆蓋。

---

### T3：timeline.js — 路徑改為 workflow 層級

**agent**: developer
**files**: `~/.claude/scripts/lib/timeline.js`
**依賴**: T1

所有函式（`emit`、`read`、`tail`、`readAll`、`clear`）加入 `workflowId` 參數，路徑改用 `paths.session.workflowTimeline(sessionId, workflowId)`。

**驗收**：timeline unit test 仍 pass，新 signature 有測試覆蓋。

---

### T4：init-workflow.js — 生成 workflowId + 建立目錄 + 寫 active-workflow-id

**agent**: developer
**files**: `~/.claude/scripts/init-workflow.js`
**依賴**: T1、T2、T3

改動：

1. 生成 workflowId：`Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6)`（格式如 `lz4abc12-r2xy`）
2. `mkdirSync(paths.session.workflowDir(sessionId, workflowId), { recursive: true })` 建立目錄
3. `writeFileSync(paths.session.activeWorkflowId(sessionId), workflowId)` 寫入前景 workflow ID
4. `state.initState(sessionId, workflowId, workflowType, ...)` 改用新 signature
5. `timeline.emit(sessionId, workflowId, 'workflow:start', ...)` 改用新 signature
6. 輸出 workflowId 到 stdout

**驗收**：執行後 `~/.overtone/sessions/{sessionId}/workflows/{workflowId}/workflow.json` 存在，`active-workflow-id` 內容正確。

---

### T5：agent-mapping.js — 新增讀寫工具模組

**agent**: developer
**files**: `~/.claude/scripts/lib/agent-mapping.js`（新增）
**依賴**: T1

新增獨立模組管理 agent-mapping：

- `readMapping(sessionId)` — 讀取 agent-mapping.json，不存在時回傳 `{}`
- `writeMapping(sessionId, agentInstanceId, workflowId)` — 原子寫入（讀取 → 合併 → atomicWrite）
- `lookupWorkflow(sessionId, agentInstanceId)` — 查詢 agentInstanceId 對應的 workflowId，找不到回傳 `null`
- `removeEntry(sessionId, agentInstanceId)` — agent 完成後清除 mapping

**驗收**：unit test 覆蓋 lookup + concurrent write 場景。

---

### T6：pre-task-handler.js — 委派時寫入 agent-mapping + 讀 active-workflow-id

**agent**: developer
**files**: `~/.claude/scripts/lib/pre-task-handler.js`
**依賴**: T2、T5

改動：

1. 讀 `paths.session.activeWorkflowId(sessionId)` 取得 workflowId
2. 若找不到，fallback 至 migration 路徑（讀舊根層 `workflow.json`）
3. `state.readState(sessionId, workflowId)`
4. 生成 instanceId 後呼叫 `agentMapping.writeMapping(sessionId, instanceId, workflowId)`
5. `state.updateStateAtomic(sessionId, workflowId, ...)`
6. `timeline.emit(sessionId, workflowId, ...)`

**驗收**：委派後 `agent-mapping.json` 存在且有正確的 `{ instanceId: workflowId }` 條目。

---

### T7：agent-stop-handler.js — 查 agent-mapping 定位正確 workflow（核心修復）

**agent**: developer
**files**: `~/.claude/scripts/lib/agent-stop-handler.js`
**依賴**: T2、T3、T5

改動（最核心的競態修復）：

1. 解析 `resolvedInstanceId`（現有邏輯，保留）
2. 呼叫 `agentMapping.lookupWorkflow(sessionId, resolvedInstanceId)` 取得 workflowId
3. 若找不到：fallback 至讀 `active-workflow-id`，再 fallback 至舊路徑（migration）
4. 所有 `readState(sessionId)` 改為 `readState(sessionId, workflowId)`
5. 所有 `updateStateAtomic(sessionId, ...)` 改為 `updateStateAtomic(sessionId, workflowId, ...)`
6. handoff 寫入改用 `paths.session.workflowHandoff(sessionId, workflowId, actualStageKey)`
7. `timeline.emit` 改用 workflow 層級
8. 完成後呼叫 `agentMapping.removeEntry(sessionId, resolvedInstanceId)` 清除 mapping
9. Fallback 路徑記錄 `hookError` 供追蹤

**驗收**：多 workflow 並行場景下，各 `workflow.json` 只被自己的 agent 更新，不互相覆蓋。

---

### T8：on-submit-handler.js — 讀 active-workflow-id 注入 context

**agent**: developer
**files**: `~/.claude/scripts/lib/on-submit-handler.js`
**依賴**: T2

改動：

1. 讀取 `paths.session.activeWorkflowId(sessionId)` 取得 workflowId
2. `state.readState(sessionId, workflowId)`
3. 若無 workflowId，fallback 至舊路徑

**驗收**：workflow context 仍正常注入 prompt。

---

### T9：pre-edit-guard.js + hook-utils.js — 讀 active-workflow-id

**agent**: developer
**files**:
- `~/.claude/hooks/scripts/tool/pre-edit-guard.js`
- `~/.claude/scripts/lib/hook-utils.js`（`buildWorkflowContext`）
**依賴**: T2

改動：

1. `pre-edit-guard.js`：讀 `active-workflow-id`，`readState(sessionId, workflowId)`
2. `hook-utils.js buildWorkflowContext`：加入 workflowId 參數，`readState(sessionId, workflowId)`

**驗收**：guard 仍能正確判斷 workflow 階段。

---

### T10：其餘 handler 批次更新

**agent**: developer
**files**:
- `~/.claude/scripts/lib/session-stop-handler.js`
- `~/.claude/scripts/lib/pre-compact-handler.js`
- `~/.claude/scripts/lib/feature-sync.js`
- `~/.claude/scripts/lib/baseline-tracker.js`
- `~/.claude/scripts/lib/session-digest.js`
- `~/.claude/scripts/lib/dashboard/sessions.js`
- `~/.claude/scripts/lib/remote/event-bus.js`
- `~/.claude/scripts/lib/remote/dashboard-adapter.js`
**依賴**: T2

所有 `state.readState(sessionId)` 改為先讀 `active-workflow-id` 取得 workflowId 再呼叫。

特別注意：

- `session-stop-handler.js`：loop 自動接續邏輯使用 active-workflow-id
- `pre-compact-handler.js`：handoff 讀取路徑改為 workflow 層級
- `remote/event-bus.js`：watch 路徑改為 `paths.session.workflowFile(sessionId, workflowId)`

**驗收**：dashboard、session-stop、pre-compact 功能正常。

---

### T11：測試更新與新增

**agent**: tester
**files**: `~/projects/overtone/tests/`
**依賴**: T1-T10 全部完成

需要新增或更新的測試：

1. `tests/unit/paths.test.js` — 新路徑函式覆蓋
2. `tests/unit/state.test.js` — 新 signature（sessionId + workflowId）
3. `tests/unit/timeline.test.js` — 新 signature
4. `tests/unit/agent-mapping.test.js` — 新模組（新增）
5. `tests/integration/multi-workflow.test.js` — 多 workflow 並行隔離場景（新增，核心）
6. `tests/integration/migration.test.js` — 舊格式 fallback 場景（新增）

**驗收**：`bun test` 全 pass，多實例隔離核心邏輯有測試覆蓋。

## Dev Phases

```
Phase 1（sequential — 底層基礎）
  T1: paths.js 新增 workflow 路徑

Phase 2（parallel — 底層可同時進行）
  T2: state.js 更新 signature       <- 依賴 T1
  T3: timeline.js 更新 signature    <- 依賴 T1
  T5: agent-mapping.js 新模組       <- 依賴 T1

Phase 3（sequential — 新 init 邏輯）
  T4: init-workflow.js              <- 依賴 T1 + T2 + T3

Phase 4（parallel — hook 層改動）
  T6: pre-task-handler.js          <- 依賴 T2 + T5
  T7: agent-stop-handler.js        <- 依賴 T2 + T3 + T5
  T8: on-submit-handler.js         <- 依賴 T2
  T9: pre-edit-guard + hook-utils  <- 依賴 T2

Phase 5（sequential — 其餘 handler）
  T10: 其他 handler 批次更新        <- 依賴 T2

Phase 6（sequential — 測試）
  T11: 測試更新與新增               <- 依賴全部完成
```

## Migration Strategy

### 原則：雙讀 fallback，不阻擋現有 session

新版本上線後，已有的 session 仍使用舊格式（根層 `workflow.json` + `timeline.jsonl`）。不做自動 migration（執行中的 session 不可中斷），改採雙讀 fallback：

**Fallback 順序（所有讀取點）**：

```
1. 讀 active-workflow-id 取得 workflowId
   -> 成功 -> 讀 workflows/{workflowId}/workflow.json

2. active-workflow-id 不存在（舊 session）
   -> 讀根層 workflow.json（舊路徑）
   -> 若存在 -> 使用，靜默降級

3. 兩者皆不存在
   -> 回傳 null（現有行為不變）
```

### workflowId 生成規則

格式：`{timestamp36}-{random4}`，如 `lz4abc12-r2xy`

- `Date.now().toString(36)`（~8 字元，毫秒時間戳）+ `'-'` + `Math.random().toString(36).slice(2, 6)`（4 字元）
- 總長度 ~13 字元，全小寫英數，無需外部套件
- 同一 session 內兩個 workflow 間隔至少數秒，碰撞機率可忽略

### 不做的事

- 不自動遷移舊 session 的 `workflow.json` 到新目錄（避免中斷進行中的工作）
- 不刪除舊路徑定義（保留 deprecated 標記，待下一個 major version 清除）

## Risks

### R1（高）：agent-stop-handler fallback 邏輯複雜

**問題**：`resolvedInstanceId` 從 agentOutput regex 解析，若 agent 輸出沒有 INSTANCE_ID，mapping lookup 失敗，fallback 鏈增長。

**緩解**：
- 現有 fallback（按 agentName 找 activeAgents 最後一筆）保留
- fallback 後額外嘗試讀 `active-workflow-id` 作為最後手段
- 每個 fallback 路徑記錄 `hookError`，方便追蹤

---

### R2（高）：enforceInvariants 內 timeline lazy require 的 signature 更新

**問題**：`enforceInvariants` 中有 `require('./timeline').emit(state.sessionId, ...)`，改 signature 後需同步傳入 workflowId。

**緩解**：state 物件本身記錄 `workflowId` 欄位（initState 時寫入），enforceInvariants 從 `state.workflowId` 讀取，不需額外參數傳遞。

---

### R3（中）：remote/event-bus.js 用 fs.watch 監聽 workflow.json

**問題**：`event-bus.js` 直接 watch `paths.session.workflow(sessionId)`，路徑移動後監聽失效。

**緩解**：需要傳入 workflowId，watch 路徑改為 `workflowFile(sessionId, workflowId)`。Dashboard 功能在 T10 處理，可接受短暫降級（非核心路徑）。

---

### R4（中）：pre-task-handler 讀 active-workflow-id 的 TOCTOU 問題

**問題**：讀取 `active-workflow-id` 後，若使用者在 hook 執行期間切換前景 workflow，可能讀到錯誤的 workflowId。

**緩解**：pre-task hook 執行窗口極短（<50ms），實際發生機率極低。mapping 寫入後以 instanceId 為 key 綁定，後續 on-stop 查 mapping 不受影響。此風險可接受。

---

### R5（低）：agent-mapping.json 無限成長

**問題**：每次委派都寫入一筆，若 `removeEntry` 未正確呼叫，檔案持續成長。

**緩解**：`removeEntry` 在 on-stop 完成後呼叫；session 結束後整個 session 目錄可清理；即使累積 100 筆條目也僅 ~3KB。

---

### R6（低）：multi-workflow 測試需加入 SEQUENTIAL_FILES

**問題**：新增的 multi-workflow integration 測試操作共享 session 目錄，需加入 `test-parallel.js` 的 SEQUENTIAL_FILES 清單。

**緩解**：在 T11 時處理，tester 熟悉此機制。
