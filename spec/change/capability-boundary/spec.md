# 能力邊界感知（Capability Boundary Awareness）

## 動機（Why）

- **問題**：Nova 不知道自己「不會什麼」。tool-matcher.js 已能回報 `missing` 能力，但沒有消費者；任務失敗後沒有記錄「缺什麼能力」；missing capabilities 沒有觸發 skill-forge 補缺。三個環節斷裂，形成死路。
- **目標**：建立「任務需求 → 能力覆蓋率評估 → 缺口記錄 → 自動補缺建議」的閉環。Nova 在 session 執行中即時知道能力覆蓋狀態，失敗後自動記錄能力缺口，累積到門檻後觸發 skill-forge 補缺。
- **不做的代價**：R4.3 自主適應無法完成；Nova 在未知領域反覆失敗卻不學習；能力邊界永遠靠人類告知，無法自主進化。

## 範圍

### In-scope

- 能力邊界模型（capability-boundary.json）：統一表達「系統會什麼 / 不會什麼」
- 能力探測器（capability-probe.js）：SessionEnd 分析任務需求 vs 實際工具使用，偵測能力缺口
- 缺口累積與門檻觸發：多次偵測到同一缺口 → 信心達標 → 觸發 skill-forge
- context-injector 整合：SessionStart 注入能力邊界摘要
- 與 tool-matcher.js `missing` 欄位整合

### Out-of-scope

- 即時攔截（不在任務執行中阻斷，只在 SessionEnd 事後分析）
- 自動執行 skill-forge（只產出建議 + 記錄，由 lifecycle-orchestrator 消費）
- 修改 tool-matcher.js 核心邏輯（只消費其 missing 輸出）
- Dashboard UI 新增面板

## 使用者故事

身為 Nova（Main Agent），我想要在 session 結束時自動偵測「本次任務需要但系統缺少的能力」，以便累積足夠證據後自動建構新 Skill 補缺。

身為開發者，我想要查詢 Nova 的能力邊界模型，以便知道系統擅長什麼、薄弱什麼，有根據地規劃下一步。

## 行為規格

### 正常路徑

1. SessionEnd 觸發 → capability-probe.js 讀取本次 flow-events.jsonl
2. 從事件中提取「任務意圖」（prompt 關鍵詞 + 工具使用序列）
3. 呼叫 tool-matcher.matchTools(intent) 取得 `{ recommended, missing }`
4. 比對 recommended vs 實際使用的工具 → 計算覆蓋率
5. 偵測失敗信號（errors > 0, blocks > 0, fixKeywords > 0）→ 標記為低信心能力
6. 更新 capability-boundary.json：增加 coverageHits / missingHits 計數
7. 能力缺口累積 missingHits >= 3 → 寫入 improvements.jsonl 觸發 lifecycle-orchestrator 消費

### 錯誤路徑

| 錯誤情境 | 預期行為 |
|---------|---------|
| tool-matcher 不可用（本地模型離線） | fallback 到 matchToolsByKeyword，降級但不中斷 |
| flow-events.jsonl 為空或不存在 | 跳過本次探測，log 後 exit 0 |
| capability-boundary.json 損壞 | 從空模型重新開始，不 crash |
| learner.js 已在跑 | 互不影響，各自讀寫不同檔案 |

### 邊界條件

- 無 prompt 事件的 session（純自主 session）→ 從工具序列推斷意圖，降低信心
- 新建系統（無歷史資料）→ capability-boundary.json 初始化為空，第一次 session 開始累積
- 同一 session 多個 prompt → 合併所有意圖分析

## 資料模型

### 輸入

| 欄位 | 型別 | 來源 | 說明 |
|------|------|------|------|
| flow-events | JSONL | /tmp/nova-flow-events.jsonl | session 事件流 |
| tool-registry | JSON | ~/.claude/data/tool-registry.json | 工具索引 |

### 輸出：capability-boundary.json

