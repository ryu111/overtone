# Proposal: test-coverage-gap-analysis

## 功能名稱

`test-coverage-gap-analysis`

## 需求背景（Why）

- **問題**：Overtone 目前有 312 個測試（15 個檔案），但覆蓋範圍不均勻。部分核心模組（registry.js、paths.js）和重要子系統（EventBus、Dashboard adapter、dashboard/pid.js、dashboard/sessions.js）完全沒有測試。2 個 hook（on-start.js、pre-task.js）僅有間接覆蓋或無覆蓋。E2E 測試目錄為空（僅有截圖檔案和 .gitkeep）。
- **目標**：識別所有測試缺口，規劃三層（unit / integration / e2e）補充測試策略，使高風險核心路徑達到合理覆蓋率。
- **優先級**：Overtone 進入 V1 穩定期，測試覆蓋是品質保障的基礎設施。

## 使用者故事

```
身為 Overtone 開發者
我想要 全面了解測試覆蓋缺口並有明確的補充計劃
以便 在新增功能或重構時有信心不會引入回歸
```

## 現況盤點

### 測試檔案清單（15 個，312 pass）

| 層級 | 測試檔案 | 測試案例數 | 覆蓋目標 |
|:----:|----------|:----------:|----------|
| unit | clamp.test.js | 5 | utils.js (clamp) |
| unit | identify-agent.test.js | ~15 | pre-task.js (identifyAgent 邏輯複製) |
| unit | parse-result.test.js | ~30 | on-stop.js (parseResult 邏輯複製) |
| integration | state.test.js | ~12 | state.js (readState/writeState/initState/updateStage/updateStateAtomic/setActiveAgent/removeActiveAgent) |
| integration | timeline.test.js | ~25 | timeline.js (emit/query/latest/passAtK) |
| integration | loop.test.js | ~12 | loop.js (readLoop/writeLoop/exitLoop/readTasksStatus) |
| integration | instinct.test.js | ~18 | instinct.js (emit/confirm/contradict/query/prune/getApplicable) |
| integration | specs.test.js | ~63 | specs.js (全 API) + CLI 腳本 (specs-pause/resume/backlog/list) |
| integration | utils.test.js | ~9 | utils.js (atomicWrite/escapeHtml) |
| integration | wording.test.js | ~30 | post-use.js (detectWordingMismatch/WORDING_RULES) |
| integration | agent-on-stop.test.js | ~20 | agent/on-stop.js hook (完整子進程測試) |
| integration | on-submit.test.js | ~15 | prompt/on-submit.js hook (完整子進程測試) |
| integration | session-stop.test.js | ~8 | session/on-stop.js hook (完整子進程測試) |
| integration | session-id-bridge.test.js | ~7 | paths.js 部分 + init-workflow.js + on-submit.js session ID 橋接 |
| integration | server.test.js | ~25 | server.js (HTTP API 端點) |

### 核心庫覆蓋矩陣

| 模組 | 行數 | 有測試 | 覆蓋品質 | 缺口 |
|------|:----:|:------:|:--------:|------|
| registry.js | 217 | 間接 | 低 | 無直接 unit test；資料完整性（15 agent、15 stage、15 workflow）未驗證 |
| paths.js | 84 | 間接 | 低 | session-id-bridge 測 2 個 export；sessionDir/sessionFile/session.*/project.* 未直接測試 |
| state.js | ~180 | **完整** | 高 | state.test.js 覆蓋所有 exported API |
| timeline.js | ~150 | **完整** | 高 | timeline.test.js 覆蓋 emit/query/latest/passAtK |
| loop.js | ~100 | **完整** | 高 | loop.test.js 覆蓋 readLoop/writeLoop/exitLoop/readTasksStatus |
| instinct.js | ~320 | **完整** | 高 | instinct.test.js 覆蓋核心 API |
| specs.js | ~340 | **完整** | 高 | specs.test.js 63 個案例 + CLI 整合 |
| utils.js | 65 | **完整** | 高 | utils.test.js + clamp.test.js |
| grader.js | 14 | N/A | N/A | 空模組（已重構為 agent），無需測試 |
| dashboard/pid.js | 74 | **無** | 無 | write/read/remove/isRunning/getUrl 全部未測試 |
| dashboard/sessions.js | 73 | 間接 | 低 | server.test.js 透過 HTTP 間接測試；listSessions/getSessionSummary 未直接測試 |
| remote/event-bus.js | 306 | **無** | 無 | EventBus 類別完全未測試 |
| remote/adapter.js | 62 | **無** | 無 | Adapter 基類未測試 |
| remote/dashboard-adapter.js | ~140 | **無** | 無 | Dashboard SSE adapter 未測試 |
| remote/telegram-adapter.js | ~350 | **無** | 無 | Telegram adapter 未測試 |

