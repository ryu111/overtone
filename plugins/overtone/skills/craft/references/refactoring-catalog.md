# 重構手法目錄

> 來源：Martin Fowler《Refactoring》+ JavaScript 實踐

## 壞味道 → 重構手法對照

| 壞味道 | 徵兆 | 重構手法 |
|--------|------|----------|
| **Long Function** | 函式 > 20 行，做多件事 | Extract Function |
| **Long Parameter List** | 參數 > 3 個 | Introduce Parameter Object |
| **Duplicated Code** | 相同邏輯出現 3+ 次 | Extract Function / Pull Up |
| **Feature Envy** | 方法大量存取另一個模組的資料 | Move Function |
| **Data Clumps** | 多個變數總是一起出現 | Introduce Parameter Object |
| **Primitive Obsession** | 用字串表示 email/money/status | Replace Primitive with Object |
| **Switch Statements** | switch/if-else 根據類型分派 | Replace with Strategy/Polymorphism |
| **Speculative Generality** | 「以後可能會用到」的抽象 | Remove Dead Code |
| **Middle Man** | 類別只是轉發到另一個類別 | Remove Middle Man |
| **Shotgun Surgery** | 改一個功能要動 5+ 個檔案 | Move Function / Inline Class |

---

## 常用重構手法詳解

### Extract Function

**前**：
```javascript
function printReport(data) {
  // 計算總額
  let total = 0;
  for (const item of data.items) {
    total += item.price * item.qty;
  }
  // 格式化輸出
  console.log(`Report: ${data.title}`);
  console.log(`Total: $${total.toFixed(2)}`);
  console.log(`Items: ${data.items.length}`);
}
```

**後**：
```javascript
function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price * item.qty, 0);
}

function printReport(data) {
  const total = calculateTotal(data.items);
  console.log(`Report: ${data.title}`);
  console.log(`Total: $${total.toFixed(2)}`);
  console.log(`Items: ${data.items.length}`);
}
```

### Introduce Parameter Object

**前**：
```javascript
function searchUsers(name, minAge, maxAge, role, active) { /* ... */ }
```

**後**：
```javascript
function searchUsers({ name, minAge, maxAge, role, active }) { /* ... */ }
// 呼叫：searchUsers({ name: 'Alice', role: 'admin', active: true })
```

### Replace Conditional with Strategy

**前**：
```javascript
function getPrice(type, base) {
  if (type === 'regular') return base;
  if (type === 'premium') return base * 0.9;
  if (type === 'vip') return base * 0.8;
}
```

**後**：
```javascript
const pricingStrategies = {
  regular: (base) => base,
  premium: (base) => base * 0.9,
  vip: (base) => base * 0.8,
};

function getPrice(type, base) {
  const strategy = pricingStrategies[type];
  if (!strategy) throw new Error(`Unknown type: ${type}`);
  return strategy(base);
}
```

### Replace Temp with Query

**前**：
```javascript
const basePrice = quantity * itemPrice;
const discount = basePrice > 1000 ? 0.05 : 0;
const finalPrice = basePrice * (1 - discount);
```

**後**：
```javascript
function basePrice() { return quantity * itemPrice; }
function discount() { return basePrice() > 1000 ? 0.05 : 0; }
const finalPrice = basePrice() * (1 - discount());
```

---

## 安全重構流程

1. **確認有測試覆蓋** — 沒測試不重構
2. **小步前進** — 每次只做一個重構手法
3. **重構後立即執行測試** — 確認行為不變
4. **分開 commit** — 重構 commit 不混功能變更
