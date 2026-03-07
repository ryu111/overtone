# Convergence Gate Fix — 技術設計

`convergence-gate-fix`

## 問題定位

### Stale Snapshot 競爭條件（TOCTOU）

```
L57:  currentState = readState(sessionId)          // 讀快照 S0
L69:  updateStateAtomic — 清除 activeAgents        // 寫入 S1
L89:  findActualStageKey(currentState, stageKey)   // 用 S0 查找！此時 S1 可能已被另一個 agent 改為 completed
L96:  if (!actualStageKey) return                  // early exit → parallelDone 未遞增
```

當兩個並行 agent（如 REVIEW + TEST:2）幾乎同時完成：
- Agent A 的 `updateStateAtomic`（L104）將 stage 標記為 `completed`
- Agent B 的 `findActualStageKey`（L89）使用舊快照（S0），找到的 stage 仍是 `active`，但 **實際檔案中已是 `completed`**
- 根本問題：`findActualStageKey` 在 S0（舊快照），無法感知 A 的寫入

### 現有 findActualStageKey 的搜尋優先順序

1. 完全匹配且 `status === 'active'`
2. 帶編號且 `status === 'active'`
3. 任何 `status === 'pending'` 的
4. 安全網：`status === 'completed'` 且 `result === 'fail'|'reject'`（retry 場景）

競爭條件下的 fallthrough：若 A 已將 stage 改為 `completed + pass`，B 的 4 個條件全部 miss → 回傳 `null` → early exit。

---

## 修復方案

### 方向 B：將 findActualStageKey 移入第二個 updateStateAtomic

**核心原則**：stage key 查找與 parallelDone 遞增必須在同一個原子讀寫操作中，使用 callback 拿到的最新 state `s`。

#### Closure 傳出 Pattern

使用 `let` closure 變數在 callback 外接收結果，符合現有程式碼風格（L79 的 `resolvedInstanceId` 已用相同 pattern）：

```javascript
// Interface 定義
let resolvedActualStageKey = null;  // closure 變數

const updatedState = updateStateAtomic(sessionId, (s) => {
  // 在 callback 內用最新 s 查找
  resolvedActualStageKey = findActualStageKey(s, stageKey);

  if (!resolvedActualStageKey) {
    // 在最新 state 中找不到 → 安全補位：找 completed+pass 的（正常完成後的後到者）
    resolvedActualStageKey = _findCompletedPassStageKey(s, stageKey);
  }

  if (!resolvedActualStageKey) return s;  // 真正找不到 → 不修改

  // ... 原有的 parallelDone 遞增和收斂邏輯 ...
  return s;
});

// callback 結束後，resolvedActualStageKey 已被賦值
// statusline 和 early exit 使用 resolvedActualStageKey
```

#### 新增的安全補位邏輯

`findActualStageKey` 的安全網（第 4 條件）只處理 fail/reject 場景，不處理 pass 場景。需在第二個 `updateStateAtomic` 中新增補位：

```typescript
// state.js 新增（不匯出，供 agent-stop-handler 內部邏輯參考）
// 在 updateStateAtomic callback 內部使用：
function _findCompletedPassStageKey(state: WorkflowState, baseStage: string): string | null
// 找 status=completed 且 result=pass 的 stage key
// 場景：先到的 agent 已完成並標記 pass，後到的 agent 需要找到這個 key 來遞增 parallelDone
```

此函式不需要匯出（內聯在 callback 中即可，邏輯 < 10 行）。

#### 執行順序重組

修復後的執行順序：

```
1. [保留] 第一個 updateStateAtomic：清除 activeAgents
2. [保留] emit agent:complete timeline
3. [移動到 Step 4 之後] statusline 更新 — 改為使用 resolvedActualStageKey
4. [修復] 第二個 updateStateAtomic：
      a. callback 內：findActualStageKey(s, stageKey) → resolvedActualStageKey
      b. callback 內：若仍為 null，找 completed+pass 做補位
      c. callback 內：parallelDone 遞增和收斂判斷
5. [移到 Step 4 之後] statusline update(resolvedActualStageKey || stageKey)
6. [移到 Step 4 之後] if (!resolvedActualStageKey) return early exit
```

原本 Step 3（statusline 更新）依賴 `actualStageKey`，修復後改依賴 `resolvedActualStageKey`。由於 `resolvedActualStageKey` 在第二個 `updateStateAtomic` 結束後才有值，statusline 更新和 early exit 必須移到 Step 4 之後。

### 方向 C：Pre-task 委派前觸發 mid-session sanitize

在 `handlePreTask` 的通過路徑（L269 開始），於 `state.updateStateAtomic` 寫入 activeAgents 之前，插入：

```javascript
// Interface 定義
// pre-task-handler.js L269 之前插入
try {
  state.sanitize(sessionId);
} catch { /* 靜默 — sanitize 失敗不阻擋委派流程 */ }
```

#### 效能評估（回答 Open Question 3）

`sanitize()` 的操作成本：
- `readState` 1 次（JSON parse，~1ms）
- 只有發現 violations 時才 `writeState`（正常情況 = 0 次寫入）
- 4 個規則全是 O(n)，n = stage 數量（通常 5-8 個）

結論：**不需要 skip-if-no-active-stages 快速路徑**。正常情況（無孤兒）的 sanitize 只讀不寫，成本約 1ms。若需要進一步優化，可在規則 4 迴圈前做 early return（`if (Object.values(s.stages).every(e => e.status !== 'active')) return`），但目前不值得增加程式碼複雜度。

