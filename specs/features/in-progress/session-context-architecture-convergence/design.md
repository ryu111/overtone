# 設計：SessionContext 架構收斂重構

## 技術摘要（What & Why）

- **方案**：三階段漸進清除舊 overload API，全面遷移至 SessionContext Ctx API
- **理由**：state.js / timeline.js 現有 overload 函式（每個支援 3 種呼叫方式）導致測試難以維護（215 次 `initState` 舊 API 呼叫分散在 37 個測試檔案）、線上 handler 因漏用 SessionContext 而跳過路徑解析一致性保護
- **取捨**：不做向後相容，一次性刪除舊 API；接受短期大量改動換取長期單一入口

### 目標架構

重構完成後：

1. **SessionContext 是唯一入口**：所有 handler 呼叫 `SessionContext.fromInput(input)` 或 `new SessionContext(...)`，再用 ctx 呼叫 state/timeline 的 Ctx API
2. **state.js 只保留 Ctx API**：刪除 `readState`、`writeState`、`initState`、`updateStage`、`setFeatureName`、`sanitize`、`updateStateAtomic`、`enforceInvariants`（舊 overload 版），保留所有 `*Ctx` 函式及純函式（`findActualStageKey`、`checkSameStageConvergence`、`checkParallelConvergence`、`getNextStageHint`）
3. **timeline.js 只保留 Ctx API**：刪除 `emit`、`query`、`count`、`latest`、`trimIfNeeded`、`passAtK`（舊 overload 版），保留所有 `*Ctx` 函式及 `cleanupOldSessions`
4. **`_isProjectRoot` 可刪除**：不再需要 overload 偵測機制

---

## API 介面設計

### state.js — 刪除後的 exports

```javascript
// 保留（Ctx API）
module.exports = {
  readStateCtx,        // (ctx) => object|null
  writeStateCtx,       // (ctx, stateObj) => void
  initStateCtx,        // (ctx, workflowType, stageList, options) => object
  updateStageCtx,      // (ctx, stageKey, update) => object
  setFeatureNameCtx,   // (ctx, name) => void
  sanitizeCtx,         // (ctx) => { fixed, state }|null
  updateStateAtomicCtx,// (ctx, modifier) => object
  enforceInvariantsCtx,// (state, ctx) => state   ← 純邏輯，保留用於測試
  // 純函式（無 I/O）— 不變
  findActualStageKey,
  checkSameStageConvergence,
  checkParallelConvergence,
  getNextStageHint,
};
// 刪除：readState, writeState, initState, updateStage, setFeatureName,
//        sanitize, updateStateAtomic, enforceInvariants（舊 overload 版）
```

### timeline.js — 刪除後的 exports

```javascript
// 保留（Ctx API）
module.exports = {
  emitCtx,        // (ctx, eventType, eventData) => event
  queryCtx,       // (ctx, filter) => event[]
  countCtx,       // (ctx, filter) => number
  latestCtx,      // (ctx, eventType) => event|null
  trimIfNeededCtx,// (ctx) => void
  passAtKCtx,     // (ctx) => { sessionId, computed, stages, overall }
  cleanupOldSessions, // 不涉及 SessionContext（保留原樣）
};
// 刪除：emit, query, count, latest, trimIfNeeded, passAtK（舊 overload 版）
```

### 函式名稱去後綴（可選決策 — 詳見關鍵技術決策）

重構完成後，若決定去後綴，以 `rename` 方式：
```javascript
// state.js
readStateCtx    → readState
initStateCtx    → initState
// 以此類推（alias 導出過渡期可選）
```

### _loadHandoffContext 跨 handler 共用

`_loadHandoffContext` 目前只在 `pre-compact-handler.js` 使用，不需要跨 handler 共用。
若 session-start-handler.js 需要相同邏輯，直接 require pre-compact-handler 即可（現有模式）。

---

## 資料模型

無新增資料模型。現有 workflow.json / timeline.jsonl schema 不變。

---

## 檔案結構

```
修改的程式碼：
  ~/.claude/scripts/lib/state.js
    ← 刪除 overload 函式（Phase 3）
  ~/.claude/scripts/lib/timeline.js
    ← 刪除 overload 函式（Phase 3）
  ~/.claude/scripts/lib/paths.js
    ← 刪除 _isProjectRoot（Phase 3，在 state/timeline 無引用後）
  ~/.claude/scripts/lib/session-context.js
    ← 無需修改（設計已完整）

  未遷移 handler（Phase 1）：
    ~/.claude/scripts/lib/on-submit-handler.js
    ~/.claude/scripts/lib/session-start-handler.js
    ~/.claude/scripts/lib/session-end-handler.js
    ~/.claude/scripts/lib/post-use-handler.js（無 state/timeline 呼叫，僅用 getSessionId/resolveProjectRoot）
    ~/.claude/scripts/lib/post-use-failure-handler.js
    ~/.claude/scripts/lib/pre-compact-handler.js（已 import SessionContext 但未使用）

  非 handler 消費者（Phase 2）：
    ~/.claude/scripts/lib/feature-sync.js
    ~/.claude/scripts/lib/hook-utils.js
    ~/.claude/scripts/lib/session-digest.js
    ~/.claude/scripts/lib/baseline-tracker.js
    ~/.claude/scripts/lib/dashboard/sessions.js
    ~/.claude/scripts/lib/remote/event-bus.js
    ~/.claude/scripts/lib/remote/dashboard-adapter.js

修改的測試（Phase 4）：
  ~/projects/overtone/tests/unit/*.test.js（37 個含 initState 舊 API 的測試）
  ~/projects/overtone/tests/integration/*.test.js（含舊 API 的整合測試）
  ~/projects/overtone/tests/unit/session-context.test.js（新增，若尚未存在）

新增的測試 helper（Phase 4）：
  ~/projects/overtone/tests/helpers/session-factory.js（已建好，推廣採用）
```

