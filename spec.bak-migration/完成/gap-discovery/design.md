# gap-discovery.js -- 技術設計

## 深度路由：D2
**理由**：跨 4 個現有模組的整合 + 新建 1 個核心檔案 + 測試，非安全敏感但涉及多模組介面對接，D1 不足 D3 過度。

---

## 技術摘要

- **方案**：單檔案引擎，4 個 collector 函式各自負責一個數據源，統一輸出 RawSignal → 合併層去重 + 信心計算 → 排序過濾 → Notion 同步層
- **理由**：4 源各自獨立、格式不同，用 collector 模式隔離差異；合併層是純函式易測試
- **取捨**：不使用 event-bus（引擎是同步計算，不需要 stream）；不持久化中間結果（每次重算，避免快取過期問題）

## 方案比較

| 維度 | 方案 A：單檔案 collector 模式（選擇） | 方案 B：每個源獨立檔案 + orchestrator |
|------|:-----------------------------------:|:------------------------------------:|
| 複雜度 | 低（1 檔案 ~350 行） | 中（5 檔案，import 鏈長） |
| 效能 | 相同（都是 Promise.all 並行） | 相同 |
| 可維護性 | 高（所有邏輯集中，易追蹤） | 中（分散，需跳轉多檔案） |
| 測試 | 高（_mock 一個參數覆蓋全部） | 中（每個檔案各自 mock） |
| 擴展性 | 中（新增源要改主檔案） | 高（新增源只加新檔案） |
| **結論** | 選擇：4 個源已確定，不需過度工程 | 不選：源數量固定，分散反而增加認知負擔 |

## 模組介面

### 新增檔案

| # | 檔案 | 位置 | 行數 | 用途 |
|---|------|------|------|------|
| 1 | gap-discovery.js | ~/.claude/scripts/ | ~350 | 缺口發現引擎（4 源聚合 + 去重 + 信心 + Notion 同步）|

### 修改檔案

| # | 檔案 | 變更內容 |
|---|------|---------|
| 1 | self-drive-prompt.md | 改為呼叫 gap-discovery.js，不再手動讀 4 源 |

### 測試檔案

| # | 檔案 | 位置 | 用途 |
|---|------|------|------|
| 1 | gap-discovery.test.js | ~/projects/nova-brain/tests/unit/ | 4 源收集 + 合併 + 信心 + 排序 + Notion 同步 |

### API 設計

```javascript
// ─── 型別 ───────────────────────────────────────────────────────
/**
 * @typedef {'gap-analyzer'|'capability-probe'|'scores'|'roadmap'} SourceId
 *
 * @typedef {{
 *   element: string,
 *   type: string,
 *   severity: 'critical'|'warning'|'info',
 *   source: SourceId,
 *   title: string,
 *   description: string,
 *   impact: number,
 *   repairHint?: string
 * }} RawSignal
 *
 * @typedef {{
 *   id: string,
 *   title: string,
 *   description: string,
 *   element: string,
 *   confidence: number,
 *   impact: number,
 *   score: number,
 *   sources: SourceId[],
 *   suggestedPriority: string,
 *   suggestedDepth: string,
 *   signals: RawSignal[]
 * }} Suggestion
 *
 * @typedef {{
 *   suggestions: Suggestion[],
 *   stats: { total: number, bySource: Object, byConfidenceRange: Object },
 *   metadata: { timestamp: string, version: string, duration: number, sourcesUsed: SourceId[], truncated: boolean },
 *   warnings: string[],
 *   error?: string
 * }} DiscoveryReport
 */

// ─── 收集層（4 個 collector）────────────────────────────────────
async function collectFromGapAnalyzer(_mock?): Promise<RawSignal[]>
async function collectFromCapabilityProbe(_mock?): Promise<RawSignal[]>
function collectFromScores(_mock?): RawSignal[]
function collectFromRoadmap(_mock?): RawSignal[]

// ─── 合併層 ─────────────────────────────────────────────────────
function mergeSignals(signals: RawSignal[]): Suggestion[]
// 邏輯：
//   1. 以 element 為 key 分組
//   2. 同 element 的 signals 合併：
//      - impact = max(所有 signal 的 impact)
//      - confidence = baseConfidence + (sourceCount - 1) * 15（每多一個源 +15，上限 100）
//      - baseConfidence 由最高 severity 決定：critical=60, warning=40, info=20
//   3. score = impact * confidence / 100
//   4. title/description 從最高 impact 的 signal 取

function calculateConfidence(signals: RawSignal[]): number
// 公式：
//   base = { critical: 60, warning: 40, info: 20 }[maxSeverity]
//   crossSourceBonus = (uniqueSourceCount - 1) * 15
//   return Math.min(100, base + crossSourceBonus)

function derivePriority(score: number): string
// score >= 70 → P1, >= 40 → P2, else P3

function deriveDepth(suggestion: Suggestion): string
// sources.length >= 3 且 impact >= 70 → D3
// sources.length >= 2 → D2
// else → D1

// ─── 過濾層 ─────────────────────────────────────────────────────
async function filterExistingNotion(suggestions, _deps?): Promise<Suggestion[]>
// 查詢 Notion 待做+進行中，排除已存在的同名任務

// ─── 主函式 ─────────────────────────────────────────────────────
async function discoverGaps(options?): Promise<DiscoveryReport>

// ─── Notion 同步 ────────────────────────────────────────────────
async function syncToNotion(suggestions, options?, _deps?): Promise<SyncResult>
// confidence >= 70 → createTask(priority=P1/P2, status=待做)
// confidence 40-69 → createTask(priority=P3, status=待做, description 標註 backlog)
// confidence < 40 → 跳過（只 log）
```

