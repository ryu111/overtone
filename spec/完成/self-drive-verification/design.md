# Self-Drive 改善效果驗證閉環 — 技術設計

## 深度路由：D2
**理由**：跨 2 個模組（heartbeat.js + capability-probe.js），需擴展資料結構和流程，但改動範圍可控（不新增模組）。非安全敏感，不需 reviewer。

---

## 技術摘要

- **方案**：在 heartbeat.js 的 executeTask 前後擷取 capability-boundary 快照，計算 delta，擴展 session-summaries.jsonl 和 improvements.jsonl 欄位
- **理由**：最小改動原則 — 在資料流的關鍵節點（executeTask 前後）插入快照邏輯，不新增模組、不改變現有資料方向
- **取捨**：快照只含 capability-boundary（不含 scores.jsonl），Judge 評分歸因留給後續迭代

## 方案比較

| 維度 | 方案 A：heartbeat 內嵌快照（選擇） | 方案 B：獨立 verification-agent 模組 |
|------|:---:|:---:|
| 改動範圍 | 小（2 檔案） | 大（新增模組 + 註冊） |
| 資料一致性 | 高（同一函式內 before/after） | 中（跨模組需同步時機） |
| 可測試性 | 高（純函式 + DI） | 高 |
| 擴展性 | 中（後續需拆分時再拆） | 高（獨立模組天生解耦） |
| **結論** | 選擇 | 過度設計：目前只需 before/after 快照 |

## 模組介面

### 修改檔案

| # | 檔案 | 變更內容 |
|---|------|---------|
| 1 | `~/.claude/scripts/heartbeat.js` | 新增 snapshotBoundary / computeDelta / isImprovementTask / updateImprovementRecord 4 個純函式；修改 executeTask 流程加入快照邏輯 |
| 2 | `~/projects/overtone/tests/unit/r4-self-drive-loop.test.js` | 新增「能力 4」驗證效果閉環的完整測試 |

### API 設計

```javascript
// ─── 新增純函式（heartbeat.js export）─────────────────────────────────────

/**
 * 判斷任務是否為全自動改善任務
 * @param {string} taskName
 * @returns {boolean}
 */
export function isImprovementTask(taskName) {
  return typeof taskName === 'string' && taskName.startsWith('[全自動]');
}

/**
 * 擷取 capability-boundary.json 精簡快照
 * 只保留 capabilities 中各能力的 strength/coverageHits/missingHits
 * @param {object} [deps] — DI：{ boundaryFile, existsSync, readFileSync }
 * @returns {{ capabilities: Record<string, { strength, coverageHits, missingHits }>, timestamp: string }}
 */
export function snapshotBoundary(deps = {}) {
  // 呼叫 capability-probe.getBoundary(deps) 取得完整 boundary
  // 精簡為只含 strength/coverageHits/missingHits 的 map
}

/**
 * 計算兩個快照之間的 delta
 * @param {object} before — snapshotBoundary 回傳值
 * @param {object} after — snapshotBoundary 回傳值
 * @returns {{ capabilitiesChanged: number, strengthUpgrades: number, totalCoverageGain: number, totalMissingReduction: number }}
 */
export function computeDelta(before, after) {
  // 遍歷 after.capabilities，比對 before 中同名能力
  // strengthUpgrades: missing→weak, weak→adequate, adequate→strong 等升級計數
  // totalCoverageGain: sum of (after.coverageHits - before.coverageHits) for positive diffs
  // totalMissingReduction: sum of (before.missingHits - after.missingHits) for positive diffs
}

/**
 * 回寫 improvements.jsonl — 更新最新一筆匹配的建議
 * @param {string} taskName — 任務名稱（含 [全自動] 前綴）
 * @param {"success"|"failed"} result
 * @param {object} delta — computeDelta 回傳值
 * @param {object} [deps] — DI：{ improvementsFile, existsSync, readFileSync, writeFileSync }
 */
export function updateImprovementRecord(taskName, result, delta, deps = {}) {
  // 讀取 improvements.jsonl → 找到 title 包含 taskName 去掉 [全自動] 後的子字串的最新一筆
  // 更新 executedAt, executionResult, delta 欄位
  // 回寫整個 improvements.jsonl
}
```

### executeTask 修改流程

```
// 現有 executeTask 流程（偽碼）：
executeTask(task, config, deps):
  prompt = buildPrompt(task)
  ┌─ NEW: isImprovement = isImprovementTask(task.name)
  │  if isImprovement:
  │    beforeSnapshot = snapshotBoundary(deps)
  │
  spawn session → wait for outcome
  │
  │  if isImprovement:
  │    afterSnapshot = snapshotBoundary(deps)
  │    delta = computeDelta(beforeSnapshot, afterSnapshot)
  │
  record summary → NEW: summaryEntry.improvement = { target, beforeSnapshot, afterSnapshot, delta }
  │
  │  if isImprovement:
  │    updateImprovementRecord(task.name, result.status, delta, deps)
  └─
  return result
```

## 資料模型

### session-summaries.jsonl 擴展

