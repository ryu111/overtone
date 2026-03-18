# Event Bus Refactor — 設計

## 檔案變動總覽

| 檔案 | 動作 | 行數估計 | 說明 |
|------|------|---------|------|
| `hooks/event-bus.js` | **新增** | ~110 | xstream 事件匯流排 |
| `hooks/modules/heartbeat.js` | **新增** | ~80 | lifecycle: heartbeat tick handler |
| `hooks/modules/self-drive.js` | **新增** | ~50 | lifecycle: idle → spawn self-drive |
| `hooks/modules/notification.js` | **修改** | ~60 | 擴充：加 lifecycle subscribe（保留原 `on`） |
| `hooks/server.js` | **修改** | ~250 | 刪除 heartbeat/self-drive 邏輯，整合 event-bus |
| `scripts/heartbeat.js` | **修改** | ~350 | 刪除 runDaemonLoop/CLI/makeListTasks，保留 poll/executeTask/buildDeps |

## 依賴方向

```
server.js
  ├── event-bus.js（建立 bus，管理 lifecycle 模組）
  │     ├── modules/heartbeat.js（subscribe hb:tick）
  │     ├── modules/self-drive.js（subscribe hb:idle）
  │     └── modules/notification.js（subscribe task:*, sd:*）
  ├── dispatch()（同步路徑，不經過 event-bus）
  │     ├── modules/guards.js（on = {}）
  │     ├── modules/flow-observer.js（on = {}）
  │     └── modules/context-injector.js（on = {}）
  └── scripts/flow/*（SSE, event-writer, graph, session-index）
```

**規則**：event-bus → modules（單向），modules 不 import event-bus，透過 ctx 間接操作。

## 核心設計：event-bus.js

### Stream 組合圖

```
timer('hb:tick', 60s) ──┐
                        ├── merge ──→ all$
emit('task:start') ─────┤              │
emit('hb:idle') ────────┤              ├─→ fan-out to subscribers
emit('sd:done') ────────┘              ├─→ writeFlowEvent()
                                       ├─→ pool.broadcast()
                                       └─→ metrics.onEvent()
```

### 實作骨架

```javascript
import xs from 'xstream';

export function createEventBus({ writeFlowEvent, broadcast, onMetrics }) {
  const _emitter = { listener: null };
  const emit$ = xs.create({
    start(l) { _emitter.listener = l; },
    stop() { _emitter.listener = null; },
  });

  const timers = new Map();       // type → { stream$, subscription }
  const modules = new Map();      // name → { mod, subscriptions }
  const moduleStates = new Map(); // name → state object

  function emit(type, data = {}) {
    _emitter.listener?.next({ type, ...data, ts: new Date().toISOString() });
  }

  function timer(type, ms) {
    if (timers.has(type)) return;
    const stream$ = xs.periodic(ms).map(() => ({ type, ts: new Date().toISOString() }));
    const sub = stream$.subscribe({ next: (e) => _emitter.listener?.next(e) });
    timers.set(type, { stream$, subscription: sub });
  }

  function clearTimer(type) {
    const t = timers.get(type);
    if (t) { t.subscription.unsubscribe(); timers.delete(type); }
  }

  function createContext(moduleId) {
    return {
      emit,
      timer,
      clearTimer,
      getState: () => moduleStates.get(moduleId) || {},
      setState: (partial) => {
        const prev = moduleStates.get(moduleId) || {};
        moduleStates.set(moduleId, { ...prev, ...partial });
      },
    };
  }

  // all$ — 合流所有事件
  const all$ = emit$;

  // side-effects: 持久化 + SSE + metrics
  all$.subscribe({
    next(event) {
      try { writeFlowEvent(event); } catch (e) { console.error('[event-bus] write error:', e.message); }
      try { broadcast(event); } catch (e) { console.error('[event-bus] broadcast error:', e.message); }
      try { onMetrics(event); } catch (e) { console.error('[event-bus] metrics error:', e.message); }
    },
  });

  // fan-out: 根據 event.type 分發到 subscribed modules
  all$.subscribe({
    next(event) {
      for (const [name, { mod, ctx }] of modules) {
        if (mod.subscribe?.includes(event.type)) {
          Promise.resolve(mod.handler(event, ctx)).catch(e => {
            console.error(`[event-bus] ${name} handler error:`, e.message);
          });
        }
      }
    },
  });

  async function registerModule(mod) {
    const ctx = createContext(mod.name);
    modules.set(mod.name, { mod, ctx });
    if (mod.init) await mod.init(ctx);
  }

  async function destroyModule(name) {
    const entry = modules.get(name);
    if (!entry) return;
    if (entry.mod.destroy) await entry.mod.destroy();
    modules.delete(name);
    // 清除該模組建立的 timers
    for (const [type, t] of timers) {
      // convention: timer type 以模組名前綴開頭
      if (type.startsWith(name.split('-')[0])) {
        t.subscription.unsubscribe();
        timers.delete(type);
      }
    }
  }

  function getModuleState(name) {
    return moduleStates.get(name) || {};
  }

  function destroy() {
    for (const [, t] of timers) t.subscription.unsubscribe();
    timers.clear();
    modules.clear();
  }

  return { emit, registerModule, destroyModule, getModuleState, destroy, all$ };
}
```

