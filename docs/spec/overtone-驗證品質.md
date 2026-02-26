# Overtone 驗證與品質

> 本文件是 [Overtone 規格文件](overtone.md) 的子文件。
> 主題：三信號驗證、pass@k 指標、Model Grader、Instinct 系統
> 版本：v0.6

---

## 驗證與品質

### /ot:verify 統一 6 階段

```
1️⃣ Build    npm run build / go build
   └─ 失敗 → 停止，回報錯誤

2️⃣ Types    tsc --noEmit / mypy
   └─ 失敗 → 停止，回報型別錯誤

3️⃣ Lint     eslint / ruff / golangci-lint
   └─ 失敗 → 繼續（記錄警告）

4️⃣ Tests    npm test / pytest / go test
   └─ 失敗 → 停止，回報失敗測試

5️⃣ Security 基本安全掃描
   └─ 結果只報告，不阻擋

6️⃣ Diff     git diff 變更影響分析
   └─ 顯示變更摘要
```

### 三信號驗證

工作流完成 = **lint 0 error + test 0 fail + code-review PASS**

確定性信號（lint/test）優先於 AI 判斷（review）。

### pass@k 指標

| 指標 | 定義 | 用途 |
|------|------|------|
| pass@1 | 首次成功率 | Agent 基本可靠性 |
| pass@3 | 三次內成功率（目標 >90%） | 含重試的可靠性 |
| pass^3 | 連續三次全成功 | 關鍵路徑穩定性 |

記錄在 Dashboard History Tab。

### Model Grader

用 Haiku 快速評分開放式品質：
- 錯誤訊息友善度
- API 命名語意清晰度
- 文件可讀性

---

## 持續學習：Instinct 系統

### 架構（ECC 風格）

```
Hook 觀察（自動捕捉）
  PostToolUse / SubagentStop → observations.jsonl
      ↓
4 種 Pattern 偵測
  user_corrections    使用者修正
  error_resolutions   錯誤解決
  repeated_workflows  重複工作流
  tool_preferences    工具偏好
      ↓
Instinct 建立（原子知識）
  一個觸發條件 + 一個行動 + 信心分數
      ↓
信心分數生命週期
  0.3（初始）→ +0.05/確認 → -0.10/矛盾 → -0.02/週衰減
  ≥ 0.7 → 自動應用
  < 0.2 → 自動刪除
      ↓
進化路徑
  ≥ 5 instincts 同 tag → Skill
  ≥ 8 instincts + 多步驟 → Agent
  單一動作 → Command
```
