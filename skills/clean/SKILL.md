---
name: clean
description: 死碼清理。委派 refactor-cleaner agent 使用 knip/depcheck 偵測並清理未使用的 exports、依賴和檔案。
disable-model-invocation: true
---

# 死碼清理（Clean）

## Stage

委派 `refactor-cleaner` agent。

- **輸入**：現有 codebase（或使用者指定的清理範圍）
- **產出**：Handoff（清理報告 + 修改清單 + build/test 驗證結果）

## 清理流程

1. 偵測專案類型，選擇工具（knip / depcheck / ts-prune）
2. 執行工具取得未使用項目報告
3. 逐一確認後安全刪除（排除動態引用）
4. 每次刪除後驗證 build + test

## 使用場景

- 定期清理專案中的死碼
- 重構後清理不再需要的 exports 和依賴
- 上線前減少 bundle size

## 後續

- 清理完成且 build/test 通過 → 結束
- 清理導致 build 失敗 → 自動回滾最後一次刪除
- 無法確認的項目 → 標記為需人工確認
