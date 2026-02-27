# Overtone Plugin 全面體檢報告

> 日期：2026-02-28 | 版本：0.17.0 | 507 tests pass

## 總覽

| 面向 | 審計結果 | 評分 |
|------|---------|:----:|
| Agents（17 個） | 架構合理、分工清晰、registry 100% 對齊 | 4.5/5 |
| Skills（30 個） | 無孤立、無冗餘，但 frontmatter 有不一致 | 4/5 |
| Hooks + Scripts（4,046 行） | 架構健全，有並行安全和靜默錯誤問題 | 4/5 |
| Claude Code 對齊 | 使用 6/17 個 hook 事件，有多項新功能可採用 | 3/5 |

---

## 需要修復的問題

### 🔴 高優先

| # | 問題 | 位置 | 說明 |
|---|------|------|------|
| 1 | PreToolUse `hookSpecificOutput` 遷移 | `pre-task.js` | 舊的 top-level `decision`/`reason` 已 deprecated，需遷移到 `hookSpecificOutput` 格式 |
| 2 | pm/SKILL.md 缺少 `disable-model-invocation` | `skills/pm/SKILL.md` | PM 由 auto 委派，不應被 LLM 自動觸發 |
| 3 | Race condition：activeAgents | `pre-task.js` + `on-stop.js` | 兩個 hook 分別 set/remove activeAgent，未合併為單一 atomic 操作 |

### 🟡 中優先

| # | 問題 | 位置 | 說明 |
|---|------|------|------|
| 4 | QA maxTurns 偏弱 | `agents/qa.md` | 25 turns → 建議 35 |
| 5 | Retrospective maxTurns 偏弱 | `agents/retrospective.md` | 30 turns → 建議 40 |
| 6 | tasks.md 勾選失敗靜默 | `on-stop.js:115` | 勾選失敗時不通知使用者 |
| 7 | doc-sync 使用場景模糊 | `skills/doc-sync/SKILL.md` | 不清楚何時用獨立 doc-sync vs workflow 的 DOCS stage |
| 8 | 規格文件不一致 | `docs/spec/*.md` | agents 15→16、workflows 15→18、tests 84→507 |

### 🟢 低優先

