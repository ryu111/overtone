# Proposal

## 功能名稱

`test-suite-slimdown`

## 需求背景（Why）

- **問題**：測試套件以約 550 tests/月的速度膨脹，目前達 3235 tests / 138 files，`bun test` 執行時間 55 秒。測試數量龐大但品質參差不齊，存在大量低價值測試拖慢回饋速度。
- **目標**：將 `bun test` 執行時間降至 < 40 秒，同時維持覆蓋真正行為的測試完整性。
- **優先級**：開發循環的核心健康指標。測試過慢會降低 developer 的信心，且 CI 成本持續攀升。

## 使用者故事

```
身為 developer agent
我想要執行 bun test 在 40 秒內完成
以便快速驗證程式碼修改是否正確
```

## 現狀分析

### 測試目錄分布

| 目錄 | 檔案數 | 測試數 | 執行時間 |
|------|--------|--------|---------|
| tests/unit/ | 84 | ~2197 | 14 秒 |
| tests/integration/ | 43 | ~810 | 36 秒 |
| tests/e2e/ | 11 | 228 | 10 秒 |

### 問題分類

**問題 A：integration/ 誤分類（最大效能問題）**

以下 18 個 integration tests 沒有真實 spawn process，本質上是 unit test，但被放在 integration/：
- `config-api.test.js`、`hook-contract.test.js`、`loop.test.js`、`state.test.js`
- `workflow-closed-loop.test.js`、`parallel-convergence-gate.test.js`
- `cross-session-memory.test.js`、`dashboard-pid.test.js`、`dashboard-sessions.test.js`
- `event-bus.test.js`、`instinct.test.js`、`on-stop-stale-cleanup.test.js`
- `pre-bash-guard.test.js`、`pre-edit-guard.test.js`、`pre-task-parallel.test.js`
- `timeline.test.js`、`utils.test.js`、`wording.test.js`

這不是「移動檔案」問題，Bun 對 unit/integration 沒有執行時差異，但這表示分類混亂，且可能有隱含的初始化成本。

**問題 B：platform-alignment-agents.test.js — 存在性測試膨脹（Anti-Pattern 4）**

`platform-alignment-agents.test.js`（428 行，53 個 test）包含大量低價值存在性測試，例如：
- 每個 agent 各自測試 `disallowedTools 包含 Write`（逐一循環展開，每個 agent 1 個 test）
- 這類測試的核心邏輯可用迴圈壓縮為 1-3 個 test，現在卻展開為 50+ 個

**問題 C：platform-alignment-registry.test.js — 計數硬編碼（Anti-Pattern 5）**

- `expect(Object.keys(timelineEvents).length).toBe(27)` — 任何新增 event 就讓測試爆掉
- 類似問題存在於 `registry.test.js`（`toBe(16)`、`toBe(4)`、`toBe(11)`）和 `health-check.test.js`（`toBe(11)`）

**問題 D：guard-coverage.test.js — 純存在性測試（Anti-Pattern 4）**

`guard-coverage.test.js` 幾乎全部在驗證「測試檔案存在」和「tests 數量 >= 3」，這是 meta 守衛。問題在於：
- 存在性測試本身可以用 1 個 test + 迴圈替代 7 個 test
- 最低測試數量閘門（>= 3）邏輯已由 test-quality-guard 涵蓋，功能重疊

**問題 E：integration/platform-alignment-*.test.js — 全是 frontmatter 靜態讀取**

以下 3 個 integration 層 platform-alignment tests 其實只讀靜態設定檔：
- `platform-alignment-pre-task-update.test.js`
- `platform-alignment-session-end.test.js`
- `platform-alignment-post-failure.test.js`

雖然有 spawn hook 程序，但核心驗證的是 hook output JSON 結構，可以轉成 unit test 直接讀解析結果。

## 範圍邊界

### 在範圍內（In Scope）

1. 合併 `platform-alignment-agents.test.js` 中展開的逐 agent 存在性測試為迴圈式 group test
2. 刪除/合併 `guard-coverage.test.js`（功能與 test-quality-guard 重疊）
3. 修正 `platform-alignment-registry.test.js` 的計數硬編碼為「至少 N」或「特定項目存在」
4. 修正 `registry.test.js` 和 `health-check.test.js` 中的計數硬編碼
5. 識別並標記 integration/ 中的誤分類測試（但不移動檔案，因分類不影響執行時間）
6. 確保 `guard-coverage.test.js` 移除後 `test-quality-guard.test.js` 功能完整

### 不在範圍內（Out of Scope）

- 改變 e2e tests（228 tests，10 秒，已合理）
- 移動 integration tests 到 unit（Bun 沒有分目錄執行差異，收益不明）
- 修改有真正行為驗證的 integration spawn tests（高價值保留）
- 新增測試（此任務是瘦身，不是擴充）
- 修改 tests/helpers/ 工具函式

## 子任務清單

### Phase 1：移除/合併低價值測試

1. **合併 platform-alignment-agents.test.js 的展開測試**
   - 負責 agent：developer
   - 相關檔案：`tests/unit/platform-alignment-agents.test.js`
   - 說明：將逐 agent 展開的 test() 循環改為 describe + forEach 迴圈，保留邏輯但大幅減少 test 數量。約可從 53 個 test 減至 8-10 個 describe block 各含少量 assertions。

2. **刪除 guard-coverage.test.js 或降級為 smoke test**（可與 1 並行）
   - 負責 agent：developer
   - 相關檔案：`tests/unit/guard-coverage.test.js`、`tests/unit/test-quality-guard.test.js`
   - 說明：確認 test-quality-guard.test.js 已涵蓋關鍵守衛功能後，將 guard-coverage 降為 1 個 smoke test（核心模組可 require 成功）。預計節省 7 個 test。

3. **修正計數硬編碼（Anti-Pattern 5）**（可與 1 並行）
   - 負責 agent：developer
   - 相關檔案：
     - `tests/unit/platform-alignment-registry.test.js`（`toBe(27)`）
     - `tests/unit/registry.test.js`（`toBe(16)`、`toBe(4)`、`toBe(11)`）
     - `tests/unit/health-check.test.js`（`toBe(11)`）
   - 說明：將精確計數改為 `toBeGreaterThanOrEqual(N)` 或改為驗證特定元素存在。

### Phase 2：品質驗證（依賴 Phase 1 完成）

4. **執行完整測試套件，確認 pass 且時間 < 40 秒**
   - 負責 agent：tester
   - 相關檔案：`bun test` 執行結果
   - 說明：驗收標準：全部 pass + 執行時間目標達成 + 關鍵行為測試完整保留。

## 開放問題

1. **guard-coverage 移除後的守衛鏈**：`guard-coverage.test.js` 本身被 `test-quality-guard.test.js` 監控，移除後 guard-coverage 自身不再被追蹤，這是否可接受？需要 architect 確認守衛鏈的完整性要求。
2. **platform-alignment-agents 重構方式**：直接修改現有測試，還是重寫並刪除舊版？考慮到這些測試是針對特定 BDD spec（platform-alignment-phase1）驗收的，需要確認修改不影響 BDD 追蹤性。
3. **integration 誤分類的實際影響**：目前 integration tests 執行時間 36 秒，但其中 18 個「pseudo-unit」tests 是否有額外的啟動成本？需要 architect 評估是否值得建立分類規範文件。
