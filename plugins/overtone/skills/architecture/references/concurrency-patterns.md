# 並發模式決策樹

> 來源：Overtone Architect Knowledge Domain

## 決策樹：選擇哪種並發策略？

```
資料操作類型？
  │
  ├── 只讀（無寫入）→ 無需同步，直接讀取
  │
  ├── append-only（只追加，不修改現有內容）？
  │     └── 是 → JSONL Append（POSIX <= PIPE_BUF 原子保證）
  │
  └── 需要寫入/修改
        │
        ├── 只有一個寫入者？
        │     └── 是 → Atomic Write（tmp + rename）即可
        │
        └── 多個寫入者
              │
              ├── 各自寫獨立資料（無共享欄位）？
              │     └── 是 → 分割策略（每個 writer 寫自己的檔案）
              │
              └── 共享資料（需要 read-modify-write）
                    │
                    ├── 失敗可重試？
                    │     └── 是 → CAS（Compare-and-Swap）+ 指數退避重試
                    │
                    └── 不可重試（必須成功一次，或操作昂貴）？
                          └── Advisory File Lock（flock）
```

---

## 模式詳解

### 1. Atomic Write（tmp + rename）

**原理**：寫入暫存檔（`.tmp`），完成後用 `rename()` 覆蓋目標。`rename()` 在 POSIX 是原子操作，不會出現部分寫入。

**適用場景**：
- 單一寫入者（無並發競爭）
- 需要防止「寫到一半被讀取」的問題
- 設定檔、狀態快照

**Overtone 實作**：`scripts/lib/atomic-write.js` 的 `atomicWrite(path, content)`

```js
// 模式示意
const tmp = path + '.tmp.' + process.pid;
await writeFile(tmp, content);
await rename(tmp, path);  // POSIX 原子操作
```

**Tradeoff**：
- 優點：簡單可靠，防止部分寫入
- 優點：讀取方永遠看到完整檔案
- 缺點：多寫入者仍然有競爭條件（後寫者覆蓋先寫者）

**反模式警告**：
- 多個 process 同時 atomic write 同一檔案 — 需要升級為 CAS 或 flock

---

### 2. CAS（Compare-and-Swap）

**原理**：讀取時記錄版本號（mtime 或 ETag），寫入前比對版本是否仍一致，若已被其他 writer 修改則重試。

**適用場景**：
- 多個 process/hook 可能同時修改同一共享狀態
- 衝突機率低（重試成本可接受）
- 最終一致性即可（不需要嚴格序列化）

**Overtone 實作**：`scripts/lib/state.js` 的 `updateStateAtomic(sessionId, updater)`

```js
// 模式示意（mtime-based CAS）
for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
  const { content, mtime } = await readWithMtime(path);
  const newContent = updater(content);
  try {
    await writeIfMtimeMatch(path, newContent, mtime);
    return;  // 成功
  } catch (conflict) {
    await sleep(backoff(attempt));  // 指數退避
  }
}
throw new Error('CAS failed after max retries');
```

**重試策略**：
- 初始等待：5-10ms
- 指數退避：每次翻倍，加入隨機 jitter 避免 thundering herd
- 最大重試：3-5 次（依操作重要性調整）
- 超出上限：拋出錯誤，不要靜默丟棄

**Tradeoff**：
- 優點：無需鎖定，不會有死鎖
- 優點：衝突機率低時效能優於 flock
- 缺點：高衝突場景下重試風暴（改用 flock）
- 缺點：需要版本追蹤機制（mtime / hash / counter）

**反模式警告**：
- CAS 失敗後強制覆寫（放棄一致性保證）— 絕對不可
- 無限重試無退避 — 加入最大次數和 sleep

---

### 3. JSONL Append

**原理**：每次寫入一整行（JSON 序列化後 + `\n`），利用 POSIX 的原子 append 保證。

**POSIX 原子保證**：
- 單次 `write()` syscall，寫入量 <= `PIPE_BUF`（通常 4KB，Linux 為 65536 bytes）
- 多個 process 同時 append 到同一檔案，每行保持完整（不會交錯）
- 超過 PIPE_BUF 則原子性不保證 — 單行記錄必須 < 4KB

**適用場景**：
- 事件日誌（不需修改歷史記錄）
- 審計軌跡（immutable by design）
- 多個 producer 持續寫入

**Overtone 使用**：
- `timeline.jsonl`：所有 hook 追加 timeline 事件
- `observations.jsonl`：PostToolUse 追加觀察記錄

```js
// 模式示意
const line = JSON.stringify(event) + '\n';
// line 必須 < 4KB 才有原子保證
await appendFile(path, line);
```

**Tradeoff**：
- 優點：天然並發安全（無需額外同步）
- 優點：永不丟資料（舊記錄保留）
- 缺點：無法修改歷史記錄
- 缺點：檔案持續增長，需要定期 GC 或 rotation
- 缺點：讀取時需解析所有行（無隨機存取）

**反模式警告**：
- 單行超過 4KB — 拆分或用二進位格式
- 用 JSONL 儲存需要修改的狀態 — 改用 workflow.json + CAS

---

### 4. Advisory File Lock（flock）

**原理**：用 OS 提供的 advisory lock 確保同時只有一個 writer 持有鎖。其他 writer 等待或立即失敗（non-blocking 模式）。

**適用場景**：
- 操作昂貴，不可重試（如呼叫外部 API 後寫入結果）
- 衝突機率高（多個 writer 頻繁競爭）
- 需要嚴格序列化（不接受最終一致性）

