# Changelog

所有重要變更記錄於此文件。

## [0.28.52] - 2026-03-05

### Prompt Journal 完成——用戶 Intent 記錄與配對

#### 核心功能
- **Intent Journal**：記錄每次使用者 prompt（用戶意圖）
  - `instinct.js` emit() 新增 `options: { skipDedup, extraFields }` 參數
  - `on-submit-handler.js` 每次 UserPromptSubmit 記錄 `intent_journal` 類型觀察
  - 儲存：`~/.overtone/sessions/{sessionId}/observations.jsonl`

- **Session 結果配對**：SessionEnd 配對用戶 prompt + 執行結果
  - `session-end-handler.js` 新增 `resolveSessionResult(sessionId)` 函式
  - 根據 timeline 事件追溯，配對最後一個 intent_journal + session status
  - 記錄：prompt + result + duration + agents 執行過程

- **會話摘要注入**：SessionStart 注入「最近常做的事」
  - `session-start-handler.js` 新增 intent 摘要生成
  - 格式：「最近 5 session 中，你常在 DEV stage 花 30 分鐘」
  - 提升 agent 對用戶工作模式的認知

- **全域過濾**：`global-instinct.js` queryGlobal 新增 excludeTypes
  - 支援排除特定觀察類型（例如排除 intent_journal，只取技術決策）
  - 防止觀察類型污染，提高查詢精度

#### 測試補強
- 新增 `tests/unit/instinct-skip-dedup.test.js`（skipDedup + extraFields）
- 擴展 `tests/unit/on-submit-handler.test.js`（intent_journal emit 行為）
- 擴展 `tests/unit/session-end-handler.test.js`（resolveSessionResult + 配對邏輯）
- 擴展 `tests/unit/global-instinct.test.js`（excludeTypes 過濾）
- 擴展 `tests/unit/session-start-handler.test.js`（最近常做的事摘要注入）
- 擴展 `tests/unit/registry.test.js`（journalDefaults 常數驗證）
- BDD 全覆蓋：7 個 Feature、40+ Scenario
- 測試 +38（3378 → 3416，151 → 152 files）

#### 文件同步
- `plugin.json`：版本 0.28.52
- `docs/status.md`：版本更新、測試 3378 → 3416（+38）、檔案 151 → 152、Prompt Journal 功能記錄
- `CHANGELOG.md`：本次變更記錄

---

## [0.28.51] - 2026-03-05

### SessionStart SystemMessage 動態注入 Plugin Context

#### 動態 Context 生成
- 新增 `buildPluginContext()` 函式（`scripts/lib/session-start-handler.js`）
- 從 `registry.js` 動態計算：agent 數、stage 數、workflow 模板清單、hook events、並行群組定義
- 組裝格式化 context 字串，包含版本號、元件概覽、核心規範、目錄結構、常用指令

#### SessionStart Hook 增強
- Main Agent systemMessage 自動注入 plugin context（`.claude/sessionMessage` 之後）
- `buildPluginContext()` 失敗時靜默跳過，不阻擋 session 啟動
- 讓 Main Agent 感知當前 plugin 狀態和設計約束

#### 測試強化
- 新增 12 個單元測試驗證動態數值計算與 registry 資料一致性
- 測試 +12（3366 → 3378）

#### 文件同步
- `docs/status.md`：版本更新、測試 3366 → 3378（+12）
- `roadmap.md`：init-overtone 項目標記 ✅

---

## [0.28.49] - 2026-03-05

### Hook 薄殼化重構完成 + 遠端控制增強（Telegram /run + PM 佇列自動寫入 + Env Filter）

#### Hook 薄殼化重構（9 個 hook）
- session-start hook → session-start-handler.js（Init + Dashboard spawn）
- session-stop hook → session-stop-handler.js（Session 停止流程）
- session-end hook → session-end-handler.js（Session 結束收尾）
- agent-stop hook → agent-stop-handler.js（Agent 停止記錄）
- pre-task hook → pre-task-handler.js（Task 前置檢查）
- user-prompt-submit hook → on-submit-handler.js（Prompt 提交）
- post-tool-use hook → post-use-handler.js（Tool 執行後觀察）
- post-tool-use-failure hook → post-use-failure-handler.js（Tool 失敗處理）
- pre-compact hook → pre-compact-handler.js（Context 壓縮前恢復）
- 平均行數：~250 行 → ~29 行（薄殼化）

#### 新增 Handler 模組（scripts/lib/）
- session-start-handler、session-stop-handler、session-end-handler
- agent-stop-handler、pre-task-handler、on-submit-handler
- post-use-handler、post-use-failure-handler、pre-compact-handler

#### 遠端控制增強
- **Telegram /run 命令**：新增遠端觸發工作流指令，透過 `/run <featureName> [workflow]` 寫入 execution-queue，由 heartbeat 自動執行
  - constructor 新增 projectRoot option，heartbeat.js 傳入 projectRoot
  - 支援 6 個 Telegram 命令：/start、/status、/stop、/run、/sessions、/help
- **PM 佇列自動寫入**：agent-stop-handler.js 新增 _parseQueueTable() 解析 PM 輸出的 Markdown 表格，自動寫入 execution-queue
  - timeline emit queue:auto-write 事件，無需手動執行 queue CLI
- **CLAUDECODE env filter**：session-spawner.js 加入 CLAUDECODE prefix 環境變數過濾，防止嵌套 session 偵測誤觸發
  - SENSITIVE_PREFIXES = ['CLAUDECODE'] 加入 filter 條件

#### 測試擴充
- Handler 模組單元測試（session、agent、task、submit、post-use、failure、compact）
- Telegram 命令測試（8 個新測試：start、status、stop、run、sessions、help、rate-limit、error）
- PM 佇列表格解析測試（5 個新測試）
- Spawner env filter 測試（新增 Scenario 1-12）
- 測試 +16（3344 → 3360，150 → 151 files）

#### 文件同步
- `plugin.json`：版本 0.28.49（已在 v0.28.49 handoff 中更新）
- `docs/status.md`：版本更新，測試 3344 → 3360（+16），檔案 150 → 151，Telegram 命令清單新增
- `README.md`：版本 0.28.48 → 0.28.49，測試覆蓋 3238 → 3360
- `CHANGELOG.md`：本次變更記錄

---

## [0.28.48] - 2026-03-05

### Hook 共享模組抽取 + 並行門完整測試

