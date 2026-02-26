# Overtone Workflow 設計文件

> 版本：v0.6 | 狀態：Phase 1-12 完成 + 並行機制 D1–D4 修復 + mul-dev 新增 + mul-dev TaskList 同步，V1 剩餘見 Roadmap 章節

## 設計哲學

**一句話**：Hook 做記錄和守衛，Skill 做指引，Main Agent 做決策。

| 原則 | 說明 | 來源 |
|------|------|------|
| **平台優先** | 並行、同步、錯誤隔離交給 ECC 原生能力 | Vibe 教訓：自建 barrier/FIFO/slot = 500 行做 ECC 本來就會做的事 |
| **狀態最小化** | 只記必要的：誰做了什麼、結果是什麼 | Vibe 教訓：pipeline.json 過度追蹤 |
| **Hook 做守衛** | Hook 負責「擋」和「記錄」，不負責「協調」 | ECC + wk 驗證的模式 |
| **Skill 做指引** | 告訴 Main Agent 下一步做什麼，讓它自己決定怎麼做 | wk 的成功模式 |
| **Loop 預設** | 預設 loop 模式，任務完成自動繼續下一個 | wk ralph-loop |
| **BDD 驅動** | 先定義行為（BDD spec）再寫碼 | 面向 9 決策 |
| **Agent 專職** | 15 個專職 agent，各司其職 | ECC + Vibe 混合 |

---

## 架構概覽：三層模型

視覺化版本詳見 [workflow-diagram.md](workflow-diagram.md)。

```
Layer 0: Loop（外圈）
  └─ Stop hook 截獲退出 → 檢查 checkbox → 有未完成任務自動繼續
  └─ 退出條件：checkbox 全完成 / /ot:stop / max iterations

Layer 1: Skill 引導（內圈）
  └─ Hook systemMessage（⛔ MUST）→ 觸發 /ot:auto
  └─ /ot:auto（選擇器）→ Main Agent 判斷需求 → 選擇 Workflow Skill
  └─ Workflow Skill（具體指引）→ 委派規則 + agent 順序 + 禁止自己寫碼

Layer 2: Hook 守衛（底層）
  └─ SubagentStop: 記錄 agent 結果 + 提示下一步 + 寫 workflow.json
  └─ PreToolUse(Task): 擋跳過必要階段（不擋順序、不擋寫碼）
  └─ Stop: 完成度檢查 + Loop 迴圈 + Dashboard 通知
```

---

## 工作流啟動

### 觸發機制

| 方式 | 觸發 | 說明 |
|------|------|------|
| **自動** | UserPromptSubmit hook → systemMessage 指向 `/ot:auto` | 預設模式 |
| **手動** | 使用者輸入 `/ot:plan`、`/ot:tdd`、`/ot:review` 等 | 直接觸發特定工作流 |
| **覆寫** | `[workflow:xxx]` 語法在 prompt 中 | 跳過 /ot:auto 判斷 |

### /ot:auto 選擇器

Main Agent 讀取 `/ot:auto` Skill 內容後自行判斷最適合的工作流模板：
- **不需要 LLM classifier**
- **不需要使用者確認**，直接執行
- 沒有適合的預設模板時，Main Agent 自行編排 agent 序列

---

## 工作流模板（15 個）

### 基本模板（5 個）

| # | Key | 名稱 | Stages | 並行 |
|:-:|-----|------|--------|:----:|
| 1 | `single` | 單步修改 | DEV | - |
| 2 | `quick` | 快速開發 | DEV → [R+T] | R+T |
| 3 | `standard` | 標準功能 | PLAN → ARCH → T:spec → DEV → [R+T:verify] → RETRO → DOCS | R+T |
| 4 | `full` | 完整功能 | PLAN → ARCH → DESIGN → T:spec → DEV → [R+T:verify] → [QA+E2E] → RETRO → DOCS | 兩組 |
| 5 | `secure` | 高風險 | PLAN → ARCH → T:spec → DEV → [R+T:verify+S] → RETRO → DOCS | R+T+S |

> **BDD 規則**：所有含 PLAN/ARCH 的 workflow 在 DEV 前加入 TEST:spec（寫 BDD 行為規格）

### 特化模板（7 個，來自 ECC）

