# PM-Architect 深度改進 — BDD 行為規格

---

## Feature: T1 — interview.js flow 面向新增 flow-6/7/8

### Scenario: flow-6 問題存在於 QUESTION_BANK 且設為必問
  Given QUESTION_BANK 已載入
  When 篩選 facet 為 'flow' 且 id 為 'flow-6' 的問題
  Then 該問題存在
  And required 為 true
  And dependsOn 為 null
  And text 包含「入口點」或「上下文」等關鍵字

### Scenario: flow-7 問題存在於 QUESTION_BANK 且設為必問
  Given QUESTION_BANK 已載入
  When 篩選 facet 為 'flow' 且 id 為 'flow-7' 的問題
  Then 該問題存在
  And required 為 true
  And dependsOn 為 null
  And text 包含「post-action」或「完成後」等關鍵字

### Scenario: flow-8 問題存在於 QUESTION_BANK 且設為必問
  Given QUESTION_BANK 已載入
  When 篩選 facet 為 'flow' 且 id 為 'flow-8' 的問題
  Then 該問題存在
  And required 為 true
  And dependsOn 為 null
  And text 包含「其他頁面」或「元件」等關鍵字

### Scenario: flow 面向必問題總數達到 6 個
  Given QUESTION_BANK 已載入
  When 計算 facet 為 'flow' 且 required 為 true 的問題數量
  Then 數量 >= 6

### Scenario: flow-6/7/8 的 id 格式符合規範且唯一
  Given QUESTION_BANK 已載入
  When 取出所有問題的 id
  Then 'flow-6'、'flow-7'、'flow-8' 各自符合 /^[a-z-]+-\d+$/ 格式
  And 整個 QUESTION_BANK 的 id 集合無重複

### Scenario: 新增 flow-6/7/8 後不破壞現有 isComplete 邏輯
  Given 一個回答了 func-1/2、flow-1/2、edge-1/2、acc-1/2 的 session（minAnswersPerFacet=2）
  When 呼叫 isComplete(session)
  Then 回傳 true（flow-6/7/8 未回答不影響完成判斷，因門檻仍為每面向 2 題）

### Scenario: flow-6/7/8 在 nextQuestion 輪詢中可被正常取得
  Given 一個已回答所有原有必問題（含 flow-1 到 flow-5）但未回答 flow-6 的 session
  When 呼叫 nextQuestion(session)
  Then 回傳的問題 id 為 'flow-6'（或其他未回答的 flow 必問題）
  And 回傳問題的 required 為 true

---

## Feature: T2 — architect.md 跨元件狀態同步 checklist

### Scenario: architect.md DO 清單包含跨元件狀態同步要求
  Given 讀取 plugins/overtone/agents/architect.md 的正文內容
  When 搜尋 DO 清單區塊（## DO 或 📋 MUST）
  Then 找到包含「狀態同步策略」的條目
  And 條目包含「store / event bus / polling / SSE」的枚舉
  And 條目包含「design.md」的說明要求

### Scenario: architect.md 誤判防護包含後端場景提醒
  Given 讀取 plugins/overtone/agents/architect.md 的正文內容
  When 搜尋誤判防護區塊（## 誤判防護）
  Then 找到包含「純後端功能不需要狀態同步」是誤判的條目
  And 條目提及「後端跨模組狀態傳播」或「快取失效」

### Scenario: architect.md 修改後 validate-agents.js 仍通過
  Given architect.md 已透過 manage-component.js 更新
  When 執行 bun scripts/validate-agents.js
  Then 輸出不包含任何 error
  And architect agent 驗證通過

---

## Feature: T3 — product-manager.md UX flow 研究指引強化

### Scenario: product-manager.md 步驟 2 研究項目包含 UX flow 要求
  Given 讀取 plugins/overtone/agents/product-manager.md 的正文內容
  When 搜尋 Advisory 模式步驟 2（研究步驟）
  Then 找到包含「UX flow」的文字
  And 包含「post-action」或「主要操作路徑」的描述
  And 不可只列功能清單的警告存在

