# 能力邊界感知 — 技術設計

## 深度路由：D2
**理由**：跨 3 個模組整合（新增 1 個腳本 + 修改 2 個現有模組），無安全敏感操作，不需 reviewer。

---

## 技術摘要

- **方案**：新增 capability-probe.js（~250 行），串接已有的 tool-matcher + learner 事件提取模式，產出 capability-boundary.json；透過 improvements.jsonl 餵給 lifecycle-orchestrator 消費
- **理由**：最小新程式碼（1 個新檔），最大槓桿（串接 3 個已有模組的未消費輸出）
- **取捨**：不做即時攔截（只事後分析），換取零侵入性和簡單性

## 方案比較

| 維度 | A：SessionEnd 事後探測（選擇） | B：PreToolUse 即時攔截 | C：獨立 daemon 持續監控 |
|------|:---------------------------:|:---------------------:|:---------------------:|
| 複雜度 | 低（1 個新腳本） | 高（每次 tool call 都判斷） | 高（新 daemon + 通信） |
| 延遲影響 | 零（背景執行） | 每次 tool call +50ms | 零（獨立 process） |
| 資料品質 | 中（事後 session 級） | 高（即時 tool 級） | 中（聚合級） |
| 侵入性 | 低（不改現有 hook 路徑） | 高（改 dispatch 流程） | 中（新 daemon 管理） |
| **結論** | ✅ 最小侵入，夠用 | ❌ 延遲不可接受 | ❌ 過度工程 |

## 模組介面

### 新增檔案

| # | 檔案 | 位置 | 行數 | 用途 | 消費者 |
|---|------|------|------|------|--------|
| 1 | capability-probe.js | `~/.claude/scripts/` | ~250 | 能力邊界探測 + 模型更新 | maintainer.js（SessionEnd 並行呼叫） |

### 修改檔案

| # | 檔案 | 變更內容 |
|---|------|---------|
| 1 | context-injector.js | 新增 injectCapabilityBoundary() 函式，SessionStart 注入能力邊界摘要 |
| 2 | maintainer.js | SessionEnd Phase 增加 capability-probe 呼叫（與 learner 並行） |

### 新增測試

| # | 檔案 | 位置 | 用途 |
|---|------|------|------|
| 1 | capability-probe.test.js | `~/projects/overtone/tests/unit/` | 探測 + 分類 + 累積 + 門檻觸發 |

### API 設計

```javascript
// capability-probe.js

/**
 * 探測單次 session 的能力覆蓋狀態
 * @param {string} [eventsFile] - flow-events 路徑（預設 /tmp/nova-flow-events.jsonl）
 * @param {object} [deps] - DI 依賴注入
 * @returns {Promise<ProbeResult>}
 */
export async function probeSession(eventsFile?, deps?) → {
  intent: string,                    // 提取的任務意圖
  recommended: ToolMatch[],          // tool-matcher 推薦的工具
  actualTools: string[],             // 實際使用的工具
  missing: string[],                 // 缺失的能力
  coverage: number,                  // 0-1 覆蓋率
  hasFailureSignals: boolean,        // 是否有失敗信號
  updatedBoundary: Boundary,         // 更新後的邊界模型
  triggeredImprovements: string[],   // 觸發的改善建議
}

/**
 * 讀取能力邊界模型
 * @returns {Boundary}
 */
export function getBoundary(deps?) → Boundary

/**
 * 取得 weak + missing 能力清單
 * @returns {CapabilityEntry[]}
 */
export function getWeakCapabilities(deps?) → CapabilityEntry[]

/**
 * 純函式：分類能力強度
 * @returns {"strong"|"adequate"|"weak"|"missing"}
 */
export function classifyStrength(cap) → string

/**
 * 純函式：衰減計數（每 30 天乘 0.8）
 * @returns {number}
 */
export function decayCount(count, daysSinceLastSeen) → number
```

## 資料模型

### capability-boundary.json

```json
{
  "version": 1,
  "lastUpdated": "ISO-8601",
  "capabilities": {
    "<capability-label>": {
      "coverageHits": number,
      "missingHits": number,
      "lastSeen": "YYYY-MM-DD",
      "strength": "strong" | "adequate" | "weak" | "missing"
    }
  },
  "sessions": {
    "total": number,
    "withGaps": number,
    "lastAnalyzed": "ISO-8601"
  }
}
```

- 儲存位置：`~/.claude/data/capability-boundary.json`
- 清理策略：不刪除，衰減機制（30 天乘 0.8）防止無限增長
- 能力標籤來源：tool-registry.js 的 CAPABILITY_VOCAB（50+ 標準標籤）

### improvements.jsonl 寫入格式（供 lifecycle-orchestrator 消費）