---

## 關鍵技術決策

### 決策 1：Ctx 函式是否去掉後綴

- **選項 A（去後綴）**（建議）：`readStateCtx` → `readState`，完成重構後執行 rename。呼叫端更自然，不用記憶「哪個版本要加 Ctx」。過渡期可用 alias（`readState: readStateCtx`）避免測試同時爆炸
- **選項 B（保留後綴）**（未選）：保留現狀不 rename，風險是未來仍有人誤用舊 API 名稱（若舊 API 已刪，則只是命名難看，無功能問題）

**結論**：Phase 3 刪舊 overload 時，同步加 alias（`readState = readStateCtx`）；Phase 5 統一 rename + 更新所有呼叫端。這樣可以分批操作降低風險。

### 決策 2：session-end-handler.js 的 `readState(sessionId)` 純舊 API

`session-end-handler.js` 第 125 行有 `state.readState(projectRoot, sessionId)` 和第 146 行 `state.readState(sessionId)`（無 projectRoot）：
- 第 125 行：已有 projectRoot（`paths.resolveProjectRoot(input)` 取得），改為 `state.readStateCtx(new SessionContext(projectRoot, sessionId))`
- 第 146 行：只有 sessionId，無 workflowId 且無 projectRoot 意圖讀 session 層級狀態（看 appliedObservationIds）— 此處 projectRoot 可從 `handleSessionEnd` 函式已有的 `projectRoot` 變數取得，直接傳入

### 決策 3：非 handler 消費者的 ctx 來源

非 handler 消費者（feature-sync、baseline-tracker 等）已接受 `(projectRoot, sessionId, workflowId)` 三個參數，改法一致：
```javascript
// 現在
state.readState(projectRoot, sessionId, workflowId)
// 改為
state.readStateCtx(new SessionContext(projectRoot, sessionId, workflowId))
```

不需要在 utils 層建立 SessionContext 工廠，直接在呼叫點 `new SessionContext(...)` 即可（三行改為一行）。

### 決策 4：測試遷移策略

37 個含 `initState` 的測試檔案分兩類：
1. **直接測試 state.js 功能** — 改用 `initStateCtx(ctx, ...)` + session-factory 的 `setupWorkflow`
2. **測試 handler 行為（用 initState 建立前置狀態）** — 改用 `session-factory.setupWorkflow(ctx, ...)`

session-factory.js 已建好但零採用率，Phase 4 逐批推廣。

---

## 分階段實作計劃

### Phase 1：遷移 6 個未遷移 handler（優先）

目標：所有 handler 使用 SessionContext 呼叫 state/timeline

**Phase 1 工作項目**（可部分並行，詳見 tasks.md）：
- pre-compact-handler.js：已 import SessionContext，補上 `ctx = new SessionContext(projectRoot, sessionId, workflowId)` 並用 ctx 呼叫 `state.readStateCtx` / `state.updateStateAtomicCtx` / `timeline.emitCtx`
- on-submit-handler.js：建立 ctx，改用 `state.readStateCtx(ctx)`
- session-start-handler.js：建立 ctx，改用 `state.sanitizeCtx` / `timeline.emitCtx`
- session-end-handler.js：補上 ctx，修復兩處舊 API 呼叫
- post-use-failure-handler.js：`timeline.emit(projectRoot, sessionId, null, ...)` → `timeline.emitCtx(new SessionContext(projectRoot, sessionId, null), ...)`
- post-use-handler.js：不呼叫 state/timeline，只需確認 SessionContext 已 import 並用於路徑解析

### Phase 2：遷移非 handler 消費者

目標：feature-sync / hook-utils / session-digest / baseline-tracker / dashboard / remote 模組

### Phase 3：刪除 overload 函式 + 加 alias

目標：從 state.js / timeline.js 刪除所有舊 overload 函式，加過渡 alias

### Phase 4：測試遷移 + session-factory 推廣

目標：37 個測試檔案從 `initState` 遷移至 `initStateCtx` / `session-factory`

### Phase 5：移除 alias + 重命名 Ctx 後綴（可選）

目標：`readStateCtx` → `readState` 等 rename，清理 paths.js 的 `_isProjectRoot`

---

## 實作注意事項

- `_isProjectRoot` 是 overload 偵測機制，刪除時需確認 state.js / timeline.js 中所有引用均已刪除
- `enforceInvariantsCtx(state, ctx)` 第二參數 ctx 可為 null（`enforceInvariants(state, null)` 現有呼叫），保留此相容性
- session-end-handler.js 的 `_loadHandoffContext` 在 pre-compact-handler.js，跨模組 require 時注意循環依賴（目前是 pre-compact require state/timeline，session-end require pre-compact 不成立 — 不存在循環）
- 測試的 `initState` 多半用舊 3 參數格式（`initState(sessionId, workflowType, stageList)`），session-factory 的 `setupWorkflow(ctx, workflowType, stageList)` 是直接替換品