| # | 問題 | 位置 | 說明 |
|---|------|------|------|
| 9 | timeline/instinct 全量載入 | `timeline.js`, `instinct.js` | 大檔案時效能緩慢 |
| 10 | mul-dev 缺 `disable-model-invocation` | `skills/mul-dev/SKILL.md` | 同 PM issue |
| 11 | wording 偵測不排除 code fence | `post-use.js` | Markdown ``` 內的 emoji 會誤報 |
| 12 | PM agent 文檔過長（51 頁） | `agents/product-manager.md` | 對比 developer 12 頁不成比例 |

---

## Agent 審計

### 彙總表

| # | Agent | Model | Color | Emoji | maxTurns | 評估 |
|---|-------|-------|-------|-------|:--------:|:----:|
| 1 | planner | opus | purple | 📋 | 25 | ✅ |
| 2 | architect | opus | cyan | 🏗️ | 25 | ✅ |
| 3 | designer | sonnet | cyan | 🎨 | 30 | ⚠️ 條件分支多 |
| 4 | developer | sonnet | yellow | 💻 | 50 | ✅ |
| 5 | debugger | sonnet | orange | 🔧 | 25 | ✅ |
| 6 | code-reviewer | opus | blue | 🔍 | 25 | ✅ |
| 7 | security-reviewer | opus | red | 🛡️ | 25 | ✅ |
| 8 | database-reviewer | sonnet | red | 🗄️ | 25 | ✅ |
| 9 | tester | sonnet | pink | 🧪 | 50 | ✅ 雙模式 |
| 10 | qa | sonnet | yellow | 🏁 | 25 | ⚠️ maxTurns 偏弱 |
| 11 | e2e-runner | sonnet | green | 🌐 | 50 | ✅ |
| 12 | build-error-resolver | sonnet | orange | 🔨 | 50 | ✅ |
| 13 | refactor-cleaner | sonnet | blue | 🧹 | 50 | ✅ |
| 14 | doc-updater | haiku | purple | 📝 | 20 | ✅ |
| 15 | retrospective | opus | purple | 🔁 | 30 | ⚠️ maxTurns 偏弱 |
| 16 | product-manager | opus | emerald | 🎯 | 30 | ⚠️ 文檔過長 |
| 17 | grader | haiku | purple | ⭐ | 5 | ✅ |

### 角色重複分析

所有 agent 之間**無角色重複**，分工清晰。

### 模型分配

| 層級 | Agents | 評估 |
|------|--------|------|
| Opus（6 個） | planner, architect, code-reviewer, security-reviewer, retrospective, product-manager | ✅ 決策/審查型 |
| Sonnet（9 個） | designer, developer, debugger, database-reviewer, tester, qa, e2e-runner, build-error-resolver, refactor-cleaner | ✅ 執行型 |
| Haiku（2 個） | doc-updater, grader | ✅ 輕量型 |

### Registry 對齊

✅ 所有 16 個 stage + 17 個 agent 100% 對齊 registry.js

---

## Skill 審計

### 分類統計

- 18 個 workflow skill（對應 18 個 workflow 模板）
- 12 個特化 skill（工具、輔助、管理）
- 全部 30 個，無孤立、無冗餘

### Frontmatter 問題

| Skill | 問題 |
|-------|------|
| `pm` | 缺少 `disable-model-invocation: true` |
| `mul-dev` | 缺少 `disable-model-invocation: true` |
| `design` | `disable-model-invocation: false`（正確 — 支援直接呼叫） |
| `evolve` | `disable-model-invocation: false`（正確 — 支援直接呼叫） |

### References 分配

| Skill | References 數 | 說明 |
|-------|:----:|------|
| auto | 6 | 工作流選擇、並行、失敗、BDD、Test Scope、Handoff |
| pm | 5 | Discovery、Options、反模式、Brief、Drift |
| test | 2 | BDD 方法論、範例 |
| security/clean/db-review/verify/specs/evolve | 各 1 | 專域參考 |
| 其餘 18 個 | 0 | 自包含 |

---

## Hooks 審計

### 6 個 Hook 概覽

| Hook | 事件 | 行數 | 核心職責 | 健全度 |
|------|------|:----:|---------|:------:|
| on-start.js | SessionStart | 146 | Banner + 初始化 + Dashboard spawn | ⭐⭐⭐⭐⭐ |
| on-submit.js | UserPromptSubmit | 109 | systemMessage 注入（/ot:auto） | ⭐⭐⭐⭐⭐ |
| pre-task.js | PreToolUse(Task) | 173 | 阻擋跳過 stage + agent 辨識 | ⭐⭐⭐⭐ |
| on-stop.js | SubagentStop | 410 | 結果解析 + state 更新 + 下一步提示 | ⭐⭐⭐⭐ |
| post-use.js | PostToolUse | 280 | Instinct 觀察 + wording 偵測 | ⭐⭐⭐⭐ |
| on-stop.js (Stop) | Stop | 183 | 完成度檢查 + Loop 迴圈 + 歸檔 | ⭐⭐⭐⭐ |

### 可用但未使用的 Hook 事件

| 事件 | 說明 | 建議 |
|------|------|------|
| TaskCompleted | task 完成前強制品質門檻 | Phase 0 評估 |
| PreCompact | context 壓縮前保存 workflow state | Phase 1 評估 |
| SessionEnd | session 結束時清理 + Dashboard 通知 | Phase 1 評估 |
| SubagentStart | subagent 啟動時 | 可用於更精確的 timeline 記錄 |
| PostToolUseFailure | tool 執行失敗 | 可增強錯誤觀察 |

---

## Scripts/Lib 審計

### 核心模組

| 模組 | 行數 | 職責 | 健全度 |
|------|:----:|------|:------:|
| registry.js | 226 | SoT — 所有映射定義 | ⭐⭐⭐⭐⭐ |
| state.js | 218 | workflow.json CAS 原子讀寫 | ⭐⭐⭐⭐ |
| specs.js | 420 | Feature 目錄生命周期 | ⭐⭐⭐⭐ |
| instinct.js | 328 | 觀察學習系統 | ⭐⭐⭐ |
| timeline.js | 171 | JSONL 事件記錄 + pass@k | ⭐⭐⭐ |
| loop.js | 111 | Loop 狀態 + tasks.md 解析 | ⭐⭐⭐⭐ |
| paths.js | 83 | 統一路徑解析 | ⭐⭐⭐⭐⭐ |
| utils.js | 64 | atomicWrite + escapeHtml | ⭐⭐⭐⭐⭐ |

### Dashboard/Remote 模組

| 模組 | 行數 | 職責 | 健全度 |
|------|:----:|------|:------:|
| event-bus.js | 305 | 事件分發 + 控制命令 | ⭐⭐⭐⭐ |
| dashboard-adapter.js | 189 | SSE 推送 + HTTP API | ⭐⭐⭐⭐ |
| telegram-adapter.js | 401 | Telegram Bot 整合 | ⭐⭐⭐ |
| sessions.js | 82 | Session 列表管理 | ⭐⭐⭐⭐ |
| pid.js | 73 | Dashboard 程序管理 | ⭐⭐⭐⭐ |
| adapter.js | 61 | Remote Adapter 基類 | ⭐⭐⭐⭐ |

---

## Claude Code 新功能對照

### Overtone 可採用的新功能

| 功能 | 影響 | 建議 Phase |
|------|------|:---:|
| `hookSpecificOutput`（PreToolUse 新 API） | 修復 deprecated 問題 | Phase 0 |
| `SessionEnd` hook | session 清理 + Dashboard 通知 | Phase 1 |
| `PreCompact` hook | 保存 workflow state | Phase 1 |
| `TaskCompleted` hook | stage 完成前品質門檻 | Phase 0 |
| Agent `memory` 欄位 | 跨 session 知識累積（可能取代 Instinct） | Phase 2 |
| Agent `isolation: worktree` | 並行 dev 隔離環境 | Phase 3 |
| Agent `background` 模式 | 長時間任務背景執行 | Phase 2 |
| Skill `context: fork` | 大型任務隔離執行 | Phase 1 |
| Skill `` !`command` `` 動態注入 | SKILL.md 中注入 workflow state | Phase 1 |
| Agent Teams（實驗性） | 原生多 agent 並行 | Phase 3 |

### 已知限制（影響 Overtone）

- Subagent 不能嵌套（不能再產生 subagent）
- Hook 在 session 啟動時快照，中途修改不即時生效
- Skill descriptions 預載佔 context 的 2%（30 個 skill 可能影響）
- Plugin 安裝後不能引用目錄外檔案（需 symlink）

---

## 分工建議

| 文件類型 | 負責 agent |
|---------|-----------|
| `docs/product-brief.md` | PM agent 草擬 → 使用者確認 |
| `docs/product-roadmap.md` | PM agent 更新 → 使用者確認 |
| `docs/status.md` | doc-updater agent |
| `docs/spec/*.md` | doc-updater agent（技術規格同步） |
| `README.md` | PM agent 定方向 → doc-updater 撰寫 |

---

## Phase 0 待辦清單

根據體檢結果和 product-roadmap.md，Phase 0 應包含：

### 穩定性驗證
- [ ] single workflow 跑 10 次真實任務
- [ ] quick workflow 跑 10 次真實任務
- [ ] standard workflow 跑 10 次真實任務
- [ ] 記錄每次成功率、路由準確性、人工介入次數

### 高優先修復
- [ ] pre-task.js 遷移到 hookSpecificOutput
- [ ] pm/SKILL.md 補 `disable-model-invocation: true`
- [ ] pre-task.js + on-stop.js activeAgents race condition 修復

### 中優先修復（Phase 0 期間順手做）
- [ ] qa.md maxTurns 25→35
- [ ] retrospective.md maxTurns 30→40
- [ ] mul-dev/SKILL.md 補 `disable-model-invocation: true`
- [ ] 規格文件數字同步

---

> 這份報告是 Overtone 的基線（baseline）。每次 Phase 完成時回顧此報告，確認問題是否已修復、新問題是否出現。