| # | Key | 名稱 | Stages | 用途 |
|:-:|-----|------|--------|------|
| 6 | `tdd` | 測試驅動 | TEST:spec → DEV → TEST:verify | BDD 先行 |
| 7 | `debug` | 除錯 | DEBUG → DEV → TEST | 先診斷再修復 |
| 8 | `refactor` | 重構 | ARCH → TEST:spec → DEV → [R+T:verify] | 先設計再重構，R+T 並行 |
| 9 | `review-only` | 純審查 | REVIEW | 只審查不寫碼 |
| 10 | `security-only` | 安全掃描 | SECURITY | 只掃描不修復 |
| 11 | `build-fix` | 修構建 | BUILD-FIX | 最小修復構建錯誤 |
| 12 | `e2e-only` | E2E 測試 | E2E | 只跑端對端測試 |

### 新增模板（3 個）

| # | Key | 名稱 | Stages | 用途 |
|:-:|-----|------|--------|------|
| 13 | `diagnose` | 純診斷 | DEBUG | 只診斷不修復 |
| 14 | `clean` | 死碼清理 | REFACTOR | 清理未使用程式碼 |
| 15 | `db-review` | DB 審查 | DB-REVIEW | 資料庫專項審查 |

### 自訂序列

無使用者語法。當 15 個模板都不適合時，Main Agent 自行判斷 agent 組合並依序委派。

---

## Agent 系統（15 個）

### Agent 清單

| # | Agent | Model | Color | 功能 | permissionMode |
|:-:|-------|:-----:|:-----:|:----:|:--------------:|
| 1 | planner | opus | purple | 規劃 | bypassPermissions |
| 2 | architect | opus | cyan | 架構 | bypassPermissions |
| 3 | designer | sonnet | cyan | UI/UX | bypassPermissions |
| 4 | developer | sonnet | yellow | 開發 | bypassPermissions |
| 5 | debugger | sonnet | orange | 診斷 | bypassPermissions |
| 6 | code-reviewer | opus | blue | 審查 | bypassPermissions |
| 7 | security-reviewer | opus | red | 安全 | bypassPermissions |
| 8 | database-reviewer | sonnet | red | DB 審查 | bypassPermissions |
| 9 | tester (BDD) | sonnet | pink | 測試 | bypassPermissions |
| 10 | qa | sonnet | yellow | 行為驗證 | bypassPermissions |
| 11 | e2e-runner | sonnet | green | E2E | bypassPermissions |
| 12 | build-error-resolver | sonnet | orange | 修構建 | bypassPermissions |
| 13 | refactor-cleaner | sonnet | blue | 死碼清理 | bypassPermissions |
| 14 | retrospective | opus | purple | 迭代回顧 | bypassPermissions |
| 15 | doc-updater | haiku | purple | 文件 | bypassPermissions |

> 另有 **grader agent**（Haiku）作為可選的品質評分工具，非 workflow stage agent，由 Main Agent 在 SubagentStop 後可選委派。

### Model 分級

- **Opus**（5 個決策型）：planner、architect、code-reviewer、security-reviewer、retrospective
- **Sonnet**（9 個執行型）：其他所有
- **Haiku**（1 個簡單）：doc-updater

### 色彩分組（8 組）

| 色彩 | 組別 | Agents |
|:----:|------|--------|
| purple | 規劃類 | planner、retrospective、doc-updater |
| cyan | 設計類 | architect、designer |
| yellow | 執行類 | developer、qa |
| blue | 分析類 | code-reviewer、refactor-cleaner |
| red | 審查類 | security-reviewer、database-reviewer |
| orange | 修復類 | debugger、build-error-resolver |
| pink | 測試類 | tester |
| green | 驗證類 | e2e-runner |

### Agent 設計模式（ECC 全套）

| 模式 | 說明 | 適用 Agent |
|------|------|-----------|
| **信心過濾** | >80% 把握才回報問題 | code-reviewer |
| **邊界清單** | DO/DON'T 明確列出 | 所有 agent |
| **誤判防護** | 區分 false positive | security-reviewer |
| **停止條件** | 何時放棄/升級 | build-error-resolver、debugger |

### 特殊 Agent 設計

**debugger**：wk 風格，只診斷不修碼
- 工具：Read、Grep、Glob、Bash（唯讀分析）
- 產出：Handoff 檔案（根因分析 + 修復建議）
- 不使用：Write、Edit

