# ECC Multi-Agent 編排系統

> 來源：[everything-claude-code](https://github.com/affaan-m/everything-claude-code)

## 編排模式

ECC 用 **命令（slash command）驅動**，而非 pipeline hook 驅動。

### 三種模式

| 模式 | 範例 | 執行方式 |
|------|------|---------|
| **單 Agent** | `/plan`、`/tdd`、`/code-review` | 直接呼叫對應 agent |
| **並行多 Agent** | `/multi-plan`、`/multi-execute` | 背景 Task + TaskOutput 等待 |
| **順序鏈** | `/orchestrate`、`/workflow` | Agent A → Handoff → Agent B |

### 單 Agent 命令

```
/plan <描述>     → planner agent → 計劃文件（不執行）
/tdd <描述>      → tdd-guide agent → RED→GREEN→REFACTOR
/code-review     → code-reviewer agent → 掃 git diff
/security        → security-reviewer → OWASP 掃描
/build-fix       → build-error-resolver → 只修錯誤不重構
```

### 並行多 Agent 命令

```
/multi-plan <描述>
  ├─ Task(Codex: analyze) ← 背景
  ├─ Task(Gemini: analyze) ← 背景
  └─ TaskOutput 等待兩者完成（10 分鐘 timeout）
  → Claude 合成最終計劃
```

**重點**：
- `run_in_background: true` 啟動背景任務
- `TaskOutput({ task_id, block: true, timeout: 600000 })` 等待
- 超時不自動 kill — 用 AskUserQuestion 詢問使用者

### 順序鏈（Orchestrate）

```
/orchestrate feature <描述>
  Step 1: Planner → 需求分析
    → HANDOFF 文件
  Step 2: TDD-Guide → 測試優先實作
    → HANDOFF 文件
  Step 3: Code-Reviewer → 品質檢查
    → HANDOFF 文件
  Step 4: Security-Reviewer → 安全審計

/orchestrate custom "architect,tdd-guide,code-reviewer" <描述>
  → 自訂 Agent 序列
```

**Handoff 文件格式**：
```markdown
## HANDOFF: [prev-agent] → [next-agent]

### Context
[前一 Agent 的總結]

### Findings
[關鍵發現和決策]

### Files Modified
[變更的檔案列表]

### Open Questions
[未解決項]
```

## 完整工作流：6 階段循環

```
/workflow <任務>

[Research]   → 提示增強 + 上下文檢索
[Ideation]   → 並行分析（多方案 + 風險評估）
[Plan]       → 合成計劃 → 等使用者批准
[Execute]    → Claude 實作（嚴格遵循計劃）
[Optimize]   → 並行審計 → 修復
[Review]     → 最終驗收（測試 + 報告）
```

## 外部 Model 信任域（ECC 特有）

```
Codex（後端權威）：技術可行性、架構、安全
Gemini（前端權威）：UI/UX、可訪問性、設計
Claude（最終執行）：解析外部建議 → 重構 → 寫入檔案

規則：外部 Model 不能寫入檔案，只能建議。
```

**Overtone 不需要**：我們全由 Claude agents 完成，不需要外部 Model。

## 與 Vibe Pipeline 的對比

| 面向 | Vibe Pipeline | ECC Orchestration |
|------|--------------|-------------------|
| 驅動方式 | Hook 事件鏈 | 命令 + 使用者主動 |
| 流程控制 | FSM 自動路由 | 使用者手動鏈接或 `/orchestrate` |
| 並行 | Barrier 同步 | TaskOutput 輪詢 |
| 故障恢復 | Crash recovery 三層推斷 | 使用者手動重試 |
| 上下文傳遞 | Node Context 注入 | Handoff 文件 |
| 人類控制 | Human Gate（可選） | 每步等批准 |

## 對 Overtone 的啟示

1. **Handoff 文件模式值得採用** — 比 Node Context 注入更簡單、更可追蹤
2. **`/orchestrate custom` 自訂序列** — 使用者可自由組合 agent 順序
3. **計劃先行模式** — `/plan` 只產出計劃，不執行。使用者確認後才 `/execute`
4. **停損機制** — 每階段有完整性評分（≥7 才繼續），超時不 kill 而是問使用者
5. **不需要外部 Model** — ECC 的 Codex/Gemini 整合是因為 Cursor 生態，Overtone 不需要
