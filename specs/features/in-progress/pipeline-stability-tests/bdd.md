# Feature: Pipeline Stability Tests — 自動化行為規格

本規格覆蓋 pipeline 機械層的穩定性測試，包含：
- identifyAgent 模組提取與 `.test.js` 誤匹配修復
- single / standard / quick workflow 完整狀態機驗證
- TEST FAIL → retry 路徑
- 並行 stage 的 PreToolUse 放行/阻擋邏輯

---

## Feature 1: identifyAgent — `.test.js` 誤匹配防護

### Scenario: prompt 含測試檔案路徑時不誤判為 tester（alias 不匹配 prompt）

```
GIVEN identifyAgent 模組已提取至 scripts/lib/identify-agent.js
AND alias 匹配邏輯只搜尋 desc 欄位（不搜尋 prmt）
WHEN desc 為空字串，prmt 為 'run tests/unit/foo.test.js'
THEN identifyAgent 回傳 null
```

### Scenario: prompt 含 bun test 指令時不誤判為 tester

```
GIVEN alias 匹配只搜尋 desc 欄位
WHEN desc 為空字串，prmt 為 'bun test src/'
THEN identifyAgent 回傳 null
```

### Scenario: desc 含 tester 且 prompt 含測試路徑時仍正確匹配 tester

```
GIVEN alias 匹配搜尋 desc 欄位
WHEN desc 為 'delegate tester'，prmt 為 'run tests/foo.test.js'
THEN identifyAgent 回傳 'tester'
```

### Scenario: desc 含 testing 別名時匹配 tester

```
GIVEN alias 匹配搜尋 desc 欄位
WHEN desc 為 'run testing'，prmt 為空字串
THEN identifyAgent 回傳 'tester'
```

### Scenario: prompt 含完整 agent 名稱（精確匹配）時仍正確匹配

```
GIVEN 精確名稱匹配搜尋 combined（desc + prmt）
WHEN desc 為空字串，prmt 為 'delegate code-reviewer'
THEN identifyAgent 回傳 'code-reviewer'
```

---

## Feature 2: single workflow — 完整狀態機 E2E

### Scenario: 初始化 single workflow 建立正確的 state 結構

```
GIVEN 執行 on-start.js 建立 session 目錄
WHEN 執行 init-workflow.js single {sessionId}
THEN workflow.json 存在
AND workflowType 為 'single'
AND stages 包含 DEV，狀態為 pending
AND activeAgents 為空物件
```

### Scenario: pre-task hook 將 DEV stage 設為 active 並記錄 timeline

```
GIVEN workflow.json 存在，DEV 為 pending
WHEN 執行 pre-task.js，toolInput 描述為委派 developer agent
THEN hook 回傳 result 為空字串（放行）
AND workflow.json 中 DEV.status 變為 active
AND activeAgents 包含 developer
AND timeline.jsonl 包含 agent:delegate 事件，stage 為 DEV
```

### Scenario: on-stop hook 將 DEV stage 標記完成並發出 timeline 事件

```
GIVEN DEV stage 為 active，activeAgents 有 developer
WHEN 執行 on-stop.js，agent_type 為 'ot:developer'，last_assistant_message 含 PASS 語意
THEN hook 回傳 result 含 ✅
AND workflow.json 中 DEV.status 變為 completed
AND timeline.jsonl 包含 agent:complete 事件，agent 為 developer，stage 為 DEV
AND timeline.jsonl 包含 stage:complete 事件，stage 為 DEV
```

### Scenario: 所有 stage 完成後 session on-stop 輸出完成摘要

```
GIVEN DEV.status 為 completed（single workflow 唯一 stage）
WHEN 執行 session/on-stop.js，last_assistant_message 為任意字串
THEN hook 回傳 result 含 '工作流完成'
AND result 含 'single'
AND hook exit code 為 0
```

---

## Feature 3: standard workflow — 8 stage 全路徑 E2E

### Scenario: 初始化 standard workflow 建立 8 個 stage

