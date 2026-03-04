# Overtone 架構

> 本文件是 [Overtone 規格文件](overtone.md) 的子文件。
> 主題：三層架構、Hook 系統、Context 管理、State 設計
> 版本：v0.28.37

---

## 架構概覽：三層模型

視覺化版本詳見 [workflow-diagram.md](workflow-diagram.md)。

```
Layer 0: Loop（外圈）
  └─ Stop hook 截獲退出 → 檢查 checkbox → 有未完成任務自動繼續
  └─ 退出條件：checkbox 全完成 / /ot:stop / max iterations

Layer 1: Skill + Command 引導（內圈）
  └─ Hook systemMessage（⛔ MUST）→ 觸發 /ot:auto
  └─ /ot:auto（workflow 選擇器 skill）→ Main Agent 判斷需求 → 選擇 workflow
  └─ Workflow command / auto references（具體指引）→ 委派規則 + agent 順序
  └─ Knowledge domain skill（知識注入）→ agent 啟動時載入領域知識

Layer 2: Hook 守衛（底層）
  └─ SubagentStop: 記錄 agent 結果 + 提示下一步 + 寫 workflow.json
  └─ PreToolUse(Task): 擋跳過必要階段（不擋順序、不擋寫碼）
  └─ Stop: 完成度檢查 + Loop 迴圈 + Dashboard 通知
```

---

## Hook 架構

### Hook 清單

| 事件 | 職責 | 行數預估 |
|------|------|:-------:|
| **SessionStart** | 顯示 banner + 初始化狀態 + self-healing 清理異常狀態 + 啟動 Dashboard | ~160 |
| **SessionEnd** | Session 結束收尾 + 狀態清理 | ~80 |
| **PreCompact** | context 壓縮前注入工作流狀態恢復訊息 + compact 計數追蹤 | ~132 |
| **UserPromptSubmit** | 注入 systemMessage 指向 /ot:auto | ~131 |
| **PreToolUse (Task)** | 擋跳過必要階段 + updatedInput workflow context 注入 | ~180 |
| **SubagentStop** | 記錄結果 + 提示下一步 + 寫 workflow.json + emit timeline + 檢查 transcript 大小建議壓縮 | ~395 |
| **PostToolUse** | Instinct 觀察收集 + .md 措詞偵測 | ~193 |
| **PostToolUseFailure** | Tool 執行失敗事件處理 | ~108 |
| **Stop** | Loop 迴圈 + 完成度檢查 + Dashboard 通知 | ~186 |
| **TaskCompleted** | Task 完成事件處理 + hook:timing 計時（bun test 已移至 DEV agent 停止條件） | ~45 |
| **Notification** | 音效通知（AskUserQuestion、權限要求 → Glass 提示音） | ~30 |

**總計：~2301 行**（包含 v0.28.37 SessionStart self-healing + 各版本累積增強）

### Hook 統一錯誤處理（v0.17.7）+ 狀態恢復（v0.18.0）+ Workflow Context 注入（v0.20.0）

所有 hook 使用 `scripts/lib/hook-utils.js` 統一錯誤處理和狀態恢復：

```javascript
// hook-utils.js 提供七個函式
safeReadStdin()              // 同步讀取 stdin + JSON.parse，失敗回傳 {}
safeRun(fn, defaultOut)      // 頂層 try/catch，crash 時輸出 defaultOut + exit 0
hookError(name, message)     // 統一 stderr 錯誤記錄（[overtone/{hookName}] 前綴）
buildPendingTasksMessage()   // 讀取活躍 feature 的未完成任務（SessionStart + PreCompact 共用）
buildProgressBar()           // 產生 stage 進度條字串（emoji 圖示）
buildWorkflowContext()       // 產生 workflow context 字串，供 PreToolUse updatedInput 注入
getSessionId()               // 從 hook input 取得 session ID（帶 fallback）
```

好處：hook crash 不影響 Claude 工具執行（exit 0），錯誤統一記到 stderr。

### Hook 職責邊界

