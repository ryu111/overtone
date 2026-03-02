# Proposal：自主知識引擎（Knowledge Engine）

`knowledge-engine`（kebab-case，與 specs/features/in-progress/ 目錄名一致）

## 需求背景（Why）

- **問題**：Overtone 目前有 8 個 knowledge domain Skill，但它們是靜態的 — agent 被委派時只能靠自身 prompt 和 pre-task.js 注入的 workflow context/test-index，無法感知哪些 Skill 對當前任務有用，也無從將執行過程中發現的新知識自動存回 Skill。
- **目標**：讓系統在任務執行過程中自動注入相關知識、偵測知識缺口、並將新知識歸檔到正確的 Skill，形成持續學習的閉迴路。
- **優先級**：Instinct 系統（信心分數）已就位，現在加入 Knowledge Engine 可讓 Overtone 真正實現「知識自我進化」的設計哲學。

## 使用者故事

```
身為 Main Agent
我想要每次委派 subagent 時系統自動注入該 agent 需要的 Skill 知識摘要
以便 agent 一啟動就能根據相關知識執行任務，不需要我手動指定
```

```
身為 Main Agent
我想要系統在 subagent 完成任務後自動提取有價值的知識並歸檔
以便這些知識能在未來任務中被重複利用
```

```
身為 Overtone 系統
我想要識別當前任務缺少哪些知識領域的支援
以便主動提示 Main Agent 或自動路由到正確的 Skill
```

## 範圍邊界

### 在範圍內（In Scope）

- 迭代 1：修改 pre-task.js，讀取 agent frontmatter 的 `skills` 欄位，自動注入對應 SKILL.md 摘要到 agent prompt
- 迭代 2：新增 `knowledge-gap-detector.js` — 分析任務 context 識別知識缺口，比對 8 個 knowledge domain
- 迭代 3：新增 `knowledge-searcher.js` — 四源搜尋（Codebase、Instinct、Existing Skills）；Web 搜尋排除（Hook 沒有 WebSearch tool）
- 迭代 4：新增 `skill-router.js` — 決定知識歸入哪個 Skill，或建立新 Skill
- 迭代 5：修改 SubagentStop hook — 在 stage 完成時提取知識並透過 skill-router 歸檔
- 迭代 6：Knowledge Engine E2E 測試 + guard-coverage 更新

### 不在範圍內（Out of Scope）

- Web 搜尋整合（Hook 環境沒有 WebSearch tool，需要另立 agent 才可實現）
- 跨 session 知識累積（Instinct 系統已有 per-session observations，本次不做全域 knowledge base）
- 自動修改 agent frontmatter 的 `skills` 欄位（需要 manage-component.js，風險高，留未來版本）
- Dashboard UI 顯示 knowledge graph（超出本次範圍）
- 新 Skill 的自動審核機制（本次自動建立，品質由 RETRO/REVIEW 人工確認）

## 子任務清單

### 迭代 1：Skill Context 自動注入

1. **讀取 agent frontmatter skills 欄位**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/hooks/scripts/tool/pre-task.js`、`plugins/overtone/scripts/lib/hook-utils.js`
   - 說明：在 pre-task.js 的 updatedInput 組裝段，讀取 targetAgent 對應的 agent .md frontmatter，取得 `skills` 陣列，讀取各 SKILL.md 內容（去掉 frontmatter，只保留正文），摘要注入 prompt

2. **新增 `buildSkillContext()` 函式**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/hook-utils.js`
   - 說明：實作 `buildSkillContext(agentName, pluginRoot, options)` — 讀 agent .md frontmatter 的 skills 欄位，找到 skills/ 目錄下對應的 SKILL.md，截取內容（上限 800 chars/skill，總上限 2000 chars），回傳字串或 null