### Hook 覆蓋矩陣

| Hook | 行數 | 有測試 | 覆蓋品質 | 缺口 |
|------|:----:|:------:|:--------:|------|
| agent/on-stop.js | 405 | **完整** | 高 | 13 個場景覆蓋 PASS/FAIL/REJECT/上限/並行/timeline |
| prompt/on-submit.js | 109 | **完整** | 高 | 9 個場景覆蓋 /ot:命令、workflow覆寫、狀態摘要 |
| session/on-stop.js | 183 | **完整** | 高 | 6 個場景覆蓋 block/allow/loop/specs-archive |
| session/on-start.js | 100 | **無** | 無 | Banner 輸出、session 目錄初始化、Dashboard spawn、依賴檢查全未測試 |
| tool/post-use.js | 280 | 部分 | 中 | detectWordingMismatch 有測試；observeBashError/extractCommandTag/observeSearchToolPreference 未測試 |
| tool/pre-task.js | 173 | 部分 | 中 | identifyAgent 有 unit test（邏輯複製）；完整 hook 流程（跳過階段阻擋 + agent 委派記錄）未測試 |

### E2E 測試現況

**完全為空**。`tests/e2e/` 僅有 `.gitkeep` 和兩張截圖（f1-history-tab.png、f4-dashboard.png）。無任何自動化 E2E 測試。

## 範圍邊界

### 在範圍內（In Scope）

1. registry.js 資料完整性 unit test
2. paths.js 路徑解析 unit test
3. dashboard/pid.js unit test
4. dashboard/sessions.js unit test
5. remote/event-bus.js 核心方法 unit test
6. remote/adapter.js 基類 unit test
7. session/on-start.js hook integration test
8. tool/pre-task.js hook 完整流程 integration test
9. tool/post-use.js 缺失 pattern integration test（observeBashError、extractCommandTag）
10. E2E 測試基礎建設（至少 1 個端到端流程驗證）

### 不在範圍內（Out of Scope）

- remote/dashboard-adapter.js（SSE 需要 HTTP server 配合，較複雜）
- remote/telegram-adapter.js（需要外部 API mock，風險/收益比低）
- server.js 前端 HTML 渲染測試（已有 HTTP API 測試覆蓋核心路徑）
- 效能測試 / 壓力測試
- 跨平台相容性測試

## 子任務清單

### Phase 1：Unit Tests（純函數，無 I/O）— 優先級最高

1. **registry.js 資料完整性測試**
   - 負責 agent：developer
   - 相關檔案：`/Users/sbu/projects/overtone/tests/unit/registry.test.js`（新建）
   - 說明：驗證 stages 有 15 個 key、每個有 label/emoji/agent/color；workflows 有 15 個 key、每個 stages 陣列非空；agentModels 有 15 個 entry；timelineEvents 有完整 category；parallelGroupDefs 成員都是有效 stage key；specsConfig 覆蓋所有 15 個 workflow

2. **paths.js 路徑解析測試**
   - 負責 agent：developer
   - 相關檔案：`/Users/sbu/projects/overtone/tests/unit/paths.test.js`（新建）
   - 說明：驗證 sessionDir/sessionFile/session.workflow/session.timeline/session.loop/session.observations/session.handoffsDir/session.handoff 回傳正確路徑格式；project.* 路徑解析

3. **extractCommandTag 純函數測試**
   - 負責 agent：developer
   - 相關檔案：`/Users/sbu/projects/overtone/tests/unit/extract-command-tag.test.js`（新建）
   - 說明：從 post-use.js 提取 extractCommandTag 邏輯進行 unit test — 各種指令格式（npm install、bun test、git push、未知指令、空字串）

4. **Adapter 基類測試**
   - 負責 agent：developer
   - 相關檔案：`/Users/sbu/projects/overtone/tests/unit/adapter.test.js`（新建）
   - 說明：connect/disconnect 狀態切換、isConnected getter、onPush/onSync/onInteract 預設行為

