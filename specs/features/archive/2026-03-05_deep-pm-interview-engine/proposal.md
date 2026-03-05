# Deep PM Interview Engine — 深度 PM 訪談引擎

`deep-pm-interview-engine`

## 需求背景（Why）

- **問題**：PM agent 目前是 advisory 模式（一次性分析），在 Overtone 無人值守的長期迭代場景下，如果開頭沒有深度訪談，需求模糊就會導致後續整個 standard 或 full pipeline 做偏。目前的五層追問法是 PM 內部的行為準則，但沒有結構化的狀態機來確保每個面向都被涵蓋。
- **目標**：L3.4「深度 PM」— 將 PM 從「一次性分析」升級為「多輪結構化訪談」，確保訪談結果能組裝為包含 ≥10 個 BDD 場景的 Project Spec，供後續 pipeline 消費。
- **定位**：L3.4 是 L3.5 Project Orchestrator 的前置能力。Project Orchestrator 需要依賴結構完整的 Project Spec 來做能力盤點和排程。

## 使用者故事

```
身為 Overtone 系統（無人值守模式）
我想要 PM agent 在新領域任務開始前完成結構化五面向訪談
以便後續 pipeline 有足夠精確的需求，不需中途打斷使用者確認
```

```
身為使用者（委派複雜任務時）
我想要 PM agent 能先自主研究領域基本概念再提問
以便 PM 問出的問題有深度，而不是只問表面功能
```

```
身為 architect agent（接手 PM 產出時）
我想要收到結構化 Project Spec（含 ≥10 個 BDD 驗收場景）
以便有明確的驗收標準指引技術設計
```

## 範圍邊界

### 在範圍內（In Scope）

- `plugins/overtone/scripts/lib/interview.js`：訪談引擎（狀態機 + 問題生成 + 完成度判斷 + Spec 組裝）
- `plugins/overtone/skills/pm/references/project-spec-template.md`：Project Spec 模板（含 BDD 場景骨架）
- `plugins/overtone/agents/product-manager.md`：PM agent prompt 升級（加入訪談模式指引）
- `plugins/overtone/skills/pm/SKILL.md`：加入訪談模式說明和 interview.js API 參考
- 單元測試：interview.js 核心 API（init/nextQuestion/recordAnswer/isComplete/generateSpec）
- 整合測試：訪談完整流程 + Spec 輸出格式

### 不在範圍內（Out of Scope）

- 自動觸發訪談（L3.5 Project Orchestrator 的職責 — 需要先完成本功能才能整合）
- 多語言訪談支援
- Dashboard 訪談進度可視化
- 訪談回答的持久化跨 session 儲存（本次在 PM agent context window 內管理即可）
- 領域研究自動觸發（interview.js 提供 API，PM agent 決定何時調用，不做強制）

## 子任務清單

1. **interview.js 引擎核心**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/interview.js`
   - 說明：建立訪談狀態機。核心 API：`init(topic)` 初始化五面向訪談狀態；`nextQuestion(state)` 根據當前進度和已回答問題生成下一個結構化問題；`recordAnswer(state, questionId, answer)` 記錄回答並更新進度；`isComplete(state)` 判斷是否已涵蓋所有五面向且每個面向至少 2 個答案；`generateSpec(state)` 組裝 Project Spec 字串。五面向：功能（Functionality）、操作流程（User Flow）、UI 設計（UI/UX）、邊界條件（Edge Cases）、驗收標準（Acceptance Criteria）。模組匯出純函式（無副作用），不依賴 fs，方便測試。

2. **Project Spec 模板**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/skills/pm/references/project-spec-template.md`
   - 說明：定義 Project Spec 的標準格式，供 `generateSpec()` 組裝時使用作為骨架。格式需包含：專案概述、目標用戶、成功指標（可衡量）、五面向摘要、BDD 驗收場景（≥10 個，每個面向至少 2 個）、技術約束備忘（由 PM 從訪談中收集，供 architect 參考）、MVP 範圍（MoSCoW）。Spec 格式需與現有 Product Brief handoff 格式相容，讓 planner 能直接消費。

