# 失敗處理完整指南

> 📋 **何時讀取**：當 agent 回報 FAIL 或 REJECT 時讀取此文件。

## TEST FAIL 迴圈

當 tester 回報 FAIL：

```
tester FAIL → debugger（診斷根因）→ developer（修復）→ tester（重驗）
```

### 流程細節

1. **debugger 診斷**
   - 接收 tester 的 Handoff（含失敗的測試案例和錯誤訊息）
   - 產出 Handoff：根因分析 + 假設驗證 + 修復建議
   - ⛔ debugger 不寫碼，只做唯讀診斷

2. **developer 修復**
   - 接收 debugger 的 Handoff
   - 依據診斷結果修復程式碼
   - 產出 Handoff：修復內容 + 修改的檔案清單

3. **tester 重驗**
   - 接收 developer 的 Handoff + 原始 BDD spec
   - 重新執行測試，驗證修復

### 重試上限

- `failCount < 3` → 繼續迴圈
- `failCount >= 3` → **停止**，提示使用者介入

### 停止訊息格式

```
⚠️ 測試已失敗 3 次，需要人工介入。

失敗摘要：
- 第 1 次：[原因]
- 第 2 次：[原因]
- 第 3 次：[原因]

建議下一步：
1. 檢查失敗的測試是否合理
2. 手動分析根因
3. 調整測試或程式碼後重新啟動
```

## REVIEW REJECT 迴圈

當 code-reviewer 回報 REJECT：

```
code-reviewer REJECT → developer（帶 reject 原因修復）→ code-reviewer（再審）
```

### 流程細節

1. **developer 修復**
   - 接收 code-reviewer 的 Handoff（含 REJECT 原因 + 具體問題清單）
   - 逐一處理每個審查問題
   - 產出 Handoff：修復內容 + 對每個問題的回應

2. **code-reviewer 再審**
   - 接收 developer 的 Handoff
   - 驗證所有問題已解決
   - 產出 PASS 或再次 REJECT

### 重試上限

- `rejectCount < 3` → 繼續迴圈
- `rejectCount >= 3` → **停止**，提示使用者介入

## SECURITY REJECT 處理

當 security-reviewer 回報 REJECT：

### Critical/High 級別

- 📋 MUST 修復後重審，**不可忽略**
- 不計入 rejectCount 上限（安全問題無限重試直到 PASS）
- 流程：`developer（修復安全問題）→ security-reviewer（重審）`

### Medium/Low 級別

- 記錄到 Handoff 中
- 由使用者決定是否修復
- 不阻擋工作流繼續

## 使用者介入觸發條件

以下情況 📋 MUST 停止並請求使用者介入：

1. TEST FAIL 達到 3 次上限
2. REVIEW REJECT 達到 3 次上限
3. agent 回報無法處理的錯誤（如缺少必要依賴）
4. 循環中出現相同的失敗原因（無進展）

## RETRO ISSUES 處理

當 retrospective agent 回報 ISSUES：

```
retrospective ISSUES → developer（修復建議）→ [REVIEW + TEST] → retrospective（上限 3 次）
```

### 流程細節

1. **Main Agent 自動評估並觸發修復**
   - 閱讀 retrospective 的 Handoff，理解具體改善建議
   - 📋 MUST 自動委派 developer 修復所有 ISSUES（📋 MUST NOT 詢問用戶）
   - retroCount 遞增

2. **重跑 quality gate**
   - 📋 MUST 修復後重新並行執行 [REVIEW + TEST]，確認修復有效
   - 通過後再次委派 retrospective 執行下一輪回顧

3. **達到上限時**
   - `retroCount >= 3` → 📋 MUST 停止迭代，繼續完成剩餘 stages（如 DOCS）

### 重試上限

- `retroCount < 3` → 📋 MUST 繼續修復迴圈
- `retroCount >= 3` → 📋 停止迭代，繼續完成 workflow

### 與其他失敗的差異

| 類型 | 計數器 | 強制修復？ |
|------|--------|-----------|
| TEST FAIL | failCount | ✅ 是 |
| REVIEW REJECT | rejectCount | ✅ 是 |
| RETRO ISSUES | retroCount | ✅ 是（上限 3 次） |