## Lifecycle 模組設計

### hooks/modules/heartbeat.js

```javascript
import { poll, executeTask, buildDeps } from '../../scripts/heartbeat.js';

let deps = null;

export default {
  name: 'heartbeat',
  subscribe: ['hb:tick'],

  init: async (ctx) => {
    deps = buildDeps();
    ctx.setState({
      running: true,
      consecutiveIdles: 0,
      executing: false,
      lastPoll: null,
      stats: { tasksExecuted: 0, tasksSucceeded: 0, tasksFailed: 0 },
    });
    ctx.timer('hb:tick', 60000);
  },

  handler: async (event, ctx) => {
    const state = ctx.getState();
    if (state.executing) return; // 防重疊

    try {
      ctx.setState({ executing: true });
      const result = await poll({}, deps);
      ctx.setState({ lastPoll: new Date().toISOString() });

      if (result.action === 'execute') {
        ctx.setState({ consecutiveIdles: 0 });
        ctx.emit('task:start', { task: result.task });
        const r = await executeTask(result.task, {}, deps);
        const s = ctx.getState().stats;
        s.tasksExecuted++;
        if (r.status === 'success') {
          s.tasksSucceeded++;
          ctx.emit('task:success', { task: result.task, result: r });
        } else {
          s.tasksFailed++;
          ctx.emit('task:failed', { task: result.task, error: r.error });
        }
        ctx.setState({ stats: s });
      } else if (result.action === 'idle') {
        const idles = (state.consecutiveIdles || 0) + 1;
        ctx.setState({ consecutiveIdles: idles });
        ctx.emit('hb:idle', { consecutiveIdles: idles, lastPoll: state.lastPoll });
      } else if (result.action === 'paused') {
        ctx.emit('hb:paused', { reason: 'auto-recovered' });
      }
    } finally {
      ctx.setState({ executing: false });
    }
  },

  destroy: async () => {
    deps = null;
  },
};
```

### hooks/modules/self-drive.js

```javascript
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSession } from '../../scripts/session-spawner.js';

const COOLDOWN = 30 * 60 * 1000;

let PROMPT = '';
try {
  PROMPT = readFileSync(join(homedir(), '.claude/data/self-drive-prompt.md'), 'utf-8');
} catch { /* no prompt */ }

export default {
  name: 'self-drive',
  subscribe: ['hb:idle'],

  handler: async (event, ctx) => {
    const state = ctx.getState();
    const now = Date.now();
    if (now - (state.lastRun || 0) < COOLDOWN) return;

    ctx.setState({ lastRun: now });
    ctx.emit('sd:start', { prompt_preview: PROMPT.slice(0, 100) });

    try {
      const spawned = spawnSession(PROMPT, {
        timeout: 300000,
        cwd: join(homedir(), 'projects/overtone'),
      });

      if (!spawned.ok) {
        ctx.emit('sd:done', { exitCode: -1, error: spawned.error });
        return;
      }

      const { exitCode } = await spawned.outcome;
      const stats = ctx.getState().stats || { runs: 0, successes: 0 };
      stats.runs++;
      if (exitCode === 0) stats.successes++;
      ctx.setState({ stats });
      ctx.emit('sd:done', { exitCode, duration: spawned.outcome.duration });
    } catch (e) {
      console.error('[self-drive] error:', e.message);
      ctx.emit('sd:done', { exitCode: -1, error: e.message });
    }
  },
};
```

### hooks/modules/notification.js 擴充

保留現有 `on.Notification` handler（sync dispatch 路徑），新增 lifecycle subscribe：