- **跨 Hook 共享模組抽取**（新增 3 個模組）：
  - `specs-archive-scanner.js`：掃描式 Specs 歸檔工廠函式，統一 SubagentStop / SessionEnd 的歸檔邏輯
  - `hook-timing.js`：hook:timing emit 工廠函式，統一時序事件發送格式
  - `feature-sync.js`：featureName 自動同步工廠函式，統一 active feature 偵測邏輯

- **Hook 現代化**（8 個 hook 改用新工廠函式）：
  - `SubagentStop hook`：改用 specs-archive-scanner + hook-timing + feature-sync
  - `SessionEnd hook`：改用 specs-archive-scanner
  - `PostToolUse hook`：改用 hook-timing（觀察收集時序記錄）
  - `TaskCompleted hook`：改用 hook-timing（task 完成時序）
  - `PreCompact hook`：改用 hook-timing（context 壓縮時序）
  - 共 8 個 hook 統一工廠函式使用

- **並行門完整測試**（新增 `feature-sync.test.js`）：
  - 7 個單元測試：featureName 抽取、陣列去重、 ᶜ並行收斂、狀態同步驗證
  - 確保並行 agent 完成時狀態正確收斂

- **文件同步**：
  - `plugin.json`：版本 0.28.47 → 0.28.48
  - `docs/status.md`：版本更新，測試 3231 → 3238（+7），檔案 139 → 140
  - `CLAUDE.md`：scripts/lib 清單更新（38 個模組），Hook 架構行數對齊
  - `docs/spec/overtone.md`：版本 v0.28.47 → v0.28.48

- **測試**：3238 pass / 0 fail（140 個測試檔，+7 tests）

---

## [0.28.47] - 2026-03-04

### Statusline 集中式狀態管理 + TTL 機制 + 並行 Agent 修復

- **Statusline State 集中式管理**（新模組 `statusline-state.js`）：
  - 職責：集中管理 statusline 顯示狀態（activeAgents、workflowType、idle）
  - 狀態檔：`~/.overtone/sessions/{sessionId}/statusline-state.json`
  - 事件：agent:start / agent:stop / turn:stop / workflow:init
  - TTL 機制：idle 狀態持續 10 分鐘無更新 → 視為過期，statusline 自動收回

- **Statusline 三態邏輯優化**（`statusline.js` 重構）：
  - **態 1**：有 active agent → 雙行顯示（agent + 中文模式 / ctx% + compact count）
  - **態 2**：Main 控制中（statusline state 存在 + idle=false）→ 單行 Main 標籤
  - **態 3**：idle 或無 statusline state → 單行收回（ctx% + 檔案大小）
  - 移除 pre-workflow 狀態

- **並行 Agent Statusline 殘留修復**（`on-stop.js`）：
  - 修復並行 agent 完成時 statusline 未清理 bug
  - 前置條件：activeAgents 用 instanceId 為 key，on-stop.js 收斂後清理

- **initState 防撞守衛**（`state.js` + `init-workflow.js`）：
  - initState 防止與既有 workflow 衝突
  - 驗證 workflow 狀態一致性

- **Session ID 隔離**（測試改進）：
  - OVERTONE_HOME 隔離確保測試互不干擾
  - session-id-bridge.test.js 新增隔離驗證

- **改進**：
  - `plugins/overtone/scripts/get-workflow-context.js`：更新邏輯對齐新狀態模型
  - `plugins/overtone/scripts/lib/paths.js`：路徑管理對齐
  - `plugins/overtone/hooks/scripts/session/on-stop.js`：Session 停止邏輯同步
  - `plugins/overtone/hooks/scripts/tool/pre-task.js`：Task 前置處理同步
  - 測試新增 6 項（statusline-ttl、並行 agent 殘留、initState 守衛）

- **測試**：預期 3208+ pass / 0 fail（138+ 個測試檔）

---

## [0.28.46] - 2026-03-04

### Claude-Dev Skill 迭代 5 完成——整合 & 精簡

- **CLAUDE.md 文件規範整理**：
  - hooks.json 格式規範（三層嵌套）改為 cross-reference → `plugins/overtone/skills/claude-dev/references/hooks-api.md`
  - Agent prompt 四模式（信心過濾 + 邊界清單 + 誤判防護 + 停止條件）改為 cross-reference → `plugins/overtone/skills/claude-dev/references/agent-api.md`
  - 元件閉環規則（Skill → Agent 消費 → Hook 注入 → Guard 保護）改為 cross-reference → `plugins/overtone/skills/claude-dev/references/overtone-conventions.md`

- **Workflow 補齊**：
  - `quick.md`：補齊 DOCS stage（第 55-61 行），與 registry SoT 對齊

- **Status Line 四態邏輯**（`statusline.js`）：
  - **態 1**：有 active agent → 雙行顯示（agent + 中文模式 / ctx% + compact count）
  - **態 2**：無 active agent，但有 Main Agent → 單行顯示（Main 標籤）
  - **態 3**：無 active agent，workflow 完成收回 → 單行顯示（ctx% + 檔案大小）
  - **態 4**：無 workflow → 單行顯示（ctx% + 檔案大小）

- **並行委派說明**：
  - 7 個 command（quick.md、standard.md、full.md、secure.md、refactor.md、tdd.md、debug.md）的並行說明改為 inline（第 38 行註記 📋 並行委派）

- **SubagentStop Hook 增強**（`on-stop.js`）：
  - 新增 PM stage active 狀態處理（productManager key 支援）

- **Specs 歸檔**：
  - claude-dev-skill specs 遷移至 `docs/archive/specs/`（feature 完成）

- **文件同步**：
  - `docs/status.md`：版本 0.28.45 → 0.28.46，近期變更更新，測試 3141 → 3208（+67）
  - `README.md`：版本、agent 數、skill 數、knowledge domain 數全部對齊
  - `docs/spec/overtone.md`：版本 v0.28.44 → v0.28.46，agent 數 17 → 18

- **測試**：3208 pass / 0 fail（138 個測試檔）

---

## [0.28.45] - 2026-03-04

### Claude-Developer Agent — Plugin 元件開發專家

- **新增第 18 個 agent**：claude-developer
  - 職責：Plugin 元件開發（agent、hook、skill、command 建立/更新）
  - 不對應任何 workflow stage，由 Main Agent 直接委派
  - 消費 skills：claude-dev + commit-convention + wording

- **Registry 配置**：
  - `registry-data.json` agentModels：新增 claude-developer 配置（opus 模型，全 tool 許可）
  - `registry-data.json` agentMemory：claude-developer 加入學習記憶（local scope）
  - `plugin.json` agents：新增 claude-developer.md

