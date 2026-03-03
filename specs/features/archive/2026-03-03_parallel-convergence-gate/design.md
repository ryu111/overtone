---
feature: parallel-convergence-gate
stage: ARCH
created: 2026-03-04
workflow: standard
---

# 並行收斂門（Parallel Convergence Gate）— 技術設計

## 技術方案總覽

在不破壞現有單 agent 流程的前提下，以最小改動面加入「同 stage 多 agent 並行收斂門」。核心策略：

1. `activeAgents` 改用 `instanceId` 為 key（`agentName:timestamp36-random6`），解決同名 agent 互相覆蓋問題
2. stage entry 新增 `parallelTotal` + `parallelDone` 欄位，由 `pre-task.js` 在首次啟動時設定 `parallelTotal`
3. `on-stop.js` 收斂門：每完成一個 instance 遞增 `parallelDone`，僅當 `parallelDone >= parallelTotal` 時才將 stage 標記為 completed
4. `findActualStageKey` 修正：active 狀態的 stage 不因「已有部分 instance 完成」而失效
5. `active-agent.json` 改為陣列格式，statusline 向後相容
6. `checkSameStageConvergence` 新函式，供 on-stop.js 判斷是否收斂

---

## Open Questions 決策

### Q1：instanceId 格式

**決策**：`${agentName}:${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`

範例：`developer:m3xap2k-f7r9qz`

理由：
- timestamp36（base36 encode）提供時間排序能力，6 字元 random 在 3-5 並行規模下防碰撞充足（36^6 = 2.17 億種組合）
- 不用 `crypto.randomUUID()`：完整 UUID 過長（36 字元），當 instanceId 注入到 prompt 時影響可讀性
- 不用純 timestamp：`Date.now()` 毫秒級，同批並行啟動時碰撞概率高（hook 執行速度可能 < 1ms）

### Q2：parallelTotal 欄位位置

**決策**：放在 `state.stages[key]`（stage entry 內）

```javascript
stages: {
  'DEV': {
    status: 'active',
    parallelTotal: 3,  // Main Agent 啟動的 instance 總數（首次 pre-task 設定）
    parallelDone: 1,   // 已完成的 instance 數（on-stop 遞增）
    result: null,
    ...
  }
}
```

理由：parallelTotal/parallelDone 是「這次 stage 執行的屬性」，語義上屬於 stage entry。不需要新增頂層欄位或 `stageParallelCounts` map，保持 schema 內聚。

### Q3：instanceId 傳遞方式

**決策**：updatedInput prompt 注入 `[INSTANCE_ID: xxx]`，on-stop.js 以 regex 解析 agentOutput 取得。若解析失敗，fallback 至「最早登記的同名 instance」。

```
# pre-task.js 注入（prepend 到 prompt 最前面）
[PARALLEL INSTANCE]
INSTANCE_ID: developer:m3xap2k-f7r9qz
PARALLEL_TOTAL: 3
（agent 回覆末尾請附上 INSTANCE_ID: xxx）
```

```javascript
// on-stop.js 解析
const instanceIdMatch = agentOutput.match(/INSTANCE_ID:\s*(\S+)/);
const instanceId = instanceIdMatch?.[1] || null;
// fallback：找 activeAgents 中最早登記的同名 instance
if (!instanceId) {
  const candidates = Object.keys(s.activeAgents)
    .filter(k => k.startsWith(agentName + ':'))
    .sort(); // timestamp36 可排序，取最舊的
  instanceId = candidates[0] || null;
}
```

理由：
- 比「在 SubagentStop input 中傳 instanceId」更可靠（SubagentStop hook input 不一定有自訂欄位）
- fallback 保證即使 agent 未回報 instanceId 也能正確清除（最壞情況：fallback 到任一同名 instance，由 parallelDone 計數保證收斂正確性）

### Q4：findActualStageKey 共用 stage key vs 獨立 key

**決策**：維持共用 stage key（`DEV`，不拆成 `DEV:i1, DEV:i2`）

理由：
- stage 是 workflow 邏輯單元，不是 agent instance 的容器。多個 instance 共享同一個 stage，status 是 stage 層的聚合狀態
- 拆成獨立 key 會破壞 `stageKeys` 的有序序列，影響 `currentStage` 推進邏輯（stage 鏈結構）
- `findActualStageKey` 修正只需調整「active 狀態且未收斂時允許繼續使用」的判斷，不需要改變 key 命名

