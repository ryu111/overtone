# 測試效能優化指南（Test Performance Guide）

> 版本：v1.0（2026-03-07）
> 適用對象：tester agent（verify 模式）、developer 在撰寫測試時

本指南提供七個維度的測試效能優化策略，搭配本專案的真實範例。
目標：在不犧牲覆蓋品質的前提下，讓測試套件維持在 15 秒內完成。

---

## A. Lazy Cache Pattern（模組級快取）

### 適用場景

同一 `describe` block 中，多個 `it` 呼叫**完全相同的純函式**，且每次都做昂貴操作（遞迴目錄掃描、大型物件建構、複雜計算）。

### 核心概念

模組頂層建立一個 `Map`，第一次呼叫時計算並快取，後續呼叫直接從快取取值。

### 實作：無參數版本

```js
// ── 模組頂層（describe 外）──
const _cache = new Map();
function cached(fn) {
  if (!_cache.has(fn)) _cache.set(fn, fn());
  return _cache.get(fn);
}

// ── 使用 ──
describe('checkPhantomEvents', () => {
  it('不應有未註冊的事件', () => {
    const result = cached(checkPhantomEvents); // 第一次：掃描目錄
    expect(result.length).toBe(0);
  });
  it('結果格式正確', () => {
    const result = cached(checkPhantomEvents); // 後續：快取命中，0ms
    expect(result.every(r => r.file)).toBe(true);
  });
  it('所有 file 欄位是絕對路徑', () => {
    const result = cached(checkPhantomEvents); // 快取命中
    expect(result.every(r => r.file.startsWith('/'))).toBe(true);
  });
});
```

### 實作：有參數版本

```js
const _cache = new Map();
function cachedWith(fn, ...args) {
  const key = `${fn.name}:${JSON.stringify(args)}`;
  if (!_cache.has(key)) _cache.set(key, fn(...args));
  return _cache.get(key);
}

// 用法
const result = cachedWith(collectJsFiles, SCRIPTS_LIB);
```

### 本專案真實範例

`tests/unit/health-check.test.js`（第 38-43 行）：

```js
// ── 效能：lazy cache 避免重複目錄掃描 ──
const _cache = new Map();
function cached(fn) {
  if (!_cache.has(fn)) _cache.set(fn, fn());
  return _cache.get(fn);
}
```

此模式讓 `checkPhantomEvents`、`checkDeadExports` 等昂貴的目錄掃描函式只執行一次，即使在多個 `it` 中呼叫也不重複掃描。

### 注意事項

- 只適用於**純函式**（相同輸入總是相同輸出、無副作用）
- 若函式依賴可變的外部狀態（時間戳記、檔案系統寫入），不可快取
- 跨測試檔的快取不會共享（每個測試檔是獨立模組）

---

## B. Per-Scenario Shared Fixture（per-describe 共用設置）

### 適用場景

同一 Scenario（`describe`）下，多個 `test` 驗證**同一次操作的不同面向**。例如：spawn 一次 hook，驗證 exit code、stdout、timeline 事件等多個結果。

### 核心概念

使用 lazy getter pattern：第一次呼叫時執行初始化，結果存入閉包變數，後續呼叫直接回傳。

### 實作範例

```js
describe('Scenario 1d-1: 正常結束時 emit session:end 事件', () => {
  let _sid, _result, _events;

  // lazy getter — 第一次呼叫才初始化，後續直接回傳
  function getScenario() {
    if (!_sid) {
      _sid = newSessionId();
      initSessionDir(_sid);
      writeLoopJson(_sid, { stopped: false, iterations: 2 });
      _result = runHook({ session_id: _sid, reason: 'prompt_input_exit' }, _sid);
      _events = readTimeline(_sid);
    }
    return { result: _result, events: _events };
  }

  test('timeline.jsonl 新增 session:end 事件', () => {
    const { events } = getScenario(); // spawn 執行一次
    expect(events.find(e => e.type === 'session:end')).toBeDefined();
  });

  test('session:end 事件包含正確的 reason', () => {
    const { events } = getScenario(); // 從閉包取快取
    const ev = events.find(e => e.type === 'session:end');
    expect(ev.reason).toBe('prompt_input_exit');
  });

  test('session:end 事件包含有效 ts', () => {
    const { events } = getScenario(); // 從閉包取快取
    const ev = events.find(e => e.type === 'session:end');
    expect(ev.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
```

