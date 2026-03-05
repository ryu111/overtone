# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Overtone — 專案規則

## 專案定位

Overtone 是 Claude Code plugin，提供 BDD 驅動的工作流自動化 + 即時監控 + 遠端控制。
核心哲學：**Hook 做記錄和守衛，Skill 做知識注入，Command 做操作指引，Main Agent 做決策**。

## 設計原則

1. **平台優先**：並行、同步、錯誤隔離交給 ECC 原生能力
2. **狀態最小化**：只記必要的 — 誰做了什麼、結果是什麼
3. **BDD 驅動**：先定義行為（GIVEN/WHEN/THEN）再寫碼
4. **Loop 預設**：任務完成自動繼續下一個
5. **Agent 專職**：18 個 agent 各司其職，Handoff 檔案傳遞 context

> 完整製作規範（完全閉環、自動修復、補全能力）見 `docs/spec/overtone-製作規範.md`

## 並行委派

委派 subagent 前，📋 MUST 評估任務內容是否包含可獨立完成的子任務：
- **可拆分**（操作不同檔案 + 無邏輯依賴）→ 同一訊息委派多個同類型 subagent
- **不可拆分**（修改同檔案 / B 需要 A 的輸出）→ 單一 subagent 或依序委派

## 三層架構

```
Layer 0: Loop（外圈）— Stop hook 截獲退出 → 檢查 checkbox → 自動繼續
Layer 1: Skill 引導（內圈）— Hook → /ot:auto → Workflow Skill → 委派
Layer 2: Hook 守衛（底層）— 記錄、擋、提示、通知
```

## Agent 配置

18 個 agent（含 grader），全部使用 `bypassPermissions`。Model 分配：opus（決策型）、sonnet（執行型）、haiku（輕量型）。
> 完整清單與色彩標記：`docs/spec/overtone-agents.md`

## 工作流模板

18 個模板。BDD 規則：含 PLAN/ARCH 的 workflow 在 DEV 前加 TEST:spec。
常用：`single`（DEV）、`quick`（DEV → REVIEW → RETRO → DOCS）、`standard`（PLAN → ARCH → TEST:spec → DEV → [R+T] → RETRO → DOCS）。
> 完整清單：`docs/spec/overtone-工作流.md`

## 技術棧

| 模組 | 技術 |
|------|------|
| Runtime | Bun |
| Dashboard | Bun HTTP + htmx + Alpine.js (SSE) |
| Remote | EventBus + Adapter（V1: Dashboard + Telegram） |
| State | workflow.json + timeline.jsonl (JSONL append-only) |
| Spec | Specs 系統（可選，大功能自動啟用） |

## 目錄結構

```
tests/              # 測試（unit / integration / e2e / helpers）⚠️ 不在 plugin 下
docs/               # 文件（spec / reference / archive / status.md）⚠️ 不在 plugin 下
plugins/overtone/   # Plugin 根目錄
├── agents/         # 18 個 agent .md（WHO — 角色）
├── skills/         # 24 個 Skill（WHAT — 知識域 + orchestrator + utilities-with-refs + instinct）
│   # 15 knowledge domains: testing, workflow-core, security-kb, database, dead-code, commit-convention, code-review, wording, debugging, architecture, build-system, os-control, autonomous-control, craft, claude-dev
├── commands/       # 28 個 Command（DO — stage shortcuts + workflow pipelines + utilities）
├── hooks/          # hooks.json + scripts/（HOW — 守衛）
├── scripts/lib/    # 共用庫（64 個模組：registry, state, timeline, specs, config-api, hook-timing, feature-sync, specs-archive-scanner, statusline-state, 9x handler + analyzers/ + knowledge/ + remote/ + dashboard/ 子目錄）
└── web/            # Dashboard 前端

# Session 狀態：~/.overtone/sessions/{sessionId}/
#   workflow.json / timeline.jsonl / loop.json / observations.jsonl / compact-count.json / statusline-state.json
```

## Hook 架構（11 個，薄殼化 + Handler 模組）

**薄殼化架構**（v0.28.49）：
- Hook 本體（hooks/scripts/）：初始化 + handler 調用 + 錯誤處理（~29 行標準）
- 業務邏輯：scripts/lib/ 內 9 個 handler 模組（session-start-handler 等）
- 共用工廠：specs-archive-scanner、hook-timing、feature-sync

⚠️ **hooks.json 必須使用官方三層嵌套格式**（三層嵌套）。扁平陣列格式會導致部分 hook 無法觸發。
> 詳細格式規範 + updatedInput REPLACE 語意：`plugins/overtone/skills/claude-dev/references/hooks-api.md`