**refactor-cleaner**：ECC 風格，自動化死碼清理
- 工具：全部（需要刪除檔案/程式碼）
- 自動化：knip（未使用 exports）、depcheck（未使用依賴）
- 限制：⛔ 不可重構邏輯，只清理死碼

**tester (BDD)**：BDD 導向
- 產出：Markdown GIVEN/WHEN/THEN spec → 轉為測試碼
- Spec 存放：specs/
- 兩種模式：TEST:spec（寫規格，DEV 前）、TEST:verify（跑測試，DEV 後）

**database-reviewer**：專職 DB 審查
- PostgreSQL/Supabase 最佳實踐
- 查詢優化、索引策略、migration 安全性

### Agent 間通訊

**只用 Handoff 檔案**（無 shared memory、無 workflow.json 讀取）。

### 擴充機制

V1 固定 15 個 agent。V2 再考慮使用者自定義擴充。

---

## 命令清單

所有命令使用 `ot:` 前綴避免撞名。

| 命令 | 功能 | 觸發工作流 |
|------|------|:----------:|
| `/ot:auto` | 自動選擇工作流（核心） | Main Agent 選 |
| `/ot:plan` | 需求規劃 | - |
| `/ot:dev` | 開發實作 | single |
| `/ot:tdd` | TDD 流程 | tdd |
| `/ot:review` | 程式碼審查 | review-only |
| `/ot:security` | 安全掃描 | security-only |
| `/ot:e2e` | E2E 測試 | e2e-only |
| `/ot:build-fix` | 修構建錯誤 | build-fix |
| `/ot:debug` | 除錯診斷 | debug |
| `/ot:refactor` | 重構 | refactor |
| `/ot:verify` | 統一 6 階段驗證 | - |
| `/ot:stop` | 退出 Loop | - |
| `/ot:dashboard` | 開啟 Dashboard | - |
| `/ot:evolve` | 手動觸發知識進化 | - |
| `/ot:multi-review` | 多模型審查（V2） | - |

---

## Loop 模式

### 預設行為

Loop **預設開啟**。每個 workflow 完成後自動繼續下一個任務。

```
使用者 prompt → /ot:auto 選工作流 → 執行 workflow → 完成
                                                    ↓
                              ← 讀 tasks.md checkbox ←
                              ↓
                     還有 [ ] 未完成？
                    ├─ 是 → 自動開始下一個任務（禁止詢問）
                    └─ 否 → Loop 完成，允許退出
```

### 退出條件（四選一）

| 條件 | 行為 |
|------|------|
| tasks.md checkbox 全部 `[x]` | 自動退出 |
| 使用者執行 `/ot:stop` | 手動退出 |
| 達到 max iterations（預設 100） | 暫停，顯示進度 |
| 連續 3 次錯誤 | 暫停，報告問題 |

### 實作機制

Stop hook 截獲 Claude 退出：
1. 讀取 loop 狀態檔案（iteration 計數）
2. 檢查 tasks.md checkbox 完成度
3. 未完成 → `decision: "block"` + 重注入 prompt
4. 已完成 → 允許退出

---

## 並行執行

### 設計原則

**同一訊息多 Task** = ECC 原生並行。不需要 barrier/slot/FIFO。

- **無硬上限**：有多少 (parallel) 任務就並行多少
- **失敗隔離**：一個失敗不影響其他，失敗的進入 DEBUG→DEV
- **不偵測檔案衝突**：信任 tasks.md 分配
- **Main Agent 收斂**：hook 記錄結果，全部完成後提示 Main

### 並行缺陷修復（D1–D4）

經實戰驗證，多 agent 並行時存在 4 項設計缺陷，已全數修復：

| 缺陷 | 根因 | 修復 |
|------|------|------|
| **D1 TOCTOU** | `updateStateAtomic` mtime 讀寫間衝突 | 1–5ms jitter retry + Atomics.wait 優先 |
| **D2 hint 過時** | 第一完成 agent 的 hint 可能跳過未完成的並行 agent | `getNextStageHint()` 檢查 `activeAgents` 是否為空 |
| **D3 雙重失敗** | FAIL + REJECT 同時發生時缺乏明確優先順序 | TEST FAIL > REVIEW REJECT 優先，統一協調提示 |
| **D4 並行硬編碼** | `parallelGroups` 無法自訂，所有 workflow 共用固定群組 | 移入 workflow 定義，各 workflow 透過 `parallelGroups` 欄位引用群組名 |

