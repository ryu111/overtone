# DAG Queue Core Dependencies — BDD Spec

## Feature: 基本 dependsOn 宣告與 getNext 行為

### Scenario: 無 dependsOn 的 item 可直接取得
- GIVEN 佇列中有一個 item `{ name: "task-a", workflow: "quick" }`，未宣告 dependsOn
- WHEN 呼叫 `getNext(projectRoot)`
- THEN 回傳 `task-a`（item 可被取得，不受阻擋）

### Scenario: dependsOn 全部 completed 時 item 變為 ready
- GIVEN 佇列中有 `task-a`（status: completed）和 `task-b`（status: pending, dependsOn: ["task-a"]）
- WHEN 呼叫 `getNext(projectRoot)`
- THEN 回傳 `task-b`（依賴已滿足，可執行）

### Scenario: dependsOn 尚有 pending 時 item 被阻擋
- GIVEN 佇列中有 `task-a`（status: pending）和 `task-b`（status: pending, dependsOn: ["task-a"]）
- WHEN 呼叫 `getNext(projectRoot)`
- THEN 回傳 `task-a`（`task-b` 被阻擋，只有無依賴的 `task-a` 可取得）

### Scenario: dependsOn 尚有 in_progress 時 item 被阻擋
- GIVEN 佇列中有 `task-a`（status: in_progress）和 `task-b`（status: pending, dependsOn: ["task-a"]）
- WHEN 呼叫 `getNext(projectRoot)`
- THEN 回傳 null（`task-a` 不是 completed，`task-b` 被阻擋，無其他 pending item）

---

## Feature: 環偵測

### Scenario: 直接循環（A 依賴 B，B 依賴 A）
- GIVEN 嘗試寫入佇列，items 為 `[{ name: "A", dependsOn: ["B"] }, { name: "B", dependsOn: ["A"] }]`
- WHEN 呼叫 `writeQueue(projectRoot, items, source)`
- THEN 丟出 Error，訊息包含「循環依賴」字樣
- AND 佇列檔案不被寫入

### Scenario: 間接循環（A→B→C→A）
- GIVEN 嘗試寫入佇列，items 為 `[{ name: "A", dependsOn: ["C"] }, { name: "B", dependsOn: ["A"] }, { name: "C", dependsOn: ["B"] }]`
- WHEN 呼叫 `writeQueue(projectRoot, items, source)`
- THEN 丟出 Error，訊息包含「循環依賴」字樣

### Scenario: 無循環的菱形依賴正常通過
- GIVEN items 為 `[{ name: "A" }, { name: "B", dependsOn: ["A"] }, { name: "C", dependsOn: ["A"] }, { name: "D", dependsOn: ["B", "C"] }]`
- WHEN 呼叫 `writeQueue(projectRoot, items, source)`
- THEN 寫入成功，不丟出錯誤

---

## Feature: 引用驗證（不存在的 name）

### Scenario: dependsOn 引用不存在的 item name 時驗證失敗
- GIVEN 嘗試寫入佇列，items 為 `[{ name: "task-b", dependsOn: ["non-existent"] }]`
- WHEN 呼叫 `writeQueue(projectRoot, items, source)`
- THEN 丟出 Error，訊息包含「依賴項不存在」和「non-existent」

### Scenario: dependsOn 為非陣列型別時驗證失敗
- GIVEN 嘗試寫入佇列，items 為 `[{ name: "task-a", dependsOn: "task-b" }]`（字串而非陣列）
- WHEN 呼叫 `writeQueue(projectRoot, items, source)`
- THEN 丟出 Error，訊息包含「dependsOn 必須是陣列」

### Scenario: dependsOn 為空陣列時正常通過
- GIVEN items 為 `[{ name: "task-a", dependsOn: [] }]`
- WHEN 呼叫 `writeQueue(projectRoot, items, source)`
- THEN 寫入成功，不丟出錯誤

---

## Feature: 依賴感知排程（多 ready item 的 FIFO 偏好）

