# Nova Server 可觀測層

## 動機（Why）

- **問題**：event$ 下游只有 writeFlowEvent + pool.broadcast 兩個 subscriber，所有事件「記了就沒了」。dispatch 頻率異常、handler error 累積、記憶體趨勢上升 — 沒人知道
- **目標**：event$ 成為系統化的觀測 bus，新增 subscriber 可插拔式接入，提供異常偵測、metrics 收集、pattern 分析
- **不做的代價**：nova-server 常駐運行但零監控 — 出問題只能靠 crash log 事後排查，無法主動告警。session 卡死問題（如 port 佔用）重複發生

## 範圍

### In-scope

- event$ 下游新增可觀測 subscriber（anomaly detector、metrics collector）
- `/health` 端點擴充：趨勢指標（dispatch rate、error rate、最近異常）
- 模組 error 累計統計（取代 console.error 即丟棄）
- 跨事件 pattern 偵測（連續 block、重複 fallback、dispatch 頻率突增）

### Out-of-scope

- dispatch 核心路由改為 xstream（同步 for loop 不動）
- 外部監控服務整合（Grafana、Prometheus）
- 歷史趨勢持久化（記憶體中即可，重啟歸零）
- UI dashboard（`/health` JSON 已足夠）

## 使用者故事

身為開發者，我想在 `/health` 看到 nova-server 的即時健康指標（dispatch 頻率、error rate、最近異常），以便在 session 卡住前主動發現問題。

身為 Main Agent，我想讓 nova-server 在偵測到異常時自動推送告警事件到 SSE，以便 Flow Visualizer 即時顯示。

## 行為規格

### 正常路徑

1. dispatch() 執行完畢 → 結果推入 event$（現有）
2. anomalyDetector subscriber 接收事件 → 更新滑動窗口統計
3. metricsCollector subscriber 接收事件 → 更新計數器
4. `/health` 被查詢 → 回傳含 metrics + anomalies 的擴充 JSON

### 錯誤路徑

| 錯誤情境 | 預期行為 |
|---------|---------|
| subscriber 本身 throw | try-catch 隔離，不影響其他 subscriber 和 dispatch |
| 記憶體中 metrics 資料量增長 | 滑動窗口自動淘汰舊資料（保留最近 5 分鐘） |
| 所有 subscriber crash | event$ 只剩 writeFlowEvent + broadcast，降級為現狀 |

### 邊界條件

- 零 dispatch 事件（剛啟動）→ metrics 全部為 0，無異常
- 極高頻率（100 dispatch/秒）→ 滑動窗口正常運作，不阻塞 event$ pipeline
- nova-server 長時間運行（24h+）→ 只保留窗口內資料，記憶體穩定

## 資料模型

### Metrics 結構（記憶體中）

| 欄位 | 型別 | 說明 |
|------|------|------|
| dispatchCount | number | 啟動以來的總 dispatch 次數 |
| dispatchRate | number | 最近 60 秒的 dispatch 次數 |
| errorCount | number | handler error 累計 |
| errorRate | number | 最近 60 秒的 error 次數 |
| blockCount | number | block decision 累計 |
| lastAnomaly | object \| null | 最近一次異常（type + timestamp + detail） |
| anomalies | array | 最近 10 筆異常記錄 |

### 異常事件類型

| type | 觸發條件 | severity |
|------|---------|----------|
| `high_dispatch_rate` | 60 秒內 > 200 次 dispatch | warning |
| `consecutive_blocks` | 連續 3 次以上 block | warning |
| `handler_error_spike` | 60 秒內 > 5 次 handler error | error |
| `memory_pressure` | RSS > 200MB | error |

### 儲存

- 格式：純記憶體（無持久化）
- 位置：nova-server process 記憶體
- 清理策略：滑動窗口 5 分鐘，重啟歸零

## 介面契約

### `/health` 擴充回傳

```json
{
  "status": "ok",
  "pid": 12345,
  "title": "nova-server",
  "uptime": 3600,
  "modules": 10,
  "connections": 2,
  "memory": { "rss": 40, "heap": 2 },
  "metrics": {
    "dispatchCount": 1234,
    "dispatchRate": 15,
    "errorCount": 3,
    "errorRate": 0,
    "blockCount": 42
  },
  "anomalies": [
    { "type": "high_dispatch_rate", "ts": 1710500000, "detail": "247 dispatches in 60s" }
  ]
}
```

### 異常事件（推入 event$ → SSE 廣播）

```json
{
  "type": "anomaly_detected",
  "anomaly_type": "handler_error_spike",
  "severity": "error",
  "detail": "8 handler errors in 60s",
  "ts": 1710500000
}
```

## 非功能需求

| 維度 | 要求 |
|------|------|
| 效能 | subscriber 處理 < 0.1ms/event（不阻塞 event$ pipeline） |
| 記憶體 | metrics 資料 < 1MB（滑動窗口 5 分鐘） |
| 可靠性 | subscriber crash 不影響 dispatch 和其他 subscriber |

## 依賴

| 方向 | 模組 | 說明 |
|------|------|------|
| 上游 | event$（xstream） | subscriber 接收所有流過的事件 |
| 上游 | dispatch() | metrics 計數來源 |
| 下游 | `/health` 端點 | 消費 metrics 資料 |
| 下游 | SSE broadcast | 異常事件推送 |

## 驗收標準

- [x] `/health` 回傳含 `metrics` 和 `anomalies` 欄位
- [x] 模擬高頻 dispatch → `anomalies` 出現 `high_dispatch_rate`
- [x] 模擬 handler error → `metrics.errorCount` 累計正確
- [x] subscriber throw 不影響 dispatch decision 回傳
- [x] nova-server 運行 5 分鐘後記憶體穩定（無 leak）
- [x] `bun test` 全部通過

## 風險

| 風險 | 機率 | 影響 | 緩解策略 |
|------|:----:|:----:|---------|
| subscriber 阻塞 event$ pipeline | 低 | 高 | 每個 subscriber 獨立 try-catch + 效能 budget 0.1ms |
| 滑動窗口記憶體洩漏 | 低 | 中 | 窗口大小上限 + `/health` 監控記憶體 |
| 異常偵測誤報（閾值不準） | 中 | 低 | 閾值可調（先用保守值，觀察後調整） |
