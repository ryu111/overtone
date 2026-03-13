# Feature: 測試套件清理後行為不變

重構目標：刪除冗餘測試，確保剩餘測試仍完整覆蓋所有行為不變量。
三階段清理：Phase 1（舊 API 別名刪除）、Phase 2（重複測試精簡）、Phase 3（UNSUPPORTED_PLATFORM 標準化）。

---

## Phase 1：舊 API 別名與向後相容

### Scenario 1-1: ctx-api-alias Feature 5（session-factory）在 Feature 4 刪除後仍完整通過
GIVEN `ctx-api-alias.test.js` 的 Feature 4（Scenario 4-1~4-4）已刪除
WHEN 執行 `bun test tests/unit/ctx-api-alias.test.js`
THEN Feature 5 的所有 Scenario（5-1~5-7）全部 pass
AND 無任何 test fail 或 skip

### Scenario 1-2: session-factory 測試工廠基礎能力仍受保護
GIVEN Feature 4 舊 API 別名等價性測試已刪除
WHEN `makeTmpProject` 建立隔離目錄
THEN 回傳的 projectRoot 路徑存在且為獨立目錄
AND `createCtx` 建立有效的 SessionContext 物件（含 sessionId、workflowId）
AND `setupWorkflow` 與直接呼叫 `initStateCtx` 產生相同初始 state
AND `cleanupProject` 後目錄不再存在

### Scenario 1-3: Compat-1（get-workflow-context 舊 API）在 Compat-2~5 刪除後仍受保護
GIVEN `state-multi-instance.test.js` 的 Compat-2~5 已刪除，Compat-1 仍保留
WHEN 呼叫 `readState(sessionId, workflowId)` 使用舊 API 格式（`get-workflow-context.js` 使用模式）
THEN 正確讀取根層 `workflow.json` 的內容
AND 回傳完整的 workflow state 物件
AND 不發生路由錯誤或 null 誤判

### Scenario 1-4: 刪除 Compat-2~5 不影響 state.js Feature 2 多實例隔離測試
GIVEN Compat-2~5（舊 API 不傳 projectRoot）已刪除
WHEN 執行 state-multi-instance.test.js 剩餘測試（Feature 2 Scenario 2-1~2-8 + Compat-1）
THEN 所有剩餘測試 pass
AND 多實例隔離行為（Scenario 2-1~2-8）仍全部驗證通過

---

## Phase 2：重複測試精簡

### Scenario 2-1: config-validator.test.js 完整覆蓋 validateAgent / validateSkill / validateHook
GIVEN `config-api.test.js` 的 validateX 段（約 15 tests）已刪除
WHEN 執行 `bun test tests/unit/config-validator.test.js`
THEN validateAgentFrontmatter 的所有邊界條件仍被覆蓋
  （缺少 name、非法 model、permissionMode、maxTurns、disallowedTools、skills 交叉驗證）
AND validateSkillFrontmatter 的邊界條件仍被覆蓋
  （缺少 name/description、disable-model-invocation 型別錯誤）
AND validateHook 的邊界條件仍被覆蓋
  （非法 event、type 非 command、腳本不存在）
AND validateAll 的整合行為仍被覆蓋

### Scenario 2-2: config-api.test.js 保留 createAgent 等非重複測試
GIVEN config-api.test.js 的 validateX 重複段已刪除
WHEN 執行 `bun test tests/unit/config-api.test.js`
THEN `createAgent` 相關測試仍完整通過
AND 無 validateX 相關測試殘留

### Scenario 2-3: integration/agent-on-stop.test.js 完整覆蓋 handleAgentStop 高層場景
GIVEN `agent-stop-handler.test.js` 的高層 scenario（約 7 tests）已刪除
WHEN 執行 `bun test tests/integration/agent-on-stop.test.js`
THEN PASS 流程（場景 1）仍被覆蓋：developer agent 完成時 state 更新為 completed
AND FAIL 流程（場景 2）仍被覆蓋：tester agent 失敗時 verdict 正確記錄
AND REJECT 流程（場景 3）仍被覆蓋：code-reviewer 拒絕時阻擋下一 stage
AND 並行收斂偵測（場景 8）仍被覆蓋
AND timeline 事件驗證（場景 9）仍被覆蓋

