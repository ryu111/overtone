# Proposal：prompt-journal

## 功能名稱

`prompt-journal`（擴展 Instinct + skipDedup 機制）

## 需求背景（Why）

- **問題**：Overtone 的 Instinct 系統目前只記錄 workflow_routing（prompt 前 80 字 → 工作流對應），不保留完整 prompt 原文，也不配對 session 結果。系統無法回答「使用者在什麼情境下做了什麼，結果如何」。
- **目標**：完整記錄每次 prompt（`intent_journal` 類型），session 結束時配對結果（pass/fail/abort），高信心意圖模式畢業到全域 store，新 session 啟動時注入「最近常做的事」摘要。
- **優先級**：Level 2.5 能力橋接（持續學習 → 自我進化）。架構是關鍵，必須設計正確。

## 使用者故事

```
身為 Overtone 系統
我想要記錄使用者每次 prompt 的完整原文和 session 結果配對
以便在未來 session 識別使用者的意圖模式，提供更準確的 workflow 建議
```

```
身為 Overtone 主 Agent
我想要在 SessionStart 看到「最近常做的事」摘要
以便在 session 啟動時就有意圖上下文，做出更好的決策
```

## 架構分析

### 現有 instinct.js emit() 去重行為

`emit()` 目前：「同 tag + type 已存在 → 確認（信心 +0.05）」。
`intent_journal` 需要記錄每次 prompt，不能被去重（每次都是唯一事件）。

**解法**：為 `emit()` 新增 `skipDedup` 選項，傳入時繞過 `existing = list.find(...)` 邏輯，直接建立新 instinct 記錄。

### intent_journal 資料格式

```json
{
  "id": "inst_xxx",
  "ts": "ISO",
  "lastSeen": "ISO",
  "type": "intent_journal",
  "trigger": "<完整 prompt 原文>",
  "action": "<workflow context>",
  "tag": "journal-<timestamp-hex>",
  "confidence": 0.3,
  "count": 1,
  "workflowType": "standard|quick|null",
  "sessionResult": "pass|fail|abort|pending"
}
```

`tag` 需唯一（含時間戳），確保 skipDedup 後的自動壓縮不會誤合併。

### 全域畢業策略（Should 5）

`intent_journal` 的全域畢業需要特殊處理：現有 `global-instinct.graduate()` 以 `tag+type` 為去重鍵，`intent_journal` 的每筆 tag 唯一，所以畢業後全域 store 會累積大量記錄。

**解法選項（留給 architect 決定）**：
- A. 全局 store 不儲存 raw journal，只儲存聚合摘要（需新增 aggregation 邏輯）
- B. journal 記錄有 TTL，畢業後全域 store 定期 prune（配合現有 decayGlobal）
- C. 全域 store 儲存 journal，但 loadTopN 篩選時排除 intent_journal type

### session-end 配對邏輯

`session-end-handler.js` 讀取 `workflow.json` 取得最終 workflowType 和完成狀態，
更新所有 `sessionResult: 'pending'` 的 intent_journal 記錄。

需要透過 `instinct._readAll()` + `instinct._writeAll()` 批量更新（全量重寫）。

### SessionStart 摘要注入

從全域 store 篩選 `type: intent_journal`，取最近 N 筆（按 `lastSeen` 降序），
組裝成「最近常做的事」摘要注入 systemMessage。

## 範圍邊界

### 在範圍內（In Scope）

**Must**：
- `instinct.js`：`emit()` 新增 `skipDedup` 選項（第 4 個參數或 options object）
- `on-submit-handler.js`：每次 UserPromptSubmit 記錄完整 prompt（type: intent_journal，skipDedup: true）
- `session-end-handler.js`：session 結束時批量更新 intent_journal 的 sessionResult 欄位
- 測試覆蓋：skipDedup 行為 + intent_journal 記錄 + 結果配對

**Should**：
- `registry.js`：新增 `journalDefaults` 設定（maxPromptLength, topN 等）
- `global-instinct.js`：畢業機制調整（處理 intent_journal 的策略，architect 決定）
- `session-start-handler.js`：載入全域意圖模式，注入「最近常做的事」摘要

**Could**：
- `data.js`：`query journal` 子命令，查詢 prompt 歷程

### 不在範圍內（Out of Scope）

- 預測引擎（intent-predictor.js）
- AskUserQuestion 主動互動
- AI 語意分析
- 跨 project 的 journal 聚合

## 子任務清單

依執行順序，標記並行關係：

### Phase 1（必須先完成）

1. **[T1] `instinct.js` 新增 skipDedup 選項**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/knowledge/instinct.js`
   - 說明：`emit(sessionId, type, trigger, action, tag, { skipDedup: true })` — 傳入時繞過 `tag+type` 去重，直接建立新記錄。`_newId()` 確保 id 唯一；tag 可傳入含時間戳的唯一值（如 `journal-${Date.now().toString(36)}`）避免自動壓縮誤合併。

2. **[T2] `registry.js` 新增 `journalDefaults`**（可與 T1 並行）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/registry.js`
   - 說明：新增 `journalDefaults = { maxPromptLength: 2000, loadTopN: 10, graduateMinResult: 'pass' }` 等常數，供後續任務引用。

