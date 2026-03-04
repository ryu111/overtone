# 程式碼層級設計模式

> 聚焦日常寫碼使用的模式。架構層級模式（Event-Driven、Layered 等）見 architecture skill。

## 決策樹

```
我需要什麼？
  │
  ├── 可替換的演算法/行為 → Strategy
  ├── 監聽狀態變化通知多方 → Observer / EventEmitter
  ├── 根據類型建立不同物件 → Factory
  ├── 動態為物件增加功能 → Decorator / Middleware
  ├── 簡化複雜子系統入口 → Facade
  ├── 封裝操作（支援 undo）→ Command
  ├── 定義演算法骨架 → Template Method
  └── 只需要一個實例 → Singleton（慎用）
```

---

## Strategy

**何時用**：同一操作有多種實作，需要 runtime 切換。

```javascript
// 驗證策略
const validators = {
  email: (v) => /^[^@]+@[^@]+$/.test(v),
  phone: (v) => /^\d{10,}$/.test(v),
  required: (v) => v != null && v !== '',
};

function validate(value, rules) {
  return rules.every(rule => validators[rule]?.(value));
}
```

**Overtone 實例**：`registry.js` 的 stage→agent 映射就是 Strategy — 根據 stage 選擇不同的 agent handler。

## Observer / EventEmitter

**何時用**：物件狀態變化需通知多個不知道彼此存在的訂閱者。

```javascript
// Node.js EventEmitter 模式
const { EventEmitter } = require('events');
const bus = new EventEmitter();

bus.on('stage:complete', (data) => logTimeline(data));
bus.on('stage:complete', (data) => updateDashboard(data));
bus.emit('stage:complete', { stage: 'DEV', result: 'pass' });
```

**陷阱**：
- 訂閱後忘記 `removeListener` → 記憶體洩漏
- 事件鏈循環（A→B→C→A）→ stack overflow
- 太多 listener（> 10）→ Node.js 會警告

**Overtone 實例**：timeline.jsonl 的 event-driven append — 每個 hook 產出事件，多個消費者（Dashboard SSE、data.js 查詢）各自讀取。

## Factory

**何時用**：根據配置/類型建立不同物件，隔離建立邏輯。

```javascript
// 簡單 Factory — 不需要 class
function createLogger(type) {
  const loggers = {
    console: () => ({ log: console.log }),
    file: () => ({ log: (msg) => appendFileSync('app.log', msg + '\n') }),
    silent: () => ({ log: () => {} }),
  };
  const factory = loggers[type];
  if (!factory) throw new Error(`Unknown logger type: ${type}`);
  return factory();
}
```

**不要用的時機**：只有一種類型時，直接 `new` 就好。

## Decorator / Middleware

**何時用**：動態為物件增加橫切面功能（logging、caching、auth）。

```javascript
// 函式裝飾器
function withLogging(fn, label) {
  return (...args) => {
    console.log(`[${label}] called with`, args);
    const result = fn(...args);
    console.log(`[${label}] returned`, result);
    return result;
  };
}

const add = (a, b) => a + b;
const loggedAdd = withLogging(add, 'add');
```

**Overtone 實例**：Hook 鏈就是 Decorator — SessionStart → PreToolUse → PostToolUse 逐層包裝行為。

## Facade

**何時用**：簡化複雜子系統的入口，只暴露高層操作。

```javascript
// 複雜子系統的統一入口
const workflow = {
  start(type, sessionId) {
    state.init(type, sessionId);
    timeline.emit('workflow:start', { type });
    dashboard.notify({ event: 'started' });
  },
  // 隱藏 state/timeline/dashboard 的複雜性
};
```

**陷阱**：Facade 不能變成 God Object — 它只是 **委派**，不含業務邏輯。

---

## 反模式速查

| 反模式 | 徵兆 | 解法 |
|--------|------|------|
| God Object | 一個模組做所有事 | 拆分職責（SRP） |
| Golden Hammer | 什麼都用同一個模式 | 先理解問題再選模式 |
| Premature Abstraction | 只用一次就抽出 helper | 等重複出現第三次再抽 |
| Over-engineering | 為假想需求加複雜度 | YAGNI — 現在不需要就不做 |