### Scenario: product-manager.md DO 清單包含 UX flow 研究條目
  Given 讀取 plugins/overtone/agents/product-manager.md 的正文內容
  When 搜尋 DO 清單區塊
  Then 找到包含「UX flow 研究」的條目
  And 條目說明「使用者如何完成主要操作」和「post-action」兩個面向

### Scenario: product-manager.md 修改後 validate-agents.js 仍通過
  Given product-manager.md 已透過 manage-component.js 更新
  When 執行 bun scripts/validate-agents.js
  Then 輸出不包含任何 error
  And product-manager agent 驗證通過

---

## Feature: T4 — architecture skill 新建 state-sync-patterns.md

### Scenario: state-sync-patterns.md 檔案存在且非空
  Given 執行 T4 的建立步驟後
  When 讀取 plugins/overtone/skills/architecture/references/state-sync-patterns.md
  Then 檔案存在
  And 內容長度 > 0

### Scenario: state-sync-patterns.md 包含四種模式的標題
  Given 讀取 state-sync-patterns.md 內容
  When 搜尋模式標題關鍵字
  Then 找到「本地狀態」或「Component State」或「Props」的標題
  And 找到「全域 Store」的標題
  And 找到「Event Bus」的標題
  And 找到「Server State」或「SSE」或「WebSocket」的標題

### Scenario: state-sync-patterns.md 包含決策樹區塊
  Given 讀取 state-sync-patterns.md 內容
  When 搜尋決策樹區塊
  Then 找到「決策樹」標題或對應結構
  And 內容引導讀者根據情境選擇同步模式

### Scenario: state-sync-patterns.md 包含後端跨模組狀態傳播章節
  Given 讀取 state-sync-patterns.md 內容
  When 搜尋後端相關章節
  Then 找到「後端跨模組」或「快取失效」或「Event 發布」的描述

### Scenario: architecture SKILL.md 資源索引包含 state-sync-patterns.md 的參照
  Given 讀取 plugins/overtone/skills/architecture/SKILL.md 內容
  When 搜尋資源索引表格
  Then 找到指向 state-sync-patterns.md 的路徑
  And 說明文字包含「狀態同步」或「四種模式」

---

## Feature: T5 — interview-guide.md flow 面向同步更新

### Scenario: interview-guide.md flow 面向表格包含 flow-6 條目
  Given 讀取 plugins/overtone/skills/pm/references/interview-guide.md
  When 搜尋 flow 面向問題表格
  Then 找到 flow-6 列
  And flow-6 的「必問」欄位標記為「是」
  And 說明文字包含「入口點」或「上下文」

### Scenario: interview-guide.md flow 面向表格包含 flow-7 條目
  Given 讀取 plugins/overtone/skills/pm/references/interview-guide.md
  When 搜尋 flow 面向問題表格
  Then 找到 flow-7 列
  And flow-7 的「必問」欄位標記為「是」
  And 說明文字包含「post-action」

### Scenario: interview-guide.md flow 面向表格包含 flow-8 條目
  Given 讀取 plugins/overtone/skills/pm/references/interview-guide.md
  When 搜尋 flow 面向問題表格
  Then 找到 flow-8 列
  And flow-8 的「必問」欄位標記為「是」
  And 說明文字包含「狀態傳播」或「其他頁面」

### Scenario: interview-guide.md 與 interview.js QUESTION_BANK 的 flow 面向同步
  Given QUESTION_BANK 中 flow 面向的必問題 id 為 flow-1 到 flow-8（排除 flow-4 補充題）
  When 對照 interview-guide.md 的 flow 表格
  Then 表格中每個標記為「是」的 flow 問題都能在 QUESTION_BANK 找到對應的 required: true 問題

---

## Feature: T6 — pre-task-handler.js MoSCoW 警告注入

