---
feature: specs-archive-fix
type: bdd
status: in-progress
created: 2026-03-03
---

# Feature: Specs 歸檔系統修復

Specs 歸檔涉及四個結構性修復：
1. auto-sync 只對有 specs 的 workflow 執行
2. 歸檔前驗證 tasks.md 的 workflow 與 session state 匹配
3. 有 specs 的 workflow 讀不到 tasks.md 時發出診斷警告
4. 六個 command 模板的 init 指令加入 {featureName} 參數提示

---

## Feature 1：Auto-Sync 只對有 Specs 的 Workflow 執行

### Scenario 1-1：single workflow 有 in-progress feature — auto-sync 不發生

GIVEN agent/on-stop.js 被呼叫
AND session 的 workflowType 為 single
AND workflow.json 無 featureName（updatedState.featureName 為 falsy）
AND disk 上有一個 in-progress feature（例如 my-feature）
WHEN agent/on-stop.js 執行 featureName auto-sync 區塊
THEN auto-sync 不發生
AND state 中 featureName 維持空值
AND specs 目錄中 in-progress feature 不被讀取也不被同步

### Scenario 1-2：discovery workflow 有 in-progress feature — auto-sync 不發生

GIVEN agent/on-stop.js 被呼叫
AND session 的 workflowType 為 discovery
AND workflow.json 無 featureName
AND disk 上有一個 in-progress feature
WHEN agent/on-stop.js 執行 featureName auto-sync 區塊
THEN auto-sync 不發生
AND state 中 featureName 維持空值

### Scenario 1-3：standard workflow 有 in-progress feature — auto-sync 正常發生（回歸）

GIVEN agent/on-stop.js 被呼叫
AND session 的 workflowType 為 standard
AND workflow.json 無 featureName
AND disk 上有一個 in-progress feature（例如 my-feature）
WHEN agent/on-stop.js 執行 featureName auto-sync 區塊
THEN auto-sync 正常發生
AND state.featureName 被設定為 my-feature
AND updatedState.featureName 被更新為 my-feature

### Scenario 1-4：standard workflow 且 featureName 已存在 — auto-sync 不重複執行（邊界）

GIVEN agent/on-stop.js 被呼叫
AND session 的 workflowType 為 standard
AND workflow.json 已有 featureName（updatedState.featureName 非空）
WHEN agent/on-stop.js 執行 featureName auto-sync 區塊
THEN auto-sync 條件不成立（featureName 已有值）
AND 不呼叫 specs.getActiveFeature
AND state 中現有 featureName 不被覆蓋

### Scenario 1-5：standard workflow 但 projectRoot 為空 — auto-sync 不發生（錯誤處理）

GIVEN agent/on-stop.js 被呼叫
AND session 的 workflowType 為 standard
AND workflow.json 無 featureName
AND projectRoot 為空或不存在
WHEN agent/on-stop.js 執行 featureName auto-sync 區塊
THEN auto-sync 條件不成立（projectRoot 為 falsy）
AND 不拋出例外
AND hook 繼續正常執行

---

## Feature 2：歸檔前驗證 Workflow 匹配

### Scenario 2-1：workflow 完成且 tasks.md workflow 不匹配 — 跳過歸檔並記錄事件

GIVEN session/on-stop.js 被呼叫
AND session 的 workflowType 為 standard
AND state 中 featureName 為 my-feature
AND my-feature 的 tasks.md frontmatter 有 workflow: quick（與 standard 不匹配）
AND workflow 的所有 stages 都已完成（allCompleted = true）
WHEN session/on-stop.js 執行 specs 歸檔區塊
THEN 歸檔操作跳過（specs.archiveFeature 不被呼叫）
AND emit 一個 specs:archive-skipped 事件
AND 事件資料包含 featureName: my-feature、reason: workflow-mismatch、tasksWorkflow: quick、stateWorkflow: standard
AND hook 回傳警告訊息（包含「不匹配」字樣）
AND hook 不 block 退出（允許正常結束）

### Scenario 2-2：workflow 完成且 tasks.md workflow 匹配 — 正常歸檔（回歸）

GIVEN session/on-stop.js 被呼叫
AND session 的 workflowType 為 standard
AND state 中 featureName 為 my-feature
AND my-feature 的 tasks.md frontmatter 有 workflow: standard（與 standard 匹配）
AND workflow 的所有 stages 都已完成
WHEN session/on-stop.js 執行 specs 歸檔區塊
THEN 歸檔操作執行（specs.archiveFeature 被呼叫）
AND emit 一個 specs:archive 事件（不是 archive-skipped）
AND my-feature 目錄出現在 archive/ 下
AND in-progress/my-feature 目錄已被移除

