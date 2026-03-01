# 並行群組規則

> 📋 **何時讀取**：執行到含並行群組的 workflow stages 時。

## 三個並行群組

| 群組名 | Stages | 使用於 |
|--------|--------|--------|
| `quality` | REVIEW + TEST:verify | quick, standard, refactor |
| `verify` | QA + E2E | full |
| `secure-quality` | REVIEW + TEST:verify + SECURITY | secure |

## 執行方式

📋 MUST 在**同一訊息中**發送多個 Task 呼叫，讓 ECC 原生並行執行。

### 語法範例（quality 群組）

在同一個回應中同時呼叫兩個 Task：

```
Task 1: 委派 code-reviewer agent
- 輸入：developer 的 Handoff
- 期望產出：PASS / REJECT

Task 2: 委派 tester agent（mode: verify）
- 輸入：developer 的 Handoff + BDD spec
- 期望產出：PASS / FAIL
```

### 語法範例（secure-quality 群組）

在同一個回應中同時呼叫三個 Task：

```
Task 1: code-reviewer（REVIEW）
Task 2: tester（TEST:verify）
Task 3: security-reviewer（SECURITY）
```

## 等待規則

1. **全部完成才繼續**：並行群組中所有 agent 都完成後才進入下一階段
2. **任一失敗即處理**：任何 agent 回報 FAIL/REJECT 時，啟動對應的失敗處理流程
3. **失敗處理不影響其他**：處理 REVIEW REJECT 時，TEST 的結果保留不重做
4. **二次並行群組依賴第一組**：full workflow 中 [QA + E2E] 等 [REVIEW + TEST] 全部通過後才開始

## 雙重失敗協調規則

並行群組中同時發生多個失敗時，優先順序如下：

**優先順序：TEST FAIL > REVIEW REJECT**

理由：TEST FAIL 代表程式碼根本有問題，REVIEW REJECT 只是品質問題。先修測試失敗後，審查問題通常一起解決。

### 協調提示（同時發生時）

📋 MUST 以 TEST FAIL 為主要失敗路徑：

```
主要失敗（TEST FAIL）：委派 DEBUGGER 分析根因 → DEVELOPER 修復
帶入 REJECT 原因：DEVELOPER 修復時同時帶入 REVIEW 的 reject 原因
重做順序：DEVELOPER 修復 → 再次並行 [REVIEW + TEST]
```

不可分別進入兩個獨立的修復路徑，會導致無限迴圈。

### 單一失敗（REVIEW REJECT，TEST PASS）

```
委派 DEVELOPER 修復（帶 reject 原因）→ REVIEWER 再審
TEST 結果保留，不重做
```

### 單一失敗（TEST FAIL，REVIEW PASS）

```
委派 DEBUGGER 分析根因 → DEVELOPER 修復 → TESTER 驗證
REVIEW 結果保留，不重做
```

## 不可並行的情況

以下 stages 📋 MUST 序列執行，不可並行：

- PLAN → ARCH（架構依賴規劃）
- ARCH → TEST:spec（規格依賴架構）
- TEST:spec → DEV（開發依賴規格）
- DEV → 任何品質檢查（檢查依賴程式碼）
