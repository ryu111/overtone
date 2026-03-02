# 測試反模式指南

> 供 tester 和 code-reviewer 在撰寫/審查測試時參考。每種反模式提供壞例、好例與判斷準則。

---

## Anti-Pattern 1：測試實作細節

**定義**：測試驗證的是內部實作方式（呼叫了哪個私有函式、狀態變數是什麼值），而非外部可觀察的行為。

### 判斷準則

若重構後（行為不變、只改內部結構），測試就失敗 — 即為此反模式。

### 壞例（DON'T）

```js
// 驗證私有快取變數是否被賦值
it('呼叫後應設定 _cachedResult', () => {
  const svc = new DataService();
  svc.fetchUser(1);
  expect(svc._cachedResult).toBeDefined(); // 測試內部狀態
});
```

### 好例（DO）

```js
// 驗證可觀察的行為：第二次呼叫不觸發網路請求
it('相同 id 重複呼叫時應回傳快取結果', async () => {
  const svc = new DataService();
  const first = await svc.fetchUser(1);
  const second = await svc.fetchUser(1);
  expect(second).toEqual(first);
  expect(mockFetch).toHaveBeenCalledTimes(1); // 只發一次請求
});
```

---

## Anti-Pattern 2：重複測試既有行為

**定義**：新增的測試與已存在的測試完全或高度重疊，驗證同一輸入的同一輸出，無新增覆蓋率。

### 判斷準則

若刪除新測試，既有測試仍能偵測到相同的 regression — 即為此反模式。撰寫測試前應先執行 `bun test` 確認現有覆蓋，並查閱 Test Index 了解既有測試範圍。

### 壞例（DON'T）

```js
// 已有 registry.test.js 測試 stages 映射
// 新增完全重複的測試：
it('stages 應包含 DEV', () => {
  expect(stages.DEV).toBeDefined(); // 重複
});
it('stages.DEV.agent 應是 developer', () => {
  expect(stages.DEV.agent).toBe('developer'); // 重複
});
```

### 好例（DO）

```js
// 在既有測試缺口處新增
it('stages.DEV 包含 emoji 和 color 屬性', () => {
  expect(stages.DEV.emoji).toBeTruthy();
  expect(stages.DEV.color).toBeTruthy();
});
```

---

## Anti-Pattern 3：原始碼字串檢查（字面量嗅探）

**定義**：用讀取檔案內容、匹配字串的方式驗證「規格合規性」，而非驗證實際執行行為。

### 判斷準則

若測試的核心斷言是 `fileContent.includes('某字串')` 或 regex 匹配原始碼 — 即為此反模式。例外：linter/format 工具的測試本就以原始碼為輸入，不屬此反模式。

### 壞例（DON'T）

```js
it('config-api.js 應該有 validateRequired 函式', () => {
  const src = fs.readFileSync('scripts/lib/config-api.js', 'utf8');
  expect(src).toContain('function validateRequired'); // 驗證字串，非行為
});
```

### 好例（DO）

```js
it('缺少必要欄位時 validateRequired 應拋出錯誤', () => {
  const { validateRequired } = require('../scripts/lib/config-api');
  expect(() => validateRequired({}, ['name'])).toThrow(/name/);
});
```

---

## Anti-Pattern 4：低價值存在性斷言

**定義**：只斷言物件/屬性「存在」（`.toBeDefined()`、`!== undefined`），不驗證其實際值或行為。

### 判斷準則

若把受測模組的回傳值改為 `{}` 或 `null`，測試仍然通過 — 即為此反模式。

### 壞例（DON'T）

```js
it('buildTestIndex 應回傳字串', () => {
  const result = buildTestIndex(testsDir);
  expect(result).toBeDefined();       // 不夠，undefined 以外都過
  expect(typeof result).toBe('string'); // 稍好，但仍未驗證內容
});
```

### 好例（DO）

```js
it('buildTestIndex 應回傳包含 [Test Index] 開頭的字串', () => {
  const result = buildTestIndex(testsDir);
  expect(result).toMatch(/^\[Test Index\]/);
  expect(result).toContain('## unit/');
});
```

---

## Anti-Pattern 5：計數硬編碼

**定義**：斷言特定的數量（如「有 3 個 agents」、「有 6 個欄位」），導致正常新增功能時測試無故失敗。

### 判斷準則

若新增一個合法的元件（agent / stage / hook），測試就失敗 — 即為此反模式。用「至少 N 個」或驗證特定項目存在，而非精確計數。

### 壞例（DON'T）

```js
it('應有 17 個 agents', () => {
  expect(Object.keys(agents).length).toBe(17); // 新增 agent 就壞掉
});
```

### 好例（DO）

```js
it('所有必要 agents 均存在', () => {
  const required = ['developer', 'tester', 'planner', 'architect'];
  for (const name of required) {
    expect(agents[name]).toBeDefined();
  }
});

// 或：驗證「至少」
it('至少有 10 個 agents', () => {
  expect(Object.keys(agents).length).toBeGreaterThanOrEqual(10);
});
```

---

## Anti-Pattern 6：過度 Mock

**定義**：Mock 掉所有依賴，導致測試只驗證「呼叫了 mock」，而非真正的整合行為。

### 判斷準則

若受測函式本身邏輯被完全抽空、所有有趣的邏輯都在 mock 函式中 — 即為此反模式。Mock 應只用於：(1) 跨越網路/磁碟的副作用、(2) 不可控的外部系統、(3) 極度複雜的依賴。

### 壞例（DON'T）

```js
// parseResult 的邏輯被完全 mock 掉，測試等於沒測
jest.mock('../scripts/lib/parse-result', () => ({
  parseResult: jest.fn(() => ({ status: 'pass' })),
}));

it('parseResult 應回傳 pass', () => {
  const result = parseResult('...');
  expect(result.status).toBe('pass'); // 只是在驗證 mock 本身
});
```

### 好例（DO）

```js
// 直接測試真實 parseResult 邏輯
it('包含 pass 關鍵字時 parseResult 應回傳 pass status', () => {
  const result = parseResult('所有測試通過，pass');
  expect(result.status).toBe('pass');
});

it('包含 fail 關鍵字時 parseResult 應回傳 fail status', () => {
  const result = parseResult('測試失敗，fail');
  expect(result.status).toBe('fail');
});
```