### Scenario: 多個 ready item 時回傳 index 最小的（FIFO）
- GIVEN 佇列中依序有：`task-a`（pending, dependsOn: []）、`task-b`（pending, dependsOn: []）、`task-c`（pending, dependsOn: []）
- WHEN 呼叫 `getNext(projectRoot)`
- THEN 回傳 `task-a`（index 最小）

### Scenario: 前面的 item 被阻擋時跳過，取第一個 ready item
- GIVEN 佇列中依序有：`task-a`（pending, dependsOn: ["task-x"]）、`task-b`（pending, dependsOn: []）其中 task-x 不在佇列（已被移除或不存在）
- AND `task-a` 因依賴不存在（validate 已通過）或依賴未 completed 而阻擋
- WHEN 呼叫 `getNext(projectRoot)`
- THEN 回傳 `task-b`（跳過被阻擋的 `task-a`）

### Scenario: advanceToNext 標記第一個 ready item 為 in_progress
- GIVEN 佇列中有 `task-a`（pending, dependsOn: []）和 `task-b`（pending, dependsOn: ["task-a"]）
- WHEN 呼叫 `advanceToNext(projectRoot)`
- THEN `task-a` 狀態變為 `in_progress`
- AND `task-b` 狀態仍為 `pending`

---

## Feature: 失敗傳播（上游 failed 阻擋下游）

### Scenario: 上游 failed 時下游 pending 被永遠阻擋
- GIVEN 佇列中有 `task-a`（status: failed）和 `task-b`（status: pending, dependsOn: ["task-a"]）
- WHEN 呼叫 `getNext(projectRoot)`
- THEN 回傳 null（`task-b` 被阻擋，無其他 ready item）

### Scenario: 多重依賴中只要有一個 failed 就阻擋
- GIVEN 佇列中有 `task-a`（status: completed）、`task-b`（status: failed）、`task-c`（status: pending, dependsOn: ["task-a", "task-b"]）
- WHEN 呼叫 `getNext(projectRoot)`
- THEN 回傳 null（`task-c` 因 `task-b` failed 而被阻擋）

### Scenario: 間接失敗傳播（A failed → B blocked → C blocked）
- GIVEN 佇列中有 `task-a`（status: failed）、`task-b`（status: pending, dependsOn: ["task-a"]）、`task-c`（status: pending, dependsOn: ["task-b"]）
- WHEN 呼叫 `getNext(projectRoot)`
- THEN 回傳 null（整條依賴鏈全被阻擋）

---

## Feature: retryItem 解除阻擋

### Scenario: retryItem 將 failed 改回 pending，下游解除阻擋
- GIVEN 佇列中有 `task-a`（status: failed）和 `task-b`（status: pending, dependsOn: ["task-a"]）
- WHEN 呼叫 `retryItem(projectRoot, "task-a")`
- THEN `task-a` 狀態變為 `pending`
- AND 呼叫 `getNext` 回傳 `task-a`（而非 null）

### Scenario: retryItem 完成、上游再次 completed 後下游自動解鎖
- GIVEN 佇列中有 `task-a`（status: pending）和 `task-b`（status: pending, dependsOn: ["task-a"]）
- WHEN `task-a` 執行完成後狀態變為 `completed`
- AND 呼叫 `getNext(projectRoot)`
- THEN 回傳 `task-b`（依賴已滿足）

### Scenario: retryItem 對不存在的 item name 不丟出錯誤
- GIVEN 佇列中沒有名為 `non-existent` 的 item
- WHEN 呼叫 `retryItem(projectRoot, "non-existent")`
- THEN 靜默成功（或回傳 null / false），不丟出例外

---

## Feature: appendQueue 跨批次引用

### Scenario: 新 item 可依賴既有佇列中的 item
- GIVEN 佇列中已有 `task-a`（status: pending）
- WHEN 呼叫 `appendQueue(projectRoot, [{ name: "task-b", dependsOn: ["task-a"] }], source)`
- THEN 寫入成功
- AND `task-b.dependsOn` 為 `["task-a"]`