- **測試**：3141 pass / 0 fail（137 個測試檔）

---

## [0.28.44] - 2026-03-04

### Claude-Dev Knowledge Domain — Plugin 開發知識庫（15 個 domain 完成）

- **新增第 15 個 knowledge domain skill**：claude-dev
  - 內容：hooks API（格式、驗證）、agent API（prompt 四模式、frontmatter）
  - Reference 檔案：hooks-api.md、agent-api.md、overtone-conventions.md

- **Agent Frontmatter 更新**：
  - developer、architect 加入 `skills: [claude-dev, ...]`

- **Knowledge Gap Detector 擴展**：
  - knowledge-gap-detector.js 新增 claude-dev domain 關鍵詞識別（16 個關鍵詞）

- **測試**：3141 pass / 0 fail（137 個測試檔）

---

## [0.28.37] - 2026-03-04

### Hook Contract 自我修復——SessionStart 清理異常狀態

- **state.sanitize(sessionId)**（新函式）：
  - 規則 1：清除孤兒 activeAgent（stage key 不在 stages 中）
  - 規則 2：修復 status 不一致（有 completedAt 但 status 非 completed）
  - SessionStart hook 自動呼叫，靜默處理異常狀態
  - 與 enforceInvariants() 互補：sanitize 做啟動一次性清理，enforceInvariants 做每次 atomic write 守衛

- **Hook Contract 整合測試**（新增）：
  - `tests/integration/hook-contract.test.js`：8 個 hook 合約整合測試
  - 驗證 pre-task.js → on-stop.js 全鏈路 + PreCompact 恢復鏈路

- **State Sanitize 單元測試**（新增）：
  - `tests/unit/state-sanitize.test.js`：11 個 scenario
  - 涵蓋空 session / 無不一致狀態 / 孤兒清除 / status 修復 / 複合情況

- **Session Start 整合測試擴展**（新增）：
  - `tests/integration/session-start.test.js` Scenario 8：3 個 sanitize 整合測試
  - 驗證 SessionStart 自動修復的完整鏈路

- **改進**：
  - `plugins/overtone/hooks/scripts/session/on-start.js`：加入 state.sanitize() 呼叫
  - `plugins/overtone/scripts/lib/state.js`：新增 sanitize() 和 enforceInvariants() 互補機制

- **清理**：
  - `plugins/overtone/scripts/lib/paths.js`：移除死碼 `paths.session.activeAgent`（[刪除未使用]）

- **測試**：3083 pass / 0 fail（132 個測試檔）（+22 tests）

---

## [0.28.36] - 2026-03-04

### 核心簡化與不變量守衛——Layer 2 狀態穩固

- **A 組：並行提示修復**
  - `Stop` hook `continueMessage` 改用 `getNextStageHint()`（支援並行群組合併提示）
  - `PreCompact` 狀態恢復訊息改用 `getNextStageHint()`
  - 解決並行 stage 重複提示問題

- **B 組：信號源簡化（雙信號源移除）**
  - 移除 `active-agent.json` 雙信號源（pre-task.js 不寫入、on-stop.js 不清除）
  - `statusline.js` 只讀 `workflow.json`（`buildAgentDisplay(workflow, registryStages)` 2 參數）
  - `PreCompact` hook 壓縮後清空 `activeAgents`
  - 單一 SoT（workflow.json）確保狀態一致性

- **C 組：State 不變量守衛**（新增 `enforceInvariants()` 函式）
  - **不變量 1**：孤兒清除——activeAgents 中不存在於 stages 的 agent 自動刪除
  - **不變量 2**：status 逆轉修正——若 activeAgents 有 agent 但 stage status 非 active，修正為 active
  - **不變量 3**：parallelDone 截斷——parallelDone 不能超過 parallelTotal
  - 違反不變量時 emit `system:warning` 事件
  - 移除 3 處 TTL workaround（`ACTIVE_AGENT_TTL_MS` 舊機制）

- **測試**：3061 pass / 0 fail（+46 tests vs 3015 baseline，129 個測試檔）

---

## [0.28.35] - 2026-03-04

### Level 2 → Level 1 Agent 個體學習升級（Phase 2 完成）

- **Agent Memory 擴大**：從 3 個 opus agent 擴大至 8 個跨層級 agent
  - `registry-data.json` agentMemory 從 3 個新增至 8 個（新增 5 個：developer、tester、debugger、planner、architect）
  - memory: local 配置支援多層級 agent（不限 opus）

- **Score Context 個人化**：pre-task.js score context 標題加入 agentName
  - 格式：`[品質歷史 — ${targetAgent}@${targetStage}（N 筆）]`
  - 讓跨 session 歷史記憶聚焦於個別 agent 的學習曲線

- **Grader 強制化**：stop-message-builder.js 依 workflowType 決定用詞
  - MUST_GRADE_WORKFLOWS: standard/full/secure/product/product-full
  - 對 MUST workflows 用 `📋 MUST 委派 grader 評分`，其他用 `🎯 建議委派 grader 評分`
  - grader 成為所有決策 workflow 的正規環節

- **測試**：
  - Level 2 Phase 2 測試無新增（功能為配置層次升級）
  - 累計 3047 pass / 0 fail（129 個測試檔）

---

## [0.28.34] - 2026-03-04

### Level 2 → Level 1 最小閉環修復：學習信號消費完整化

- **Graded Stages 擴展**：7 個主決策 stage
  - `registry.js` gradedStages 從 3 個（DEV/REVIEW/TEST）擴大至 7 個
  - 新增：PLAN、ARCH、DEBUG、RETRO，覆蓋策略層/架構層/診斷層/經驗總結層
  - 評分提示 Pre-Task 注入時涵蓋完整決策鏈

- **失敗原因記錄**：根因資訊流轉機制
  - `on-stop.js` recordFailure 新增 `reason` 欄位
  - 保留 fail/reject 時的具體原因，供跨 session 經驗累積

- **失敗原因展示**：failure-tracker 有根因時展示常見失敗模式
  - `failure-tracker.js` formatFailureWarnings 在有 reason 時識別並展示常見失敗原因
  - 去重邏輯，最多展示 3 個不同根因

- **全域觀察注入**：Pre-Task 段注入歷史學習記憶
  - `pre-task.js` 從 observations.jsonl 提取前 5 條高信心記憶（confidence >= 0.8）
  - 限制：500 字內，統一格式注入 subagent prompt

