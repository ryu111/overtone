# R4 全自動閉環端到端真實驗證 — 技術設計

## 深度路由：D2
**理由**：修復 1 處根因 bug + 更新 1 個測試檔案 + 歸檔。無安全敏感操作、跨 2 個檔案但邏輯單純。

---

## 技術摘要

- **方案**：修復 `decayConfidence` 浮點精度問題（根因）+ 更新測試（強化驗證） + 歸檔
- **理由**：根因分析確認 confidence 邊界 0.6 在極小時間差衰減後變為 0.5999... < 0.6，導致 `lookupPattern` 失敗。這不只是測試 flaky，而是生產環境中 `recordOutcome` 後「立即」`lookupPattern` 也會失敗的真實 bug
- **取捨**：修改 `decayConfidence` 需同步確認無 regression（其他消費者：`prunePatterns`、`capability-probe.decayCount`）

## 方案比較

| 維度 | A：修復 decayConfidence（選擇） | B：只修測試（放寬門檻） |
|------|:----------------------------:|:--------------------:|
| 根因修復 | 是 — 生產環境也受益 | 否 — 只掩蓋症狀 |
| 影響範圍 | 低（1 個函式加 Math.round） | 低（1 個測試檔案） |
| Regression 風險 | 低 — 只影響 < 1 天的衰減 | 無 |
| 長期穩定性 | 高 — 邊界條件永久消除 | 低 — 其他邊界場景仍存在 |
| **結論** | 選擇 — 治本 | 不選 — 治標 |

## 根因分析

### Bug 描述

`decayConfidence(confidence, daysSinceLastSeen)` 使用 `confidence * Math.pow(0.8, daysSinceLastSeen / 30)` 計算衰減。當 `daysSinceLastSeen` 極小但非零時（即使只差 1 毫秒 = 1.16e-8 天），`Math.pow(0.8, 1.16e-8/30)` = `0.99999999...`，乘以 0.6 得 `0.59999999...` < 0.6。

### 重現路徑

```
recordOutcome → pat.confidence = 0.6, pat.lastSeen = "2026-03-17T00:00:00.000Z"
          ↓ 1ms 後
lookupPattern → ageDays = 1.16e-8
             → decayConfidence(0.6, 1.16e-8) = 0.599999999948 < 0.6
             → 門檻 c >= 0.6 不通過 → 回傳 null
```

### 修復方案

在 `decayConfidence` 中加入 1 天以下不衰減的保護：

```javascript
export function decayConfidence(confidence, daysSinceLastSeen) {
  if (daysSinceLastSeen <= 1) return confidence;  // 1 天內不衰減
  return confidence * Math.pow(0.8, daysSinceLastSeen / 30);
}
```

**理由**：衰減的設計意圖是處理「長時間未見」的模式，而非「毫秒級時間差」。1 天的衰減量 = `0.8^(1/30)` ≈ 0.9926，即 0.74% 的衰減，這在實際使用中完全可以忽略。

## 模組介面

### 修改檔案

| # | 檔案 | 變更內容 |
|---|------|---------|
| 1 | `~/.claude/scripts/task-adapter.js` | `decayConfidence` 加入 daysSinceLastSeen <= 1 保護 |
| 2 | `~/projects/overtone/tests/unit/r4-self-drive-loop.test.js` | 無需修改（根因修復後測試自然通過） |

### 不新增檔案

## 資料模型

- 無變更。task-patterns.json 格式不變。

## 執行步驟

### Phase 1：根因修復（sequential）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 1 | `task-adapter.js` | 修改 `decayConfidence`：`daysSinceLastSeen <= 1` 時直接回傳原始 confidence |

### Phase 2：驗證（sequential，依賴 Phase 1）

| 步驟 | 說明 |
|------|------|
| 2 | `bun test tests/unit/r4-self-drive-loop.test.js` 確認能力 5 穩定通過 |
| 3 | `bun test` 全量測試確認無 regression |
| 4 | 連續執行 5 次確認無 flaky |

### Phase 3：歸檔（sequential，依賴 Phase 2）

| 步驟 | 說明 |
|------|------|
| 5 | `spec/change/r4-e2e-verification/` → `spec/archive/r4-e2e-verification/` |
| 6 | 更新 spec.md 驗收標準為 checked |

## Pre-mortem

| # | 失敗情境 | 機率 | 影響 | 預防措施 |
|---|---------|:----:|:----:|---------|
| 1 | `decayConfidence` 修改影響 `prunePatterns`（也用 decayConfidence） | 低 | 低 | prunePatterns 的門檻是 30 天 + 0.3，1 天保護不影響 |
| 2 | capability-probe.js 的 `decayCount` 有類似問題 | 中 | 低 | decayCount 用於 coverageHits/missingHits（整數 round），不受浮點影響 |
| 3 | 修改 task-adapter.js 引入新 bug | 低 | 中 | 只加 1 行 guard，既有測試全量驗證 |

## 測試策略

| 測試檔案 | 驗收條件 |
|---------|---------|
| r4-self-drive-loop.test.js | 10/10 pass，連續 5 次穩定 |
| 全量 bun test | 0 regression |

## 不做什麼

1. **不修改測試的 confidence 門檻**：那是治標不治本，生產環境同樣受此 bug 影響
2. **不修改 capability-probe.js 的 decayCount**：decayCount 使用 Math.round 將結果取整數，不受浮點精度影響
