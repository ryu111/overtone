# Proposal：cross-session-memory

## 功能名稱

`cross-session-memory`

## 需求背景（Why）

- **問題**：Overtone 的 Instinct 觀察系統（`instinct.js`）目前是 session-scoped。Session 結束後，`~/.overtone/sessions/{sessionId}/observations.jsonl` 不會自動升級到全域層，系統無法跨 session 累積學習。
- **目標**：建立全域 Instinct store，讓高信心觀察（>= 0.7）在 session 結束時「畢業」到全域層，新 session 開始時自動載入，實現跨 session 持續學習。
- **優先級**：Level 2「持續學習」的基礎設施。無此功能，Level 2 成熟度無法達成。成功指標：第 10 次做同類任務比第 1 次更快更好。

## 使用者故事

```
身為 Overtone 使用者
我想要系統能記住過去 session 中驗證過的知識（如「此專案用 bun 不用 npm」）
以便新 session 自動套用，不需要重新摸索相同問題
```

```
身為 Overtone 系統
我想要在 session 結束時自動萃取高信心觀察存至全域
以便下一個 session 能從累積的知識繼續，而不是從零開始
```

## 範圍邊界

### 在範圍內（In Scope）

- 全域 Instinct store：`~/.overtone/global/observations.jsonl`（JSONL，append-only）
- `paths.js` 新增 `global.observations` 路徑
- `global-instinct.js`：新模組，提供全域層 API（graduate、queryGlobal、summarizeGlobal、decayGlobal、pruneGlobal）
- `registry.js` 新增 `globalInstinctDefaults`（畢業閾值等設定）
- SessionEnd hook 畢業機制：將 `confidence >= 0.7` 的 session 觀察升至全域（去重：同 tag+type 已存在則 merge，取較高 confidence）
- SessionStart hook 載入機制：載入全域 `confidence >= 0.7` 的觀察 top-50，注入 systemMessage 提示 Main Agent
- 全域 store 膨脹控制：auto-compaction（同 id 合併，同 `instinct.js` 現有機制）
- 測試覆蓋：unit（global-instinct.js）+ integration（session-end 畢業、session-start 載入）

### 不在範圍內（Out of Scope）

- 專案維度隔離（`{projectHash}/`）— 留到下一迭代視需求評估
- 全域 decay 定期觸發（SessionEnd 時執行一次 decayGlobal）— 納入實作，但不設定排程
- 與 claude-mem MCP 的整合 — 未來考慮
- 進化候選自動觸發 — 未來考慮
- SQLite 或非 JSONL 儲存
- 跨機器同步
- UI 管理介面

## 技術決策（針對 Open Questions）

1. **全域 store 路徑**：`~/.overtone/global/observations.jsonl`（不加 projectHash）。理由：觀察本身大多是通用的（如「用 bun 不用 npm」），專案隔離在此階段屬過早優化；路徑簡單易管理。

2. **畢業閾值**：沿用 `0.7`（與 `autoApplyThreshold` 一致）。理由：已有語意（「可自動應用」），不引入新閾值降低認知負擔。

3. **SessionStart 載入策略**：載入 `top-50` 依信心降序。理由：全量載入在 store 膨脹後會佔用過多 context；top-50 涵蓋最有價值的知識，足夠實用。

4. **全域 store 膨脹控制**：採用 auto-compaction（同 `instinct.js`：_readAll 檢測重複 id，行數 > 唯一數 * 2 時重寫）。理由：無縫沿用現有機制，無額外複雜度。

5. **整合方式**：新建 `global-instinct.js` 而非擴展 `instinct.js`。理由：全域層的 merge 邏輯（去重合併）與 session 層不同；分離保持單一職責，避免現有 session 邏輯受影響。`instinct.js` 保持不變。

## 子任務清單

依照執行順序，標記可並行任務：

1. **TEST:spec — 撰寫 BDD 規格**
   - 負責 agent：tester
   - 相關檔案：`specs/features/in-progress/cross-session-memory/bdd.md`
   - 說明：定義 GIVEN/WHEN/THEN 行為規格，涵蓋畢業機制、載入機制、去重邏輯、膨脹控制

2. **DEV-1 — paths.js 新增全域路徑**（可在 TEST:spec 後並行開始）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/paths.js`
   - 說明：新增 `global` 物件（`observations`、`dir` 路徑函式），`GLOBAL_DIR = ~/.overtone/global`

3. **DEV-2 — registry.js 新增 globalInstinctDefaults**（可與 DEV-1 並行）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/registry.js`
   - 說明：新增 `globalInstinctDefaults = { graduationThreshold: 0.7, loadTopN: 50 }`；同步更新 `registry-data.json` 若必要

4. **DEV-3 — 建立 global-instinct.js**（依賴 DEV-1、DEV-2）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/global-instinct.js`（新建）
   - 說明：API：`graduate(sessionId)`、`queryGlobal(filter)`、`summarizeGlobal()`、`decayGlobal()`、`pruneGlobal()`；去重邏輯：同 tag+type 已存在則取 max(confidence) merge

5. **DEV-4 — SessionEnd hook 畢業機制**（依賴 DEV-3）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/hooks/scripts/session/on-session-end.js`
   - 說明：在 session 清理前呼叫 `globalInstinct.graduate(sessionId)`；記錄畢業數量至 stderr（debug 用）

6. **DEV-5 — SessionStart hook 載入機制**（依賴 DEV-3）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/hooks/scripts/session/on-start.js`
   - 說明：在 banner 後呼叫 `globalInstinct.queryGlobal({ minConfidence: 0.7, limit: 50 })`；若有觀察，附加至 `systemMessage`（格式：「全域知識（上次學習）：...」）

7. **DEV-6 — 測試：unit**（可與 DEV-4、DEV-5 並行）
   - 負責 agent：developer
   - 相關檔案：`tests/unit/global-instinct.test.js`（新建）
   - 說明：測試 global-instinct.js 的 graduate/query/summarize/decay/prune/去重邏輯

8. **DEV-7 — 測試：integration**（依賴 DEV-4、DEV-5）
   - 負責 agent：developer
   - 相關檔案：`tests/integration/cross-session-memory.test.js`（新建）
   - 說明：模擬 session end → 畢業 → session start → 載入的完整流程；驗證 systemMessage 包含全域觀察

## 開放問題

- **architect 決定**：`global-instinct.js` 的 `graduate` 是否應在畢業時觸發 `decayGlobal`（趁機清理全域 store）？還是 decay 只在 SessionStart 時執行？
- **architect 決定**：SessionStart 注入的 systemMessage 格式 — 純文字列表還是結構化 JSON 給 Main Agent 解析？
- **architect 決定**：全域 store 若不存在（首次執行），SessionStart 是否靜默跳過還是初始化空檔？
