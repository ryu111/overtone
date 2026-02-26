# Overtone 子系統

> 本文件是 [Overtone 規格文件](overtone.md) 的子文件。
> 主題：Specs 系統、Dashboard 監控、Remote 控制、Timeline 事件記錄
> 版本：v0.6

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
