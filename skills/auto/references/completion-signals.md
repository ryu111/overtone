# 完成信號定義

> 📋 **何時讀取**：判斷工作流是否可以結束時。

## 三信號基準

所有工作流的最低完成條件：

| # | 信號 | 類型 | 說明 |
|:-:|------|:----:|------|
| 1 | lint 0 error | 確定性 | 靜態分析無錯誤 |
| 2 | test 0 fail | 確定性 | 所有測試通過 |
| 3 | code-review PASS | AI 判斷 | 審查員認可程式碼品質 |

### 優先規則

**確定性信號優先於 AI 判斷**：
- lint/test 是客觀指標，0 就是 0
- code-review 是主觀判斷，可能有邊界情況
- 當 lint/test 通過但 review 仍有疑慮時，以 lint/test 結果為底線

## 各 Workflow 信號清單

| Workflow | 信號 |
|----------|------|
| single | DEV 完成（無品質檢查） |
| quick | lint 0 error + test 0 fail + review PASS |
| standard | lint 0 error + test 0 fail + review PASS |
| full | lint 0 error + test 0 fail + review PASS + **QA PASS** + **E2E PASS** |
| secure | lint 0 error + test 0 fail + review PASS + **security PASS** |
| tdd | test 0 fail |
| debug | test 0 fail（bug 修復且測試通過） |
| refactor | test 0 fail + review PASS（行為不變 + 品質認可） |
| review-only | review PASS / REJECT |
| security-only | security PASS / REJECT |
| build-fix | build 0 error |
| e2e-only | E2E PASS / FAIL |

## 完成判定邏輯

```
工作流完成 = 所有 stages completed AND 對應信號全部 PASS
```

- 所有 stages completed：每個階段的 agent 都回報了結果
- 信號全部 PASS：對應 workflow 的所有信號都滿足
- 任一信號 FAIL：啟動失敗處理流程（詳見 failure-handling.md）
