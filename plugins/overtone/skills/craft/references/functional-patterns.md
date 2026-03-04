# 函數式程式設計模式

> 聚焦 JavaScript 中實用的 FP 模式，非學術完整性。

## 核心原則

| 原則 | 說明 | JavaScript 實踐 |
|------|------|-----------------|
| **Pure Function** | 相同輸入永遠相同輸出，無副作用 | 不改外部變數、不做 I/O |
| **Immutability** | 資料建立後不修改 | spread `{...obj}`、`Object.freeze`、structuredClone |
| **Composition** | 小函式組合成大函式 | `pipe()` / `compose()` |
| **Declarative** | 描述「做什麼」而非「怎麼做」 | `map/filter/reduce` 取代 for-loop |

---

## Pure Function

```javascript
// ❌ 不純 — 依賴外部狀態且修改它
let count = 0;
function increment() { return ++count; }

// ✅ 純 — 不碰外部狀態
function increment(count) { return count + 1; }
```

**判斷純度的快速檢查**：
- 呼叫 2 次相同參數，結果相同嗎？
- 把呼叫替換成回傳值，行為不變嗎？（Referential Transparency）
- 如果任一答案是「否」→ 不純

**何時允許不純**：I/O 邊界（讀檔、API 呼叫、DOM 操作）。策略：把不純的部分推到邊界，核心邏輯保持純粹。

## Immutability

```javascript
// ❌ 可變 — 修改原始物件
function addTag(user, tag) {
  user.tags.push(tag);
  return user;
}

// ✅ 不可變 — 回傳新物件
function addTag(user, tag) {
  return { ...user, tags: [...user.tags, tag] };
}
```

**深層不可變**：
```javascript
// 淺拷貝（一層）
const copy = { ...original };

// 深拷貝（多層，Bun/Node 17+ 支援）
const deepCopy = structuredClone(original);
```

**效能考量**：大量物件頻繁複製時考慮 Immer 或 persistent data structures。日常場景 spread 夠用。

## Composition

```javascript
// pipe：左到右執行
const pipe = (...fns) => (x) => fns.reduce((v, f) => f(v), x);

// 範例：處理使用者輸入
const sanitize = pipe(
  (s) => s.trim(),
  (s) => s.toLowerCase(),
  (s) => s.replace(/[^a-z0-9]/g, '-'),
);

sanitize('  Hello World! '); // → 'hello-world-'
```

**Overtone 實例**：Hook 鏈就是 composition — SessionStart → PreToolUse → SubagentStop 依序處理，每一層的輸出是下一層的輸入。

## 常用高階函式

| 函式 | 用途 | 取代 |
|------|------|------|
| `map` | 轉換每個元素 | for + push |
| `filter` | 過濾符合條件的元素 | for + if + push |
| `reduce` | 累積成單一值 | for + accumulator |
| `flatMap` | map + flatten | map + flat |
| `every/some` | 全部/任一符合條件 | for + flag |
| `find` | 找第一個符合的 | for + break |

```javascript
// ❌ 命令式
const results = [];
for (const user of users) {
  if (user.active) {
    results.push(user.name.toUpperCase());
  }
}

// ✅ 宣告式
const results = users
  .filter(u => u.active)
  .map(u => u.name.toUpperCase());
```

## Currying & Partial Application

```javascript
// Currying：把多參數函式變成一系列單參數函式
const multiply = (a) => (b) => a * b;
const double = multiply(2);
const triple = multiply(3);

double(5); // 10
triple(5); // 15
```

**實用場景**：建立可重用的部分配置函式（logger factory、validator factory）。

## 錯誤處理（函數式風格）

```javascript
// Result pattern（替代 try/catch）
function parseJSON(str) {
  try {
    return { ok: true, value: JSON.parse(str) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

const result = parseJSON(input);
if (result.ok) {
  // 使用 result.value
} else {
  // 處理 result.error
}
```

---

## 何時用 FP vs OOP

| 場景 | 偏好 | 原因 |
|------|------|------|
| 資料轉換管線 | FP | map/filter/reduce 更清晰 |
| 狀態管理（有生命週期） | OOP/Class | 封裝狀態 + 行為 |
| 工具函式庫 | FP | 無狀態、可組合 |
| UI 元件 | 混合 | React = FP 思維 + class-like 元件 |
| Overtone hooks/scripts | FP 為主 | 純函式 + DI 注入依賴 |