```
GIVEN session 目錄已建立
WHEN 執行 init-workflow.js standard {sessionId}
THEN workflow.json 存在
AND stages 包含 PLAN、ARCH、TEST、DEV、REVIEW、TEST:2、RETRO、DOCS（共 8 個）
AND TEST stage 的 mode 為 spec
AND TEST:2 stage 的 mode 為 verify
AND 所有 stage 初始狀態為 pending
```

### Scenario: 前半 sequential path — PLAN → ARCH → TEST → DEV 依序推進

```
GIVEN standard workflow 已初始化
WHEN 依序執行（每個 stage 先 pre-task 再 on-stop PASS）：
  - planner（PLAN stage）
  - architect（ARCH stage）
  - tester（TEST stage，spec mode）
  - developer（DEV stage）
THEN 每個 pre-task 執行前，前置 stage 均已 completed
AND 每個 on-stop PASS 後，對應 stage 變為 completed
AND 每個 on-stop 後 currentStage 推進至下一個 stage
```

### Scenario: DEV 完成後 REVIEW 和 TEST:2 同時進入 active（並行組）

```
GIVEN DEV.status 為 completed
WHEN 依序執行 pre-task(code-reviewer) 和 pre-task(tester)
THEN 兩次 pre-task 均回傳 result 為空字串（放行）
AND REVIEW.status 為 active
AND TEST:2.status 為 active
AND activeAgents 同時包含 code-reviewer 和 tester
```

### Scenario: 並行組中第一個完成時不觸發全部完成

```
GIVEN REVIEW 和 TEST:2 均為 active
WHEN 執行 on-stop(code-reviewer PASS)
THEN REVIEW.status 變為 completed
AND result 含 ✅
AND result 不含 '所有階段已完成'
AND result 不含 🎉
```

### Scenario: 並行組最後一個完成時收斂並推進至 RETRO

```
GIVEN REVIEW 已 completed，TEST:2 為 active
WHEN 執行 on-stop(tester PASS)
THEN TEST:2.status 變為 completed
AND result 含 ✅
AND REVIEW 和 TEST:2 均為 completed（並行收斂）
AND 下一個 currentStage 為 RETRO
```

### Scenario: RETRO 和 DOCS 完成後所有 stage 均為 completed

```
GIVEN PLAN、ARCH、TEST、DEV、REVIEW、TEST:2 均已 completed
WHEN 依序執行 on-stop(retrospective PASS) 和 on-stop(doc-updater PASS)
THEN RETRO.status 為 completed
AND DOCS.status 為 completed
AND 所有 8 個 stage 均為 completed
```

---

## Feature 4: quick workflow — hook 驅動 state 轉移 E2E

### Scenario: 初始化 quick workflow 建立 4 個 stage

```
GIVEN session 目錄已建立
WHEN 執行 init-workflow.js quick {sessionId}
THEN stages 包含 DEV、REVIEW、TEST、RETRO（共 4 個）
AND 所有 stage 初始狀態為 pending
```

### Scenario: DEV 完成後 REVIEW 和 TEST 同時放行（並行組）

```
GIVEN DEV.status 為 completed
WHEN 執行 pre-task(code-reviewer) 和 pre-task(tester)
THEN 兩次均回傳 result 為空字串（放行）
AND REVIEW.status 為 active
AND TEST.status 為 active
```

### Scenario: 並行組依序完成後偵測到收斂

```
GIVEN REVIEW 和 TEST 均為 active
WHEN 先執行 on-stop(code-reviewer PASS)，再執行 on-stop(tester PASS)
THEN 第一次 on-stop：REVIEW completed，result 不含 '所有階段已完成'
AND 第二次 on-stop：TEST completed，REVIEW 和 TEST 均 completed
AND 第二次 on-stop 後所有並行 stage 均已收斂
```

### Scenario: RETRO PASS 後所有 stage 完成

```
GIVEN DEV、REVIEW、TEST 均為 completed，RETRO 為 active
WHEN 執行 on-stop(retrospective PASS)
THEN RETRO.status 為 completed
AND 所有 4 個 stage 均為 completed
AND result 含 '所有階段已完成'
```