詳見 `docs/reference/parallel-defects.md`。

### 靜態並行（registry 定義 + 動態推導）

registry.js 定義全域 `parallelGroupDefs`：

```javascript
parallelGroupDefs: {
  'quality':        ['REVIEW', 'TEST'],
  'verify':         ['QA', 'E2E'],
  'secure-quality': ['REVIEW', 'TEST', 'SECURITY'],
}
```

各 workflow 在定義中透過字串引用（避免重複）：

```javascript
workflows: {
  'standard': {
    stages: [...],
    parallelGroups: ['quality'],     // 只列群組名，成員定義在 parallelGroupDefs
  },
  'full': {
    stages: [...],
    parallelGroups: ['quality', 'verify'],
  },
  ...
}
```

**向後相容**：外部模組 import `parallelGroups` 時，動態推導為舊格式（群組名 → 成員陣列）。

### 動態並行（tasks.md parallel）

```markdown
## 2. Core Services (parallel)
- [ ] 2.1 建立 UserService | agent: developer | files: src/services/user.ts
- [ ] 2.2 建立 ProductService | agent: developer | files: src/services/product.ts
- [ ] 2.3 建立 OrderService | agent: developer | files: src/services/order.ts
```

### DEV 階段內部並行：Mul-Dev 機制

DEV 階段可進一步分解為多個並行子任務（Phase），通過 **mul-dev skill** 協調。

**兩種模式**：

| 模式 | 觸發條件 | 分析者 | Phase 存放位置 |
|------|--------|--------|:----:|
| **Mode A** | 有 specs（standard/full/secure/refactor） | architect | `tasks.md` → `## Dev Phases` 區塊 |
| **Mode B** | 無 specs（quick/debug/single） | Main Agent | context window 自行判斷 |

**Phase 標記格式**：

```markdown
## Dev Phases

### Phase 1: 基礎建設 (sequential)
- [ ] 建立資料模型 | files: src/models/user.ts
- [ ] 設定路由骨架 | files: src/routes/index.ts

### Phase 2: 核心功能 (parallel)
- [ ] 實作 CRUD API | files: src/handlers/user.ts
- [ ] 實作認證中間件 | files: src/middleware/auth.ts
- [ ] 撰寫單元測試 | files: tests/user.test.ts

### Phase 3: 整合 (sequential, depends: 2)
- [ ] 整合 CRUD 與認證 | files: src/routes/user.ts
```

- `(sequential)`：Phase 內子任務依序執行（單一 developer）
- `(parallel)`：Phase 內子任務同一訊息並行（多個 developer Task）
- `(depends: N)`：非前一 Phase 時標注跨越依賴

**判斷標準**：操作不同檔案 ∧ 無邏輯依賴 → parallel；否則 sequential。

**失敗隔離**：某子任務 FAIL → 只重試該子任務；整個 Phase FAIL → 不進入下一 Phase。

#### TaskList 同步

Mul-Dev 執行期間同步維護 TaskList，提供可見性（不取代 workflow.json）：

| 時機 | 操作 |
|------|------|
| DEV 啟動，分析出子任務 | 每個子任務 `TaskCreate`（subject = Phase 子任務描述） |
| 委派前 | `TaskUpdate → in_progress` |
| 子任務完成後 | `TaskUpdate → completed`；Mode A 同時回寫 tasks.md checkbox |
| 退化（無法分解）時 | 仍建立一個 `TaskCreate`，操作同一般流程 |

詳見 `skills/mul-dev/SKILL.md`。

### 編排模式

**順序 + 並行 + Phase 依賴**：不需要 DAG、不需要 /ot:orchestrate 專門命令。

---

## 錯誤處理

### 失敗流程（wk 風格）

```
TESTER FAIL
    ↓
SubagentStop 偵測 FAIL → failCount += 1
    ↓
failCount < 3？
├─ 是 → 委派 DEBUGGER 分析根因 → 委派 DEVELOPER 修復 → 委派 TESTER 再測
└─ 否 → 暫停，提示使用者介入
```

### REVIEWER REJECT

