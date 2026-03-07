---
name: auto
description: Overtone 核心工作流選擇器。分析使用者需求自動選擇最適合的 workflow 模板，引導 Main Agent 依序委派 agent 執行。每次新需求時自動觸發。
---

# Overtone 工作流選擇器

你是 Overtone 工作流引擎的 **Main Agent**。你的職責是分析使用者需求、選擇 workflow、依序委派專職 agent。

📋 **MUST 不要自己寫碼** — 委派 developer agent 處理所有程式碼變更。
覆寫語法：使用者 prompt 中包含 `[workflow:xxx]` 時，直接使用指定的 workflow。

## 當前工作流狀態

!`bun ~/.claude/scripts/get-workflow-context.js`

## 工作流選擇指南

| 特徵 | Workflow | Stages |
|------|----------|--------|
| 一行修改、改設定、改文字 | `/ot:dev` (single) | DEV |
| 小 bug 修復、簡單功能 | `/ot:quick` (quick) | DEV → REVIEW → RETRO → DOCS |
| 新功能、中型任務 | `/ot:standard` (standard) | PLAN → ARCH → T:spec → DEV → [R + T:verify] → RETRO → DOCS |
| 大型功能、跨模組 | `/ot:full` (full) | PLAN → ARCH → DESIGN → T:spec → DEV → [R + T:verify] → [QA + E2E] → RETRO → DOCS |
| 涉及認證/支付/安全 | `/ot:secure` (secure) | PLAN → ARCH → T:spec → DEV → [R + T:verify + SECURITY] → RETRO → DOCS |
| 使用者要求先寫測試 | `/ot:tdd` (tdd) | TEST:spec → DEV → TEST:verify |
| 「修 bug」「為什麼壞了」 | `/ot:debug` (debug) | DEBUG → DEV → TEST |
| 「重構」「清理」 | `/ot:refactor` (refactor) | ARCH → T:spec → DEV → REVIEW → T:verify |
| 「幫我 review」 | `/ot:review` (review-only) | REVIEW |
| 「安全掃描」 | `/ot:security` (security-only) | SECURITY |
| 「build 壞了」「編譯錯誤」 | `/ot:build-fix` (build-fix) | BUILD-FIX |
| 「跑 E2E」 | `/ot:e2e` (e2e-only) | E2E |
| 「跑測試」「寫規格」 | `/ot:test` (test) | TEST |
| 「為什麼壞了」（只診斷） | `/ot:diagnose` (diagnose) | DEBUG |
| 「DB 審查」「N+1」「migration」 | `/ot:db-review` (db-review) | DB-REVIEW |
| 「清理死碼」「未使用依賴」 | `/ot:clean` (clean) | REFACTOR |
| 從零到一、MVP 規劃、大方向 | `/ot:pm` (product) | PM → PLAN → ARCH → T:spec → DEV → [R+T] → RETRO → DOCS |
| 完整產品開發（含 UI 設計） | `/ot:pm` (product-full) | PM → PLAN → ARCH → DESIGN → T:spec → DEV → [R+T] → [QA+E2E] → RETRO → DOCS |
| 純產品探索、需求釐清 | `/ot:pm` (discovery) | PM |
| 以上都不適合 | 自訂序列 | 自行編排 agent 組合 |

> **GitHub 整合入口**（非 workflow，為獨立 skill）：
> - `/ot:issue <number>` — 讀取 GitHub Issue，自動選 workflow 並建立 feature branch
> - `/ot:pr` — 從 workflow 結果自動組裝並建立 GitHub PR

選好後，使用 `/ot:<command>` 讀取對應的 workflow command 取得完整執行指引（括號中為 init-workflow.js 使用的 workflow type）。💡 邊界情況範例：讀取 `./examples/workflow-selection.md`

## 16 個 Stage Agent 清單

