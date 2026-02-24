---
name: qa
description: 行為驗證。委派 qa agent 從使用者角度逐條驗證 BDD spec，探索邊界條件和異常輸入。
disable-model-invocation: true
---

# 行為驗證（QA）

## Stage

委派 `qa` agent。

- **輸入**：BDD spec（`openspec/specs/`）+ developer/tester 的 Handoff
- **產出**：Handoff（每個 scenario 的 PASS/FAIL + 探索發現）

## 使用場景

- 需要從使用者角度驗證功能行為
- 自動化測試通過但需要額外的探索式驗證
- 單獨執行 QA 驗證（不在 full workflow 中）

## 後續

- QA PASS → 繼續流程
- QA FAIL → 委派 debugger 分析 → developer 修復 → 再次 QA
