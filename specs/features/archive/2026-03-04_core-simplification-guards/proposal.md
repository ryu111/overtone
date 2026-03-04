---
feature: core-simplification-guards
status: in-progress
created: 2026-03-04
author: planner
---

# 提案：核心簡化與不變量守衛

## 背景與動機

目前 Overtone 的 workflow state 管理和 status line 顯示存在「雙信號源 + TTL workaround」問題：

1. **雙信號源**：`active-agent.json`（即時但只記錄最後一個 agent）+ `workflow.json activeAgents`（並行場景正確但有殘留風險），statusline.js 必須以主信號/副信號邏輯合併，增加複雜度。
2. **TTL workaround**：`state.js` 的 `getNextStageHint()`、`statusline.js` 的 `buildAgentDisplay()`、`pre-compact.js` 的活躍 agents 顯示，三處各自複製相同的 30 分鐘 TTL 過濾邏輯來防止殘留顯示。
3. **缺乏不變量守衛**：state 轉換（pending → active → completed）和並行計數（parallelDone <= parallelTotal）缺乏程式碼層面的保護，靠呼叫方自律。
4. **on-stop.js 並行提示不完整**：Stop hook 的 continueMessage 硬編碼單步提示，未使用已存在的 `getNextStageHint()` 並行群組邏輯。

## 目標

- 移除 `active-agent.json` 信號源，統一為單一信號源（`workflow.json`）
- 移除 3 處 TTL workaround（以 B3 在壓縮時主動清空 activeAgents 取代）
- 在 `updateStateAtomic` 加入不變量守衛，違反時自動修復 + 警告
- 修復 Stop hook 的 continueMessage 使用 `getNextStageHint()` 輸出並行提示

## 工作項目

### A 組：並行提示修復（可獨立並行）

**A1 — Stop hook 改用 `getNextStageHint()`**

- 檔案：`plugins/overtone/hooks/scripts/session/on-stop.js`
- 位置：第 202 行 `continueMessage` 陣列中的提示行
- 現狀：`def ? '⏭️ 繼續：委派 ${def.emoji} ${def.agent}（${def.label}）' : '⏭️ 繼續執行下一步'`
- 目標：改為呼叫 `state.getNextStageHint(currentState, { stages, parallelGroups })`，並在 on-stop.js 中 import `parallelGroups` 與 `getNextStageHint`
- 行為改變：並行群組時會顯示「並行委派 🔍 code-reviewer + 🧪 tester」而非單一 agent 提示

**A2 — PreCompact 加入並行群組提示**

- 檔案：`plugins/overtone/hooks/scripts/session/pre-compact.js`
- 位置：第 101-105 行「目前階段」顯示區塊
- 現狀：只顯示 `currentState.currentStage` 的名稱
- 目標：改為呼叫 `getNextStageHint()`，若為並行群組則顯示完整並行提示；需 import `getNextStageHint` 和 `parallelGroups`

### B 組：Status Line 簡化（B1 → B2 依序，B3 可並入 C 組）

**B1 — 移除 `active-agent.json` 寫入與清除邏輯**

- 檔案：`plugins/overtone/hooks/scripts/tool/pre-task.js`（第 42-46 行）
- 檔案：`plugins/overtone/hooks/scripts/agent/on-stop.js`（第 65-70 行、第 143-144 行）
- 操作：刪除所有 `atomicWrite(paths.session.activeAgent(...))` 和 `unlinkSync(paths.session.activeAgent(...))` 呼叫
- 注意：`paths.js` 的 `session.activeAgent` 保留（測試可能引用），但後續可評估一併移除

**B2 — statusline.js 移除主信號分支**

- 檔案：`plugins/overtone/scripts/statusline.js`
- 操作：
  - 刪除 `readActiveAgent()` 函式（第 115-122 行）
  - 刪除 `main()` 中 `const activeAgent = ...` 和 `readActiveAgent(sessionId)` 呼叫（第 285-286 行）
  - `buildAgentDisplay()` 移除 `activeAgent` 參數和主信號分支（第 165-187 行），只保留 stages.status + activeAgents 邏輯
  - 移除 statusline.js 第 219-233 行的 TTL workaround（改為只依賴 stage.status === 'active'，由 B3 清空保證無殘留）

**B3 — PreCompact 壓縮後清空 activeAgents**

- 檔案：`plugins/overtone/hooks/scripts/session/pre-compact.js`
- 操作：在壓縮完成後（現有 compactCount 更新邏輯之後）執行
  ```js
  state.updateStateAtomic(sessionId, (s) => { s.activeAgents = {}; return s; });
  ```
