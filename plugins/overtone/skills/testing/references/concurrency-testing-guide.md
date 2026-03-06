# 並發測試指南（Concurrency Testing Guide）

Overtone 並發寫入策略的測試方法、驗證清單與已知限制。

---

## 1. Overtone 並發模式總覽

Overtone 使用三種策略應對不同寫入場景：

| 策略 | 模組 | 適用場景 | 保證 |
|------|------|----------|------|
| `atomicWrite` | `scripts/lib/utils.js` | 單一寫入者，需要 JSON 完整性 | rename 原子性，無損壞 |
| `updateStateAtomic` (CAS) | `scripts/lib/state.js` | 多寫入者，需讀改寫一致性 | mtime 衝突偵測 + retry |
| `appendFileSync` (JSONL) | Node.js `fs` | 多追加者，只追加不改 | OS 層 append 原子性（多數系統） |

### 1.1 atomicWrite — 單寫入者

寫入流程：`writeTmp → rename`。rename 為 POSIX 原子操作，目標檔案要嘛是舊版，要嘛是新版，不存在損壞中間態。

tmp 路徑格式：

```
${filePath}.${process.pid}.${Date.now()}.${_atomicCounter++}.tmp
```

`_atomicCounter` 確保同一進程快速連續呼叫時 tmp 路徑不衝突。

### 1.2 updateStateAtomic (CAS) — 多寫入者

流程：`readState → 記錄 mtime → modifier(state) → statSync 比對 mtime → atomicWrite → enforceInvariants`

mtime 衝突時：jitter delay 後重試，最多 MAX_RETRIES（3）次。耗盡後走 fallback 強制寫入。fallback 路徑同樣執行 `enforceInvariants`。

```
讀取 state
  ↓
執行 modifier
  ↓
mtime 未變？ ─No→ jitter delay → retry (最多 3 次) → fallback 強制寫入
  ↓ Yes
atomicWrite + enforceInvariants
```

### 1.3 appendFileSync (JSONL) — 多追加者

`timeline.jsonl` 採用 JSONL append-only 模式。OS 層的 `O_APPEND` flag 在多數 POSIX 系統提供原子性（單次 write() 不超過 PIPE_BUF）。每行獨立，讀取時按行分割並過濾空行。

---

## 2. 測試策略

### 2.1 單元測試：CAS retry（`utimesSync` 模擬 mtime 衝突）

不使用 mock，改用 `fs.utimesSync` 強制設未來時間讓 mtime 改變，模擬「外部修改」：

```js
// 來自 tests/unit/cas-retry.test.js
function touchFile(filePath) {
  const content = readFileSync(filePath, 'utf8');
  writeFileSync(filePath, content, 'utf8');
  // 設未來時間確保 mtime 必定改變
  const now = new Date(Date.now() + 100);
  require('fs').utimesSync(filePath, now, now);
}

// 在 modifier 內部呼叫 touchFile → 觸發 CAS 衝突
const result = stateLib.updateStateAtomic(sessionId, (s) => {
  touchFile(filePath); // 模擬外部修改
  return { ...s, customField: 'updated' };
});

// modifier 應被呼叫 >= 2 次（第 1 次衝突後 retry）
expect(modifierCallCount).toBeGreaterThanOrEqual(2);
```

為何不用 mock：直接操作真實檔案系統，驗證 CAS 的實際行為而非實作細節。

### 2.2 多進程壓力測試：`Bun.spawn` N 個子進程並行操作

用 `Bun.spawn` 而非 worker threads，確保真正的多進程並行（各自獨立 V8 heap）：

```js
// 來自 tests/integration/stress-concurrency.test.js
async function spawnAll(scripts) {
  const procs = scripts.map((script) =>
    Bun.spawn(['bun', '-e', script], {
      env: { ...process.env, OVERTONE_NO_DASHBOARD: '1' },
      stdout: 'pipe',
      stderr: 'pipe',
    })
  );

  return Promise.all(
    procs.map(async (proc, i) => {
      const exitCode = await proc.exited;
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      return { exitCode, stdout, stderr, index: i };
    })
  );
}

// 10 個子進程同時 atomicWrite 同一檔案
const scripts = Array.from({ length: N }, (_, i) => `
  const { atomicWrite } = require('${UTILS_PATH}');
  atomicWrite('${targetFile}', { pid: process.pid, writerId: ${i} });
`);

await spawnAll(scripts);
```

務必設定 `OVERTONE_NO_DASHBOARD: '1'` 避免子進程觸發 Dashboard spawn 副作用。

### 2.3 驗證檢查清單

