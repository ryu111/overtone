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
5. **Agent 專職**：17 個 agent 各司其職，Handoff 檔案傳遞 context

## 三層架構

```
Layer 0: Loop（外圈）— Stop hook 截獲退出 → 檢查 checkbox → 自動繼續
Layer 1: Skill 引導（內圈）— Hook → /ot:auto → Workflow Skill → 委派
Layer 2: Hook 守衛（底層）— 記錄、擋、提示、通知
```

## Agent 配置

17 個 agent（含 grader），全部使用 `bypassPermissions`。Model 分配：opus（決策型）、sonnet（執行型）、haiku（輕量型）。
> 完整清單與色彩標記：`docs/spec/overtone-agents.md`

## 工作流模板

18 個模板。BDD 規則：含 PLAN/ARCH 的 workflow 在 DEV 前加 TEST:spec。
常用：`single`（DEV）、`quick`（DEV → [REVIEW+TEST] → RETRO → DOCS）、`standard`（PLAN → ARCH → TEST:spec → DEV → [R+T] → RETRO → DOCS）。
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
├── agents/         # 17 個 agent .md
├── skills/         # 38 個 Skill 定義
├── hooks/          # hooks.json + scripts/
├── scripts/lib/    # 共用庫（registry, state, timeline, specs, config-api 等）
└── web/            # Dashboard 前端

# Session 狀態：~/.overtone/sessions/{sessionId}/
#   workflow.json / timeline.jsonl / loop.json / observations.jsonl
```

## Hook 架構（11 個，~1640 行 + config-api.js ~850 行）

| 事件 | 職責 |
|------|------|
| SessionStart | Banner + 初始化 + Dashboard spawn |
| SessionEnd | Session 結束收尾 + 狀態清理 |
| PreCompact | context 壓縮前注入工作流狀態恢復訊息 |
| UserPromptSubmit | systemMessage → /ot:auto |
| PreToolUse(Task) | subagent_type 確定性映射 + 擋跳過必要階段 + 衝突警告 + updatedInput 注入 workflow context |
| SubagentStop | 記錄結果 + 提示下一步 + 寫 state + emit timeline |
| PostToolUse | Instinct 觀察收集 + .md 措詞偵測（emoji-關鍵詞不匹配警告） |
| TaskCompleted | Task 完成前品質門檻硬阻擋（test pass + lint clean） |
| PostToolUseFailure | Tool 執行失敗事件處理 |
| Stop | Loop 迴圈 + 完成度 + Dashboard 通知 |

## 常用指令

```bash
# 執行所有測試（從專案根目錄）
bun test

# 啟動 Dashboard 監控面板（port 7777）
bun scripts/server.js

# 系統健康檢查（7 項偵測）
bun scripts/health-check.js

# 驗證所有 agent 設定是否完整
bun scripts/validate-agents.js

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
- **registry.js 是 Single Source of Truth**：所有 agent/stage/workflow/event 映射從此 import
- **Handoff 檔案格式**：Context → Findings → Files Modified → Open Questions
- **不做向後相容**：舊 API / 舊欄位 / 舊函式直接改成新的，不保留舊版本；改完必須維持系統正常運作；沒有任何地方用到的程式碼直接刪除並在 commit message 標記（`[刪除未使用]`）

## 關鍵文件

| 文件 | 用途 |
|------|------|
| `docs/spec/overtone.md` | 完整規格索引（v0.6，55 個決策） |
| `docs/status.md` | 現況快讀（版本狀態、核心指標、近期變更） |
| `scripts/lib/registry.js` | SoT — 所有映射定義 |
| `docs/reference/wording-guide.md` | 措詞正確性指南（決策樹 + 反模式 + 場景範例） |
