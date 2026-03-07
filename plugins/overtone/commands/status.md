---
name: status
description: 顯示 Overtone 系統狀態快照（版本、元件統計、session 進度）
disable-model-invocation: true
---

# /ot:status — 系統狀態快照

顯示 Overtone 目前的版本、元件統計、session 進度與 specs 狀態。

## 執行步驟

### Step 1：並行收集基本資訊

同時讀取以下檔案：

- `~/.claude/.claude-plugin/plugin.json` → `version` 欄位
- `~/.claude/scripts/lib/registry.js` → 計算 `stages`、`workflows`、`agentModels` 的 key 數量
- `~/.claude/hooks/hooks.json` → 計算 `hooks` 陣列長度
- `${HOME}/.overtone/.current-session-id` → 當前 session ID（失敗則顯示「無活躍 session」）
- `docs/status.md`（相對專案根目錄）→ 測試通過數、fail 數、測試檔數量

同時執行 Bash 指令：

```bash
ls ~/.claude/skills/ | wc -l
```

取得 Skill 數量。

### Step 2：讀取 Session 工作流狀態（依賴 Step 1 的 session ID）

若 Step 1 取得 session ID，讀取：

- `${HOME}/.overtone/sessions/{sessionId}/workflow.json` → `workflowType`、`currentStage`、`stages` 陣列（計算已完成 / 總數）

若無法讀取，顯示「（無工作流資訊）」。

### Step 3：讀取 Specs 狀態（可與 Step 2 並行）

執行：

```bash
ls specs/features/in-progress/ 2>/dev/null || echo ""
ls specs/features/backlog/ 2>/dev/null || echo ""
```

取得進行中與待辦的 feature 清單。

### Step 4：格式化輸出

```
📊 Overtone v{version}

🔧 系統
  Agent: {agentModels key 數} | Stage: {stages key 數} | Workflow: {workflows key 數} | Hook: {hooks 陣列長} | Skill: {skill 目錄數}

📋 當前 Session
  ID: {sessionId 或 "（無活躍 session）"}
  Workflow: {workflowType}（{workflow label}）
  進度: {已完成 stage 數}/{總 stage 數} [{progress bar}]

🧪 測試（來自 docs/status.md）
  {pass} pass / {fail} fail / {files} files

📁 Specs
  進行中: {feature 清單，換行分隔，或 "（無）"}
  待辦: {feature 清單，換行分隔，或 "（無）"}
```

Progress bar 格式：已完成用 `█`、未完成用 `░`，固定 10 格。例：3/10 → `███░░░░░░░`。

Session 無活躍 workflow 時，「當前 Session」區塊只顯示 ID，跳過 Workflow 和進度行。
