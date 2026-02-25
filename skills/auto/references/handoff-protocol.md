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

### Open Questions

- 列出不確定或需要後續注意的問題
- 無問題時寫：`（無）`
- 每個問題附建議的處理方式

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
參考 openspec/specs/{feature}.md 中的行為規格。
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
參考 openspec/specs/{feature}.md
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

## Handoff 儲存

Handoff 檔案儲存在 session 目錄中：

```
~/.overtone/sessions/{sessionId}/handoffs/
├── PLAN-planner.md
├── ARCH-architect.md
├── DESIGN-designer.md
├── TEST-spec-tester.md
├── DEV-developer.md
├── REVIEW-code-reviewer.md
└── ...
```