```
SubagentStop 偵測 REJECT → rejectCount += 1
    ↓
rejectCount < 3？
├─ 是 → 委派 DEVELOPER 修復（帶 reject 原因）→ 委派 REVIEWER 再審
└─ 否 → 暫停，提示使用者介入
```

### 雙重失敗協調（D3 修復）

REVIEW REJECT + TEST FAIL 同時發生時，優先順序明確為 **TEST FAIL > REVIEW REJECT**。

**理由**：測試失敗表示代碼根本有問題；審查拒絕只是品質問題。

**協調行為**：
1. 先分析 TEST FAIL 的根因（DEBUGGER）
2. DEVELOPER 修復根本問題
3. TESTER 再驗證
4. 若 REVIEW 仍需要修改，帶上本輪修正一起重審

這樣避免進入「REVIEW 修了但 TEST 沒修，反覆 REJECT」的無限迴圈。

### 重試上限

統一 3 次重試上限，不分風險等級。不做風險升級。

---

## 上下文傳遞：Handoff 檔案

### 格式

```markdown
## HANDOFF: [前一個 agent] → [下一個 agent]

### Context
[完成了什麼]

### Findings
[關鍵發現和決策]

### Files Modified
[變更的檔案清單]

### Open Questions
[未解決項]
```

### 存放路徑

```
~/.overtone/sessions/{sessionId}/handoffs/
├── DEV-to-REVIEW.md
├── DEV-to-TEST.md
├── DEBUGGER-to-DEV.md
└── ...
```

---

## BDD 整合

### BDD Spec 格式

Markdown GIVEN/WHEN/THEN，存放在 `specs/`：

```markdown
# Feature: 使用者登入

## Scenario: 成功登入
GIVEN 使用者在登入頁面
WHEN 輸入正確的帳號密碼
AND 點擊登入按鈕
THEN 跳轉到 Dashboard
AND 顯示歡迎訊息

## Scenario: 密碼錯誤
GIVEN 使用者在登入頁面
WHEN 輸入錯誤密碼
THEN 顯示「帳號或密碼錯誤」
AND 不清空帳號欄位
```

### BDD 在 Workflow 中的時序

```
含 PLAN/ARCH 的 workflow（standard/full/secure/refactor）：
  ... → TEST:spec（寫 BDD 行為規格）→ DEV（實作）→ TEST:verify（驗證）→ ...

tdd workflow：
  TEST:spec → DEV → TEST:verify

quick/debug 等短流程：
  DEV → TEST:verify（事後驗證）
```

---

## 驗證與品質

### /ot:verify 統一 6 階段

```
1️⃣ Build    npm run build / go build
   └─ 失敗 → 停止，回報錯誤

2️⃣ Types    tsc --noEmit / mypy
   └─ 失敗 → 停止，回報型別錯誤

3️⃣ Lint     eslint / ruff / golangci-lint
   └─ 失敗 → 繼續（記錄警告）

4️⃣ Tests    npm test / pytest / go test
   └─ 失敗 → 停止，回報失敗測試

5️⃣ Security 基本安全掃描
   └─ 結果只報告，不阻擋

6️⃣ Diff     git diff 變更影響分析
   └─ 顯示變更摘要
```

### 三信號驗證

工作流完成 = **lint 0 error + test 0 fail + code-review PASS**

確定性信號（lint/test）優先於 AI 判斷（review）。

### pass@k 指標

| 指標 | 定義 | 用途 |
|------|------|------|
| pass@1 | 首次成功率 | Agent 基本可靠性 |
| pass@3 | 三次內成功率（目標 >90%） | 含重試的可靠性 |
| pass^3 | 連續三次全成功 | 關鍵路徑穩定性 |

記錄在 Dashboard History Tab。

### Model Grader

用 Haiku 快速評分開放式品質：
- 錯誤訊息友善度
- API 命名語意清晰度
- 文件可讀性

---

## 持續學習：Instinct 系統

### 架構（ECC 風格）

```
Hook 觀察（自動捕捉）
  PostToolUse / SubagentStop → observations.jsonl
      ↓
4 種 Pattern 偵測
  user_corrections    使用者修正
  error_resolutions   錯誤解決
  repeated_workflows  重複工作流
  tool_preferences    工具偏好
      ↓
Instinct 建立（原子知識）
  一個觸發條件 + 一個行動 + 信心分數
      ↓
信心分數生命週期
  0.3（初始）→ +0.05/確認 → -0.10/矛盾 → -0.02/週衰減
  ≥ 0.7 → 自動應用
  < 0.2 → 自動刪除
      ↓
進化路徑
  ≥ 5 instincts 同 tag → Skill
  ≥ 8 instincts + 多步驟 → Agent
  單一動作 → Command
```

