---
feature: core-simplification-guards
status: in-progress
created: 2026-03-04
author: architect
---

# 技術設計：核心簡化與不變量守衛

## 技術摘要（What & Why）

- **方案**：三組獨立修改（A 並行提示 / B 信號源簡化 / C 不變量守衛），各組內部依序，組間可並行
- **理由**：消除雙信號源（active-agent.json + workflow.json activeAgents）的複雜性，並在 updateStateAtomic 加入防衛層取代散落各處的 TTL workaround
- **取捨**：不變量守衛在 updateStateAtomic 的每次呼叫都執行（O(n) agents + O(n) stages），因 activeAgents 和 stages 數量恆定有限（< 20），效能影響可接受

## 關鍵技術決策

### 決策 1：C2 循環依賴問題（state.js 呼叫 timeline.emit）

**結論：無循環依賴，直接 require 可行。**

分析：
- `state.js` 目前只 require `paths.js` 和 `utils.js`
- `timeline.js` require `paths.js`、`registry.js` 和 `utils.js`
- 兩者不互相 require，加入 `require('./timeline')` 在 state.js 中不產生循環

選擇：在 `updateStateAtomic` 函式體內部（寫入後）呼叫 `require('./timeline').emit(...)`，不在 module 頂層 require（符合現有 pre-task.js、agent/on-stop.js 的 lazy require 慣例）。

### 決策 2：不變量守衛 API 設計

**選擇選項 B：修改前在 updateStateAtomic 內部自動修復，修復後 emit warning。**

- 選項 A（回傳 `{ state, warnings }`）：需要改動 5+ 個呼叫方，破壞向後相容
- **選項 B（內部自動修復 + side-effect emit）**：呼叫方 signature 不變，無需改動任何呼叫方，violations 透過 timeline 可觀察
- 選項 C（sanitize 靜默修復）：缺少可觀察性，問題難以診斷

函式簽名維持不變：`updateStateAtomic(sessionId, modifier) => object`

### 決策 3：active-agent.json 清理策略

`paths.js` 的 `session.activeAgent()` 保留（不在本次範圍，避免連動改動測試）。

`on-stop-stale-cleanup.test.js` 中 SCA-3 和 SCA-4 直接測試 active-agent.json 的存在/不存在。這些測試需要同步更新：
- B1 完成後：移除寫入邏輯，SCA-3 和 SCA-4 的「寫入 active-agent.json 模擬 pre-task」部分可保留（atomicWrite 仍可手動寫），但 on-stop 的刪除邏輯移除後，SCA-3 的 `expect(existsSync(activeAgentPath)).toBe(false)` 測試語義改變

**策略**：B1 移除寫入/刪除後，SCA-3 和 SCA-4 改為驗證 activeAgents entry 清除（核心行為），不再驗證 active-agent.json 檔案存在性。保留場景但調整 assertions。

### 決策 4：statusline.js 移除主信號分支後的行為

移除後，`buildAgentDisplay` 的信號優先順序變為：
1. `workflow.stages` 中 `status === 'active'` 的 entries（主信號）
2. `workflow.activeAgents` fallback（無 active stage 時）

`unit/statusline.test.js` 中以下測試需要更新（因使用 active-agent.json 為主信號）：
- `active-agent.json 主信號 + 並行 workflow stages 時顯示 × N` → 改為純 workflow stages 驗證
- `active-agent.json 主信號單一 stage 時不顯示 × N` → 改為純 workflow stages 驗證
- `無 workflow 但有 active-agent.json 時顯示 agent` → 移除此測試（功能不再支援）
- `無 workflow 有 Overtone agent 時顯示 emoji` → 移除此測試（功能不再支援）

無 workflow 情境下不再有 agent 顯示，這是預期的行為簡化。

### 決策 5：DEV 並行策略

**建議 2 個 developer**：
- Developer-1（A 組）：A1 + A2 並行（都是單點修改，互不依賴）
- Developer-2（B + C 組）：B1 → B2 → B3 → C1 → C2 → C3 依序執行

B 組和 C 組總計改動量約 120 行，且有嚴格依賴順序（B3 要在 C3 前完成），不值得再拆分第 3 個 developer。A 組改動量小（各約 10 行），1 個 developer 輕鬆完成。

### 決策 6：C3 TTL 移除後的 getNextStageHint 行為