### Phase 2（依賴 T1、T2）

3. **[T3] `on-submit-handler.js` 擴展：記錄 intent_journal**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/on-submit-handler.js`
   - 說明：在現有 `workflow_routing` 記錄下方新增 `instinct.emit()` 呼叫，type: `intent_journal`，trigger: 完整 prompt（截至 maxPromptLength），action: workflow context 摘要，tag: `journal-${Date.now().toString(36)}`，options: `{ skipDedup: true }`，初始 sessionResult: `pending`。注意：需擴展回傳的 instinct 記錄，附加 `sessionResult: 'pending'`。

4. **[T4] `session-end-handler.js` 擴展：配對 sessionResult**（可與 T3 並行，依賴 T1）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/session-end-handler.js`
   - 說明：在現有 graduate 步驟後，新增 journal 配對邏輯：讀取所有 intent_journal 記錄，取得 workflowType + 最終狀態（pass/fail/abort），更新 sessionResult 欄位，全量寫回 observations.jsonl。

### Phase 3（依賴 T3、T4，architect 決定全域畢業策略後）

5. **[T5] 全域畢業機制調整**（Should）
   - 負責 agent：developer（依 architect 決策）
   - 相關檔案：`plugins/overtone/scripts/lib/knowledge/global-instinct.js`
   - 說明：根據 architect 決定的策略（A/B/C）實作。建議優先策略 C：全域 store 不過濾 intent_journal，但 `queryGlobal` 支援 `excludeTypes` 過濾參數，SessionStart 載入時排除。

6. **[T6] `session-start-handler.js` 注入「最近常做的事」摘要**（Should，依賴 T5）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/session-start-handler.js`
   - 說明：在現有全域觀察載入段落後，新增從全域 store 篩選 `type: intent_journal`、取最近 loadTopN 筆（`sessionResult: 'pass'` 優先），組裝摘要字串，注入 systemMessage。

### Phase 4（可獨立進行）

7. **[T7] `data.js` 新增 `query journal` 子命令**（Could）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/data.js`
   - 說明：`bun scripts/data.js query journal [--session <id>] [--limit N]`，列出 intent_journal 記錄，顯示 ts、prompt 前 60 字、sessionResult。

### Phase 5（並行）

8. **[T8] 測試覆蓋**（Must，依賴 T1-T4）
   - 負責 agent：tester
   - 相關檔案：`tests/unit/instinct-skip-dedup.test.js`（新建）、`tests/unit/on-submit-handler.test.js`（擴展）、`tests/unit/session-end-handler.test.js`（擴展）
   - 說明：
     - skipDedup 行為：同 tag+type emit 兩次，得到 2 筆獨立記錄（非更新）
     - intent_journal 記錄：完整 prompt 不截斷（在 maxPromptLength 內）
     - 結果配對：session end 後 intent_journal 的 sessionResult 更新正確

## Dev Phases 摘要

```
Phase 1（並行）：T1（skipDedup）+ T2（journalDefaults）
Phase 2（並行）：T3（on-submit）+ T4（session-end）— 依賴 Phase 1
Phase 3（依序）：T5（全域畢業）→ T6（session-start 注入）— 依賴 Phase 2 + architect 決策
Phase 4（獨立）：T7（data.js query journal）— 任何時間點均可
Phase 5（並行）：T8（測試）— 建議 T1-T4 完成後進行
```

## 開放問題

1. **全域畢業策略**（影響 T5/T6）：intent_journal 畢業到全域 store 的策略：A（只存聚合）/ B（TTL prune）/ C（queryGlobal excludeTypes）。建議 C，但 architect 需確認。

2. **skipDedup API 設計**：`emit()` 第 6 個參數用 options object `{ skipDedup: true }` 還是直接加 boolean 參數？考量到未來擴展性，options object 更好，但需 architect 確認。

3. **sessionResult 配對的 pass 判定**：`session-end-handler.js` 如何取得「pass/fail」？現有 `currentState.workflowType` 存在，但沒有直接的 success 旗標。需要讀 workflow.json 的 `status` 或 timeline 最後一個事件？architect 決定。

4. **intent_journal 的 decay/prune**：intent_journal 記錄是否應該參與現有的週衰減機制？若 sessionResult=fail 的記錄永遠不畢業，它們會因 autoDeleteThreshold 被刪除，這是否合理？

5. **完整 prompt 截斷**：`maxPromptLength: 2000` 是否足夠？prompt 可能很長（如貼上程式碼），需要確認截斷策略不破壞語意。