- **測試**：
  - `tests/integration/pre-task.test.js`：105 新測試（全域觀察注入）
  - `tests/unit/failure-tracker.test.js`：88 新測試（根因展示）
  - 累計 3037 pass / 0 fail（129 個測試檔）

---

## [0.28.33] - 2026-03-04

### Status Line TTL 防護：Agent 停止後殘留清理
- **On-Stop Cleanup 重構**：`plugins/overtone/hooks/scripts/agent/on-stop.js`
  - activeAgents cleanup 提前到 `findActualStageKey` 前執行，確保任何路徑都清除殘留
  - instanceId 解析提前，第一個 `updateStateAtomic` 只做 cleanup
  - `active-agent.json` 刪除策略：cleanup 後 activeAgents 為空才刪除；收斂後備份刪除
  - `agent:complete` timeline 事件提前 emit
- **Status Line TTL 過濾**：`plugins/overtone/scripts/statusline.js`
  - `buildAgentDisplay()` 的 activeAgents fallback 加 30 分鐘 TTL
  - 邏輯：有 active stage → 永不過期；無 active stage → 30 分鐘 TTL
- **State TTL 防護**：`plugins/overtone/scripts/lib/state.js`
  - `getNextStageHint` 的 activeAgents 讀取加 TTL 過濾邏輯
  - 過期殘留不阻擋下一步 hint
- **Pre-Compact TTL 防護**：`plugins/overtone/hooks/scripts/session/pre-compact.js`
  - 活躍 agents 列表加 TTL 過濾，避免殘留誤報
- **測試**：
  - `tests/unit/statusline-ttl.test.js`：4 scenarios（TTL 過濾）
  - `tests/integration/on-stop-stale-cleanup.test.js`：7 scenarios（cleanup + stale）
  - 累計 3026 pass / 0 fail（129 個測試檔）

---

## [0.28.32] - 2026-03-04

### P3.2 心跳引擎：自主控制層完成
- **Heartbeat Daemon**（新模組）：`scripts/heartbeat.js`
  - `start [--project-root <path>]`：啟動常駐 daemon + PID 檔管理
  - `stop`：停止 daemon + SIGTERM 清理
  - `status`：查看心跳狀態
  - 內部：polling loop + execution-queue 監聽 + failCurrent() 暫停機制
- **Session Spawner**（新模組）：`scripts/lib/session-spawner.js`
  - `spawn(taskSpec, options)`：`claude -p --plugin-dir` 封裝
  - 參數組裝 + stream-json 完成偵測 + timeout (3600s) + 事件推送
  - 整合 Telegram notify（spawn/完成/失敗/暫停）
- **Autonomous Control Skill**（新 knowledge domain）：第 13 個
  - `skills/autonomous-control/SKILL.md` + `references/heartbeat.md`
  - 5 個 agent 新增 `skills: [autonomous-control]`：developer, architect, tester, debugger, qa
- **Execution Queue 擴展**：`scripts/lib/execution-queue.js`
  - 新增 `failCurrent()` API：暫停當前任務（連續失敗機制）
- **Telegram 通知增強**：`scripts/lib/remote/telegram-adapter.js`
  - 新增 `notify(event, message)` API
- **測試**：
  - `tests/unit/heartbeat.test.js`：41 tests
  - `tests/unit/session-spawner.test.js`：9 tests
  - 累計 2858 pass / 0 fail（120 個測試檔）

---

## [0.28.31] - 2026-03-03

### P3.1 感知層：截圖 + 視窗管理完成
- **Screenshot Engine**（新模組）：`scripts/lib/os/screenshot.js`
  - `captureFullScreen(outputPath)`：全螢幕截圖
  - `captureRegion(region, outputPath)`：區域截圖
  - `captureWindow(appName, outputPath)`：特定視窗截圖
  - `checkPermission()`：權限檢測（macOS 螢幕錄製權限）
  - 底層：`screencapture` wrapper（macOS 原生）
- **Window Management**（新模組）：`scripts/lib/os/window.js`
  - `listProcesses()`、`listWindows(appName)`：進程/視窗列舉
  - `focusApp(appName)`：聚焦應用
  - `getFrontApp()`：取前景應用
  - `checkAccessibility()`：Accessibility 權限檢測
  - 底層：AppleScript/JXA（含 sanitizeAppName 安全注入防護）
- **Perception Reference**：`skills/os-control/references/perception.md`
  - 分析模板：截圖 → Read tool（多模態） → 結構化描述
  - UI 視覺化辨識、文字提取、異常檢測範本
- **測試**：
  - `tests/unit/screenshot.test.js`：22 tests
  - `tests/unit/window.test.js`：27 tests
  - 累計 2808 pass / 0 fail（118 個測試檔）

---

## [0.28.30] - 2026-03-03

### P3.0 閉環基礎：Status Line 並行顯示 + 組件管理強化
- **Status Line 並行顯示修復**：`scripts/statusline.js`
  - `buildAgentDisplay()`：修復 primary signal 分支（active-agent.json）中查詢並行 stage 數量，顯示 `agent × N` 格式
  - `main()` 第 277 行：null-safety 修復（`workflow?.workflowType`）避免無 workflow 時 crash
- **組件管理依賴提示**：`scripts/manage-component.js`
  - create/update 成功後，向 stderr 輸出依賴提示 checklist
  - 幫助開發者記住跨元件的依賴關係（agent → skills、hook → lib）
- **測試補強**：`tests/unit/statusline.test.js`
  - 新增 2 個並行顯示測試
  - 修復「無 workflow」測試的隔離問題（前置清除 workflow.json）
- **測試**：
  - 累計 2759 pass / 0 fail（116 個測試檔）

---

## [0.28.29] - 2026-03-03

### 核心穩固清理 + mul-agent 泛化
- Dead exports 清理（health-check.js 加入 tests/ 搜尋，72→0）
- getStageByAgent 抽取消除 on-stop/pre-task 重複邏輯
- 7 個 workflow command 加入並行引導
- mul-dev→mul-agent 泛化（支援 developer/tester/debugger/reviewer 並行）
- 測試：2695 pass / 115 files

---

## [0.28.28] - 2026-03-03

### Level 2：時間序列學習
- adjustConfidenceByIds API + 觀察效果反饋迴路
- SessionStart 記錄注入 ID，SessionEnd 比對 baseline/score 趨勢後調整 confidence
- globalInstinctDefaults 新增 feedbackBoost/feedbackPenalty
- 測試：2658 pass / 114 files

---

## [0.28.27] - 2026-03-03

