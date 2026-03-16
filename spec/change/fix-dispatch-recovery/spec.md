# 修復 dispatch 恢復機制（陳舊 lockfile + SIGTERM 無日誌）

## 動機（Why）

- **問題**：nova-server 被外部 SIGTERM kill 後，hook-client autoStart 無法恢復 server。根因有二：(1) 先前 hook-client 被 kill 留下的陳舊 lockfile 阻擋 spawn，pollHealth 只 poll 不 spawn 白等 3.2 秒；(2) server.js 無 SIGTERM handler，被 kill 無日誌無法追蹤原因。二者共同導致 1-5 秒的 dispatch 失敗窗口，觀測型事件（PostToolUse 等）丟失。
- **目標**：(1) autoStart 能清除陳舊 lockfile 恢復 spawn；(2) server 被 SIGTERM 時記錄 shutdown 原因；(3) pollHealth 等待時間適配 server 啟動耗時。
- **不做的代價**：每次 server 被 kill 後 dispatch 恢復延遲/失敗 → error-analyzer 建假 P1 → heartbeat 嘗試修復 → 可能再 kill server → 遞迴循環。

## 範圍

### In-scope

- hook-client.js autoStart：陳舊 lockfile PID 存活檢查 + 清除
- hook-client.js pollHealth：增加 spawn 後的等待容量（適配 server 多模組 import 耗時）
- server.js：SIGTERM/SIGINT handler（graceful shutdown + 日誌）
- overtone repo 測試：覆蓋新邏輯

### Out-of-scope

- 不改 dispatch 路由邏輯
- 不改 guards.js fallback 機制
- 不改 error-analyzer.js（前一輪 fix-dispatch-error 已處理）
- 不追查 SIGTERM 來源（本次只加診斷能力，原因待日誌收集後分析）
- 不改 heartbeat loop 邏輯

## 使用者故事

身為 nova 系統的 Main Agent，我希望 nova-server 被 kill 後 hook-client 能在下一次 hook 觸發時自動恢復 server，以便 dispatch 失敗窗口從「直到人工介入」縮短到「單次 hook 延遲 5 秒內」。

## 行為規格

### 正常路徑

1. hook-client dispatch 失敗 → 呼叫 autoStart()
2. autoStart 檢查 /health → 無回應 → port 空閒
3. 檢查 lockfile → 存在 → 讀取 PID → `process.kill(pid, 0)` 檢查存活
4. PID 已死亡 → 清除陳舊 lockfile → 繼續 spawn
5. 寫入新 lockfile（當前 PID）→ spawn nova-server
6. pollHealth 指數退避等待（200+400+800+1600+3200=6200ms）→ server 就緒
7. retry dispatch 成功

### 錯誤路徑

| 錯誤情境 | 預期行為 |
|---------|---------|
| lockfile PID 仍存活（另一個 hook-client 正在啟動） | 不清除 lockfile → pollHealth 等待 server 就緒 |
| lockfile 內容不是合法 PID（損壞） | 視為陳舊 → 清除 → 繼續 spawn |
| process.kill(pid, 0) 拋 EPERM（PID 存在但非自己的） | 視為存活 → 不清除（保守策略，避免誤殺） |
| server 啟動超過 6.2 秒 | pollHealth 失敗 → 走 fallback → 下次 hook 觸發時 server 已就緒 |
| SIGTERM 送達 server | 記錄 "[server] SIGTERM received, shutting down..." → 停止 heartbeat → process.exit(0) |
| SIGINT 送達 server | 同 SIGTERM 處理 |

### 邊界條件

- lockfile 存在但內容為空 → parseInt 得 NaN → isNaN 判定 → 視為陳舊清除
- 2 個 hook-client 同時觸發 autoStart → 第一個寫 lockfile 成功 spawn；第二個看到 lockfile + PID 存活 → pollHealth 等待
- server 被 SIGTERM 同時有進行中的 dispatch 請求 → Bun.serve 的 graceful shutdown 會完成進行中請求

## 資料模型

### 輸入

N/A（不新增資料結構）

### 輸出

N/A（不新增資料結構）

### 儲存

