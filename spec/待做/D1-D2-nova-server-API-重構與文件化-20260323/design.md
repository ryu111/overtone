# nova-server API 重構與文件化 — 技術設計

## 深度路由：D2
**理由**：跨 2 個檔案（server.js + api-router.js）重組路由 + 產出 API 文件 + 補齊 2 個新端點，設計決策密度中等（3 個決策：路由分割策略、狀態傳遞方式、合併策略）。不涉及安全敏感操作，可逆。

---

## 技術摘要

- **方案**：server.js 保留 Internal + Infrastructure，所有 `/api/*` 整體委派 api-router.js
- **理由**：最小改動、零 breaking change、api-router.js 已是同進程 import
- **取捨**：api-router.js 行數會從 522 增到約 600（仍可控），不拆更多檔案避免 import 鏈過長

## 方案比較

| 維度 | 方案 A：整體委派（選擇） | 方案 B：拆 3 個 router 檔 |
|------|:-------------------:|:-------------------:|
| 複雜度 | 低 — 搬 6 個 handler，加 ctx 參數 | 中 — 建 3 個新檔 + 路由分發層 |
| 破壞性 | 零 — Dashboard/Control App 不感知 | 低 — 但 import 鏈改動多 |
| server.js 瘦身 | ~180 行（目標達成） | ~150 行（略瘦但多 import） |
| 維護成本 | 單一 api-router 約 600 行 | 3 個 200 行 router + 1 個分發器 |
| **結論** | 選擇 — 最小改動達成目標 | 過度設計 — api-router 600 行仍可控 |

## 模組介面

### 修改檔案

| # | 檔案 | 變更內容 |
|---|------|---------|
| 1 | `~/.claude/hooks/server.js` | 移除 6 個 /api/* handler；handleDashboardApi 傳入 context 物件；行數降至 ~180 |
| 2 | `~/.claude/scripts/flow/api-router.js` | 接收 context 物件（config, buildGraph, buildSessionIndex, getSessionEvents, readRecentHookErrors）；新增遷入的 6 個 handler；新增 /api/heartbeat/toggle + /api/terminal/interrupt |

### 新增檔案

| # | 檔案 | 位置 | 行數 | 用途 |
|---|------|------|------|------|
| 1 | `api-reference.md` | `~/.claude/docs/` | ~500 | API 參考文件 |

### 路由變更明細

**從 server.js 遷移到 api-router.js：**

| 端點 | 需要的 context |
|------|---------------|
| GET /api/hook-errors | 無（讀檔案） |
| GET /api/daily-logs | 無（動態 import） |
| GET /api/graph | buildGraph() |
| GET /api/config | config |
| GET /api/sessions | buildSessionIndex() |
| GET /api/sessions/:id/events | getSessionEvents() |

**新增端點：**

| 端點 | 說明 |
|------|------|
| POST /api/heartbeat/toggle | iOS 用，委派 /processes/heartbeat/start 或 /stop |
| POST /api/terminal/interrupt | iOS 用，對 iTerm2 session 送 Ctrl+C |

**合併：**

| 舊端點 | 新端點 | 策略 |
|--------|--------|------|
| GET /api/sessions-summary | GET /api/sessions-summary（保留） | 不合併 — 資料來源完全不同（sessions = timeline events, sessions-summary = JSONL 摘要），名稱看似重複但實為不同資料 |

### Context 物件設計

```javascript
// server.js 傳給 api-router.js 的 context
const apiContext = {
  config,                    // getConfig() 結果
  buildGraph,                // flow/graph-builder.js
  buildSessionIndex,         // flow/session-index.js
  getSessionEvents,          // flow/session-index.js
  bus,                       // event-bus（heartbeat toggle 需要）
  setHeartbeatEnabled,       // notion config 設定
  MODULES_DIR,               // heartbeat 動態 import 路徑
};
```

api-router.js 的 handleDashboardApi 簽名變更：

```javascript
// 之前
export async function handleDashboardApi(pathname, req)

// 之後
export async function handleDashboardApi(pathname, req, ctx)
```

## 端點最終分布

### server.js（~180 行）

| 分類 | 端點 | 說明 |
|------|------|------|
| Internal | POST /dispatch | Hook 事件分發 |
| Internal | POST /agent/status | Agent 狀態回報 |
| Internal | POST /modules/reload | 模組熱重載 |
| Infra | GET /health | 健康檢查 |
| Infra | GET /events | SSE 事件流 |
| Infra | GET /processes | 進程狀態 |
| Infra | POST /processes/:name/start | 啟動進程 |
| Infra | POST /processes/:name/stop | 停止進程 |
| Static | GET / | Dashboard HTML |
| Static | GET /flow/:file | Dashboard 靜態檔案 |
| **路由** | GET\|POST\|PATCH\|DELETE /api/* | **全部轉發 api-router.js** |

### api-router.js（~600 行）

全部 `/api/*` 端點，共 27 個。

## 執行步驟

### Phase 1：API 文件（sequential）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 1 | `~/.claude/docs/api-reference.md` | 產出完整 API 參考文件（37 端點） |

### Phase 2：路由重構（sequential，依賴 Phase 1）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 1 | api-router.js | 修改 handleDashboardApi 接收 ctx 參數；遷入 6 個 handler |
| 2 | server.js | 建立 apiContext；移除遷出的 handler；轉發 /api/* |
| 3 | api-router.js | 新增 /api/heartbeat/toggle + /api/terminal/interrupt |

### Phase 3：驗證（sequential，依賴 Phase 2）

| 步驟 | 說明 |
|------|------|
| 1 | `bun test` 全數通過 |
| 2 | curl 驗證各端點回應正確 |
| 3 | PinchTab 驗證 Dashboard 各 tab |
| 4 | 複製 api-reference.md 到 nova-control/docs/ |

## Pre-mortem

| # | 失敗情境 | 機率 | 影響 | 預防措施 |
|---|---------|:----:|:----:|---------|
| 1 | api-router.js 存取不到 bus/config 等 server 內部狀態，新遷入的 handler 返回 undefined | 中 | 高 | ctx 物件明確列出所有依賴，遷移每個 handler 前確認所需 ctx 屬性 |
| 2 | /api/sessions-summary 合併後 Dashboard 某 tab 壞掉 | — | — | 不合併（分析後確認資料來源不同） |
| 3 | heartbeat toggle 透過 api-router 呼叫 bus.registerModule 失敗（模組載入路徑問題） | 中 | 中 | 測試時 curl 驗證完整 start/stop 流程 |
| 4 | 遷移遺漏某個 handler，該端點 404 | 低 | 高 | 遷移完後 grep 確認 server.js 無殘留 /api/ handler |

## 測試策略

| 測試方式 | 驗收條件 |
|---------|---------|
| `bun test` | 0 fail，確認無回歸 |
| curl /health | status: ok |
| curl /api/config | 回傳 config JSON |
| curl /api/sessions | 回傳 session 列表 |
| curl /api/heartbeat/toggle | 回傳 { ok: true } |
| PinchTab text localhost:3457 | Dashboard 5 個 tab 文字內容正確 |

## 不做什麼

1. **不做 OpenAPI/Swagger**：目前消費者只有 3 個（Dashboard、macOS、iOS），Markdown 參考文件 ROI 更高
2. **不做 API 版本化**：端點變動低頻，破壞性變更直接改 + 更新消費者
3. **不拆 api-router.js 為多檔案**：600 行仍可控，拆分帶來的 import 鏈複雜度不值得
4. **不統一 REST 風格**：如 DELETE /api/projects 改為 DELETE /api/projects/:name — 破壞現有 Swift 客戶端，收益不大
