# defer Hook 升級 Spec

## 狀態：可行但範圍有限

### 結論
defer 在 v2.1.90 已可用，但只適合 headless `-p` 模式的審批場景，不適合取代 AskUserQuestion 的 CLI 互動通知。

### 可升級項目
- guards.js 中 headless 模式的危險命令攔截 → 改用 `{ decision: "defer" }` + 外部 `--resume` 批准
- 不適用：AskUserQuestion 通知（CLI 互動必須 `return false` 讓 CLI 正常顯示）

### 暫不執行
目前 Nova 主要用互動模式，headless 審批場景少。等 headless 自驅模式更成熟再升級。