### Level 2：卡點識別（失敗模式聚合）
- **Failure Tracker**（新模組）：`scripts/lib/failure-tracker.js`
  - `recordFailure(sessionId, stage, agent, error)`：在 fail/reject 時記錄失敗到 `~/.overtone/global/{projectHash}/failures.jsonl`
  - `getFailurePatterns(projectHash, opts)`：聚合分析 byStage/byAgent/topPattern
  - `formatFailureWarnings(stage, agent)`：生成 stage 相關失敗模式警告
  - `formatFailureSummary(projectHash, opts)`：失敗摘要（週期、頻次、建議）
- **Hook 整合**：
  - `hooks/scripts/agent/on-stop.js`：fail/reject 時調用 recordFailure
  - `hooks/scripts/session/on-start.js`：注入失敗模式摘要提醒
  - `hooks/scripts/tool/pre-task.js`：注入 stage 相關失敗模式警告
- **Registry 設定**：`failureDefaults: { lookbackDays: 30, maxRecordsPerStage: 100 }`
- **測試**：
  - 新增 `tests/unit/failure-tracker.test.js`（20 tests）
  - 新增 `tests/unit/level-2-integration.test.js`（+12 tests）
  - 累計 2643 pass / 0 fail（113 個測試檔）

---

## [0.28.26] - 2026-03-03

### Level 2：趨勢分析引擎
- **Score Engine 趨勢分析**：`scripts/lib/score-engine.js`
  - `computeScoreTrend(projectRoot, stageKey)`：計算分數趨勢（window-based 或全序列）
  - `formatScoreSummary(projectRoot)`：生成人可讀的品質摘要
  - 摘要格式：stage × 趨勢（↑/→/↓）+ 最新得分 + 歷史平均
- **Baseline Tracker 趨勢分析**：`scripts/lib/baseline-tracker.js`
  - `computeBaselineTrend(projectRoot, workflowType)`：計算效能趨勢
  - 趨勢回傳：trend (UP/STABLE/DOWN) + delta (% 變化) + window 內樣本數
  - 整合至 `formatBaselineSummary` 輸出
- **SessionStart 品質摘要注入**：`hooks/scripts/session/on-start.js`
  - Session 啟動時自動生成上次評分摘要並注入 systemMessage
  - 包含各 stage 分數趨勢，提醒 agent 關注品質衝量
- **測試**：
  - 新增 `tests/unit/trend-analysis.test.js`（18 tests）
  - 新增 `tests/unit/feedback-loop.test.js`（9 tests）
  - 新增 `tests/integration/feedback-loop.test.js`（6 tests）
  - 累計 2595 pass / 0 fail（111 個測試檔）

---

## [0.28.25] - 2026-03-03

### Level 2：回饋閉環
- **Score Context 注入**：`hooks/scripts/tool/pre-task.js`
  - 在 task 進行前注入歷史評分 context（gradedStages 篩選）
  - 提示最低得分維度，促進 agent 有意識改進
- **Session 層 Instinct Decay**：`hooks/scripts/session/on-session-end.js`
  - SessionEnd 時自動計算並降權過時 instinct（>7 days）
  - 防止舊知識誤導未來 session
- **測試**：
  - 新增 `tests/unit/feedback-loop.test.js`（9 tests）
  - 新增 `tests/integration/feedback-loop.test.js`（6 tests）
  - 累計 2571 pass / 0 fail（110 個測試檔）

---

## [0.28.24] - 2026-03-03

### Level 2：數值評分引擎
- **Score Engine**（新模組）：`scripts/lib/score-engine.js`
  - `saveScore(sessionId, stage, data)`：記錄單次評分
  - `queryScores(sessionId, stage, opts)`：查詢評分歷史
  - `getScoreSummary(sessionId, opts)`：彙總報告（含趨勢分析）
  - 儲存路徑：`~/.overtone/global/{projectHash}/scores.jsonl`
- **Registry 設定**：
  - `scoringConfig: { gradedStages: ['DEV','REVIEW','TEST'], lowScoreThreshold: 3.0 }`
  - `scoringDefaults: { compareWindowSize: 10, maxRecordsPerStage: 50 }`
- **Grader 整合**：
  - grader.md 新增「步驟 5：寫入 scores store」
  - SubagentStop hook：grader PASS 後，低分（<3.0）emit `quality_signal` 事件
- **UX 改進**：
  - stop-message-builder.js：PASS 時提示是否需委派 grader 評分
  - agent/on-stop.js：低分判定與通知
- **測試**：
  - 新增 `tests/unit/score-engine.test.js`（33 tests）
  - 新增 `tests/integration/grader-score-engine.test.js`（11 tests）
  - 累計 2550 pass / 0 fail（108 個測試檔）

---

## [0.28.23] - 2026-03-03

### Level 2：效能基線追蹤 + 執行佇列
- **Baseline Tracker**（新模組）：`scripts/lib/baseline-tracker.js`
  - `computeSessionMetrics(sessionId)`：計算 session 關鍵指標
  - `saveBaseline(sessionId, data)`、`getBaseline(projectHash, stage)`：持久化與查詢
  - `compareToBaseline(sessionId, stage)`：與歷史比較
  - `formatBaselineSummary(summary)`：格式化輸出
- **Execution Queue**（新模組）：`scripts/lib/execution-queue.js`
  - `readQueue(projectHash)`、`writeQueue(projectHash, queue)`：佇列讀寫
  - `getNext/getCurrent/advanceToNext/completeCurrent`：狀態轉移
  - `formatQueueSummary(queue)`：可視化
- **Registry 設定**：`baselineDefaults: { compareWindowSize: 10, maxRecordsPerStage: 50 }`
- **測試**：+38 tests → 2506 pass / 106 files

---

## [0.28.22] - 2026-03-03

### Level 2：跨 Session 長期記憶
- **Global Instinct Engine**（新模組）：`scripts/lib/global-instinct.js`
  - `graduate(observations, threshold)`：高信心觀察畢業為全域知識
  - `queryGlobal(projectHash, query)`：跨 session 查詢
  - `summarizeGlobal(observations)`：觀察摘要
  - `decayGlobal(observations, days)`：時間衰減（> 30 days 降權）
  - `pruneGlobal(observations, maxSize)`：超大刪舊
  - 儲存路徑：`~/.overtone/global/{projectHash}/observations.jsonl`
- **Registry 設定**：`globalInstinctDefaults: { graduationThreshold: 0.85, projectHashLength: 12 }`
- **Workflow 整合**：
  - SessionStart：注入全域觀察背景
  - SessionEnd：自動畢業高信心觀察
