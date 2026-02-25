# BDD 行為規格指南

> 📋 **何時讀取**：執行 TEST:spec 階段或需要撰寫 BDD 行為規格時。

## GIVEN/WHEN/THEN 語法

BDD spec 使用三段式語法描述行為：

```gherkin
Feature: [功能名稱]
  [功能簡述]

  Scenario: [場景名稱]
    Given [前置條件]
    And [額外前置條件]（可選）
    When [動作/觸發]
    And [額外動作]（可選）
    Then [預期結果]
    And [額外預期]（可選）
```

### 語法規則

- **Given**：描述系統的初始狀態（資料庫中有使用者、服務正在運行...）
- **When**：描述觸發行為的動作（使用者點擊、API 被呼叫...）
- **Then**：描述可觀察的預期結果（回應 200、資料庫更新...）
- **And**：延伸上一個步驟，避免 Given/When/Then 重複

### 寫作原則

1. 使用**業務語言**而非技術語言（「使用者登入」非「POST /api/auth」）
2. 每個 Scenario 測試**一個行為**
3. Given 描述**可觀察狀態**，不描述實作細節
4. Then 描述**可驗證結果**，不描述內部狀態

## spec/verify 雙模式

### TEST:spec（DEV 前）

- **時機**：在 developer 開始寫碼前
- **目的**：定義「做完長什麼樣」
- **產出**：`openspec/specs/{feature}.md` 中的行為規格
- **誰寫**：tester agent（mode: spec）
- **輸入**：architect 或 planner 的 Handoff

### TEST:verify（DEV 後）

- **時機**：在 developer 完成實作後
- **目的**：驗證「做完的東西是否符合規格」
- **產出**：測試結果（PASS / FAIL）
- **誰寫**：tester agent（mode: verify）
- **輸入**：developer 的 Handoff + BDD spec

## 最少場景規則

📋 每個 Feature MUST 包含至少 3 個 Scenario：

1. **Happy Path** — 正常流程，預期成功
2. **Edge Case** — 邊界條件（空值、超長字串、並行操作...）
3. **Error Case** — 錯誤處理（無效輸入、權限不足、服務不可用...）

## Scenario Outline（資料驅動）

當多個場景結構相同但資料不同時，使用 Scenario Outline：

```gherkin
Scenario Outline: 驗證密碼強度
  Given 使用者在註冊頁面
  When 使用者輸入密碼 "<password>"
  Then 系統顯示強度為 "<strength>"

  Examples:
    | password    | strength |
    | abc         | 弱       |
    | Abc12345    | 中       |
    | Abc!@#12345 | 強       |
```

## 安全功能的 BDD spec

涉及認證、支付、安全敏感功能時，BDD spec 📋 MUST 額外涵蓋：

### 攻擊場景

```gherkin
Scenario: 阻擋 SQL injection 攻擊
  Given 使用者在登入頁面
  When 使用者輸入帳號 "admin' OR '1'='1"
  And 使用者輸入密碼 "anything"
  Then 系統回傳「帳號或密碼錯誤」
  And 系統記錄此次可疑登入嘗試
```

### 安全 BDD spec 必要場景

1. **正常認證/授權流程**
2. **無效/過期 token 處理**
3. **注入攻擊防護**（SQL、XSS、命令注入）
4. **權限越界嘗試**（水平/垂直提權）
5. **暴力破解防護**（rate limiting）

## OpenSpec 整合

BDD spec 存放在 `openspec/specs/` 目錄下：

```
openspec/
├── specs/
│   ├── auth.md        # 認證行為規格
│   ├── user-crud.md   # 使用者 CRUD 行為規格
│   └── payment.md     # 支付行為規格
├── proposal.md        # PLAN 產出（大功能）
└── design.md          # ARCH 產出（大功能）
```

### 何時啟用 OpenSpec

- **大功能**（standard/full/secure）→ 啟用完整 OpenSpec（proposal + design + specs）
- **中型任務**（tdd/refactor）→ 只啟用 specs
- **小任務**（single/quick/debug）→ 跳過 OpenSpec

## Tag 分類

為 Scenario 加上 tag 分類便於選擇性執行：

```gherkin
@smoke @auth
Scenario: 使用有效帳密登入
  ...

@security @auth
Scenario: 阻擋暴力破解
  ...

@edge-case @auth
Scenario: 同時登入多個裝置
  ...
```

常用 tag：`@smoke`（冒煙測試）、`@security`（安全）、`@edge-case`（邊界）、`@regression`（回歸）、`@slow`（慢測試）
