# gap-discovery.js -- 缺口自動發現引擎

## 動機（Why）

- **問題**：目前 self-drive 流程（`self-drive-prompt.md`）每次都用 AI 重新讀取 4 個數據源（目標場景、scores、roadmap、Notion），產出不穩定、無去重、無信心評估、無記憶。每次 self-drive session 浪費 token 做重複分析，建議品質靠 AI 當下發揮。
- **目標**：用確定性引擎取代 AI 即時分析。引擎聚合 4 個數據源 → 去重合併 → 信心評估 → 排序過濾 → 產出結構化建議，讓 self-drive 從「AI 自由分析」進化到「引擎驅動 + AI 決策」。
- **不做的代價**：self-drive 持續產出重複任務、低品質建議，Notion 待做清單噪音高、信噪比低。每次 self-drive 消耗 token 做相同的數據收集工作。

## 範圍

### In-scope

- 從 4 個數據源收集缺口信號（gap-analyzer、capability-probe、scores.jsonl、roadmap.md）
- 同一元件多源出現時去重合併為單一建議
- 每個建議帶 confidence 分數（0-100），多源交叉驗證提升信心
- 按 impact x confidence 排序，過濾 Notion 已存在的重複任務
- 產出結構化 Suggestion 物件
- Notion 同步：confidence >= 70 待做、40-69 backlog、< 40 捨棄
- 程式化 API + CLI 雙模式

### Out-of-scope

- AI 模型呼叫（純確定性邏輯）
- 自動修復缺口（那是 gap-fixer.js 的職責）
- Notion 任務管理 UI（已有 notion-tasks.js CLI）
- 替換 gap-analyzer.js 或 capability-probe.js（只消費它們的輸出）

## 使用者故事

1. 身為 heartbeat self-drive 模組，我想要呼叫 `discoverGaps()` 取得排序好的建議清單，以便直接建立 Notion 任務而非自己用 AI 分析。
2. 身為開發者，我想要用 `bun gap-discovery.js --summary` 看到目前系統缺口概覽，以便了解下一步該做什麼。
3. 身為 maintainer.js，我想要呼叫 `syncToNotion(suggestions)` 自動建立/跳過 Notion 任務，以便無人值守運作。

## 行為規格

### 正常路徑

1. 呼叫 `discoverGaps(options)` → 並行收集 4 個數據源
2. 每個源產出 `RawSignal[]`（統一格式：element + type + severity + source）
3. 合併：同一 element 在多源出現 → 合併為單一 `Suggestion`，confidence 加成
4. 排序：按 `impact * confidence` 降序
5. 過濾：查詢 Notion 待做+進行中任務，排除已存在的相同元件任務
6. 回傳 `DiscoveryReport { suggestions, stats, metadata }`

### 錯誤路徑

| 錯誤情境 | 預期行為 |
|---------|---------|
| gap-analyzer 失敗 | 跳過該源，繼續其他 3 個源，report.warnings 記錄 |
| capability-probe 失敗 | 跳過該源，繼續 |
| scores.jsonl 不存在/空 | 跳過該源，繼續 |
| roadmap.md 不存在 | 跳過該源，繼續 |
| 全部 4 源都失敗 | 回傳空 suggestions + error 欄位 |
| Notion API 失敗（dedup 查詢）| 跳過去重過濾，繼續產出建議 |
| Notion API 失敗（建立任務）| 記錄失敗，繼續下一個建議 |

### 邊界條件

- 零缺口（4 源都沒有信號）→ 回傳空 suggestions，stats.total = 0
- 超多缺口（> 50 個）→ 只回傳 top 20，metadata.truncated = true
- 同一元件在 4 源都出現 → confidence 最多 100（不超過上限）
- Notion 查詢結果 > 100 筆 → 分頁處理

## 資料模型

### 輸入

| 欄位 | 型別 | 必填 | 說明 |
|------|------|:----:|------|
| sources | string[] | 否 | 指定數據源（預設全部 4 個）|
| maxSuggestions | number | 否 | 最多回傳幾個建議（預設 20）|
| minConfidence | number | 否 | 最低信心門檻（預設 0，不過濾）|
| skipNotion | boolean | 否 | 跳過 Notion dedup 查詢（預設 false）|
| _mock | object | 否 | 測試注入：{ gaps, weakCaps, scores, roadmapTasks } |

### 輸出：DiscoveryReport

| 欄位 | 型別 | 說明 |
|------|------|------|
| suggestions | Suggestion[] | 排序後的建議清單 |
| stats | object | { total, bySource, byConfidenceRange } |
| metadata | object | { timestamp, version, duration, sourcesUsed, truncated } |
| warnings | string[] | 各源收集時的非致命錯誤 |
| error | string? | 全部失敗時的錯誤訊息 |

