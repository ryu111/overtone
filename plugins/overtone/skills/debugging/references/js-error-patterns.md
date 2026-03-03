# JavaScript/Node.js 常見錯誤模式庫

## Async/Await 陷阱

### 1. 未 await 的 Promise

```
症狀：函式不等待非同步操作完成就繼續執行
根因：忘記 await 關鍵字
修復：在所有非同步呼叫前加 await

// 壞
async function save(data) {
  db.save(data);  // 未 await
  return "saved"; // 立即返回，db.save 還在執行
}

// 好
async function save(data) {
  await db.save(data);
  return "saved";
}
```

### 2. Promise.all 錯誤處理

```
症狀：一個 Promise 失敗後其他 Promise 仍執行，但錯誤被吞掉
根因：Promise.all 在任一失敗時 reject，但其他 Promise 繼續
修復：
  - 用 Promise.allSettled 如果需要所有結果
  - 每個 Promise 加個別 catch
  - 或用 try/catch 包住整個 Promise.all
```

### 3. async 函式在 forEach 中

```
症狀：看起來非同步，但實際上是同步執行
根因：forEach 不 await async callback

// 壞
items.forEach(async (item) => {
  await process(item);  // 每個 callback 立即返回 Promise
});
// forEach 結束時，process 都還沒跑完

// 好
for (const item of items) {
  await process(item);  // 真正順序執行
}
// 或並行
await Promise.all(items.map(item => process(item)));
```

## Closure 問題

### 4. 迴圈中的 Closure

```
症狀：迴圈結束後所有 callback 使用同一個值（通常是最後一個）
根因：var 的函式作用域 + closure 捕捉變數而非值

// 壞
for (var i = 0; i < 5; i++) {
  setTimeout(() => console.log(i), 100);
  // 全部輸出 5
}

// 好
for (let i = 0; i < 5; i++) {  // let 是塊作用域
  setTimeout(() => console.log(i), 100);
  // 輸出 0,1,2,3,4
}
```

### 5. this 綁定在 callback 中丟失

```
症狀：callback 中的 this 是 undefined 或 global object
根因：一般函式的 this 取決於呼叫方式

// 壞
class Timer {
  start() {
    setTimeout(function() {
      this.tick();  // this 是 undefined（strict mode）
    }, 100);
  }
}

// 好：用箭頭函式
class Timer {
  start() {
    setTimeout(() => {
      this.tick();  // 繼承外層 this
    }, 100);
  }
}
```

## Type Coercion

### 6. == vs === 比較

```
症狀：條件判斷結果出乎意料
常見陷阱：
  0 == false    → true
  '' == false   → true
  null == undefined → true
  null == false → false  （很多人以為 true）

修復：永遠用 ===，除非刻意需要型別轉換
```

### 7. + 運算子型別混淆

```
症狀：數字相加變成字串串接
根因：+ 在有字串時做串接

'5' + 3     → '53'（字串串接）
'5' - 3     → 2（數字相減，字串轉數字）
'5' * '3'   → 15（數字相乘）

修復：明確轉換型別
  Number('5') + 3  → 8
  parseInt('5', 10) + 3  → 8
```

## Event Loop 阻塞

### 8. 同步阻塞主線程

```
症狀：伺服器無回應、UI 凍結、其他 request 排隊
根因：CPU 密集運算或同步 I/O 阻塞 event loop

// 壞
app.get('/heavy', (req, res) => {
  const result = heavyComputation();  // 阻塞幾秒
  res.json(result);
});

修復：
  - 用 worker_threads 做 CPU 密集工作
  - 確保 I/O 操作都是非同步（fs.promises 而非 fs.readFileSync）
  - 大資料集用串流（Stream）
```

### 9. setImmediate vs process.nextTick vs setTimeout

```
執行優先序：
  process.nextTick > Promise microtask > setImmediate > setTimeout(0)

症狀：非同步操作執行順序不如預期
根因：對 microtask queue 和 macrotask queue 理解錯誤

// nextTick 在當前操作完成後立即執行（同步感）
process.nextTick(() => console.log('nextTick'));

// setImmediate 在下一個 event loop iteration
setImmediate(() => console.log('immediate'));

// setTimeout 至少等一個 tick（非精確）
setTimeout(() => console.log('timeout'), 0);
```

## Memory Leak Patterns

### 10. 事件監聽器未移除

```
症狀：記憶體用量隨時間增長、效能下降
根因：事件監聽器持有 closure 參考，阻止 GC

// 壞
class Component {
  mount() {
    document.addEventListener('keydown', this.handleKey);
  }
  // 沒有 unmount，監聽器永遠存在
}

// 好
class Component {
  mount() {
    this._handler = this.handleKey.bind(this);
    document.addEventListener('keydown', this._handler);
  }
  unmount() {
    document.removeEventListener('keydown', this._handler);
  }
}
```

### 11. 全域變數累積

```
症狀：應用程式跑久記憶體持續增長
根因：資料加入全域物件/陣列但從未清理

// 壞
const cache = {};
function process(id, data) {
  cache[id] = data;  // 永遠加，永不清
}

// 好
const cache = new Map();
function process(id, data) {
  cache.set(id, data);
  if (cache.size > 1000) {
    // 清理最舊的 entry
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
}
// 或用 WeakMap（key 被 GC 時自動清除）
```

### 12. 未清理的 Timer

```
症狀：元件卸載/物件銷毀後仍繼續執行
根因：setInterval / setTimeout 持有 callback 參考

// 壞
class Poller {
  start() {
    setInterval(() => this.poll(), 1000);  // ID 未保存
  }
}

// 好
class Poller {
  start() {
    this._timer = setInterval(() => this.poll(), 1000);
  }
  stop() {
    clearInterval(this._timer);
    this._timer = null;
  }
}
```

## 常見錯誤訊息對照

| 錯誤訊息 | 常見根因 | 快速診斷 |
|----------|----------|----------|
| `Cannot read property 'x' of undefined` | 物件未初始化或 null | 加 optional chaining `?.` 或 null check |
| `TypeError: x is not a function` | 型別錯誤或未 import | `console.log(typeof x)` 確認型別 |
| `UnhandledPromiseRejection` | Promise 沒有 catch | 加 `.catch()` 或用 try/catch |
| `ENOENT: no such file or directory` | 路徑錯誤 | 用 `path.resolve()` 確認絕對路徑 |
| `EADDRINUSE: address already in use` | port 被佔用 | `lsof -i :PORT` 找占用程序 |
| `Maximum call stack size exceeded` | 無限遞迴 | 加 base case 或改迭代 |
| `Cannot set property 'x' of null` | DOM 元素不存在 | 確認 DOM 已載入或選擇器正確 |