移除 getNextStageHint 的 TTL 過濾後（state.js 第 276-291 行），殘留的 activeAgents 會阻擋 hint。
這是可接受的：B3 在每次 PreCompact 清空 activeAgents，C1 在每次 updateStateAtomic 移除孤兒 entry，雙重保障確保無殘留。
`on-stop-stale-cleanup.test.js` 的 TTL-GNH-1/GNH-2/GNH-3 場景需要更新以反映新行為。

## API 介面設計

### updateStateAtomic（不變量守衛，簽名不變）

```javascript
// 簽名不變 — 呼叫方無需修改
function updateStateAtomic(sessionId, modifier) => object

// 內部新增不變量檢查（modifier 執行後、writeState 前）：
// 1. activeAgents 孤兒清除
// 2. status 逆轉修復
// 3. parallelDone 截斷
```

### getNextStageHint（移除 TTL 過濾後）

```javascript
// 簽名不變
function getNextStageHint(currentState, { stages, parallelGroups }) => string | null

// 行為變更：移除 C3 後，不再有 TTL 邏輯
// activeAgents 空值由 B3（PreCompact 清空）和 C1（孤兒清除）保障
```

### buildAgentDisplay（移除主信號分支後）

```javascript
// 新簽名（移除 activeAgent 參數）
function buildAgentDisplay(workflow, registryStages) => string | null

// 舊簽名：buildAgentDisplay(activeAgent, workflow, registryStages)
// 主信號（activeAgent 分支）整個移除
// 副信號邏輯重命名為主邏輯
// TTL workaround（activeAgents fallback 中的過濾）同步移除
```

## 資料模型

### workflow.json — activeAgents（格式不變）

```javascript
{
  sessionId: string,
  workflowType: string,
  currentStage: string | null,
  stages: {
    [stageKey]: {
      status: 'pending' | 'active' | 'completed',
      result: 'pass' | 'fail' | 'reject' | null,
      parallelTotal?: number,
      parallelDone?: number,
      completedAt?: string,
    }
  },
  activeAgents: {
    [instanceId]: {
      agentName: string,
      stage: string,
      startedAt: string,
    }
  },
  // ...其他欄位不變
}
```

### 不變量規則（C1 實作的 3 條）

```
規則 1：activeAgents 孤兒
  for each (instanceId, info) in activeAgents:
    if info.stage 不存在於 stages 的 key 中:
      delete activeAgents[instanceId]
      warnings.push({ rule: 'orphan-agent', instanceId, stage: info.stage })

規則 2：status 逆轉防護
  允許的轉換：
    pending → active    ✅
    pending → completed ✅（跳過 active，合法）
    active → completed  ✅
    active → active     ✅（idempotent）
    completed → completed ✅（idempotent）
  違規轉換：
    active → pending    ❌ 保持 active
    completed → active  ❌ 保持 completed
    completed → pending ❌ 保持 completed

  實作：對比 oldState（modifier 前）和 newState（modifier 後）每個 stage 的 status

規則 3：parallelDone 截斷
  if parallelDone > parallelTotal:
    parallelDone = parallelTotal
    warnings.push({ rule: 'parallel-done-overflow', stageKey, parallelDone, parallelTotal })
```

### timeline event — system:warning（已定義，格式）

```javascript
{
  ts: string,              // ISO 8601
  type: 'system:warning',
  category: 'system',
  label: '系統警告',
  warnings: [
    {
      rule: 'orphan-agent' | 'status-regression' | 'parallel-done-overflow',
      // 各 rule 的附加欄位
    }
  ]
}
```

## 檔案結構

修改的檔案：