### Suggestion 物件

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | string | 唯一識別（element hash）|
| title | string | 具體可執行的任務名稱 |
| description | string | 現狀 + 根因 + 方案 + 預期效果 |
| element | string | 目標元件路徑 |
| confidence | number | 0-100，多源交叉驗證 |
| impact | number | 0-100，影響程度 |
| score | number | impact * confidence / 100（排序用）|
| sources | string[] | 來自哪些數據源 |
| suggestedPriority | string | P1/P2/P3 |
| suggestedDepth | string | D0-D4 |
| signals | object[] | 原始信號摘要（供 debug）|

### 儲存

- 格式：不持久化（純計算引擎，結果透過 Notion 持久化）
- 運行日誌：`/tmp/gap-discovery.log`（CLI 模式時）

## 介面契約

### 程式化 API

```javascript
// 主函式：發現缺口
async function discoverGaps(options?: DiscoverOptions): Promise<DiscoveryReport>

// Notion 同步：建議 → Notion 任務
async function syncToNotion(suggestions: Suggestion[], options?: SyncOptions): Promise<SyncResult>
// SyncResult: { created: number, skipped: number, failed: number, details: [] }
```

### CLI

```bash
bun gap-discovery.js                    # stdout JSON（完整 DiscoveryReport）
bun gap-discovery.js --summary          # stderr 人可讀摘要
bun gap-discovery.js --sync             # 發現 + 自動同步到 Notion
bun gap-discovery.js --sources gap,score # 只用指定數據源
bun gap-discovery.js --min-confidence 50 # 只顯示信心 >= 50 的建議
```

### 錯誤碼

| 場景 | exit code |
|------|:---------:|
| 正常完成 | 0 |
| 部分源失敗但有結果 | 0 |
| 全部源失敗 | 1 |
| 參數錯誤 | 2 |

## 非功能需求

| 維度 | 要求 |
|------|------|
| 效能 | 全量分析 < 3 秒（不含 Notion API）|
| 行數 | <= 400 行 |
| 依賴 | 零外部依賴（只 import 現有腳本 + Node.js 內建）|
| 測試 | 所有數據源可 mock 注入（_mock 參數）|

## 依賴

| 方向 | 模組 | 說明 |
|------|------|------|
| 上游（消費） | gap-analyzer.js | 結構性缺口（analyzeGaps API） |
| 上游（消費） | capability-probe.js | 能力缺口（getWeakCapabilities API）|
| 上游（讀取） | ~/.claude/data/scores.jsonl | 品質缺口（F/C 級元件）|
| 上游（讀取） | ~/projects/nova-brain/spec/roadmap.md | 進度缺口（未完成項目）|
| 上游（消費） | notion-tasks.js | Notion dedup 查詢 + 建立任務（createTask API）|
| 下游（被消費） | heartbeat self-drive | 取代 self-drive-prompt.md 的 AI 分析 |
| 下游（被消費） | CLI 使用者 | 手動檢視系統缺口 |

## 驗收標準

- [ ] `discoverGaps()` 從 4 個數據源收集信號，任一源失敗不影響其他
- [ ] 同一元件在多源出現時合併為 1 個建議，confidence 正確加成
- [ ] 建議按 impact * confidence 降序排列
- [ ] Notion dedup 正確過濾已存在的任務
- [ ] `syncToNotion()` 按信心分級建立任務（>= 70 待做、40-69 backlog、< 40 捨棄）
- [ ] CLI `--summary` 輸出人可讀摘要
- [ ] CLI `--sync` 執行完整的發現 + 同步流程
- [ ] 全量分析 < 3 秒
- [ ] 行數 <= 400 行
- [ ] 測試覆蓋：4 源收集、合併去重、信心計算、排序、Notion 同步
- [ ] `_mock` 參數可完全注入測試資料

## 風險

| 風險 | 機率 | 影響 | 緩解策略 |
|------|:----:|:----:|---------|
| gap-analyzer 或 capability-probe API 變更 | 低 | 中 | 每個源獨立 try-catch，API 變更只影響單一源 |
| scores.jsonl 格式變更 | 低 | 低 | 解析時容錯（缺欄位 → 跳過該行）|
| roadmap.md 格式大改 | 中 | 低 | regex 解析，失敗時跳過該源 |
| Notion API rate limit | 中 | 中 | dedup 查詢失敗時跳過去重繼續產出；建立任務失敗時記錄並繼續 |
| 信心公式不準（false positive 過多）| 中 | 中 | 初始版本保守（多源才高信心），後續根據實際數據調整權重 |
