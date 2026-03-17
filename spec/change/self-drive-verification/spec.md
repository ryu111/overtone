# Self-Drive 改善效果驗證閉環

## 動機（Why）

- **問題**：Nova 的自驅機制已完成「發現缺口 → 執行改善」的流程，但改善後無法驗證效果。heartbeat 執行改善任務後，只記錄 exitCode 和 sessionId，不記錄「改善了什麼元件」「改善前後的能力差異」。capability-probe 每次 session 更新能力邊界，但無 before/after 快照可供比對。improvements.jsonl 有建議但無執行結果追蹤。
- **目標**：改善任務完成後，系統能自動比對 before/after 能力快照、計算 delta、歸因到具體改善動作，形成可量化的進化證據。
- **不做的代價**：自驅系統持續消耗資源執行改善，但無法分辨哪些改善有效、哪些無效，導致反覆投入無效改善。

## 範圍

### In-scope

- 改善任務執行前擷取 capability-boundary 快照（before snapshot）
- 改善任務執行後擷取 capability-boundary 快照（after snapshot）
- 計算 before/after delta（能力增長量化）
- session-summaries.jsonl 擴展欄位，記錄改善標的和效果
- improvements.jsonl 回寫執行結果（成功/失敗 + delta）
- E2E 測試覆蓋驗證閉環

### Out-of-scope

- Judge 評分與改善動作的因果歸因（需要更長時間窗口，留給後續迭代）
- Dashboard 視覺化改善趨勢（Dashboard 可讀現有 JSONL，不需專門開發）
- 改善策略自動調整（根據效果自動調整優先級，屬 L3+ 能力）

## 使用者故事

身為 Nova 自驅系統，我想要在每次改善任務完成後知道「改善前後能力有何變化」，以便決定是否繼續投入同類改善。

身為開發者，我想要查看 improvements.jsonl 就能知道每個改善建議的執行結果和效果 delta，以便評估自驅系統的 ROI。

## 行為規格

### 正常路徑

1. heartbeat poll 取得改善任務（`[自驅]` 前綴的任務）
2. executeTask 開始前 → 擷取 capability-boundary.json 快照（before）
3. executeTask 執行 → spawn claude session
4. session 完成 → 擷取 capability-boundary.json 快照（after）
5. 計算 delta → 寫入 session-summaries.jsonl（擴展欄位）
6. 回寫 improvements.jsonl（標記執行結果 + delta）

### 錯誤路徑

| 錯誤情境 | 預期行為 |
|---------|---------|
| capability-boundary.json 不存在（before） | before snapshot 為 emptyBoundary()，繼續執行 |
| capability-boundary.json 不存在（after） | after snapshot 為 emptyBoundary()，delta 全為 0 |
| executeTask 失敗 | 仍擷取 after snapshot，記錄 delta = 0，improvements 標記 failed |
| improvements.jsonl 回寫失敗 | console.error 記錄，不影響主流程 |

### 邊界條件

- 非改善任務（無 `[自驅]` 前綴） → 不擷取快照，行為與現在完全相同
- 改善任務但 before/after 相同 → delta = 0，正常記錄（表示改善可能需要更多 session 才能反映）
- 並行 heartbeat tick（不應發生，但防禦） → 各自獨立擷取快照，互不影響

## 資料模型

### 輸入

| 欄位 | 型別 | 必填 | 說明 |
|------|------|:----:|------|
| task | object | 是 | Notion 任務物件（含 name, id, priority） |
| task.name | string | 是 | 任務名稱（`[自驅]` 前綴識別改善任務） |

### 輸出 — session-summaries.jsonl 擴展欄位

| 欄位 | 型別 | 說明 |
|------|------|------|
| improvement | object \| null | 改善效果資訊（非改善任務為 null） |
| improvement.target | string | 改善標的（從任務名稱提取） |
| improvement.beforeSnapshot | object | before 能力快照（精簡版：只含相關能力） |
| improvement.afterSnapshot | object | after 能力快照 |
| improvement.delta | object | 能力變化量化 |
| improvement.delta.capabilitiesChanged | number | 變化的能力數量 |
| improvement.delta.strengthUpgrades | number | strength 提升的能力數量 |
| improvement.delta.totalCoverageGain | number | coverageHits 總增量 |
| improvement.delta.totalMissingReduction | number | missingHits 總減少量 |

### 輸出 — improvements.jsonl 擴展欄位

| 欄位 | 型別 | 說明 |
|------|------|------|
| executedAt | string \| null | 執行時間（ISO 8601） |
| executionResult | string \| null | "success" \| "failed" \| null |
| delta | object \| null | 同上 delta 結構 |

### 儲存

- 格式：JSONL（沿用現有格式）
- 位置：`~/.claude/data/session-summaries.jsonl`、`~/.claude/data/improvements.jsonl`
- 清理：沿用現有截斷機制（session-summaries 無上限，improvements 保留 30 筆）

## 介面契約

### 新增函式

```javascript
// heartbeat.js 新增
function snapshotBoundary(deps) → object
// 讀取 capability-boundary.json 的精簡快照

function computeDelta(before, after) → { capabilitiesChanged, strengthUpgrades, totalCoverageGain, totalMissingReduction }
// 計算兩個快照的差異

function isImprovementTask(taskName) → boolean
// 判斷是否為改善任務（[自驅] 前綴）

function updateImprovementRecord(taskName, result, delta, deps) → void
// 回寫 improvements.jsonl 的執行結果
```

## 非功能需求

| 維度 | 要求 |
|------|------|
| 效能 | snapshotBoundary 讀取 < 5ms（JSON.parse 一個小檔案） |
| 阻塞性 | 驗證邏輯不阻塞 executeTask 主流程（快照在 executeTask 前後同步擷取，計算在 session 完成後） |
| 資料大小 | 快照只保留相關能力（不超過 20 個 capability entry），避免 JSONL 膨脹 |

## 依賴

| 方向 | 模組 | 說明 |
|------|------|------|
| 上游 | capability-probe.js | getBoundary() 讀取能力邊界 |
| 上游 | heartbeat.js | executeTask() 是改動主體 |
| 下游 | gap-discovery.js | 讀取 improvements.jsonl（已有，無需改動） |
| 下游 | context-injector.js | 讀取 session-summaries.jsonl（已有，無需改動） |

## 驗收標準

- [ ] 改善任務執行前後擷取 capability-boundary 快照
- [ ] session-summaries.jsonl 中改善任務的 entry 含 improvement 欄位
- [ ] improvements.jsonl 中對應建議含 executedAt + executionResult + delta
- [ ] 非改善任務不受影響（improvement 為 null 或不存在）
- [ ] delta 計算正確：strengthUpgrades 計算 before weak → after adequate 等升級
- [ ] E2E 測試通過：r4-self-drive-loop.test.js 中新增驗證效果閉環測試
- [ ] `bun test` 全部通過

## 風險

| 風險 | 機率 | 影響 | 緩解策略 |
|------|:----:|:----:|---------|
| capability-boundary.json 在 session 執行期間被其他 hook 修改 | 中 | 低 | before 快照是深拷貝，after 在 session 結束後讀取最新值 |
| improvements.jsonl 格式變更導致舊 entry 解析失敗 | 低 | 低 | 新欄位都是 optional（null），舊 entry 不受影響 |
| 改善任務名稱格式不一致，無法匹配回 improvements.jsonl | 中 | 中 | 用模糊匹配（包含 improvement.target 子字串） |
