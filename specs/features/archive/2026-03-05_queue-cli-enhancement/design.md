# Design: queue-cli-enhancement

## 技術摘要（What & Why）

- **方案**：直接擴充 `execution-queue.js`（五個新函式）+ `queue.js`（五個新子命令），沿用現有 `atomicWrite` + `readQueue` pattern
- **理由**：現有架構已有清晰的 library/CLI 分層，新功能直接套用同一模式，不引入新抽象
- **取捨**：anchor 語法（`--before`/`--after <name>`）而非 index 數字定位 — 語意更清晰、不會因項目增減而位移，但 anchor 名稱需存在於佇列

## 設計決策（Open Questions 解答）

### 決策 1：remove 是否允許刪除 completed

- **決定**：不允許（只允許 `pending` / `failed`）
- **理由**：completed 是歷史記錄，刪除會破壞 `completed/total` 計數語意。若需清理整個佇列，使用 `clear` 命令。

### 決策 2：move 是否允許移動 completed

- **決定**：不允許（只允許 `pending`）
- **理由**：completed 項目已完成，移動不影響執行結果；`in_progress` 執行中不可干預；只有 pending 的執行順序調整有實際意義。failed 項目本身不自動執行（需先 retry），允許 move failed 讓使用者重新排定重試順序，所以允許 `pending` 和 `failed` 移動。

### 決策 3：retry 是否阻擋 in_progress

- **決定**：阻擋。若有 `in_progress` 項目，retry 回傳錯誤
- **理由**：retry 讓 failed 項目變回 pending，若 heartbeat 隨即推進，可能導致兩個項目同時 in_progress，行為不可預期。

### 決策 4：insert 新項目的初始狀態

- **決定**：一律 `pending`，不提供選項
- **理由**：插入的任務尚未執行，pending 是唯一合理的初始狀態。

### 決策 5：anchor 不存在時的行為

- **決定**：回傳錯誤，不靜默插入到末尾
- **理由**：靜默 fallback 會讓使用者誤以為操作成功，實際位置卻不符預期。明確報錯讓意圖清晰。

## API 介面設計

### execution-queue.js 新增函式

```javascript
/**
 * 在指定 anchor 項目前或後插入新項目
 * @param {string} projectRoot
 * @param {string} name         - 新項目名稱
 * @param {string} workflow     - 新項目 workflow
 * @param {string} anchor       - 定位用的現有項目名稱
 * @param {'before'|'after'} position
 * @returns {{ ok: boolean, error?: string }}
 *   error codes: QUEUE_NOT_FOUND | ANCHOR_NOT_FOUND
 */
function insertItem(projectRoot, name, workflow, anchor, position)

/**
 * 刪除指定名稱的佇列項目（僅允許 pending / failed）
 * @param {string} projectRoot
 * @param {string} name
 * @returns {{ ok: boolean, error?: string }}
 *   error codes: QUEUE_NOT_FOUND | ITEM_NOT_FOUND | INVALID_STATUS
 *   INVALID_STATUS 當 status 為 in_progress 或 completed
 */
function removeItem(projectRoot, name)

/**
 * 將指定項目移動到 anchor 的前或後（允許 pending / failed）
 * @param {string} projectRoot
 * @param {string} name         - 要移動的項目名稱
 * @param {string} anchor       - 定位用的現有項目名稱
 * @param {'before'|'after'} position
 * @returns {{ ok: boolean, error?: string }}
 *   error codes: QUEUE_NOT_FOUND | ITEM_NOT_FOUND | ANCHOR_NOT_FOUND | INVALID_STATUS | SELF_ANCHOR
 *   INVALID_STATUS 當 status 為 in_progress 或 completed
 *   SELF_ANCHOR 當 name === anchor
 */
function moveItem(projectRoot, name, anchor, position)

/**
 * 查詢單一項目的完整資訊
 * @param {string} projectRoot
 * @param {string} name
 * @returns {{ ok: boolean, item?: object, index?: number, error?: string }}
 *   error codes: QUEUE_NOT_FOUND | ITEM_NOT_FOUND
 *   item 包含完整欄位：name, workflow, status, startedAt?, completedAt?, failedAt?, failReason?
 */
function getItem(projectRoot, name)

/**
 * 將 failed 項目重設為 pending（清除 failedAt / failReason）
 * @param {string} projectRoot
 * @param {string} name
 * @returns {{ ok: boolean, error?: string }}
 *   error codes: QUEUE_NOT_FOUND | ITEM_NOT_FOUND | INVALID_STATUS | IN_PROGRESS_CONFLICT
 *   INVALID_STATUS 當 status 不是 failed
 *   IN_PROGRESS_CONFLICT 當佇列中有 in_progress 項目
 */
function retryItem(projectRoot, name)
```