---

## Feature 5: fail-retry 路徑 — TEST FAIL → DEBUG → DEV → TEST PASS

### Scenario: TEST FAIL 第一次 — failCount 遞增並提示 DEBUGGER

```
GIVEN quick workflow，DEV 已 completed，TEST 為 active
WHEN 執行 on-stop(tester FAIL)，last_assistant_message 含失敗語意
THEN result 含 ❌
AND workflow.json 中 failCount 為 1
AND result 含 DEBUGGER（不分大小寫）
AND timeline.jsonl 包含 stage:retry 事件
```

### Scenario: retry 路徑 — debugger 完成分析（不追蹤額外 stage）

```
GIVEN failCount 為 1，主 Agent 根據提示委派 debugger
WHEN 執行 on-stop(debugger PASS)，last_assistant_message 含 PASS 語意
THEN hook 正常執行（exit code 0），result 不為 null
AND failCount 仍為 1（debugger 不屬於原始 workflow stages，不記計數）
```

### Scenario: retry 路徑 — developer 完成修復（不追蹤額外 stage）

```
GIVEN failCount 為 1，debugger 已完成分析
WHEN 執行 on-stop(developer PASS)，last_assistant_message 含 PASS 語意
THEN hook 正常執行（exit code 0）
AND failCount 仍為 1
```

### Scenario: TEST 修復後 PASS — failCount 保留歷史但 TEST 進入 completed

```
GIVEN failCount 為 1，TEST 為 active（retry 後）
WHEN 執行 on-stop(tester PASS)，last_assistant_message 含 PASS 語意
THEN TEST.status 為 completed
AND result 含 ✅
AND failCount 仍為 1（歷史保留，不歸零）
```

---

## Feature 6: pre-task-parallel — 並行 stage 的 PreToolUse 行為

### Scenario: DEV 完成後委派 code-reviewer 放行，REVIEW 設為 active

```
GIVEN quick workflow，DEV.status 為 completed
WHEN 執行 pre-task.js，toolInput 描述指向 code-reviewer
THEN hook 回傳 result 為空字串（放行）
AND REVIEW.status 變為 active
AND activeAgents 包含 code-reviewer
```

### Scenario: DEV 完成後委派 tester 放行，TEST 設為 active

```
GIVEN quick workflow，DEV.status 為 completed
WHEN 執行 pre-task.js，toolInput 描述指向 tester
THEN hook 回傳 result 為空字串（放行）
AND TEST.status 變為 active
AND activeAgents 包含 tester
```

### Scenario: DEV 完成後同時委派 code-reviewer 和 tester 均放行

```
GIVEN quick workflow，DEV.status 為 completed
WHEN 依序執行 pre-task(code-reviewer) 和 pre-task(tester)
THEN 兩次 hook 均回傳 result 為空字串
AND activeAgents 同時包含 code-reviewer 和 tester
AND REVIEW.status 為 active
AND TEST.status 為 active
```

### Scenario: 前置 stage 未完成時委派後置 stage agent — 阻擋並指明缺少的 stage

```
GIVEN quick workflow，PLAN 為 pending（前置未完成）
WHEN 執行 pre-task.js，toolInput 描述指向 developer
THEN hook 回傳 hookSpecificOutput.permissionDecision 為 'deny'
AND permissionDecisionReason 含 'PLAN'（或對應未完成 stage 名稱）
```

### Scenario: prompt 含 `.test.js` 路徑時不誤判為 tester（整合驗證）

```
GIVEN quick workflow，DEV.status 為 completed
WHEN 執行 pre-task.js，toolInput.description 為一般描述（不含 agent 名稱），
  toolInput.prompt 含 'tests/unit/foo.test.js'
THEN hook 回傳 result 為空字串（不阻擋、不誤判為 tester）
AND TEST.status 仍為 pending（未被誤設為 active）
AND activeAgents 不包含 tester
```
