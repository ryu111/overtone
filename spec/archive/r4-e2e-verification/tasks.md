# R4 E2E 驗證 — 任務清單

## Phase 1：根因修復（sequential）

### T1: 修復 decayConfidence 浮點精度 bug
- **執行者**：executor
- **檔案**：`~/.claude/scripts/task-adapter.js`
- **變更**：
  ```javascript
  // 修改前
  export function decayConfidence(confidence, daysSinceLastSeen) {
    if (daysSinceLastSeen <= 0) return confidence;
    return confidence * Math.pow(0.8, daysSinceLastSeen / 30);
  }

  // 修改後
  export function decayConfidence(confidence, daysSinceLastSeen) {
    if (daysSinceLastSeen <= 1) return confidence;  // 1 天內不衰減，避免浮點精度問題
    return confidence * Math.pow(0.8, daysSinceLastSeen / 30);
  }
  ```
- **根因**：`recordOutcome` 和 `lookupPattern` 之間即使只差 1ms，`Math.pow(0.8, 1.16e-8/30)` = 0.999... 使 0.6 衰減為 0.5999... < 0.6 門檻
- **驗收**：修改後 `decayConfidence(0.6, 0.5)` 回傳 `0.6`

## Phase 2：驗證（sequential，依賴 Phase 1）

### T2: 驗證測試穩定性
- **執行者**：executor
- **命令**：
  1. `bun test tests/unit/r4-self-drive-loop.test.js`（單獨執行 5 次，全部 10 pass）
  2. `bun test`（全量執行，0 regression）
- **驗收**：
  - 能力 5 測試穩定通過（5/5 次）
  - 全量測試 0 fail
  - 總執行時間 < 5 秒

## Phase 3：歸檔（sequential，依賴 Phase 2）

### T3: 歸檔 spec/change
- **執行者**：executor
- **步驟**：
  1. 更新 `spec/change/r4-e2e-verification/spec.md` 驗收標準為 `[x]`
  2. `mv spec/change/r4-e2e-verification/ spec/archive/r4-e2e-verification/`
- **驗收**：`spec/change/r4-e2e-verification/` 不存在、`spec/archive/r4-e2e-verification/` 存在且內容完整
