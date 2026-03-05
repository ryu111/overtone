# Proposal: queue-cli-enhancement

## 功能名稱

`queue-cli-enhancement`

## 需求背景（Why）

- **問題**：現有 queue.js CLI 只支援批次操作（add/append/clear）和唯讀查詢（list），缺乏對個別佇列項目的精細控制。使用者無法在不重建整個佇列的情況下，插入、刪除、移動或重試單一項目。當佇列中某個任務失敗，目前只能手動清除整個佇列重建，操作成本過高。
- **目標**：提供五個新子命令（insert / remove / move / info / retry），讓使用者能精確管理佇列中的個別項目，降低佇列維護成本。
- **優先級**：Phase 4 進行中，佇列管理已是日常操作，精細控制能力是下一個自然延伸。

## 使用者故事

```
身為 Overtone 操作者
我想要能夠在佇列中插入、刪除、移動、查詢、重試個別項目
以便不需要重建整個佇列就能精確調整執行計劃
```

```
身為 Overtone 操作者
我想要能重試 failed 的佇列項目
以便不需要手動清除佇列，能直接從失敗點繼續執行
```

## 範圍邊界

### 在範圍內（In Scope）

- `insert` — 在指定 name 的項目之前或之後插入新項目，語法：`insert <name> <workflow> --before <anchor>` 或 `--after <anchor>`
- `remove` — 刪除佇列中指定 name 的項目（僅允許 pending / failed 狀態，不可刪除 in_progress）
- `move` — 將指定 name 的項目移動到另一個 anchor 的前或後，語法：`move <name> --before <anchor>` 或 `--after <anchor>`
- `info` — 查詢單一項目的完整詳細資訊（name、workflow、status、時間戳記、failReason）
- `retry` — 將 failed 項目重新標記為 pending，清除 failReason / failedAt 欄位
- execution-queue.js 新增對應的五個核心函式：`insertItem` / `removeItem` / `moveItem` / `getItem` / `retryItem`
- 新子命令加入 queue.js module.exports（供測試使用）
- 更新 CLAUDE.md queue.js 用法說明

### 不在範圍內（Out of Scope）

- 批次 retry（一次重試所有 failed 項目）— 可用 retry --all，留到未來
- 修改現有項目的 workflow 類型（rename/retype）
- insert 支援 --index 數字定位（anchor-based 定位已足夠且語意更清晰）
- in_progress 項目的刪除或移動（執行中不可干預）

## 子任務清單

依照執行順序，標記可並行的任務：

1. **execution-queue.js 擴充五個核心函式**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/execution-queue.js`
   - 說明：新增 `insertItem(projectRoot, name, workflow, anchor, position)`、`removeItem(projectRoot, name)`、`moveItem(projectRoot, name, anchor, position)`、`getItem(projectRoot, name)`、`retryItem(projectRoot, name)`。每個函式需處理邊界情況（佇列不存在、name 不存在、in_progress 保護、anchor 不存在）並回傳明確的成功/失敗結果。使用現有 `atomicWrite` 寫入。

2. **queue.js 新增五個 CLI 子命令**（依賴 1 完成）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/queue.js`
   - 說明：新增 `cmdInsert`、`cmdRemove`、`cmdMove`、`cmdInfo`、`cmdRetry` 函式，解析對應 positional args 和新 flag（`--before`、`--after`）。更新 `main()` switch 加入五個新 case，更新 help 文字，新增函式加入 `module.exports`。`--before`/`--after` 互斥，缺少 anchor 時顯示錯誤訊息。

3. **單元測試：execution-queue.js 五個新函式**（可與 2 並行）
   - 負責 agent：tester
   - 相關檔案：`tests/unit/execution-queue-enhancement.test.js`（新建）
   - 說明：每個函式測試正常路徑 + 至少兩個邊界情況（佇列不存在、name 不存在、in_progress 保護、anchor 不存在）。使用現有測試輔助工具（參考 tests/unit/ 現有模式）。

4. **整合測試：queue.js CLI 子命令**（依賴 2 完成）
   - 負責 agent：tester
   - 相關檔案：`tests/integration/queue-cli-enhancement.test.js`（新建）
   - 說明：透過 `main()` 函式直接呼叫測試各子命令的 CLI 行為（stdout 輸出、exit code、flag 解析）。覆蓋 insert --before/--after、remove 成功/失敗、move、info、retry 流程。

5. **更新 CLAUDE.md queue.js 用法說明**（可與 3 並行）
   - 負責 agent：doc-updater
   - 相關檔案：`plugins/overtone/CLAUDE.md`（實際是 `/Users/sbu/projects/overtone/CLAUDE.md`）
   - 說明：在「常用指令」章節的 `queue.js` 區塊補充五個新子命令的用法範例，格式與現有 `bun scripts/queue.js` 說明一致。

## 優先順序

```
[Task 1] execution-queue.js 核心函式
    |
    +---> [Task 2] queue.js CLI      [Task 3] 單元測試（可與 Task 2 並行）
              |
              +---> [Task 4] 整合測試

[Task 5] CLAUDE.md 更新（可與 Task 3 並行，不依賴 Task 2）
```

## 開放問題

1. **remove 的狀態限制**：目前規劃只允許刪除 pending / failed 狀態的項目，不允許刪除 completed。completed 項目是否應允許刪除？（若刪除會影響 completed/total 計數顯示）
2. **move 的狀態限制**：in_progress 項目不可移動，但 completed 項目是否允許移動？通常 completed 項目維持在原位更直觀。
3. **retry 對 in_progress 的處理**：若目前有項目 in_progress，retry 是否應阻擋（避免同時有兩個 in_progress 項目）？建議阻擋並提示。
4. **insert 的狀態**：新插入的項目一律為 pending，不需要選項，由 architect 確認。
