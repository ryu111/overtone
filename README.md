# Overtone

> 有規範的 Claude Code Plugin — BDD 驅動工作流自動化 + 即時 Dashboard + 遠端控制

## 功能

- **BDD 驅動工作流**：15 種工作流模板，從 `single`（一鍵開發）到 `full`（完整 SDLC）
- **15 個專職 Agent**：planner、architect、developer、tester、code-reviewer、security-reviewer、retrospective 等各司其職
- **DEV 內部並行**：mul-dev skill 將 DEV 階段分解為多 Phase，支援子任務並行執行
- **即時 Dashboard**：Bun HTTP + htmx + Alpine.js，SSE 即時推送工作流狀態
- **遠端控制**：EventBus + Adapter 架構，支援 Dashboard UI 和 Telegram Bot
- **Instinct 學習**：PostToolUse hook 自動累積專案知識，信心分數驅動決策
- **Loop 模式**：Stop hook 截獲退出，自動讀取 tasks.md checkbox 繼續下一任務
- **零外部依賴**：只用 Bun 內建 API，無供應鏈風險

## 安裝

```bash
git clone <repo-url> ~/.claude/plugins/overtone
```

Claude Code 啟動時會自動載入 `~/.claude/plugins/` 下的 plugin。

## 快速開始

```bash
# 啟動 Dashboard 監控面板（port 7777）
bun plugins/overtone/scripts/server.js

# 驗證所有 15 個 agent 設定是否完整
bun plugins/overtone/scripts/validate-agents.js

# 執行測試（6 個測試檔，84 tests）
cd plugins/overtone && bun test
```

## 工作流模板

| 模板 | 階段 | 適合場景 |
|------|------|---------|
| `single` | DEV | 小改動、快速修復 |
| `quick` | DEV → [REVIEW + TEST] | 功能實作 |
| `standard` | PLAN → ARCH → TEST:spec → DEV → [REVIEW + TEST:verify] → DOCS | 標準開發 |
| `full` | PLAN → ARCH → DESIGN → TEST:spec → DEV → [R+T] → [QA+E2E] → DOCS | 完整 SDLC |
| `secure` | PLAN → ARCH → TEST:spec → DEV → [R+T+SECURITY] → DOCS | 安全敏感功能 |
| `tdd` | TEST:spec → DEV → TEST:verify | 測試驅動 |
| `debug` | DEBUG → DEV → TEST | 除錯 |
| `diagnose` | DEBUG | 只診斷不修碼 |
| `clean` | REFACTOR | 死碼清理 |
| `db-review` | DB-REVIEW | 資料庫審查 |

## 架構

```
三層架構：
  Layer 0: Loop（外圈）— Stop hook 截獲退出 → 讀 tasks.md checkbox → 自動繼續
  Layer 1: Skill 引導（內圈）— Hook → /ot:auto → Workflow Skill → 委派 Agent
  Layer 2: Hook 守衛（底層）— 記錄、攔截、提示、通知
```

## 技術棧

| 模組 | 技術 |
|------|------|
| Runtime | Bun（零外部依賴） |
| Dashboard | Bun HTTP + htmx + Alpine.js（SSE） |
| Remote | EventBus + Adapter（Dashboard + Telegram） |
| State | `workflow.json` + `timeline.jsonl`（JSONL append-only） |
| 測試 | bun test（84 tests） |

## 設定

| 環境變數 | 說明 | 預設值 |
|---------|------|--------|
| `OVERTONE_PORT` | Dashboard 埠號 | `7777` |
| `OT_CORS_ORIGIN` | CORS 允許來源 | `http://localhost:7777` |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot token | — |
| `TELEGRAM_CHAT_ID` | 白名單 chat ID | — |

## 文件

- [`CLAUDE.md`](CLAUDE.md) — 專案規則與設計原則
- [`HANDOFF.md`](HANDOFF.md) — 實作交接文件
- [`docs/workflow.md`](docs/workflow.md) — 完整設計文件（v0.5，並行機制 D1–D4 修復 + mul-dev 新增）
- [`docs/parallel-defects.md`](docs/parallel-defects.md) — 並行機制 4 項缺陷分析與修復
- [`docs/audit-report.md`](docs/audit-report.md) — v0.10.0 全面審計報告
