# R4 全自動閉環 E2E 整合測試 -- 技術設計

## 深度路由：D2
**理由**：新建 1 個測試檔案，消費 6 個現有模組但不修改它們的 API。非安全敏感，D1 不足（跨 6 模組整合需設計 mock 架構），D3 過度（純測試檔案不需 reviewer）。

---

## 技術摘要

- **方案**：單測試檔案，使用真實模組邏輯 + DI 注入 mock 外部系統，按 5 個場景組織 describe 區塊
- **理由**：真實模組邏輯確保 API 變更時測試立即失敗（活的契約）；DI mock 確保不觸碰外部系統
- **取捨**：測試檔案可能偏長（~500 行），但 5 個場景各自獨立、可單獨定位問題

## 方案比較

| 維度 | 方案 A：單檔案 5 場景（選擇） | 方案 B：每場景獨立檔案 |
|------|:---:|:---:|
| 共用 helper 重用 | 檔案內共用，零重複 | 需要提取到共用模組 |
| 定位失敗 | describe 名稱定位 | 檔案名定位 |
| 維護成本 | 1 個檔案 | 5 個檔案 |
| 與既有模式一致 | 是（r4-self-drive-loop.test.js 同模式） | 否 |
| **結論** | 選擇：一致性 + 共用 helper | 不選：過度拆分 |

## 測試架構

### Mock 策略

| 層 | 真實 / Mock | 理由 |
|----|:-----------:|------|
| gap-discovery.js | 真實邏輯 | 使用 `_mock` 注入 mock 資料，內部聚合/排序邏輯為真 |
| capability-probe.js | 真實邏輯 | 使用 deps 注入 mock FS + matchTools |
| task-adapter.js | 真實邏輯 | 使用 deps 注入 in-memory FS + mock matchTools/suggestDepth |
| heartbeat.js | 真實邏輯 | 使用 `_deps` 注入 mock Notion API + spawnSession |
| session-spawner.js | 真實 suggestDepth + buildPrompt | spawnSession 不呼叫（由 heartbeat mock 取代） |
| syncToNotion | 真實邏輯 | 使用 `_deps.createTask` mock |
| Notion API | Mock | `_deps.listTasks/claimTask/completeTask/resetTask` |
| 本地模型 | 不涉及 | 本測試不觸碰 learner/judge 的語意評分 |
| claude CLI | Mock | heartbeat 的 `_deps.spawnSession` 回傳 mock 結果 |
| 檔案系統 | tmpdir 真實寫入 | 驗證 patterns/boundary/state 的持久化正確性 |

### 共用 Helper

```javascript
// ─── 共用 Mock 工廠 ───────────────────────────────────────────────────────

/** 建立 in-memory 檔案系統（task-adapter patterns） */
function makeMemoryDeps(initialData = null)
// 沿用 r4-self-drive-loop.test.js 的實作

/** 建立 tmpdir + 清理函式 */
function makeTmpEnv(prefix)
// 回傳 { dir, stateFile, summaryFile, eventsFile, boundaryFile, cleanup }

/** 建立 heartbeat 的 mock deps */
function makeHeartbeatDeps(overrides = {})
// 預設：listTasks 回傳 MOCK_NOTION_TASKS，spawnSession 回傳成功
// overrides 可覆蓋任何 dep

/** 建立 capability-probe 的 mock deps */
function makeProbeDeps(tmpEnv, overrides = {})
// 注入 tmpEnv 的路徑 + 預設 matchTools

/** 將 gap-discovery 的 Suggestion 轉換為 Notion task 格式 */
function suggestionToNotionTask(suggestion)
// { id: suggestion.id, name: suggestion.title, priority: suggestion.suggestedPriority }
```

## 具體測試案例

### 場景 1：完整全自動迴圈（Happy Path）

```
describe('場景 1：完整全自動迴圈')

test('gap-discovery → Notion sync → heartbeat → task-adapter → execute → record → probe → 第二輪 gap')
```

**步驟**：
1. `discoverGaps({ _mock: mockData, skipNotion: true })` → 取得 `report.suggestions`
2. `syncToNotion(suggestions, {}, { createTask })` → 記錄建立的任務
3. 將建立的任務轉為 Notion task 格式 → `poll({ _stateFile }, { listTasks, claimTask })`
4. 取 poll 結果的 task → `planForTask(task.name, {}, adapterDeps)`
5. `executeTask(task, { _stateFile }, { spawnSession(成功), completeTask })` → 成功
6. `recordOutcome(task.name, plan.tools, plan.depth, true, 500, adapterDeps)`
7. 寫入 probe events → `probeSession(eventsFile, probeDeps)` → 更新 boundary
8. 第二輪 `discoverGaps`（使用更新後的 mock 資料 — 移除已修復的缺口）

**斷言**：
- `report.suggestions.length > 0`（有缺口被發現）
- `syncResult.created >= 1`（高信心建議被建立）
- `pollResult.action === 'execute'`（任務被領取）
- `plan.source` 為 `'exploration'` 或 `'pattern'`
- `execResult.status === 'success'`
- patterns 中新增記錄（`adapterDeps._read()` 非空）
- `probeResult.updatedBoundary` 的 coverageHits 增加
- 第二輪 suggestions 長度 <= 第一輪（收斂）