3. **PM agent prompt 升級**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/agents/product-manager.md`
   - 說明：在現有 PM agent 的基礎上加入「多輪訪談模式」章節。需說明：(a) 何時切換到訪談模式（複雜功能 / 新領域 / 無人值守任務）；(b) 如何呼叫 interview.js API（透過在 Bash 執行 node 腳本）；(c) 領域研究整合：進入新領域時先用 WebFetch 搜集基本概念，再用 `init()` 開始訪談；(d) 訪談完成後呼叫 `generateSpec()` 產出 Project Spec 並寫入 specs 目錄。注意：需遵守元件閉環規則，product-manager.md 受 pre-edit-guard 保護，必須透過 manage-component.js 更新。

4. **PM skill 更新**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/skills/pm/SKILL.md`
   - 說明：在 SKILL.md 的「參考文件」區段新增 `project-spec-template.md` 的索引，以及簡短說明訪談模式的觸發時機和 interview.js 的 API 摘要（非完整 code，只是 API 簽名和說明），讓 PM agent 知道有此資源可用。同樣需透過 manage-component.js 更新。

5. **interview.js 單元測試**
   - 負責 agent：developer（可與任務 1 並行後執行）
   - 相關檔案：`tests/unit/interview.test.js`
   - 說明：測試 interview.js 的五個核心函式。測試重點：(a) `init()` 回傳正確初始狀態結構；(b) `nextQuestion()` 在五面向輪詢，不重複已回答問題；(c) `recordAnswer()` 正確更新進度計數；(d) `isComplete()` 在未達門檻時回傳 false，在所有面向都有足夠答案時回傳 true；(e) `generateSpec()` 產出包含 ≥10 個 BDD 場景的 Project Spec。每個函式至少 3 個 case（正常路徑、邊界條件、異常輸入）。

6. **整合測試：完整訪談流程**
   - 負責 agent：developer（可與任務 1-4 並行後執行）
   - 相關檔案：`tests/integration/interview.test.js`
   - 說明：端到端驗證訪談流程：模擬一個完整的「10 輪問答」序列，驗證 (a) 問題不重複、(b) 五面向全覆蓋、(c) 最終 `generateSpec()` 產出符合 project-spec-template.md 格式、(d) 輸出 BDD 場景數量 ≥10。

## 依賴與優先順序

```
任務 1（interview.js 核心）
    ↓（依賴）
任務 5（單元測試）

任務 2（Spec 模板）  ← 與任務 1 並行
    ↓（依賴）
任務 1（generateSpec 需要模板格式定義）

任務 3（PM agent 升級）  ← 依賴任務 1, 2 完成
任務 4（PM skill 更新）  ← 依賴任務 2 完成

任務 6（整合測試）  ← 依賴所有前置任務
```

**並行策略**：
- 第一批並行：任務 1 + 任務 2
- 第二批並行（第一批完成後）：任務 3 + 任務 4 + 任務 5
- 最後：任務 6

## 開放問題

- **interview.js 的執行方式**：PM agent 呼叫 interview.js 的方式是透過 Bash 執行 `node -e`（inline），還是提供 CLI 入口（`interview.js --init topic`）？後者更易測試和除錯，但需要 architect 決定介面設計。
- **問題生成的 AI 依賴**：`nextQuestion()` 的問題是靜態問題庫（確定性），還是 LLM 生成（語意感知）？靜態問題庫更穩定可測試；LLM 生成問題品質更高但增加複雜度。建議 architect 決定。
- **訪談完成度門檻**：「每個面向至少 2 個答案」是否足夠？或需要更高門檻（如每面向 3 個）？這影響 `isComplete()` 的邏輯和最終 Spec 品質。
- **Project Spec 寫入路徑**：`generateSpec()` 應寫入 `specs/features/in-progress/{featureName}/project-spec.md`，還是作為 PM Handoff 的附件？需與 specs.js 現有流程對齊，architect 決定整合方式。
- **元件閉環驗證**：product-manager.md 新增訪談模式後，是否需要更新 `pre-task-handler.js` 的 skill context 注入邏輯，確保 PM 在 PLAN 階段前有訪談知識注入？
