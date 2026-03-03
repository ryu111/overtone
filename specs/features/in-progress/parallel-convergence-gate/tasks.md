---
feature: parallel-convergence-gate
stage: ARCH
created: 2026-03-04
workflow: standard
---

# 並行收斂門（Parallel Convergence Gate）— Tasks

## 子任務清單

- [ ] PLAN
- [ ] ARCH
- [ ] TEST
- [ ] DEV
- [ ] REVIEW
- [ ] TEST
- [ ] RETRO
- [ ] DOCS

## Dev Phases

架構分析：

- **Phase 1**：state.js 必須先完成，pre-task.js 和 on-stop.js 依賴其新 API
- **Phase 2**：pre-task.js 和 on-stop.js 只有 state.js 這一個前置依賴，兩者可並行
- **Phase 3**：getNextStageHint 修正依賴 activeAgents key 格式（Phase 2 產出），active-agent.json 刪除邏輯依賴 on-stop.js（Phase 2），兩者可並行
- **Phase 4**：測試驗證依賴所有實作，部分測試（state-convergence.test.js）只需 Phase 1 完成即可先行
- statusline.js 不需要修改（active-agent.json 格式維持不變，× N 已由 workflow.stages active count 驅動）

### Phase 1: state.js 基礎（sequential）
- [ ] 新增 `checkSameStageConvergence(stageEntry)` 函式並 export | files: `plugins/overtone/scripts/lib/state.js`
- [ ] 修改 `getNextStageHint`：activeAgents key 為 instanceId 時正確顯示 agentName（從 `entry.agentName` 欄位讀取） | files: `plugins/overtone/scripts/lib/state.js`

### Phase 2: hook 實作（parallel）
- [ ] pre-task.js instanceId 追蹤：activeAgents 改用 instanceId 為 key（`agentName:timestamp36-random6`），寫入 agentName 欄位；從 prompt 解析 `PARALLEL_TOTAL` 寫入 stage entry `parallelTotal`；updatedInput prompt 注入 `[PARALLEL INSTANCE]` 區塊（INSTANCE_ID + PARALLEL_TOTAL） | files: `plugins/overtone/hooks/scripts/tool/pre-task.js`
- [ ] on-stop.js 收斂門：從 agentOutput 解析 INSTANCE_ID（regex），fallback 至找 activeAgents 中最早的同名 instance；遞增 `parallelDone`；僅當收斂（parallelDone >= parallelTotal）或 fail/reject 時才標記 stage completed + 推進 currentStage；active-agent.json 改為僅在收斂後才刪除 | files: `plugins/overtone/hooks/scripts/agent/on-stop.js`

### Phase 3: 輔助修正（parallel）
- [ ] state-convergence.test.js：`checkSameStageConvergence` 單元測試 + `findActualStageKey` 並行場景回歸 | files: `tests/unit/state-convergence.test.js`
- [ ] stop-message-builder.test.js：補充並行場景測試（第 1 個 instance 完成不顯示 stage 完成訊息，第 N 個才顯示） | files: `tests/unit/stop-message-builder.test.js`

### Phase 4: 回歸驗證（sequential）
- [ ] 執行 `bun test` 確認所有現有測試通過，重點驗證 statusline.test.js 的 × N 測試 | files: `tests/unit/statusline.test.js`、`tests/unit/state-helpers.test.js`
