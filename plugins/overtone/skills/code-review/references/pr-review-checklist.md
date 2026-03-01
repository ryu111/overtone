# PR Review 多維度檢查清單

> 來源：Anthropic 官方 `awattar/claude-code-best-practices`

## 四階段 Review 流程

```
Analyze → Review → Feedback → Iterate
```

| 階段 | 動作 |
|------|------|
| **Analyze** | 檢查 CI/CD 狀態、讀取 PR description、理解變更範圍 |
| **Review** | 按四維度逐項檢查（見下方） |
| **Feedback** | 結構化回饋（Critical / Major / Minor 分類） |
| **Iterate** | 追蹤修復狀態、re-review 驗證 |

## 維度 1：Code Quality

- [ ] 命名清晰、語意明確
- [ ] 函式職責單一（SRP）
- [ ] 無 code smell（重複、過長方法、過深巢狀）
- [ ] Error handling 完整（邊界條件、異常路徑）
- [ ] 類型安全（無隱式轉換、無 any 濫用）
- [ ] 無 dead code 或無用 import

## 維度 2：Security

- [ ] 無硬編碼 credentials / secrets / API keys
- [ ] 使用者輸入已驗證和消毒（injection 防護）
- [ ] 認證/授權邏輯正確（無 bypass 路徑）
- [ ] 敏感資料未暴露在 log 或錯誤訊息中
- [ ] 依賴無已知漏洞（CVE）
- [ ] 遵循最小權限原則

## 維度 3：Performance

- [ ] 無 N+1 查詢問題
- [ ] 適當使用快取（避免不必要的重複計算）
- [ ] 大量資料操作使用分頁/串流
- [ ] 無記憶體洩漏風險（事件監聽器、定時器清理）
- [ ] 非同步操作適當並行化
- [ ] Bundle size 影響評估（前端）

## 維度 4：Observability

- [ ] 關鍵操作有結構化 logging
- [ ] 錯誤有足夠的 context（stack trace、request ID）
- [ ] 效能關鍵路徑有 metrics / timing
- [ ] 敏感資料未出現在 log 中
- [ ] Health check endpoint 涵蓋新功能

## 回饋分類

| 等級 | 定義 | 處理 |
|------|------|------|
| **Critical** | 阻擋合併：安全漏洞、資料損失風險、邏輯錯誤 | MUST 修復 |
| **Major** | 建議修復：效能問題、設計缺陷、缺少測試 | Should 修復 |
| **Minor** | 可選改善：命名、格式、文件補充 | Consider |
| **Nitpick** | 個人偏好 | 不阻擋合併 |