### Scenario: developer agent + prompt 含 Should 項目 keyword 時注入 MoSCoW 警告
  Given projectRoot 下有 specs/features/in-progress/test-feature/proposal.md
  And proposal.md 包含「**Should**: - 報表匯出功能」
  And targetAgent 為 'developer'
  And originalPrompt 包含「匯出」
  When 呼叫 buildMoscowWarning(projectRoot, 'developer', originalPrompt)
  Then 回傳的字串包含「[PM MoSCoW 警告]」
  And 包含「Should」
  And 包含「報表匯出功能」或命中的項目

### Scenario: architect agent + prompt 含 Could 項目 keyword 時注入 MoSCoW 警告
  Given projectRoot 下有 specs/features/in-progress/test-feature/proposal.md
  And proposal.md 包含「**Could**: - 深色模式支援」
  And targetAgent 為 'architect'
  And originalPrompt 包含「深色模式」
  When 呼叫 buildMoscowWarning(projectRoot, 'architect', originalPrompt)
  Then 回傳的字串包含「[PM MoSCoW 警告]」
  And 包含「Could」或「Should/Could」
  And 包含「深色模式支援」或命中的項目

### Scenario: prompt 中無 Should/Could 項目 keyword 時回傳 null
  Given projectRoot 下有 specs/features/in-progress/test-feature/proposal.md
  And proposal.md 包含「**Should**: - 報表匯出功能」
  And originalPrompt 完全不包含 Should/Could 項目的任何 token
  When 呼叫 buildMoscowWarning(projectRoot, 'developer', originalPrompt)
  Then 回傳 null

### Scenario: targetAgent 非 developer 或 architect 時回傳 null（不警告）
  Given targetAgent 為 'tester'
  And 不論 proposal.md 內容為何
  When 呼叫 buildMoscowWarning(projectRoot, 'tester', 'any prompt')
  Then 回傳 null（靜默跳過，不掃描 proposal.md）

### Scenario: specs/features/in-progress/ 下找不到 proposal.md 時靜默降級
  Given projectRoot 下 specs/features/in-progress/ 目錄不存在任何 proposal.md
  And targetAgent 為 'developer'
  When 呼叫 buildMoscowWarning(projectRoot, 'developer', 'some prompt')
  Then 回傳 null（靜默降級，不拋出例外）

### Scenario: proposal.md 內容為空時靜默降級
  Given projectRoot 下有 specs/features/in-progress/test-feature/proposal.md
  And proposal.md 內容為空字串
  And targetAgent 為 'developer'
  When 呼叫 buildMoscowWarning(projectRoot, 'developer', 'some prompt')
  Then 回傳 null（無 Should/Could 項目可比對）

### Scenario: 多個 in-progress feature 存在時取最新修改的 proposal.md
  Given projectRoot 下有兩個 proposal.md：feature-a（舊）和 feature-b（新）
  And feature-b/proposal.md 含「**Should**: - 新功能項目」
  And feature-a/proposal.md 含「**Should**: - 舊功能項目」
  And originalPrompt 含「新功能」
  When 呼叫 buildMoscowWarning(projectRoot, 'developer', originalPrompt)
  Then 回傳包含「新功能項目」的警告（來自最新修改的 feature-b）
  And 不包含「舊功能項目」

### Scenario: MoSCoW 警告注入在 updatedInput 中位於 failureWarning 之後
  Given handlePreTask 收到 developer agent 的 task input
  And prompt 觸發 MoSCoW 警告（比對 Should/Could 項目 keyword）
  When handlePreTask 組裝 updatedInput
  Then updatedInput.prompt 中 MoSCoW 警告出現在 failureWarning 段之後
  And MoSCoW 警告出現在 testIndex 段之前（若有）
  And MoSCoW 警告出現在原始 prompt 之前

### Scenario: buildMoscowWarning 內部拋出例外時整體仍靜默降級不中斷流程
  Given proposal.md 是損壞的非 UTF-8 檔案（或 fs 讀取失敗）
  And targetAgent 為 'developer'
  When handlePreTask 執行 MoSCoW 警告注入（try/catch 包裹）
  Then moscowWarning 為 null（不拋出，不中斷 handlePreTask）
  And handlePreTask 正常回傳 updatedInput
