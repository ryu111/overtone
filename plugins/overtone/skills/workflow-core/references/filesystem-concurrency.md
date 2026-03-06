# Overtone 檔案系統並發模式

> Overtone 內部的並發設計：atomicWrite、CAS、JSONL append、enforceInvariants、sanitize

---

## 1. 並發挑戰

Overtone 作為 Claude Code plugin，多個 hook 可能同時觸發：

- **SubagentStop** 在並行 agent 收斂時同時觸發多次
- **session-stop-handler** 和 SubagentStop 可能同時存取 `workflow.json`
- **timeline/observations** 需要多個 hook 同時追加事件
- **heartbeat daemon** 和前景 session 可能同時讀寫狀態

所有共享狀態都是檔案系統上的 JSON/JSONL，沒有資料庫或 IPC 鎖可用。

---

## 2. atomicWrite — 單寫入者原子寫入

**位置**：`scripts/lib/utils.js`

**原理**：寫入 tmp 檔 → `renameSync()` 到目標路徑。POSIX 保證同一 filesystem 上的 `rename()` 是原子操作，讀取方不會看到部分寫入。

```js
// 實作摘要
let _atomicCounter = 0;
function atomicWrite(filePath, data) {
  mkdirSync(dirname(filePath), { recursive: true });
  const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n';
  const tmp = `${filePath}.${process.pid}.${Date.now()}.${_atomicCounter++}.tmp`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, filePath);  // POSIX 原子操作
}
```

**設計理由**：
- `process.pid + Date.now() + counter` 三重確保 tmp 檔唯一性，即使同 PID 在同 ms 內多次呼叫也不衝突
- `writeFileSync` 確保 tmp 內容完整寫入後才 rename
- `mkdirSync({ recursive: true })` 確保目錄存在

**適用場景**：
- 單一寫入者的完整檔案替換（`loop.json`、`compact-count.json`、`statusline-state.json`）
- 作為 CAS 的底層寫入層

**限制**：
- 不保護 read-modify-write 完整流程（多寫入者需升級為 CAS）
- 多寫入者同時 atomicWrite 同一檔案 → 最後寫入者勝出（acceptable loss 場景可接受）

---

## 3. updateStateAtomic — CAS（Compare-and-Swap）

**位置**：`scripts/lib/state.js`

**原理**：讀取 workflow.json + 記錄 mtime → 執行 modifier → 寫入前再次檢查 mtime 是否變化 → 未變則寫入，已變則重試。

```
updateStateAtomic(sessionId, modifier):
  for i = 0..MAX_RETRIES(3):
    1. readState() → current state
    2. statSync() → 記錄 mtime
    3. modifier(current) → modified state
    4. enforceInvariants(modified) → 修正不變量
    5. statSync() → 檢查 mtime 是否仍相同
    6. mtime 相同 → atomicWrite() → 成功返回
    7. mtime 不同 → jitter(1-5ms) → 重試
  fallback: 強制讀取 + modifier + enforceInvariants + atomicWrite
```

**重試策略**：
- 最多 3 次重試
- 每次重試前加入 1-5ms 隨機 jitter（D1 修復），縮小 TOCTOU 窗口
- jitter 實作：Worker 環境用 `Atomics.wait()`，main thread 用忙等短循環

**mtime-based CAS 的精度限制**：
- APFS (macOS)：1ns 精度 — 實務上足夠
- HFS+ (舊 macOS)：1s 精度 — 同秒內的並發寫入無法偵測
- ext4 (Linux)：1ns 精度
- 結論：現代 macOS (APFS) 和 Linux 環境下 mtime 精度足夠，舊系統需注意

**fallback 強制寫入**：
- 3 次 retry 都失敗後，最後一次強制讀取 + modifier + enforceInvariants + 寫入
- 風險：可能覆蓋其他 hook 的修改
- 緩解：enforceInvariants 確保狀態的基本一致性不被破壞
- 實務：在正常並發量（2-3 個 hook 同時觸發）下，3 次 retry 幾乎總是足夠

**適用場景**：
- `workflow.json` — 多個 hook（SubagentStop、Stop、TaskCompleted）可能同時寫入

---

## 4. JSONL Append — 多寫入者追加

**位置**：`scripts/lib/timeline.js`

**原理**：每次寫入一整行（JSON 序列化 + `\n`），使用 `appendFileSync()`。

```js
// 實作摘要
function emit(sessionId, eventType, data = {}) {
  const event = { ts: new Date().toISOString(), type: eventType, ...data };
  appendFileSync(filePath, JSON.stringify(event) + '\n', 'utf8');
}
```

**原子性保證**：
- Regular file 以 O_APPEND 模式開啟時，POSIX 保證 seek+write 是原子的
- `appendFileSync` 在 Bun/Node.js 中使用 O_APPEND 模式，小量資料（< 數 KB）不會交錯
- 注意：嚴格來說 PIPE_BUF（4096 bytes）是 pipe/FIFO 的保證，regular file append 的原子性來自 O_APPEND 語意
- 實務上：Overtone 的 timeline 事件單行通常 < 1KB，遠在安全範圍內

**截斷機制**：
- 每 100 次 emit 檢查一次，超過 2000 行時保留最新的 2000 行
- 截斷使用 `atomicWrite()`（讀取全部 → 切片 → 原子寫回）

