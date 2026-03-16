# Event Bus Refactor — 任務分解

## Phase 依賴分析

```
Phase 1（串行）: event-bus.js 骨架 + 單元測試
Phase 2（並行）: heartbeat 模組 + self-drive 模組 + notification 擴充
Phase 3（串行）: server.js 整合（依賴 Phase 1 + 2 全部完成）
Phase 4（串行）: heartbeat.js 清理（依賴 Phase 3 驗證 server 正常）
Phase 5（串行）: 端對端驗收
```

## Phase 1 — event-bus.js 骨架（串行）

### T1.1 建立 `hooks/event-bus.js`

**執行者**：executor（sonnet）
**預估**：~110 行

- [ ] 實作 `createEventBus({ writeFlowEvent, broadcast, onMetrics })` 工廠函式
- [ ] 實作 `emit(type, data)` — 推送事件到 xstream
- [ ] 實作 `timer(type, ms)` — 基於 `xs.periodic` 的定時事件源
- [ ] 實作 `clearTimer(type)` — 取消定時器
- [ ] 實作 `createContext(moduleId)` — per-module ctx（emit, timer, clearTimer, getState, setState）
- [ ] 實作 `registerModule(mod)` — 註冊 lifecycle 模組，呼叫 init
- [ ] 實作 `destroyModule(name)` — 銷毀模組，呼叫 destroy，清除 timer
- [ ] 實作 `getModuleState(name)` — 讀取模組狀態
- [ ] 實作 `destroy()` — 清除所有 timer 和模組
- [ ] all$ subscribe：writeFlowEvent + broadcast + onMetrics
- [ ] all$ subscribe：fan-out to subscribed modules（async, catch error）

### T1.2 event-bus 單元測試

**執行者**：executor（sonnet）
**位置**：`tests/event-bus.test.js`

- [ ] emit → subscriber 收到事件
- [ ] timer → 定時觸發事件
- [ ] clearTimer → 停止觸發
- [ ] registerModule → init 被呼叫
- [ ] destroyModule → destroy 被呼叫 + timer 清除
- [ ] fan-out → 只有 subscribe 匹配的模組收到事件
- [ ] handler 拋錯不影響其他 subscriber
- [ ] getModuleState / setState 正確隔離

## Phase 2 — Lifecycle 模組（並行）

### T2.1 建立 `hooks/modules/heartbeat.js`（lifecycle）

**執行者**：executor（sonnet）
**預估**：~80 行
**依賴**：T1.1

- [ ] export default 符合 lifecycle 介面：name, subscribe, init, handler, destroy
- [ ] init：buildDeps() + setState 初始狀態 + ctx.timer('hb:tick', 60000)
- [ ] handler：防重疊（executing check）→ poll → emit 對應事件
- [ ] 正確 emit task:start / task:success / task:failed / hb:idle / hb:paused
- [ ] destroy：清理 deps 引用

### T2.2 建立 `hooks/modules/self-drive.js`

**執行者**：executor（sonnet）
**預估**：~50 行
**依賴**：T1.1

- [ ] export default 符合 lifecycle 介面
- [ ] subscribe: ['hb:idle']
- [ ] cooldown 30 分鐘檢查（基於 ctx.getState().lastRun）
- [ ] spawnSession + emit sd:start / sd:done
- [ ] 統計 runs / successes

### T2.3 擴充 `hooks/modules/notification.js`

**執行者**：executor（sonnet）
**預估**：修改，新增 ~35 行
**依賴**：T1.1

- [ ] 保留現有 `export const on = { Notification: ... }`（sync dispatch 路徑不動）
- [ ] 新增 `export const lifecycle = { name, subscribe, handler }`
- [ ] subscribe: ['task:start', 'task:success', 'task:failed', 'sd:start', 'sd:done']
- [ ] EVENT_MESSAGES 映射表 → notify()
- [ ] 提取 notify() 共用函式（取代 server.js 的內嵌 notify）

### T2.4 Lifecycle 模組單元測試