| 事件 | 職責 |
|------|------|
| SessionStart | Banner + 初始化 + Dashboard spawn + systemMessage 動態注入（plugin context + 待完成任務 + 跨 session 知識 + 效能基線 + 品質評分 + 失敗模式 + 執行佇列） |
| SessionEnd | Session 結束收尾 + 狀態清理 |
| PreCompact | context 壓縮前注入工作流狀態恢復訊息 |
| UserPromptSubmit | systemMessage → /ot:auto |
| PreToolUse(Task) | subagent_type 確定性映射 + 擋跳過必要階段 + 衝突警告 + updatedInput 注入 workflow context + skill context + gap warnings |
| PreToolUse(Write/Edit) | 元件檔案保護 — 阻擋直接編輯 agents/*.md、hooks.json、skills/*/SKILL.md、registry-data.json、plugin.json，強制使用 manage-component.js |
| SubagentStop | 記錄結果 + 提示下一步 + 寫 state + emit timeline + featureName auto-sync + tasks.md 勾選 + 知識歸檔（PASS 時） |
| PostToolUse | Instinct 觀察收集 + .md 措詞偵測（emoji-關鍵詞不匹配警告） |
| TaskCompleted | Task 完成事件處理 + hook:timing 計時（bun test 已移至 DEV agent 停止條件） |
| PostToolUseFailure | Tool 執行失敗事件處理 |
| Stop | Loop 迴圈 + 完成度 + Dashboard 通知 |
| Notification | 音效通知（AskUserQuestion → Glass 提示音） |

## Status Line（settings.json 配置，非 Hook）

`plugins/overtone/scripts/statusline.js` — CLI 底部即時顯示。狀態由 `statusline-state.json` 管理，支援三態：
- **有 active agent**：雙行顯示（agent + 中文模式 / ctx% + compact 計數）
- **Main 控制**：單行 Main 標籤
- **idle / 無狀態**：單行簡潔（ctx% + 檔案大小）

TTL 機制：idle 狀態持續 10 分鐘無更新自動過期。設定：SessionStart hook 自動寫入 `~/.claude/statusline.sh` wrapper + `settings.json`。

## 常用指令

```bash
# 執行所有測試（多進程並行，~14s）
bun scripts/test-parallel.js

# 執行所有測試（單進程，~53s）
bun test

# 啟動 Dashboard 監控面板（port 7777）
bun scripts/server.js

# 系統健康檢查（19 項偵測）— checkPhantomEvents/checkDeadExports/checkDocCodeDrift/checkUnusedPaths/checkDuplicateLogic/checkPlatformDrift/checkDocStaleness/checkOsTools/checkComponentChain/checkDataQuality/checkQualityTrends/checkTestGrowth/checkClosedLoop/checkRecoveryStrategy/checkCompletionGap/checkDependencySync/checkInternalizationIndex/checkTestFileAlignment/checkSkillReferenceIntegrity
bun scripts/health-check.js

# 驗證所有元件設定（18 agents + 11 hooks + 24 skills + 28 commands）— agents/skills/hooks/commands 結構校驗
bun scripts/validate-agents.js

# 元件管理（建立/更新 agent、hook、skill + 版本更新）
bun scripts/manage-component.js create agent '{"name":"...","model":"sonnet",...}'
bun scripts/manage-component.js update agent developer '{"model":"opus"}'
bun scripts/manage-component.js bump-version          # patch +1
bun scripts/manage-component.js bump-version 1.0.0    # 指定版本
bun scripts/manage-component.js --help  # 查看完整用法

# 心跳引擎管理（自主控制佇列）
bun scripts/heartbeat.js start [--project-root <path>]  # 啟動常駐 daemon
bun scripts/heartbeat.js stop                            # 停止 daemon
bun scripts/heartbeat.js status                          # 查看狀態

# 進化引擎（gap detection / 自動修復 / skill forge / 內化飛輪）
bun scripts/evolution.js --help                      # 顯示所有子命令說明（exit 0）
bun scripts/evolution.js status                      # 快速顯示系統進化狀態（gap 摘要 + internalize + experience index）
bun scripts/evolution.js status --json               # JSON 格式輸出狀態
bun scripts/evolution.js analyze                     # 執行 gap 分析，輸出純文字報告
bun scripts/evolution.js analyze --json              # JSON 格式報告（供程式消費）
bun scripts/evolution.js fix                         # 自動修復可修復缺口（預設 dry-run）
bun scripts/evolution.js fix --execute               # 執行修復（真實更新檔案）
bun scripts/evolution.js fix --type <type>           # 只修復特定 gap 類型（sync-mismatch / no-references）
bun scripts/evolution.js fix --json                  # JSON 格式輸出（供程式消費）
bun scripts/evolution.js forge <domain>              # 預覽 Skill Forge 結果（dry-run，從 codebase 中萃取知識）
bun scripts/evolution.js forge <domain> --execute    # 實際執行 forge，建立 skill（包含 SKILL.md + references/）
bun scripts/evolution.js forge <domain> --json       # JSON 格式輸出 forge 結果
bun scripts/evolution.js forge <domain> --research   # 啟用外部 WebSearch 研究補充知識
bun scripts/evolution.js orchestrate <specPath>      # 預覽 Project Orchestrator 分析結果（dry-run）
bun scripts/evolution.js orchestrate <specPath> --execute     # 執行協調，建立排程 + 佇列項目
bun scripts/evolution.js orchestrate <specPath> --json        # JSON 格式輸出分析結果
bun scripts/evolution.js orchestrate <specPath> --overwrite   # 覆寫既有佇列
bun scripts/evolution.js orchestrate <specPath> --workflow <template>  # 指定 workflow 模板
bun scripts/evolution.js internalize                 # 評估 auto-discovered.md 並預覽內化結果（dry-run）
bun scripts/evolution.js internalize --execute       # 實際寫入 internalized.md + 更新 experience-index
bun scripts/evolution.js internalize --json          # JSON 格式輸出內化結果

# 依賴圖與一致性
bun scripts/impact.js <path>                         # 查詢修改此檔案會影響哪些元件
bun scripts/impact.js <path> --deps                  # 查詢此檔案依賴哪些元件
bun scripts/impact.js <path> --json                  # JSON 格式輸出
bun scripts/fix-consistency.js                       # 偵測 SKILL.md ↔ agent frontmatter 不一致（dry-run）
bun scripts/fix-consistency.js --fix                 # 自動修復消費者表缺漏

# 資料查詢與管理（timeline/failures/scores/observations/baselines）
bun scripts/data.js query timeline --session <id>   # 查詢 timeline 事件
bun scripts/data.js query failures --stage DEV       # 查詢失敗模式
bun scripts/data.js stats --global                   # 全域統計摘要
bun scripts/data.js gc --dry-run                     # 預覽全域目錄清理
bun scripts/data.js recent --limit 5                 # 列出最近 session

# 執行佇列管理
bun scripts/queue.js add <name> <workflow> [...]         # 新增項目（覆寫現有）
bun scripts/queue.js append <name> <workflow> [...]     # 累加到現有佇列
bun scripts/queue.js list                               # 列出佇列狀態
bun scripts/queue.js enable-auto                        # 啟用自動執行（規劃模式 → 執行模式）
bun scripts/queue.js clear                              # 清除佇列
# Flag: --no-auto（規劃模式）、--source <desc>（來源描述）、--project-root <path>

# 手動停止 Loop（需提供 sessionId）
bun scripts/stop-loop.js {sessionId}

# 初始化 workflow state（測試用）
bun scripts/init-workflow.js {workflowType} [{sessionId}]
```

