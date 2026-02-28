---
name: ref-failure-handling
description: 失敗處理快速參考：TEST FAIL / REVIEW REJECT / RETRO ISSUES 三種迴圈和重試上限。
disable-model-invocation: true
user-invocable: false
---

# 失敗處理快速參考

## TEST FAIL 迴圈

```
tester FAIL → debugger（診斷根因）→ developer（修復）→ tester（重驗）
```

- `failCount < 3` → 繼續迴圈
- `failCount >= 3` → 停止，提示使用者介入

## REVIEW REJECT 迴圈

```
code-reviewer REJECT → developer（帶 reject 原因修復）→ code-reviewer（再審）
```

- `rejectCount < 3` → 繼續迴圈
- `rejectCount >= 3` → 停止，提示使用者介入

## RETRO ISSUES 迴圈

```
retrospective ISSUES → developer（修復）→ [REVIEW + TEST] → retrospective
```

- `retroCount < 3` → 繼續修復迴圈
- `retroCount >= 3` → 停止迭代，繼續完成剩餘 stages

## 重試上限：3 次

三種失敗類型均以 3 次為上限，超過則停止並請求使用者介入。