### 本專案真實範例

`tests/integration/platform-alignment-session-end.test.js`（Scenario 1d-1、1d-2）採用此模式，將每個 spawn 從 per-test 降為 per-scenario，在不減少覆蓋的前提下大幅降低 I/O 次數。

### 對比：改造前後

```js
// 壞例（每個 test 各自 spawn，3 次 I/O）
test('exit code 為 0', () => {
  const result = runHook(input);   // spawn #1
  expect(result.exitCode).toBe(0);
});
test('stdout 包含 session:end', () => {
  const result = runHook(input);   // spawn #2
  expect(result.stdout).toContain('session:end');
});
test('events 長度為 1', () => {
  const result = runHook(input);   // spawn #3
  expect(result.events.length).toBe(1);
});

// 好例（lazy getter，1 次 I/O）
describe('正常結束', () => {
  let _result;
  function getResult() {
    if (!_result) _result = runHook(input);
    return _result;
  }
  test('exit code 為 0', () => expect(getResult().exitCode).toBe(0));
  test('stdout 包含 session:end', () => expect(getResult().stdout).toContain('session:end'));
  test('events 長度為 1', () => expect(getResult().events.length).toBe(1));
});
```

---

## C. Subprocess Spawn Reduction（子進程削減）

### 適用場景

Integration test 中有大量 `Bun.spawnSync` 呼叫，每次驗證不同面向但輸入相同。

### 策略清單

#### 策略 C-1：共用同一次 spawn 結果

適用 B 節的 Per-Scenario Shared Fixture pattern 即可。

#### 策略 C-2：beforeAll 預執行一次

當整個 `describe` 都需要同一個 spawn 結果時，使用 `beforeAll`：

```js
describe('on-submit.js 正常流程', () => {
  let result;

  beforeAll(() => {
    result = Bun.spawnSync(['node', HOOK_PATH], {
      stdin: Buffer.from(JSON.stringify(input)),
      env: process.env,
      stdout: 'pipe',
      stderr: 'pipe',
    });
  });

  test('exit code 為 0', () => expect(result.exitCode).toBe(0));
  test('stdout 是有效 JSON', () => {
    expect(() => JSON.parse(new TextDecoder().decode(result.stdout))).not.toThrow();
  });
  test('stderr 無錯誤', () => {
    expect(new TextDecoder().decode(result.stderr)).not.toMatch(/Error/i);
  });
});
```

> **注意**：bun test 不自動注入 `beforeAll`，務必在 require 中明確引入：
> `const { describe, test, expect, beforeAll, afterAll } = require('bun:test');`

#### 策略 C-3：Humble Object 遷移（最大化效能提升）

將 hook 的業務邏輯提取為可直接 `require` 的純函式（Humble Object 模式）：

```js
// ── 薄殼 hook（on-start.js）——
const { buildBanner, buildStartOutput } = require('./lib/session-start-handler');

// ── 測試（不需要 spawn）──
const { buildBanner } = require('../scripts/lib/session-start-handler');

test('buildBanner 包含版本號', () => {
  const banner = buildBanner({ version: '0.28.67' });
  expect(banner).toContain('0.28.67');
});
```

效能提升：spawn 測試（~500ms）→ 直接呼叫（~5ms），提升 100 倍。

**遷移規則**：
- 「驗證輸出內容」→ 提取純函式，直接呼叫測試
- 「驗證 I/O 副作用」（檔案寫入、emit timeline）→ 保留 spawn

---

