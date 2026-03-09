# Proposal：佇列系統 workflowId 整合

## 背景

v0.28.90 引入了 workflow 多實例隔離（workflowId 路由），但佇列系統（execution-queue.js 及相關呼叫端）尚未適配此設計。現有 6 個斷鏈點，導致 workflowId 邏輯在佇列流程中失效。

## 問題分類

### Critical（功能性錯誤）

**C1：`queue.js` guardDiscoveryMode 讀錯 state**

- 位置：`queue.js:33` — `state.readState(sessionId)` 沒傳 workflowId
- 影響：讀取舊根層 state 路徑（fallback），若使用 workflowId 隔離的新格式則讀不到正確 state，`wf` 可能為 null，導致守衛失效（應阻擋卻不阻擋）
- 附加問題：PM stage 完成後 `workflowType` 仍為 `'discovery'`，導致守衛阻擋 PM 完成後的合法佇列寫入

**C2：`queue.js` guardDiscoveryMode 不檢查 currentStage**

- 位置：`queue.js:34` — 僅判斷 `workflowType === 'discovery'`，不考慮 PM stage 是否已完成
- 影響：PM 訪談完成後，Main Agent 嘗試寫入佇列確認結果時，仍被守衛阻擋
- 正確語義：discovery workflow 的 PM stage 已完成 → 使用者已確認方向 → 允許寫入佇列

### Major（資料完整性問題）

**M1：execution-queue.js Queue item 缺 workflowId 欄位**

- 位置：`execution-queue.js:73-77`（writeQueue）、`execution-queue.js:104-108`（appendQueue）
- 影響：Queue item 不記錄 `workflowId`，heartbeat daemon 啟動下一項 session 時無法傳遞 workflowId 給新 session，造成多 workflow 同 feature 時無法追蹤

**M2：`heartbeat.js` completeCurrent/failCurrent 沒傳 name 做精確匹配**

- 位置：`heartbeat.js:266, 271, 287` — `executionQueue.completeCurrent(projectRoot)` / `failCurrent(projectRoot, reason)` 都沒傳 `name`
- 影響：`completeCurrent` 有 `name` 驗證邏輯（line 199），但 heartbeat 不傳 name，當 in_progress 項目與 outcome 的 itemName 不一致時，錯誤的項目可能被標記為完成

### Minor（語意精確度問題）

**m1：`session-stop-handler.js` `_isRelatedQueueItem` 匹配邏輯過鬆**

- 位置：`session-stop-handler.js:456-461`
- 影響：`normalizedItem.includes(normalizedFeature)` — "auth" 可匹配 "oauth-refactor"；`normalizedFeature.includes(normalizedItem)` — "q" 可匹配任何含 q 的 feature 名稱
- 正確語義：應精確匹配 `itemName === featureName`，或至少要求 word-boundary 級別的匹配

**m2：`init-workflow.js` workflowId 沒回寫到 queue item**

- 位置：`init-workflow.js:99-141`，init 完成後沒有更新 execution-queue.json 裡對應項目的 workflowId 欄位
- 影響：Queue item 無法反映實際執行的 workflowId，無法做事後追蹤

**m3：`execution-queue.js` failCurrent 缺 name 參數支援**

- 位置：`execution-queue.js:225`
- 影響：`failCurrent` 沒有 `name` 驗證邏輯（與 `completeCurrent` 不對稱），heartbeat 傳 name 後也無法精確匹配

## 解決方案

### 修復 C1 + C2（queue.js guardDiscoveryMode）

```js
// 修改後邏輯
function guardDiscoveryMode(forceFlag) {
  if (forceFlag) return;
  const sessionId = process.env.CLAUDE_SESSION_ID;
  if (!sessionId) return;

  // 讀取 activeWorkflowId
  let workflowId = null;
  try {
    workflowId = fs.readFileSync(paths.session.activeWorkflowId(sessionId), 'utf-8').trim() || null;
  } catch { /* 舊 session */ }

  const wf = state.readState(sessionId, workflowId);

  // C2 修復：PM stage 已完成則不阻擋
  if (wf && wf.workflowType === 'discovery') {
    const pmStage = wf.stages && wf.stages['PM'];
    if (pmStage && pmStage.status === 'completed') return; // PM 已完成 → 使用者已確認
    // PM 尚未完成 → 阻擋
    console.error('⛔ Discovery 模式下 PM 訪談尚未完成...');
    process.exit(1);
  }
}
```

### 修復 M1（execution-queue.js）

- `writeQueue` 和 `appendQueue` 的 item map 加入 `workflowId: item.workflowId || null`
- 格式：`{ name, workflow, status, workflowId }`

### 修復 M2（heartbeat.js）

- `completeCurrent(projectRoot)` 改為 `completeCurrent(projectRoot, state.activeSession.itemName)`
- `failCurrent(projectRoot, reason)` 改為 `failCurrent(projectRoot, reason, state.activeSession.itemName)`（需先修復 m3）

### 修復 m1（session-stop-handler.js _isRelatedQueueItem）

採用精確匹配策略：
```js
function _isRelatedQueueItem(itemName, featureName) {
  if (!itemName || !featureName) return false;
  const norm = s => s.toLowerCase().replace(/[-_\s]/g, '');
  return norm(itemName) === norm(featureName);
}
```

### 修復 m2（init-workflow.js 回寫 workflowId）

init-workflow.js 完成初始化後，讀取 execution-queue，找到 in_progress 或第一個 pending 且 name 匹配當前 feature 的項目，回寫 workflowId。

### 修復 m3（execution-queue.js failCurrent 加 name 參數）

仿照 `completeCurrent` 加入 name 驗證：
```js
function failCurrent(projectRoot, reason, name) {
  // ...
  if (name && queue.items[index].name !== name) return false;
  // ...
}
```

## 修改範圍

| 檔案 | 修改類型 | 優先度 |
|------|---------|--------|
| `~/.claude/scripts/queue.js` | 修改 guardDiscoveryMode（C1+C2）| Critical |
| `~/.claude/scripts/lib/execution-queue.js` | 加 workflowId 欄位（M1）+ failCurrent name 參數（m3）| Major+Minor |
| `~/.claude/scripts/heartbeat.js` | completeCurrent/failCurrent 傳 name（M2）| Major |
| `~/.claude/scripts/lib/session-stop-handler.js` | _isRelatedQueueItem 精確匹配（m1）| Minor |
| `~/.claude/scripts/init-workflow.js` | 回寫 workflowId 到 queue item（m2）| Minor |

## 依賴關係

```
m3（failCurrent name 參數） → M2（heartbeat 傳 name）
M1（queue item workflowId 欄位） → m2（init-workflow 回寫）
C1 + C2 可獨立修復
m1 可獨立修復
```

## 並行策略

- **Phase A（可並行）**：C1+C2（queue.js）、m1（session-stop-handler.js）
- **Phase B（依序）**：M1+m3（execution-queue.js）→ M2（heartbeat.js）→ m2（init-workflow.js）
