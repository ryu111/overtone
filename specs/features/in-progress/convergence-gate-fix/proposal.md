# Convergence Gate Fix — 收斂門 Stale Snapshot 修復

`convergence-gate-fix`

## 需求背景（Why）

- **問題**：並行 agent 完成時，`agent-stop-handler.js` 的 `handleAgentStop` 存在 stale snapshot 競爭條件。第 57 行讀取 state 快照後，第 69-84 行的 `updateStateAtomic` 清除 activeAgents，但第 89 行的 `findActualStageKey` 仍使用舊快照查找 stage key。若兩個並行 agent 幾乎同時完成，後到的 agent 可能讀到舊快照中 stage 仍是 `active`，但實際上先到的 agent 已在 `updateStateAtomic` 中將 stage 標記為 `completed`，導致 `findActualStageKey` 找不到合法 stage（`active`/`pending` 都不符合）→ early exit → `parallelDone` 未遞增 → stage 永久卡住。
- **根因**：`findActualStageKey` 與 `updateStateAtomic` 分離執行，中間存在 TOCTOU 窗口。
- **影響**：standard workflow 的 `[REVIEW + TEST:2]` 並行群組最易觸發，概率性卡住會讓整個 workflow 無法繼續。
- **修復方向**：PM 決定採用 B+C 雙層修復：
  - B（根因）：將 `findActualStageKey` 邏輯移入 `updateStateAtomic` callback，使用最新 state 而非快照
  - C（防禦）：在 `pre-task-handler.js` 委派新 agent 前觸發 mid-session sanitize Rule 4，即使收斂門有遺漏也能在下一次委派前自動修復

## 使用者故事

```
身為 Overtone workflow 引擎
當兩個並行 agent 幾乎同時完成同一 stage 時
應該確保 parallelDone 正確遞增，stage 正常標記 completed，workflow 順利推進下一步
```

```
身為 Main Agent
當我委派下一個 agent 時
如果上一個 stage 因競爭條件遺留了孤兒 active stage
系統應在委派前自動修復，確保不帶錯誤狀態進入下一階段
```

## 範圍邊界

### 在範圍內（In Scope）

- `agent-stop-handler.js`：修復方向 B — 將 stage key 查找移入 `updateStateAtomic` callback（原子讀寫）
- `state.js`：匯出新的組合函式供 handler 使用（若 architect 決定需要）
- `pre-task-handler.js`：修復方向 C — 在委派新 agent 的 `updateStateAtomic` 之前觸發 sanitize Rule 4
- 現有測試更新：確保 `agent-stop-handler` 並行場景的測試覆蓋修復後邏輯
- 新增測試：模擬兩個並行 agent 連續完成的競爭條件場景

### 不在範圍內（Out of Scope）

- `sanitize()` 函式本身的改動 — Rule 4 邏輯已存在且正確，只需增加呼叫點
- `updateStateAtomic` 的 CAS retry 機制調整 — 已有 3 次重試 + jitter，不在此次範圍
- 其他 handler 的 stale snapshot 審查 — 限縮在 `handleAgentStop` 的具體問題路徑
- 監控/告警：不新增 timeline event 追蹤此修復是否被觸發（可在後續迭代加入）

## 子任務清單

1. **修復方向 B：Stage key 查找移入 updateStateAtomic callback**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/agent-stop-handler.js`, `plugins/overtone/scripts/lib/state.js`
   - 說明：`handleAgentStop` 第 89 行 `findActualStageKey(currentState, stageKey)` 使用的是第 57 行的舊快照。修復方式：將 `findActualStageKey` 的呼叫移入第 104 行的 `updateStateAtomic` callback 內，改為傳入 callback 中拿到的最新 `s`（即 `findActualStageKey(s, stageKey)`），確保每次查找都用最新 state。同時，`actualStageKey` 的計算結果需從 callback 內部傳出（可使用 closure 變數）。注意第 91-98 行的 `statusline` 更新和 early exit 邏輯也依賴 `actualStageKey`，需要同步調整。

2. **修復方向 C：Pre-task 委派前觸發 mid-session sanitize**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/pre-task-handler.js`, `plugins/overtone/scripts/lib/state.js`
   - 說明：在 `handlePreTask` 的通過路徑（第 269 行「通過 — 記錄 agent 委派」區段），於 `state.updateStateAtomic` 寫入 activeAgents 之前，先呼叫 `state.sanitize(sessionId)`。這樣若上一個 stage 有遺漏的孤兒 active stage（Rule 4 場景），在下一個 agent 委派前會自動修復。`sanitize()` 已有 `writeState` 副作用，呼叫後無需額外處理。靜默降級：sanitize 失敗不阻擋委派流程（try/catch）。

3. **測試：並行收斂場景覆蓋**
   - 負責 agent：developer
   - 相關檔案：`tests/unit/agent-stop-handler.test.js`（或現有測試檔），`tests/unit/pre-task-handler.test.js`
   - 說明：(a) 新增並行收斂測試：模擬兩個 tester agent 連續呼叫 `handleAgentStop`，驗證第二個 agent 呼叫時 `parallelDone` 正確遞增為 2，stage 正確標記 `completed`，不發生 early exit。(b) 新增 pre-task sanitize 測試：驗證 `handlePreTask` 在委派前觸發 sanitize，孤兒 active stage 被修復為 pending（無 completedAt）或 completed（有 completedAt）。

## 開放問題

- **actualStageKey closure 傳出方式**：修復 B 需要在 `updateStateAtomic` callback 外部使用 `actualStageKey`（用於 statusline 更新 + early exit 判斷 + timeline emit）。最簡單是 `let resolvedActualStageKey = null` closure，在 callback 內賦值後外部使用。架構師確認此模式是否符合現有 callback 風格，或需要調整 `updateStateAtomic` 簽名讓 callback 回傳附加資訊。
- **statusline early exit 的位置**：目前第 91-98 行的 statusline 更新和 early exit（`if (!actualStageKey) return`）在第一個 `updateStateAtomic` 之後、第二個之前。修復後 `actualStageKey` 來自第二個 `updateStateAtomic` 內部，這兩個邏輯的位置需要架構師決定是否需要重組執行順序（例如先跑第二個 updateStateAtomic 取得 actualStageKey，再處理 statusline 和 early exit）。
- **sanitize 呼叫頻率**：pre-task 每次委派都觸發 sanitize，若 sanitize 讀寫 workflow.json 效能是否可接受？架構師評估是否需要加 skip-if-no-active-stages 快速路徑。