### Scenario 2-3：workflow 完成且 tasks.md 無 frontmatter — 允許歸檔（容錯）

GIVEN session/on-stop.js 被呼叫
AND session 的 workflowType 為 standard
AND state 中 featureName 為 my-feature
AND my-feature 的 tasks.md 沒有 frontmatter（readTasksFrontmatter 回傳 null）
AND workflow 的所有 stages 都已完成
WHEN session/on-stop.js 執行 specs 歸檔區塊
THEN 歸檔操作正常執行（不因 frontmatter 缺失而跳過）
AND emit 一個 specs:archive 事件
AND my-feature 被成功歸檔

### Scenario 2-4：workflow 完成且 tasks.md frontmatter 無 workflow 欄位 — 允許歸檔（容錯）

GIVEN session/on-stop.js 被呼叫
AND session 的 workflowType 為 standard
AND state 中 featureName 為 my-feature
AND my-feature 的 tasks.md frontmatter 存在但不含 workflow 欄位（frontmatter.workflow 為 undefined）
AND workflow 的所有 stages 都已完成
WHEN session/on-stop.js 執行 specs 歸檔區塊
THEN 歸檔操作正常執行（條件 frontmatter?.workflow 為 falsy，不觸發 mismatch 邏輯）
AND emit 一個 specs:archive 事件

### Scenario 2-5：workflow 未完成 — 歸檔區塊不執行（邊界）

GIVEN session/on-stop.js 被呼叫
AND session 的 workflowType 為 standard
AND state 中 featureName 為 my-feature
AND workflow 尚有 stages 未完成（allCompleted = false）
WHEN session/on-stop.js 執行 stop hook 主流程
THEN hook 在 allCompleted 判斷後 block 退出
AND 歸檔區塊不執行
AND specs:archive-skipped 事件不被 emit

---

## Feature 3：Tasks.md 遺失診斷警告

### Scenario 3-1：standard workflow 有 featureName 但 tasksStatus 為 null — 發出診斷警告

GIVEN session/on-stop.js 被呼叫
AND session 的 workflowType 為 standard（specsConfig[standard].length > 0）
AND state 中 featureName 為 my-feature（非空）
AND loop.readTasksStatus 回傳 null（tasks.md 不存在或讀取失敗）
WHEN session/on-stop.js 執行 tasksStatus 診斷區塊
THEN emit 一個 specs:tasks-missing 事件
AND 事件資料包含 workflowType: standard 和 featureName: my-feature
AND hook 輸出診斷警告訊息（包含「diagnostics」或「tasks.md」字樣）
AND hook 不 block 退出（warn but don't block）

### Scenario 3-2：single workflow 有 featureName 但 tasksStatus 為 null — 不發出警告（預期行為）

GIVEN session/on-stop.js 被呼叫
AND session 的 workflowType 為 single（specsConfig[single].length === 0 或 undefined）
AND state 中 featureName 為 my-feature（非空）
AND loop.readTasksStatus 回傳 null
WHEN session/on-stop.js 執行 tasksStatus 診斷區塊
THEN 診斷條件不成立（specsConfig[single]?.length > 0 為 false）
AND specs:tasks-missing 事件不被 emit
AND 無診斷警告輸出

### Scenario 3-3：standard workflow 且 featureName 為空 — 不發出警告（邊界）

GIVEN session/on-stop.js 被呼叫
AND session 的 workflowType 為 standard
AND state 中 featureName 為空（null 或 undefined）
AND loop.readTasksStatus 回傳 null
WHEN session/on-stop.js 執行 tasksStatus 診斷區塊
THEN 診斷條件不成立（featureName 為 falsy）
AND specs:tasks-missing 事件不被 emit

### Scenario 3-4：standard workflow 有 featureName 且 tasksStatus 正常 — 不發出警告（回歸）

GIVEN session/on-stop.js 被呼叫
AND session 的 workflowType 為 standard
AND state 中 featureName 為 my-feature
AND loop.readTasksStatus 回傳有效的 tasksStatus（非 null）
WHEN session/on-stop.js 執行 tasksStatus 診斷區塊
THEN 診斷條件不成立（tasksStatus 非 null）
AND specs:tasks-missing 事件不被 emit
AND 無診斷警告輸出

---

## Feature 4：Command 模板包含 featureName 參數提示

### Scenario 4-1：standard.md 的 init 指令包含 {featureName}