### 回傳值統一格式

```javascript
// 成功
{ ok: true }
{ ok: true, item: {...}, index: 0 }   // getItem

// 失敗
{ ok: false, error: 'QUEUE_NOT_FOUND' }
{ ok: false, error: 'ITEM_NOT_FOUND' }
{ ok: false, error: 'ANCHOR_NOT_FOUND' }
{ ok: false, error: 'INVALID_STATUS' }   // 附加 item.status 讓 CLI 顯示
{ ok: false, error: 'IN_PROGRESS_CONFLICT', conflictName: string }
{ ok: false, error: 'SELF_ANCHOR' }
```

### CLI 子命令（queue.js）

```
bun scripts/queue.js insert <name> <workflow> --before <anchor>
bun scripts/queue.js insert <name> <workflow> --after <anchor>

bun scripts/queue.js remove <name>

bun scripts/queue.js move <name> --before <anchor>
bun scripts/queue.js move <name> --after <anchor>

bun scripts/queue.js info <name>

bun scripts/queue.js retry <name>
```

#### Flag 解析規則

- `--before` 和 `--after` 互斥：若同時提供，回傳錯誤並 exit(1)
- `insert` / `move` 缺少 `--before` 或 `--after` 時，回傳錯誤並 exit(1)
- `--before`、`--after` 加入 `optionKeys` 過濾清單（與現有 `--project-root`、`--source` 同處理方式）

### 錯誤碼對應的 CLI 輸出

| 錯誤碼 | CLI 輸出 |
|--------|---------|
| `QUEUE_NOT_FOUND` | `佇列不存在` |
| `ITEM_NOT_FOUND` | `找不到項目：{name}` |
| `ANCHOR_NOT_FOUND` | `找不到定位項目：{anchor}` |
| `INVALID_STATUS` | `無法操作 {status} 狀態的項目：{name}` |
| `IN_PROGRESS_CONFLICT` | `目前有項目正在執行中（{conflictName}），請等待完成後再重試` |
| `SELF_ANCHOR` | `來源和定位項目不可相同：{name}` |

## 資料模型

佇列格式不變，`insertItem` / `moveItem` / `retryItem` 操作後的項目欄位如下：

```javascript
// retryItem 後的項目（清除失敗欄位）
{
  name: string,
  workflow: string,
  status: 'pending',    // 從 failed 重設
  // failedAt 和 failReason 欄位被移除
  // startedAt 也一併清除（重新執行）
}

// insertItem 建立的新項目
{
  name: string,
  workflow: string,
  status: 'pending'
}
```

儲存位置：`~/.overtone/global/{projectHash}/execution-queue.json`
格式：JSON，透過 `atomicWrite` 原子寫入

## 檔案結構

```
修改的檔案：
  plugins/overtone/scripts/lib/execution-queue.js  <- 新增 5 個函式 + module.exports
  plugins/overtone/scripts/queue.js                <- 新增 5 個 cmd 函式 + switch cases + help + module.exports

新增的檔案：
  tests/unit/execution-queue-enhancement.test.js   <- 5 個新函式的單元測試
  tests/integration/queue-cli-enhancement.test.js  <- CLI 子命令整合測試
```

CLAUDE.md 的 `queue.js` 區塊補充五個新子命令說明（不新增檔案，就地更新）。

## 實作注意事項

1. **atomicWrite 慣用**：所有修改都必須用 `atomicWrite(filePath, queue)` 寫入，與現有函式一致
2. **name 唯一性**：insert 時若 name 已存在，應直接插入（不阻擋）— proposal 未提到阻擋，保持彈性；dedup 可事後清理
3. **optionKeys 過濾**：`--before` 和 `--after` 需加入 `optionKeys` 陣列，其後的 value 也不可被當作 positional args
4. **getItem 的 info 輸出**：顯示所有欄位，包含時間戳記，`failReason` 若有則顯示
5. **retryItem 清除欄位**：使用 destructuring 建立新物件，確保 `failedAt` / `failReason` / `startedAt` 完全移除（不是設為 undefined）
6. **move 的實作順序**：先從陣列移除目標項目，再找 anchor 的新 index，然後插入 — 兩步操作，避免 anchor index 因移除而偏移
