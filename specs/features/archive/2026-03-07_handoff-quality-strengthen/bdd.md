# Feature: Handoff Quality Strengthen — Exit Criteria Checklist

## 背景

為解決 agent 交接時常遺漏副作用同步的問題（典型案例：health-check 新增偵測項目後，hardcoded 數值未同步更新），
在 4 個核心 stage agent 的 Handoff 輸出格式中加入 stage-specific Exit Criteria checklist，
並在 handoff-protocol.md 中定義欄位規範與 Main Agent 的未勾選處理規則。

---

## Feature 1: handoff-protocol.md Exit Criteria 欄位定義

### Scenario 1-1: handoff-protocol.md 包含 Exit Criteria 欄位定義
GIVEN handoff-protocol.md 位於 plugins/overtone/skills/workflow-core/references/handoff-protocol.md
WHEN 讀取該文件內容
THEN 文件中應包含「Exit Criteria」區塊標題
AND 應說明 `- [x]` 表示 agent 已驗證，`- [ ]` 表示跳過或無法確認
AND 應說明 Exit Criteria 位於 Open Questions 之前

### Scenario 1-2: handoff-protocol.md 定義 Main Agent 對未勾選項目的處理規則
GIVEN handoff-protocol.md 已更新包含 Exit Criteria 欄位定義
WHEN 讀取 Main Agent 的處理規則段落
THEN 應明確指出「有未勾選項目時，Main Agent MUST 以 AskUserQuestion 詢問使用者是否繼續或退回重做」
AND 規則強度應使用 MUST（非 should）

### Scenario 1-3: handoff-protocol.md 欄位排序正確
GIVEN handoff-protocol.md 已定義 Exit Criteria 欄位
WHEN 讀取各欄位的排列順序
THEN Exit Criteria 應排在 Open Questions 之前
AND Open Questions 應為最後一個欄位

---

## Feature 2: developer.md DEV Exit Criteria

### Scenario 2-1: developer.md 包含 Exit Criteria 區塊
GIVEN developer.md 位於 plugins/overtone/agents/developer.md
WHEN 讀取輸出格式（Handoff 格式）中的區塊清單
THEN 應包含「Exit Criteria」區塊
AND Exit Criteria 區塊應位於 Test Scope 之後、Open Questions 之前

### Scenario 2-2: DEV Exit Criteria 包含 5 項 checklist
GIVEN developer.md 的 Exit Criteria 區塊已存在
WHEN 計算其中 `- [ ]` checklist 項目數量
THEN 應恰好有 5 個 checklist 項目

### Scenario 2-3: DEV Exit Criteria 涵蓋 impact.js 執行確認
GIVEN developer.md 的 Exit Criteria 區塊
WHEN 讀取各 checklist 項目內容
THEN 應有一項提及「bun scripts/impact.js」執行確認受影響元件

### Scenario 2-4: DEV Exit Criteria 涵蓋 hardcoded 數值同步確認
GIVEN developer.md 的 Exit Criteria 區塊
WHEN 讀取各 checklist 項目內容
THEN 應有一項提及「hardcoded 計數/數值」或「測試斷言中的數字」的同步更新確認

### Scenario 2-5: DEV Exit Criteria 涵蓋測試通過確認
GIVEN developer.md 的 Exit Criteria 區塊
WHEN 讀取各 checklist 項目內容
THEN 應有一項提及「bun test」全套通過的確認

### Scenario 2-6: DEV Exit Criteria 使用確定性動詞開頭
GIVEN developer.md 的 Exit Criteria 區塊中的 checklist 項目
WHEN 檢查每個項目的措詞
THEN 每個項目應以「已確認」或「已完成」等確定性動詞開頭
AND 不應使用「是否」等語意模糊的疑問形式

### Scenario 2-7: DEV Exit Criteria 使用正確 checkbox 格式
GIVEN developer.md 的 Exit Criteria 區塊
WHEN 讀取 checklist 項目的 Markdown 格式
THEN 每個項目應使用 `- [ ]` 格式（未勾選狀態，agent 執行時填寫）

---

## Feature 3: code-reviewer.md Review Checklist

### Scenario 3-1: code-reviewer.md APPROVE 格式包含 Review Checklist
GIVEN code-reviewer.md 位於 plugins/overtone/agents/code-reviewer.md
WHEN 讀取 APPROVE 輸出格式（Handoff 格式）
THEN 應包含「Review Checklist」區塊
AND Review Checklist 區塊應位於 Open Questions 之前

### Scenario 3-2: code-reviewer.md REJECT/REQUEST CHANGES 格式也包含 Review Checklist
GIVEN code-reviewer.md 的輸出格式定義
WHEN 讀取 REJECT 或 REQUEST CHANGES 輸出格式
THEN 同樣應包含「Review Checklist」區塊
AND Review Checklist 區塊應位於 Open Questions 之前

### Scenario 3-3: Review Checklist 包含 5 項 checklist
GIVEN code-reviewer.md 的 Review Checklist 區塊已存在
WHEN 計算其中 `- [ ]` checklist 項目數量
THEN 應恰好有 5 個 checklist 項目

### Scenario 3-4: Review Checklist 涵蓋 git diff 閱讀確認
GIVEN code-reviewer.md 的 Review Checklist 區塊
WHEN 讀取各 checklist 項目內容
THEN 應有一項提及「git diff」或「所有變更檔案已閱讀」的確認

### Scenario 3-5: Review Checklist 涵蓋 impact.js 執行確認
GIVEN code-reviewer.md 的 Review Checklist 區塊
WHEN 讀取各 checklist 項目內容
THEN 應有一項提及「bun scripts/impact.js」執行確認依賴元件未受破壞

