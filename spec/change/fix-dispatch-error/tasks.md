# 修復 dispatch fallback 順序 -- 任務清單

## 子任務依賴分析

```
Phase 1（串行）: Task 1 — hook-client.js 修改（同一檔案 3 處變更）
Phase 2（串行）: Task 2 — 測試驗證（依賴 Phase 1）
```

---

## Phase 1：hook-client.js 修改（串行）

### Task 1：重排錯誤恢復路徑 + autoStart debugLog

**執行者**：executor（sonnet）
**檔案**：`~/.claude/hooks/hook-client.js`

#### 步驟

1. **重寫 L170-203 的錯誤恢復路徑**，從：

   ```javascript
   // 現在：dispatch fail → await autoStart(6s) → retry → fallback
   try {
     output(await tryDispatch());
   } catch (e1) {
     const needsFallback = hasFallback(eventType, matcher);
     try {
       await autoStart();
       if (needsFallback) {
         try { output(await tryDispatch()); }
         catch (e2) { if (!await tryFallback(...)) logError(...); }
       }
     } catch (autoStartErr) {
       if (needsFallback && !await tryFallback(...)) logError(...);
     }
   }
   ```

   改為：

   ```javascript
   // 改後：dispatch fail → fallback(15ms) → 背景 autoStart
   try {
     const result = await tryDispatch();
     const t2 = performance.now();
     debugLog(`[${eventType}:${matcher}] ok stdin=${...}ms dispatch=${...}ms ...`);
     output(result);
   } catch (e1) {
     const needsFallback = hasFallback(eventType, matcher);
     debugLog(`[${eventType}:${matcher}] dispatch fail ...`);

     // 有 fallback → 立即本地處理
     if (needsFallback) {
       const fell = await tryFallback(eventType, matcher, input);
       if (!fell) {
         logError(`${eventType}:${matcher}`, e1, "fallback-failed");
       }
       debugLog(`[${eventType}:${matcher}] fallback ${fell ? 'ok' : 'fail'} (${...}ms)`);
     }

     // 背景恢復 server（不阻塞當前 hook）
     autoStart().catch(err =>
       debugLog(`[${eventType}:${matcher}] background autoStart fail: ${err.message}`)
     );
   }
   ```

2. **autoStart 函式內加 debugLog**，在每個分支加記錄：

   - health check 開始/結果（alive / port-occupied / no-response）
   - lockfile 狀態（stale / valid / absent）
   - spawn 開始 + PID
   - pollHealth 每次嘗試結果
   - 完成耗時

   具體修改：
   ```javascript
   async function autoStart() {
     const t = performance.now();
     debugLog('[autoStart] start');

     // health check
     try {
       debugLog('[autoStart] health-check...');
       const h = await fetch('http://127.0.0.1:3457/health', { signal: AbortSignal.timeout(1000) });
       if (h.ok) {
         const body = await h.json();
         if (body.status === 'ok' && body.title === 'nova-server') {
           debugLog(`[autoStart] nova-server alive (${(performance.now()-t).toFixed(0)}ms)`);
           return;
         }
       }
       debugLog(`[autoStart] port occupied by non-nova-server (${(performance.now()-t).toFixed(0)}ms)`);
       return;
     } catch (e) {
       debugLog(`[autoStart] no response: ${e.message}`);
     }

     // lockfile
     if (existsSync(LOCK_FILE)) {
       if (isLockfileStale()) {
         debugLog('[autoStart] stale lockfile, removing');
         try { unlinkSync(LOCK_FILE); } catch {}
       } else {
         debugLog('[autoStart] valid lockfile, polling...');
         await pollHealth();
         debugLog(`[autoStart] poll done (${(performance.now()-t).toFixed(0)}ms)`);
         return;
       }
     } else {
       debugLog('[autoStart] no lockfile');
     }

     // spawn
     try {
       writeFileSync(LOCK_FILE, String(process.pid));
       const logFd = openSync('/tmp/nova-server.log', 'a');
       const proc = Bun.spawn([join(CLAUDE_DIR, 'bin/nova-server'), join(CLAUDE_DIR, 'hooks/server.js')], {
         stdio: ['ignore', logFd, logFd],
         detached: true,
       });
       proc.unref();
       debugLog(`[autoStart] spawned pid=${proc.pid}`);
       const healthy = await pollHealth({ maxRetries: 5, baseMs: 200 });
       debugLog(`[autoStart] ${healthy ? 'ready' : 'timeout'} (${(performance.now()-t).toFixed(0)}ms)`);
     } finally {
       try { unlinkSync(LOCK_FILE); } catch {}
     }
   }
   ```

3. **確認 nova-server.log 為 append 模式**：現有 `openSync('/tmp/nova-server.log', 'a')` 已是 append，無需修改。

#### 驗收

- [ ] 錯誤恢復路徑中 `autoStart()` 不被 `await`（以 `.catch()` 背景執行）
- [ ] 有 fallback 事件的恢復路徑先呼叫 `tryFallback`，再背景 autoStart
- [ ] 無 fallback 事件只做背景 autoStart
- [ ] autoStart 內每個分支有 debugLog
- [ ] `.catch()` 捕捉背景 autoStart 的所有錯誤（Pre-mortem #1 防護）

---

## Phase 2：測試驗證（依賴 Phase 1）

### Task 2：靜態驗證 + bun test

**執行者**：executor（sonnet）
**檔案**：`~/projects/overtone/tests/unit/hook-client.test.js`

#### 步驟

1. 新增 `describe('dispatch fallback 順序')` 測試群組：
   - 靜態驗證：錯誤恢復路徑中 `autoStart()` 後接 `.catch(`（背景執行模式）
   - 靜態驗證：`tryFallback` 出現在 `autoStart` 之前（有 fallback 時先 fallback）
   - 靜態驗證：autoStart 函式內含至少 5 處 `debugLog`

2. 確認現有測試不受影響：`bun test` exit code 0

#### 驗收

- [ ] 新增測試全部通過
- [ ] 現有測試不受影響
- [ ] `bun test` exit code 0