- `/tmp/nova-server.lock`：內容為啟動者的 PID（現有格式不變）
- `/tmp/nova-server.log`：新增 SIGTERM/SIGINT 的 shutdown 日誌行

## 介面契約

### hook-client.js autoStart（內部函式）

```javascript
// 新增：isLockfileStale() — 檢查 lockfile PID 存活
function isLockfileStale() {
  try {
    const pid = parseInt(readFileSync(LOCK_FILE, 'utf-8').trim());
    if (isNaN(pid)) return true; // 損壞的 lockfile
    process.kill(pid, 0);        // 不送 signal，只檢查存活
    return false;                 // PID 存活，lockfile 有效
  } catch (e) {
    if (e.code === 'ESRCH') return true;  // No such process → 陳舊
    if (e.code === 'EPERM') return false;  // 存在但無權限 → 保守視為存活
    return true; // 其他錯誤（讀檔失敗等）→ 視為陳舊
  }
}
```

### hook-client.js pollHealth（參數調整）

```javascript
// spawn 後呼叫：增加 maxRetries 到 5，總等待 200+400+800+1600+3200=6200ms
await pollHealth({ maxRetries: 5, baseMs: 200 });

// lockfile 等待（另一個 hook-client 正在啟動）：維持 4 次
await pollHealth({ maxRetries: 4, baseMs: 200 });
```

### server.js SIGTERM handler

```javascript
function gracefulShutdown(signal) {
  console.log(`[server] ${signal} received, shutting down...`);
  stopHeartbeatLoop();
  process.exit(0);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

## 非功能需求

| 維度 | 要求 |
|------|------|
| 效能 | spawn 後 pollHealth 最壞 6.2 秒（從 3.2 秒增加），僅 server 未啟動時觸發 |
| 安全 | autoStart lockfile 清除使用 PID 存活檢查，EPERM 保守不清除避免誤殺正在啟動的 server |
| 安全 | SIGTERM handler 不影響 fallback 路徑（guard 防護持續有效） |

## 依賴

| 方向 | 模組 | 說明 |
|------|------|------|
| 修改 | `~/.claude/hooks/hook-client.js` | autoStart + pollHealth |
| 修改 | `~/.claude/hooks/server.js` | SIGTERM handler |
| 上游 | nova-server | autoStart 的啟動目標 |
| 上游 | guards.js | fallback 模組（不修改） |
| 下游 | /tmp/nova-server.log | SIGTERM shutdown 日誌寫入 |

## 驗收標準

- [ ] autoStart 遇到陳舊 lockfile（PID 已死亡）時清除並繼續 spawn
- [ ] autoStart 遇到有效 lockfile（PID 存活）時不清除，走 pollHealth
- [ ] lockfile 內容非法（空、非數字）時視為陳舊清除
- [ ] EPERM 錯誤時保守不清除 lockfile
- [ ] spawn 後 pollHealth 總等待時間 >= 6 秒
- [ ] server.js 有 SIGTERM 和 SIGINT handler
- [ ] SIGTERM handler 呼叫 stopHeartbeatLoop() 後 exit
- [ ] SIGTERM handler 寫入 /tmp/nova-server.log
- [ ] `bun test` 全部通過（含新增測試）
- [ ] fallback 路徑不受影響（dispatch 失敗仍走 evaluateBash）

## 風險

| 風險 | 機率 | 影響 | 緩解策略 |
|------|:----:|:----:|---------|
| isLockfileStale 誤判存活 PID 為陳舊 → 2 個 server 同時啟動 | 低 | 中 | EPERM 保守視為存活；Bun.serve port 衝突自動報錯（第二道防線） |
| pollHealth 6.2 秒太長影響首次 hook 延遲 | 低 | 低 | 僅 server 完全 down 時觸發，正常 session server 已在跑 |
| SIGTERM handler 中 stopHeartbeatLoop 拋異常 | 低 | 低 | try-catch 包裹，確保 process.exit 仍執行 |
| process.kill(pid, 0) 在某些 OS 行為不同 | 低 | 低 | 只在 macOS/Linux 使用（nova 唯一環境），POSIX 標準行為 |