## 資料流

```
┌──────────────────┐   ┌─────────────────────┐   ┌────────────────┐   ┌─────────────────┐
│  gap-analyzer.js │   │ capability-probe.js  │   │  scores.jsonl  │   │   roadmap.md    │
│  analyzeGaps()   │   │ getWeakCapabilities()│   │  readFileSync  │   │   regex parse   │
└────────┬─────────┘   └──────────┬───────────┘   └───────┬────────┘   └────────┬────────┘
         │                        │                       │                     │
         ▼                        ▼                       ▼                     ▼
    RawSignal[]              RawSignal[]             RawSignal[]           RawSignal[]
         │                        │                       │                     │
         └────────────────────────┼───────────────────────┘                     │
                                  ▼                                             │
                          mergeSignals(all)  ◄──────────────────────────────────┘
                                  │
                                  ▼
                          Suggestion[]（去重 + 信心 + 排序）
                                  │
                                  ▼
                       filterExistingNotion()
                                  │
                                  ▼
                          DiscoveryReport
                                  │
                          ┌───────┴────────┐
                          ▼                ▼
                    CLI stdout        syncToNotion()
                                          │
                                          ▼
                                    Notion 任務
```

## 信心計算詳細邏輯

### 基礎信心（由最高 severity 決定）

| 最高 severity | base |
|:------------:|:----:|
| critical | 60 |
| warning | 40 |
| info | 20 |

### 交叉驗證加成

每增加一個**不同來源**的信號 → +15 分。

範例：
- 某元件只在 scores.jsonl 出現（F 級，warning）→ confidence = 40
- 同元件也在 gap-analyzer 出現（critical）→ confidence = 60 + 15 = 75
- 同元件再在 roadmap 出現 → confidence = 60 + 30 = 90

### 上限

confidence 最高 100，不超過。

## 各源 RawSignal 映射

### gap-analyzer → RawSignal

| Gap 欄位 | RawSignal 欄位 |
|----------|---------------|
| context.element | element |
| context.type | type |
| severity | severity |
| 固定 'gap-analyzer' | source |
| repairHint | title（截取前 50 字）|
| `${element}: ${repairHint}` | description |
| priority | impact |

### capability-probe → RawSignal

| WeakCapability 欄位 | RawSignal 欄位 |
|---------------------|---------------|
| name | element |
| 'capability-gap' | type |
| missing → critical, weak → warning | severity |
| 固定 'capability-probe' | source |
| `建立 ${name} 相關 Skill 或工具` | title |
| `能力 ${name} 為 ${strength}` | description |
| missingHits * 10（上限 100） | impact |

### scores.jsonl → RawSignal

| Score 欄位 | RawSignal 欄位 |
|-----------|---------------|
| path | element |
| 'quality-gap' | type |
| F → critical, C → warning | severity |
| 固定 'scores' | source |
| `改善 ${path} 品質（${grade} 級 ${total} 分）` | title |
| suggestions 合併 | description |
| (100 - total) | impact |

