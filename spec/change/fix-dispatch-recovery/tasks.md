# 修復 dispatch 恢復機制 -- 任務清單

## 子任務依賴分析

```
Phase 1（並行）: Task 1（hook-client.js） + Task 2（server.js）— 修改不同檔案，無依賴
Phase 2（串行）: Task 3（測試）— 依賴 Phase 1 完成
```

---

## Phase 1：程式碼修改（並行）

### Task 1：hook-client.js — 陳舊 lockfile 清除 + pollHealth 增容

**執行者**：executor（sonnet）
**檔案**：`~/.claude/hooks/hook-client.js`

#### 步驟

1. 在 `autoStart()` 函式之前新增 `isLockfileStale()` 函式：
   - `readFileSync(LOCK_FILE, 'utf-8')` 讀取 PID
   - `parseInt` 轉換，`isNaN` → return true
   - `process.kill(pid, 0)` 檢查存活
   - catch `ESRCH` → return true（進程不存在）
   - catch `EPERM` → return false（存在但無權限，保守）
   - 其他錯誤 → return true

2. 修改 `autoStart()` 的 lockfile 分支（line 132-136）：
   ```
   // 改前：
   if (existsSync(LOCK_FILE)) {
     await pollHealth();
     return;
   }

   // 改後：
   if (existsSync(LOCK_FILE)) {
     if (isLockfileStale()) {
       debugLog('[autoStart] stale lockfile detected, removing');
       try { unlinkSync(LOCK_FILE); } catch {}
       // 繼續往下 spawn
     } else {
       // 另一個 hook-client 正在啟動 → polling 等 server 就緒
       await pollHealth();
       return;
     }
   }
   ```

3. 修改 spawn 後的 `pollHealth()` 呼叫（line 145）：
   ```
   // 改前：
   await pollHealth();  // 預設 maxRetries=4, baseMs=200 → 總等待 3200ms

   // 改後：
   await pollHealth({ maxRetries: 5, baseMs: 200 });  // 總等待 6200ms
   ```

#### 驗收

- [ ] `isLockfileStale()` 函式存在
- [ ] lockfile 分支有 isLockfileStale 判斷
- [ ] spawn 後 pollHealth maxRetries=5

---

### Task 2：server.js — SIGTERM graceful shutdown

**執行者**：executor（sonnet）
**檔案**：`~/.claude/hooks/server.js`

#### 步驟

1. 在 `process.on('uncaughtException', ...)` 之前（line 487）新增：
   ```javascript
   function gracefulShutdown(signal) {
     console.log(`[server] ${signal} received, shutting down...`);
     try { stopHeartbeatLoop(); } catch (e) {
       console.error(`[server] stopHeartbeatLoop error during ${signal}:`, e.message);
     }
     process.exit(0);
   }
   process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
   process.on('SIGINT', () => gracefulShutdown('SIGINT'));
   ```

#### 驗收

- [ ] SIGTERM handler 存在
- [ ] SIGINT handler 存在
- [ ] handler 呼叫 stopHeartbeatLoop()
- [ ] handler 呼叫 process.exit(0)
- [ ] stopHeartbeatLoop 有 try-catch 包裹

---

## Phase 2：測試（依賴 Phase 1）

### Task 3：新增/更新測試

**執行者**：executor（sonnet）
**檔案**：`~/projects/overtone/tests/unit/hook-client.test.js`

#### 步驟

1. 新增 `describe('isLockfileStale 邏輯')` 測試群組：
   - 靜態驗證：hook-client.js 原始碼含 `isLockfileStale` 函式
   - 靜態驗證：autoStart 中含 `isLockfileStale()` 呼叫
   - 靜態驗證：isLockfileStale 含 `process.kill` 呼叫
   - 靜態驗證：isLockfileStale 含 `ESRCH` 處理
   - 靜態驗證：isLockfileStale 含 `EPERM` 處理
   - 靜態驗證：isLockfileStale 含 `isNaN` 處理

2. 新增 `describe('pollHealth spawn 後等待時間')` 測試群組：
   - 靜態驗證：spawn 後 pollHealth 呼叫含 `maxRetries: 5`（或 `maxRetries:5`）

3. 新增 `describe('server.js SIGTERM handler')` 測試群組：
   - 靜態驗證：server.js 原始碼含 `process.on('SIGTERM'`
   - 靜態驗證：server.js 原始碼含 `process.on('SIGINT'`
   - 靜態驗證：server.js 原始碼含 `gracefulShutdown`

4. 執行 `bun test` 確認 0 fail

#### 驗收

- [ ] 新增測試全部通過
- [ ] 現有測試不受影響
- [ ] `bun test` exit code 0
