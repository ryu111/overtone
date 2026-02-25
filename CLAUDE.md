# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Overtone — 專案規則

## 專案定位

Overtone 是 Claude Code plugin，提供 BDD 驅動的工作流自動化 + 即時監控 + 遠端控制。
核心哲學：**Hook 做記錄和守衛，Skill 做指引，Main Agent 做決策**。

## 設計原則

1. **平台優先**：並行、同步、錯誤隔離交給 ECC 原生能力
2. **狀態最小化**：只記必要的 — 誰做了什麼、結果是什麼
3. **BDD 驅動**：先定義行為（GIVEN/WHEN/THEN）再寫碼
4. **Loop 預設**：任務完成自動繼續下一個
5. **Agent 專職**：14 個 agent 各司其職，Handoff 檔案傳遞 context

## 三層架構

```
Layer 0: Loop（外圈）— Stop hook 截獲退出 → 檢查 checkbox → 自動繼續
Layer 1: Skill 引導（內圈）— Hook → /ot:auto → Workflow Skill → 委派
Layer 2: Hook 守衛（底層）— 記錄、擋、提示、通知
```

## Agent 配置（14 個）

| 色彩 | Agent | Model | 功能 |
|:----:|-------|:-----:|:----:|
| purple | planner | opus | 規劃 |
| cyan | architect | opus | 架構 |
| cyan | designer | sonnet | UI/UX |
| yellow | developer | sonnet | 開發 |
| orange | debugger | sonnet | 診斷（不寫碼） |
| blue | code-reviewer | opus | 審查（>80% 信心） |
| red | security-reviewer | opus | 安全 |
| red | database-reviewer | sonnet | DB 審查 |
| pink | tester (BDD) | sonnet | BDD spec + 測試 |
| yellow | qa | sonnet | 行為驗證 |
| green | e2e-runner | sonnet | E2E |
| orange | build-error-resolver | sonnet | 修構建 |
| blue | refactor-cleaner | sonnet | 死碼清理 |
| purple | doc-updater | haiku | 文件 |

所有 agent 使用 `bypassPermissions`。

## 工作流模板（15 個）

```
BDD 規則：含 PLAN/ARCH 的 workflow 在 DEV 前加 TEST:spec

single:     DEV
quick:      DEV → [REVIEW + TEST]
standard:   PLAN → ARCH → TEST:spec → DEV → [REVIEW + TEST:verify] → DOCS
full:       PLAN → ARCH → DESIGN → TEST:spec → DEV → [R+T:verify] → [QA+E2E] → DOCS
secure:     PLAN → ARCH → TEST:spec → DEV → [R+T:verify+SECURITY] → DOCS
tdd:        TEST:spec → DEV → TEST:verify
debug:      DEBUG → DEV → TEST
refactor:   ARCH → TEST:spec → DEV → REVIEW → TEST:verify
review-only / security-only / build-fix / e2e-only
diagnose:   DEBUG
clean:      REFACTOR
db-review:  DB-REVIEW
```

## 技術棧

| 模組 | 技術 |
|------|------|
| Runtime | Bun |
| Dashboard | Bun HTTP + htmx + Alpine.js (SSE) |
| Remote | EventBus + Adapter（V1: Dashboard + Telegram） |
| State | workflow.json + timeline.jsonl (JSONL append-only) |
| Spec | OpenSpec（可選，大功能自動啟用） |

## 目錄結構

```
plugins/overtone/                # Plugin 根目錄
├── .claude-plugin/              # Plugin manifest（plugin.json）
├── agents/                      # 14 個 agent .md 檔
├── skills/                      # 27 個 Skill 定義
├── hooks/                       # hooks.json + scripts/
├── scripts/lib/                 # 共用程式庫
│   ├── registry.js              # SoT：stages/agents/workflows/events
│   ├── paths.js                 # 路徑解析
│   ├── state.js                 # workflow.json 讀寫（CAS 原子更新）
│   ├── timeline.js              # 事件記錄
│   ├── loop.js                  # Loop 狀態
│   ├── instinct.js              # Instinct 觀察與信心
│   ├── utils.js                 # 共用工具（atomicWrite、escapeHtml）
│   ├── dashboard/               # Dashboard 程序管理
│   └── remote/                  # EventBus + Adapter（Dashboard、Telegram）
├── web/                         # Dashboard 前端（htmx + Alpine.js）
├── tests/                       # 6 個測試檔（bun test）
├── docs/
│   ├── workflow.md              # 完整設計文件（55 個決策）
│   └── reference/               # ECC 分析參考文件
└── package.json                 # Bun 專案設定
```

## State 路徑

```
~/.overtone/sessions/{sessionId}/
├── workflow.json         # 工作流狀態
├── timeline.jsonl        # 事件記錄（18 種）
├── handoffs/             # Handoff 檔案
├── loop.json             # Loop 狀態
└── observations.jsonl    # Instinct 觀察
```

## Hook 架構（6 個，~930 行）

| 事件 | 職責 |
|------|------|
| SessionStart | Banner + 初始化 + Dashboard spawn |
| UserPromptSubmit | systemMessage → /ot:auto |
| PreToolUse(Task) | 擋跳過必要階段 |
| SubagentStop | 記錄結果 + 提示下一步 + 寫 state + emit timeline |
| PostToolUse | Instinct 觀察收集 |
| Stop | Loop 迴圈 + 完成度 + Dashboard 通知 |

## 常用指令

```bash
# 啟動 Dashboard 監控面板（port 7777）
bun scripts/server.js

# 驗證所有 14 個 agent 設定是否完整
bun scripts/validate-agents.js

# 手動停止 Loop（需提供 sessionId）
bun scripts/stop-loop.js {sessionId}

# 初始化 workflow state（測試用）
bun scripts/init-workflow.js {workflowType} {sessionId}
# workflowType 可選：single / quick / standard / full / secure / tdd / debug / refactor / review-only / security-only / build-fix / e2e-only / diagnose / clean / db-review
```

## 開發規範

- 所有回覆使用**繁體中文**
- 不確定時詢問，不猜測
- 功能需驗證測試
- commit 涉及 plugin 變更時更新 plugin.json version
- **Agent prompt 四模式**：信心過濾 + 邊界清單(DO/DON'T) + 誤判防護 + 停止條件
- **registry.js 是 Single Source of Truth**：所有 agent/stage/workflow/event 映射從此 import
- **Handoff 檔案格式**：Context → Findings → Files Modified → Open Questions

## 關鍵文件

| 文件 | 用途 |
|------|------|
| `docs/workflow.md` | 完整設計文件（v0.3，55 個決策） |
| `scripts/lib/registry.js` | SoT — 所有映射定義 |
| `docs/reference/ecc-*.md` | ECC 架構分析（4 份參考） |