過濾：只取 F 級和 C 級（total < 80）。

### roadmap.md → RawSignal

解析 roadmap.md 中狀態欄位：

| 狀態標記 | severity | 處理 |
|:--------:|:--------:|------|
| 🔄 | warning | 進行中但未完成 |
| ⬜ | info | 待開始 |
| ❌ | critical | 標記為缺失 |
| ✅ | — | 跳過（已完成）|

| 解析欄位 | RawSignal 欄位 |
|----------|---------------|
| 任務名稱 | element |
| 'roadmap-gap' | type |
| 見上表 | severity |
| 固定 'roadmap' | source |
| `完成 ${taskName}` | title |
| `Roadmap 狀態：${status}` | description |
| 🔄 → 60, ❌ → 80, ⬜ → 30 | impact |

## 執行步驟

### Phase 1：核心引擎（sequential）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 1 | gap-discovery.js | 4 個 collector + mergeSignals + calculateConfidence + derivePriority/Depth |
| 2 | gap-discovery.js | discoverGaps() 主函式 + CLI 入口 |
| 3 | gap-discovery.js | filterExistingNotion() + syncToNotion() |

### Phase 2：測試 + 整合（parallel，依賴 Phase 1）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 4a | gap-discovery.test.js | 4 源收集測試 + 合併去重 + 信心計算 + 排序 |
| 4b | gap-discovery.test.js | Notion 同步測試（mock createTask）|
| 4c | self-drive-prompt.md | 改為呼叫 gap-discovery.js |

## Pre-mortem

**假設這個功能上線後失敗了，最可能的原因是什麼？**

| # | 失敗情境 | 機率 | 影響 | 預防措施 |
|---|---------|:----:|:----:|---------|
| 1 | 信心公式太激進，低品質建議也達到 70 分被建成待做任務 | 中 | 中 | 初始版本保守：單源最高 60 分，必須多源交叉才能達到 70。上線後觀察 1 週調整 |
| 2 | roadmap.md 格式變更導致 regex 解析失敗 | 中 | 低 | 每個源獨立 try-catch，解析失敗只影響 roadmap 源，warnings 記錄供排查 |
| 3 | Notion API rate limit 導致大批建立失敗 | 中 | 中 | syncToNotion 逐個建立 + 失敗記錄 + 不卡住其他建議 |
| 4 | 去重不完全，element 名稱在不同源格式不同 | 中 | 低 | 統一 element 格式：去除前綴（skills/、scripts/），只留核心路徑 |
| 5 | scores.jsonl 行數過多（數百行），解析緩慢 | 低 | 低 | 只讀取最近 7 天的記錄（按 date 過濾）|

## 測試策略

| 測試檔案 | 驗收條件 |
|---------|---------|
| gap-discovery.test.js | collectFromGapAnalyzer 正確轉換 Gap → RawSignal |
| gap-discovery.test.js | collectFromCapabilityProbe 正確轉換 WeakCapability → RawSignal |
| gap-discovery.test.js | collectFromScores 正確過濾 F/C 級 + 轉換 |
| gap-discovery.test.js | collectFromRoadmap 正確解析 roadmap 狀態 |
| gap-discovery.test.js | mergeSignals 同 element 合併、confidence 加成、不超過 100 |
| gap-discovery.test.js | calculateConfidence 公式正確（base + cross-source bonus） |
| gap-discovery.test.js | discoverGaps 空輸入回傳空 suggestions |
| gap-discovery.test.js | discoverGaps 部分源失敗仍回傳其他源結果 |
| gap-discovery.test.js | syncToNotion 按信心分級建立任務 |
| gap-discovery.test.js | syncToNotion 呼叫 createTask 且傳入正確參數 |

## 不做什麼

1. **不做快取層**：引擎每次重算（gap-analyzer 本身有快取），避免快取過期產出過時建議
2. **不做 AI 輔助分析**：純確定性邏輯，AI 決策留給 self-drive prompt 層
3. **不做 Notion 任務更新**：只建立新任務，不更新既有任務狀態（那是 notion-tasks.js 的職責）
4. **不做歷史趨勢分析**：只看當前快照，趨勢分析留給 judge.js