3. **整合注入順序**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/hooks/scripts/tool/pre-task.js`
   - 說明：在現有 `workflowContext → testIndex → originalPrompt` 注入序列中加入 skillContext（放在 workflowContext 之後），只在有 skills 且 SKILL.md 存在時注入

4. **單元測試：buildSkillContext**
   - 負責 agent：tester
   - 相關檔案：`tests/unit/build-skill-context.test.js`（新增）
   - 說明：驗證 skills 讀取、截斷、無 skills 時回傳 null、SKILL.md 不存在時靜默降級

5. **整合測試：pre-task 注入行為**
   - 負責 agent：tester
   - 相關檔案：`tests/integration/platform-alignment-pre-task-update.test.js`（新增測試 case）
   - 說明：驗證 developer 有 skills 時 updatedInput.prompt 含 skill 摘要；architect 無對應 SKILL 時不注入

### 迭代 2：Knowledge Gap Detector

6. **新增 `knowledge-gap-detector.js`**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/knowledge-gap-detector.js`（新增）
   - 說明：分析 agent 類型 + prompt 關鍵詞 + 當前 stage → 識別可能的知識缺口 → 比對現有 8 個 knowledge domain → 回傳缺口清單（`{ domain, confidence, reason }[]`）

7. **整合到 hook-utils.js**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/hook-utils.js`、`plugins/overtone/hooks/scripts/tool/pre-task.js`
   - 說明：在 buildSkillContext 後，若偵測到知識缺口且對應 Skill 已存在，追加相關 SKILL.md 內容；若 Skill 不存在，在 prompt 中標記缺口建議（供 Main Agent 判斷是否觸發 knowledge-searcher）

8. **單元測試：knowledge-gap-detector**
   - 負責 agent：tester
   - 相關檔案：`tests/unit/knowledge-gap-detector.test.js`（新增）
   - 說明：驗證 domain 比對邏輯、confidence 計算、邊界案例（空 prompt、未知 agent）

### 迭代 3：Knowledge Searcher

9. **新增 `knowledge-searcher.js`**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/knowledge-searcher.js`（新增）
   - 說明：三源搜尋（Codebase pattern scan、Instinct observations、Existing Skill references）→ 回傳 `{ source, content, relevance }[]`。設計為純函式，每個 source 獨立，失敗靜默降級

10. **Codebase 搜尋實作**
    - 負責 agent：developer
    - 相關檔案：`plugins/overtone/scripts/lib/knowledge-searcher.js`
    - 說明：利用現有 dead-code-scanner 的 glob 模式，搜尋 scripts/lib/ 和 hooks/ 下的相關 patterns；結果截斷至 1000 chars

11. **Instinct 搜尋實作**
    - 負責 agent：developer
    - 相關檔案：`plugins/overtone/scripts/lib/knowledge-searcher.js`
    - 說明：呼叫 `instinct.query(sessionId, { minConfidence: 0.5 })`，按 tag 過濾與當前任務相關的觀察；confidence >= autoApplyThreshold 的自動包含

12. **現有 Skill references 搜尋實作**
    - 負責 agent：developer
    - 相關檔案：`plugins/overtone/scripts/lib/knowledge-searcher.js`
    - 說明：掃描 skills/{domain}/references/ 目錄，根據關鍵詞比對檔案名稱和首行，回傳相關 reference 路徑和摘要

13. **單元測試：knowledge-searcher**
    - 負責 agent：tester
    - 相關檔案：`tests/unit/knowledge-searcher.test.js`（新增）
    - 說明：驗證三個 source 各自的邏輯、降級行為、結果格式

### 迭代 4：Skill Router + Writer

14. **新增 `skill-router.js`**
    - 負責 agent：developer
    - 相關檔案：`plugins/overtone/scripts/lib/skill-router.js`（新增）
    - 說明：輸入知識片段 `{ content, keywords, source }` → 比對現有 8 個 domain → 匹配分數最高的 domain → 決定歸入哪個 Skill；無匹配（所有 domain 分數 < threshold）時建立新 SKILL.md

15. **知識追加到現有 Skill**
    - 負責 agent：developer
    - 相關檔案：`plugins/overtone/scripts/lib/skill-router.js`
    - 說明：匹配到現有 domain 時，將知識追加到 `skills/{domain}/references/auto-discovered.md`（APPEND，不覆蓋；若不存在則建立）；使用 atomicWrite