### Phase 2：Integration Tests — 優先級高

5. **dashboard/pid.js 整合測試**
   - 負責 agent：developer
   - 相關檔案：`/Users/sbu/projects/overtone/tests/integration/dashboard-pid.test.js`（新建）
   - 說明：write/read 往返、remove 清理、isRunning 判斷（使用 process.pid 測試）、getUrl 回傳格式

6. **dashboard/sessions.js 整合測試**
   - 負責 agent：developer
   - 相關檔案：`/Users/sbu/projects/overtone/tests/integration/dashboard-sessions.test.js`（新建）
   - 說明：listSessions 空/有資料、active filter、getSessionSummary 各欄位、不存在的 session 回傳 null

7. **session/on-start.js hook 整合測試**
   - 負責 agent：developer
   - 相關檔案：`/Users/sbu/projects/overtone/tests/integration/session-start.test.js`（新建）
   - 說明：用 Bun.spawn 執行真實 hook 子進程 — 驗證 banner 輸出格式、session 目錄建立、timeline session:start 事件寫入；無 sessionId 時的靜默處理

8. **tool/pre-task.js hook 完整流程整合測試**
   - 負責 agent：developer
   - 相關檔案：`/Users/sbu/projects/overtone/tests/integration/pre-task.test.js`（新建）
   - 說明：用 Bun.spawn 執行真實 hook 子進程 — 跳過前置階段時阻擋（decision: block）、正常委派時記錄 activeAgent + timeline agent:delegate、無 session 跳過、無法辨識 agent 跳過

9. **tool/post-use.js observeBashError 整合測試**
   - 負責 agent：developer
   - 相關檔案：`/Users/sbu/projects/overtone/tests/integration/post-use-bash.test.js`（新建）
   - 說明：重大 Bash 錯誤（node/bun exit code 非零 + 長 stderr）→ 回傳自我修復指令；輕微錯誤 → null；非重要工具錯誤 → 記錄 instinct 但不注入指令

10. **EventBus 核心方法測試**
    - 負責 agent：developer
    - 相關檔案：`/Users/sbu/projects/overtone/tests/integration/event-bus.test.js`（新建）
    - 說明：register/unregister adapter、push 分發到所有 adapter、handleControl — stop/status/sessions 命令路由、未知命令回傳錯誤；不測試 fs.watch（非同步難測且風險低）

### Phase 3：E2E Tests — 優先級中

11. **E2E 基礎建設：完整 workflow 流程驗證**
    - 負責 agent：developer
    - 相關檔案：`/Users/sbu/projects/overtone/tests/e2e/workflow-lifecycle.test.js`（新建）
    - 說明：模擬完整 single workflow 生命週期 — 從 on-start.js 初始化 → on-submit.js 注入 → pre-task.js 委派 → agent/on-stop.js 完成 → session/on-stop.js 退出，驗證 state/timeline 一致性

## 優先順序

```
Phase 1 (unit, 4 個檔案) ─┬─ 可全部並行
                           ├─ 1. registry.test.js
                           ├─ 2. paths.test.js
                           ├─ 3. extract-command-tag.test.js
                           └─ 4. adapter.test.js

Phase 2 (integration, 6 個檔案) ─┬─ 5-6 可並行（dashboard 子系統）
                                  ├─ 7-8 可並行（hook 測試）
                                  ├─ 9 獨立
                                  └─ 10 獨立

Phase 3 (e2e, 1 個檔案) ─── 11 依賴 Phase 1-2 完成
```

## 開放問題

- 問題 1：EventBus 的 fs.watch 和 heartbeat 是否需要測試？（建議：不測試，因為 I/O 定時器在 CI 中不穩定，核心命令路由已覆蓋）
- 問題 2：pre-task.js 中 identifyAgent 函式目前是在 unit test 中複製了一份邏輯，是否需要重構為可 require 的獨立模組？（建議：是，但屬於重構範圍，可在此任務中一併處理或另開任務）
- 問題 3：E2E 測試是否使用 agent-browser CLI？（建議：本次 E2E 使用 Bun.spawn 串接多個 hook 子進程，不需要 agent-browser；真正的瀏覽器 E2E 留給 Dashboard UI 測試）
