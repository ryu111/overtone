# Proposal

## 功能名稱

`compact-quality-detect`

## 需求背景（Why）

- **問題**：`pre-compact-handler.js` 目前只累計 auto/manual compact 計數，無法區分「正常偶發的壓縮」和「短時間內大量自動壓縮」（context 膨脹症狀）。當 context 在一段 workflow 中反覆快速觸發 auto-compact，開發者無任何感知，問題難以事後追蹤。
- **目標**：在 compact 發生時偵測頻率異常，透過 timeline event 留下可查詢的品質記錄，並在 health-check 中可主動掃描歷史 session 的 compact 頻率異常。
- **優先級**：輔助性品質感知功能，不阻擋主流程，可獨立交付。

## 使用者故事

```
身為 Overtone 使用者
我想要在短時間內發生多次 auto-compact 時收到警告
以便識別 context 膨脹問題，及時調整工作流策略
```

```
身為 Overtone 維護者
我想要在 health-check 中看到 compact 頻率異常的 session 清單
以便主動發現高 compact 壓力的工作流設計問題
```

## 範圍邊界

### 在範圍內（In Scope）

- `compact-count.json` 格式擴展：加入 `autoTimestamps` 陣列，記錄每次 auto compact 的 ISO 時間戳
- `pre-compact-handler.js` 中加入頻率偵測邏輯（可配置門檻：時間窗口 + 次數）
- `registry.js` 中新增 `quality:compact-frequency` timeline 事件定義
- `pre-compact-handler.js` 在偵測到異常時 emit `quality:compact-frequency` 事件（不阻擋 compaction）
- `health-check.js` 新增第 21 項 `checkCompactFrequency`：掃描所有 session 的 compact-count.json，找出有頻率異常記錄的 session
- 對應測試：`pre-compact-handler.test.js` 補充頻率偵測測試案例；`health-check.test.js`（若存在）或新增 unit test

### 不在範圍內（Out of Scope）

- 即時通知（Telegram/Dashboard）——頻率警告目前只寫 timeline，不做即時推播（留待後續 remote 整合）
- 在 compact 時向 Main Agent 的 systemMessage 注入警告文字（可作後續迭代）
- compact 頻率的 global 趨勢分析（跨 session 統計）——超出此功能範圍，留給 quality-trends 偵測

## 子任務清單

1. **擴展 registry：新增 `quality:compact-frequency` 事件**
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/registry.js`
   - 說明：在 `timelineEvents` 中新增 `'quality:compact-frequency'`，category 為 `'quality'`，consumeMode 為 `'fire-and-forget'`（純記錄，無需 consumer）。同步更新頂部的事件總數註解（31 → 32，13 → 14 分類或沿用）。

2. **擴展 compact-count.json schema + 頻率偵測邏輯**（依賴子任務 1 完成）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/lib/pre-compact-handler.js`
   - 說明：
     - `compact-count.json` 加入 `autoTimestamps: string[]` 欄位（append-only，保留最近 N 筆，建議 20）
     - 頻率偵測純函式 `detectFrequencyAnomaly(timestamps, windowMs, threshold)`：在 `windowMs`（預設 5 分鐘）內 auto compact 次數 >= `threshold`（預設 3）時回傳 `true`
     - 偵測到異常時呼叫 `timeline.emit(sessionId, 'quality:compact-frequency', { autoCount, windowMs, threshold, timestamps: [...] })`
     - 向後相容：讀取舊格式（無 `autoTimestamps`）不報錯，從空陣列開始

3. **health-check 新增 `checkCompactFrequency`**（可與子任務 2 並行）
   - 負責 agent：developer
   - 相關檔案：`plugins/overtone/scripts/health-check.js`
   - 說明：
     - 掃描 `~/.overtone/sessions/*/compact-count.json`（複用現有 `readdirSync` 模式）
     - 對每個 session 讀取 `autoTimestamps`，若有 >= threshold 的頻率異常記錄則產生 warning finding
     - 在 `runAllChecks()` 中加入第 21 項 `{ name: 'compact-frequency', fn: checkCompactFrequency }`
     - 同步更新頂部註解的偵測項目清單（20 項 → 21 項）
     - 門檻常數直接對齊 pre-compact-handler 使用的值（不重複定義，可從 handler export 或硬編碼相同值）

4. **測試補充**（依賴子任務 1、2 完成）
   - 負責 agent：tester
   - 相關檔案：
     - `tests/unit/pre-compact-handler.test.js`（新增 Scenario 21-25）
     - `tests/unit/health-check-compact-frequency.test.js`（新建，或在現有 health-check 測試中新增）
   - 說明：
     - unit test for `detectFrequencyAnomaly`：正常頻率（不觸發）、觸發門檻（5 分鐘 3 次）、邊界條件（恰好 3 次、跨窗口）
     - `handlePreCompact` 整合測試：auto compact 3 次快速觸發 → timeline 有 `quality:compact-frequency` 事件
     - `checkCompactFrequency`：有異常 session 回傳 warning，無異常回傳空陣列

## 開放問題

- **頻率門檻可配置性**：門檻（5 分鐘 / 3 次）是否從 `registry.js` 統一定義（如 `compactFrequencyDefaults`），還是在 pre-compact-handler 中硬編碼為常數？前者更靈活但需更動 registry 匯出介面。architect 決定。
- **`autoTimestamps` 保留筆數**：建議 20 筆（約對應 100 分鐘的記錄窗口），是否合適？資料量是否需要配置化？
- **health-check 使用 sessions dir**：`checkCompactFrequency` 需讀取 `~/.overtone/sessions/`，與現有 `checkConcurrencyGuards` 做法相同——確認直接複用 paths.js 的 `SESSIONS_DIR` export 即可，無需新增路徑。
- **`quality` 是否為已存在的 category**：registry.js 中 `timelineEvents` 目前無 `quality` category，新增後需確認 health-check `checkClosedLoop` 的 consumer 掃描邏輯不受影響（`consumeMode: 'fire-and-forget'` 應可直接跳過）。