**執行者**：executor（sonnet）
**位置**：`tests/lifecycle-modules.test.js`

- [ ] heartbeat：mock deps → hb:tick 觸發 poll → 驗證 emit 事件
- [ ] heartbeat：executing=true 時 handler 不重疊
- [ ] self-drive：cooldown 未過 → 不觸發
- [ ] self-drive：cooldown 已過 → emit sd:start + sd:done
- [ ] notification lifecycle：各事件 → 驗證 notify 被呼叫（mock spawnSync）

## Phase 3 — server.js 整合（串行）

### T3.1 修改 `hooks/server.js`

**執行者**：executor（sonnet），Bash 修改（server.js 受 guard 保護）
**依賴**：Phase 1 + Phase 2 全部完成

- [ ] 刪除 heartbeat imports（行 29-30）
- [ ] 刪除常數 + hbState + notify + SELF_DRIVE_PROMPT（行 32-58）
- [ ] 刪除 startHeartbeatLoop + stopHeartbeatLoop（行 60-162）
- [ ] 刪除 cleanupStaleAgents（行 164-171）
- [ ] 刪除 setTimeout auto-start（行 478-485）
- [ ] import createEventBus from event-bus.js
- [ ] loadModules() 增加 lifecycle 模組辨識，回傳 lifecycle 模組清單
- [ ] 初始化 event-bus，注入 writeFlowEvent + pool.broadcast + metrics.onEvent
- [ ] 將現有 pushEvent 委派 bus.emit（合流 flow events 到 event-bus）
- [ ] 修改 /health 端點：heartbeat 欄位從 bus.getModuleState('heartbeat') 取得
- [ ] 修改 /processes 端點：同上
- [ ] /processes/heartbeat/start → bus.registerModule(heartbeat)
- [ ] /processes/heartbeat/stop → bus.destroyModule('heartbeat')
- [ ] lifecycle 模組自動初始化（替代 setTimeout auto-start）
- [ ] 保留 export { dispatch, loadModules, pushEvent, handlerMap }

### T3.2 整合測試

**執行者**：executor（sonnet）

- [ ] `bun test` — 798+ tests 全部通過
- [ ] server.js 行數 <= 280
- [ ] curl /health 回傳正確 heartbeat 狀態結構

## Phase 4 — heartbeat.js 清理（串行）

### T4.1 清理 `scripts/heartbeat.js`

**執行者**：executor（sonnet）
**依賴**：T3.2 通過

- [ ] 刪除 `runDaemonLoop()`（行 310-438）
- [ ] 刪除 `cmdStart/cmdStop/cmdStatus()`（行 530-655）
- [ ] 刪除 `import.meta.main` CLI 入口（行 659-684）
- [ ] 將 `makeListTasks()` 移入 `buildDeps()` 內部（或保留為內部 helper）
- [ ] 確認 export 清單：poll, executeTask, buildDeps, readState, writeState
- [ ] 行數 <= 350

### T4.2 回歸測試

**執行者**：executor（sonnet）

- [ ] `bun test` — 全部通過
- [ ] 確認 heartbeat lifecycle 模組仍正常 import poll/executeTask/buildDeps

## Phase 5 — 端對端驗收（串行）

### T5.1 完整驗收

**執行者**：reviewer（opus）
**依賴**：Phase 1-4 全部完成

- [ ] 行數檢查：server.js <= 280, event-bus.js <= 120, heartbeat.js(scripts) <= 350
- [ ] `bun test` — 全部通過
- [ ] 啟動 nova-server → curl /health → 驗證 heartbeat 欄位
- [ ] 觀察 SSE broadcast 是否包含 lifecycle 事件
- [ ] 程式碼審查：依賴方向正確（event-bus → modules 單向）
- [ ] 程式碼審查：sync dispatch 路徑未被修改
- [ ] 程式碼審查：無靜默失敗（catch 都有 console.error）
- [ ] 閉環檢查：無孤立 import、無死碼、export 完整
