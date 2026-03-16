# 修復 dispatch 恢復機制 -- 技術設計

## 深度路由：D3
**理由**：修改 hook-client.js autoStart 涉及 security-critical 路徑（PreToolUse:Bash guard），需 reviewer 審查 race condition 和 fallback 完整性。

---

## 技術摘要

- **方案**：在現有 autoStart 流程中加入 PID 存活檢查清除陳舊 lockfile + 增加 pollHealth 容量 + server 加 SIGTERM handler
- **理由**：最小改動解決三個獨立問題，不重構現有架構
- **取捨**：pollHealth 最壞情況從 3.2 秒增到 6.2 秒，換取 server 多模組 import 的啟動容忍度

## 方案比較

| 維度 | 方案 A：PID 檢查 + pollHealth 增容（選擇） | 方案 B：lockfile 改 advisory lock (flock) |
|------|:-------------------------------------------:|:-----------------------------------------:|
| 複雜度 | 低（加 1 個函式 + 改 1 個參數） | 中（需 flock binding 或 child_process） |
| 跨平台 | process.kill(pid,0) 是 POSIX 標準 | flock 在 macOS/Linux 行為有差異 |
| 防護完整性 | PID 檢查 + EPERM 保守 + port 衝突雙防線 | advisory lock 自動釋放，但需額外 fd 管理 |
| 風險 | PID 重用理論上可能（機率極低） | flock 在 Bun 中支援未驗證 |
| **結論** | 選擇：簡單有效，雙防線足夠 | 不選：引入未驗證依賴，收益不大 |

## 模組介面

### 修改檔案

| # | 檔案 | 變更內容 |
|---|------|---------|
| 1 | `~/.claude/hooks/hook-client.js` | 新增 isLockfileStale() + autoStart 中呼叫 + pollHealth spawn 後 maxRetries 改 5 |
| 2 | `~/.claude/hooks/server.js` | 新增 SIGTERM/SIGINT handler 呼叫 gracefulShutdown() |
| 3 | `~/projects/overtone/tests/unit/hook-client.test.js` | 新增 isLockfileStale 測試 + pollHealth 參數測試 + SIGTERM handler 測試 |

### API 設計

#### isLockfileStale(): boolean

```javascript
// 純函式，讀取 LOCK_FILE → 檢查 PID → 回傳 true（陳舊）/ false（有效）
// 錯誤處理：
//   ESRCH → true（進程不存在）
//   EPERM → false（進程存在但無權限，保守）
//   讀檔失敗 / NaN → true（損壞）
```

#### gracefulShutdown(signal: string): void

```javascript
// server.js 內部函式
// 1. console.log(`[server] ${signal} received, shutting down...`)
// 2. stopHeartbeatLoop()（try-catch 包裹）
// 3. process.exit(0)
```

## 資料模型

- 儲存格式：純文字（PID 數字）
- 儲存位置：`/tmp/nova-server.lock`（現有不變）
- 清理策略：autoStart 成功/失敗後 finally 清除；新增 isLockfileStale 清除陳舊

## 執行步驟

### Phase 1：hook-client.js 修改（sequential）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 1a | `~/.claude/hooks/hook-client.js` | 新增 `isLockfileStale()` 函式（readFileSync + parseInt + process.kill(pid,0)） |
| 1b | `~/.claude/hooks/hook-client.js` | autoStart 中 `if (existsSync(LOCK_FILE))` 分支加入 isLockfileStale 判斷：陳舊 → unlinkSync → 繼續 spawn |
| 1c | `~/.claude/hooks/hook-client.js` | spawn 後 `pollHealth()` 呼叫改為 `pollHealth({ maxRetries: 5, baseMs: 200 })` |

### Phase 2：server.js 修改（parallel with Phase 1）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 2a | `~/.claude/hooks/server.js` | 新增 `gracefulShutdown(signal)` 函式 |
| 2b | `~/.claude/hooks/server.js` | 在 uncaughtException handler 之前加 `process.on('SIGTERM', ...)` 和 `process.on('SIGINT', ...)` |

### Phase 3：測試（依賴 Phase 1 + 2）

| 步驟 | 檔案 | 說明 |
|------|------|------|
| 3a | `tests/unit/hook-client.test.js` | isLockfileStale 邏輯測試（PID 死亡 / PID 存活 / NaN / 空 / EPERM） |
| 3b | `tests/unit/hook-client.test.js` | pollHealth spawn 後 maxRetries=5 靜態驗證 |
| 3c | `tests/unit/hook-client.test.js` | server.js SIGTERM handler 存在性靜態驗證 |
| 3d | 全部 | `bun test` 驗證 0 fail |

## Pre-mortem

| # | 失敗情境 | 機率 | 影響 | 預防措施 |
|---|---------|:----:|:----:|---------|
| 1 | isLockfileStale 因 PID 重用誤判陳舊 → 2 個 server spawn | 低 | 中 | Bun.serve port 衝突是第二道防線，第二個 spawn 自動失敗不 crash |
| 2 | SIGTERM handler 中 stopHeartbeatLoop 拋異常 → process.exit 不執行 | 低 | 中 | try-catch 包裹 stopHeartbeatLoop，finally process.exit(0) |
| 3 | pollHealth 6.2 秒不夠 server 啟動 | 低 | 低 | server 啟動通常 1-2 秒（已測量），6.2 秒是 3 倍餘量；失敗走 fallback |
| 4 | readFileSync(LOCK_FILE) 在 autoStart 和 isLockfileStale 之間被刪除 | 低 | 低 | isLockfileStale 內 try-catch 處理讀檔失敗 → return true → 正常進入 spawn |

## 測試策略

| 測試檔案 | 驗收條件 |
|---------|---------|
| `tests/unit/hook-client.test.js` | isLockfileStale 5 個案例全通過 |
| `tests/unit/hook-client.test.js` | pollHealth spawn 後 maxRetries=5 靜態驗證通過 |
| `tests/unit/hook-client.test.js` | server.js 含 SIGTERM handler 靜態驗證通過 |
| `tests/unit/hook-client.test.js` | 現有 E2E 測試（block/allow）不受影響 |

## 不做什麼

1. **不用 flock**：Bun 對 advisory lock 支援未驗證，PID 檢查 + port 衝突雙防線已足夠
2. **不加自動重啟機制**：server 被 kill 後由 hook-client autoStart 按需重啟，不做 supervisor 模式（增加複雜度但 nova-server 非 mission-critical 常駐服務，有 fallback 保底）
3. **不改 error-analyzer**：前一輪 fix-dispatch-error 已處理自癒分類
4. **不追查 SIGTERM 來源**：本次只加診斷日誌，收集資料後再分析
