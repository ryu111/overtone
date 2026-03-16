# R4 自驅閉環端到端真實驗證 — 技術設計

## 深度路由：D2
**理由**：純測試撰寫，不修改既有程式碼，無安全敏感操作。跨 5 個模組但操作範圍限於新增 1 個測試檔案 + 跑測試驗證。

---

## 技術摘要

- **方案**：1 個整合測試檔案，5 個 describe 區塊分別驗證 R4 的 5 個閉環能力，全部使用現有 DI 介面 mock 外部依賴
- **理由**：所有被測模組都已設計完善的 DI 接口（`_mock`、`_deps`、`deps`），可直接注入 mock 而不需修改原始碼。1 個檔案而非 5 個，因為整合測試的重點是跨模組串聯。
- **取捨**：整合測試仍是 mock-based（非真正的端到端），但這是在不呼叫外部 API 下的最佳平衡

## 方案比較

| 維度 | A：Mock-based 整合測試（選擇） | B：真實 API 整合測試 |
|------|:----------------------------:|:------------------:|
| 執行速度 | < 2 秒 | > 30 秒（Notion API + LLM） |
| CI 可行性 | 無外部依賴 | 需 API key + 網路 |
| 可靠性 | 確定性（無 flaky） | API 不穩定 |
| 真實度 | 中（DI mock） | 高 |
| **結論** | 選擇 — 速度快、CI 友善、確定性 | 不選 — 外部依賴太多，flaky |

## 模組介面

### 新增檔案

| # | 檔案 | 位置 | 行數 | 用途 |
|---|------|------|------|------|
| 1 | r4-self-drive-loop.test.js | `~/projects/overtone/tests/unit/` | ~400 | R4 五大閉環能力端到端驗證 |

### 修改檔案

無。不修改任何既有檔案。

### 測試架構

```
describe('R4 E2E: 能力 1 — 發現自身能力缺口')
  test('gap-analyzer → gap-discovery 4 源聚合 → 排序建議')
  test('部分源失敗仍回傳結果')

describe('R4 E2E: 能力 2 — 生成建議並評估價值')
  test('discoverGaps → syncToNotion 完整鏈路：建立 + 跳過 + 過濾')
  test('全部低信心 → 零建立')

describe('R4 E2E: 能力 3 — 自主執行改善')
  test('heartbeat poll → claim → executeTask → complete 完整生命週期')
  test('session 失敗 → state 恢復 + task reset')

describe('R4 E2E: 能力 4 — 驗證改善效果')
  test('capability-probe 多 session 累積 → 門檻觸發 improvements')
  test('boundary 衰減 + 重新計算 strength')

describe('R4 E2E: 能力 5 — 適應未知任務類型')
  test('未知任務 → exploration → recordOutcome → 再次查詢 → pattern 複用')
  test('連續失敗 3 次 → PlanRecord 清除 → 退回 exploration')
```

## 資料模型

- 儲存格式：無持久化（全部 in-memory mock）
- 測試臨時檔案：`$TMPDIR/r4-e2e-test-*`（boundary.json、events.jsonl、task-patterns.json）
- 清理策略：`afterEach` 中 `rmSync(TMP_DIR, { recursive: true })`

## Mock 策略

### 共用 Mock 資料

```javascript
// 能力 1-2 共用
const MOCK_GAPS = [{ id: 'test:missing:skill-x', severity: 'critical', priority: 76, repairHint: '建立 SKILL.md', context: { element: 'skills/test-skill', type: 'missing-skillmd' } }];
const MOCK_WEAK_CAPS = [{ name: 'docker', strength: 'missing', missingHits: 5 }];
const MOCK_SCORES = '{"date":"2026-03-17","path":"skills/low","total":45,"grade":"F","suggestions":["改善"]}';
const MOCK_ROADMAP = '| R3.3 | 深度 PM | 重建 | ❌ |';

// 能力 3 共用
const MOCK_NOTION_TASKS = [{ id: 'notion-page-id', name: '測試任務', priority: 'P1' }];

// 能力 5 共用
const MOCK_TOOL_REGISTRY = { version: 1, scannedAt: '2026-03-17', tools: [
  { id: 'cli:git', name: 'git', type: 'cli', description: '版本控制', capabilities: ['git', 'vcs'], domains: ['dev'] },
  { id: 'cli:bun', name: 'bun', type: 'cli', description: 'JS runtime', capabilities: ['js-runtime', 'test'], domains: ['dev'] },
] };
```

### DI 注入點

| 模組 | DI 參數 | Mock 內容 |
|------|---------|----------|
| gap-discovery | `_mock.gaps/weakCaps/scores/roadmapContent` | 靜態測試資料 |
| gap-discovery | `_deps.listTasks/createTask` | in-memory array 操作 |
| capability-probe | `deps.matchTools` | 回傳固定 recommended/missing |
| capability-probe | `deps.boundaryFile/improvementsFile` | tmpfile 路徑 |
| task-adapter | `deps.matchTools/suggestDepth` | 回傳固定結果 |
| task-adapter | `deps.patternsFile/existsSync/readFileSync/writeFileSync` | in-memory FS |
| heartbeat | `_deps.listTasks/claimTask/completeTask/spawnSession` | 追蹤呼叫順序 |

## 執行步驟

### Phase 1：整合測試撰寫（sequential）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 1 | r4-self-drive-loop.test.js | 撰寫 5 個 describe 區塊，共 10 個測試案例 |

### Phase 2：驗證（sequential，依賴 Phase 1）

| 步驟 | 說明 |
|------|------|
| 2 | `bun test` 確認所有測試通過（含新增 + 既有） |

## Pre-mortem

**假設這個測試上線後失敗了，最可能的原因是什麼？**

| # | 失敗情境 | 機率 | 影響 | 預防措施 |
|---|---------|:----:|:----:|---------|
| 1 | heartbeat.js import 路徑是相對路徑，測試環境解析不同 | 中 | 低 | 用絕對路徑 import（與現有測試一致） |
| 2 | 能力 5 的 in-memory FS mock 與真實 fs API 不完全一致 | 低 | 低 | 複用 task-adapter.test.js 已驗證的 makeMemoryDeps 模式 |
| 3 | heartbeat executeTask 內部有 appendFileSync 到真實路徑 | 中 | 低 | 透過 `_deps.summaryFile` DI 導向 tmpdir |
| 4 | 測試間的 tmpdir 未清理導致狀態污染 | 低 | 中 | 每個 describe 用獨立 TMP_DIR + afterEach 清理 |

## 測試策略

| 測試檔案 | 驗收條件 |
|---------|---------|
| r4-self-drive-loop.test.js | 10 個測試全部通過、< 2 秒、不觸碰真實外部系統 |

## 不做什麼

1. **不修改既有模組**：所有 DI 介面已完備，不需改程式碼
2. **不建立真實 API 整合測試**：Notion/LLM/Claude CLI 依賴會造成 flaky test，用 mock 足矣
3. **不測試 UI/Dashboard**：R4 完成標準不包含 UI，Dashboard 有獨立驗證