`findActualStageKey` 修正：新增「active 且 parallelDone < parallelTotal」的優先匹配。

---

## API 介面

### 新增函式：`checkSameStageConvergence`

```typescript
/**
 * 檢查同 stage 的所有並行 instance 是否已全部完成（收斂）
 *
 * @param stageEntry - stages[actualStageKey]
 * @returns true 若 parallelDone >= parallelTotal（或 parallelTotal 未設定，視為單 agent = 已收斂）
 */
function checkSameStageConvergence(stageEntry: StageEntry): boolean
```

### 修改函式：`findActualStageKey`

```typescript
/**
 * 找到 state 中實際的 stage key（處理同 stage 多 instance 並行場景）
 *
 * 優先順序：
 *   1. 完全匹配且 status === 'active'（同 stage 並行中，尚未收斂）
 *   2. 帶編號且 status === 'active'
 *   3. 任何 pending 的（可能還沒標記 active）
 *   4. completed + fail/reject 的（retry 場景）
 *
 * 注意：active 狀態的 stage entry 在並行未收斂時應繼續被找到，
 *       讓後續 instance 的 on-stop 能正確遞增 parallelDone
 */
function findActualStageKey(currentState: WorkflowState, baseStage: string): string | null
```

現有函式簽名不變，只修改邏輯：移除「active 場景因 parallelDone < parallelTotal 而失效」的潛在問題（當前實作已能找到 active stage，此修正主要影響 on-stop.js 後續的更新邏輯）。

### 修改函式：`state.js` 的 `module.exports`

新增 `checkSameStageConvergence` export。

### `pre-task.js` instanceId 寫入介面

```javascript
// activeAgents 新格式（instanceId 為 key）
state.activeAgents[instanceId] = {
  agentName,       // 新增：用於 on-stop 依 agentName 查找
  stage: targetStage,
  startedAt: new Date().toISOString(),
};

// active-agent.json 新格式（陣列）
atomicWrite(paths.session.activeAgent(sessionId), {
  agents: [                          // 改為 agents 陣列
    {
      agent: agentLabel,
      instanceId,
      subagentType,
      startedAt: new Date().toISOString(),
    }
  ],
  updatedAt: new Date().toISOString(),
});
```

但是，`active-agent.json` 的寫入是覆寫行為（atomicWrite），多個 pre-task 並行時會互相覆蓋。解法：on-stop.js 刪除 active-agent.json 時改為讀取→過濾→回寫（而非直接 unlink）。

### `on-stop.js` 收斂門邏輯

```javascript
// 在原子更新內
updateStateAtomic(sessionId, (s) => {
  // 1. 清除 activeAgents 中的 instanceId
  delete s.activeAgents[instanceId];  // instanceId 優先
  // fallback: 若無 instanceId，刪除同名第一個
  if (!instanceId) {
    const key = Object.keys(s.activeAgents).find(k => {
      return s.activeAgents[k].agentName === agentName;
    });
    if (key) delete s.activeAgents[key];
  }

  // 2. 收斂門判斷
  if (s.stages[actualStageKey]) {
    const entry = s.stages[actualStageKey];

    // 遞增 parallelDone
    entry.parallelDone = (entry.parallelDone || 0) + 1;
    const parallelTotal = entry.parallelTotal || 1;
    const converged = entry.parallelDone >= parallelTotal;

    if (result.verdict === 'fail' || result.verdict === 'reject') {
      // 任一 fail/reject 立即標記 stage fail（最嚴格判定）
      Object.assign(entry, { status: 'completed', result: result.verdict, completedAt: new Date().toISOString() });
      const nextPending = Object.keys(s.stages).find(k => s.stages[k].status === 'pending');
      if (nextPending) s.currentStage = nextPending;
    } else if (converged) {
      // 全部 pass，stage 收斂完成
      Object.assign(entry, { status: 'completed', result: 'pass', completedAt: new Date().toISOString() });
      const nextPending = Object.keys(s.stages).find(k => s.stages[k].status === 'pending');
      if (nextPending) s.currentStage = nextPending;
    }
    // 未收斂：stage 維持 active，不跳轉 currentStage
  }

  if (result.verdict === 'fail') s.failCount = (s.failCount || 0) + 1;
  else if (result.verdict === 'reject') s.rejectCount = (s.rejectCount || 0) + 1;
  return s;
});
```

---

## 資料模型

### workflow.json — stage entry schema 變更

