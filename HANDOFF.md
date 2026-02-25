# Overtone 實作交接文件

> 交接時間：2026-02-23
> 來源：Vibe 專案 design session（9 面向 55 個決策）

## 背景

Overtone 是 Vibe（Claude Code marketplace plugin）的進化版。Vibe 的 pipeline 系統過度工程化（15,000 行 hook 做了 ECC 本來就會做的事），Overtone 從零設計，保留 Vibe 的差異化功能（Dashboard、Remote、Timeline），簡化核心工作流。目前 scripts + hooks 約 3,700 行，全專案（含 agents/skills/web/tests）約 9,900 行。

### 借鏡的專案

| 專案 | 學到什麼 |
|------|---------|
| **Vibe** (本人前作) | Dashboard、Timeline、Remote 五軸、Agent prompt、OpenSpec |
| **claude-workflow (wk)** | Loop 模式（Stop hook 截獲退出）、並行（同一訊息多 Task）、DEBUGGER 診斷流 |
| **everything-claude-code (ECC)** | 13 個 agent 設計、Instinct 學習系統、Verification Loop、pass@k、prompt 四模式 |

## 已完成

| 項目 | 狀態 | 說明 |
|------|:----:|------|
| 設計文件 | ✅ | `docs/workflow.md` v0.3（55 個決策） |
| registry.js | ✅ | 14 stages、15 workflows、agentModels、timelineEvents、remoteCommands、instinctDefaults |
| CLAUDE.md | ✅ | 專案規則文件 |
| Plugin manifest | ✅ | plugin.json + marketplace.json |
| ECC 參考文件 | ✅ | 4 份分析文件在 docs/reference/ |
| 目錄骨架 | ✅ | agents/、skills/、hooks/、scripts/、web/、docs/ |
| Phase 1 | ✅ | 核心 lib（paths/state/timeline/registry）+ 5 hook |
| Phase 2 | ✅ | 14 agent .md prompt 檔案 |
| Phase 3 | ✅ | 27 skill SKILL.md + helper scripts |
| Phase 4 | ✅ | Dashboard（Bun HTTP + SSE + htmx + Alpine.js） |
| Phase 5 | ✅ | Remote（EventBus + DashboardAdapter + TelegramAdapter） |
| Phase 6 | ✅ | Instinct（instinct.js + PostToolUse hook）|
| Phase 7 | ✅ | Loop 模式（loop.js + tasks.md checkbox）|
| Phase 8 | ✅ | 補齊 4 個 agent skill + 清理 2 個廢棄空目錄 |
| Phase 9 | ✅ | Agent frontmatter 補齊 + 4 個新 Skill 消除孤立 agent |
| Phase 10 | ✅ | Skill 三層載入優化（16 個 references/examples + 14 個 SKILL.md 瘦身）|
| Phase 11 | ✅ | v0.10.0 全面優化 — 安全修復 + 結構優化 + 測試覆蓋（6 個測試檔、81 tests）|
| Phase 12 | ✅ | v0.11.0 審計修復 — CAS 原子更新 + CORS + 閉包 + 防抖 + 白名單（84 tests）|

## 設計規格記錄（存檔）

> 以下為原始設計規格，所有 Phase 均已實作完成（Phase 1-12）。
> 保留此區塊作為設計決策的歷史參考，實際實作可能有所調整。
> 權威來源：程式碼本身 + `docs/workflow.md`

<details>
<summary>Phase 1-7 原始設計規格（點擊展開）</summary>

### Phase 1：核心基礎設施

