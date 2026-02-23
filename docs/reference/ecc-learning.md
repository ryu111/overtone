# ECC 持續學習與驗證系統

> 來源：[everything-claude-code](https://github.com/affaan-m/everything-claude-code)

## 核心機制：三層知識進化

### 1. Continuous Learning v2（觀察引擎）

```
Hook 觀察（100% 捕捉）
  PreToolUse / PostToolUse → observations.jsonl
      ↓
Observer Agent（Haiku，後台）
  每 5 分鐘分析觀察 → 偵測 4 種 pattern
      ↓
Instinct 建立（原子知識）
  一個觸發條件 + 一個行動 + 信心分數
      ↓
進化路徑
  Instinct(0.3) → Cluster(≥3同tag) → Skill/Command/Agent
```

**四種 Pattern 偵測**：
| 類型 | 來源 | 範例 |
|------|------|------|
| user_corrections | 使用者回饋修正 | 「我偏好 tabs 不是 spaces」 |
| error_resolutions | 除錯修復過程 | 「ESM import 需要 .js 副檔名」 |
| repeated_workflows | 重複工作流模式 | 「每次都先跑 lint 再 commit」 |
| tool_preferences | 工具選擇偏好 | 「偏好用 Grep 不用 Bash grep」 |

**信心分數生命週期**：
```
0.3（初始觀察）
  +0.05 / 每次確認
  -0.10 / 矛盾觀察
  -0.02 / 每週未驗證（衰減）
      ↓
≥ 0.7 → 自動應用
≥ 0.7 + ≥5 instincts 同 tag → 可進化為 Skill
≥ 0.8 + ≥8 instincts + 多步驟 → 可進化為 Agent
```

**vs Vibe 的 `/evolve`**：
| 面向 | ECC | Vibe |
|------|-----|------|
| 觀察觸發 | Hook 自動 + 5min 定期 | 使用者手動 `/evolve` |
| 信心計算 | 自動計分 + 衰減 | 手動評估 |
| 衰減機制 | ✅ 0.02/week | ❌ 無 |
| 進化目標 | skill / agent / command | skill / agent |
| 後台觀察 | ✅ Haiku agent | ❌ 主 context |

### 2. Verification Loop（6 階段品質驗證）

```
Stage 1: Build     → 編譯檢查
Stage 2: Types     → 型別檢查（tsc --noEmit）
Stage 3: Lint      → 靜態分析（ESLint/Ruff）
Stage 4: Tests     → 單元+整合測試
Stage 5: Security  → 安全掃描
Stage 6: Diff      → 變更影響分析
```

**vs Vibe**：Vibe 分散在 `/vibe:lint`、`/vibe:tdd`、`/vibe:security`，無統一驗證 skill。

### 3. Eval-Driven Development（EDD）

```
DEFINE  → 定義 capability + regression evals
IMPLEMENT → 寫碼使 evals 通過
EVALUATE → 三類 grader（code-based / model-based / human）
METRICS → pass@k 指標
```

**pass@k 指標**：
- pass@1：首次成功率
- pass@3：3 次內成功率（目標 >90%）
- pass^3：連續 3 次全成功（關鍵路徑用）

**vs Vibe**：Vibe 無 eval 前置定義、無 pass@k 量化。

## 其他重要機制

### Iterative Retrieval（4 循環搜尋）

解決子 agent 不知道需要什麼 context 的問題：
```
DISPATCH → 初始廣泛查詢
EVALUATE → 評分相關性（0-1）
REFINE → 更新搜尋條件
LOOP → 直到 ≥3 個高相關檔案（max 3 cycles）
```

### Strategic Compact（策略性壓縮）

- 累計 50+ 工具呼叫後建議壓縮
- 在邏輯邊界提示（探索完成 → 實作開始）
- 使用者自主決策，非自動觸發

## 對 Overtone 的啟示

### 高優先採納
1. **Instinct 衰減機制** — 自動清理低信心知識，避免累積
2. **Verification Loop** — 統一 6 階段驗證 skill
3. **Strategic Compact 提示** — 邏輯邊界壓縮（vs Vibe 的任意壓縮）

### 中優先考慮
4. **pass@k 指標** — 量化測試可靠性
5. **Iterative Retrieval** — 子 agent context 最優化
6. **Background Observer** — 不佔主 context 的持續觀察

### 低優先（備查）
7. **Eval-Define 前置步驟** — 概念好但增加流程複雜度
8. **Model Grader** — 開放式評估（成本高）