---

## 回答 Open Questions

### Q1：actualStageKey closure 傳出方式

採用 `let resolvedActualStageKey = null` closure pattern，與 L79 的 `resolvedInstanceId` 完全一致，符合現有程式碼風格。**不需要**調整 `updateStateAtomic` 簽名。

理由：`updateStateAtomic` 的 callback 簽名是 `(state) => state`，這是穩定的 API。若改為讓 callback 回傳 `{ state, extra }` 需要同步修改所有呼叫點（L69 的第一個 `updateStateAtomic` 也需調整），成本遠超收益。

### Q2：statusline + early exit 的執行順序重組

statusline 更新（原 L91-94）和 early exit（原 L96-98）都依賴 `actualStageKey`，必須移到第二個 `updateStateAtomic` 之後執行。重組後：

```
第一個 updateStateAtomic → emit agent:complete → 第二個 updateStateAtomic（含 findActualStageKey）
→ statusline.update(resolvedActualStageKey || stageKey)
→ if (!resolvedActualStageKey) return early exit
→ ... 後續邏輯 ...
```

`statusline.update` 的 fallback 用 `stageKey`（base key）而非 `null`，確保即使找不到 actualStageKey，statusline 也能正確 pop。

### Q3：sanitize 呼叫頻率的效能影響

如上節所述：正常情況只讀不寫（~1ms），可接受。不需要額外快速路徑。

---

## API 介面定義

### agent-stop-handler.js 內部變更

```typescript
// 移除：外部呼叫 findActualStageKey
// const actualStageKey = findActualStageKey(currentState, stageKey);  // 刪除此行

// 新增：closure 變數
let resolvedActualStageKey: string | null = null;

// 修改：第二個 updateStateAtomic callback signature（行為改變，型別不變）
updateStateAtomic(sessionId, (s: WorkflowState) => WorkflowState): WorkflowState
// callback 內部新增：
//   resolvedActualStageKey = findActualStageKey(s, stageKey)
//                         ?? _findCompletedPassStageKey(s, stageKey)
```

### _findCompletedPassStageKey（內聯邏輯，不匯出）

```typescript
// 在 updateStateAtomic callback 內的內聯邏輯（不獨立成函式）
// 找 status=completed 且 result=pass 的 stage key（後到場景）
// Input:  s: WorkflowState, baseStage: string
// Output: string | null
const stageKeys = Object.keys(s.stages);
const completedPass = stageKeys.find(
  (k) => (k === baseStage || k.startsWith(baseStage + ':')) &&
    s.stages[k].status === 'completed' &&
    s.stages[k].result === 'pass'
);
resolvedActualStageKey = completedPass || null;
```

### state.js：不新增匯出

`findActualStageKey` 已匯出，不需要新增任何匯出。`_findCompletedPassStageKey` 邏輯內聯在 callback 中（< 10 行，不值得獨立函式）。

### pre-task-handler.js 變更

```typescript
// 在 handlePreTask 的通過路徑（L269 區段開始）插入
// 位置：state.updateStateAtomic(sessionId, ...) 之前
try {
  state.sanitize(sessionId);
} catch { /* 靜默 */ }

// 其餘不變
```

---

## 資料模型：無變更

`workflow.json` schema 不變。`stages[key].parallelDone` 的遞增邏輯修復後行為一致，只是從正確的 state 讀取。

---

## 檔案結構

### 修改的檔案

| 檔案 | 改動類型 | 說明 |
|------|----------|------|
| `plugins/overtone/scripts/lib/agent-stop-handler.js` | 修改 | 方向 B：移除 L89 的 findActualStageKey 呼叫；重組 L91-98（statusline+early exit）到第二個 updateStateAtomic 之後；在 callback 內加入 resolvedActualStageKey 查找邏輯（含 completed+pass 補位） |
| `plugins/overtone/scripts/lib/pre-task-handler.js` | 修改 | 方向 C：在 L269 前插入 `state.sanitize(sessionId)` try/catch |
| `tests/unit/agent-stop-handler.test.js` | 修改+新增 | 新增並行收斂場景：兩個 agent 連續呼叫，驗證 parallelDone=2 且 stage=completed |
| `tests/unit/pre-task-handler.test.js` | 修改+新增 | 新增 sanitize 觸發測試：孤兒 active stage 在委派前被修復 |

### 不修改的檔案

- `state.js`：不新增匯出、不改 API
- `sanitize()`：邏輯不變，只增加呼叫點

---

## Edge Cases

| 場景 | 處理方式 |
|------|----------|
| 兩個 agent CAS retry 競爭 | `updateStateAtomic` 3 次重試確保最終一致；`resolvedActualStageKey` 在每次 retry 的 callback 中重新查找最新 state |
| callback 內找不到任何 stage（全部 completed） | `_findCompletedPassStageKey` 補位找 pass 的；若仍為 null 則 `if (!resolvedActualStageKey) return s`（不修改 state），callback 外 early exit |
| sanitize 時 workflow.json 不存在或格式錯誤 | `sanitize()` 內 `readState` 回傳 null → 回傳 null；外層 try/catch 靜默處理 |
| parallelTotal=1 的退化場景 | `checkSameStageConvergence` 在 parallelTotal 未設定時回傳 true（已有此邏輯），不受此修復影響 |
| 後到者的 completed+pass 補位後遞增 parallelDone | parallelDone 遞增正確；`status=completed` 分支（L109-113）的 `entry.parallelDone` 遞增邏輯仍需執行 |
