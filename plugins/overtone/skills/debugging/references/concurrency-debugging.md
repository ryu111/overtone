# 並發問題診斷指南

## 並發問題分類

### Race Condition（競態條件）

多個操作的執行順序不確定，導致結果依執行時序而異。

```
典型場景：
  Thread A: 讀取 state.json → 修改 → 寫入
  Thread B: 讀取 state.json → 修改 → 寫入（覆蓋 A 的修改）

特徵：
  - 結果在不同執行間不一致
  - 序列化執行時問題消失
  - 增加延遲（sleep）有時能「修復」但無法根治
```

### TOCTOU（Time-of-Check to Time-of-Use）

在「檢查條件」和「使用資源」之間，狀態被另一個操作修改。

```
典型場景：
  操作 A: 檢查 lock 不存在 → [間隙] → 建立 lock
  操作 B: 檢查 lock 不存在 → 建立 lock（兩者都認為自己拿到了 lock）

特徵：
  - 保護機制存在，但不是原子操作
  - 偶發的「明明有保護卻還是衝突」
```

### Deadlock（死鎖）

兩個以上操作互相等待對方完成，形成循環等待。

```
典型場景（檔案鎖）：
  操作 A: 持有 file1.lock → 等待 file2.lock
  操作 B: 持有 file2.lock → 等待 file1.lock

特徵：
  - 系統完全卡住，沒有進展
  - 所有涉及的操作都掛起
  - 需要外部介入（timeout、kill）才能解除
```

### Starvation（飢餓）

某個操作因為其他操作持續佔用資源，長期無法取得所需資源。

```
典型場景：
  高優先級操作持續進入 → 低優先級操作永遠排不到

特徵：
  - 特定操作總是超時或失敗
  - 系統整體看起來正常，只有特定操作受影響
  - 負載降低時問題緩解
```

### Lost Update（遺失更新）

多個操作同時讀取舊值、修改、寫入，後寫者覆蓋前寫者的修改。

```
典型場景：
  操作 A: 讀取 count=5 → count+1=6 → 寫入 6
  操作 B: 讀取 count=5 → count+1=6 → 寫入 6（A 的更新消失了）
  預期結果：7，實際結果：6

特徵：
  - 計數器、累計值比預期低
  - 狀態更新「消失了」
  - 操作次數 > 結果反映的次數
```

---

## 症狀辨識清單

```
□ 偶發性 test failure，尤其是並行測試（bun test 有時過有時不過）
□ 狀態檔案內容與預期不符（如 parallelDone > parallelTotal）
□ activeAgents 殘留（agent 已停但 activeAgents 未清除）
□ 同一操作有時成功、有時失敗，無法穩定重現
□ log 中出現 "CAS conflict" 或 "forced write" 警告
□ 計數器值比實際操作次數少（Lost Update）
□ 系統掛起無回應，但沒有 crash（可能是 Deadlock）
□ 序列化執行相同步驟時問題消失
□ 增加 sleep/delay 讓問題變得不常見（但沒有根治）
□ 特定檔案的 mtime 與預期不符（被意外覆寫）
```

---

## 診斷步驟

### Step 1: 確認是否為並發問題

```
問題能否穩定重現？
  ├── 不能（偶發）→ 並發問題的強烈信號
  └── 能 → 不一定是並發問題，繼續排查其他原因

序列化執行是否正常？
  ├── 正常 → 確認為並發問題
  └── 不正常 → 可能是邏輯 bug，先排查邏輯

驗證序列化：
  # 關閉並行，單獨執行
  bun test [file] --max-concurrency=1
  # 或手動依序執行各操作（非同時）
```

### Step 2: 找出共享資源

```
列出所有可能被多個操作同時存取的資源：
  □ 共享檔案（哪些 .json / .jsonl 會被多個 process 讀寫？）
  □ 全域變數或 module-level 狀態（在 Bun/Node 多進程中不共享，但同進程內共享）
  □ 外部資源（資料庫、API、Queue）
  □ 環境狀態（環境變數、工作目錄、stdin/stdout）

工具：
  # 找哪些程式碼寫入特定檔案
  grep -r "workflow.json" --include="*.js" -l
  # 找哪些函式讀取 state
  grep -r "readState\|readFile" --include="*.js" -l
```

### Step 3: 畫出時序圖

```
找出所有可能交錯的操作：

時序圖模板：
  T0  T1  T2  T3  T4
  A:  讀  改  ↓   寫
  B:  讀  ↓   改  寫  ← B 覆蓋了 A

關鍵問題：
  - 哪個時間窗口（間隙）讓另一個操作插入？
  - 這個間隙有多長？（I/O 操作間隙最危險）
  - 間隙縮小會讓問題更罕見但不消失
```

### Step 4: 確認保護機制

```
檢查共享資源是否有適當保護：
  □ 有 CAS（Compare-and-Swap）機制？
    → 找 readFileSync + compareAndSwap 或類似模式
  □ 有原子寫入（atomic write）？
    → 找 write-to-temp-then-rename 模式
  □ 有 lock 機制？
    → 找 .lock 檔案、mutex、semaphore
  □ 操作本身是否天然原子？
    → JSONL append 是原子的，read-modify-write 不是

Overtone 的保護機制：
  updateStateAtomic() → CAS 重試（scripts/lib/state.js）
  JSONL append → timeline 事件（原子 append）
  .lock 檔案 → 部分 I/O 操作使用
```

### Step 5: 找出保護缺口（TOCTOU 窗口）