- **測試**：+50 tests → 2468 pass / 103 files

---

## [0.28.21] - 2026-03-03

### Phase 2 終章：P4 文件同步 + S19 Agent 專一化分析（純文件更新）
- **Agent 專一化分析**：17 agents × 6 維度評估完成
  - 新建 `docs/analysis/agent-specialization.md`（188 行）：聯合模型評估 + 降級規則量化
  - 結論：opus 必要（PM、planner、code-reviewer、security-reviewer）；haiku 可達（tester 可從 sonnet 降級）
- **文件全面對齊**（P4）：
  - CLAUDE.md：追加 11 knowledge domain 清單
  - docs/vision.md：Layer 1 表格補充 domain 數量
  - docs/roadmap.md：P1/P2 說明細化 + P4→✅ / S19→✅ / S20→✅ v0.28.20 標記
  - docs/status.md：測試數字對齊（2408→2410）+ 近期變更更新
- 測試通過：2410 pass / 0 fail（+2）

### 功能改進（0.28.21 核心）
- **Specs 歸檔驗證強化**：agent/on-stop.js、session/on-stop.js 加入 specs workflow 匹配驗證
  - featureName auto-sync 加入 specsConfig 過濾，只對有 specs 的 workflow 生效
  - 歸檔前驗證 tasks.md workflow 匹配 + tasksStatus null 診斷警告
  - 新增 timeline 事件：`specs:archive-skipped`、`specs:tasks-missing`

### 架構改進
- **Timeline events 擴充**：24 → 26 個事件（新增 2 個 specs 相關事件）
- **Command 初始化提示**：6 個 command 模板 init 指令加 `{featureName}` 第三個參數提示

### 測試
- 新增：specs-archive-fix.test.js、agent-specialization.test.js 等驗證測試
- 更新：registry.js、on-stop.js、session-cleanup.test.js（specs 事件映射）
- 測試檔案：101 個

---

## [0.28.20] - 2026-03-03（P3 Hook 純化）

### 功能新增
- **SubagentStop hook 重構**：on-stop.js 從 441 行精簡到 140 行
  - 提取核心邏輯為獨立純函式模組：`stop-message-builder.js`（提示組裝）+ `knowledge-archiver.js`（知識歸檔）
  - Hook 專注守衛職責：記錄結果、偵測 FAIL/REJECT、檢查並行收斂
  - 副作用遷移：知識歸檔邏輯由 hook → agent（SubagentStop 結束時，PASS 時自動執行）
  - Dead code 掃描、Docs sync 驗證：由 hook → agent prompt（在 retrospective、doc-updater 中作為指導，而非強制執行）

### 架構改進
- **Hook 純化**：11 個 hook，總行數從 ~1887 → ~1720
  - on-stop.js：441 → 140（降低 68%）
  - 核心 hook 功能保留：狀態管理、timeline emit、並行協調
  - 邊界明確：hook 守衛層、agent 業務層
- **Grader 評估指引**：移至 `skills/workflow-core/references/completion-signals.md`（替代 hook 內硬編碼提示）
- **shouldSuggestCompact**：遷移至 `hook-utils.js`（多個 hook 共用，統一邏輯）
- 新增 lib：`stop-message-builder.js`（121 行）+ `knowledge-archiver.js`（67 行）

### 測試
- 新增：stop-message-builder.test.js（16 tests）+ knowledge-archiver.test.js（6 tests）
- 更新：agent-on-stop.test.js、compact-suggestion.test.js（import 調整）
- 測試通過：2402 pass / 0 fail（+21）
- 測試檔案：101 個

### 文檔
- 更新 docs/status.md：版本狀態、核心指標（測試 2381→2402、檔案 99→101）、近期變更
- 更新 docs/roadmap.md：P3 完成標記、S20 版本標記

---

## [0.28.6] - 2026-03-02（閉迴圈工作流驗證）

### 功能新增
- **workflow-closed-loop.test.js**：閉迴圈工作流驗證
  - 驗證 GIVEN/WHEN/THEN 閉迴圈邏輯（51 tests）
  - 覆蓋 stop hook + loop 繼續 + 隱藏 task 處理

### 測試
- 新增：workflow-closed-loop.test.js（51 tests）
- 測試通過：1917 pass / 0 fail（+73）
- 測試檔案：85 個

---

## [0.28.5] - 2026-03-02（Wording knowledge domain 轉 skill）

### 功能新增
- **wording knowledge domain skill**：第 8 個 knowledge domain，獨立為 skill
  - 內容：措詞正確性檢查、emoji-關鍵詞配對、語言風格指南
  - 消費者：8 個 agent（planner、architect、developer、code-reviewer、security-reviewer、database-reviewer、retrospective、doc-updater）
  - 參考文件：docs/reference/wording-guide.md

### 架構改進
- **S15b 迭代 2 完成**：knowledge domain 7 → 8，skill 15 → 16（最後一個獨立 knowledge domain）
- **config-api.js memory 欄位修復**：agent 設定 memory 欄位遺失 bug 修復

### 測試
- 新增：docs-sync.test.js（文件同步驗證）、knowledge-domain-chain.test.js（8 個 domain 鏈路）、reference-integrity.test.js（參考檔案路徑檢查）
- 測試通過：1844 pass / 0 fail（+18）
- 測試檔案：85 個

### 文檔
- 更新 docs/status.md：版本狀態、核心指標（knowledge domain 7→8、Skill 數 15→16）、近期變更
- 更新 docs/spec/overtone.md：版本 v0.28.5、決策記錄補齊

---

## [0.28.4] - 2026-03-02（Reference 完整性驗證）

### 功能新增
- **reference-integrity.test.js**：參考檔案完整性驗證
  - 掃描 skills/ 和 commands/ 中的所有 reference/ 子目錄
  - 驗證中文名稱與檔案是否對應

### 測試
- 新增：reference-integrity.test.js（42 tests）
- 測試通過：1826 pass / 0 fail
- 測試檔案：84 個

---

## [0.28.2] - 2026-03-02（測試品質防護機制 — test-index + 反模式偵測）

### 功能新增
- **test-index.js**：測試索引掃描工具
  - buildTestIndex() API：掃描所有 .test.js 檔案並統計測試情況
  - 消費者：pre-task hook（tester/developer 角色）
  - 數據：測試檔案總數、通過率、關鍵測試區塊定位
