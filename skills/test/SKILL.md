---
name: test
description: 獨立測試。委派 tester agent 執行 BDD spec 撰寫或測試驗證，支援 spec/verify 兩種模式。
disable-model-invocation: true
---

# 測試（Test）

## 模式選擇

根據使用者需求或 `$ARGUMENTS` 判斷模式：

| 關鍵字 | 模式 | tester 做什麼 |
|--------|------|--------------|
| `spec`、「寫規格」、「定義行為」 | **spec** | 撰寫 GIVEN/WHEN/THEN 行為規格到 `openspec/specs/` |
| `verify`、「跑測試」、「驗證」、無指定 | **verify** | 撰寫並執行測試程式碼 |

## Stage

委派 `tester` agent。

**Spec 模式**：
- **輸入**：使用者需求描述或前階段 Handoff
- **產出**：`openspec/specs/` 中的 GIVEN/WHEN/THEN 行為規格
- 📋 每個 Feature 至少 3 個 Scenario（happy path + edge case + error）

**Verify 模式**：
- **輸入**：BDD spec（`openspec/specs/`）+ 程式碼變更
- **產出**：測試結果（PASS / FAIL）
- 📋 對照 BDD spec 逐條撰寫並執行測試

## 使用場景

- 只想跑測試，不啟動完整工作流
- 開發完成後單獨驗證
- 先寫行為規格再決定工作流

## 後續

- TEST PASS → 繼續流程或結束
- TEST FAIL → 委派 debugger 分析 → developer 修復 → 再次 test
