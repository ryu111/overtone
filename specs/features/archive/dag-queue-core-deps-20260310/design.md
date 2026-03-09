# Design: dag-queue-core-deps

## 技術摘要（What & Why）

- **方案**：在現有 `execution-queue.js` 的 item 資料結構中加入 `dependsOn?: string[]` 欄位，實作 DAG 感知的排程邏輯
- **理由**：不引入新模組、不改變現有 API 呼叫方式，只擴展欄位和修改三個函式（`_validateItems`、`getNext`、`advanceToNext`）。舊格式零成本相容（`dependsOn` 預設 `[]`）
- **取捨**：`dependsOn` 使用 item **name**（非 index 或 UUID）作為引用鍵。好處是人類可讀；限制是 name 重複會引發歧義，但現有 dedup 機制可保證 name 唯一性

## API 介面設計

### 現有函式簽名（維持不變）

```javascript
// 無 signature 異動，只擴展 item 欄位
writeQueue(projectRoot, items, source, options)
appendQueue(projectRoot, items, source, options)
getNext(projectRoot)          // 回傳第一個 _isReady 的 pending item
advanceToNext(projectRoot)    // 標記第一個 _isReady 的 pending item 為 in_progress
```

### 新增內部函式

```javascript
// 檢查 item 是否可執行（所有 dependsOn 都已 completed）
// @param {object} item - 要檢查的 item
// @param {object[]} allItems - 佇列中所有 items
// @returns {boolean}
function _isReady(item, allItems)

// 環偵測：在 items 組成的有向圖中尋找 cycle
// 合入 _validateItems，不對外暴露
// @param {object[]} items - 要驗證的 items（寫入前）
// @throws {Error} 若偵測到 cycle 或 dependsOn 引用不存在的 name
function _detectCycle(items)
```

### 錯誤處理

| 錯誤情況 | 錯誤訊息 |
|---------|---------|
| dependsOn 引用不存在的 item name | `依賴項不存在：{name}（在 {itemName}.dependsOn 中）` |
| 形成環狀依賴 | `偵測到循環依賴：{A} → {B} → ... → {A}` |
| dependsOn 為非陣列型別 | `dependsOn 必須是陣列：{itemName}` |

## 資料模型

```javascript
// 佇列 item（擴展後）
// {
//   name: string,           // 唯一識別鍵（現有）
//   workflow: string,       // workflow 類型（現有）
//   status: 'pending' | 'in_progress' | 'completed' | 'failed',  // 現有
//   dependsOn: string[],    // 新增：依賴的 item name 陣列（空陣列 = 無依賴）
//   startedAt?: string,     // ISO 8601（現有）
//   completedAt?: string,   // ISO 8601（現有）
//   failedAt?: string,      // ISO 8601（現有）
//   failReason?: string,    // （現有）
//   workflowId?: string,    // （現有）
// }

// 向後相容：readQueue 時 item.dependsOn 不存在 → 視為 []
// writeQueue/appendQueue 時 item.dependsOn 未提供 → 預設 []
```

儲存位置：`~/.overtone/global/{projectHash}/execution-queue.json`（不變）

## 檔案結構

```
修改的檔案：
  ~/.claude/scripts/lib/execution-queue.js    ← 修改：擴展資料結構 + 3 個函式
  ~/projects/overtone/tests/unit/execution-queue.test.js          ← 修改：更新 DAG 相關測試
  ~/projects/overtone/tests/unit/execution-queue-enhancement.test.js  ← 修改：更新 DAG 相關測試
```

## 關鍵技術決策

### 決策 1：_isReady 判斷邏輯

- **選擇**：`item.dependsOn.every(depName => allItems.find(i => i.name === depName)?.status === 'completed')`
- **理由**：語意清晰——依賴必須全部 completed，failed 不算完成，永遠阻擋（設計哲學）
- **邊界**：`dependsOn` 引用不存在的 name → `find()` 回傳 undefined，`?.status` 為 undefined，`=== 'completed'` 為 false → item 被阻擋，不丟例外（validate 階段已確保引用存在）

### 決策 2：_detectCycle 與 _validateItems 合入

