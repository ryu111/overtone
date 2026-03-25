# api-router.js 子路由拆分計劃

日期：2026-03-25
安全 tag：v0.9-stable
目前行數：2051 行 / 55 個 endpoint

## Endpoint 清單與歸屬

### api/sessions.js（~350 行）
| Endpoint | 行號 | 行數 | 說明 |
|----------|------|------|------|
| GET /api/sessions | 273 | 14 | session 列表 |
| GET /api/sessions/transcript | 448 | 126 | transcript 讀取 |
| GET /api/sessions/preview | 574 | 77 | session 預覽 |
| GET /api/sessions/active | 1319 | 6 | 活躍 sessions |
| GET /api/sessions-summary | 379 | 4 | session 摘要 |
| GET /api/sessions/messages | 1998 | 53 | 歷史訊息 |

### api/timeline.js（~260 行）
| Endpoint | 行號 | 行數 | 說明 |
|----------|------|------|------|
| GET /api/timeline | 1605 | 258 | timeline 事件聚合 |

### api/manager.js（~200 行）
| Endpoint | 行號 | 行數 | 說明 |
|----------|------|------|------|
| GET /api/health-scores | 1912 | 13 | 健康分數 |
| GET /api/priority | 1925 | 13 | 優先級 |
| PATCH /api/priority | 1938 | 35 | 優先級調整 |
| GET /api/daily-report | 1973 | 25 | 日報 |
| GET /api/decisions/pending | 1252 | 4 | 決策佇列 |
| POST /api/decisions/resolve | 1256 | 10 | 決策回應 |
| GET /api/branches | 1266 | 12 | 分支狀態 |
| POST /api/ask | 1278 | 20 | 互動問答 |
| GET /api/ask | 1298 | 4 | 問答狀態 |
| POST /api/ask/answer | 1302 | 17 | 問答回覆 |
| GET /api/scores | 367 | 2 | 評分 |
| GET /api/behaviors | 369 | 2 | 行為 |
| GET /api/improvements | 371 | 2 | 改善建議 |
| GET /api/decisions | 373 | 4 | 決策清單 |

### api/cross-dispatch.js（~280 行）
| Endpoint | 行號 | 行數 | 說明 |
|----------|------|------|------|
| POST /api/cross-dispatch | 1325 | 137 | 派發任務 |
| GET /api/cross-dispatch | 1462 | 32 | 讀取佇列 |
| POST /api/cross-dispatch/complete | 1494 | 111 | 完成回報 |
| deliverPendingDispatches() | 102 | 80 | 待處理派發 |
| autoCompleteDispatches() | 184 | 40 | 自動完成 |

### api/system.js（~400 行）
| Endpoint | 行號 | 行數 | 說明 |
|----------|------|------|------|
| GET /api/hook-errors | 226 | 25 | hook 錯誤 |
| GET /api/daily-logs | 251 | 11 | 每日日誌 |
| GET /api/graph | 262 | 6 | 流程圖 |
| GET /api/config | 268 | 5 | 設定 |
| POST /api/heartbeat/toggle | 287 | 23 | heartbeat 開關 |
| POST /api/terminal/interrupt | 310 | 57 | terminal 中斷 |
| GET /api/components | 383 | 20 | 元件清單 |
| GET /api/git | 403 | 9 | git 狀態 |
| GET /api/locks | 412 | 23 | lockfile |
| GET /api/daemons | 435 | 13 | daemon 狀態 |
| GET /api/usage | 651 | 45 | 使用量 |
| GET /api/llm | 696 | 19 | LLM 健康 |
| GET /api/system | 715 | 62 | 系統資源 |
| GET /api/tasks-todo | 777 | 18 | 待做任務 |
| POST /api/actions/clear-locks | 795 | 23 | 清除 locks |
| POST /api/actions/trigger-maintainer | 818 | 23 | 觸發 maintainer |
| GET/POST/PATCH/DELETE /api/projects | 841 | 40 | 專案管理 |
| GET /api/tasks | 881 | 47 | 任務列表 |
| POST /api/tasks/delete | 928 | 17 | 刪除任務 |
| GET /api/tasks/spec | 945 | 26 | spec 任務 |
| POST /api/spawn | 971 | 31 | spawn session |
| POST /api/terminal/send | 1002 | 75 | terminal 注入 |
| POST /api/llm/toggle | 1077 | 25 | LLM 開關 |
| POST /api/actions/cleanup | 1120 | 132 | 系統清理 |

### api/push.js（~80 行）
| Endpoint | 行號 | 行數 | 說明 |
|----------|------|------|------|
| GET/PATCH /api/notifications/settings | 1102 | 18 | 通知設定 |
| POST /api/devices/register | 1863 | 15 | 裝置註冊 |
| POST /api/push/send | 1878 | 34 | 推播發送 |

## 共用 Helpers（須保留在主檔或共用模組）

