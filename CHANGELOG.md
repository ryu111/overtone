# Changelog

所有重要變更記錄於此文件。

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