- 理由：壓縮時所有 active agent 的結果必然已收到（否則壓縮不會觸發），清空確保重啟後無殘留

### C 組：State 不變量守衛（C1/C2 依序，C3 依賴 B3+C1）

**C1 — `updateStateAtomic` 加入不變量檢查**

- 檔案：`plugins/overtone/scripts/lib/state.js`
- 位置：`modifier(current)` 執行後、`writeState` 執行前
- 不變量規則（3 條）：
  1. **activeAgents 孤兒**：`activeAgents` 中的 `stage` 必須對應存在 `stages` 的 key（找不到 key → 移除該 entry）
  2. **status 順序**：`stage.status` 只能按 `pending → active → completed` 單向轉換（不能逆轉；跳過 active 直接到 completed 允許，但 completed → active 或 active → pending 視為違規 → 保持原 status）
  3. **parallelDone 上限**：`parallelDone` 不能超過 `parallelTotal`（超過時截斷為 parallelTotal）

**C2 — 違反不變量時 emit `system:warning`**

- 檔案：`plugins/overtone/scripts/lib/state.js`
- 操作：在 C1 的自動修復邏輯後，若有任何違規，收集 `warnings` 陣列，並在 `writeState` 後呼叫 `timeline.emit(sessionId, 'system:warning', { warnings })`
- 注意：`system:warning` 已定義在 `registry.js`；timeline emit 在 state 模組中需 require timeline（確認無循環依賴）

**C3 — 移除 3 處 TTL workaround**

- 依賴：B3（PreCompact 清空）+ C1（不變量守衛）完成後才移除
- 位置：
  1. `plugins/overtone/scripts/statusline.js` 第 220-233 行（B2 已處理，隨 B2 一起移除）
  2. `plugins/overtone/hooks/scripts/session/pre-compact.js` 第 115-126 行（活躍 agents 顯示的 TTL 過濾）
  3. `plugins/overtone/scripts/lib/state.js` 第 276-291 行（`getNextStageHint` 的 TTL 過濾）

## 並行性分析

```
A1  ──────────────────────────────────── 獨立
A2  ──────────────────────────────────── 獨立（與 A1 可並行）

B1  ─────────────────────────────┐
B2  ────────────────────（B1 後）─┤ 同一 developer 處理
B3  ────────────────────────────── 獨立（可與 C1 並行）

C1  ──────────────────────────────┐
C2  ────────────────（C1 後）──────┤ 同一 developer 處理
C3  ────────（B3 + C1 後）─────────┘
```

建議委派方式：
- Developer-1（並行提示）：A1 + A2 同時執行
- Developer-2（信號源簡化）：B1 → B2 → B3 依序執行
- Developer-3（不變量守衛）：C1 → C2，C3 等待 Developer-2 完成 B3

## 範圍邊界

**在範圍內：**
- 上述 A/B/C 三組的所有修改
- 測試更新（更新 `tests/unit/statusline.test.js`、`tests/integration/on-stop-stale-cleanup.test.js`、`tests/integration/parallel-convergence-gate.test.js` 中相關 mock）

**不在範圍內：**
- 移除 `paths.js` 的 `session.activeAgent` 定義（保守起見保留，測試仍可能引用）
- Dashboard SSE 推送相關變更
- 變更 `getNextStageHint()` 的邏輯（只是改為在 on-stop.js 呼叫它）
- registry.js 中 TTL 常數化（可選優化，留待後續）

## 驗收條件

- [ ] statusline.js 不再讀取 `active-agent.json`
- [ ] pre-task.js 不再寫入 `active-agent.json`
- [ ] on-stop.js（agent）不再操作 `active-agent.json`
- [ ] Stop hook 的 continueMessage 能輸出並行群組提示
- [ ] PreCompact hook 的目前階段顯示能輸出並行群組提示
- [ ] `updateStateAtomic` 在違反不變量時自動修復並 emit warning
- [ ] 3 處 TTL workaround 全部移除
- [ ] `bun test` 全部通過（3015+ pass）

## 關鍵約束

- `getNextStageHint()` 已在 `state.js` 存在，已支援並行群組提示，不需修改其邏輯
- `system:warning` timeline 事件已定義在 `registry.js`
- `updateStateAtomic` 是原子寫入（讀-改-寫），不變量檢查應在 modifier 執行後、writeState 前執行
- B2 的 TTL 移除與 statusline.js 主信號分支移除可合併為同一次修改
- 移除 active-agent.json 寫入後需確認 `bun test` 測試（statusline.test.js 等有 mock 此檔的測試需同步更新）
