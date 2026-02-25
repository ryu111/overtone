---
name: verify
description: 統一 6 階段驗證。依序執行 Build → Types → Lint → Tests → Security → Diff 完整品質檢查。
disable-model-invocation: true
---

# 統一驗證（Verify）

依序執行 6 個驗證階段。每階段根據專案類型自動偵測對應命令。

💡 完整語言×命令矩陣：讀取 `${CLAUDE_PLUGIN_ROOT}/skills/verify/references/language-commands.md`

## 階段摘要

| # | 階段 | 失敗時 | 說明 |
|:-:|------|:------:|------|
| 1 | Build | 📋 停止 | 偵測構建命令並執行 |
| 2 | Types | 📋 停止 | 型別檢查（tsc/mypy/go vet） |
| 3 | Lint | 💡 繼續 | 靜態分析，記錄警告數 |
| 4 | Tests | 📋 停止 | 執行測試套件 |
| 5 | Security | 💡 繼續 | 基本安全掃描 + .env 檢查 |
| 6 | Diff | 📊 資訊 | git diff 變更摘要 |

無對應工具時標記 ⏭️ 跳過，不報錯。

## 輸出格式

每階段完成後回報結果：

```
## 驗證結果

| 階段 | 狀態 | 說明 |
|------|:----:|------|
| Build | ✅/❌/⏭️ | [結果摘要] |
| Types | ✅/❌/⏭️ | [結果摘要] |
| Lint | ✅/⚠️/⏭️ | [警告數量] |
| Tests | ✅/❌/⏭️ | [通過/失敗數量] |
| Security | ✅/⚠️/⏭️ | [漏洞數量] |
| Diff | 📊 | [變更統計] |
```

## 三信號驗證

完整驗證 = lint 0 error + test 0 fail + code-review PASS。
確定性信號（lint/test）優先於 AI 判斷（review）。