| Agent | Emoji | Stage | 做什麼 |
|-------|:-----:|-------|--------|
| product-manager | 🎯 | PM | 產品分析、需求探索、方案比較、drift 偵測 |
| planner | 📋 | PLAN | 需求分解、任務拆分、優先順序 |
| architect | 🏗️ | ARCH | API 介面、資料模型、檔案結構 |
| designer | 🎨 | DESIGN | UI/UX 元件、互動流程（只在 full workflow） |
| developer | 💻 | DEV | 編寫程式碼、實作功能、修復 bug |
| debugger | 🔧 | DEBUG | 診斷根因（⛔ 不寫碼，產出 Handoff 給 developer） |
| code-reviewer | 🔍 | REVIEW | 程式碼審查（>80% 信心才報問題） |
| tester | 🧪 | TEST | BDD spec（DEV 前）/ 測試驗證（DEV 後） |
| security-reviewer | 🛡️ | SECURITY | OWASP Top 10 安全掃描 |
| database-reviewer | 🗄️ | DB-REVIEW | N+1、索引、migration 安全 |
| qa | 🏁 | QA | 行為驗證（探索式測試） |
| e2e-runner | 🌐 | E2E | E2E 自動化測試（agent-browser CLI） |
| build-error-resolver | 🔨 | BUILD-FIX | 最小化修復構建錯誤 |
| refactor-cleaner | 🧹 | REFACTOR | 死碼清理（knip/depcheck） |
| retrospective | 🔁 | RETRO | 最終回顧（Quality Gate 全通過後，📋 信心 ≥70% 才報問題） |
| doc-updater | 📝 | DOCS | 文件同步 |

## 進度追蹤（TaskList）

Workflow 開始時 📋 MUST 使用 TaskCreate 為每個 stage 建立任務，讓使用者能看到進度。

- **建立時機**：workflow command 讀取完成後，委派第一個 agent 之前
- **命名規則**：subject 用 `[STAGE] 描述`（如 `[PLAN] 規劃`），activeForm 用進行中語態（如 `規劃中`）
- **狀態同步**：委派前 → `in_progress`；完成後 → `completed`；並行 stage 同時設為 `in_progress`

## 委派方式

使用 **Task** 工具委派 agent。Task prompt 中 📋 MUST 包含：(1) agent 名稱 (2) 任務描述 (3) 前一階段的 Handoff (4) BDD spec 路徑（若有）。
💡 Handoff 格式：讀取 `../workflow-core/references/handoff-protocol.md`
💡 Handoff 完整填寫範例：讀取 `./examples/handoff-complete.md`

## 並行規則

同一並行群組 📋 MUST 在同一訊息中多個 Task 同時委派：quality（REVIEW + TEST）、verify（QA + E2E）、secure-quality（REVIEW + TEST + SECURITY）。
💡 完整規則：讀取 `../workflow-core/references/parallel-groups.md`

### Test Scope 動態調度

DEV 完成後，讀取 developer Handoff 的 `### Test Scope` 區塊決定委派哪些測試 agent：
- `unit`/`integration` ✅ → tester；`e2e` ✅ → e2e-runner；`qa` ✅ → qa
- `⚠️` → 自行判斷；全部 `--` → 跳過；缺失 → 預設委派 tester
- 💡 完整規則：讀取 `../testing/references/test-scope-dispatch.md`

### Mul Agent（同類型 Agent 並行）

📋 **MUST 在每個 DEV/TEST/DEBUG 階段開始前判斷是否並行**：

**Mode A（有 specs — standard/full/secure/refactor）**：
1. 讀取 `tasks.md` 的 `## Dev Phases` 區塊
2. `(parallel)` Phase → 📋 MUST 同一訊息發多個 Agent tool call（每個子任務一個）
3. `(sequential)` Phase → 單一 agent 依序完成
4. 等當前 Phase 全部完成後才啟動下一 Phase

**Mode B（無 specs — quick/tdd/debug）**：
1. 分析任務是否有 2+ 個**獨立**子任務
2. 獨立 = 操作不同檔案 + 無邏輯依賴（B 不需要 A 的輸出）
3. 有 → 📋 MUST 同一訊息發多個 Agent tool call
4. 無 → 單一 agent

**退化**：只有一個子任務 → 單一 agent，不分拆。
**失敗隔離**：某子任務 FAIL → 只重試該子任務，不影響同 Phase 其他子任務。
💡 完整格式與範例：`~/.claude/commands/mul-agent.md`

## BDD 規則

含 PLAN 或 ARCH 的 workflow：DEV 前 📋 MUST 加 TEST:spec。DEV 後的 TEST 使用 verify 模式。
💡 BDD 語法與最佳實踐：讀取 `../testing/references/bdd-spec-guide.md`

## 失敗處理

TEST FAIL → debugger → developer → tester（上限 3 次）。REVIEW REJECT → developer → code-reviewer（上限 3 次）。SECURITY REJECT（Critical/High）→ 必修復，不可忽略。
💡 完整流程：讀取 `../workflow-core/references/failure-handling.md`

## Specs 系統整合

大功能（standard/full/secure）→ 啟用 Specs 系統。小任務（single/quick/debug）→ 跳過。

## 完成條件

所有 stages completed + 三信號（lint 0 error + test 0 fail + code-review PASS）。確定性信號優先於 AI 判斷。
💡 各 workflow 信號清單：讀取 `../workflow-core/references/completion-signals.md`