```
plugins/overtone/scripts/lib/state.js
  修改：updateStateAtomic — 加入不變量守衛（C1 + C2）
  修改：getNextStageHint — 移除 TTL 過濾（C3，在 B3+C1 完成後）

plugins/overtone/scripts/statusline.js
  刪除：readActiveAgent() 函式
  刪除：main() 中 const activeAgent + readActiveAgent(sessionId) 呼叫
  修改：buildAgentDisplay(activeAgent, workflow, registryStages) → buildAgentDisplay(workflow, registryStages)
  修改：移除主信號分支（第 165-187 行）
  修改：移除 activeAgents fallback 的 TTL 過濾（第 219-233 行）

plugins/overtone/hooks/scripts/tool/pre-task.js
  刪除：第 37-49 行 active-agent.json 寫入邏輯（atomicWrite + paths.session.activeAgent）

plugins/overtone/hooks/scripts/agent/on-stop.js
  刪除：第 65-70 行 active-agent.json 刪除邏輯（unlinkSync + paths.session.activeAgent）
  刪除：第 143-144 行 收斂後補刪 active-agent.json 邏輯

plugins/overtone/hooks/scripts/session/on-stop.js
  修改：import parallelGroups（新增到現有 registry import）
  修改：continueMessage 的提示行改用 state.getNextStageHint(currentState, { stages, parallelGroups })

plugins/overtone/hooks/scripts/session/pre-compact.js
  修改：目前階段顯示區塊改用 getNextStageHint()（需 import getNextStageHint + parallelGroups）
  新增：compactCount 更新後執行 updateStateAtomic 清空 activeAgents（B3）
  修改：活躍 agents 顯示的 TTL 過濾移除（C3，在 C1 完成後）

tests/unit/statusline.test.js
  修改：Feature 5 中 4 個使用 active-agent.json 的測試更新或移除

tests/integration/on-stop-stale-cleanup.test.js
  修改：SCA-3 和 SCA-4 移除 active-agent.json assertions
  修改：TTL-GNH-1、TTL-GNH-2、TTL-GNH-3 更新以反映 C3 移除 TTL 後的新行為

tests/integration/parallel-convergence-gate.test.js
  修改：依賴 active-agent.json 的 assertions 移除（如有）
```

不需新增檔案。

## 實作注意事項

給 developer 的提醒：

1. **B1 刪除 pre-task.js 寫入邏輯**：刪除第 37-49 行的整個 `if (sessionId)` 區塊（追蹤 active agent 部分），但保留後續的 `if (!sessionId)` early exit（第 51-55 行）

2. **B1 刪除 agent/on-stop.js 刪除邏輯**：
   - 刪除第 65-70 行（`// active-agent.json：...` 整段）
   - 刪除第 143-144 行（`// 收斂後確保 active-agent.json 已刪除` + `try { unlinkSync(...)...`）
   - 同時確認第 10 行的 `unlinkSync` import 和第 15 行的 `paths` import 是否還有其他用途（`existsSync` 仍需保留）

3. **C1 不變量守衛的舊 state 對比**：規則 2（status 逆轉）需要知道 modifier 前的狀態。實作方式：在 `modifier(current)` 執行前先深拷貝 `current`（`JSON.parse(JSON.stringify(current))`），modifier 後對比每個 stage 的 status

4. **C2 lazy require**：`require('./timeline')` 放在 `updateStateAtomic` 函式體內、violations 判斷後呼叫，遵循現有 lazy require 慣例

5. **B3 位置**：在 pre-compact.js 的 compactCount 更新（第 82 行 `atomicWrite(compactCountPath, compactCount)`）之後、組裝狀態摘要之前執行

6. **A1 continueMessage**：`getNextStageHint` 回傳 `string | null`，null 表示全部完成（此情況 on-stop.js 已在前面 exit），所以在 continueMessage 中可直接使用；若回傳「等待並行 agent 完成：...」則顯示等待訊息，若回傳「並行委派 ...」或「委派 ...」則用 `⏭️ ` 前綴包裝

7. **A2 pre-compact 目前階段**：`getNextStageHint` 回傳 null 時（全部完成），跳過目前階段行；非 null 時取代原有的 `目前階段：${def?.emoji} ${def?.label}` 行

8. **測試更新 on-stop-stale-cleanup.test.js**：
   - TTL-GNH-1 場景（過期 entry）：C3 移除後，過期 30 分鐘的 entry 不再自動跳過，hint 會是「等待並行 agent 完成」，應改為由 C1 的孤兒清除來處理（測試調整為：DEV completed 後 activeAgents 中 stage 對應不存在 → entry 被 updateStateAtomic 的孤兒清除清掉 → hint 正常）
   - TTL-GNH-2/GNH-3：保持語義，只更新描述說明新機制

9. **性能保證**：不變量檢查在 updateStateAtomic 的 CAS 迴圈之外（每次嘗試前執行），O(n) 操作其中 n 是 activeAgents + stages 總數，上限約 30，不影響 < 100ms 效能要求