## D. Heavy I/O Function Testing Pattern（重量級 I/O 函式）

### 適用場景

被測函式本身做大量 I/O（如 `handleSessionStart`、`runAllChecks`），難以直接快取。

### 策略 D-1：DI Injection（依賴注入）

設計函式接受 I/O 函式作為參數，測試時注入 mock：

```js
// 實作（支援 DI）
function buildReport(sessionId, { readState = defaultReadState } = {}) {
  const state = readState(sessionId);
  return formatReport(state);
}

// 測試（mock I/O 邊界）
test('buildReport 格式正確', () => {
  const result = buildReport('sid_test', {
    readState: () => ({ stage: 'DEV', status: 'pass' }),
  });
  expect(result).toContain('DEV');
});
```

### 策略 D-2：分層測試

將「純計算邏輯」和「I/O 組合」分別測試：

```js
// 純計算 — 快速，不需要 I/O
test('formatReport 純計算', () => {
  const state = { stage: 'DEV', status: 'pass' };
  expect(formatReport(state)).toContain('DEV');
});

// I/O 組合 — 只驗證「是否有正確呼叫 I/O」，1 個測試即可
test('buildReport 從 readState 讀取狀態', () => {
  let called = false;
  buildReport('sid', { readState: (id) => { called = true; return {}; } });
  expect(called).toBe(true);
});
```

### 何時可以快取 vs 不能快取

| 情境 | 可快取？ | 原因 |
|------|----------|------|
| `checkPhantomEvents()` — 掃描靜態程式碼 | ✅ 可 | 程式碼在測試期間不變 |
| `collectJsFiles(SCRIPTS_LIB)` | ✅ 可 | 相同目錄，結果不變 |
| `handleSessionStart(sid)` — 寫入 timeline | ❌ 不可 | 副作用，每次不同 |
| `Date.now()` | ❌ 不可 | 時間每次不同 |
| `readState(sid)` — 測試期間 state 不變 | 視情況 | 若 test 間不修改 state，可快取 |

---

## E. Bun 測試特定優化

### E-1：原生並行特性

Bun test runner 預設以多 worker 並行執行測試檔案（`--max-concurrency=20`）。`bun scripts/test-parallel.js` 利用此特性將測試檔分散到 10 個 worker，從 ~53s（單進程）縮短到 ~21s（並行）。

**善用方法**：
- 確保每個測試檔完全隔離（參考 testing-conventions.md Section 7）
- 不要在測試中使用共享的全域狀態或共享檔案路徑

### E-2：`@sequential` marker 的使用時機

在 `bun test` 的測試檔中加上 `// @sequential` 可強制該檔案單線程執行：

```js
// @sequential  ← 整個檔案只用單線程
'use strict';
// ...
```

**使用時機**：
- 測試依賴全域共享資源（如 `~/.overtone/.current-session-id`）
- 測試之間有執行順序依賴
- 測試修改了共享的 singleton 狀態

對於跨檔案的全域資源衝突（不同測試檔互相競爭），需在 `scripts/test-parallel.js` 的 `SEQUENTIAL_FILES` 陣列中註冊，讓該檔案在所有並行 worker 完成後串行執行。

### E-3：Module Resolution 快取

Bun 的 `require()` 有模組快取，同一 worker 中多次 require 同一模組只加載一次。善用此特性：

```js
// 頂層 require（只加載一次）
const registry = require('../../plugins/overtone/scripts/lib/registry');

// 不要在 beforeEach 中 require（會觸發快取重建）
beforeEach(() => {
  const registry = require('../../...'); // 不必要
});
```

---

## F. 效能量測方法論

### F-1：使用 test-parallel.js 量測

```bash
# 執行全套並顯示各 worker 耗時
bun scripts/test-parallel.js

# 校準 KNOWN_WEIGHTS（分析各檔案實際耗時）
bun scripts/test-parallel.js --calibrate
```

### F-2：KNOWN_WEIGHTS 的意義