**atomicWrite 完成後**：
- [ ] 目標目錄無 `.tmp` 殘留（`readdirSync` 過濾 `.endsWith('.tmp')`）
- [ ] 目標檔案存在（`existsSync`）
- [ ] `JSON.parse(readFileSync(...))` 不拋出例外（JSON 完整性）
- [ ] 業務欄位存在且型別正確（非存在性斷言，驗證實際值）

**appendFileSync 完成後**：
- [ ] 非空白行數 = N × per_process_lines（`split('\n').filter(l => l.trim())`）
- [ ] 每行可 `JSON.parse`
- [ ] 每個 processId 恰好出現預期次數（無重複無丟失）
- [ ] `(processId, lineIndex)` 組合唯一（用 `Set` 計數）

**updateStateAtomic 完成後**：
- [ ] 最終 workflow.json 可 JSON.parse
- [ ] counter >= 1（至少一次寫入成功）
- [ ] 孤兒 activeAgent 已被 `enforceInvariants` 清除

---

## 3. 已知限制

### 3.1 S2-6 CAS counter 最終值非確定性

`updateStateAtomic` 採用 last-write-wins 語意。5 個子進程各做 `counter++`，最終 counter 的值介於 1 至 5 之間（取決於 OS 排程），無法斷言為確定值。

測試斷言應使用：

```js
// 正確：>= 1 即可
expect(finalState.counter).toBeGreaterThanOrEqual(1);

// 錯誤：不可斷言確定值
// expect(finalState.counter).toBe(5);
```

### 3.2 timeline.emit 在測試環境可能失敗

子進程中呼叫 `updateStateAtomic` 會觸發 timeline emit，但測試環境可能無完整 session 設定導致失敗（exit code 非 0）。

驗證策略：只確認 stderr 無 `Error:` 開頭（JS 層例外），不要求 exit code 必為 0：

```js
for (const r of results) {
  if (r.exitCode !== 0) {
    // timeline emit 失敗是已知情況，只確認無 JS 例外
    expect(r.stderr).not.toMatch(/^Error:/m);
  }
}
```

### 3.3 macOS APFS vs HFS+ mtime 精度差異

APFS 提供納秒級 mtime；舊版 HFS+ 精度為 1 秒。在 HFS+ 環境下，同一秒內的多次寫入可能有相同 mtime，導致 CAS 無法偵測衝突。

現代 macOS（APFS 為預設）此問題已不存在，但若在舊系統或外接 HFS+ 磁碟執行測試，需留意。

---

## 4. Flaky 測試處理

壓力測試依賴 OS 排程行為，偶爾因負載過高而超時，屬於 flaky 測試。

### 4.1 標記 `@stress-test`

在測試檔案頂部（第一行）加入標記，供工具識別：

```js
// @stress-test
'use strict';
```

### 4.2 `retry: 1` 設定

對 async 壓力測試使用 bun test 原生的 retry 選項：

```js
// 統一定義避免散落
const STRESS_TEST_OPTIONS = { retry: 1, timeout: 30000 };

// 作為 it() 第三個參數傳入
it('S2-1: 完成後目標目錄中不應有 .tmp 殘留檔案', async () => {
  // ...
}, STRESS_TEST_OPTIONS);
```

`retry: 1` 表示首次失敗後自動重試一次。`timeout: 30000` 給多進程 spawn 充分時間。

### 4.3 test-parallel.js SEQUENTIAL_FILES 機制

依賴全域共享檔案（如 `~/.overtone/.current-session-id`）的測試，必須加入 `SEQUENTIAL_FILES` 串行執行，避免競爭條件：

```js
// scripts/test-parallel.js
const SEQUENTIAL_FILES = new Set([
  'tests/integration/session-id-bridge.test.js',
  // 加入其他依賴全域共享狀態的測試
]);
```

判斷是否需要加入的標準：測試是否讀寫 `~/.overtone/` 下的共享（非 session 隔離）檔案。

`stress-concurrency.test.js` 使用隔離的 `TMP_DIR` 或帶 timestamp 的 sessionId，不依賴全域共享狀態，因此不需要加入 `SEQUENTIAL_FILES`。

---

## 5. 快速參考表

| 測試類型 | 測試位置 | 執行時間 | Flaky 風險 |
|----------|----------|----------|------------|
| CAS retry 單元測試 | `tests/unit/cas-retry.test.js` | ~1s | 低 |
| atomicWrite 多進程 | `tests/integration/stress-concurrency.test.js` | ~5s | 中 |
| JSONL append 多進程 | `tests/integration/stress-concurrency.test.js` | ~5s | 低 |
| CAS 多進程最終一致性 | `tests/integration/stress-concurrency.test.js` | ~10s | 中 |