- **選擇**：`_validateItems` 內先做引用存在性驗證，再呼叫 `_detectCycle`
- **理由**：單一入口，呼叫端（writeQueue/appendQueue）不需要分別呼叫兩個函式
- **未選**：分開兩個獨立函式 — 增加 API 表面積，調用順序成為隱性約定

### 決策 3：appendQueue 跨批次引用驗證

- **選擇**：合併 `[...existing.items, ...newItems]` 之後，對**完整陣列**執行 `_validateItems`
- **理由**：新加入的 item 可以合法引用既有佇列中的 item，驗證需要完整圖才能檢查引用存在性和 cycle
- **注意**：existing items 的 `dependsOn` 不重新驗證（已通過初次 writeQueue 驗證），只驗證 newItems 對應的圖邊

### 決策 4：失敗傳播語意（回答 planner Open Question 2）

- **選擇**：上游 failed → 下游 pending 永遠阻擋（`_isReady` 回傳 false），只有 `retryItem` 解除
- **理由**：符合「依賴是硬性前置條件」語意。failed 代表任務未完成，下游不應在上游修復前自動繼續
- **操作路徑**：用戶需 `retryItem(upstreamName)` 將 failed 改回 pending，等待上游完成後下游自動解鎖

### 決策 5：getNext / advanceToNext 改造策略

- **選擇**：`findIndex(i => i.status === 'pending' && _isReady(i, queue.items))`
- **理由**：最小改動，保留現有 FIFO 偏好——有多個 ready item 時回傳第一個（index 最小的）
- **並行排程**：本次迭代不支援（scope 限定），DAG 並行排程在後續迭代處理

## 演算法設計

### _detectCycle（DFS 白灰黑標記法）

```javascript
function _detectCycle(items) {
  const nameSet = new Set(items.map(i => i.name));
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = {};
  items.forEach(i => { color[i.name] = WHITE; });

  function dfs(name) {
    color[name] = GRAY;
    const item = items.find(i => i.name === name);
    for (const dep of (item.dependsOn || [])) {
      // 引用存在性在 _validateItems 前置檢查，這裡只做 cycle 偵測
      if (color[dep] === GRAY) throw new Error(`循環依賴：...→ ${dep}`);
      if (color[dep] === WHITE) dfs(dep);
    }
    color[name] = BLACK;
  }

  for (const item of items) {
    if (color[item.name] === WHITE) dfs(item.name);
  }
}
```

### _validateItems 擴展（整合現有 workflow 驗證）

```javascript
function _validateItems(items) {
  // 1. 現有：非空驗證
  // 2. 現有：workflow 合法性驗證
  // 3. 新增：dependsOn 型別驗證（必須是 array 或 undefined）
  // 4. 新增：dependsOn 引用存在性驗證（引用的 name 必須在 items 中）
  // 5. 新增：_detectCycle(items)
}
```

### readQueue 向後相容補丁

```javascript
// readQueue 回傳前，補齊所有 item 的 dependsOn
// if (!item.dependsOn) item.dependsOn = [];
// 不修改檔案，只在記憶體中補齊
```

## 實作注意事項

- `_isReady` 的引用查找使用線性搜尋（`Array.find`），效能足夠（佇列通常 < 20 items）
- `appendQueue` 驗證策略：合併後對完整陣列的 `newItems` 引入的新邊做驗證即可（不需要重新驗證所有既有邊），但為實作簡單，可對完整陣列整體執行 `_detectCycle`——現有 items 早已通過驗證，再跑一次 DFS 成本極低
- `dedup` 函式在 DAG 模式下需要注意：移除 item 後如有其他 item 的 `dependsOn` 引用它，語意變成「依賴不存在的 item」。**本次不修改 dedup**，dedup 設計為「先 dedup 再加依賴」的使用順序
- `insertItem` 插入的新 item 若帶 `dependsOn`：現有 `insertItem` 只接受 `name/workflow`，不支援傳入 `dependsOn`，**本次不修改 insertItem**（scope 外）
- `suggestOrder` 不修改：DAG 感知排序屬於另一個迭代的功能
