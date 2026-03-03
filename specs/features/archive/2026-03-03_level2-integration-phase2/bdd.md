# Feature: level2-integration-phase2 — Agent 個體學習升級

## 概述

三個功能子集：
1. **Agent Memory 設定**：5 個 agent（developer/tester/debugger/planner/architect）加入 `memory: local`，啟用跨 session 個人記憶
2. **Score Context 個人化**：pre-task.js 注入的品質歷史標題加入 agentName，讓 agent 明確知道這是自己的表現數據
3. **Grader 強制化**：stop-message-builder.js 依 workflowType 決定 grader 用詞（MUST / 建議）

---

# Feature 1: Agent Memory 設定（5 個 agent 加入 memory: local）

## Scenario 1-1: 成功為 developer agent 加入跨 session 記憶設定
GIVEN developer.md frontmatter 中尚未包含 `memory` 欄位
WHEN 執行 `manage-component.js update agent developer '{"memory":"local"}'`
THEN developer.md frontmatter 出現 `memory: local`
AND registry-data.json 的 `agentMemory.developer` 值為 `"local"`

## Scenario 1-2: 5 個 agent 全部設定後 registry-data.json 同步正確
GIVEN developer / tester / debugger / planner / architect 五個 agent 都已執行 memory: local 更新
WHEN 讀取 `registry-data.json`
THEN `agentMemory` 物件包含 developer、tester、debugger、planner、architect 五個 key
AND 每個 key 的值均為 `"local"`
AND 原有的 code-reviewer、security-reviewer、product-manager 等 memory 設定不受影響

## Scenario 1-3: agent .md 包含「跨 Session 記憶」說明段落
GIVEN 已完成 memory: local 設定的 developer.md
WHEN 讀取 developer.md 全文
THEN 文件 body 中包含「跨 Session 記憶」相關說明段落
AND 說明格式與 code-reviewer.md 的相應段落結構一致

## Scenario 1-4: memory 設定不影響其他 frontmatter 欄位
GIVEN developer.md 現有 frontmatter 包含 name、model、skills、tools 等欄位
WHEN 執行 memory: local 更新
THEN developer.md 的 name / model / skills / tools 等欄位維持不變
AND 僅新增 `memory: local` 欄位

## Scenario 1-5: bun scripts/validate-agents.js 對 memory: local agent 驗證通過
GIVEN 5 個 agent 均已設定 `memory: local`
WHEN 執行 `bun scripts/validate-agents.js`
THEN 沒有任何 agent 驗證錯誤
AND 輸出顯示 5 個 agent 的 memory 設定符合 registry-data.json

---

# Feature 2: Score Context 個人化（品質歷史標題加入 agentName）

## Scenario 2-1: gradedStages agent 被委派時 score context 標題包含 agentName
GIVEN 專案存在 targetStage 為 DEV 的歷史評分記錄（sessionCount > 0）
AND 被委派的 agent 為 developer（targetAgent = "developer"）
WHEN pre-task.js 組裝 score context
THEN scoreContext 標題格式為 `[品質歷史 — developer@DEV（N 筆）]`
AND 標題包含 agentName（developer）和 targetStage（DEV）
AND N 為實際的 sessionCount 數值

## Scenario 2-2: 不同 agent 在同一 stage 顯示各自名稱
GIVEN targetStage 為 REVIEW，歷史評分有 3 筆記錄
WHEN agent 為 code-reviewer 被委派
THEN scoreContext 標題為 `[品質歷史 — code-reviewer@REVIEW（3 筆）]`
WHEN agent 為 security-reviewer 被委派
THEN scoreContext 標題為 `[品質歷史 — security-reviewer@REVIEW（3 筆）]`

## Scenario 2-3: score context 資料內容（維度分數）維持不變
GIVEN targetStage 為 DEV，歷史評分有 5 筆，avgClarity=4.20
WHEN pre-task.js 組裝 score context
THEN scoreContext 包含 `clarity: 4.20/5.0`
AND 包含 `completeness`、`actionability`、`overall` 分數行
AND 資料邏輯（低分警告 / 最低維度提示）不受標題格式修改影響

## Scenario 2-4: sessionCount 為 0 時不注入 score context
GIVEN targetStage 為 DEV，但無歷史評分記錄（sessionCount = 0）
WHEN pre-task.js 執行
THEN scoreContext 為 null
AND 注入的 prompt 中不出現「品質歷史」字串