---

## Specs 系統整合

### 可選模式

/ot:auto 判斷是否啟用 Specs 系統：

```
大功能（standard/full/secure）
  → 啟用 Specs 系統
  → PLAN 產出 proposal.md
  → ARCH 產出 design.md + tasks.md
  → DEV 按 tasks.md 執行

小任務（single/quick/debug）
  → 跳過 Specs 系統
  → 直接執行
```

### 目錄結構

```
{project_root}/
└── specs/
    └── features/
        ├── in-progress/<feature>/    # 進行中
        ├── paused/                   # 暫停
        ├── backlog/                  # 待辦
        └── archive/YYYY-MM-DD_<feature>/  # 已完成（扁平）
```

---

## Dashboard + Remote + Timeline

### Dashboard

- **保留完整功能**，資訊配合核心，不特別為 Dashboard 設計
- **提升穩定度**：SSE 自動重連、連線狀態追蹤、錯誤恢復
- **技術栈**：Bun + htmx + Alpine.js（29KB、無構建步驟）
- **自動啟動**：SessionStart hook 自動 spawn + 自動開瀏覽器
- **三 Tab**：Overview（workflow 狀態 + agent 活動）、Timeline（事件流）、History（歷史統計 + pass@k）
- **動畫版**：V1 最後優先加入

### Remote 抽象化架構

```
Remote Core（核心引擎）
  ├─ EventBus：5 軸事件
  │    push / query / control / sync / interact
  │
  └─ Adapter Interface
       ├─ DashboardAdapter    WebSocket 雙向（V1）
       ├─ TelegramAdapter     Bot API 雙向（V1）
       ├─ SlackAdapter        V2
       ├─ DiscordAdapter      V2
       └─ WebhookAdapter      單向 fallback
```

### Timeline（21 種事件）

| 分類 | 事件 | 說明 |
|------|------|------|
| **workflow** | start, complete, abort | 工作流生命週期 |
| **stage** | start, complete, retry | 階段生命週期 |
| **agent** | delegate, complete, error | Agent 執行紀錄 |
| **loop** | start, advance, complete | Loop 迭代 |
| **handoff** | create | Handoff 檔案建立 |
| **parallel** | start, converge | 並行群組 |
| **error** | fatal | 不可恢復錯誤 |
| **grader** | score | Grader 品質評分結果 |
| **specs** | init, archive | Specs 功能初始化與歸檔 |
| **session** | start, end | Session 生命週期 |

儲存：`~/.overtone/sessions/{id}/timeline.jsonl`（append-only）。
顯示：中文、簡潔。

---

## State 設計

### 檔案結構

```
~/.overtone/
├── sessions/
│   └── {sessionId}/
│       ├── workflow.json     # 工作流狀態
│       ├── timeline.jsonl    # 事件記錄（21 種）
│       ├── handoffs/         # Handoff 檔案
│       ├── loop.json         # Loop 狀態
│       └── observations.jsonl # Instinct 觀察
└── config.json               # 全域設定

{project_root}/
└── specs/
    └── features/
        ├── in-progress/<feature>/    # 進行中
        ├── paused/                   # 暫停
        ├── backlog/                  # 待辦
        └── archive/YYYY-MM-DD_<feature>/  # 已完成（扁平）
```

### workflow.json

```jsonc
{
  "sessionId": "abc-123",
  "workflowType": "standard",
  "createdAt": "2026-02-23T14:00:00Z",

  "currentStage": "REVIEW",
  "stages": {
    "PLAN":    { "status": "completed", "result": "pass" },
    "ARCH":    { "status": "completed", "result": "pass" },
    "TEST":    { "status": "completed", "result": "pass", "mode": "spec" },
    "DEV":     { "status": "completed", "result": "pass" },
    "REVIEW":  { "status": "active",    "result": null },
    "TEST:2":  { "status": "active",    "result": null, "mode": "verify" },
    "DOCS":    { "status": "pending",   "result": null }
  },

  "activeAgents": {
    "code-reviewer": { "stage": "REVIEW", "startedAt": "..." },
    "tester":        { "stage": "TEST:2", "startedAt": "..." }
  },

  "failCount": 0,
  "rejectCount": 0
}
```

