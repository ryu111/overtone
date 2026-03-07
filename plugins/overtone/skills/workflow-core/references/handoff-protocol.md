# Handoff 交接協定

> 📋 **何時讀取**：首次委派 agent 或 agent 回報結果需要 chaining 時。

## Handoff 四欄位定義

每個 agent 完成任務後 📋 MUST 輸出以下格式的 Handoff：

```markdown
## HANDOFF: {from-agent} → {next-agent}

### Context
[做了什麼：任務摘要、執行的步驟、使用的方法]

### Findings
[發現和結果：具體產出、判定結果（PASS/FAIL/REJECT）、數據]

### Files Modified
[修改的檔案清單：每個檔案附簡要說明]

### Exit Criteria
- [x] 已確認 [具體驗證項目]
- [ ] 跳過 [無法確認的項目]

### Open Questions
[未解決的問題：需要後續 agent 或使用者注意的事項]
```

## 欄位填寫規範

### Context

- 用 2-3 句話描述此 agent 做了什麼
- 包含使用的工具/方法
- 說明範圍和限制

### Findings

- **判定型 agent**（code-reviewer, security-reviewer, tester, qa）：明確寫出 PASS / FAIL / REJECT
- **實作型 agent**（developer, architect, designer）：列出具體產出
- **診斷型 agent**（debugger）：列出假設和驗證結果
- 包含數據支持（測試通過率、漏洞數量、效能數據等）

### Files Modified

- 格式：`- path/to/file.ts — 做了什麼`
- 無修改時寫：`（無修改 — 唯讀分析）`
- 新建檔案標注 `[新建]`
- 刪除檔案標注 `[刪除]`

### Exit Criteria

- 使用 `- [x]` 表示 agent 已驗證完成，`- [ ]` 表示跳過或無法確認
- Exit Criteria 位於 Open Questions 之前（倒數第二個欄位）
- 各 stage agent 有 stage-specific 的 checklist 項目，每項以「已確認」、「已完成」、「已執行」等確定性動詞開頭

### Open Questions

- 列出不確定或需要後續注意的問題
- 無問題時寫：`（無）`
- 每個問題附建議的處理方式

### Main Agent 處理 Exit Criteria 和 Open Questions（📋 MUST）

Handoff 的 Exit Criteria 含未勾選項目（`- [ ]`）時，Main Agent MUST 以 **AskUserQuestion** 詢問使用者是否繼續或退回重做：
- 列出所有未勾選項目，讓使用者了解跳過了什麼
- 提供「繼續」和「退回重做」選項
- ⛔ 不可忽略未勾選項目直接繼續

### Main Agent 處理 Open Questions（📋 MUST）

Agent Handoff 含非空 Open Questions 時，Main Agent 📋 MUST 用 **AskUserQuestion** 工具呈現給使用者：
- 每個 Open Question 轉為一個選項（或合併為 2-4 個決策選項）
- 使用者選擇後再繼續下一個 stage
- ⛔ 不可將 Open Questions 當純文字輸出然後跳過

例外：Open Questions 為`（無）`時直接繼續。

## Chaining 規則

### 基本規則

1. Main Agent 收到 Handoff 後，將**完整 Handoff** 傳遞給下一個 agent
2. 多個前置 agent 的 Handoff 全部傳入（例：architect + designer → developer）
3. 不可摘要或截斷 Handoff 內容

### Task Prompt 格式

```
委派 {agent-name} agent：
{任務描述}

## Handoff from {previous-agent}
{完整貼入 Handoff}

## BDD Spec
參考 specs/features/in-progress/{featureName}/bdd.md 中的行為規格。
```

### 多 Handoff 傳遞

```
委派 developer agent：
根據架構設計和 UI 規格實作功能。

## Handoff from architect
{architect 的完整 Handoff}

## Handoff from designer
{designer 的完整 Handoff}

## BDD Spec
參考 specs/features/in-progress/{featureName}/bdd.md
```

## Agent → Agent 傳遞方式

| 來源 | 目標 | 傳遞內容 |
|------|------|----------|
| planner → architect | 需求分解 + 優先順序 |
| architect → tester(spec) | 技術方案 + API 介面 |
| architect → developer | 技術方案 + 資料模型 |
| architect + designer → developer | 技術方案 + UI 規格 |
| developer → code-reviewer | 程式碼變更 + 實作說明 |
| developer → tester(verify) | 程式碼變更 + BDD spec 路徑 |
| developer → security-reviewer | 程式碼變更 + 安全架構設計 |
| debugger → developer | 根因分析 + 修復建議 |
| code-reviewer(REJECT) → developer | REJECT 原因 + 問題清單 |
| 所有 agent → doc-updater | 所有前面階段的 Handoff |

## Handoff 傳遞

Handoff 是虛擬的——只存在 Main Agent 的 context window 中，不寫入磁碟。每個 agent 完成時在回覆最後輸出 Handoff 區塊，Main Agent 將其傳入下一個 agent 的 Task prompt。