```json
{
  "date": "2026-03-17",
  "source": "capability-probe",
  "type": "capability-gap",
  "capability": "database",
  "missingHits": 3,
  "strength": "missing",
  "suggestion": "建立 database 相關 Skill 或工具，覆蓋 SQL/migration/query 能力"
}
```

## 核心演算法

### 意圖提取

```
1. 讀取 flow-events.jsonl，篩選最新 sid
2. 提取 prompt_submit 事件的 prompt_preview → 合併為 intent 字串
3. 若無 prompt（自主 session）→ 從工具序列推斷（降低信心）
```

### 覆蓋率計算

```
coverage = |recommended ∩ actualTools| / |recommended|

- recommended 來自 tool-matcher.matchTools(intent)
- actualTools 來自 flow-events 的 tool_use 事件
- coverage = 1.0 表示完全覆蓋，0.0 表示完全不覆蓋
```

### 缺口偵測

```
for each capability in missing:
  boundary[capability].missingHits += 1
  if hasFailureSignals:
    boundary[capability].missingHits += 1   // 失敗加倍計權

for each capability in recommended ∩ actualTools:
  boundary[capability].coverageHits += 1

// 門檻觸發
if boundary[capability].missingHits >= 3:
  寫入 improvements.jsonl
```

### 衰減機制

```
每次 probeSession 執行時，對所有能力計數衰減：
decayFactor = 0.8 ^ (daysSinceLastSeen / 30)
coverageHits = round(coverageHits * decayFactor)
missingHits = round(missingHits * decayFactor)
```

## 執行步驟

### Phase 1：capability-probe.js 核心（sequential）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 1a | capability-probe.js | 實作 probeSession + getBoundary + getWeakCapabilities + classifyStrength + decayCount |
| 1b | capability-probe.js | CLI 入口（--summary / --weak / --json） |
| 1c | capability-probe.test.js | 核心邏輯測試（classifyStrength、decayCount、覆蓋率計算、門檻觸發） |

### Phase 2：整合（parallel，依賴 Phase 1）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 2a | context-injector.js | 新增 injectCapabilityBoundary() |
| 2b | maintainer.js | SessionEnd 增加 capability-probe 呼叫 |

### Phase 3：端到端驗證（sequential，依賴 Phase 2）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 3a | capability-probe.test.js | 整合測試（mock flow-events → probeSession → 驗證 boundary 更新） |
| 3b | `bun test` | 確認所有現有測試不受影響 |

## Pre-mortem

**假設這個功能上線後失敗了，最可能的原因是什麼？**

| # | 失敗情境 | 機率 | 影響 | 預防措施 |
|---|---------|:----:|:----:|---------|
| 1 | tool-matcher 語意匹配雜訊多，缺口偵測不準確 | 中 | 低 | 累積門檻 >= 3 過濾雜訊；fallback 到關鍵詞匹配；失敗信號加倍計權增強信噪比 |
| 2 | 意圖提取從 prompt_preview 擷取不完整 | 中 | 低 | prompt_preview 通常包含關鍵動詞和名詞，對 tool-matcher 已足夠；不依賴完整 prompt |
| 3 | capability-boundary.json 被損壞（並行寫入） | 低 | 低 | 只有 capability-probe 寫此檔案（learner 寫 behaviors.jsonl，無競爭）；讀取失敗時從空模型重建 |
| 4 | 衰減機制過度清除有效數據 | 低 | 低 | 0.8^(d/30) 衰減溫和：30 天後保留 80%，90 天後保留 51% |
| 5 | improvements.jsonl 寫入格式不被 lifecycle-orchestrator 識別 | 中 | 中 | 使用 lifecycle-orchestrator 現有的 improvements 消費格式；新增 source 欄位區分來源 |

## 測試策略

| 測試檔案 | 驗收條件 |
|---------|---------|
| capability-probe.test.js | classifyStrength 4 種分類正確 |
| capability-probe.test.js | decayCount 衰減公式正確（0 天、30 天、90 天） |
| capability-probe.test.js | probeSession mock 路徑：有缺口的 session → boundary 更新正確 |
| capability-probe.test.js | probeSession mock 路徑：無缺口的 session → coverageHits 增加 |
| capability-probe.test.js | 門檻觸發：missingHits >= 3 → improvements.jsonl 寫入 |
| capability-probe.test.js | 空 events 檔案 → 跳過，不 crash |
| capability-probe.test.js | boundary.json 損壞 → 從空重建 |

## 不做什麼

1. **不做即時攔截**：PreToolUse 階段判斷能力邊界會增加每次 tool call 延遲，事後分析已足夠觸發改善閉環
2. **不修改 tool-matcher.js**：只消費其 missing 輸出，不改其核心匹配邏輯
3. **不建 Dashboard 面板**：CLI --summary 已足夠；Dashboard 面板是獨立 scope
4. **不做 auto-forge**：探測器只產出建議寫入 improvements.jsonl，由 lifecycle-orchestrator 決定是否 forge — 職責分離