| 優先 | 項目 | 說明 |
|:----:|------|------|
| P0 | `scripts/lib/paths.js` | 統一路徑解析（~/.overtone/sessions/{id}/） |
| P0 | `scripts/lib/state.js` | workflow.json 讀寫（含 CAS 原子更新） |
| P0 | `scripts/lib/timeline.js` | JSONL emit/query |
| P0 | `hooks/hooks.json` | 6 個 hook 事件 |
| P0 | `hooks/scripts/prompt/on-submit.js` | UserPromptSubmit → systemMessage 指向 /ot:auto |
| P0 | `hooks/scripts/agent/on-stop.js` | SubagentStop: 記錄 + 提示 + 寫 state |
| P0 | `hooks/scripts/session/on-start.js` | 初始化 + Dashboard spawn |
| P0 | `hooks/scripts/tool/pre-task.js` | PreToolUse(Task): 擋跳過必要階段 |
| P0 | `hooks/scripts/session/on-stop.js` | Stop: Loop + 完成度 + Dashboard |

### Phase 2：Agent 檔案（14 個）

每個 agent .md 包含：frontmatter（model、color、permissionMode）、角色定義、邊界清單(DO/DON'T)、輸出格式、停止條件、工具列表。

### Phase 3：核心 Skills（27 個）

`/ot:auto`（核心選擇器）、`/ot:verify`（驗證）、各 workflow skill、`/ot:stop`、`/ot:dashboard`、`/ot:evolve` 等。

### Phase 4：Dashboard

`scripts/server.js`（Bun HTTP + SSE）、`web/index.html`（htmx + Alpine.js）、Dashboard Adapter。

### Phase 5：Remote

EventBus + Adapter 架構（Dashboard + Telegram）。

### Phase 6：Instinct 系統

`instinct.js`（觀察收集 + 信心分數 + 衰減）、PostToolUse hook 自動收集。

### Phase 7：Loop 模式

`loop.js`（Loop state 管理）、Stop hook（tasks.md checkbox 檢查 + 重注入 prompt）。

</details>

## 關鍵設計決策摘要

### 工作流

- **觸發**：UserPromptSubmit hook → systemMessage 指向 /ot:auto → Main Agent 自選 workflow
- **BDD**：含 PLAN/ARCH 的 workflow 在 DEV 前加 TEST:spec（寫 BDD 行為規格）
- **失敗**：FAIL → DEBUGGER（診斷）→ DEVELOPER（修復）→ TESTER（驗證），3 次上限
- **並行**：同一訊息多 Task = ECC 原生並行，無硬上限，失敗隔離
- **Loop**：預設開啟，Stop hook 截獲退出 → 檢查 checkbox → 自動繼續

### Agent

- **通訊**：只用 Handoff 檔案（Context/Findings/Files/Questions）
- **Prompt 四模式**：信心過濾(>80%) + 邊界清單(DO/DON'T) + 誤判防護 + 停止條件
- **debugger** 不寫碼：只用 Read/Grep/Glob/Bash，產出 Handoff 給 developer
- **tester (BDD)**：兩種模式 — TEST:spec（寫規格）和 TEST:verify（跑測試）
- **refactor-cleaner**：knip/depcheck 自動化，⛔ 不可重構邏輯

### 品質

- **三信號**：lint + test + code-review，確定性信號優先於 AI 判斷
- **pass@k**：pass@1（首次成功率）、pass@3（三次內）、pass^3（連續三次）
- **Model Grader**：Haiku 快速評分開放式品質

### 技術

- **Dashboard**：Bun + htmx + Alpine.js（29KB、無構建步驟、SSE 即時）
- **Remote**：EventBus + Adapter 抽象化（Dashboard 也是 Adapter）
- **Timeline**：18 種事件、8 分類、JSONL append-only
- **Instinct**：0.3 初始 → +0.05/確認 → -0.10/矛盾 → -0.02/週衰減 → ≥0.7 自動應用

## 實作提醒

1. **registry.js 是 SoT**：所有映射從此 import，不要在其他地方重複定義
2. **Hook 腳本需要 chmod +x**：Write 工具建立 644，hook 需要 755
3. **Bun 優先**：Dashboard 用 Bun 跑，Node.js 會有 ESM 問題
4. **命令前綴 ot:**：所有命令/skill 使用 `ot:` 前綴避免撞名
5. **繁體中文**：所有回覆、註解、文件使用繁體中文
6. **先讀 docs/workflow.md**：完整設計文件，55 個決策的詳細說明