## Scenario 2-5: score context 取得失敗時靜默降級不中斷主流程
GIVEN score-engine 模組拋出例外
WHEN pre-task.js 執行
THEN scoreContext 為 null（靜默降級）
AND 主流程正常繼續（prompt 組裝不中斷）
AND 無例外向上傳播

---

# Feature 3: Grader 強制化（stop-message-builder.js 依 workflowType 切換用詞）

## Scenario 3-1: standard workflow 的 gradedStage 完成時顯示 MUST 強制用詞
GIVEN workflowType 為 "standard"
AND stageKey 在 gradedStages 中（例如 DEV）
AND verdict 為 PASS
WHEN buildStopMessages 執行
THEN messages 包含 `📋 MUST 委派 grader 評分：STAGE=DEV`
AND 訊息中不出現 `🎯 建議委派 grader 評分`

## Scenario 3-2: full workflow 的 gradedStage 完成時顯示 MUST 強制用詞
GIVEN workflowType 為 "full"
AND stageKey 在 gradedStages 中
WHEN buildStopMessages 執行
THEN messages 包含 `📋 MUST 委派 grader 評分`

## Scenario 3-3: secure workflow 的 gradedStage 完成時顯示 MUST 強制用詞
GIVEN workflowType 為 "secure"
AND stageKey 在 gradedStages 中
WHEN buildStopMessages 執行
THEN messages 包含 `📋 MUST 委派 grader 評分`

## Scenario 3-4: product workflow 的 gradedStage 完成時顯示 MUST 強制用詞
GIVEN workflowType 為 "product"
AND stageKey 在 gradedStages 中
WHEN buildStopMessages 執行
THEN messages 包含 `📋 MUST 委派 grader 評分`

## Scenario 3-5: product-full workflow 的 gradedStage 完成時顯示 MUST 強制用詞
GIVEN workflowType 為 "product-full"
AND stageKey 在 gradedStages 中
WHEN buildStopMessages 執行
THEN messages 包含 `📋 MUST 委派 grader 評分`

## Scenario 3-6: quick workflow 的 gradedStage 完成時維持建議用詞
GIVEN workflowType 為 "quick"
AND stageKey 在 gradedStages 中
AND verdict 為 PASS
WHEN buildStopMessages 執行
THEN messages 包含 `🎯 建議委派 grader 評分`
AND 訊息中不出現 `MUST 委派 grader`

## Scenario 3-7: single workflow 維持建議用詞
GIVEN workflowType 為 "single"
AND stageKey 在 gradedStages 中
WHEN buildStopMessages 執行
THEN messages 包含 `🎯 建議委派 grader 評分`

## Scenario 3-8: workflowType 為 null 時使用建議用詞（向後相容）
GIVEN workflowType 為 null（舊版 workflow 未傳入）
AND stageKey 在 gradedStages 中
WHEN buildStopMessages 執行
THEN messages 包含 `🎯 建議委派 grader 評分`
AND 不拋出例外

## Scenario 3-9: 不在 gradedStages 中的 stage 不產生 grader 訊息
GIVEN workflowType 為 "standard"
AND stageKey 為 DOCS（不在 gradedStages 中）
WHEN buildStopMessages 執行
THEN messages 中不包含任何 grader 相關字串

## Scenario 3-10: FAIL verdict 時 gradedStage 不產生 grader 訊息
GIVEN workflowType 為 "standard"
AND stageKey 在 gradedStages 中（DEV）
AND verdict 為 FAIL
WHEN buildStopMessages 執行
THEN messages 中不包含 grader 相關字串
AND 訊息包含失敗相關提示

---

# Feature 4: 整合驗證（向後相容性）

## Scenario 4-1: bun test 全套通過（無回歸）
GIVEN 所有 4 個子任務的修改均已完成
WHEN 從專案根目錄執行 `bun test`
THEN 所有測試通過
AND stop-message-builder.test.js 全數通過
AND config-api.test.js 全數通過

## Scenario 4-2: 非 gradedStages agent 的 pre-task 不受 score context 修改影響
GIVEN targetAgent 為 "doc-updater"（不在 gradedStages 中）
WHEN pre-task.js 執行
THEN scoreContext 為 null
AND prompt 中不出現「品質歷史」字串

## Scenario 4-3: manage-component.js 更新 agent memory 後 validate-agents.js 不報錯
GIVEN developer.md 已含 `memory: local`
AND registry-data.json 已含 `agentMemory.developer: "local"`
WHEN 執行 `bun scripts/validate-agents.js`
THEN 驗證結果無 developer 相關錯誤
AND 輸出摘要顯示 agent memory 欄位一致
