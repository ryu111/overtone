# R4 全自動閉環端到端真實驗證

## 動機（Why）

- **問題**：R4 三大子系統（工具動態組合、全自動閉環、自主適應）各有單元測試（1070 pass），但缺少端到端真實驗證。元件各自通過不代表整條鏈能跑通。
- **目標**：建立整合測試，驗證 R4 完成標準的 5 個能力能真實串聯運作
- **不做的代價**：宣稱 R4 完成但無客觀證據，進入 R5 後可能發現基礎不穩

## 範圍

### In-scope

- 整合測試：驗證 gap-discovery → suggestion → Notion sync 完整鏈路
- 整合測試：驗證 capability-probe → gap-discovery → suggestion 的跨模組串聯
- 整合測試：驗證 task-adapter 面對未知任務的適應 → 學習 → 複用迴圈
- 整合測試：驗證 heartbeat 模組觸發全自動閉環的完整 lifecycle
- 整合測試：驗證工具動態組合（tool-registry → tool-matcher）端到端

### Out-of-scope

- 修改現有元件的程式碼邏輯
- 真實呼叫 Notion API 或本地 LLM（全部 mock）
- 真實 spawn Claude session（mock spawnSession）
- 效能測試

## 使用者故事

身為 Nova 開發者，我想要一組整合測試驗證 R4 的 5 個閉環能力能串聯運作，以便客觀判斷 R4 是否達到完成標準。

身為 Nova 維護者，我想要整合測試在 `bun test` 中自動執行，以便任何改動不會破壞 R4 閉環。

## 行為規格

### 正常路徑

R4 完成標準的 5 個能力對應 5 條端到端鏈路：

**能力 1：發現自身能力缺口**
1. gap-analyzer 掃描產出 Finding[] → gap-discovery 聚合 4 源 → 排序後的 Suggestion[]
2. 驗證：suggestions 非空、按 score 降序、每個 suggestion 有 id/title/confidence/sources

**能力 2：生成改善建議並評估價值**
1. discoverGaps() 產出 Suggestion[] → syncToNotion() 依信心門檻建立/跳過
2. 驗證：confidence >= 40 的被建立、< 40 的被跳過、重複任務被過濾

**能力 3：自主執行改善**
1. heartbeat 模組 poll() 取得任務 → executeTask() spawn session → completeTask()
2. 驗證：任務被 claim → session 完成 → 任務被 complete → state 更新

**能力 4：驗證改善效果**
1. capability-probe probeSession() 偵測能力覆蓋 → 更新 boundary → 觸發 improvements
2. 驗證：missingHits 累積到門檻後觸發 improvement 寫入

**能力 5：適應從未見過的新任務類型**
1. task-adapter planForTask() 面對未知類型 → 探索（matchTools）→ recordOutcome() 學習 → lookupPattern() 複用
2. 驗證：第一次 source=exploration → 記錄成功 → 第二次 source=pattern

### 錯誤路徑

| 錯誤情境 | 預期行為 |
|---------|---------|
| 全部數據源失敗 | discoverGaps 回傳空 suggestions + error 訊息，不 throw |
| Notion API mock 失敗 | syncToNotion 記錄 failed count，不 crash |
| matchTools mock 失敗 | planForTask fallback 到 D2 depth，source=fallback |
| spawnSession mock 失敗 | executeTask 回傳 status=failed，state 恢復 |

### 邊界條件

- 4 源中 3 源失敗 → 仍用剩餘 1 源產出 suggestions
- 所有 suggestions 的 confidence < 40 → syncToNotion 全部跳過，created=0
- task-adapter 連續失敗 3 次 → PlanRecord 被清除（3 次失敗 STOP）
- capability-probe boundary.json 損壞 → 從空模型重建，不 crash

## 資料模型

### 輸入（測試 mock 資料）

