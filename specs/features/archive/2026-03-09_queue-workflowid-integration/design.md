# Design: queue-workflowid-integration

## 背景

佇列系統（execution-queue.js）與 workflow 狀態（state.js）之間目前缺乏雙向關聯。造成三個問題：

- **C1/C2**：`guardDiscoveryMode` 讀的是舊根層路徑，讀不到實際狀態；PM 完成後仍被誤阻擋
- **m1**：`_isRelatedQueueItem` 用 `includes()` 過鬆匹配，會跨 feature 誤完成佇列項目
- **M1/M2/m2/m3**：queue item 無 `workflowId` 欄位，heartbeat/init-workflow 無法精確匹配

## 技術方案

### 資料模型：Queue Item 加 workflowId 欄位

**現有格式**
```typescript
interface QueueItem {
  name: string;
  workflow: string;  // workflow 類型，如 'standard'
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  failReason?: string;
}
```

**新格式（加入 workflowId）**
```typescript
interface QueueItem {
  name: string;
  workflow: string;       // workflow 類型，如 'standard'
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  workflowId?: string;    // 新增：由 init-workflow.js 回寫，null 表示尚未啟動
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  failReason?: string;
}
```

**設計決策**
- `workflowId` 初始值為 `undefined`（不寫入，節省 JSON 空間）
- 由 `init-workflow.js` 在 workflow 初始化後回寫
- 向後相容：既有項目無此欄位，`undefined` 視同「尚未關聯」

### A1：guardDiscoveryMode 修復

**問題根因**
```javascript
// 現況（錯誤）：只傳 sessionId，讀舊路徑 workflow.json
const wf = state.readState(sessionId);
// → 讀 ~/.overtone/sessions/{sessionId}/workflow.json（根層，通常不存在）
// → 回傳 null，不阻擋（但這是「靜默通過」非正確放行）
```

若根層 workflow.json 存在（舊格式），可能錯誤讀到已完成或過時狀態。

**修復方案**
```typescript
// 新函式簽名（內部使用，不 export）
function guardDiscoveryMode(forceFlag: boolean): void

// 修復邏輯
1. 讀 paths.session.activeWorkflowId(sessionId) 取得 workflowId
2. 用 state.readState(sessionId, workflowId) 讀正確狀態
3. 放行條件：
   a. 無 state → 放行
   b. workflowType 非 'discovery' → 放行
   c. workflowType === 'discovery' 且 currentStage 非 'PM'（表示 PM 已完成）→ 放行
   d. workflowType === 'discovery' 且 currentStage === 'PM'（PM 仍在進行）→ 阻擋
```

**PM 完成後放行的判斷**
- PM stage 完成後，`currentStage` 推進至下一個 stage（或為 null）
- 因此：`currentStage !== 'PM'`（含 null）即代表 PM 已完成或 workflow 非 discovery，應放行

**interface 定義（queue.js 內部）**
```typescript
// 無新 export，僅修改 guardDiscoveryMode 函式體
// 依賴：paths.session.activeWorkflowId(sessionId)（已存在）
//       state.readState(sessionId, workflowId)（已存在）
```

### A2：_isRelatedQueueItem 精確匹配

**問題根因**
```javascript
// 現況（過鬆）：
normalizedItem.includes(normalizedFeature) || normalizedFeature.includes(normalizedItem)
// "newkuji" normalize = "newkuji" includes "kuji" → true，誤匹配
```

**修復方案**
```typescript
// 新匹配策略：normalize 後完全相等（=== 精確匹配）
function _isRelatedQueueItem(itemName: string, featureName: string): boolean

// 邏輯：
const normalizedItem = itemName.toLowerCase().replace(/[-_\s]/g, '');
const normalizedFeature = featureName.toLowerCase().replace(/[-_\s]/g, '');
return normalizedItem === normalizedFeature;
```

**設計理由**
- queue item 的 `name` 由 PM 寫入，通常與 `featureName` 完全相同（同為 kebab-case）
- 即使有些微差異（大小寫、連字符 vs 底線），normalize 後應完全相等
- 若需支援子任務（如 `kuji-payment` 對應 feature `kuji`），由 heartbeat 的 `itemName` 直接匹配（不走 fallback 路徑），此函式只用於「連續完成相關項目」的 fallback 場景

### B1：execution-queue.js API 變更