```javascript
// 新增部分 — 與現有 export const on = { ... } 並存
import { spawnSync } from 'node:child_process';

function notify(title, message) {
  try {
    const t = (title || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').slice(0, 100);
    const m = (message || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').slice(0, 500);
    spawnSync('osascript', ['-e', `display notification "${m}" with title "${t}" sound name "Glass"`]);
  } catch { /* 通知失敗不阻塞 */ }
}

const EVENT_MESSAGES = {
  'task:start': (d) => ['Nova 心跳', `開始執行任務：${d.task?.name || '?'}`],
  'task:success': (d) => ['Nova 心跳', `任務完成：${d.task?.name || '?'}`],
  'task:failed': (d) => ['Nova 心跳', `任務失敗：${d.task?.name || '?'} — ${d.error || '未知'}`],
  'sd:start': () => ['Nova 自我驅動', '正在分析 L1-L4 缺口...'],
  'sd:done': (d) => ['Nova 自我驅動', d.exitCode === 0 ? '分析完成' : `結束（exit=${d.exitCode}）`],
};

export const lifecycle = {
  name: 'notification-lifecycle',
  subscribe: ['task:start', 'task:success', 'task:failed', 'sd:start', 'sd:done'],
  handler: (event) => {
    const fn = EVENT_MESSAGES[event.type];
    if (fn) {
      const [title, message] = fn(event);
      notify(title, message);
    }
  },
};
```

## server.js 瘦身策略

### 刪除（~160 行）

- 行 28-31：heartbeat/session-spawner import
- 行 32-58：常數 + hbState + notify() + SELF_DRIVE_PROMPT
- 行 60-162：startHeartbeatLoop() + stopHeartbeatLoop()
- 行 164-171：cleanupStaleAgents()（移到 event-bus module state 管理）
- 行 478-485：setTimeout auto-start heartbeat

### 新增（~30 行）

- import event-bus.js
- 在 loadModules() 後初始化 event-bus + 載入 lifecycle 模組
- 修改 /health、/processes 端點從 event-bus getModuleState() 取資料
- /processes/heartbeat/start|stop 委派 event-bus initModule/destroyModule

### 保留（不動）

- HTTP server（Bun.serve）
- dispatch()（sync fan-out）
- loadModules()（hook handler `on = {}` 載入）
- xstream event$ pipeline（改為由 event-bus 管理，pushEvent 委派 bus.emit）
- SSE /events 端點
- 所有 /api/* 端點

## scripts/heartbeat.js 瘦身

### 刪除

- `runDaemonLoop()`（行 310-438）— 被 lifecycle heartbeat.js 取代
- `cmdStart/cmdStop/cmdStatus()`（行 530-655）— CLI 已無用（heartbeat 內建 server）
- `makeListTasks()`（行 474-526）— 移入 `buildDeps()` 內部
- `import.meta.main` CLI 入口（行 659-684）

### 保留

- `readState()` / `writeState()` — 持久化需要
- `poll()` — 純業務邏輯
- `executeTask()` — 純業務邏輯
- `buildDeps()` — DI 工廠（吸收 makeListTasks）

## 模組載入：雙介面共存

server.js `loadModules()` 增加辨識邏輯：

```javascript
async function loadModules() {
  handlerMap = new Map();
  const lifecycleModules = [];

  for (const file of files) {
    const mod = await import(`${filePath}?t=${Date.now()}`);

    // 1. 傳統 hook handler（on = {}）
    const handlers = mod.default?.on || mod.on || {};
    for (const [key, fn] of Object.entries(handlers)) { ... }

    // 2. Lifecycle 模組（subscribe + handler）
    const lc = mod.default?.subscribe ? mod.default : mod.lifecycle;
    if (lc?.subscribe && lc?.handler) {
      lifecycleModules.push(lc);
    }
  }

  return lifecycleModules;
}
```

## 風險與緩解

| 風險 | 緩解 |
|------|------|
| lifecycle handler 拋錯導致 event-bus 卡住 | Promise.resolve().catch() 隔離，不影響其他 subscriber |
| timer 累積（registerModule 重複呼叫） | timer() 內部檢查 `timers.has(type)`，重複忽略 |
| destroy 後 timer 持續觸發 | destroyModule 清除所有以模組名前綴開頭的 timer |
| 現有測試依賴 server.js export | 保留 `export { dispatch, loadModules, pushEvent, handlerMap }` |
| heartbeat.js CLI 使用者 | CLI 已無人使用（heartbeat 由 server 內建管理） |