- **test-anti-patterns.md**：6 種常見測試反模式文件（testing skill 新增 reference）
  - 過度 mocking / 缺失邊界測試 / 脆弱 fixture 等
  - 消費者：tester、code-reviewer agents

### 架構改進
- **pre-task hook 增強**：注入 test-index 摘要至 tester/developer prompt（帶動整體測試意識）
- **Agent DON'T 規則擴充**：tester +3、developer +2 條反模式警告

### 測試
- 新增：test-index.js 單元測試（26 tests）+ pre-task 整合測試（11 tests）
- 測試通過：1778 pass / 0 fail
- 測試檔案：83 個

---

## [0.27.3] - 2026-03-02（S15b 迭代 1 PoC — testing knowledge domain）

### 功能新增
- **testing knowledge domain skill**：合併 4 處 BDD/testing 知識（auto/bdd-spec-guide、test/references、ref-test-strategy）至單一 testing skill
  - 消費者：tester、qa agents
  - 內容：BDD 規格寫作、測試策略、失敗排查

### 架構改進
- **ref-* skill 整理**：刪除 ref-test-strategy，ref-* 從 3 個 → 2 個（ref-commit-convention、ref-pr-review-checklist 保留）
- **S15b 迭代 1 完成**：正規化計畫 9 次迭代中的第 1 次，38 個 skills → ~16 knowledge domain + ~27 commands 的長期目標啟動

### 測試
- 測試通過：1336 pass / 0 fail
- 無新增測試（重構範疇）

### 文檔
- 更新 docs/status.md：版本狀態、核心指標（ref-* 從 3→2）、近期變更
- 更新 docs/product-roadmap.md：S15b 迭代 1 標記 ✅ v0.27.3、最後更新日期

---

## [0.27.2] - 2026-03-01（ref-* skill 整理 + Agent Frontmatter 同步）

### 功能改進
- **ref-* skill 整理**：刪除 4 個副本 ref-*（ref-bdd-guide、ref-failure-handling、ref-wording-guide、ref-agent-prompt-patterns），保留 3 個新型 ref-* 並設定消費者
  - ref-test-strategy → tester
  - ref-pr-review-checklist → code-reviewer
  - ref-commit-convention → developer
- **Agent frontmatter 同步**：tester、code-reviewer、developer 等 5 個 agent 更新 `skills` 欄位指向新 ref-*

### 測試
- 測試通過：1336 pass / 0 fail

---

## [0.27.1] - 2026-03-01（CBP 交叉比對 — ref-* 建立 + 模板同步）

### 功能新增
- **Reference Skills（3 個新增）**：
  - ref-commit-convention：引用 CLAUDE.md + CBP commit style
  - ref-pr-review-checklist：Anthropic 官方審查清單
  - ref-test-strategy：BDD + 測試策略最佳實踐
- **.github/ 模板新增**：ISSUE_TEMPLATE、PULL_REQUEST_TEMPLATE
- **product-roadmap.md 更新**：S15-S17 計畫骨架

### 測試
- 測試通過：1331 pass（+基準）

---

## [0.27.0] - 2026-03-01（核心精鍊 3 次迭代）

### 迭代 1：表層清理
- 刪除 grader.js（已遷移為 agent）
- state/parse-result/timeline 風格統一

### 迭代 2：模組化提取
- on-stop.js 476 行 → 357 行
- 提取到 lib/ 的 4 個輔助函式：formatSize、findActualStageKey、checkParallelConvergence、getNextStageHint

### 迭代 3：測試覆蓋補強
- JSONL 損壞行容錯
- passAtK 獨立測試
- PM 多迭代連續執行規則驗證

### 測試
- 測試通過：1331 pass

---

## [0.21.0] - 2026-03-01（Config API 統一設定管理）

### 功能新增
- **config-api.js**：統一 agent/hook/skill 三大元件的設定管理
  - L1 驗證層：validateAgent、validateHook、validateSkill、validateAll
  - L2 結構化 API：createAgent、updateAgent、createHook、updateHook、createSkill、updateSkill
  - 支援 frontmatter 解析 + 命令占位符 `${CLAUDE_PLUGIN_ROOT}` 替換
- **registry-data.json**：將 stages 和 agentModels 常數從 registry.js 抽離，改為 JSON 化存儲
- **registry.js 新增常數**：
  - `knownTools`（13 個工具）：Claude 已知的工具集合
  - `hookEvents`（9 個事件）：Overtone hook 事件列表
- **validate-agents.js 遷移**：改為 thin wrapper 呼叫 config-api，功能不變

### 架構改進
- `registry.js`：新增 `knownTools` 和 `hookEvents` 兩個全域常數匯出
- `scripts/lib/` 新增 `config-api.js` 和 `registry-data.json` 兩個新模組

### 測試
- 新增 82 個 config-api 系列單元與整合測試（71 unit + 11 integration）
- 測試總數：991 → 1073 pass
- 測試檔案數：52 → 54 個

### 文檔
- 更新 CLAUDE.md：目錄結構新增 config-api.js 和 registry-data.json
- 更新 docs/status.md：版本、測試指標
- 更新 README.md：版本號

---

## [0.20.0] - 2026-03-01（平台對齐優化 Phase 1）

### 功能新增
- **disallowedTools 遷移**：10 個 agent（architect、planner、code-reviewer、security-reviewer、debugger、database-reviewer、retrospective、product-manager、qa、designer）從 tools 白名單遷移到 disallowedTools 黑名單，提升靈活性與正確性
- **Reference Skills 系統**：3 個新增參考 skill（ref-bdd-guide、ref-failure-handling、ref-wording-guide），5 個 agent 添加 skills 前載
- **Workflow Context 注入**：pre-task.js 新增 buildWorkflowContext，為 agent prompt 注入當前工作流狀態（currentStage、activeAgents、failCount、rejectCount）
- **2 個新 Hook**：
  - SessionEnd（on-session-end.js）— Session 結束收尾 + 狀態清理
  - PostToolUseFailure（post-use-failure.js）— Tool 執行失敗事件處理
- **Hook-utils 擴充**：新增 buildProgressBar、buildWorkflowContext、getSessionId 三個共用函式

### 架構改進
- `registry.js`：新增 `tool:failure` event，timeline events 計數從 22 → 23
- `hooks.json`：Hook 清單從 7 個 → 9 個
- `plugin.json`：版本升級 0.19.1 → 0.20.0

### 測試
- 新增 8 個 platform-alignment 系列整合測試（測試總數：44 → 52 個、991 pass）

