# Tasks: compact-quality-detect

## 子任務清單

- [x] 子任務 1：擴展 registry — 新增 `quality:compact-frequency` 事件 | files: `plugins/overtone/scripts/lib/registry.js`
- [x] 子任務 2：擴展 compact-count.json schema + 頻率偵測邏輯（依賴子任務 1） | files: `plugins/overtone/scripts/lib/pre-compact-handler.js`
- [x] 子任務 3：health-check 新增 `checkCompactFrequency`（依賴子任務 2 export） | files: `plugins/overtone/scripts/health-check.js`
- [x] 子任務 4：測試補充（依賴子任務 1、2、3 完成） | files: `tests/unit/pre-compact-handler.test.js`, `tests/unit/health-check-compact-frequency.test.js`

## Dev Phases

### Phase 1: 新增 registry 事件 (sequential)
- [x] 擴展 registry — 新增 `quality:compact-frequency` timeline 事件，更新事件總數註解（31 → 32） | files: `plugins/overtone/scripts/lib/registry.js`

### Phase 2: 擴展 handler (sequential)
- [x] 擴展 pre-compact-handler：門檻常數 + `detectFrequencyAnomaly` + `autoTimestamps` 追蹤 + export（`COMPACT_FREQ_WINDOW_MS`, `COMPACT_FREQ_THRESHOLD`, `detectFrequencyAnomaly`） | files: `plugins/overtone/scripts/lib/pre-compact-handler.js`

### Phase 3: health-check (sequential)
- [x] 新增 checkCompactFrequency：從 pre-compact-handler import 常數，掃描 sessions，加入 runAllChecks 第 21 項，更新頂部註解（20 → 21 項） | files: `plugins/overtone/scripts/health-check.js`

### Phase 4: 測試補充 (parallel)
- [x] 新增 `detectFrequencyAnomaly` unit tests（正常/觸發/邊界/跨窗口）至既有測試檔 | files: `tests/unit/pre-compact-handler.test.js`
- [x] 新建 `checkCompactFrequency` unit test 檔案（有異常 session → warning；無異常 → 空陣列；目錄不存在 → 空陣列） | files: `tests/unit/health-check-compact-frequency.test.js`
