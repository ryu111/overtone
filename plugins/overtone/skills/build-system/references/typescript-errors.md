# TypeScript Strict Mode 錯誤修復指南

## 快速查表：錯誤訊息 → 修復方式

| 錯誤訊息 | 根因 | 修復 |
|----------|------|------|
| `Object is possibly 'undefined'` | strictNullChecks 啟用 | 加 `?.` 或 null check |
| `Object is possibly 'null'` | 同上 | 同上 |
| `Type 'X' is not assignable to type 'Y'` | 型別不符 | 修正型別或加明確轉換 |
| `Property 'x' does not exist on type 'Y'` | 使用不存在的屬性 | 更新型別定義或用 `as` |
| `Parameter 'x' implicitly has 'any' type` | noImplicitAny 啟用 | 加型別標註 |
| `Argument of type 'X' is not assignable to parameter of type 'Y'` | 函式參數型別不符 | 修正傳入型別 |
| `Type 'never'` | 型別收窄後無法到達的分支 | 加 exhaustive check 或修正邏輯 |
| `Cannot find module 'X'` | 缺少型別定義 | `npm i -D @types/X` 或建立 `.d.ts` |

---

## Never Type

```typescript
// 情境：exhaustive check（確保處理所有 union 成員）
type Shape = 'circle' | 'square' | 'triangle';

function getArea(shape: Shape): number {
  switch (shape) {
    case 'circle': return 3.14;
    case 'square': return 1;
    // 忘記 triangle → 編譯時不報錯，但 never check 會抓到
    default:
      const _exhaustive: never = shape;  // TS 報錯：triangle 不能賦值給 never
      throw new Error(`Unknown shape: ${_exhaustive}`);
  }
}

// 修復：加上 triangle case
case 'triangle': return 0.5;
```

```typescript
// 情境：型別收窄後 never
function process(value: string | number) {
  if (typeof value === 'string') { /* ... */ }
  if (typeof value === 'number') { /* ... */ }
  // 這裡 value 是 never（已窮舉所有可能）
}
```

---

## 型別收窄（Type Narrowing）

```typescript
// 壞：TS 不知道過了 if 之後 x 是什麼型別
function process(x: string | null) {
  if (x) {
    // x 可能是 '' （falsy string），TS 認為仍是 string | null
  }
}

// 好：明確 null check
function process(x: string | null) {
  if (x !== null) {
    // 這裡 TS 知道 x 是 string
    console.log(x.toUpperCase());
  }
}

// 或用 type guard
function isString(value: unknown): value is string {
  return typeof value === 'string';
}
```

---

## Generic Constraints

```typescript
// 問題：T 可能沒有 .length 屬性
function getLength<T>(arg: T): number {
  return arg.length;  // 錯誤：T 上不存在 length
}

// 修復：加 constraint
function getLength<T extends { length: number }>(arg: T): number {
  return arg.length;  // OK
}

// 實用的 generic constraints
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];  // 型別安全的屬性存取
}
```

---

## Conditional Types

```typescript
// 基本格式
type IsString<T> = T extends string ? 'yes' : 'no';

// 常用 utility
type NonNullable<T> = T extends null | undefined ? never : T;
type ReturnType<T extends (...args: any) => any> = T extends (...args: any) => infer R ? R : any;

// 問題：conditional type 在 union 上分發
type ToArray<T> = T extends any ? T[] : never;
type Result = ToArray<string | number>;  // string[] | number[]（分發行為）

// 禁用分發（用 tuple 包裝）
type ToArrayNoDist<T> = [T] extends [any] ? T[] : never;
type Result2 = ToArrayNoDist<string | number>;  // (string | number)[]
```

---

## Utility Types 速查

```typescript
Partial<T>           // 所有屬性改為可選
Required<T>          // 所有屬性改為必填
Readonly<T>          // 所有屬性改為唯讀
Record<K, V>         // { [key in K]: V }
Pick<T, K>           // 只取 T 中的 K 屬性
Omit<T, K>           // T 中去除 K 屬性
Exclude<T, U>        // T 中去除 U 的型別
Extract<T, U>        // T 中保留 U 的型別
NonNullable<T>       // 去除 null 和 undefined
ReturnType<T>        // 函式回傳型別
Parameters<T>        // 函式參數型別 tuple
InstanceType<T>      // 建構函式的實例型別
```

---

## 常見修復模式

### strictNullChecks 修復

```typescript
// 壞
const user = getUser(id);
console.log(user.name);  // 可能 undefined

// 好（選擇適合情境的方式）
const user = getUser(id);
if (user) {
  console.log(user.name);
}

// 或 optional chaining
console.log(user?.name);

// 或 non-null assertion（謹慎使用！只在確定不為 null 時用）
console.log(user!.name);

// 或 nullish coalescing
console.log(user?.name ?? 'Unknown');
```

### as const 固定字面量型別

```typescript
// 問題：TS 推斷為 string，不是字面量型別
const direction = 'left';  // type: string

// 修復：as const
const direction = 'left' as const;  // type: 'left'

// 物件
const config = {
  host: 'localhost',
  port: 3000,
} as const;
// config.host 的型別是 'localhost'，不是 string
```

### 型別斷言 vs 型別守衛

```typescript
// 型別斷言（as）：你告訴 TS 型別，TS 相信你（危險）
const value = someValue as string;  // 如果 someValue 不是 string，runtime 錯誤

// 型別守衛（type guard）：安全的型別收窄（推薦）
function isString(v: unknown): v is string {
  return typeof v === 'string';
}
if (isString(value)) {
  // 這裡安全地使用 string 方法
}
```