### 場景 2：學習反饋閉環

```
describe('場景 2：學習反饋閉環')

test('exploration → record success → pattern 複用 → 連續失敗 → 清除 → 回到 exploration')
```

**步驟**：
1. `planForTask('kubernetes deployment 部署', {}, deps)` → 斷言 source: "exploration"
2. `recordOutcome('kubernetes deployment 部署', tools, depth, true, 120, deps)`
3. `planForTask('kubernetes deployment 更新', {}, deps)` → 斷言 source: "pattern"
4. `recordOutcome(desc, tools, depth, false, 0, deps)` x3 → 連續失敗
5. `planForTask('kubernetes deployment 修復', {}, deps)` → 斷言 source !== "pattern"

**斷言**：
- 步驟 1 的 confidence < 0.6（首次探索）
- 步驟 3 的 confidence >= 0.6（經驗累積）
- 步驟 5 的 source 為 "exploration" 或 "fallback"
- patterns 中該類型的 PlanRecord 被清除

### 場景 3：跨模組資料格式相容性

```
describe('場景 3：跨模組資料格式相容性')

test('gap-discovery Suggestion → syncToNotion 欄位相容')
test('gap-discovery Suggestion → heartbeat task 欄位相容')
test('heartbeat task → task-adapter planForTask 欄位相容')
test('task-adapter AdaptationPlan → session-spawner 欄位相容')
test('capability-probe → gap-discovery 下輪相容')
test('recordOutcome → lookupPattern 欄位相容')
```

**每個 test 的模式**：
1. 呼叫上游模組取得真實輸出
2. 斷言下游模組需要的欄位存在且型別正確
3. 將上游輸出直接傳入下游模組（不手動轉換），驗證不 throw

### 場景 4：降級容錯

```
describe('場景 4：降級容錯')

test('4a: gap-discovery 某源失敗 → 其餘源仍產出建議')
test('4b: session spawn 失敗 → state 恢復 + task reset')
test('4c: recordOutcome 寫入失敗 → 不阻塞後續 planForTask')
```

**4a**：`discoverGaps({ _mock: { gaps: null, weakCaps: MOCK_WEAK_CAPS, scores: undefined, roadmapContent: MOCK_ROADMAP }, skipNotion: true })`
- 斷言：`report.suggestions.length > 0`、`report.metadata.sourcesUsed` 不含失敗源

**4b**：`executeTask(task, config, { spawnSession: 失敗, resetTask })`
- 斷言：`execResult.status === 'failed'`、state.activeTask === null、resetTask 被呼叫

**4c**：`recordOutcome` 使用 writeFileSync throw 的 deps → 不 throw → 後續 `planForTask` 仍可運作

### 場景 5：多迴圈累積

```
describe('場景 5：多迴圈累積 -- 系統收斂')

test('3 輪迴圈：缺口遞減 + confidence 遞增 + boundary 累積')
```

**步驟**：迴圈 3 次執行場景 1 的簡化版
- 每輪的 mock 資料根據上一輪結果動態調整（移除已修復缺口、加入新的 scores）
- 追蹤每輪的指標：suggestions 數量、pattern confidence、boundary coverageHits

**斷言**：
- `round3.suggestions.length <= round1.suggestions.length`
- pattern confidence 在 3 輪後 >= 0.7
- boundary coverageHits 嚴格遞增
- patterns 數量不超過 100（上限保護）

## 檔案結構

| # | 檔案 | 位置 | 行數估算 | 用途 |
|---|------|------|:--------:|------|
| 1 | r4-e2e-integration.test.js | `tests/unit/` | ~500 | 5 場景整合測試 |

不修改任何現有檔案。

## 測試檔案結構

```javascript
// r4-e2e-integration.test.js
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';

// ─── 真實模組 import ──────────────────────────────────────────
import { discoverGaps, syncToNotion } from '...gap-discovery.js';
import { probeSession, classifyStrength } from '...capability-probe.js';
import { planForTask, recordOutcome, lookupPattern } from '...task-adapter.js';
import { poll, executeTask, readState, writeState } from '...heartbeat.js';
import { suggestDepth, buildPrompt } from '...session-spawner.js';

// ─── 共用 Mock 資料（沿用 + 擴展）──────────────────────────────
const MOCK_GAPS = [...];
const MOCK_WEAK_CAPS = [...];
// ...

// ─── 共用 Helper ──────────────────────────────────────────────
function makeMemoryDeps(initialData) { ... }
function makeTmpEnv(prefix) { ... }
function makeHeartbeatDeps(overrides) { ... }
function makeProbeDeps(tmpEnv, overrides) { ... }
function suggestionToNotionTask(suggestion) { ... }

// ─── 場景 1：完整全自動迴圈 ─────────────────────────────────────
describe('場景 1：完整全自動迴圈（Happy Path）', () => { ... });

// ─── 場景 2：學習反饋閉環 ─────────────────────────────────────
describe('場景 2：學習反饋閉環', () => { ... });

// ─── 場景 3：跨模組資料格式相容性 ─────────────────────────────
describe('場景 3：跨模組資料格式相容性', () => { ... });

// ─── 場景 4：降級容錯 ─────────────────────────────────────────
describe('場景 4：降級容錯', () => { ... });

// ─── 場景 5：多迴圈累積 ─────────────────────────────────────
describe('場景 5：多迴圈累積 -- 系統收斂', () => { ... });
```

