# Proposal: instinct-pollution-fix

## 需求背景（Why）

- **問題**：PostToolUse hook 的知識歸檔流程（`archiveKnowledge`）在處理 agent 輸出時，缺乏「來源專案」過濾機制。當使用者在 Overtone 環境中開發外部專案（如 md-blog）時，外部專案的領域知識（marked@9 API、Markdown parser 實作細節）會被路由並寫入 Overtone 自身的 `auto-discovered.md`，污染知識庫。
- **目標**：讓 `archiveKnowledge` 只歸檔屬於 Overtone 自身（`plugins/overtone/` 路徑範圍內）的知識；外部專案的知識降級為 gap-observation，不寫入 skills/ 目錄。同時清理已發生的污染條目。
- **優先級**：污染會持續積累並影響 internalize 飛輪的品質，且修復範圍清晰、低風險，應盡快處理。

## 使用者故事

```
身為 Overtone 開發者
我想要 archiveKnowledge 只接受屬於 Overtone 專案的知識片段
以便 auto-discovered.md 不被外部專案（md-blog、Kuji 等）的領域知識污染
```

```
身為 Overtone 開發者
我想要 清理已污染的 auto-discovered.md
以便 internalize 飛輪從乾淨的知識庫出發，不重複內化外部知識
```

## 驗收標準（BDD）

**Scenario A：外部專案知識不歸檔**
- GIVEN 在 Overtone 專案中開發外部專案（md-blog），agent 輸出包含 `projects/md-blog/` 路徑的知識片段
- WHEN agent 完成 DEV 階段，呼叫 `archiveKnowledge`
- THEN `archiveKnowledge` 回傳 `archived = 0`，無任何條目寫入 `auto-discovered.md`

**Scenario B：Overtone 自身知識正常歸檔**
- GIVEN agent 輸出包含 `plugins/overtone/scripts/lib/` 路徑的知識片段
- WHEN agent 完成，呼叫 `archiveKnowledge`
- THEN 知識正常寫入對應 domain 的 `auto-discovered.md`

**Scenario C：外部知識降級為 gap-observation**
- GIVEN agent 輸出包含外部路徑知識片段，且 sessionId 存在
- WHEN `archiveKnowledge` 執行來源過濾
- THEN instinct.emit 記錄一筆 `knowledge_gap` 觀察，`archived = 0`

**Scenario D：已污染條目被清理**
- GIVEN `auto-discovered.md` 含有 md-blog/Kuji 相關條目（source 包含 `md-blog`、`markdown`、`marked`、`kuji` 等外部關鍵詞）
- WHEN 執行清理腳本（或手動清理）
- THEN 外部條目被移除，Overtone 自身知識（`developer:DEV`、`architect:ARCH` 等源自 plugins/overtone 的條目）保留

## 範圍邊界

### 在範圍內（In Scope）

- `knowledge-archiver.js`：在 `archiveKnowledge` 的 fragment 循環中加入來源路徑過濾邏輯，偵測 fragment.source / fragment.content 是否含外部路徑特徵
- 來源判斷標準：fragment.source（agent 輸出的路徑/文字）不包含 `plugins/overtone/` 路徑特徵時，視為外部知識
- 外部知識處理：降級為 gap-observation（調用 instinct.emit），不寫入 auto-discovered.md
- 清理 `plugins/overtone/skills/claude-dev/references/auto-discovered.md` 中的污染條目（md-blog PM Findings、planner PLAN Findings 等外部專案條目）
- 新增 / 擴展 `tests/unit/knowledge-archiver.test.js` 的測試 scenarios，覆蓋來源過濾邏輯

### 不在範圍內（Out of Scope）

- 修改 `knowledge-searcher.js`（extractKnowledge 邏輯不變，過濾在 archiver 層）
- 修改 `skill-router.js` 的路由演算法（僅在 archiver 控制是否送入路由）
- 修改 `agent-stop-handler.js` 的呼叫點（介面不變）
- 其他 skill domain 的 auto-discovered.md（目前僅 claude-dev 確認有污染）
- 自動化清理腳本（手動清理即可，污染條目少）
- 過濾規則的設定化（預設行為即可，無需外部設定）

## 子任務清單

1. **分析現有污染條目**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/skills/claude-dev/references/auto-discovered.md`
   - 說明：人工審閱 auto-discovered.md，標記屬於外部專案的條目（source 含 md-blog、planner:PLAN Findings md-blog 相關、PM Findings md-blog 相關），確認要保留的 Overtone 自身條目清單。此步驟在 DEV Phase 1 執行，為後續清理提供依據。

2. **實作來源過濾邏輯**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/knowledge/knowledge-archiver.js`
   - 說明：在 `archiveKnowledge` 的 fragment 迴圈中，於呼叫 `routeKnowledge` 之前加入過濾判斷。過濾條件由 architect 決定（見開放問題），預計以 `pluginRoot`（`plugins/overtone/`）作為基準，檢查 fragment.source 或 fragment.content 是否帶有外部路徑特徵。外部知識改呼叫 `instinct.emit` 記錄 gap-observation 後 continue，不進入路由流程。

3. **清理已污染的 auto-discovered.md**（可與任務 2 並行）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/skills/claude-dev/references/auto-discovered.md`
   - 說明：根據任務 1 的分析結果，移除外部專案條目（md-blog PM Findings、planner PLAN Findings 中的 md-blog 需求分析等），保留 Overtone 自身開發知識（claude-dev skill 建立、hooks.json 格式、session-start-handler 等）。使用 `---` 區塊邊界做精確刪除，不誤刪 Overtone 條目。

4. **擴展單元測試**（依賴任務 2 完成）
   - 負責 agent：developer
   - 相關檔案：`tests/unit/knowledge-archiver.test.js`
   - 說明：新增 3 個測試 scenarios 覆蓋來源過濾邏輯：
     - Scenario 外部路徑知識 → archived = 0（BDD Scenario A）
     - Scenario Overtone 路徑知識 → archived > 0（BDD Scenario B 回歸）
     - Scenario 外部知識 + sessionId → instinct.emit 被呼叫（BDD Scenario C，需 mock instinct）

## 開放問題

- **過濾條件的精確定義**：fragment.source 包含的是 agent 名稱（如 `product-manager:PM`）而非檔案路徑；真正的路徑資訊在 fragment.content 中。architect 需決定：(a) 從 content 中掃描路徑模式（`projects/`、非 `plugins/overtone/` 的路徑）、還是 (b) 在 `archiveKnowledge` 的呼叫介面加入 `externalPaths` 參數讓呼叫方傳入、還是 (c) 以 fragment.source 的 agentName 為依據（部分 agent 在外部專案工作時仍用相同名稱，此法不可靠）。
- **其他 skill domain 是否有污染**：僅 claude-dev 確認有污染，但可能其他 domain 也受影響。architect 可決定是否要在 DEV 階段掃描所有 auto-discovered.md 確認。
- **測試中如何 mock instinct.emit**：現有測試是否有 mock 機制可複用？architecture 決定 mock 策略（jest.spyOn 等效的 bun 方式）。
