# R4 E2E 整合測試 -- 實作任務

## 深度路由：D2
**Executor 指示**：Phase 1 各 Task 為 sequential（同一檔案依序累加）。Phase 2 為驗收。

---

## Phase 1：測試實作（sequential，同一檔案）

### T1：共用 Helper + Mock 資料（~80 行）

**檔案**：`~/projects/nova-brain/tests/unit/r4-e2e-integration.test.js`

- [ ] 建立檔案，import `bun:test` + 6 個真實模組（gap-discovery, capability-probe, task-adapter, heartbeat, session-spawner 的 suggestDepth/buildPrompt）
- [ ] 定義 MOCK 常數（沿用 r4-self-drive-loop.test.js 的 MOCK_GAPS, MOCK_WEAK_CAPS, MOCK_SCORES, MOCK_ROADMAP, MOCK_NOTION_TASKS）
- [ ] 實作 `makeMemoryDeps(initialData)` — in-memory FS for task-adapter（沿用現有實作）
- [ ] 實作 `makeTmpEnv(prefix)` — 建立 tmpdir + 回傳 { dir, stateFile, summaryFile, eventsFile, boundaryFile, dataDir, cleanup }
- [ ] 實作 `suggestionToNotionTask(suggestion)` — 將 Suggestion 轉為 `{ id, name, priority }` 格式

**驗收**：helper 函式可被後續 describe 區塊使用，無語法錯誤。

### T2：場景 1 -- 完整全自動迴圈（~100 行）

**檔案**：`~/projects/nova-brain/tests/unit/r4-e2e-integration.test.js`（接續 T1）

- [ ] `describe('場景 1：完整全自動迴圈（Happy Path）')`
- [ ] `test('gap-discovery → Notion sync → heartbeat → task-adapter → execute → record → probe → 收斂')` 包含：
  - discoverGaps _mock 注入 → 取 suggestions
  - syncToNotion mock createTask → 驗證 created >= 1
  - 將 created 任務轉為 Notion task → poll mock deps → 驗證 action === 'execute'
  - planForTask 使用 in-memory deps + mock matchTools/suggestDepth → 取得 plan
  - executeTask mock spawnSession(成功) → 驗證 status === 'success'
  - recordOutcome → 驗證 patterns 非空
  - 寫入 probe events → probeSession mock deps → 驗證 boundary 更新
  - 第二輪 discoverGaps（移除已修復缺口的 mock）→ 驗證 suggestions 數量 <= 第一輪

**驗收**：`bun test --filter "場景 1"` 通過。

### T3：場景 2 -- 學習反饋閉環（~60 行）

**檔案**：`~/projects/nova-brain/tests/unit/r4-e2e-integration.test.js`（接續 T2）

- [ ] `describe('場景 2：學習反饋閉環')`
- [ ] `test('exploration → success record → pattern 複用 → 連續失敗 → 清除 → exploration')` 包含：
  - planForTask 首次 → 斷言 source: "exploration"
  - recordOutcome(success=true)
  - planForTask 同類任務 → 斷言 source: "pattern" + confidence >= 0.6
  - recordOutcome(success=false) x3
  - planForTask → 斷言 source !== "pattern"
  - 驗證 patterns 中該類型的 PlanRecord 被清除

**驗收**：`bun test --filter "場景 2"` 通過。

### T4：場景 3 -- 跨模組資料格式相容性（~100 行）

**檔案**：`~/projects/nova-brain/tests/unit/r4-e2e-integration.test.js`（接續 T3）

- [ ] `describe('場景 3：跨模組資料格式相容性')`
- [ ] 6 個 test，各驗證一個跨模組邊界：
  - `test('gap-discovery Suggestion → syncToNotion')` — 驗證 suggestion 有 title, description, confidence(number), suggestedPriority(string)
  - `test('gap-discovery Suggestion → heartbeat task')` — 驗證轉換後有 id/name, priority
  - `test('heartbeat task → task-adapter planForTask')` — 將 poll 的 task.name 傳入 planForTask，不 throw
  - `test('task-adapter AdaptationPlan → session-spawner')` — 驗證 plan 有 tools(array), depth(string)；depth 可傳入 suggestDepth 參考
  - `test('capability-probe → gap-discovery 下輪')` — probeResult.triggeredImprovements 的格式可作為 gap-discovery 的 weakCaps 源
  - `test('recordOutcome → lookupPattern')` — recordOutcome 後 lookupPattern 能找到且 confidence/tools/depth 正確

**驗收**：`bun test --filter "場景 3"` 通過。

### T5：場景 4 -- 降級容錯（~60 行）

**檔案**：`~/projects/nova-brain/tests/unit/r4-e2e-integration.test.js`（接續 T4）

- [ ] `describe('場景 4：降級容錯')`
- [ ] `test('4a: gap-discovery 某源失敗 → 其餘源仍產出')` — _mock 中 gaps=null, scores=undefined → suggestions 仍有結果
- [ ] `test('4b: session spawn 失敗 → state 恢復 + task reset')` — executeTask 使用 spawnSession 回傳 exitCode:1 → status:'failed' + state.activeTask===null + resetTask 被呼叫
- [ ] `test('4c: recordOutcome 寫入失敗 → 不阻塞 planForTask')` — deps.writeFileSync throw → recordOutcome 不 throw → 後續 planForTask 可正常運作

**驗收**：`bun test --filter "場景 4"` 通過。

### T6：場景 5 -- 多迴圈累積（~80 行）

**檔案**：`~/projects/nova-brain/tests/unit/r4-e2e-integration.test.js`（接續 T5）

- [ ] `describe('場景 5：多迴圈累積 -- 系統收斂')`
- [ ] `test('3 輪迴圈：缺口遞減 + confidence 遞增 + boundary 累積')` 包含：
  - 定義 3 輪的 mock 資料（每輪逐步減少缺口）
  - 每輪執行簡化迴圈：discoverGaps → planForTask → recordOutcome(success) → probeSession
  - 追蹤指標：每輪的 suggestions.length、pattern confidence、boundary coverageHits
  - 斷言收斂：round3 suggestions <= round1 suggestions
  - 斷言 confidence >= 0.7（3 次成功）
  - 斷言 coverageHits 嚴格遞增
  - 斷言 patterns 數量 < 100

**驗收**：`bun test --filter "場景 5"` 通過。

---

## Phase 2：驗收（sequential，依賴 Phase 1）

### T7：全量測試 + 行數確認

- [ ] 執行 `bun test` 確認全部測試通過（含既有測試不迴歸）
- [ ] 確認 `r4-e2e-integration.test.js` 行數 <= 600 行
- [ ] 確認測試執行時間 < 2 秒

---

## 依賴分析

```
Phase 1（sequential）: T1 → T2 → T3 → T4 → T5 → T6（同一檔案，依序累加）
Phase 2（sequential）: T7（依賴 Phase 1）
```

Phase 1 內的 Task 必須 sequential — 同一個測試檔案，每個 Task 在前一個的基礎上累加 describe 區塊。