### Scenario 2-4: agent-stop-handler.test.js 低層細節在刪除高層重複後仍覆蓋
GIVEN 高層 scenario 已由 integration/agent-on-stop.test.js 覆蓋並從 unit test 刪除
WHEN 執行 `bun test tests/unit/agent-stop-handler.test.js`
THEN `_parseQueueTable` 低層 helper 測試仍完整通過
AND `_computeImpactSummary` 測試仍通過
AND retry 計數機制測試仍通過
AND 邊界情況（handleAgentStop 邊界情況群組）仍通過

### Scenario 2-5: integration/pre-task.test.js 完整覆蓋 handlePreTask 主要流程
GIVEN `pre-task-handler.test.js` 的重疊 scenario（約 5 tests）已刪除
WHEN 執行 `bun test tests/integration/pre-task.test.js`
THEN 前置 stage 已完成時允許通過（場景 1）仍被覆蓋
AND 前置 stage 未完成時阻擋並警告（場景 2）仍被覆蓋
AND 無法辨識的 agent 允許通過（場景 3）仍被覆蓋
AND 無 session_id 靜默放行（場景 4）仍被覆蓋

### Scenario 2-6: pre-task-handler.test.js 低層細節在刪除重疊後仍覆蓋
GIVEN 高層 scenario 已移至 integration/pre-task.test.js
WHEN 執行 `bun test tests/unit/pre-task-handler.test.js`
THEN `checkSkippedStages` 細節邏輯仍被覆蓋
AND `_buildMoscowWarning` helper 仍被覆蓋
AND updatedInput 組裝、instanceId 生成、PARALLEL_TOTAL 注入等低層測試仍通過

### Scenario 2-7: state-helpers.test.js 完整覆蓋 findActualStageKey 基礎行為
GIVEN `state-convergence.test.js` 的重複 findActualStageKey 基礎測試（約 3 tests）已刪除
WHEN 執行 `bun test tests/unit/state-helpers.test.js`
THEN findActualStageKey 正常路徑仍被覆蓋
  （完全匹配 active、帶編號優先、pending fallback）
AND 邊界條件仍被覆蓋（不存在時回傳 null、空 stages 不拋出例外）
AND retry 場景仍被覆蓋（completed + fail/reject 可被找到）

### Scenario 2-8: state-convergence.test.js 保留非重複的並行場景測試
GIVEN findActualStageKey 基礎測試已移除
WHEN 執行 `bun test tests/unit/state-convergence.test.js`
THEN `checkSameStageConvergence` 測試仍完整通過（Scenario 1-1~1-6）
AND findActualStageKey 並行場景（Scenario 4-1~4-3）仍通過
AND `getNextStageHint` instanceId 格式適配（Scenario 5-1~5-3）仍通過

---

## Phase 3：UNSUPPORTED_PLATFORM 標準化

### Scenario 3-1: clipboard 非 macOS 行為由單一測試完整覆蓋
GIVEN clipboard.test.js 的「不呼叫系統指令」和「不拋出例外」UNSUPPORTED_PLATFORM 測試已刪除
AND 每個函數只保留「回傳正確錯誤結構」一個測試
WHEN 在非 macOS 平台執行 `readClipboard()`
THEN 回傳物件包含 `error: 'UNSUPPORTED_PLATFORM'`
WHEN 在非 macOS 平台執行 `writeClipboard(text)`
THEN 回傳物件包含 `error: 'UNSUPPORTED_PLATFORM'`