```
Hook 只做：
  ✅ 指引（UserPromptSubmit: 指向 /ot:auto）
  ✅ 擋（PreToolUse: 不允許跳過必要階段）
  ✅ 記（SubagentStop: 記錄到 workflow.json + timeline.jsonl）
  ✅ 提示（SubagentStop: 「下一步請委派 TESTER」）
  ✅ 迴圈（Stop: Loop 繼續/退出判定）
  ✅ 通知（Stop: 更新 Dashboard + Remote）
  ✅ 觀察（PostToolUse: 收集 Instinct 觀察 + 措詞偵測）

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

## State 設計

### 檔案結構

```
~/.overtone/
├── sessions/
│   └── {sessionId}/
│       ├── workflow.json     # 工作流狀態
│       ├── timeline.jsonl    # 事件記錄（24 種）
│       ├── loop.json         # Loop 狀態
│       ├── observations.jsonl # Instinct 觀察
│       └── compact-count.json # Compact 計數（auto/manual）
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

## 組件分類指南（v0.27.8）

> 新建 agent、skill、command、hook 時的分類判斷標準。
> 詳細正規化計畫：`docs/product-brief-normalization.md`

### 四類組件定義

| 組件 | 本質 | 問 | 答案範例 |
|------|------|---|---------|
| **Agent** | 角色（WHO） | 「這是一個什麼角色？」 | developer、tester、architect |
| **Skill** | 知識（WHAT） | 「這提供什麼領域知識？」 | testing、security、commit convention |
| **Command** | 動作（DO） | 「使用者要執行什麼操作？」 | 跑 quick workflow、做 review、停止 loop |
| **Hook** | 守衛（HOW） | 「系統事件發生時要做什麼？」 | 記錄結果、阻擋違規、注入 context |

### 分類決策樹

```
我要新增一個功能，它是...

├─ 定義一個「AI 角色」的身份和行為？
│   └─ → Agent（.md 放 agents/）
│
├─ 提供可被多個 agent 共用的「知識」或「方法論」？
│   └─ → Skill（SKILL.md + references/ 放 skills/）
│   └─ 用 agent frontmatter `skills` 欄位連結
│
├─ 使用者或 Main Agent 觸發的「一次性操作」？
│   └─ → Command（.md 放 commands/）
│   └─ 不含知識，只含操作流程
│
└─ 系統事件的「自動反應」？
    └─ → Hook（script 放 hooks/scripts/）
    └─ 宣告在 hooks.json（官方三層嵌套格式：Event → MatcherGroup[] → Handler[]）
```

### Skill 建構規則

1. **Skill = 知識領域**：每個 skill 代表一個知識領域（testing、security、commit 等），不是角色呼叫
2. **references/ 子目錄**：知識內容放在 `references/` 下，SKILL.md 是索引和摘要
3. **消費者聲明**：SKILL.md 開頭說明哪些 agent 使用此 skill、各自使用哪個 reference
4. **Agent 連結**：通過 agent frontmatter 的 `skills` 欄位注入（啟動時自動載入全部內容）
5. **💡 按需載入**：大型 reference 使用 `💡 Reference: path` 語法，Main Agent 按需讀取
6. **user-invocable: false**：純知識 skill 設 `user-invocable: false`（只供 agent 消費）
7. **同類知識歸一**：相同領域的知識放同一個 skill（如 BDD + testing conventions + test strategy 全歸 testing）

### Agent 建構規則

1. **Agent = 角色**：每個 agent 代表一個專職角色（developer、tester 等）
2. **知識外掛**：通過 `skills` frontmatter 引用 knowledge domain skill
3. **行為內嵌**：agent prompt 只寫角色行為規則，不寫可共用的領域知識
4. **model 分層**：opus（決策型）、sonnet（執行型）、haiku（輕量型）
5. **bypassPermissions**：所有 agent 啟用

### Command 建構規則

1. **Command = 操作**：使用者觸發的操作流程（跑 workflow、做 review、停 loop 等）
2. **無知識**：command 不含領域知識，只含操作邏輯（初始化 workflow、委派 agent、呼叫腳本）
3. **disable-model-invocation: true**：command 禁止 AI 自行呼叫，只允許使用者或 Skill 引導觸發
4. **Workflow command**：定義 stage 序列 + 💡 引用 workflow-core 知識
5. **Stage command**：初始化 workflow state + 委派對應 agent

### Hook 建構規則

1. **Hook = 事件反應**：系統事件（SessionStart、SubagentStop 等）觸發的自動行為
2. **職責邊界**：只做記錄、阻擋、提示、通知，不做路由決策
3. **安全退出**：使用 `safeRun()` 確保 crash 不影響 Claude Code 運作
4. **hookError()**：統一錯誤記錄格式
