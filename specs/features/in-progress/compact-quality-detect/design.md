# Design: compact-quality-detect

## 技術方案摘要

在 `pre-compact-handler.js` 中擴展 `compact-count.json` 的 schema，加入 `autoTimestamps` 陣列，
並新增純函式 `detectFrequencyAnomaly` 執行頻率偵測。偵測到異常時 emit `quality:compact-frequency`
timeline 事件（不阻擋 compaction）。`health-check.js` 新增第 21 項 `checkCompactFrequency` 掃描歷史 session。

**關鍵決策**：
- 門檻常數（`COMPACT_FREQ_WINDOW_MS`、`COMPACT_FREQ_THRESHOLD`）定義在 `pre-compact-handler.js` 頂部，
  並從該模組 export 供 `health-check.js` 直接 import，避免重複定義且不污染 registry。
- `autoTimestamps` 保留最近 20 筆（對應約 100 分鐘歷史窗口），超過時 `slice(-20)` 截斷。
- `detectFrequencyAnomaly` 為純函式，無 side effect，便於 unit test。
- `quality` 是新增的 timeline category（registry 中目前無此 category），`consumeMode: 'fire-and-forget'`，
  不需要 consumer，`checkClosedLoop` 只偵測 `targeted` 事件，不受影響。

---

## API 介面

### 新增 Export：`pre-compact-handler.js`

```javascript
// 頻率偵測門檻常數（export 供 health-check 直接引用）
const COMPACT_FREQ_WINDOW_MS = 5 * 60 * 1000;  // 5 分鐘
const COMPACT_FREQ_THRESHOLD = 3;               // 3 次

/**
 * 偵測 auto-compact 頻率是否異常
 * @param {string[]} timestamps - ISO 8601 時間戳陣列（最近 N 筆，已排序）
 * @param {number} windowMs - 時間窗口（毫秒），預設 COMPACT_FREQ_WINDOW_MS
 * @param {number} threshold - 觸發門檻次數，預設 COMPACT_FREQ_THRESHOLD
 * @returns {{ anomaly: boolean, autoCount: number }}
 */
function detectFrequencyAnomaly(timestamps, windowMs, threshold)

module.exports = {
  handlePreCompact,
  buildCompactMessage,
  detectFrequencyAnomaly,       // 新增 export
  COMPACT_FREQ_WINDOW_MS,       // 新增 export
  COMPACT_FREQ_THRESHOLD,       // 新增 export
};
```

### 新增 Check：`health-check.js`

```javascript
/**
 * 偵測各 session 的 compact 頻率異常記錄
 * @param {string} [sessionsDirOverride] - 供測試覆蓋 sessions 目錄
 * @returns {Finding[]}
 */
function checkCompactFrequency(sessionsDirOverride)
```

---

## 資料模型

### compact-count.json（擴展後）

```typescript
interface CompactCount {
  auto: number;                  // 現有欄位，不變
  manual: number;                // 現有欄位，不變
  autoTimestamps?: string[];     // 新增：ISO 8601 時間戳，最多 20 筆，append-only
}
```

向後相容策略：讀取時若 `autoTimestamps` 不存在，以空陣列 `[]` 初始化，不報錯。

### registry.js — 新增 timeline 事件

```javascript
// quality 類（1）—— 新增
'quality:compact-frequency': {
  label: 'Auto-Compact 頻率異常',
  category: 'quality',
  consumeMode: 'fire-and-forget',
},
```

### timeline event payload（`quality:compact-frequency`）

```typescript
interface CompactFrequencyPayload {
  autoCount: number;        // 時間窗口內的 auto compact 次數
  windowMs: number;         // 時間窗口（毫秒）
  threshold: number;        // 觸發門檻
  windowStartIso: string;   // 窗口起始時間（ISO）
}
```

---

## 檔案結構

