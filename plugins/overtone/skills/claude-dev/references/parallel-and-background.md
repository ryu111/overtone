# Claude Code 並行與背景機制完整參考

> Claude Code Task tool 的並行執行、背景任務、agent resume、worktree 隔離機制

---

## 1. Task tool 並行執行

### 同訊息多個 Task call = 並行

在同一個訊息中發出多個 Task tool call，Claude Code 會並行執行：

```
// Main Agent 在同一個 response 中發出兩個 Task → 並行執行
Task(agent: reviewer, prompt: "review PR...")
Task(agent: tester, prompt: "run test suite...")
```

順序執行需要等待結果 → 下一個訊息才發 Task。

### 並行數量限制

Claude Code 支援多個並行 subagent（具體上限可能因版本而異，經驗觀察約 10 個）。超過上限時後續 Task call 排隊等待。

### Context 隔離

並行 agent 之間**完全隔離**：
- 各自有獨立的 context window
- 無法直接讀取對方的 context 或輸出
- 共享同一個 filesystem（⚠️ 檔案衝突風險）

### 檔案衝突風險

多個並行 agent 同時寫同一個檔案 → 後寫者覆蓋先寫者，資料可能遺失。

**安全模式**：
- 每個並行 agent 處理不同檔案 / 不同目錄
- 需要合并結果時，由 Main Agent 在所有 subagent 完成後統一整合
- 高衝突風險場景改用 `isolation: "worktree"`（見第 4 節）

---

## 2. run_in_background 機制

### 啟動方式

Task tool 支援 `run_in_background: true` 參數：

```json
{
  "agent": "tester",
  "prompt": "執行完整測試套件並回報結果",
  "run_in_background": true
}
```

啟動後 Main Agent **立即**獲得控制權，可繼續執行其他任務。

### 背景 agent 通知

背景 agent 完成後，平台自動觸發 **TaskCompleted** 事件（Overtone 的 task-completed hook 處理此事件，執行 hook:timing 計時）。

Main Agent 收到通知後可讀取背景 agent 的輸出。

### 查看背景 agent 進度

背景 agent 的輸出儲存在 tmp 檔案（路徑由平台在啟動時回傳，格式如 `/private/tmp/claude-*/tasks/{agentId}.output`），可用 Read 或 Bash tail 查看：

```bash
# 查看背景 agent 即時輸出（使用平台回傳的 output_file 路徑）
tail -f {output_file}
```

### 前景 vs 背景選擇策略

| 情境 | 建議模式 | 原因 |
|------|----------|------|
| 需要 subagent 結果才能繼續 | 前景（預設） | 避免 Main Agent 在結果未知時做錯誤假設 |
| 有獨立工作可以同步進行 | 背景 | 節省總體執行時間 |
| 只是觸發通知或記錄 | 背景 | 副作用型任務不需要等待 |
| subagent crash 風險高 | 前景 | 背景 crash 時 SubagentStop 可能未觸發 |

---

## 3. Agent resume 機制

### 取得 agentId

Task tool 完成後回傳 `agentId`：

```json
{
  "agentId": "agent-abc123",
  "output": "..."
}
```

### 使用 resume 恢復 agent

```json
{
  "agentId": "agent-abc123",
  "prompt": "根據剛才的分析，進一步修正第 3 點",
  "resume": true
}
```

**resume 特性**：
- 保留前次 agent 的完整 context window（工具呼叫歷史、所有 messages）
- 不需要重新描述背景資訊
- 節省 context token

### 適用場景

- **follow-up 工作**：「上面的分析完成後，再根據結果做 X」
- **追加指示**：「剛才漏掉一個需求，請補充」
- **錯誤修正**：「你的輸出有格式問題，請修正後重新輸出」
- **迭代精煉**：多輪修改同一份文件，避免每次都重讀全部 context

---

## 4. isolation: "worktree" 機制

### 啟動 worktree 隔離

```json
{
  "agent": "developer",
  "prompt": "實作 feature-A",
  "isolation": "worktree"
}
```

### 運作方式

- Claude Code 建立獨立的 **git worktree**（同一 repo 的副本，不同工作目錄）
- Agent 在隔離的 worktree 中工作，不影響主 branch
- 並行的多個 worktree agent 互不干擾