```jsonc
{
  "date": "2026-03-17T10:00:00.000Z",
  "source": "heartbeat",
  "task": "[全自動] 建立 docker 相關 Skill",
  "status": "success",
  "proofOfWork": { "exitCode": 0, "duration": 120, "sessionId": "sess-123", "attempt": 0 },
  "summary": "心跳任務完成：[全自動] 建立 docker 相關 Skill",
  // NEW
  "improvement": {
    "target": "建立 docker 相關 Skill",
    "beforeSnapshot": {
      "capabilities": {
        "docker": { "strength": "missing", "coverageHits": 0, "missingHits": 5 }
      },
      "timestamp": "2026-03-17T09:50:00.000Z"
    },
    "afterSnapshot": {
      "capabilities": {
        "docker": { "strength": "weak", "coverageHits": 1, "missingHits": 5 }
      },
      "timestamp": "2026-03-17T10:00:00.000Z"
    },
    "delta": {
      "capabilitiesChanged": 1,
      "strengthUpgrades": 1,
      "totalCoverageGain": 1,
      "totalMissingReduction": 0
    }
  }
}
```

### improvements.jsonl 擴展

```jsonc
{
  "date": "2026-03-16",
  "source": "capability-probe",
  "type": "capability-gap",
  "capability": "docker",
  "missingHits": 5,
  "strength": "missing",
  "suggestion": "建立 docker 相關 Skill 或工具",
  // NEW
  "executedAt": "2026-03-17T10:00:00.000Z",
  "executionResult": "success",
  "delta": {
    "capabilitiesChanged": 1,
    "strengthUpgrades": 1,
    "totalCoverageGain": 1,
    "totalMissingReduction": 0
  }
}
```

- 儲存格式：JSONL（沿用）
- 儲存位置：`~/.claude/data/`（沿用）
- 清理策略：沿用現有截斷機制（improvements 保留 30 筆）

## 執行步驟

### Phase 1：純函式實作（parallel）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 1a | `~/.claude/scripts/heartbeat.js` | 新增 isImprovementTask、snapshotBoundary、computeDelta、updateImprovementRecord 4 個 export 純函式 |
| 1b | `~/projects/overtone/tests/unit/r4-self-drive-loop.test.js` | 新增純函式單元測試（isImprovementTask、computeDelta） |

### Phase 2：流程整合（sequential，依賴 Phase 1）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 2 | `~/.claude/scripts/heartbeat.js` | 修改 executeTask：在 session 前後加入快照邏輯，擴展 summaryEntry，呼叫 updateImprovementRecord |

### Phase 3：E2E 測試（sequential，依賴 Phase 2）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 3 | `~/projects/overtone/tests/unit/r4-self-drive-loop.test.js` | 擴展「能力 4」section，新增改善效果驗證閉環的 E2E 測試 |

## Pre-mortem

**假設這個功能上線後失敗了，最可能的原因是什麼？**

| # | 失敗情境 | 機率 | 影響 | 預防措施 |
|---|---------|:----:|:----:|---------|
| 1 | 改善任務名稱格式不一致，updateImprovementRecord 找不到匹配的 entry | 中 | 中 | 模糊匹配：去掉 `[全自動]` 前綴後，檢查 suggestion 欄位是否包含任務名稱的子字串 |
| 2 | capability-boundary.json 在 session 執行期間被 SessionEnd hook（capability-probe）覆寫，before/after 無法反映真實變化 | 中 | 低 | before 是深拷貝（JSON.parse(JSON.stringify)），after 在 session 結束後讀取最新值（這正是我們想要的） |
| 3 | improvements.jsonl 在 deduplicateImprovements 時把剛回寫的 entry 截斷 | 低 | 中 | updateImprovementRecord 修改現有 entry（非新增），dedup 保留最新，不受影響 |
| 4 | snapshotBoundary 在 boundary 檔案很大時拖慢 executeTask | 低 | 低 | 快照只取 capabilities 的 3 個欄位，且 JSON.parse < 5ms |

## 測試策略

| 測試檔案 | 驗收條件 |
|---------|---------|
| `r4-self-drive-loop.test.js` | isImprovementTask 正確識別 `[全自動]` 前綴 |
| `r4-self-drive-loop.test.js` | computeDelta 正確計算 strengthUpgrades（missing→weak = +1） |
| `r4-self-drive-loop.test.js` | computeDelta 正確計算 totalCoverageGain 和 totalMissingReduction |
| `r4-self-drive-loop.test.js` | 改善任務 executeTask E2E：session-summaries 含 improvement 欄位 |
| `r4-self-drive-loop.test.js` | 改善任務 executeTask E2E：improvements.jsonl 被回寫 executedAt + delta |
| `r4-self-drive-loop.test.js` | 非改善任務 executeTask：improvement 為 null |

## 不做什麼

1. **不做 Judge 評分歸因**：scores.jsonl 的分數變化需要更長時間窗口（7+ 天趨勢），與單次改善的因果關係弱，留給 L3 迭代
2. **不做 Dashboard 視覺化**：Dashboard 已有讀取 JSONL 的 API，擴展欄位後自然可查，不需專門開發
3. **不新增模組**：遵循最小改動原則，所有邏輯內嵌在 heartbeat.js 中。若未來驗證邏輯膨脹到 100+ 行再考慮拆分