## 開發規範

- **文件位置**：Overtone 所有設計文件、研究文件寫在 `docs/`（專案根目錄），⚠️ 不要寫在 `plugins/overtone/` 下
- 所有回覆使用**繁體中文**
- 不確定時詢問，不猜測
- 功能需驗證測試
- commit 涉及 plugin 變更時更新 plugin.json version
- **Agent prompt 四模式**：信心過濾 + 邊界清單(DO/DON'T) + 誤判防護 + 停止條件
  > 撰寫規範詳見 `plugins/overtone/skills/claude-dev/references/agent-api.md`
- **registry.js 是 Single Source of Truth**：所有 agent/stage/workflow/event 映射從此 import
- **Handoff 檔案格式**：Context → Findings → Files Modified → Open Questions
  > 欄位規範 + Chaining 規則詳見 `plugins/overtone/skills/workflow-core/references/handoff-protocol.md`
- **不做向後相容**：舊 API / 舊欄位 / 舊函式直接改成新的，不保留舊版本；改完必須維持系統正常運作；沒有任何地方用到的程式碼直接刪除並在 commit message 標記（`[刪除未使用]`）
- **元件閉環**：新增/修改 Skill、Agent、Hook 時，必須檢查三者依賴（Skill → Agent 消費 → Hook 注入 → Guard 保護）
  > 閉環完整規則 + manage-component.js 用法詳見 `plugins/overtone/skills/claude-dev/references/overtone-conventions.md`

## 關鍵文件

| 文件 | 用途 |
|------|------|
| `docs/spec/overtone.md` | 完整規格索引（v0.6，55 個決策） |
| `docs/spec/overtone-decision-points.md` | 控制流決策點快查（30 秒找到任意決策點） |
| `docs/status.md` | 現況快讀（版本狀態、核心指標、近期變更） |
| `scripts/lib/registry.js` | SoT — 所有映射定義 |
| `plugins/overtone/skills/wording/references/wording-guide.md` | 措詞正確性指南（決策樹 + 反模式 + 場景範例） |