### Scenario 3-6: Review Checklist 涵蓋 hardcoded 數值同步確認
GIVEN code-reviewer.md 的 Review Checklist 區塊
WHEN 讀取各 checklist 項目內容
THEN 應有一項提及「hardcoded 計數/數值」引用的同步確認

### Scenario 3-7: Review Checklist 涵蓋 BDD spec 逐條驗證
GIVEN code-reviewer.md 的 Review Checklist 區塊
WHEN 讀取各 checklist 項目內容
THEN 應有一項提及「對照 BDD spec」逐條驗證行為的確認

### Scenario 3-8: Review Checklist 涵蓋明確判定輸出
GIVEN code-reviewer.md 的 Review Checklist 區塊
WHEN 讀取各 checklist 項目內容
THEN 應有一項提及做出「APPROVE / REQUEST CHANGES / REJECT」明確判定

### Scenario 3-9: code-reviewer.md DO 區塊強化 hardcoded 數值審查指引
GIVEN code-reviewer.md 的 DO 區塊（📋 MUST 規則清單）
WHEN 讀取相關指引內容
THEN 應包含針對 hardcoded 數值審查的具體指引（非僅泛稱「注意副作用」）

---

## Feature 4: architect.md ARCH Exit Criteria

### Scenario 4-1: architect.md 包含 Exit Criteria 區塊
GIVEN architect.md 位於 plugins/overtone/agents/architect.md
WHEN 讀取輸出格式（Handoff 格式）中的區塊清單
THEN 應包含「Exit Criteria」區塊
AND Exit Criteria 區塊應位於 Open Questions 之前

### Scenario 4-2: ARCH Exit Criteria 包含 3 項 checklist
GIVEN architect.md 的 Exit Criteria 區塊已存在
WHEN 計算其中 `- [ ]` checklist 項目數量
THEN 應恰好有 3 個 checklist 項目

### Scenario 4-3: ARCH Exit Criteria 涵蓋 codebase pattern 一致性確認
GIVEN architect.md 的 Exit Criteria 區塊
WHEN 讀取各 checklist 項目內容
THEN 應有一項提及「搜尋現有 codebase」確認設計符合現有 patterns（未引入新慣例）

### Scenario 4-4: ARCH Exit Criteria 涵蓋受影響元件標注確認
GIVEN architect.md 的 Exit Criteria 區塊
WHEN 讀取各 checklist 項目內容
THEN 應有一項提及「受影響的現有元件」已標注在 Edge Cases to Handle 區塊

### Scenario 4-5: ARCH Exit Criteria 涵蓋最簡方案確認
GIVEN architect.md 的 Exit Criteria 區塊
WHEN 讀取各 checklist 項目內容
THEN 應有一項提及設計選用「最簡單能滿足需求的方案」（無過度設計）的確認

---

## Feature 5: planner.md PLAN Exit Criteria

### Scenario 5-1: planner.md 包含 Exit Criteria 區塊
GIVEN planner.md 位於 plugins/overtone/agents/planner.md
WHEN 讀取輸出格式（Handoff 格式）中的區塊清單
THEN 應包含「Exit Criteria」區塊
AND Exit Criteria 區塊應位於 Open Questions 之前

### Scenario 5-2: PLAN Exit Criteria 包含 3 項 checklist
GIVEN planner.md 的 Exit Criteria 區塊已存在
WHEN 計算其中 `- [ ]` checklist 項目數量
THEN 應恰好有 3 個 checklist 項目

### Scenario 5-3: PLAN Exit Criteria 涵蓋 INVEST 原則確認
GIVEN planner.md 的 Exit Criteria 區塊
WHEN 讀取各 checklist 項目內容
THEN 應有一項提及「INVEST 原則」（可獨立、可估計、可測試）的確認

### Scenario 5-4: PLAN Exit Criteria 涵蓋依賴關係和並行可行性確認
GIVEN planner.md 的 Exit Criteria 區塊
WHEN 讀取各 checklist 項目內容
THEN 應有一項提及「依賴關係」分析和「並行可行性」標明的確認

### Scenario 5-5: PLAN Exit Criteria 涵蓋範圍邊界確認
GIVEN planner.md 的 Exit Criteria 區塊
WHEN 讀取各 checklist 項目內容
THEN 應有一項提及「範圍邊界明確」（In Scope / Out of Scope 已定義）的確認

---

## Feature 6: 通用格式一致性

### Scenario 6-1: 所有 agent 的 checklist 使用未勾選 checkbox 格式
GIVEN developer.md、code-reviewer.md、architect.md、planner.md 中的 Exit Criteria / Review Checklist 區塊
WHEN 讀取各 checklist 項目的 Markdown 格式
THEN 每個項目應使用 `- [ ]` 格式（未勾選）
AND 不應使用 `- [x]`（預先勾選）或其他格式

### Scenario 6-2: 所有 Exit Criteria 位置在 Open Questions 之前
GIVEN 4 個 agent 的輸出格式定義
WHEN 讀取各欄位的排列順序
THEN Exit Criteria 或 Review Checklist 區塊應緊鄰 Open Questions 之前
AND 不應出現在 Context、Findings、Files Modified 之前

### Scenario 6-3: 所有 Exit Criteria 項目使用確定性動詞開頭
GIVEN 4 個 agent 的 Exit Criteria / Review Checklist 區塊中的 checklist 項目
WHEN 檢查每個項目的第一個動詞
THEN 每個項目應以「已確認」、「已完成」、「已執行」等確定性動詞開頭
AND 不應以「是否」、「確認是否」等疑問形式開頭
