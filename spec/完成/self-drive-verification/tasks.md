# Self-Drive 改善效果驗證閉環 — 任務清單

## 依賴分析

```
Phase 1（parallel）: T1 純函式 + T2 純函式測試（無依賴）
Phase 2（sequential）: T3 流程整合（依賴 Phase 1）
Phase 3（sequential）: T4 E2E 測試 + T5 全測試通過（依賴 Phase 2）
```

## Phase 1：純函式實作（parallel）

### T1：新增 4 個 export 純函式 — executor

**檔案**：`~/.claude/scripts/heartbeat.js`

**新增函式**：

1. `isImprovementTask(taskName)` — 判斷 `[全自動]` 前綴
2. `snapshotBoundary(deps)` — 讀取 capability-boundary.json，精簡為 `{ capabilities: { [name]: { strength, coverageHits, missingHits } }, timestamp }`
3. `computeDelta(before, after)` — 計算 `{ capabilitiesChanged, strengthUpgrades, totalCoverageGain, totalMissingReduction }`
4. `updateImprovementRecord(taskName, result, delta, deps)` — 讀取 improvements.jsonl → 模糊匹配 → 回寫 executedAt/executionResult/delta

**注意**：
- snapshotBoundary 呼叫 capability-probe.js 的 getBoundary(deps)
- updateImprovementRecord 的匹配邏輯：去掉 `[全自動]` 前綴 → trim → 檢查 improvements entry 的 suggestion 欄位是否包含此子字串
- 所有函式都 export（可測試）
- 所有 IO 都走 deps DI（可 mock）

### T2：純函式單元測試 — executor

**檔案**：`~/projects/overtone/tests/unit/r4-self-drive-loop.test.js`

**新增測試**（在「能力 4」section 擴展）：

1. `isImprovementTask('[全自動] 建立 docker Skill') === true`
2. `isImprovementTask('修復 bug') === false`
3. `computeDelta(before, after)` 正確計算 strengthUpgrades
4. `computeDelta` 正確處理新增能力（before 沒有，after 有）
5. `computeDelta` before/after 相同 → delta 全為 0

## Phase 2：流程整合（sequential，依賴 Phase 1）

### T3：修改 executeTask 流程 — executor

**檔案**：`~/.claude/scripts/heartbeat.js`

**修改 executeTask 函式**：

```
executeTask 開頭：
  const isImprovement = isImprovementTask(task.name)
  let beforeSnapshot = null
  if (isImprovement) beforeSnapshot = snapshotBoundary(deps)

session spawn + wait（現有邏輯不變）

session 完成後（在 summary 寫入前）：
  let improvementInfo = null
  if (isImprovement) {
    const afterSnapshot = snapshotBoundary(deps)
    const delta = computeDelta(beforeSnapshot, afterSnapshot)
    const target = task.name.replace(/^\[全自動\]\s*/, '')
    improvementInfo = { target, beforeSnapshot, afterSnapshot, delta }
    // 回寫 improvements.jsonl
    try { updateImprovementRecord(task.name, result.status, delta, deps) }
    catch (e) { console.error('[heartbeat] updateImprovementRecord error:', e.message) }
  }

修改 summaryEntry：
  加入 improvement: improvementInfo
```

**注意**：
- deps 需要傳遞 boundaryFile / improvementsFile 等路徑（已有 summaryFile 的 pattern，照做）
- 非改善任務完全不受影響（isImprovement = false → 跳過所有快照邏輯）

## Phase 3：E2E 測試（sequential，依賴 Phase 2）

### T4：改善效果驗證閉環 E2E 測試 — executor

**檔案**：`~/projects/overtone/tests/unit/r4-self-drive-loop.test.js`

**新增測試**（在「能力 4」section 擴展）：

1. **改善任務完整閉環**：
   - 寫入 initial capability-boundary（docker: missing, missingHits=5）
   - 寫入 initial improvements.jsonl（docker 建議）
   - mock spawnSession 成功
   - mock snapshotBoundary：before 回傳 missing，after 回傳 weak（模擬能力提升）
   - 執行 executeTask（task.name = '[全自動] 建立 docker Skill'）
   - 驗證 session-summaries.jsonl 含 improvement.delta.strengthUpgrades = 1
   - 驗證 improvements.jsonl 被回寫 executedAt + executionResult = 'success' + delta

2. **非改善任務不受影響**：
   - 執行 executeTask（task.name = '修復 bug'）
   - 驗證 session-summaries.jsonl 的 improvement 為 null

3. **改善任務失敗 → 仍記錄 delta = 0**：
   - mock spawnSession 失敗
   - 驗證 improvements.jsonl 被回寫 executionResult = 'failed'

### T5：全測試通過 — executor

```bash
bun test
```

驗證所有測試通過，包含現有測試不受影響。