### 清理行為

| 條件 | 行為 |
|------|------|
| Agent 完成且無任何變更 | worktree 自動清理 |
| Agent 完成且有檔案變更 | 保留 worktree，回傳 `worktreePath` 和 `branch` |

### 適用場景

- 並行開發多個 feature，每個 feature 修改不同模組但有交叉依賴
- 實驗性修改（不確定是否採用）
- 需要隔離環境的整合測試

**⚠️ 限制**：worktree 合并需要手動處理 merge conflict，Main Agent 需在所有 worktree 完成後協調合并。

---

## 5. Overtone 的並行委派模式

### 並行群組定義（registry.js SoT）

| 群組名稱 | 包含 agents | 觸發時機 |
|----------|------------|----------|
| `quality` | REVIEW + TEST | DEV 完成後 |
| `verify` | QA + E2E | quality 通過後 |
| `secure-quality` | REVIEW + TEST + SECURITY | 安全敏感功能 |

### Multi-Agent 模式（同類型 agent 並行）

同類型 agent 處理獨立子任務時，可在同訊息中委派多個：

```
// 多個 developer agent 並行實作不同模組
Task(agent: developer, prompt: "實作 auth 模組")
Task(agent: developer, prompt: "實作 payment 模組")
Task(agent: developer, prompt: "實作 notification 模組")
```

**必要條件**：子任務之間無邏輯依賴 + 操作不同檔案。

### 並行收斂門

Overtone 用 `activeAgents` 追蹤並行 agent 狀態：

```
activeAgents[instanceId] = {
  agent: "developer",
  stage: "DEV:inst_abc",
  parallelGroup: "quality",
  parallelTotal: 2
}
```

**收斂邏輯**（on-stop.js）：
1. SubagentStop 觸發 → 更新 activeAgents
2. 檢查同 parallelGroup 的所有 agent 是否都完成（`parallelDone === parallelTotal`）
3. 全部完成 → 標記 stage 為 `completed`，推進工作流
4. 未全部完成 → 等待其他 agent

---

## 6. 限制與注意事項

### 並行 agent 限制

- **不應同時寫同一檔案**：覆蓋風險，無鎖定機制
- **shared state 需要同步**：多個 agent 同時讀寫 `workflow.json` 需要 `updateStateAtomic()`（Overtone 已處理，直接呼叫）
- **並行 agent 無法互相感知**：A 看不到 B 正在做什麼，需要 Main Agent 協調

### 背景 agent 限制

- **AskUserQuestion 會被跳過**：背景 agent 無法與使用者直接互動（問題自動跳過或排隊到 session）
- **背景 agent crash → SubagentStop 可能未觸發**：`activeAgents` 會有殘留 orphan 記錄 → sanitize() 啟動時清理
- **輸出讀取需要輪詢**：背景 agent 進度不是 push，需要主動查看 tmp log

### Statusline 同步問題

- 背景 agent 執行時，statusline 顯示的 agent 狀態可能與實際不同步
- `statusline-state.json` 每次 SubagentStop 更新，但背景 agent 完成時間不確定
- 不要依賴 statusline 狀態做業務判斷，以 `workflow.json` 的 state 為準

### Agent resume 限制

- resume 的 context window 有上限，超過後無法 resume（需重新委派）
- resume 不能更換 agent 類型（agentId 綁定特定 agent 定義）
- 背景 agent 的 resume 需要先等背景任務完成

---

## 7. 快速決策樹

```
需要並行處理？
├─ 是 → 子任務有沒有依賴？
│   ├─ 沒有依賴 → 同訊息發多個 Task
│   └─ 有依賴 → 序列執行（等結果再委派）
│
需要背景執行？
├─ 主 agent 有獨立工作要做 → run_in_background: true
└─ 需要結果才能繼續 → 前景執行（預設）
│
有檔案衝突風險？
├─ 高風險（同模組並行開發）→ isolation: "worktree"
└─ 低風險（不同檔案）→ 標準並行即可
│
需要 follow-up 追加指示？
└─ 儲存 agentId → 下次 resume
```