`scripts/test-parallel.js` 維護一個 `KNOWN_WEIGHTS` 映射，記錄已知的「重量級」測試檔案（耗時較長），用於平衡分配給各 worker，避免某個 worker 包攬所有重量級測試而成為瓶頸。

```js
// 典型的 KNOWN_WEIGHTS 條目
const KNOWN_WEIGHTS = {
  'tests/integration/platform-alignment-session-start.test.js': 8,
  'tests/integration/health-check.test.js': 6,
  // ...
};
```

**何時應更新 KNOWN_WEIGHTS**：
- 新增了執行時間超過 3 秒的測試檔
- 優化後某個重量級測試大幅縮短
- 執行 `--calibrate` 後發現分配不均

### F-3：觀察效能瓶頸

識別慢測試的方法：

```bash
# 直接計時單個測試檔
time bun test tests/integration/platform-alignment-session-start.test.js

# 並行執行後觀察哪個 worker 最晚完成
bun scripts/test-parallel.js  # 注意輸出中哪個 worker 最後 done
```

### F-4：何時觸發重新校準

以下情況應重新執行 `--calibrate`：
- 測試總時間增加超過 20%（如從 21s 升至 25s+）
- 新增了 10 個以上的 integration test 檔
- 重構了大量 spawn 測試（時間分配改變）

---

## G. 決策樹：拿到一個慢測試時的排查流程

```
發現慢測試（單檔 > 5s 或整體耗時增加）
│
├─ Step 1：定位慢測試檔案
│   time bun test <file>  ← 是否超過 3s？
│   如果 < 1s → 問題可能在 worker 分配不均，不是測試本身
│
├─ Step 2：識別慢測試類型
│   ├─ 多個 it 都很慢 → 是否每個 it 都獨立做昂貴操作？
│   │   → 是 → 套用 B（Per-Scenario Shared Fixture）
│   │
│   ├─ 多個 describe 都呼叫同一個函式 → 是否純函式？
│   │   → 是 → 套用 A（Lazy Cache Pattern）
│   │
│   ├─ 大量 spawn 呼叫 → 是否驗證同一操作的不同面向？
│   │   → 是 → 套用 C-1 或 C-2（spawn reduction）
│   │   → 函式有業務邏輯可提取 → 套用 C-3（Humble Object）
│   │
│   └─ 被測函式本身做大量 I/O → 套用 D（分層測試 + DI）
│
├─ Step 3：評估 worker 分配
│   若單檔正常但整體慢 → 更新 KNOWN_WEIGHTS（F-2）
│
├─ Step 4：驗證優化效果
│   time bun test <file>  ← 優化後時間
│   bun scripts/test-parallel.js  ← 整體時間
│
└─ Step 5：確認覆蓋不降低
    優化只改變「執行幾次」，不改變「測試什麼」
    優化後 test 數量應相同或增加
```

### 快速判斷表

| 症狀 | 最可能原因 | 解法 |
|------|------------|------|
| 同 describe 多個 it 各自 spawn | spawn 重複 | B（Shared Fixture） |
| 多個 describe 呼叫同純函式 | 重複計算 | A（Lazy Cache） |
| 整體慢但單檔快 | worker 不均 | 更新 KNOWN_WEIGHTS |
| integration test > 10s | hook spawn 過多 | C-3（Humble Object） |
| 測試包含 I/O 大函式 | 無 DI 設計 | D（分層 + DI） |

---

## 附錄：本專案優化案例摘要

| 測試檔 | 優化前 | 優化後 | 手法 |
|--------|--------|--------|------|
| session-start.test.js | 11.4s | 6.2s (-45%) | C-3（Humble Object）+ A |
| pre-compact.test.js | 2.93s | 2.23s (-24%) | C-3（部分 spawn → 直接呼叫） |
| health-check.test.js | ~3s | ~1.5s | A（Lazy Cache） |
| platform-alignment-session-end.test.js | ~4s | ~2s | B（Per-Scenario Fixture） |
