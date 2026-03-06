# PM-Architect 深度改進 — Proposal

## 需求背景

Overtone 在 Kuji Acid Test 中暴露了系統性問題。使用者用 Overtone 從零建立一番賞抽獎平台（Kuji），共修正 10 次，其中 4 次屬於 Overtone 系統本應預防的問題：

1. **Scope creep**：PM Brief 將分類功能標記為 Should，但 developer 仍然實作了
2. **Flow 設計遺漏**：PM 沒問「使用者在哪個頁面觸發抽獎」「抽完後想做什麼」
3. **Post-action 缺失**：「再來一次」按鈕應重抽同類型，PM/designer 未考慮
4. **跨元件狀態同步**：Architect 未設計前端狀態管理策略，導致點數不同步

使用者總結：**研究不透徹、設計不足、缺乏全方面考量**

## 使用者故事

GIVEN Overtone 執行 PM 階段訪談
WHEN PM 訪談完成並產出 Product Brief
THEN Product Brief 必須包含「入口點」「post-action flow」「跨元件狀態影響」資訊

GIVEN Overtone 執行 DEV 階段
WHEN developer 準備實作 PM Brief 中標記為 Should/Could 的功能
THEN developer 的 prompt 中應收到警告提示，說明此功能優先級

GIVEN Overtone 執行 ARCH 階段
WHEN architect 設計系統方案
THEN architect 的 DO checklist 必須包含「前端/跨元件狀態同步策略」

GIVEN PM 研究競品
WHEN 競品涉及使用者操作流程
THEN PM 應研究競品的 UX flow（操作路徑、post-action 設計），而非只比較功能清單

## 範圍邊界

### In Scope
- O1：在 pre-task-handler.js 的 updatedInput 注入中加入 PM Brief MoSCoW 警告
- O2：在 interview.js QUESTION_BANK 的 flow 面向新增 3 個必問題（入口點、post-action、狀態傳播）
- O3：architect.md DO 清單新增前端狀態同步考量；architecture skill 新增狀態管理 reference
- O4：product-manager.md 研究先行原則強化 UX flow 研究指引

### Out of Scope
- 完整的 MoSCoW 解析引擎（自動從 Product Brief 提取結構化資料）：需要 Product Brief 格式標準化，本次先做輕量版（keyword 比對）
- Architect 自動化狀態同步模板生成：屬於 DEV 階段工具，超出本次範圍
- PM 訪談引擎的完整重構：只新增必要問題，不改變整體架構

## 子任務清單

### Phase 1：可並行執行（無依賴）

**T1：O2 — interview.js flow 面向新增問題**
- agent: developer
- files: `plugins/overtone/scripts/lib/interview.js`
- 說明：在 QUESTION_BANK 的 flow 面向新增 3 個必問題（required: true）：
  - flow-6：「使用者在哪個頁面/入口點觸發這個操作？從哪裡來？」
  - flow-7：「操作完成後，使用者最可能想做什麼？（post-action flow）」
  - flow-8：「這個操作的結果需要反映在哪些其他頁面或元件？」
  - 注意：新增後 flow 面向有 6 個必問題，`minAnswersPerFacet: 2` 閾值不變，不影響完成判斷。需同步更新 interview-guide.md 的面向說明表格

**T2：O3 — architect.md DO 清單強化**
- agent: developer
- files: `plugins/overtone/agents/architect.md`（透過 manage-component.js update）
- 說明：在 DO 清單新增一條：「📋 若方案涉及跨頁面/跨元件的資料變動，MUST 定義狀態同步策略（前端 store / event bus / polling / SSE）」。同時在誤判防護新增：「沒有前端就不需要考慮狀態同步 — 後端 API 也有跨模組狀態傳播問題，需一併考量」

**T3：O4 — product-manager.md UX 研究指引強化**
- agent: developer
- files: `plugins/overtone/agents/product-manager.md`（透過 manage-component.js update）
- 說明：在「研究先行」的 Advisory 模式流程步驟 2（研究）中，明確加入「UX flow 研究」：研究競品時，除功能清單外，需研究「主要操作流程是什麼」「完成操作後引導使用者做什麼」。在 DO 清單新增：「📋 研究競品時 MUST 包含 UX flow 研究（操作路徑、post-action 引導），不可只列功能清單」

**T4：O3 — architecture skill 新增狀態管理 reference**
- agent: developer
- files:
  - `plugins/overtone/skills/architecture/SKILL.md`（透過 manage-component.js update）
  - `plugins/overtone/skills/architecture/references/state-sync-patterns.md`（新建）
- 說明：建立 state-sync-patterns.md，內容涵蓋：跨元件/頁面狀態同步的四種策略（全域 Store / Event Bus / API Polling / SSE/WebSocket）、每種策略的 tradeoff、選擇決策樹。在 SKILL.md 的資源索引新增此 reference

### Phase 2：依賴 Phase 1（T1 必須先完成）

**T5：O2 — interview-guide.md 同步更新**
- agent: developer
- files: `plugins/overtone/skills/pm/references/interview-guide.md`
- 說明：更新 flow 面向的必問題表格（新增 flow-6/7/8 的說明）。T1 完成後才能確認最終問題文字

### Phase 3：依賴 Phase 1（T2/T3 必須先完成）

**T6：O1 — pre-task-handler.js MoSCoW 警告注入**
- agent: developer
- files: `plugins/overtone/hooks/scripts/tool/pre-task.js`（透過 pre-task-handler.js）、`plugins/overtone/scripts/lib/pre-task-handler.js`
- 說明：在 `handlePreTask` 的 updatedInput 組裝段新增 MoSCoW 警告注入邏輯：
  1. 嘗試讀取當前 feature 的 Product Brief（路徑：`specs/features/in-progress/*/proposal.md` 或 `product-brief.md`）
  2. 從 Brief 提取 Should/Could 項目（keyword: `Should:` / `Could:` 區塊）
  3. 若 developer prompt 中提到 Should/Could 項目，注入警告訊息（warn not block）：「⚠️ 此功能在 PM Brief 中標記為 Should/Could，請確認是否在本次 MVP 範圍內」
  - 注意：實作為靜默降級（try/catch），找不到 Brief 或解析失敗不影響主流程

**T7：測試補充**
- agent: developer（或 tester）
- files: `tests/unit/pre-task-handler.test.js`、`tests/unit/interview.test.js`
- 說明：為 T1（新問題）和 T6（MoSCoW 警告）各新增測試案例

## 開放問題

Q1：MoSCoW 警告的 Brief 路徑規則
- Product Brief 目前格式不固定（proposal.md、product-brief.md 等），需確認讀取路徑優先順序
- 建議 architect 決定：是掃描 `specs/features/in-progress/` 下的最新目錄，還是讀取固定命名的檔案

Q2：flow 新問題的 required 設定
- flow-6/7/8 全設為 required: true 會讓 flow 面向的必問題從 3 個增到 6 個
- `minAnswersPerFacet: 2` 閾值不變，所以完成門檻不變，但訪談問題會增加
- 是否接受？或部分設為 required: false？建議 architect 決定

Q3：state-sync-patterns.md 的範圍
- 是否包含後端跨模組狀態傳播（如 event sourcing、saga pattern）？
- 建議先聚焦前端（Vue/React store、event bus），後端部分延後