| 檔案 | 動作 | 說明 |
|------|------|------|
| `plugins/overtone/scripts/lib/registry.js` | 修改 | 新增 `quality:compact-frequency` 事件（timeline 事件總數 31 → 32，新增 quality 分類） |
| `plugins/overtone/scripts/lib/pre-compact-handler.js` | 修改 | 加入門檻常數 + `detectFrequencyAnomaly` + `autoTimestamps` 追蹤邏輯 + export |
| `plugins/overtone/scripts/health-check.js` | 修改 | 新增 `checkCompactFrequency` 函式 + 加入 `runAllChecks` 第 21 項 + 頂部註解更新（20 → 21）|
| `tests/unit/pre-compact-handler.test.js` | 修改 | 新增 `detectFrequencyAnomaly` 的 unit test scenarios |
| `tests/unit/health-check-compact-frequency.test.js` | 新增 | `checkCompactFrequency` 獨立 unit test 檔案 |

---

## 實作細節說明

### pre-compact-handler.js 修改邏輯

在 `handlePreCompact` 的 compactCount 追蹤區段中：

1. 讀取現有 `compactCount`，初始化 `autoTimestamps: compactCount.autoTimestamps || []`
2. 若為 auto compact，append 目前 ISO 時間戳，`slice(-20)` 截斷至最近 20 筆
3. 呼叫 `detectFrequencyAnomaly(autoTimestamps, COMPACT_FREQ_WINDOW_MS, COMPACT_FREQ_THRESHOLD)`
4. 若 `anomaly === true`，emit `quality:compact-frequency` 事件（非阻擋，emit 失敗也不擋 compaction）
5. `atomicWrite` 回寫 compactCount（含新的 `autoTimestamps`）

### detectFrequencyAnomaly 邏輯

```
given timestamps（已排序 ISO 陣列），windowMs，threshold
let now = Date.now()
let windowStart = now - windowMs
let recentCount = timestamps.filter(ts => new Date(ts).getTime() >= windowStart).length
return { anomaly: recentCount >= threshold, autoCount: recentCount }
```

### checkCompactFrequency 邏輯

```
sessionsDir = sessionsDirOverride || SESSIONS_DIR（從 paths.js import）
掃描 sessionsDir 下各 session 目錄的 compact-count.json
對每個 session：讀取 autoTimestamps（不存在則跳過）
呼叫 detectFrequencyAnomaly(autoTimestamps, COMPACT_FREQ_WINDOW_MS, COMPACT_FREQ_THRESHOLD)
若 anomaly → findings.push({ check: 'compact-frequency', severity: 'warning', ... })
```

`COMPACT_FREQ_WINDOW_MS` 和 `COMPACT_FREQ_THRESHOLD` 直接從 `pre-compact-handler.js` import，不重複定義。

---

## 狀態同步策略

本功能為純後端記錄型，無前端狀態同步需求。

timeline event 的可觀測性路徑：
- `quality:compact-frequency` emit 後由 `timeline.emit` append 至 `timeline.jsonl`
- Dashboard SSE 全量廣播（broadcast 模式），使用者可在 Dashboard 看到 timeline 事件
- `checkCompactFrequency` 直接讀取 `compact-count.json`，不依賴 timeline 查詢

---

## Edge Cases

- **autoTimestamps 含損壞時間戳**（資料邊界）：`new Date(ts).getTime()` 若為 NaN，`>= windowStart` 為 false，自動被過濾，不影響計數正確性。
- **emit 失敗不阻擋 compaction**（語意陷阱）：timeline.emit 呼叫應包在 try/catch 內，異常只靜默記錄，不向上拋出。
- **health-check sessions 目錄不存在**（資料邊界）：`readdirSync` 用 try/catch 包覆，目錄不存在時回傳空陣列（與 `checkConcurrencyGuards` 同樣模式）。
- **時間窗口跨越歷史舊記錄**（語意陷阱）：`autoTimestamps` 保留最近 20 筆，`slice(-20)` 在寫入前截斷，但 health-check 讀取的是已寫入的陣列，窗口過濾仍依 `now` 計算，若 compact-count.json 長期未清理，舊時間戳不會誤觸發（因時間點在 windowStart 之前）。
- **並行 compaction 競爭**（並行競爭）：`atomicWrite` 使用 tmp file rename，確保 `autoTimestamps` 不因並行寫入而損壞；但兩個 compaction 若幾乎同時發生，第二個讀到的可能是第一個寫入前的狀態，導致時間戳少記一筆。接受此邊界（auto-compact 本質上不並行）。