**適用場景**：
- `timeline.jsonl` — 所有 hook 追加 timeline 事件
- `observations.jsonl` — PostToolUse 追加觀察記錄

**限制**：
- 單行必須 < 4KB 才有原子保證
- 不適合需要修改已寫入資料的場景
- 截斷操作（trimIfNeeded）與 append 之間有極小的競爭窗口（實務上罕見）

---

## 5. enforceInvariants — 寫入時自動修正

**位置**：`scripts/lib/state.js`

在每次 `updateStateAtomic` 寫入前自動執行，確保狀態滿足不變量。即使 CAS fallback 強制寫入，不變量仍然提供最後防線。

**4 條規則**：

| 規則 | 偵測條件 | 修正動作 |
|------|----------|----------|
| 1. 孤兒 activeAgents | stage key 不存在於 stages | 刪除該 activeAgents entry |
| 2. Status 單向性 | 有 completedAt 但 status 非 completed | 修正 status 為 completed |
| 3. parallelDone 溢出 | parallelDone > parallelTotal | 修正 parallelDone = parallelTotal |
| 4. 孤兒 active stage | status=active 但無對應 activeAgents | 有 completedAt → completed；無 → pending |

**並發場景下的作用**：
- 兩個 SubagentStop 同時觸發，其中一個的 parallelDone 計算錯誤 → 規則 3 修正
- Agent crash 導致 SubagentStop 未觸發 → 規則 4 在下次寫入時修正
- 規則在每次寫入時都執行，是持續性的自癒機制

**違規記錄**：
- 每次修正都通過 `timeline.emit('system:warning')` 記錄
- 可通過 timeline 查詢追溯並發問題的發生頻率

---

## 6. sanitize — 啟動時跨 session 清理

**位置**：`scripts/lib/state.js`

在 SessionStart 時呼叫，清理上一個 session 可能遺留的不一致狀態。

**4 條清理規則**：

| 規則 | 場景 | 修正 |
|------|------|------|
| 1. 孤兒 activeAgents | 上一個 session 的 agent 未正常結束 | 刪除 |
| 2. Status 不一致 | completedAt 存在但 status 不是 completed | 修正為 completed |
| 3. 孤兒 active stage | Agent crash，status 卡在 active | 有 completedAt → completed；無 → pending |
| 4. 被跳過的 pending | currentStage 已推進但前面的 stage 仍是 pending | 修正為 completed |

**與 enforceInvariants 的差異**：
- `enforceInvariants`：每次寫入時執行，即時防禦
- `sanitize`：啟動時執行一次，清理跨 session 殘留
- sanitize 規則 4（跳過的 pending）只在啟動時有意義，運行中由 workflow 推進邏輯處理

---

## 7. 各檔案的並發策略總覽

| 檔案 | 寫入者 | 策略 | 理由 |
|------|--------|------|------|
| `workflow.json` | 多個 hook 同時 | CAS (`updateStateAtomic`) | 共享狀態，需要 read-modify-write 保護 |
| `timeline.jsonl` | 多個 hook 同時 | JSONL append | append-only，天然原子 |
| `observations.jsonl` | PostToolUse hook | JSONL append | 同上 |
| `loop.json` | session-stop-handler | atomicWrite | 單一寫入者 |
| `compact-count.json` | PreCompact hook | atomicWrite | 單一寫入者 |
| `statusline-state.json` | 多個來源 | atomicWrite（最後寫入者勝出） | 顯示用，eventual consistency 可接受 |
| `.current-session-id` | on-submit.js | atomicWrite | 單一寫入者 |

---

## 8. 已知的並發風險與緩解

### G1: CAS fallback 強制寫入（execution-queue TOCTOU）
- **風險**：3 次 retry 失敗後強制寫入，可能覆蓋其他 hook 的修改
- **緩解**：enforceInvariants 確保基本一致性；heartbeat activeSession guard 確保同一時間只有一個 session 存取 execution-queue，自然避免 TOCTOU；實務中 3 次 retry 幾乎總是足夠
- **監控**：timeline 中的 `system:warning` 事件，source=state-invariant
- **狀態**：已知風險，持續監控

### G2: 運行中 orphan agent TTL 偵測（✅ 已修復）
- **風險**：agent crash 且 SubagentStop 未觸發 → activeAgents 殘留，getNextStageHint() 誤判為有 agent 在執行，造成 loop 卡在 soft-release
- **緩解**：
  1. `detectAndCleanOrphans()`（session-stop-handler.js）：在每次 Stop hook 觸發時掃描 activeAgents，超過 15 分鐘 TTL 的 entry 自動刪除並 emit `agent:orphan-cleanup` 事件
  2. `sanitize()`：在 SessionStart 時清理跨 session 殘留
  3. `enforceInvariants()` 規則 4：在下次 state 寫入時自動修正孤兒 active stage
- **監控**：timeline 中的 `agent:orphan-cleanup` 事件
- **狀態**：已修復（v0.28.68）

### G3: JSONL 截斷競爭
- **風險**：trimIfNeeded 讀取全部行 → 切片 → atomicWrite 期間，其他 hook 的 append 可能遺失
- **緩解**：截斷只在每 100 次 emit 觸發一次，窗口極小；遺失的是最新事件，重新觸發即可
- **實務影響**：極低（timeline 事件遺失不影響 workflow 狀態）
- **狀態**：已知風險，可接受