| Helper | 行號 | 用途 | 消費者 |
|--------|------|------|--------|
| cached(key, fn) | 30 | 5 秒 TTL 快取 | manager, system |
| readJsonl(fp) | 40 | JSONL 讀取 | system, timeline |
| H (headers) | 61 | CORS headers | 所有 |
| json(data, status) | 66 | JSON response | 所有 |
| gitLog(repoDir) | 69 | git log | system |
| readProjects() | 82 | projects.json | system, tasks |
| deliverPendingDispatches | 102 | cross-dispatch 派發 | server.js 呼叫 |
| autoCompleteDispatches | 184 | cross-dispatch 自動完成 | server.js 呼叫 |
| pendingAnswer | 96 | ask API 狀態 | manager |

## 設計決策（Manager 審視回饋）

### Q1: system.js 太肥 — 進一步拆分

同意。system.js 拆成 3 個：

| 子路由 | 行數 | 包含 |
|--------|------|------|
| api/system.js | ~170 | health, usage, config, graph, llm, daemons, locks, components, git |
| api/tasks.js | ~160 | tasks(47), tasks/delete(17), tasks/spec(26), tasks-todo(18), projects CRUD(40) |
| api/actions.js | ~210 | terminal/send(75), terminal/interrupt(57), actions/cleanup(132), actions/clear-locks(23), actions/trigger-maintainer(23), spawn(31) |

修正後的子路由清單（8 個）：
sessions(280), timeline(260), manager(200), cross-dispatch(280), system(170), tasks(160), actions(210), push(80)

### Q2: deliverPendingDispatches / autoCompleteDispatches 的 import 策略

**方案：留在 api/cross-dispatch.js 並 re-export。**

```js
// api/cross-dispatch.js
export { deliverPendingDispatches, autoCompleteDispatches };
export default function handleCrossDispatch(pathname, req, ctx) { ... }
```

```js
// api-router.js（主路由，精簡為 dispatcher）
import handleCrossDispatch, { deliverPendingDispatches, autoCompleteDispatches } from './api/cross-dispatch.js';
export { deliverPendingDispatches, autoCompleteDispatches }; // re-export 給 server.js
```

server.js 的 import 不變（仍從 api-router.js 取），但實際實作在 cross-dispatch.js。

不用 helpers 是因為這兩個函式依賴 JSONL 讀寫 + osascript 注入，和 cross-dispatch 業務邏輯強耦合。

### Q3: ctx 傳遞設計

**方案：createRouter(ctx) 工廠函數。**

每個子路由 export 一個工廠函數，接收 ctx 後回傳 handler：

```js
// api/timeline.js
export default function createTimelineRouter(ctx) {
  return async function handleTimeline(pathname, req) {
    // ctx.broadcast, ctx.getActiveSessions 可用
    if (pathname === "/api/timeline") { ... }
    return null; // 不匹配
  };
}
```

```js
// api-router.js（主路由 dispatcher）
import createTimelineRouter from './api/timeline.js';
import createPushRouter from './api/push.js';
// ...

export async function handleDashboardApi(pathname, req, ctx) {
  const routers = [
    createTimelineRouter(ctx),
    createPushRouter(ctx),
    // ...
  ];
  for (const router of routers) {
    const resp = await router(pathname, req);
    if (resp) return resp;
  }
  return null;
}
```

為什麼不用全域變數：模組間隱式依賴，測試不好 mock。
為什麼不用 middleware：過度設計，我們不是 Express。
工廠函數最簡單：一個函式接收依賴，回傳 handler。

注意：routers 陣列只建立一次（模組載入時），不是每次 request 都建。改為在 module scope 暫存：

```js
let _routers = null;
export async function handleDashboardApi(pathname, req, ctx) {
  if (!_routers) _routers = [createTimelineRouter(ctx), ...];
  for (const router of _routers) {
    const resp = await router(pathname, req);
    if (resp) return resp;
  }
  return null;
}
```

## 風險點

1. **server.js import 不變**：api-router.js 仍作為主入口，re-export deliverPendingDispatches 和 autoCompleteDispatches
2. **ctx 注入一次性**：工廠函數在首次呼叫時建立 routers，ctx 引用保持不變
3. **共用 helpers 提取**：H、json、cached、readJsonl 獨立成 api/helpers.js，所有子路由 import
4. **順序無關**：拆分後每個子路由獨立匹配 pathname，不依賴 if chain 順序

## 遷移順序（修正版，8 個 Phase）

1. **Phase 1**：提取 api/helpers.js（H, json, cached, readJsonl, readProjects, gitLog）
2. **Phase 2**：拆 api/timeline.js（最獨立，260 行，只讀）— 驗證工廠函數模式可行
3. **Phase 3**：拆 api/push.js（80 行，最小）
4. **Phase 4**：拆 api/manager.js（200 行）
5. **Phase 5**：拆 api/sessions.js（280 行）
6. **Phase 6**：拆 api/tasks.js（160 行）
7. **Phase 7**：拆 api/cross-dispatch.js（280 行，含 re-export）
8. **Phase 8**：拆 api/actions.js（210 行）— 剩餘即為 api/system.js

每個 Phase 完成後：bun test + curl 驗證 + server health check。
