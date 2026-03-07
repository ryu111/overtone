---
name: debug
description: 除錯工作流。DEBUG → DEV → TEST。先診斷根因，再修復，最後驗證。
---

# 除錯（Debug）

## 初始化

使用 Bash 執行：
```bash
bun ~/.claude/scripts/init-workflow.js debug ${CLAUDE_SESSION_ID}
```

## 進度追蹤

初始化後、委派第一個 agent 前，📋 MUST 使用 TaskCreate 建立 pipeline 進度：

| Stage | subject | activeForm |
|-------|---------|------------|
| DEBUG | [DEBUG] 診斷 | 診斷中 |
| DEV | [DEV] 修復 | 修復中 |
| TEST | [TEST] 驗證 | 驗證中 |

委派 agent 前 → TaskUpdate status: `in_progress`；agent 完成後 → TaskUpdate status: `completed`。

## Stages

### 1. DEBUG — 🔧 診斷

委派 `debugger` agent。

- **輸入**：使用者描述的問題（錯誤訊息、重現步驟等）
- **產出**：Handoff（根因分析 + 假設驗證 + 修復建議）
- ⛔ debugger 不寫碼，只做診斷

### 2. DEV — 💻 修復

委派 `developer` agent。

- **輸入**：debugger 的 Handoff（含根因和修復建議）
- **產出**：Handoff（程式碼修復 + 修改說明）
- 📋 MUST 按 debugger 的診斷結果修復

📋 **並行委派**：判斷是否有 2+ 個獨立修復點（操作不同檔案 + 無邏輯依賴）。有 → 同一訊息發多個 Agent tool call（每個修復點一個）；無 → 單一 agent。

### 3. TEST — 🧪 驗證

委派 `tester` agent（mode: verify）。

- **輸入**：developer 的 Handoff
- **產出**：PASS / FAIL
- 💡 驗證 bug 已修復且未引入新問題

## 失敗處理

TEST FAIL → 回到 DEBUG（重新診斷）→ DEV → TEST 迴圈（上限 3 次）。達到上限 → 停止，提示使用者介入。

💡 完整流程與 retry 邏輯：讀取 `~/.claude/skills/workflow-core/references/failure-handling.md`

## 完成條件

- ✅ bug 修復且測試通過
- ✅ test 0 fail
