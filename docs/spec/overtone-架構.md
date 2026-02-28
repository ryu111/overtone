# Overtone 架構

> 本文件是 [Overtone 規格文件](overtone.md) 的子文件。
> 主題：三層架構、Hook 系統、Context 管理、State 設計
> 版本：v0.18.0

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

## Hook 架構

### Hook 清單

| 事件 | 職責 | 行數預估 |
|------|------|:-------:|
| **SessionStart** | 顯示 banner + 初始化狀態 + 啟動 Dashboard | ~130 |
| **PreCompact** | context 壓縮前注入工作流狀態恢復訊息 | ~116 |
| **UserPromptSubmit** | 注入 systemMessage 指向 /ot:auto | ~131 |
| **PreToolUse (Task)** | 擋跳過必要階段 | ~144 |
| **SubagentStop** | 記錄結果 + 提示下一步 + 寫 workflow.json + emit timeline | ~369 |
| **PostToolUse** | Instinct 觀察收集 + .md 措詞偵測 | ~193 |
| **Stop** | Loop 迴圈 + 完成度檢查 + Dashboard 通知 | ~186 |

**總計：~1269 行**（v0.18.0 新增 PreCompact hook + buildPendingTasksMessage 共用函式）

### Hook 統一錯誤處理（v0.17.7）+ 狀態恢復（v0.18.0）

所有 hook 使用 `scripts/lib/hook-utils.js` 統一錯誤處理和狀態恢復：

```javascript
// hook-utils.js 提供四個函式
safeReadStdin()              // 同步讀取 stdin + JSON.parse，失敗回傳 {}
safeRun(fn, defaultOut)      // 頂層 try/catch，crash 時輸出 defaultOut + exit 0
hookError(name, message)     // 統一 stderr 錯誤記錄（[overtone/{hookName}] 前綴）
buildPendingTasksMessage()   // 讀取活躍 feature 的未完成任務（SessionStart + PreCompact 共用）
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
│       ├── timeline.jsonl    # 事件記錄（22 種）
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
