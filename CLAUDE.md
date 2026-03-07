# CLAUDE.md

# Overtone — 開發 Repo

**使命**：推進 `~/.claude/` 達到 Layer 1-4 能力，打造通用自主代理核心。

此 repo 提供 tests、docs、specs 支撐開發品質。實際的 agent、skill、hook、command、script 程式碼存放在 `~/.claude/`（唯一 SoT）。

當前進度：L1 ✅ L2 ✅ L3 🟡（L3.6 Acid Test 待執行）L4 ⬜

> Overtone 定位、架構概要、工作流觸發方式詳見全域 `~/.claude/CLAUDE.md`。

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
~/.claude/          # Plugin 根目錄（唯一 SoT）
├── agents/         # 18 個 agent .md（WHO — 角色）
├── skills/         # 24 個 Skill（WHAT — 知識域 + orchestrator + utilities-with-refs + instinct）
│   # 15 knowledge domains: testing, workflow-core, security-kb, database, dead-code, commit-convention, code-review, wording, debugging, architecture, build-system, os-control, autonomous-control, craft, claude-dev
├── commands/       # 29 個 Command（DO — stage shortcuts + 18 個模板 workflow pipelines + utilities）
├── hooks/          # hooks.json + scripts/（HOW — 守衛）
├── scripts/lib/    # 共用庫（67 個模組：registry, state, timeline, specs, config-api, hook-timing, feature-sync, fs-scanner, specs-archive-scanner, statusline-state, 9x handler + analyzers/ + knowledge/ + remote/ + dashboard/ 子目錄 + tts 相關）
└── web/            # Dashboard 前端

# Session 狀態：~/.overtone/sessions/{sessionId}/
#   workflow.json / timeline.jsonl / loop.json / observations.jsonl / compact-count.json / statusline-state.json
```

## Hook 架構（11 個）

⚠️ **hooks.json 必須使用官方三層嵌套格式**（三層嵌套）。扁平陣列格式會導致部分 hook 無法觸發。
> 詳細格式規範 + updatedInput REPLACE 語意：`~/.claude/skills/claude-dev/references/hooks-api.md`

**薄殼化架構**（v0.28.49）：
- Hook 本體（hooks/scripts/）：初始化 + handler 調用 + 錯誤處理（~29 行標準）
- 業務邏輯：scripts/lib/ 內 9 個 handler 模組（session-start-handler 等）

## 常用指令

```bash
# 執行所有測試（多進程並行，~21s）
bun scripts/test-parallel.js

# 執行所有測試（單進程，~53s）
bun test

# 啟動 Dashboard 監控面板（port 7777）
bun ~/.claude/scripts/server.js

# 系統健康檢查（24 項偵測）
bun ~/.claude/scripts/health-check.js

# 驗證所有元件設定（18 agents + 11 hooks + 24 skills + 29 commands）
bun ~/.claude/scripts/validate-agents.js

# 元件管理（建立/更新 agent、hook、skill + 版本更新）
bun ~/.claude/scripts/manage-component.js --help

# 心跳引擎管理（自主控制佇列）
bun ~/.claude/scripts/heartbeat.js status

# 進化引擎
bun ~/.claude/scripts/evolution.js --help
bun ~/.claude/scripts/evolution.js status
bun ~/.claude/scripts/evolution.js analyze

# 依賴圖與一致性
bun ~/.claude/scripts/impact.js <path>
bun ~/.claude/scripts/fix-consistency.js --fix

# 資料查詢
bun ~/.claude/scripts/data.js stats --global
bun ~/.claude/scripts/data.js recent --limit 5

# 執行佇列管理
bun ~/.claude/scripts/queue.js list
bun ~/.claude/scripts/queue.js add <name> <workflow> [...]

# 手動停止 Loop
bun ~/.claude/scripts/stop-loop.js {sessionId}

# 初始化 workflow state（測試用）
bun ~/.claude/scripts/init-workflow.js {workflowType} [{sessionId}]
```

## 開發規範

- **文件位置**：Overtone 所有設計文件、研究文件寫在 `docs/`（專案根目錄），⚠️ 不要寫在 `~/.claude/` 下
- 功能需驗證測試
- commit 涉及 plugin 變更時更新 plugin.json version
- **Agent prompt 四模式**：信心過濾 + 邊界清單(DO/DON'T) + 誤判防護 + 停止條件
  > 撰寫規範詳見 `~/.claude/skills/claude-dev/references/agent-api.md`
- **registry.js 是 Single Source of Truth**：所有 agent/stage/workflow/event 映射從此 import
- **Handoff 檔案格式**：Context → Findings → Files Modified → Open Questions
  > 欄位規範 + Chaining 規則詳見 `~/.claude/skills/workflow-core/references/handoff-protocol.md`
- **不做向後相容**：舊 API / 舊欄位 / 舊函式直接改成新的，不保留舊版本；改完必須維持系統正常運作；沒有任何地方用到的程式碼直接刪除並在 commit message 標記（`[刪除未使用]`）
- **元件閉環**：新增/修改 Skill、Agent、Hook 時，必須檢查三者依賴（Skill → Agent 消費 → Hook 注入 → Guard 保護）
  > 閉環完整規則 + manage-component.js 用法詳見 `~/.claude/skills/claude-dev/references/overtone-conventions.md`

## 關鍵文件

| 文件 | 用途 |
|------|------|
| `docs/spec/overtone.md` | 完整規格索引（v0.6，55 個決策） |
| `docs/spec/overtone-decision-points.md` | 控制流決策點快查（30 秒找到任意決策點） |
| `docs/status.md` | 現況快讀（版本狀態、核心指標、近期變更） |
| `~/.claude/scripts/lib/registry.js` | SoT — 所有映射定義 |
| `~/.claude/skills/wording/references/wording-guide.md` | 措詞正確性指南（決策樹 + 反模式 + 場景範例） |
