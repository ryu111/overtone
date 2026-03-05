# 執行佇列管理指引

> 來源：execution-queue.js + queue.js CLI

## 一、佇列概述

執行佇列（execution queue）是 Overtone 跨 session 自主執行的任務序列。PM Discovery 確認的任務清單寫入佇列後，Heartbeat Engine 自動逐項 spawn session 執行，無需人為確認。

儲存位置：`~/.overtone/global/{projectHash}/execution-queue.json`

---

## 二、CLI 操作

### 新增項目

```bash
# 新增單一項目（覆寫現有佇列）
bun scripts/queue.js add my-feature standard

# 新增多個項目（name workflow 成對）
bun scripts/queue.js add \
  feature-a standard \
  feature-b quick \
  bugfix-c single

# 指定來源描述
bun scripts/queue.js add my-feature standard --source "PM Discovery 2026-03-04"

# 指定專案根目錄
bun scripts/queue.js add my-feature standard --project-root /path/to/project
```

### 累加到現有佇列

```bash
# 累加項目到現有佇列（保留已完成/進行中的項目）
bun scripts/queue.js append bugfix-d quick

# 多個項目
bun scripts/queue.js append \
  feature-c standard \
  feature-d quick

# 寫入規劃模式佇列（autoExecute: false，不自動執行）
bun scripts/queue.js append feature-e standard --no-auto

# 指定來源描述
bun scripts/queue.js append feature-f standard --source "PM Discovery 2026-03-05"
```

### 查詢佇列

```bash
# 列出佇列狀態
bun scripts/queue.js list

# 輸出範例：
# 佇列（PM Discovery 2026-03-04）— 1/3 完成
#
#   ✅ feature-a（standard）
#   🔄 feature-b（quick）
#   ⬜ bugfix-c（single）
```

### 啟用自動執行

```bash
# 從規劃模式轉換為執行模式（autoExecute: false → true）
bun scripts/queue.js enable-auto

# 啟用後 Heartbeat 自動推進佇列項目
```

### 清除佇列

```bash
# 刪除 execution-queue.json
bun scripts/queue.js clear
```

---

## 三、佇列項目生命週期

### 狀態機

```
pending ──→ in_progress ──→ completed
                │
                └──→ failed
```

### 狀態轉移觸發點

| 轉移 | 觸發者 | API |
|------|--------|-----|
| `pending → in_progress` | Heartbeat Engine（自動推進） | `advanceToNext(projectRoot)` |
| `in_progress → completed` | Stop hook / Heartbeat（session 成功完成） | `completeCurrent(projectRoot)` |
| `in_progress → failed` | Heartbeat（session 失敗/timeout） | `failCurrent(projectRoot, reason)` |

### 項目資料結構

```javascript
// execution-queue.json
{
  items: [
    {
      name: "feature-a",        // 任務名稱（= featureName）
      workflow: "standard",      // workflow 模板
      status: "completed",       // pending | in_progress | completed | failed
      startedAt: "2026-...",     // advanceToNext 時寫入
      completedAt: "2026-...",   // completeCurrent 時寫入
      // 或
      failedAt: "2026-...",      // failCurrent 時寫入
      failReason: "timeout"      // 失敗原因（可選）
    }
  ],
  autoExecute: true,             // 啟用自動執行
  source: "PM Discovery ...",    // 來源描述
  createdAt: "2026-..."
}
```

---

## 四、程式碼 API

```javascript
const eq = require('./lib/execution-queue');

// 讀取佇列（不存在時回傳 null）
const queue = eq.readQueue(projectRoot);

// 建立佇列（覆寫現有）
eq.writeQueue(projectRoot, [
  { name: 'feature-a', workflow: 'standard' },
  { name: 'feature-b', workflow: 'quick' },
], 'PM Discovery 2026-03-04', { autoExecute: true });

// 累加到現有佇列（保留進度）
eq.appendQueue(projectRoot, [
  { name: 'feature-c', workflow: 'standard' },
], 'PM Discovery 2026-03-05', { autoExecute: false });

// 推進到下一個 pending 項目
const next = eq.advanceToNext(projectRoot);
// → { item: { name, workflow, status: 'in_progress' }, index: 0 }

// 取得目前執行中的項目
const current = eq.getCurrent(projectRoot);

// 標記完成
eq.completeCurrent(projectRoot);

// 標記失敗
eq.failCurrent(projectRoot, 'session timeout');

// 設定佇列的 autoExecute 狀態（規劃模式 → 執行模式）
eq.setAutoExecute(projectRoot, true);

// 取得佇列摘要（用於 SessionStart 注入）
const summary = eq.formatQueueSummary(projectRoot);

// 清除佇列
eq.clearQueue(projectRoot);
```

---

## 五、錯誤處理決策樹

```
❓ session 執行結果是什麼？
   │
   ├─ status: 'success'
   │  → completeCurrent(projectRoot)
   │  → advanceToNext(projectRoot) 推進下一項
   │
   ├─ status: 'error'
   │  → failCurrent(projectRoot, errorCode)
   │  → consecutiveFailures++
   │  → 進入重試 vs 跳過判斷 ↓
   │
   ├─ status: 'timeout'
   │  → failCurrent(projectRoot, 'timeout')
   │  → consecutiveFailures++
   │  → 進入重試 vs 跳過判斷 ↓
   │
   └─ status: 'crash'
      → failCurrent(projectRoot, 'crash')
      → consecutiveFailures++
      → 進入重試 vs 跳過判斷 ↓

❓ 重試 vs 跳過？
   │
   ├─ consecutiveFailures < 3
   │  → Heartbeat 自動重試當前項目（不推進）
   │  → 但 failCurrent 已標記 failed，需手動介入
   │
   └─ consecutiveFailures >= 3
      → Heartbeat 暫停（paused = true）
      → 發送 Telegram 通知
      → 需手動 stop + start 恢復
```

### Heartbeat 失敗處理邏輯

```javascript
// heartbeat.js 簡化邏輯
const result = await outcome;

if (result.status === 'success') {
  eq.completeCurrent(projectRoot);
  state.consecutiveFailures = 0;
  // 自動推進下一項
  eq.advanceToNext(projectRoot);
} else {
  eq.failCurrent(projectRoot, result.status);
  state.consecutiveFailures++;

  if (state.consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD) {
    state.paused = true;
    // 發送 Telegram 通知：佇列暫停
  }
}
```

---

## 六、SessionStart 佇列注入

佇列摘要在 session 啟動時自動注入到 systemMessage，確保新 session 知道自己的任務。

```
## 執行佇列（PM Discovery 2026-03-04）

✅ feature-a（standard）
🔄 feature-b（quick）
⬜ bugfix-c（single）

進度：1/3
目前：feature-b

⛔ 下一項：bugfix-c（single）— 直接開始，不要詢問使用者
```

`formatQueueSummary` 在有下一個 pending 項目且沒有 in_progress 項目時，自動加上「直接開始」的強指令，避免 session 停下來詢問使用者。

---

## 七、注意事項

| 項目 | 說明 |
|------|------|
| 佇列是全域的 | 以 projectRoot hash 區分，同專案共用一個佇列 |
| `writeQueue` 會覆寫 | 重新寫入會清除所有既有進度 |
| `autoExecute` 控制自動推進 | 設為 false 時 `getNext` / `advanceToNext` 回傳 null |
| 失敗項目不會自動重試 | `failCurrent` 標記後該項目永久為 failed |
| 清除佇列是物理刪除 | `clearQueue` 直接刪除 JSON 檔案，無法復原 |
| 原子寫入 | 所有寫入操作使用 `atomicWrite` 避免中途斷電損壞 |