```javascript
// 舊格式
{
  "status": "active",
  "result": null
}

// 新格式（並行場景）
{
  "status": "active",
  "result": null,
  "parallelTotal": 3,   // 新增：併發 instance 總數（未並行時不存在，視為 1）
  "parallelDone": 1     // 新增：已完成的 instance 計數
}
```

向後相容：`parallelTotal` 和 `parallelDone` 是可選欄位。未設定時，`checkSameStageConvergence` 視為 `parallelTotal = 1`，行為與現有完全一致。

### workflow.json — activeAgents schema 變更

```javascript
// 舊格式
{
  "activeAgents": {
    "developer": { "stage": "DEV", "startedAt": "..." }
  }
}

// 新格式（instanceId 為 key）
{
  "activeAgents": {
    "developer:m3xap2k-f7r9qz": {
      "agentName": "developer",    // 新增
      "stage": "DEV",
      "startedAt": "..."
    }
  }
}
```

向後相容影響：
- `getNextStageHint` 的 `activeAgentKeys.join(', ')` 會顯示 instanceId 而非 agentName
- 需要修改 `getNextStageHint` 以從 instanceId 提取 agentName 顯示

### active-agent.json — 格式變更

```javascript
// 舊格式（單一物件）
{
  "agent": "developer",
  "subagentType": "ot:developer",
  "startedAt": "..."
}

// 新格式（含 agents 陣列）
{
  "agents": [
    {
      "agent": "developer",
      "instanceId": "developer:m3xap2k-f7r9qz",
      "subagentType": "ot:developer",
      "startedAt": "..."
    }
  ],
  "updatedAt": "..."
}
```

但由於 `atomicWrite` 是覆寫，concurrent pre-task 並行時只有最後一個寫入有效。解法：pre-task.js 改為 read-modify-write（使用 updateStateAtomic 的模式）。

**替代方案（更簡單）**：active-agent.json 維持單一物件格式（只記最後一個），statusline 的 × N 顯示邏輯改為主要依賴 workflow.stages 的 active count（副信號升為主信號）。

**決策**：採替代方案，active-agent.json 維持單一物件格式不變。

理由：
- active-agent.json 的設計目的是「讓 statusline 知道有 agent 在跑」，不是精確追蹤所有 instances
- 現有 statusline 已有「主信號（active-agent.json）+ 副信號（workflow.stages active count）」的邏輯
- 並行場景 active-agent.json 只記最後啟動的 agent（任一個均可），statusline × N 由 workflow.stages 計算
- on-stop.js 刪除 active-agent.json 不需要改動（最後一個 instance 完成時刪除即可，先完成的 instances 不刪）
- 大幅降低實作複雜度

**on-stop.js active-agent.json 策略**：
- 舊：所有 SubagentStop 直接 unlinkSync（第一個完成就刪）
- 新：僅當 `parallelDone >= parallelTotal`（收斂完成）時才刪除 active-agent.json

### getNextStageHint — activeAgents key 格式適配

```javascript
// 修改前：直接顯示 key（現在是 instanceId）
return `等待並行 agent 完成：${activeAgentKeys.join(', ')}`;

// 修改後：從 instanceId 提取 agentName
const agentNames = activeAgentKeys.map(k => {
  const entry = currentState.activeAgents[k];
  return entry?.agentName || k.split(':')[0];
});
return `等待並行 agent 完成：${agentNames.join(', ')}`;
```

---

## 檔案結構

### 修改檔案（5 個）

```
plugins/overtone/scripts/lib/state.js
  — 新增 checkSameStageConvergence 函式（export）
  — 修改 getNextStageHint：activeAgents key 改 instanceId 後的顯示適配

plugins/overtone/hooks/scripts/tool/pre-task.js
  — activeAgents 改用 instanceId 為 key，寫入 agentName 欄位
  — stage entry parallelTotal 設定邏輯
  — updatedInput prompt 注入 INSTANCE_ID + PARALLEL_TOTAL

plugins/overtone/hooks/scripts/agent/on-stop.js
  — instanceId 解析（regex from agentOutput）+ fallback
  — 收斂門邏輯（parallelDone 遞增 + converged 判斷）
  — active-agent.json 刪除改為收斂後才刪

plugins/overtone/scripts/statusline.js
  — readActiveAgent 格式向後相容（支援舊格式單一物件）
  — active-agent.json 格式維持不變（單一物件），不需要改讀取邏輯
  — 確認 × N 邏輯正確（目前由 workflow.stages active count 驅動）
```

### 新增檔案（1 個測試）

