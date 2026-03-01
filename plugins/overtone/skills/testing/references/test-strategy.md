# 測試策略五階段快速參考

> 來源：Anthropic 官方 `awattar/claude-code-best-practices`

## 五階段流程

```
Assess → Run → Improve → Validate → Report
```

### 1. Assess（評估）

- 偵測測試框架（Jest / Vitest / pytest / bun:test 等）
- 評估現有測試覆蓋率
- 識別未覆蓋的關鍵路徑
- 確認測試範圍（file / directory / feature / all）

### 2. Run（執行）

- 執行目標範圍的測試套件
- 記錄失敗測試和錯誤訊息
- 識別 flaky test（多次執行結果不一致）
- 收集效能指標（測試執行時間）

### 3. Improve（改善）

- 修復失敗的測試（優先修復非 flaky 失敗）
- 補充缺失的測試案例：
  - Happy path（正常流程）
  - Edge case（邊界條件）
  - Error case（錯誤處理）
- 提升覆蓋率（聚焦未覆蓋的關鍵邏輯）

### 4. Validate（驗證）

- 重新執行完整測試套件
- 確認無回歸（新測試不破壞舊功能）
- 驗證修復的測試穩定通過（非偶然）
- 確認覆蓋率達標

### 5. Report（報告）

- 測試結果總結（pass / fail / skip 計數）
- 覆蓋率數據（before → after）
- 已修復的問題清單
- 仍存在的風險和建議

## Flaky Test 偵測

```
# 多次執行同一測試確認穩定性
bun test --repeat 3 <test-file>
```

判定標準：相同測試 3 次執行中有不一致的結果 → flaky

## 測試分類優先級

| 優先級 | 測試類型 | 說明 |
|--------|---------|------|
| P0 | 核心業務邏輯 | 直接影響使用者的功能 |
| P1 | 整合點 | API 邊界、模組間互動 |
| P2 | Edge case | 邊界值、異常輸入 |
| P3 | 效能/壓力 | 大量資料、並行操作 |

## 與 Overtone BDD 的映射

| 五階段 | Overtone 對應 |
|--------|---------------|
| Assess | TEST:spec（DEV 前定義行為規格） |
| Run + Improve | DEV（開發中執行測試） |
| Validate | TEST:verify（DEV 後驗證通過） |
| Report | Handoff 結果（PASS/FAIL + 細節） |