```
找到「檢查」和「使用」之間的間隙：

危險模式：
  const exists = fs.existsSync(lockFile);   // 檢查
  if (!exists) {                             // ← 間隙在這裡！
    fs.writeFileSync(lockFile, '...');       // 使用
  }

安全模式（原子 flag）：
  try {
    fs.writeFileSync(lockFile, '...', { flag: 'wx' }); // 原子：不存在才建立
  } catch (e) {
    if (e.code === 'EEXIST') { /* 已被佔用 */ }
  }

TOCTOU 問題定位：
  找所有「先讀後寫」的模式（非原子操作）
  特別注意：async/await 之間的間隙（await 讓出控制權）
```

---

## Overtone 常見並發問題

### 並行測試共享全域檔案

```
問題：~/.overtone/.current-session-id 是全域共享檔案
      多個測試並行執行時互相覆寫
症狀：session-id-bridge.test.js 偶發失敗
修復：將依賴此檔案的測試加入 SEQUENTIAL_FILES（scripts/test-parallel.js）

相關位置：
  scripts/test-parallel.js → SEQUENTIAL_FILES 陣列
  hooks/scripts/on-submit.js → 寫入 .current-session-id
```

### 多個 hook 同時觸發 updateStateAtomic

```
問題：多個 SubagentStop hook 並行，同時呼叫 updateStateAtomic
症狀：log 出現 "CAS conflict"，重試後成功（正常行為）
      偶發 "forced write" → 表示 CAS 超過最大重試次數
修復：CAS 重試通常足夠；若頻繁 forced write，考慮降低並行度

相關位置：
  scripts/lib/state.js → updateStateAtomic + CAS 邏輯
  hooks/scripts/on-stop.js → 收斂門，確認所有並行 agent 完成
```

### SubagentStop 未觸發導致 activeAgents orphan

```
問題：context 中斷或 hook 失敗，agent 停止但未清理 activeAgents
症狀：Dashboard 顯示 agent 仍在執行，但實際已完成
     parallelDone 未達 parallelTotal，loop 卡住
修復：sanitize() 在 SessionStart 時自動清理殘留 activeAgents
     也可手動觸發：bun scripts/stop-loop.js {sessionId}

相關位置：
  scripts/lib/state.js → sanitize() 規則
  hooks/scripts/session-start.js → 啟動時呼叫 sanitize
```

### 並行 agent 同時修改同一檔案

```
問題：REVIEW + TEST 並行時，可能同時寫入 workflow.json
症狀：workflow 狀態不一致，completedAt 遺失
保護：Overtone 靠 stage 設計避免 — REVIEW/TEST 設計為只讀不寫同一檔案
      updateStateAtomic CAS 作為最後一道防線

注意：如果新增 stage 也需要寫入 workflow.json，必須評估並行安全性
```

### parallelDone > parallelTotal 異常

```
問題：CAS 衝突 + forced write 可能導致計數不一致
症狀：workflow.json 中 parallelDone 大於 parallelTotal
修復：enforceInvariants() 中的規則自動修正此類異常

相關位置：
  scripts/lib/state.js → enforceInvariants() 規則 2-4
  tests/unit/state-invariants.test.js → 驗證修正行為
```

---

## 預防性 Code Review 清單

給 code-reviewer agent 使用，審查涉及共享資源的 PR：

```
共享資源保護
  □ 共享檔案是否有原子性保護？（CAS、atomic write、lock）
  □ read-modify-write 是否使用 updateStateAtomic 或 CAS 機制？
  □ 並行操作是否可能存取同一檔案？（特別是 workflow.json / state.json）

TOCTOU 防護
  □ 是否有「先讀後寫」的非原子操作？
  □ async/await 之間是否有共享狀態的間隙？
  □ 檔案存在性檢查（existsSync）後是否立即使用？應改為 flag: 'wx' 原子建立

資源清理
  □ 錯誤路徑是否正確清理 lock / state？（try/finally）
  □ 是否有 orphan 資源未清理（開了沒關、建立了沒刪除）？
  □ agent 異常退出時，activeAgents 是否會被清理？

測試設計
  □ 新增的測試是否依賴全域共享檔案？（~/.overtone/.current-session-id）
  □ 如果是，是否已加入 SEQUENTIAL_FILES？
  □ 測試中的 afterAll/afterEach 是否清理了 session 目錄？
```

---

## 並發安全的常見模式

```javascript
// 原子寫入（write-to-temp-then-rename）
const tmpPath = `${targetPath}.tmp.${Date.now()}`;
fs.writeFileSync(tmpPath, JSON.stringify(data));
fs.renameSync(tmpPath, targetPath); // rename 在同 filesystem 是原子操作

// 原子建立 lock（TOCTOU 安全）
try {
  fs.writeFileSync(lockFile, pid.toString(), { flag: 'wx' });
  // 成功取得 lock
} catch (e) {
  if (e.code === 'EEXIST') {
    // lock 已存在，等待或放棄
  }
} finally {
  // 確保釋放 lock
  fs.unlinkSync(lockFile);
}

// JSONL append（原子 append，適合 timeline）
fs.appendFileSync(timelinePath, JSON.stringify(event) + '\n');

// CAS 重試（Overtone updateStateAtomic 模式）
for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
  const { state, version } = readStateWithVersion();
  const newState = transform(state);
  if (compareAndSwap(newState, version)) break; // 成功
  // 失敗則重試（其他操作在間隙中修改了 state）
}
```