| 資料 | Mock 方式 | 說明 |
|------|----------|------|
| Gap Finding[] | `_mockFindings` 參數 | 直接注入 gap-analyzer 結果 |
| WeakCapabilities[] | `mockWeakCaps` 參數 | 直接注入 capability-probe 結果 |
| scores.jsonl | `mockScores` 字串 | 直接注入 scores 內容 |
| roadmap.md | `mockRoadmapContent` 字串 | 直接注入 roadmap 內容 |
| Notion tasks | DI `_deps.listTasks/createTask` | in-memory mock |
| flow-events.jsonl | tmpfile 寫入 | 真實檔案但測試目錄 |
| tool-registry.json | DI `deps.registry` | in-memory mock |

### 輸出（驗證目標）

| 輸出 | 型別 | 驗證條件 |
|------|------|---------|
| DiscoveryReport | object | suggestions.length > 0, warnings 記錄失敗源 |
| SyncResults | object | created + skipped + failed 正確 |
| ProbeResult | object | boundary 更新、improvements 觸發 |
| PlanResult | object | source 從 exploration → pattern |
| HeartbeatResult | object | status = success/failed, state 正確更新 |

## 介面契約

所有已有 export 的 API，不新增 API：

| 模組 | 函式 | 測試呼叫方式 |
|------|------|-------------|
| gap-discovery.js | `discoverGaps(options)` | `_mock` + `skipNotion` + `_deps` |
| gap-discovery.js | `syncToNotion(suggestions, options, _deps)` | mock `createTask` |
| capability-probe.js | `probeSession(eventsFile, deps)` | mock `matchTools` + tmpfile |
| task-adapter.js | `planForTask(desc, ctx, deps)` | mock `matchTools` + `suggestDepth` |
| task-adapter.js | `recordOutcome(desc, tools, depth, success, duration, deps)` | in-memory FS |
| task-adapter.js | `lookupPattern(desc, deps)` | in-memory FS |
| heartbeat.js | `poll(config, deps)` | mock Notion deps |
| heartbeat.js | `executeTask(task, config, deps)` | mock spawnSession |
| tool-registry.js | `queryTools(filters, deps)` | mock registry |
| tool-matcher.js | `matchToolsByKeyword(intent, tools)` | 直接呼叫 |

## 非功能需求

| 維度 | 要求 |
|------|------|
| 執行速度 | 整合測試 < 2 秒（全 mock，無 IO 等待） |
| 隔離性 | 不觸碰真實 ~/.claude/data/、不呼叫 Notion API、不 spawn 真實 session |
| 可維護性 | mock 資料集中管理，與現有單元測試風格一致 |

## 依賴

| 方向 | 模組 | 說明 |
|------|------|------|
| 上游 | gap-discovery.js | 被測模組 |
| 上游 | capability-probe.js | 被測模組 |
| 上游 | task-adapter.js | 被測模組 |
| 上游 | heartbeat.js | 被測模組 |
| 上游 | tool-registry.js + tool-matcher.js | 被測模組 |
| 上游 | session-spawner.js | 被測模組（mock） |
| 下游 | bun test runner | 執行環境 |

## 驗收標準

- [x] `bun test` 新增整合測試全部通過
- [x] 5 條端到端鏈路各有至少 1 個正常路徑 + 1 個錯誤路徑測試
- [x] 不觸碰真實外部系統（Notion API、LLM、Claude CLI）
- [x] 整合測試總執行時間 < 2 秒
- [x] 測試檔案放在 `~/projects/overtone/tests/unit/` 下（與現有風格一致）

## 風險

| 風險 | 機率 | 影響 | 緩解策略 |
|------|:----:|:----:|---------|
| 現有模組 DI 接口不完整導致無法 mock | 低 | 中 | 所有模組已有 `_mock`/`_deps`/`deps` 參數，DI 介面完整 |
| heartbeat.js 依賴 Bun.spawn 不易 mock | 中 | 低 | 用 `_deps.spawnSession` DI 注入 mock |
| 測試與實際行為 diverge | 低 | 中 | mock 資料來自現有單元測試的真實格式 |
