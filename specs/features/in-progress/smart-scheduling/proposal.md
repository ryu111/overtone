# Proposal 格式樣板

## 功能名稱

`smart-scheduling`

## 需求背景（Why）

- **問題**：`suggestOrder` 目前只依 workflow 複雜度（`WORKFLOW_ORDER`）靜態排序。複雜度相同的項目維持原始輸入順序，不考慮該 workflow 的歷史表現。若某個 workflow 近期頻繁失敗，仍然被排在高優先位置，造成連續失敗風險。
- **目標**：整合 `failure-tracker.js` 的失敗率資料，讓 `suggestOrder` 在複雜度分組內再依失敗率二次排序，歷史失敗率高的項目排後面，成功率高的排前面，降低連續失敗的機率並形成正面回饋循環。
- **優先級**：佇列排序是自主執行的關鍵路徑，改善排序品質可直接減少 session 浪費，且改動範圍小、風險可控，值得現在做。

## 使用者故事

```
身為使用自主佇列執行的工程師
我想要佇列自動把歷史成功率高的 workflow 排前面
以便減少連續失敗浪費、提高佇列執行效率
```

```
身為 Overtone 系統
我想要 suggestOrder 在無失敗資料時維持原有行為
以便向後相容、不影響測試覆蓋率和既有呼叫方式
```

## 範圍邊界

### 在範圍內（In Scope）

- `suggestOrder` 新增可選的 `options` 參數（含 `failureData` 欄位），有傳入時用於二次排序
- 排序邏輯：主鍵 = `WORKFLOW_ORDER`（複雜度），次鍵 = workflow 的歷史失敗率（低失敗率優先），三鍵 = 原始 idx（穩定排序）
- 失敗率從 `getFailurePatterns().byStage` 取得，依 workflow 名稱對應 stage 名稱（需確認對應方式，見開放問題）
- `queue.js` CLI 的 `suggest-order` 子命令：在有 `--smart` flag 時自動載入 `getFailurePatterns` 並傳入
- 新增單元測試覆蓋：有/無 `failureData`、tie-breaking 行為、零失敗時退化為原邏輯

### 不在範圍內（Out of Scope）

- ML / 統計模型（如指數衰減加權、貝葉斯平滑）
- 失敗率以外的訊號（如執行時長、retry 次數）
- 自動呼叫 `applyOrder`（仍維持「只建議不寫入」語意）
- 修改 `failure-tracker.js` 本身的資料結構或 API

## 子任務清單

1. **修改 `suggestOrder` 加入失敗率二次排序**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/execution-queue.js`
   - 說明：
     - 現有簽名：`suggestOrder(projectRoot)`
     - 新簽名：`suggestOrder(projectRoot, options)`，`options.failureData` 為 `getFailurePatterns()` 回傳值（可選）
     - 排序鍵順序：`(WORKFLOW_ORDER[wf] ?? 99, failureRate ?? 0, idx)`
     - `failureData` 缺席或 `byStage` 無對應 key 時，failureRate = 0（退化為原邏輯）
     - 不改動 `applyOrder`、`dedup`、其他函式

2. **修改 `queue.js` CLI 支援 `--smart` flag**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/queue.js`
   - 說明：
     - `suggest-order` 子命令新增 `--smart` flag 解析
     - 有 `--smart` 時：`require('./lib/failure-tracker').getFailurePatterns(projectRoot)` 取得資料後傳入 `suggestOrder`
     - 無 `--smart` 時：原有行為不變（向後相容）
     - CLI 輸出補充一行說明（有無 `--smart` 模式）

3. **新增單元測試**（可與子任務 1、2 並行開發，待 1 完成後驗證）
   - 負責 agent：developer
   - 相關檔案：`tests/unit/queue-smart-schedule.test.js`
   - 說明：
     - 在現有 `suggestOrder` describe 區塊後新增 `suggestOrder with failureData` describe
     - 測試案例：
       1. 相同 workflow 複雜度、有失敗率差異時，低失敗率排前面
       2. failureData 為 null / undefined 時退化為原邏輯
       3. byStage 無對應 key 時（未知 workflow）failureRate = 0，不報錯
       4. 所有 failureRate 相同時，idx 仍維持穩定排序
     - 測試不寫入真實 failures.jsonl（直接構造 failureData 物件傳入，不依賴 failure-tracker.js 的檔案 IO）

## 開放問題

1. **failureRate 對應鍵**：`getFailurePatterns().byStage` 的 key 是 stage 名稱（如 `DEV`、`TEST`），而 queue item 的 `workflow` 是工作流名稱（如 `standard`、`quick`）。兩者不是一對一對應。architect 需決定：應該用 `item.workflow` 直接當 key 查（在 `byStage` 幾乎不會命中，因為 stage 是大寫），還是應該改用 `byAgent` 或新增一個按 workflow 聚合的查詢函式？
2. **failureData 注入點**：`suggestOrder` 目前是純同步函式（無 IO）。若 CLI 以外的呼叫方（如 session-stop-handler.js）也想用智慧排序，architect 需決定：由呼叫方負責載入 failureData 再傳入（保持 suggestOrder 無 IO），或是 suggestOrder 在有 projectRoot 時自行讀取（把 IO 移進函式）。
3. **`--smart` 是否應設為預設**：CLI 目前 `suggest-order` 不需要 flag，architect 需決定長期是否把智慧排序設為預設行為，或始終要求顯式 opt-in。
