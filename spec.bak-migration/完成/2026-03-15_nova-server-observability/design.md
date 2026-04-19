# Nova Server 可觀測層 — 技術設計

## 深度路由：D2
**理由**：跨 2 個檔案（server.js + 新模組），不涉安全敏感邏輯，不需 reviewer。

---

## 技術摘要

- **方案**：event$ 新增 subscriber（純記憶體 metrics + 異常偵測），`/health` 端點擴充
- **理由**：不動 dispatch 核心，零風險增加觀測能力。xstream 基礎設施已在，只需接管
- **取捨**：純記憶體不持久化，重啟歸零 — 但 nova-server 是常駐 daemon，正常不重啟

## 方案比較

| 維度 | A：event$ subscriber（選擇） | B：dispatch() 內嵌 metrics |
|------|:---------------------------:|:--------------------------:|
| 侵入性 | 零（不動 dispatch） | 高（每個計數點都改） |
| 可擴展性 | 高（加 subscriber 即可） | 低（每次加 metric 都改 dispatch） |
| 效能 | subscriber 非同步，不影響 critical path | 同步累加，微增延遲 |
| 測試 | subscriber 獨立測試 | 與 dispatch 耦合 |
| **結論** | ✅ 零侵入 + 可插拔 | ❌ 侵入性高且不可擴展 |

## 模組介面

### 新增檔案

| # | 檔案 | 位置 | 行數 | 用途 |
|---|------|------|------|------|
| 1 | metrics.js | `~/.claude/hooks/modules/` | ~80 | metrics 收集 + 異常偵測 subscriber |

### 修改檔案

| # | 檔案 | 變更內容 |
|---|------|---------|
| 1 | server.js | event$ 新增 metrics subscriber + `/health` 回傳擴充 |

### API 設計

```javascript
// metrics.js export
export function createMetrics() {
  return {
    // 被 event$.subscribe 呼叫
    onEvent(event) { ... },
    // 被 /health 端點呼叫
    snapshot() { return { metrics, anomalies } },
  };
}
```

## 資料模型

- 儲存格式：純記憶體（Map + 環形 buffer）
- 清理策略：滑動窗口 5 分鐘（timestamp 陣列，超時自動 shift）
- 異常記錄：最多保留 10 筆（環形 buffer）

## 執行步驟

### Phase 1：metrics 模組（independent）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 1a | modules/metrics.js | createMetrics() — 計數器 + 滑動窗口 + 異常偵測 |
| 1b | tests/unit/metrics.test.js | 計數正確性、窗口淘汰、異常觸發 |

### Phase 2：server 整合（依賴 Phase 1）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 2a | hooks/server.js | event$.subscribe 接入 metrics.onEvent + `/health` 擴充 |
| 2b | 整合測試 | `/health` 回傳含 metrics + anomalies |

## Pre-mortem

**假設可觀測層上線後失敗了，最可能的原因是什麼？**

| # | 失敗情境 | 機率 | 影響 | 預防措施 |
|---|---------|:----:|:----:|---------|
| 1 | metrics subscriber 拋錯導致 event$ 整條流中斷 | 低 | 高 | try-catch 隔離 + xstream subscribe error handler |
| 2 | 滑動窗口的 timestamp 陣列無限增長 | 低 | 中 | shift() 淘汰 + 長度上限 1000 |
| 3 | 異常偵測閾值誤報頻繁 | 中 | 低 | 保守閾值（先高後調）+ severity 區分 |
| 4 | `/health` 回傳變大導致 hook-client 解析慢 | 低 | 低 | metrics 資料 < 1KB |

## 測試策略

| 測試檔案 | 驗收條件 |
|---------|---------|
| metrics.test.js | 計數正確、窗口淘汰、異常觸發/不觸發、snapshot 格式 |
| server integration | `/health` 含 metrics + anomalies、subscriber crash 不影響 dispatch |

## 不做什麼

1. **不改 dispatch 核心**：同步 for loop 是最快路徑，不包 xstream
2. **不持久化 metrics**：記憶體足夠，重啟歸零可接受
3. **不建 metrics UI**：`/health` JSON + Flow Visualizer SSE 已足夠