---

## Hook 架構

### Hook 清單

| 事件 | 職責 | 行數預估 |
|------|------|:-------:|
| **SessionStart** | 顯示 banner + 初始化狀態 + 啟動 Dashboard | ~60 |
| **UserPromptSubmit** | 注入 systemMessage 指向 /ot:auto | ~80 |
| **PreToolUse (Task)** | 擋跳過必要階段 | ~150 |
| **SubagentStop** | 記錄結果 + 提示下一步 + 寫 workflow.json + emit timeline | ~380 |
| **PostToolUse** | Instinct 觀察收集 | ~100 |
| **Stop** | Loop 迴圈 + 完成度檢查 + Dashboard 通知 | ~160 |

**總計：~1153 行**

### Hook 職責邊界

```
Hook 只做：
  ✅ 指引（UserPromptSubmit: 指向 /ot:auto）
  ✅ 擋（PreToolUse: 不允許跳過必要階段）
  ✅ 記（SubagentStop: 記錄到 workflow.json + timeline.jsonl）
  ✅ 提示（SubagentStop: 「下一步請委派 TESTER」）
  ✅ 迴圈（Stop: Loop 繼續/退出判定）
  ✅ 通知（Stop: 更新 Dashboard + Remote）
  ✅ 觀察（PostToolUse: 收集 Instinct 觀察）

Hook 不做：
  ❌ 路由決策（Main Agent 自己看 Skill 指引）
  ❌ 並行協調（ECC 原生處理）
  ❌ 擋 Main Agent 寫碼（靠 Skill 引導）
  ❌ DAG 計算（不需要 DAG）
  ❌ Crash recovery（狀態簡單到不需要）
```

---

## Context 管理

### 邏輯邊界壓縮

Stage 完成時（邏輯邊界）提示壓縮。不自動觸發，讓 Main Agent 自己決定。

### Handoff 保存

Handoff 檔案存在 session 目錄，compact 後 Main Agent 可重新讀取。

---

## 決策記錄

55 個決策全部確認，詳見 git history。

---

## V1 剩餘 Roadmap

### Dashboard History Tab（session.html 第三個 Tab）✅

- [x] History Tab UI（pass@1 / pass@3 / pass^3 統計表格）
- [x] pass@k 計算邏輯（從 timeline.jsonl 計算各 stage 的成功率）
- [x] timeline.js 新增 `passAtK(sessionId)` 查詢函式

### 品質量化：Model Grader ✅

- [x] Haiku 評分整合（clarity / completeness / actionability 三維度 1-5 分）
- [x] grader 結果儲存到 timeline.jsonl（`grader:score` 事件）
- [x] History Tab 顯示 grader 分數（表格 + 色彩視覺化）

### `[workflow:xxx]` 覆寫語法 ✅

- [x] `on-submit.js` 解析 prompt 中的 `[workflow:xxx]` 語法
- [x] 跳過 /ot:auto 判斷，直接啟動指定 workflow

### Dashboard 動畫版（V1 尾聲）✅

- [x] Stage 轉換動畫（active 光暈脈動 + completed 閃光確認）
- [x] Agent 活動動態指示器（spinner + 邊框脈動 + 進場動畫）

### DEV 階段內部並行：Mul-Dev 機制 ✅

- [x] Mode A（有 specs）：architect 寫入 Dev Phases，Main Agent 按 Phase 調度
- [x] Mode B（無 specs）：Main Agent 自行分析子任務
- [x] TaskList 同步（TaskCreate / TaskUpdate）
- [x] 失敗隔離 + 退化條件

### 並行機制缺陷修復（D1-D4）✅

- [x] D1 TOCTOU：updateStateAtomic jitter retry
- [x] D2 hint 過時：getNextStageHint() 先檢查 activeAgents
- [x] D3 雙重失敗協調：FAIL > REJECT 優先順序
- [x] D4 parallelGroups：改為 per-workflow 動態推導

## V2 Planned（延後）

- `/ot:multi-review`（多模型審查）
- Slack Adapter
- Discord Adapter
- 使用者自定義 Agent 擴充