GIVEN plugins/overtone/commands/standard.md 已更新
WHEN 讀取 standard.md 的初始化指令區段
THEN init 指令包含第三個參數 {featureName}
AND 格式為 `node ${CLAUDE_PLUGIN_ROOT}/scripts/init-workflow.js standard ${CLAUDE_SESSION_ID} {featureName}`
AND 指令下方有說明 {featureName} 須為 kebab-case 格式

### Scenario 4-2：full.md 的 init 指令包含 {featureName}

GIVEN plugins/overtone/commands/full.md 已更新
WHEN 讀取 full.md 的初始化指令區段
THEN init 指令包含第三個參數 {featureName}
AND 格式為 `node ${CLAUDE_PLUGIN_ROOT}/scripts/init-workflow.js full ${CLAUDE_SESSION_ID} {featureName}`
AND 指令下方有 kebab-case 說明

### Scenario 4-3：secure.md 的 init 指令包含 {featureName}

GIVEN plugins/overtone/commands/secure.md 已更新
WHEN 讀取 secure.md 的初始化指令區段
THEN init 指令包含第三個參數 {featureName}

### Scenario 4-4：refactor.md 的 init 指令包含 {featureName}

GIVEN plugins/overtone/commands/refactor.md 已更新
WHEN 讀取 refactor.md 的初始化指令區段
THEN init 指令包含第三個參數 {featureName}

### Scenario 4-5：tdd.md 的 init 指令包含 {featureName}

GIVEN plugins/overtone/commands/tdd.md 已更新
WHEN 讀取 tdd.md 的初始化指令區段
THEN init 指令包含第三個參數 {featureName}

### Scenario 4-6：quick.md 的 init 指令包含 {featureName}

GIVEN plugins/overtone/commands/quick.md 已更新
WHEN 讀取 quick.md 的初始化指令區段
THEN init 指令包含第三個參數 {featureName}
AND 格式為 `node ${CLAUDE_PLUGIN_ROOT}/scripts/init-workflow.js quick ${CLAUDE_SESSION_ID} {featureName}`

---

## Feature 5：Registry 新增 Timeline 事件（回歸驗證）

### Scenario 5-1：registry.js 包含 specs:archive-skipped 事件定義

GIVEN plugins/overtone/scripts/lib/registry.js 已更新
WHEN 讀取 timelineEvents 映射表
THEN 映射表中包含 specs:archive-skipped 事件
AND 該事件的 label 為「Specs 歸檔略過」
AND 該事件的 category 為「specs」

### Scenario 5-2：registry.js 包含 specs:tasks-missing 事件定義

GIVEN plugins/overtone/scripts/lib/registry.js 已更新
WHEN 讀取 timelineEvents 映射表
THEN 映射表中包含 specs:tasks-missing 事件
AND 該事件的 label 為「Specs Tasks 遺失」
AND 該事件的 category 為「specs」

### Scenario 5-3：platform-alignment 測試不因新增事件而失敗（回歸）

GIVEN registry.js 已新增 specs:archive-skipped 和 specs:tasks-missing
WHEN 執行 tests/unit/platform-alignment-registry.test.js
THEN 所有測試通過
AND 新事件符合 timelineEvents 格式規範

---

## Feature 6：端對端歸檔流程回歸

### Scenario 6-1：standard workflow 全勾 + workflow 匹配 — 正常歸檔並完成 workflow

GIVEN session/on-stop.js 被呼叫
AND session 的 workflowType 為 standard
AND state 中 featureName 為 my-feature
AND my-feature 的 tasks.md frontmatter 有 workflow: standard
AND workflow 的所有 stages 都已完成
AND loop.readTasksStatus 回傳有效的 tasksStatus（所有 checkbox 已勾選）
WHEN session/on-stop.js 執行完整的 stop hook 流程
THEN allCompleted 判斷為 true
AND 歸檔操作正常執行
AND emit specs:archive 事件
AND emit workflow:complete 事件
AND hook 不 block 退出（exitCode: 0）

### Scenario 6-2：workflow 完成但 featureName 為空 — 跳過歸檔不 block（邊界）

GIVEN session/on-stop.js 被呼叫
AND session 的 workflowType 為 standard
AND state 中 featureName 為空
AND workflow 的所有 stages 都已完成
WHEN session/on-stop.js 執行完整的 stop hook 流程
THEN 歸檔區塊條件不成立（featureName 為 falsy）
AND 歸檔操作跳過
AND hook 不 block 退出（仍正常完成）
AND specs:archive-skipped 事件不被 emit