```
tests/unit/state-convergence.test.js
  — checkSameStageConvergence 函式單元測試
  — findActualStageKey 並行場景回歸測試（多個 active instance + parallelDone）
```

---

## 前置條件判斷：parallelTotal 如何設定

`pre-task.js` 在首次啟動 stage 時，無法提前知道 Main Agent 會啟動幾個 instances。

**解法**：以「increment on first seen」策略 + 覆寫更新。

邏輯如下：
1. 每次 pre-task 都遞增 `parallelTotal`（stage entry 不存在 `parallelTotal` 時初始化為 0 再 +1）
2. 這樣第 1 個 instance 啟動時 `parallelTotal = 1`，第 2 個 `parallelTotal = 2`，...以此類推
3. 最終 `parallelTotal` 等於實際啟動的 instance 數

**等待問題**：若第 2 個 instance 的 on-stop 在第 3 個 instance 的 pre-task 之前執行怎麼辦？

回答：`parallelDone` 遞增使用「嚴格小於最終 parallelTotal」做判斷，但 parallelTotal 是動態增長的。

修正策略：
- `parallelTotal` 不在 pre-task 中遞增，而是由 Main Agent 顯式設定（在 prompt 中帶入 `PARALLEL_TOTAL: N`）
- pre-task.js 從 prompt 解析 `PARALLEL_TOTAL` → 寫入 stage entry `parallelTotal`（每次更新，取最大值）
- 若 prompt 未帶 `PARALLEL_TOTAL`（單 agent 場景），`parallelTotal` 保持 undefined，視為 1

```javascript
// pre-task.js
const parallelTotalMatch = (toolInput.prompt || '').match(/PARALLEL_TOTAL:\s*(\d+)/);
const parallelTotal = parallelTotalMatch ? parseInt(parallelTotalMatch[1], 10) : null;

state.updateStateAtomic(sessionId, (s) => {
  s.activeAgents[instanceId] = { agentName: targetAgent, stage: targetStage, startedAt: new Date().toISOString() };
  if (actualKey && s.stages[actualKey]) {
    if (s.stages[actualKey].result === 'fail' || s.stages[actualKey].result === 'reject') {
      delete s.stages[actualKey].result;
      delete s.stages[actualKey].completedAt;
      delete s.stages[actualKey].parallelDone;
      delete s.stages[actualKey].parallelTotal;
    }
    s.stages[actualKey].status = 'active';
    if (parallelTotal !== null) {
      // 只更新 parallelTotal（取 max，防止並行 pre-task 的 race condition）
      s.stages[actualKey].parallelTotal = Math.max(s.stages[actualKey].parallelTotal || 0, parallelTotal);
    }
  }
  return s;
});
```

**PARALLEL_TOTAL 的來源**：Main Agent 在並行委派時，在每個 agent 的 prompt 最前面加上 `PARALLEL_TOTAL: N`。這是 Main Agent 的工作，可透過 `/ot:auto` skill 或工作流說明引導。

---

## 測試策略

### state-convergence.test.js（新增）

```javascript
describe('checkSameStageConvergence', () => {
  // Scenario 1: parallelTotal 未設定時視為已收斂（單 agent 場景）
  // Scenario 2: parallelDone < parallelTotal 時未收斂
  // Scenario 3: parallelDone >= parallelTotal 時已收斂
  // Scenario 4: stageEntry 為 null/undefined 時不拋出例外
});

describe('findActualStageKey — 並行場景', () => {
  // Scenario 1: active stage 有 parallelDone < parallelTotal 時仍可被找到
  // Scenario 2: active stage parallelDone >= parallelTotal 時（已收斂但尚未完成）仍可找到
});
```

### on-stop.js 並行場景（stop-message-builder.test.js 補充）

透過 mock state 驗證收斂門邏輯的 message 輸出（第 1 個完成不顯示「stage 完成」，第 N 個完成才顯示）。

---

## 向後相容性

- 無 `parallelTotal` 的 stage entry（舊格式）：`checkSameStageConvergence` 視為 parallelTotal = 1，行為與舊版一致
- `activeAgents` key 格式從 `agentName` 改為 `instanceId`：`getNextStageHint` 需同步修改顯示邏輯（提取 agentName 欄位）
- `active-agent.json` 格式不變（單一物件），statusline.js 不需要修改
- 現有測試（statusline.test.js 的 × N 測試）預期不破壞（× N 依賴 workflow.stages active count，邏輯不變）