### 文檔
- 更新 CLAUDE.md：Hook 架構（7 → 9 個，~1269 行 → ~1602 行）
- 更新 docs/status.md：版本、測試指標、hook 數量、近期變更
- 更新 docs/spec/overtone-架構.md：Hook 清單、hook-utils 函式數量、timeline events 計數
- 新增 Skill：ref-bdd-guide、ref-failure-handling、ref-wording-guide

---

## [0.15.0] - 2026-02-26（並行機制優化 + mul-dev 新增）

### 功能新增
- **mul-dev skill**：DEV 階段內部並行機制
  - Mode A（有 specs）：architect 在 ARCH 後寫入 `## Dev Phases` 區塊
  - Mode B（無 specs）：Main Agent 自行判斷可並行子任務
  - Phase 標記：`(sequential)` / `(parallel)` / `(sequential, depends: N)` / `(parallel, depends: N)`
  - 失敗隔離：子任務重試不影響同 Phase 其他子任務
  - 詳見 `skills/mul-dev/SKILL.md`

### 並行機制缺陷修復（D1–D4）
- **D1 TOCTOU**：`state.js` 的 `updateStateAtomic` 加入 1–5ms jitter retry + Atomics.wait 優先
- **D2 hint 過時**：`on-stop.js` 的 `getNextStageHint()` 檢查 `activeAgents` 是否為空
- **D3 雙重失敗協調**：FAIL + REJECT 同時發生時，TEST FAIL > REVIEW REJECT 優先
- **D4 並行硬編碼**：將 `parallelGroups` 移入各 workflow 定義，透過字串引用 `parallelGroupDefs`
- 詳見 `docs/reference/parallel-defects.md`

### 架構改進
- `registry.js`：新增全域 `parallelGroupDefs`，各 workflow 透過 `parallelGroups` 欄位引用群組名
- `parallelGroups` 向後相容：外部 import 時動態推導為舊格式（群組名 → 成員陣列）
- Agent 擴充至 15 個（加 retrospective agent）

### 文檔
- 更新 `docs/workflow.md` 至 v0.5：並行缺陷修復、mul-dev 機制、15 agent 系統
- 新增 `docs/reference/parallel-defects.md`：4 項缺陷分析 + 修復方向

---

## [0.11.0] - 2026-02-26

### 安全修復
- `state.js` CAS 原子更新（`updateStateAtomic`）解決 TOCTOU race condition（H-1、H-2）
- SSE CORS 動態化，支援 `OT_CORS_ORIGIN` 環境變數和區網 IP（H-3）
- Telegram `chat_id` 白名單驗證，拒絕未授權控制命令（M-10）
- SSE `createAllSSEStream` cancel 閉包 bug 修正（M-5）

### 優化
- `timeline.js` query 寫入副作用分離，截斷移至 `emit()` 每 100 次觸發（M-1）
- `event-bus.js` 檔案監聽加入 50ms debounce，避免 atomicWrite rename 重複推送（M-4）
- `instinct.js` 改為 append-only 更新，查詢時 Map 合併，避免並行寫入丟失（M-9）
- `atomicWrite` 三因子唯一 tmp 檔名（pid.timestamp.counter）（M-2）
- 所有空 `catch {}` 塊加入描述性內聯註解（L-4）

### 修正
- `db-review` skill 使用正確的 workflow key `db-review`（原為 `review-only`）（H-4）
- `registry.js` 補齊 `diagnose`、`clean`、`db-review` 三個 workflow 定義（M-6）
- `parseResult` 擴充 false positive 排除清單（`error-free`、`error free` 等）（M-3）
- `post-use.js` sessionId 取值統一為 `CLAUDE_SESSION_ID || input.session_id`（M-8）
- `pid.js` 改用 `atomicWrite` 保持一致性（L-1）
- `on-start.js` 瀏覽器開啟改用 `spawn + detached + unref`，修正 setTimeout 早退問題（L-2、L-3）

### 前端
- Alpine.js 本地化（`web/vendor/alpine.min.js`），移除 CDN 依賴，支援離線使用（L-7）
- `serveStatic` 擴展為從 `web/` 根目錄服務，支援 `vendor/` 子目錄

### 文檔
- `CLAUDE.md` 目錄結構更新為 `plugins/overtone/` 架構（D-H1）
- `HANDOFF.md` 修正行數統計、skill 數量（18→27）、補齊 Phase 9-12（D-H2、D-M2、D-M3）
- 新增 `README.md`、`CHANGELOG.md`（D-L1、D-L2）

### 測試
- 新增 3 個 `updateStateAtomic` 單元測試（共 84 tests 全過）

---

## [0.10.0] - 2026-02-25

### 安全修復
- 命令注入防護（`on-start.js` 瀏覽器開啟改用參數陣列）
- SSE 連線資源洩漏修正（`unwatchSession` 正確清理 watcher）
- Telegram bot token 遮蔽（錯誤處理不印完整 URL）
- XSS 防護（session 頁面 ID 和 session 卡片內容統一 `escapeHtml`）
- 路徑穿越防護（靜態檔案服務 `resolve` + `startsWith` 檢查）
- CORS 限制（SSE 和 JSON API 回應加入 `Access-Control-Allow-Origin`）

### 優化
- 統一 `atomicWrite` 工具函式（tmp + rename 模式）
- `instinct.js` hybrid 寫入策略 + O(1) `_append`
- `server.js` 遷移至 Bun 原生檔案 API（`Bun.file`）

### 結構
- 新增 `package.json`（Bun 專案設定）
- 新增 `.env.example`
- 新增 `.gitignore` 規則

### 測試
- 6 個測試檔，81 tests 全過

---

## [0.9.0] - 2026-02-24

### 新增
- Phase 9：Agent frontmatter 補齊 + 4 個新 Skill（消除孤立 agent）
- Phase 10：Skill 三層載入優化（16 個 references/examples + 14 個 SKILL.md 瘦身）

---

## [0.8.0] - 2026-02-23

### 新增
- Phase 1-8 核心實作完成
- 14 個 Agent prompt 檔案
- 27 個 Skill（含 `/ot:auto`、`/ot:verify`、各 workflow skill）
- Dashboard（Bun HTTP + SSE + htmx + Alpine.js）
- Remote（EventBus + DashboardAdapter + TelegramAdapter）
- Instinct 學習系統（`instinct.js` + PostToolUse hook）
- Loop 模式（`loop.js` + Stop hook checkbox 檢查）
- 6 個 Hook（SessionStart、UserPromptSubmit、PreToolUse、SubagentStop、PostToolUse、Stop）