16. **建立新 Skill**
    - 負責 agent：developer
    - 相關檔案：`plugins/overtone/scripts/lib/skill-router.js`、`plugins/overtone/scripts/manage-component.js`
    - 說明：無匹配時，呼叫 manage-component.js 建立最小化 SKILL.md（name、description、disable-model-invocation: true）；knowledge 寫入 references/auto-discovered.md

17. **單元測試：skill-router**
    - 負責 agent：tester
    - 相關檔案：`tests/unit/skill-router.test.js`（新增）
    - 說明：驗證 domain 比對算法、追加邏輯、新 Skill 建立流程、atomicWrite 保護

### 迭代 5：SubagentStop 知識歸檔

18. **修改 SubagentStop hook — 知識提取**
    - 負責 agent：developer
    - 相關檔案：`plugins/overtone/hooks/scripts/agent/on-stop.js`
    - 說明：在 PASS 結果（非 fail/reject）時，從 agentOutput 提取知識片段（關鍵決策、發現的 patterns、解決的問題）→ 呼叫 skill-router 歸檔；失敗靜默降級，不影響主流程

19. **知識提取函式 `extractKnowledge()`**
    - 負責 agent：developer
    - 相關檔案：`plugins/overtone/scripts/lib/knowledge-searcher.js`（追加 export）或新建 `knowledge-extractor.js`
    - 說明：從 agent 的 last_assistant_message 提取關鍵詞（基於 Handoff 結構 — Findings 區塊、Files Modified 等）；返回 `{ keywords, summary, source }[]`

20. **整合測試：SubagentStop 知識歸檔**
    - 負責 agent：tester
    - 相關檔案：`tests/integration/agent-on-stop.test.js`（新增測試 case）
    - 說明：驗證 PASS 時觸發知識提取、fail/reject 時不觸發、靜默降級行為

### 迭代 6：E2E 整合 + Guard Test

21. **Knowledge Engine E2E 測試**
    - 負責 agent：tester
    - 相關檔案：`tests/e2e/knowledge-engine.test.js`（新增）
    - 說明：驗證完整知識流：pre-task 注入 → agent 執行 → on-stop 歸檔 → 下次任務能看到新知識

22. **Guard coverage 更新**
    - 負責 agent：developer
    - 相關檔案：`plugins/overtone/scripts/lib/dead-code-scanner.js`（更新 ENTRY_POINT_BASENAMES）、`plugins/overtone/scripts/lib/guard-system.js`
    - 說明：確保新增的三個模組（knowledge-gap-detector、knowledge-searcher、skill-router）被 dead-code-scanner 正確分類；若有 guard test 需要更新，一併處理

## 開放問題

1. **Skill 摘要截斷策略**：buildSkillContext 應截取 SKILL.md 的哪些部分？只保留「消費者」和「Reference 索引」區塊效率最高，但可能遺失重要的 usage pattern。需要 architect 決定截取策略。

2. **Knowledge Gap 偵測的 domain 比對算法**：純關鍵詞匹配 vs. 基於 agent 角色的靜態規則？考慮到 Hook 只有純 JavaScript 可用（無法呼叫 AI），建議靜態規則表 + 關鍵詞加權，需 architect 確認。

3. **skill-router domain 比對的 threshold**：新 Skill 建立門檻要多低？太低會爆炸性建立大量 Skill，太高則知識遺失。需要 architect 定義合理的 confidence threshold（建議 0.5）。

4. **knowledge-extractor 是獨立檔案還是 knowledge-searcher 的 export**：考慮到 dead-code-scanner 的 ENTRY_POINT_BASENAMES 管理成本，建議統一在 knowledge-searcher.js，但需要 architect 確認模組邊界。

5. **on-stop 知識提取的效能考量**：每個 agent 完成時都執行知識提取，可能拖慢 SubagentStop hook 的響應。需要 architect 評估是否加入 async 或大小限制保護（agentOutput 可能很長）。