## 資料流圖（測試視角）

```
┌─────────────────────────────────────────────────────────────┐
│                    測試環境（tmpdir）                         │
│                                                             │
│  Mock 資料                                                  │
│  ┌────────┐   ┌────────────┐   ┌──────────┐   ┌─────────┐ │
│  │ GAPS   │   │ WEAK_CAPS  │   │ SCORES   │   │ ROADMAP │ │
│  └───┬────┘   └─────┬──────┘   └─────┬────┘   └────┬────┘ │
│      └──────────────┼────────────────┼──────────────┘      │
│                     ▼                                       │
│            ┌────────────────┐                               │
│            │ discoverGaps   │ ← 真實邏輯 + _mock 注入        │
│            │ (gap-discovery)│                               │
│            └───────┬────────┘                               │
│                    │ Suggestion[]                           │
│              ┌─────┴──────┐                                 │
│              ▼            ▼                                  │
│     ┌────────────┐  ┌──────────────────┐                   │
│     │ syncToNotion│  │ 格式相容性斷言     │                   │
│     │ (mock deps)│  │ (場景 3)          │                   │
│     └──────┬─────┘  └──────────────────┘                   │
│            │ created tasks                                  │
│            ▼                                                │
│     ┌────────────────┐                                     │
│     │ heartbeat poll │ ← mock listTasks/claimTask           │
│     └───────┬────────┘                                     │
│             │ task                                          │
│             ▼                                               │
│     ┌────────────────┐                                     │
│     │ task-adapter   │ ← in-memory FS + mock matchTools     │
│     │ planForTask    │                                     │
│     └───────┬────────┘                                     │
│             │ AdaptationPlan                                │
│             ▼                                               │
│     ┌────────────────┐                                     │
│     │ heartbeat      │ ← mock spawnSession(成功)            │
│     │ executeTask    │                                     │
│     └───────┬────────┘                                     │
│             │ success                                       │
│             ▼                                               │
│     ┌────────────────┐                                     │
│     │ recordOutcome  │ → patterns 更新（in-memory FS）       │
│     └───────┬────────┘                                     │
│             │                                               │
│             ▼                                               │
│     ┌────────────────┐                                     │
│     │ probeSession   │ ← tmpdir 真實寫入 boundary.json       │
│     └───────┬────────┘                                     │
│             │ updatedBoundary                               │
│             ▼                                               │
│     ┌────────────────┐                                     │
│     │ 第二輪           │                                     │
│     │ discoverGaps   │ → 收斂斷言                            │
│     └────────────────┘                                     │
└─────────────────────────────────────────────────────────────┘
```

## Pre-mortem

| # | 失敗情境 | 機率 | 影響 | 預防措施 |
|---|---------|:----:|:----:|---------|
| 1 | mock 資料與真實模組 API 不匹配 — discoverGaps 的 `_mock` 欄位名稱與實際不一致 | 低 | 高 | mock 資料直接沿用現有通過中的 r4-self-drive-loop.test.js 常數 |
| 2 | 場景 5 多迴圈測試不穩定 — 依賴上一輪結果的 mock 調整邏輯有 bug | 中 | 中 | 每輪的 mock 調整邏輯用純函式 + 獨立斷言，不做 3 輪共用一個複雜 mock |
| 3 | heartbeat state 在測試間洩漏 — tmpdir 清理不完整 | 低 | 中 | afterEach 用 `rmSync({ recursive: true, force: true })` + Date.now() 隨機目錄 |
| 4 | 測試超過 600 行限制 | 中 | 低 | 場景 3 用 for-of 迴圈表格驅動；共用 helper 壓縮重複 |

## 測試策略

| 場景 | 測試數量 | 斷言重點 |
|------|:--------:|---------|
| 場景 1：完整迴圈 | 1 | 串聯正確性 + 收斂性 |
| 場景 2：學習反饋 | 1 | source 轉換 + confidence 方向 |
| 場景 3：格式相容 | 6 | 欄位存在 + 型別 + 直接消費不 throw |
| 場景 4：降級容錯 | 3 | 不崩潰 + 降級行為正確 |
| 場景 5：多迴圈 | 1 | 收斂 + 累積 + 上限保護 |
| **合計** | **12** | |

## 不做什麼

1. **不修改既有模組的 API** — 本測試是消費者，不是提供者
2. **不測 learner/judge 語意評分** — 它們的 JSONL 輸出格式已在場景 3 透過 scores mock 間接驗證
3. **不測 event-bus 事件分發** — 已有獨立測試，迴圈的事件觸發是 nova-server 的責任
4. **不追求 100% 分支覆蓋** — 聚焦跨模組邊界，模組內部分支由各自的單元測試覆蓋