**Node.js/Bun 實作方式**：
```js
// 使用 flock syscall（需要 native binding 或 child_process）
import { execSync } from 'child_process';

// 方式 1：shell flock（簡單但有 overhead）
execSync(`flock -x ${lockFile} -c "node writer.js"`);

// 方式 2：lockfile-based（純 JS，advisory）
const acquired = await tryLock(lockPath);
if (!acquired) throw new Error('Lock busy');
try {
  await doWrite();
} finally {
  await unlock(lockPath);
}
```

**Tradeoff**：
- 優點：嚴格序列化，無競爭條件
- 優點：不需要重試邏輯
- 缺點：持有鎖的 process 崩潰時需要 stale lock 清理機制
- 缺點：鎖競爭時其他 writer 阻塞（降低並發性）
- 缺點：Node.js/Bun 無原生 flock API，需要 workaround

**反模式警告**：
- 鎖住大段業務邏輯（長時間持鎖）— 只鎖 read-modify-write 最小範圍
- 不設置 lock timeout — 必須有超時釋放機制

---

### 5. 分割策略（Partition by Writer）

**原理**：每個 writer 只寫自己專屬的檔案或 key，讀取時聚合所有分片。

**適用場景**：
- 多個 agent/process 各自記錄獨立資料
- 資料本身天然有所有者（per-agent、per-session）
- 讀取時需要彙總所有資料

**Overtone 範例**：
```
# 每個 agent instance 寫自己的 shard
~/.overtone/sessions/{sid}/agent-{instanceId}.json

# 讀取時 glob + merge
const shards = await glob('agent-*.json');
const merged = shards.flatMap(readJSON);
```

**Tradeoff**：
- 優點：零並發衝突（各寫各的）
- 優點：天然支援並行（無需協調）
- 缺點：讀取需要聚合，增加讀取複雜度
- 缺點：需要清理策略（避免分片累積）

**反模式警告**：
- 分片 key 設計不當導致多個 writer 仍共享同一分片
- 讀取聚合沒有處理分片部分失敗的情況

---

## 反模式清單

### 1. 直接 readFile → modify → writeFile（TOCTOU）

```js
// 危險：兩次 I/O 之間有競爭視窗
const data = JSON.parse(await readFile(path));
data.count++;  // 此時另一個 process 可能已修改
await writeFile(path, JSON.stringify(data));  // 覆蓋別人的修改
```

**修復**：改用 CAS（`updateStateAtomic`）

---

### 2. JSON.parse + JSON.stringify 覆寫共享檔案

與 TOCTOU 相同的根因，只是表達形式不同。多個 hook 同時觸發時，後寫者的更新會覆蓋先寫者。

**修復**：所有共享狀態寫入必須通過 `updateStateAtomic`

---

### 3. 用 setTimeout/sleep 當作同步機制

```js
// 危險：競爭視窗大小不固定，無法保證
await writeFile(path, data);
await sleep(100);  // 「等另一個 process 完成」
const result = await readFile(path);  // 可能讀到舊值
```

**修復**：用明確的協調機制（CAS version check、lock、或事件通知）

---

### 4. CAS 失敗後強制覆寫

```js
// 危險：等同於無 CAS
try {
  await casWrite(path, data, expectedMtime);
} catch {
  await writeFile(path, data);  // 放棄一致性保證
}
```

**修復**：CAS 失敗應重新讀取最新狀態後再計算新值重試，而非強制寫入

---

## Overtone 特定場景

| 檔案 | 模式 | 理由 |
|------|------|------|
| `workflow.json` | CAS（`updateStateAtomic`） | 多個 hook 可能同時寫入（SubagentStop、Stop、TaskCompleted）；需要 enforceInvariants |
| `timeline.jsonl` | JSONL Append | 多個 hook 追加事件；append-only，不需修改歷史 |
| `observations.jsonl` | JSONL Append | PostToolUse 持續追加；同上 |
| `statusline-state.json` | Atomic Write（最後寫入者勝出） | 顯示用，最終一致性可接受；無需 CAS |
| `loop.json` | Atomic Write | 單一寫入者（session-stop-handler）；無並發競爭 |
| `compact-count.json` | Atomic Write | 只有 PreCompact hook 寫入 |
| `.current-session-id` | Atomic Write | on-submit.js 單一寫入點 |

### workflow.json 的 enforceInvariants

CAS 不只是原子寫入，還需要在 `updateStateAtomic` 內執行 `enforceInvariants(state)`，確保每次寫入後狀態滿足不變量（invariants）。順序重要：

```
updateStateAtomic(sessionId, updater):
  1. 讀取當前狀態 + mtime
  2. updater(state) — 業務邏輯修改
  3. enforceInvariants(state) — 修正違規狀態
  4. CAS 寫入（比對 mtime）
  5. 失敗則重試（回到步驟 1）
```

---

## Architect 設計整合

在 design.md 中明確並發策略：

```
## 並發安全

| 資料 | 寫入者 | 策略 | 理由 |
|------|--------|------|------|
| {檔案名} | {誰會寫} | {模式} | {選擇依據} |
```

**Checklist（設計 review 時確認）**：
- [ ] 列出所有共享狀態（多個 process 可能同時寫入的）
- [ ] 確認每個共享狀態的並發策略
- [ ] 確認 JSONL 單行 < 4KB（否則原子性不保證）
- [ ] CAS 實作有重試上限和退避策略
- [ ] Advisory lock 有 timeout 和 stale lock 清理
