---
feature: parallel-convergence-gate
stage: PLAN
created: 2026-03-04
workflow: standard
---

# 並行收斂門（Parallel Convergence Gate）— Proposal

## 需求背景（Why）

**問題**：Main Agent 並行委派同一 stage 的多個 developer agents 時，pipeline 工作鏈完全失靈。
第一個 developer 完成就觸發 stage 跳轉，其餘 agents 的 SubagentStop 結果被靜默吞掉。
導致部分程式碼未被執行、結果未被聚合、timeline 事件不完整。

**根因（4 個）**：
- R1：`activeAgents` 以 agentName 為 key，5 個 developer 互相覆蓋（`pre-task.js:176`、`on-stop.js:50`）
- R2：`on-stop.js:51-54` 即完即跳，第一個 developer 完成就 `status:'completed'` + `currentStage` 跳轉
- R3：`findActualStageKey` 找不到已 completed 的 stage，其餘 agents 的 SubagentStop 直接 exit0
- R4：`active-agent.json` 是單一物件覆寫，只追蹤最後一個 agent

**目標**：實作收斂門機制，確保同一 stage 的所有並行 agents 全部完成後才推進 pipeline。

**優先級**：P3.3 系統層的核心 tasks 需要並行執行 5 個 developer agents，此 bug 若不修復會導致 P3.3 開發流程錯誤。

## 使用者故事

```
身為 Main Agent
我想要並行委派同一 stage 的多個 developer agents
以便所有 sub-tasks 都被執行完畢後才推進到下一個 stage
```

```
身為 Overtone pipeline 系統
我想要正確追蹤並行 agent 實例的個別狀態
以便任一 fail 時 stage 標記為 fail，全部 pass 時才標記 pass
```

## 範圍邊界

### 在範圍內（In Scope）

**Must（方案 C = A + B）**：
- 收斂門（Convergence Gate）：`on-stop.js` 加入並行計數，全部完成才標記 stage completed
- Instance-based 追蹤：`activeAgents` 改用 `instanceId`（`agentName:timestamp`）為 key
- `active-agent.json` 改為陣列格式（多 agent 並行時記錄所有實例）
- `findActualStageKey` 修正：允許同一 stage 被多個 agents 使用（active 狀態），不因 completed 而 return null
- 結果聚合：任一 fail → stage fail；全部 pass → stage pass
- Timeline 正確性：N 個 `agent:complete` + 1 個 `stage:complete`
- `getNextStageHint`：修正為有 active agents 時正確等待
- statusline：`developer × N` 顯示

**測試覆蓋**：
- `state.js` 新增函式的單元測試
- `on-stop.js` 並行收斂情境整合測試
- `pre-task.js` instanceId 追蹤測試
- `statusline.js` × N 顯示回歸測試

### 不在範圍內（Out of Scope）

- 跨 stage 並行（不同 stage 同時執行）
- 同 stage 不同 agent type（僅支援同類型 agent 並行）
- CAS 升級 file lock（現有 CAS + 3 次重試機制維持不變）
- Dashboard 即時並行進度推送
- 超時偵測（agent 掛起不超時）
- 個別 agent 進度訊息顯示

## MoSCoW 優先級

| 優先級 | 項目 |
|--------|------|
| Must | 收斂門 + 並行計數 + findActualStageKey 修正 + 結果聚合 + Timeline 正確性 |
| Should | instanceId 為 key + active-agent.json 陣列 + statusline × N + getNextStageHint 修正 |
| Could | Dashboard 即時推送、個別進度提示、超時偵測 |
| Won't | 跨 stage 並行、同 stage 不同 agent type、CAS 升級 |

## BDD 驗收標準

1. 並行 3 個 developer 全 pass → stage 在最後一個完成時才 completed，3 個 agent:complete + 1 個 stage:complete
2. 並行 3 個 developer 其中 1 個 fail → stage fail（最嚴格判定）
3. activeAgents 正確追蹤多個同類 agent instance（instanceId 為 key）
4. statusline 顯示 developer × N
5. 非並行 stage 行為不變（回歸測試）

## 任務分解

### 核心修改（有依賴關係）

1. **state.js 新增 `checkSameStageConvergence` 函式** | agent: developer | files: `plugins/overtone/scripts/lib/state.js`, `tests/unit/state-convergence.test.js`
2. **pre-task.js instanceId 追蹤** | agent: developer | files: `plugins/overtone/hooks/scripts/tool/pre-task.js`（依賴 state.js 變更）
3. **on-stop.js 收斂門邏輯** | agent: developer | files: `plugins/overtone/hooks/scripts/agent/on-stop.js`（依賴 state.js 變更）
4. **active-agent.json 改陣列** | agent: developer | files: `plugins/overtone/scripts/lib/paths.js`、`plugins/overtone/scripts/statusline.js`（依賴 pre-task.js + on-stop.js）
5. **statusline × N 修正** | agent: developer | files: `plugins/overtone/scripts/statusline.js`（依賴 active-agent.json 格式）

### 測試（可與核心修改並行，先寫 spec 後 verify）

6. **state-convergence.test.js**：新函式單元測試 | agent: tester | files: `tests/unit/state-convergence.test.js`
7. **on-stop 並行場景回歸測試** | agent: tester | files: `tests/unit/stop-message-builder.test.js`（部分）
8. **statusline × N 回歸測試（已存在）** | agent: tester | files: `tests/unit/statusline.test.js`

## Open Questions for Architect

1. **instanceId 格式**：`agentName:timestamp` 還是 `agentName:uuid4` 還是自增計數器？timestamp 可能在高頻並行時碰撞。
2. **stageParallelCount 儲存位置**：記在 `state.stages[key]` 裡（`{ ..., parallelCount: N }`）還是獨立欄位（`state.stageParallelCounts`）？
3. **`findActualStageKey` 並行場景**：同一 stage 有多個 active instances 時，函式應回傳哪個 key？或需要改為回傳陣列？
4. **active-agent.json 向後相容**：statusline.js 目前讀取單一物件格式，改為陣列後如何最小化破壞範圍？
5. **`on-stop.js` 的 `delete s.activeAgents[agentName]`**：改為 instanceId 後，清除邏輯需要哪些欄位（`input.instance_id`？）— Claude Code SubagentStop hook input 有哪些欄位？
