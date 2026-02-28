---
name: ref-bdd-guide
description: BDD 行為規格快速參考：GIVEN/WHEN/THEN 語法、spec/verify 雙模式、最少場景規則。
disable-model-invocation: true
user-invocable: false
---

# BDD 行為規格快速參考

## GIVEN/WHEN/THEN 語法

```
Scenario: [場景名稱]
  Given [前置條件]
  And [額外前置條件]（可選）
  When [動作/觸發]
  Then [預期結果]
  And [額外預期]（可選）
```

- **Given**：系統初始狀態
- **When**：觸發行為的動作
- **Then**：可觀察的預期結果
- **And**：延伸上一個步驟

使用業務語言（「使用者登入」非「POST /api/auth」）。

## spec/verify 雙模式

| 模式 | 時機 | 產出 |
|------|------|------|
| TEST:spec | DEV 前 | `specs/features/in-progress/{featureName}/bdd.md` |
| TEST:verify | DEV 後 | 測試結果（PASS / FAIL） |

## 最少場景規則

📋 每個 Feature MUST 包含至少 3 個 Scenario：

1. **Happy Path** — 正常流程，預期成功
2. **Edge Case** — 邊界條件（空值、超長字串、並行操作）
3. **Error Case** — 錯誤處理（無效輸入、權限不足）