### Scenario: 新 item 引用不存在的 item（跨批次）時驗證失敗
- GIVEN 佇列中已有 `task-a`（status: pending）
- WHEN 呼叫 `appendQueue(projectRoot, [{ name: "task-b", dependsOn: ["non-existent"] }], source)`
- THEN 丟出 Error，訊息包含「依賴項不存在」

### Scenario: 既有 item 不可依賴同批次新加入的 item（不支援回顧引用）
- GIVEN 佇列已有 `task-a`（status: pending, dependsOn: []）
- WHEN 呼叫 `appendQueue(projectRoot, [{ name: "task-b", dependsOn: [] }], source)`
- THEN 寫入成功（task-a 的 dependsOn 不被修改）
- AND `task-a.dependsOn` 仍為 `[]`（既有 item 不會自動引用新 item）

### Scenario: 跨批次新 item 形成環偵測
- GIVEN 佇列中已有 `task-a`（status: pending, dependsOn: ["task-b"]）（此狀態理論上不合法，但透過模擬）
- AND 更實際情境：佇列中已有 `task-a`，新 batch 為 `[{ name: "task-b", dependsOn: ["task-a"] }, { name: "task-c", dependsOn: ["task-b"] }]`且 `task-a.dependsOn: ["task-c"]`
- WHEN 呼叫 `appendQueue` 使完整圖形成環
- THEN 丟出 Error，訊息包含「循環依賴」

---

## Feature: readQueue 舊格式向後相容

### Scenario: 舊格式 item 不含 dependsOn 欄位，讀取後自動補齊為空陣列
- GIVEN 佇列 JSON 檔案中的 item 不含 `dependsOn` 欄位
- WHEN 呼叫 `readQueue(projectRoot)`
- THEN 每個 item 的 `dependsOn` 為 `[]`（記憶體補齊，不修改檔案）

### Scenario: 舊格式 item 混有部分含 dependsOn、部分不含
- GIVEN 佇列 JSON 中有兩個 item：一個含 `dependsOn: ["task-x"]`，另一個不含
- WHEN 呼叫 `readQueue(projectRoot)`
- THEN 含 dependsOn 的 item 保留原值 `["task-x"]`
- AND 不含的 item 補齊為 `[]`

### Scenario: 舊格式 item 透過 getNext 仍可正常取得（視為無依賴）
- GIVEN 佇列 JSON 中有一個舊格式 item（無 dependsOn 欄位），status 為 pending
- WHEN 呼叫 `getNext(projectRoot)`
- THEN 回傳該 item（補齊空 dependsOn 後視為無依賴，立即 ready）

---

## Feature: 無 dependsOn 的 item 行為不變（回歸保護）

### Scenario: 全無依賴的佇列維持原有 FIFO 順序
- GIVEN 佇列中依序有三個 item，均無 dependsOn：`[task-1, task-2, task-3]`（均 pending）
- WHEN 依序呼叫 `advanceToNext`（完成後）再 `getNext`
- THEN 每次取得的 item 依序為 `task-1` → `task-2` → `task-3`（FIFO 不變）

### Scenario: writeQueue 寫入無 dependsOn 的 item 時不報錯
- GIVEN items 為 `[{ name: "task-a", workflow: "quick" }]`（無 dependsOn 欄位）
- WHEN 呼叫 `writeQueue(projectRoot, items, source)`
- THEN 寫入成功
- AND 讀回的 item.dependsOn 為 `[]`

### Scenario: 無依賴的 item 不受其他 item 的 failed 狀態影響
- GIVEN 佇列中有 `task-a`（status: failed）和 `task-b`（status: pending, dependsOn: []）
- WHEN 呼叫 `getNext(projectRoot)`
- THEN 回傳 `task-b`（`task-b` 無依賴，不受 `task-a` 影響）
