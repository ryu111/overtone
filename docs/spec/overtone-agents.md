# Overtone Agent 系統

> 本文件是 [Overtone 規格文件](overtone.md) 的子文件。
> 主題：17 個 agent 職責、Handoff 協定、BDD 整合
> 版本：v0.17.7

---

## Agent 系統（17 個）

### Agent 清單

| # | Agent | Model | Color | 功能 | permissionMode |
|:-:|-------|:-----:|:-----:|:----:|:--------------:|
| 1 | product-manager | opus | emerald | 產品分析 | bypassPermissions |
| 2 | planner | opus | purple | 規劃 | bypassPermissions |
| 3 | architect | opus | cyan | 架構 | bypassPermissions |
| 4 | designer | sonnet | cyan | UI/UX | bypassPermissions |
| 5 | developer | sonnet | yellow | 開發 | bypassPermissions |
| 6 | debugger | sonnet | orange | 診斷 | bypassPermissions |
| 7 | code-reviewer | opus | blue | 審查 | bypassPermissions |
| 8 | security-reviewer | opus | red | 安全 | bypassPermissions |
| 9 | database-reviewer | sonnet | red | DB 審查 | bypassPermissions |
| 10 | tester (BDD) | sonnet | pink | 測試 | bypassPermissions |
| 11 | qa | sonnet | yellow | 行為驗證 | bypassPermissions |
| 12 | e2e-runner | sonnet | green | E2E | bypassPermissions |
| 13 | build-error-resolver | sonnet | orange | 修構建 | bypassPermissions |
| 14 | refactor-cleaner | sonnet | blue | 死碼清理 | bypassPermissions |
| 15 | retrospective | opus | purple | 迭代回顧 | bypassPermissions |
| 16 | doc-updater | haiku | purple | 文件 | bypassPermissions |
| 17 | grader | haiku | purple | 品質評分（可選，非 workflow stage） | bypassPermissions |

> **grader** 非 workflow 必要階段，由 Main Agent 在 SubagentStop 後視需要委派。

### Model 分級

- **Opus**（6 個決策型）：product-manager、planner、architect、code-reviewer、security-reviewer、retrospective
- **Sonnet**（9 個執行型）：designer、developer、debugger、database-reviewer、tester、qa、e2e-runner、build-error-resolver、refactor-cleaner
- **Haiku**（2 個輕量型）：doc-updater、grader

### 色彩分組（9 組）

| 色彩 | 組別 | Agents |
|:----:|------|--------|
| emerald | 產品類 | product-manager |
| purple | 規劃類 | planner、retrospective、doc-updater、grader |
| cyan | 設計類 | architect、designer |
| yellow | 執行類 | developer、qa |
| blue | 分析類 | code-reviewer、refactor-cleaner |
| red | 審查類 | security-reviewer、database-reviewer |
| orange | 修復類 | debugger、build-error-resolver |
| pink | 測試類 | tester |
| green | 驗證類 | e2e-runner |

### Agent 設計模式（ECC 全套）

| 模式 | 說明 | 適用 Agent |
|------|------|-----------|
| **信心過濾** | >80% 把握才回報問題 | code-reviewer |
| **邊界清單** | DO/DON'T 明確列出 | 所有 agent |
| **誤判防護** | 區分 false positive | security-reviewer |
| **停止條件** | 何時放棄/升級 | build-error-resolver、debugger |

### 特殊 Agent 設計

**debugger**：wk 風格，只診斷不修碼
- 工具：Read、Grep、Glob、Bash（唯讀分析）
- 產出：Handoff 檔案（根因分析 + 修復建議）
- 不使用：Write、Edit

**refactor-cleaner**：ECC 風格，自動化死碼清理
- 工具：全部（需要刪除檔案/程式碼）
- 自動化：knip（未使用 exports）、depcheck（未使用依賴）
- 限制：⛔ 不可重構邏輯，只清理死碼

**tester (BDD)**：BDD 導向
- 產出：Markdown GIVEN/WHEN/THEN spec → 轉為測試碼
- Spec 存放：specs/
- 兩種模式：TEST:spec（寫規格，DEV 前）、TEST:verify（跑測試，DEV 後）

**database-reviewer**：專職 DB 審查
- PostgreSQL/Supabase 最佳實踐
- 查詢優化、索引策略、migration 安全性

### Agent 間通訊

**只用 Handoff 檔案**（無 shared memory、無 workflow.json 讀取）。

### 擴充機制

V1 固定 17 個 agent（含 grader）。V2 再考慮使用者自定義擴充。

---

## 上下文傳遞：Handoff 檔案

### 格式

```markdown
## HANDOFF: [前一個 agent] → [下一個 agent]

### Context
[完成了什麼]

### Findings
[關鍵發現和決策]

### Files Modified
[變更的檔案清單]

### Open Questions
[未解決項]
```

### 存放路徑

```
~/.overtone/sessions/{sessionId}/handoffs/
├── DEV-to-REVIEW.md
├── DEV-to-TEST.md
├── DEBUGGER-to-DEV.md
└── ...
```

### Developer Handoff 動態 Test Scope（v0.15.1+）

Developer 在 Handoff 中加入 `### Test Scope` 區段，動態指定下游測試調度：

```markdown
## HANDOFF: architect → developer

### Context
[實作的功能描述]

### Findings
[關鍵實作決策]

### Files Modified
[變更檔案清單]

### Test Scope
目標 workflow：standard / full / quick
- **Unit Tests**：路徑 tests/unit/xxx.test.js
  - 已實作 5 個 case，覆蓋核心邏輯
- **Integration Tests**：路徑 tests/integration/yyy.test.js
  - 新增 3 個 case，驗證 I/O 串接
- **E2E Tests**：路徑 tests/e2e/agent-browser.test.js
  - 可選，大功能自動啟用

### Open Questions
[未解決項]
```

**說明**：
- Test Scope 由 developer 填寫，tester 據此決定是否新增額外測試
- `目標 workflow` 指該功能應在哪種 workflow 中啟用（standard/full/quick 等）
- 若無 Test Scope，tester 按預設行為：DEV → TEST:verify（事後驗證）
- 含 PLAN/ARCH 的大功能自動啟用 TEST:spec（BDD 規格）

---

## BDD 整合

### BDD Spec 格式

Markdown GIVEN/WHEN/THEN，存放在 `specs/`：

```markdown
# Feature: 使用者登入

## Scenario: 成功登入
GIVEN 使用者在登入頁面
WHEN 輸入正確的帳號密碼
AND 點擊登入按鈕
THEN 跳轉到 Dashboard
AND 顯示歡迎訊息

## Scenario: 密碼錯誤
GIVEN 使用者在登入頁面
WHEN 輸入錯誤密碼
THEN 顯示「帳號或密碼錯誤」
AND 不清空帳號欄位
```

### BDD 在 Workflow 中的時序

```
含 PLAN/ARCH 的 workflow（standard/full/secure/refactor）：
  ... → TEST:spec（寫 BDD 行為規格）→ DEV（實作）→ TEST:verify（驗證）→ ...

tdd workflow：
  TEST:spec → DEV → TEST:verify

quick/debug 等短流程：
  DEV → TEST:verify（事後驗證）
```
