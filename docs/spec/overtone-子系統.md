# Overtone 子系統

> 本文件是 [Overtone 規格文件](overtone.md) 的子文件。
> 主題：Specs 系統、Dashboard 監控、Remote 控制、Timeline 事件記錄、Config API
> 版本：v0.26.0

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
- **重複開啟保護**（v0.17.3）：probePort() 確認 port 7777 是否已有服務，避免重複啟動；OVERTONE_NO_DASHBOARD 環境變數可停用自動啟動；EADDRINUSE 時 graceful exit
- **三 Tab**：Overview（workflow 狀態 + agent 活動）、Timeline（事件流）、History（歷史統計 + pass@k）

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

### Timeline（24 種事件，12 分類）

| 分類 | 事件 | 說明 |
|------|------|------|
| **workflow** | start, complete, abort | 工作流生命週期（3） |
| **stage** | start, complete, retry | 階段生命週期（3） |
| **agent** | delegate, complete, error | Agent 執行紀錄（3） |
| **loop** | start, advance, complete | Loop 迭代（3） |
| **parallel** | start, converge | 並行群組（2） |
| **error** | fatal | 不可恢復錯誤（1） |
| **grader** | score | Grader 品質評分結果（1） |
| **specs** | init, archive | Specs 功能初始化與歸檔（2） |
| **session** | start, end, compact, compact-suggestion | Session 生命週期（4） |
| **system** | warning | 系統警告（1） |

儲存：`~/.overtone/sessions/{id}/timeline.jsonl`（append-only）。
顯示：中文、簡潔。

---

## Config API（v0.21.0 新增）

### 目的
統一管理 Overtone 三大元件的設定驗證與 CRUD 操作：agent、hook、skill。

### 架構

#### L1 驗證層
- `validateAgent(agent, model, schema)`：驗證 agent frontmatter
- `validateHook(hook, schema)`：驗證 hook 定義
- `validateSkill(skill, schema)`：驗證 skill 定義
- `validateAll(pluginRoot)`：一次驗證整個 plugin

返回 `{ valid: boolean, errors: string[], warnings: string[] }`

#### L2 結構化 API
- `createAgent(root, name, options)`：建立新 agent .md 檔
- `updateAgent(agentPath, update)`：更新 agent frontmatter + 內容
- `createHook(root, name, options)`：建立新 hook 定義
- `updateHook(hookPath, update)`：更新 hook
- `createSkill(root, skillName, options)`：建立新 skill 檔
- `updateSkill(skillPath, update)`：更新 skill

### 配套資料

- **registry-data.json**：將 stages 和 agentModels 常數 JSON 化，便於外部工具讀取
- **knownTools 常數**：13 個 Claude 已知工具列表（registry.js 匯出）
- **hookEvents 常數**：9 個 Overtone hook 事件列表（registry.js 匯出）

### 使用場景

1. **CLI 工具驗證**：`validate-agents.js` 改為調用 validateAll()
2. **外部工具整合**：其他工具可透過 config-api 驗證或更新 agent/hook/skill
3. **自動化檢查**：健康檢查系統可用 config-api 驗證元件一致性