### Scenario 3-2: screenshot 非 macOS 行為由單一測試完整覆蓋
GIVEN screenshot.test.js 的「不呼叫任何系統指令」和「不拋出例外」UNSUPPORTED_PLATFORM 測試已刪除
AND 每個函數只保留「回傳正確錯誤結構」一個測試
WHEN 在非 macOS 平台執行 `captureFullScreen()`
THEN 回傳物件包含 `error: 'UNSUPPORTED_PLATFORM'`
WHEN 在非 macOS 平台執行 `captureRegion(region)`
THEN 回傳物件包含 `error: 'UNSUPPORTED_PLATFORM'`
WHEN 在非 macOS 平台執行 `captureWindow(windowId)`
THEN 回傳物件包含 `error: 'UNSUPPORTED_PLATFORM'`

### Scenario 3-3: system-info 非 macOS 行為由單一測試完整覆蓋
GIVEN system-info.test.js 的「不呼叫系統指令」和「不拋出例外」UNSUPPORTED_PLATFORM 測試已刪除
AND 每個函數只保留「回傳正確錯誤結構」一個測試
WHEN 在非 macOS 平台執行 `getCpuUsage()`
THEN 回傳物件包含 `error: 'UNSUPPORTED_PLATFORM'`
WHEN 在非 macOS 平台執行 `getMemoryInfo()`
THEN 回傳物件包含 `error: 'UNSUPPORTED_PLATFORM'`

### Scenario 3-4: fswatch 非 macOS 行為由單一測試完整覆蓋
GIVEN fswatch.test.js 的「不呼叫 watch」和「不拋出例外」UNSUPPORTED_PLATFORM 測試已刪除
AND 每個函數只保留「回傳正確錯誤結構」一個測試
WHEN 在非 macOS 平台執行 fswatch 相關函數
THEN 回傳物件包含 `error: 'UNSUPPORTED_PLATFORM'`

### Scenario 3-5: tts 非 macOS 行為由單一測試完整覆蓋
GIVEN tts.test.js 的「spawn 不被呼叫」UNSUPPORTED_PLATFORM 測試已刪除
AND 每個函數只保留「回傳正確錯誤結構」一個測試
WHEN 在非 macOS 平台執行 `speak()`、`speakBackground()`、`listVoices()`
THEN 各函數回傳物件包含 `error: 'UNSUPPORTED_PLATFORM'`

### Scenario 3-6: 保留的 UNSUPPORTED_PLATFORM 測試驗證實際值而非存在性
GIVEN 標準化後每函數保留唯一的 UNSUPPORTED_PLATFORM 測試
WHEN 執行該測試
THEN 斷言使用 `.toBe('UNSUPPORTED_PLATFORM')`（精確值比對）而非 `.toBeDefined()`
AND 不使用 `.toBeTruthy()` 等模糊斷言

---

## 整體不變量

### Scenario 4-1: 清理後整體測試套件通過率不降低
GIVEN 三個 Phase 的所有刪除操作均已完成
WHEN 從專案根目錄執行 `bun scripts/test-parallel.js`
THEN 所有剩餘測試 pass（0 fail）
AND pass 總數相較清理前約減少 60（對應刪除的冗餘測試數量）
AND 無任何既有功能測試被意外刪除

### Scenario 4-2: 刪除測試後覆蓋的業務行為無空洞
GIVEN 所有刪除操作完成
WHEN 審查被刪除測試所覆蓋的業務行為清單
THEN 每個被刪除測試的業務行為均有其他測試覆蓋
AND 舊 API 路徑由 Compat-1 覆蓋
AND validateX 行為由 config-validator.test.js 覆蓋
AND handleAgentStop 高層行為由 integration/agent-on-stop.test.js 覆蓋
AND handlePreTask 高層行為由 integration/pre-task.test.js 覆蓋
AND UNSUPPORTED_PLATFORM 回傳結構由保留的單一測試覆蓋

### Scenario 4-3: paths overload 偵測機制仍受 Compat-1 保護
GIVEN Compat-2~5 已刪除，Compat-1 保留
WHEN 呼叫 `readState` 使用舊格式（sessionId 字串不以 `/` 開頭）
THEN overload 偵測機制正確路由至舊 API 路徑
AND 不發生路由錯誤或 null 誤判
AND `get-workflow-context.js` 的使用模式持續有效
