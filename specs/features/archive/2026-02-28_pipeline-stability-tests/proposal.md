# Proposal: pipeline-stability-tests

## 功能名稱

`pipeline-stability-tests`

## 需求背景（Why）

- **問題**：Phase 0 的 30 次 workflow 穩定性驗證完全依賴手動操作，耗時且無法重複。已知存在 `identifyAgent` 的 `.test.` 誤匹配 bug。此外，`identifyAgent` 和 `parseResult` 的邏輯被複製到 unit test 中，與 hook 原始碼可能不同步。
- **目標**：修復已知 bug + 將 pipeline state 轉移邏輯自動化驗證，確保 workflow 狀態機在各種場景下正確運作。
- **優先級**：Overtone 進入 V1 穩定期，pipeline 是核心基礎設施，穩定性直接影響所有 workflow 的可靠性。

## 使用者故事

```
身為 Overtone 開發者
我想要 pipeline 狀態轉移有自動化測試覆蓋
以便 修改 hook 或 state 邏輯時能立即發現回歸
```

## 範圍邊界

### 在範圍內（In Scope）

- 提取 identifyAgent / parseResult 為獨立可 require 模組（消除 test 中的邏輯複製）
- 修復 identifyAgent `.test.` 誤匹配 bug + 回歸測試
- single / standard / quick workflow 端到端 state 轉移測試
- PreToolUse 放行後 state 設定驗證（stage=active + activeAgents）
- 並行 stage 的 PreToolUse 行為測試
- Loop iteration 遞增 + block reason 驗證
- Stage fail → retry 完整路徑測試

### 不在範圍內（Out of Scope）

- 其他 workflow 類型（full, secure, tdd, debug, refactor 等）
- Dashboard SSE 推送驗證
- Loop 最大迭代/連續錯誤退出的端到端測試（已有 unit 覆蓋）
- test-coverage-gap-analysis 中其他缺口的補充

## 子任務清單

### Phase 0：前置重構（所有後續任務的依賴）

1. **提取 identifyAgent + parseResult 為獨立模組**
   - 負責 agent：developer
   - 相關檔案：
     - 新建：`plugins/overtone/scripts/lib/identify-agent.js`
     - 新建：`plugins/overtone/scripts/lib/parse-result.js`
     - 修改：`plugins/overtone/hooks/scripts/tool/pre-task.js`
     - 修改：`plugins/overtone/hooks/scripts/agent/on-stop.js`
     - 修改：`tests/unit/identify-agent.test.js`
     - 修改：`tests/unit/parse-result.test.js`
   - 說明：將函式提取為 `scripts/lib/` 下的獨立模組，hook 和 test 都改為 require 共用模組。驗證：現有 507 個測試全部通過。

### Phase 1：Bug 修復 + Must 測試（全部可並行）

2. **修復 identifyAgent `.test.` 誤匹配 bug + 回歸測試**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/identify-agent.js`、`tests/unit/identify-agent.test.js`
   - 說明：修復 regex 使 `.test.js` 路徑不觸發 tester 匹配，新增回歸測試案例

3. **single workflow 端到端 state 轉移測試**
   - 負責 agent：developer
   - 相關檔案：`tests/e2e/workflow-lifecycle.test.js`（新增 describe）或新建 `tests/e2e/single-workflow.test.js`
   - 說明：init → PreToolUse(developer) → SubagentStop(developer) → on-stop(complete)

4. **standard workflow 端到端 state 轉移測試**
   - 負責 agent：developer
   - 相關檔案：新建 `tests/e2e/standard-workflow.test.js`
   - 說明：8 個 stage 的完整推進路徑，含 TEST mode 驗證和並行 stage

5. **PreToolUse 設定 state 驗證**（可與 2 並行）
   - 負責 agent：developer
   - 相關檔案：`tests/integration/pre-task.test.js`（新增場景）
   - 說明：放行後驗證 stage=active + activeAgents 設定 + timeline agent:delegate

6. **並行 stage 的 PreToolUse 行為測試**（可與 2 並行）
   - 負責 agent：developer
   - 相關檔案：`tests/integration/pre-task.test.js`（新增場景）
   - 說明：DEV completed → 同時委派 REVIEW + TEST → 兩者都放行

### Phase 2：Should 測試（全部可並行）

7. **quick workflow 端到端轉移測試**
   - 負責 agent：developer
   - 相關檔案：`tests/e2e/workflow-lifecycle.test.js`
   - 說明：透過 hook 自然驅動的完整 state 轉移路徑

8. **Loop iteration 遞增 + block reason 驗證**
   - 負責 agent：developer
   - 相關檔案：`tests/integration/session-stop.test.js`
   - 說明：block reason 包含 Loop N/100 + 進度條 + 下一步提示

9. **Stage fail → retry 完整路徑測試**
   - 負責 agent：developer
   - 相關檔案：新建 `tests/e2e/fail-retry-path.test.js`
   - 說明：TEST FAIL → failCount++ → DEBUGGER → DEV → TEST → PASS

## 優先順序

```
Phase 0 (任務 1) → 序列
    |
Phase 1 (任務 2-6) → 全部可並行
    |
Phase 2 (任務 7-9) → 全部可並行
```

## 開放問題

1. identifyAgent 修復策略：negative lookbehind `(?<!\.)test(?:er|ing)?` 還是其他方式？（交由 architect 決定）
2. 提取的模組是否需要加入 registry.js 的 export（或維持獨立 require）？（交由 architect 決定）
3. 端到端測試是否放在現有 `workflow-lifecycle.test.js` 還是拆為多個檔案？（交由 architect 決定）