```json
{
  "version": 1,
  "lastUpdated": "2026-03-17T10:00:00Z",
  "capabilities": {
    "git": { "coverageHits": 15, "missingHits": 0, "lastSeen": "2026-03-17", "strength": "strong" },
    "database": { "coverageHits": 2, "missingHits": 4, "lastSeen": "2026-03-16", "strength": "weak" },
    "browser-automation": { "coverageHits": 0, "missingHits": 3, "lastSeen": "2026-03-15", "strength": "missing" }
  },
  "sessions": {
    "total": 50,
    "withGaps": 8,
    "lastAnalyzed": "2026-03-17T10:00:00Z"
  }
}
```

### strength 分類規則（確定性，不用 AI）

| 條件 | strength |
|------|----------|
| coverageHits > 0 且 missingHits == 0 | "strong" |
| coverageHits > missingHits | "adequate" |
| coverageHits <= missingHits 且 coverageHits > 0 | "weak" |
| coverageHits == 0 | "missing" |

### 儲存

- 格式：JSON
- 位置：`~/.claude/data/capability-boundary.json`
- 清理策略：不清理（持久累積），但 coverageHits/missingHits 衰減（每 30 天乘 0.8）

## 介面契約

### capability-probe.js CLI

```bash
bun ~/.claude/scripts/capability-probe.js              # 探測本次 session（SessionEnd 呼叫）
bun ~/.claude/scripts/capability-probe.js --summary     # 人可讀能力邊界摘要
bun ~/.claude/scripts/capability-probe.js --weak        # 只列出 weak + missing 能力
bun ~/.claude/scripts/capability-probe.js --json        # JSON 格式輸出
```

### Export API

```javascript
export async function probeSession(eventsFile?, deps?)  // 探測單次 session
export function getBoundary(deps?)                       // 讀取能力邊界
export function getWeakCapabilities(deps?)               // 取得 weak + missing 清單
export function classifyStrength(cap)                    // 分類強度
```

## 非功能需求

| 維度 | 要求 |
|------|------|
| 效能 | probeSession 執行 < 5 秒（含 tool-matcher 語意匹配） |
| 安全 | 不涉及敏感操作 |
| 相容性 | 不修改現有模組的 export 簽名 |
| 資料大小 | capability-boundary.json < 50KB（能力詞彙表 < 100 條） |

## 依賴

| 方向 | 模組 | 說明 |
|------|------|------|
| 上游 | tool-matcher.js | 消費 matchTools() 的 { recommended, missing } |
| 上游 | tool-registry.js | 消費 CAPABILITY_VOCAB 和 queryTools() |
| 上游 | learner.js | 參考 extractSessionBehavior() 的事件提取模式 |
| 下游 | context-injector.js | 新增 injectCapabilityBoundary() 來源 |
| 下游 | lifecycle-orchestrator.js | 消費 improvements.jsonl 中的能力缺口建議 |
| 下游 | maintainer.js | SessionEnd 觸發 capability-probe（同 learner 並行） |

## 驗收標準

- [ ] `bun test` 新增 capability-probe.test.js 全部通過
- [ ] probeSession 能正確偵測有缺口的 session 並更新 boundary
- [ ] 能力累積 missingHits >= 3 時自動寫入 improvements.jsonl
- [ ] context-injector 在 SessionStart 注入能力邊界摘要
- [ ] --summary CLI 輸出人可讀的能力邊界報告
- [ ] strength 分類邏輯 100% 確定性（無 AI）
- [ ] 現有測試 `bun test` 不受影響（658 pass / 0 fail）

## 風險

| 風險 | 機率 | 影響 | 緩解策略 |
|------|:----:|:----:|---------|
| tool-matcher 語意匹配不穩定，缺口偵測有雜訊 | 中 | 低 | 累積門檻 >= 3 過濾雜訊；fallback 到關鍵詞匹配 |
| capability-boundary.json 無限增長 | 低 | 低 | 能力詞彙表上限 100 條；30 天衰減機制 |
| 與 learner.js 並行寫入競爭 | 低 | 低 | 各自寫不同檔案，無競爭 |
| 探測增加 SessionEnd 延遲 | 中 | 低 | 5 秒 timeout + 背景執行不阻塞 |
