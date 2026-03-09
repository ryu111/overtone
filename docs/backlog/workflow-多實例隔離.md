# Workflow 多實例隔離

## 問題

目前 workflow state 是 **per-session 單例**（`sessions/{sessionId}/workflow.json`）。
當使用者用 `Cmd+B` 將任務退到背景，再啟動新 workflow 時，兩個 workflow 共用同一個 `workflow.json`，產生競態條件。

### 重現步驟

1. 啟動 workflow A（寫入 `workflow.json`）
2. `Cmd+B` 退到背景，背景 agent 還在跑
3. 前景啟動 workflow B → `init-workflow.js` **覆蓋** `workflow.json`
4. 背景 agent 完成 → `SubagentStop` 寫回 state → 覆蓋 workflow B 的 state

### 根因

- `workflow.json` 以 `sessionId` 為 key，一個 session 只有一個
- `Cmd+B` 不會產生新 session，前景背景共用同一個 `sessionId`
- Hook（SubagentStop）只知道 `sessionId`，不知道 agent 屬於哪個 workflow

## 設計方案

### 目錄結構（改前 → 改後）

```
# 改前（單例）
sessions/{sessionId}/
├── workflow.json
├── loop.json
├── timeline.jsonl
├── observations.jsonl
└── handoffs/
    └── DEV.md

# 改後（多實例）
sessions/{sessionId}/
├── loop.json                   ← session 層級（控制 session 是否繼續）
├── active-workflow-id          ← 前景目前的 workflow ID
├── agent-mapping.json          ← { agentInstanceId → workflowId }
├── observations.jsonl          ← session 層級（跨 workflow 學習）
└── workflows/
    └── {workflowId}/
        ├── workflow.json       ← state（各自獨立）
        ├── timeline.jsonl      ← 事件記錄
        └── handoffs/
            ├── DEV.md
            ├── REVIEW.md
            └── TEST.md
```

### Agent → Workflow Mapping

```
pre-task hook（委派 agent 時）
  → 記錄 { agentInstanceId: workflowId } 到 agent-mapping.json

SubagentStop hook（agent 完成時）
  → 查 agent-mapping.json，定位該更新哪個 workflow 的 state
```

### 層級歸屬

| 檔案 | 層級 | 原因 |
|------|------|------|
| `loop.json` | session | 控制 session 是否接續下一個任務，跨 workflow |
| `observations.jsonl` | session | 學習觀察跨 workflow 累積 |
| `active-workflow-id` | session | 標記前景目前操作哪個 workflow |
| `agent-mapping.json` | session | 跨 workflow 的 agent 路由表 |
| `workflow.json` | workflow | 各 workflow 獨立 state |
| `timeline.jsonl` | workflow | 各 workflow 獨立事件 |
| `handoffs/` | workflow | 各 workflow 獨立產出 |

## 影響範圍

需要修改的模組：

- `scripts/lib/state.js` — 路徑從 `session.workflow(sessionId)` 改為 `session.workflow(sessionId, workflowId)`
- `scripts/lib/paths.js` — 新增 workflow 層級路徑
- `scripts/init-workflow.js` — 寫入 `active-workflow-id` + 建立 workflow 子目錄
- `hooks/scripts/tool/pre-task.js` — 寫入 agent-mapping
- `hooks/scripts/agent/on-stop.js` — 查 agent-mapping 定位 workflow
- `hooks/scripts/prompt/on-submit.js` — 讀 active-workflow-id
- `hooks/scripts/tool/pre-edit-guard.js` — 讀 active-workflow-id
- 所有呼叫 `readState(sessionId)` 的地方 — 改為 `readState(sessionId, workflowId)`

## 狀態

- **優先級**：中（目前 `Cmd+B` 使用頻率不高，但隨著使用量增加會更常碰到）
- **複雜度**：高（影響 8+ 個模組，需要 migration 策略處理舊格式）
- **風險**：路徑變更影響所有 hook，需要完整測試覆蓋