**writeQueue / appendQueue 的 item 初始化**
```typescript
// 新的 item 初始化（不含 workflowId，由 init-workflow 回寫）
const newItem = {
  name: item.name,
  workflow: item.workflow,
  status: 'pending',
  // workflowId 不初始化，undefined 表示「尚未關聯」
};
```

**failCurrent 加 name 精確匹配參數**
```typescript
// 現有 API（向後相容）
function failCurrent(projectRoot: string, reason?: string): boolean

// 新 API（新增 name 可選參數）
function failCurrent(projectRoot: string, reason?: string, name?: string): boolean

// 內部邏輯：若提供 name 且不匹配，回傳 false
if (name && queue.items[index].name !== name) return false;
```

**新增：updateWorkflowId**
```typescript
/**
 * 回寫 workflowId 到指定名稱的 queue item
 * @param projectRoot - 專案根目錄
 * @param name - queue item 名稱
 * @param workflowId - 要回寫的 workflowId
 * @returns { ok: boolean, error?: string }
 */
function updateWorkflowId(
  projectRoot: string,
  name: string,
  workflowId: string
): { ok: boolean; error?: string }
```

此函式設計為精確名稱匹配（`item.name === name`），不做 normalize。由 init-workflow.js 呼叫時以 featureName 為 key。

### B2：heartbeat.js completeCurrent / failCurrent 精確匹配

**現況**
```javascript
// 成功路徑
executionQueue.completeCurrent(projectRoot);  // 無 name，匹配第一個 in_progress

// 失敗路徑
executionQueue.failCurrent(projectRoot, reason);  // reason 是字串，無 name
```

**修復**
```typescript
// 成功路徑：傳入 itemName 精確匹配
executionQueue.completeCurrent(projectRoot, state.activeSession.itemName);

// 失敗路徑：傳入 name 精確匹配（第三個參數）
executionQueue.failCurrent(projectRoot, reason, state.activeSession.itemName);
```

completeCurrent 已支援 name 參數（L199），只需在 heartbeat 呼叫時傳入。

### B3：init-workflow.js 回寫 workflowId

**呼叫位置**：在 `workflowId` 生成後、`state.initState()` 呼叫前

**匹配策略（解決 Open Question #1）**
- 以 `featureName` 直接匹配 queue item 的 `name`（精確匹配，不 normalize）
- 理由：featureName 和 queue item name 由同一個 PM 流程產生，應完全相同
- fallback：若無 featureName，跳過回寫（非 PM 流程啟動的 workflow 無佇列關聯）

**interface**
```typescript
// init-workflow.js 新增邏輯（非函式，直接在 script body 中）
if (featureName) {
  const executionQueue = require('./lib/execution-queue');
  const result = executionQueue.updateWorkflowId(process.cwd(), featureName, workflowId);
  // 失敗靜默（非關鍵路徑）
}
```

**呼叫時序**
```
1. 生成 workflowId（已有）
2. 建立 workflow 子目錄（已有）
3. 寫入 active-workflow-id（已有）
4. [新增] executionQueue.updateWorkflowId(projectRoot, featureName, workflowId)
5. state.initState(...)（已有）
6. timeline.emit(...)（已有）
```

## 狀態同步策略

此功能為純後端狀態關聯，無前端狀態同步需求。

跨模組狀態傳播：
- **workflowId 回寫**：init-workflow.js（寫） → heartbeat.js（讀，用於精確匹配）
- **activeWorkflowId 讀取**：guardDiscoveryMode 讀取當前 workflowId，屬於「讀現有狀態」不涉及同步
- **無競爭條件**：updateWorkflowId 用 atomicWrite，heartbeat 讀時 item 已是 in_progress，不重疊

## 檔案結構

| 檔案 | 類型 | 說明 |
|------|------|------|
| `~/.claude/scripts/queue.js` | 修改 | guardDiscoveryMode 讀正確路徑 + PM 放行 |
| `~/.claude/scripts/lib/session-stop-handler.js` | 修改 | _isRelatedQueueItem 改 === 精確匹配 |
| `~/.claude/scripts/lib/execution-queue.js` | 修改 | 新增 updateWorkflowId；failCurrent 加 name 參數 |
| `~/.claude/scripts/heartbeat.js` | 修改 | completeCurrent/failCurrent 傳 itemName |
| `~/.claude/scripts/init-workflow.js` | 修改 | 初始化後回寫 workflowId 到佇列 |

設計文件（唯讀）：
| 檔案 | 類型 | 說明 |
|------|------|------|
| `specs/features/in-progress/queue-workflowid-integration/design.md` | 新增 | 本文件 |
