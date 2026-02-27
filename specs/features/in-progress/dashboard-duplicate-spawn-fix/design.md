# Design: dashboard-duplicate-spawn-fix

## 技術摘要（What & Why）

- **方案**：以 `execSync` + `curl` 同步 port probe 作為 `isRunning()` 的 fallback 偵測機制，搭配 `OVERTONE_NO_DASHBOARD` 環境變數 early return、server.js EADDRINUSE graceful exit、移除自動開瀏覽器，四層防線消除 Dashboard 重複啟動問題
- **理由**：port probe 直接驗證「port 上是否有 Overtone server 在跑」，比 PID 檔案（可能 stale）更可靠；`execSync` + `curl` 是唯一能在 Node 同步 hook 腳本中做 HTTP 探測的方式（不引入額外依賴）；四層防線互為 fallback，任何一層失效都有下一層兜底
- **取捨**：不實作 lock file 機制（port probe 已足夠可靠，lock 是過度工程）；不處理 PID reuse（process.kill(pid,0) 足夠實用）；`execSync` + `curl` 比純 TCP probe 多 ~50ms 開銷，但 hook 啟動不在熱路徑上，可接受

## API 介面設計

### 修改：pid.js — isRunning()

```javascript
/**
 * 檢查 Dashboard server 是否在執行中
 *
 * 三層偵測策略（前兩層為既有邏輯，第三層為新增）：
 *   1. 讀取 PID 檔案 + process.kill(pid, 0) 驗證進程存在
 *   2. 若 PID 檢查失敗，嘗試 HTTP port probe（GET /health）
 *      — 偵測「server 存活但 PID 檔案 stale/不存在」的情況
 *
 * @param {object} [opts]
 * @param {number} [opts.port] - 要探測的 port（預設 7777）
 * @returns {boolean}
 */
function isRunning(opts) { ... }
```

### 新增：pid.js — probePort()

```javascript
/**
 * 同步 HTTP port probe — 用 execSync + curl 偵測 Overtone server
 *
 * 呼叫 curl GET http://localhost:{port}/health，timeout 1 秒。
 * 解析 JSON 回應，確認 ok === true 才視為 Overtone server。
 * 任何錯誤（timeout、connection refused、非 JSON）回傳 false。
 *
 * @param {number} port - 要探測的 port
 * @returns {boolean} true 表示 port 上有 Overtone server 在跑
 */
function probePort(port) { ... }
```

### 修改：on-start.js — Dashboard spawn 區塊

```javascript
// 新增 OVERTONE_NO_DASHBOARD early return（第 41 行後）
// 在 Dashboard spawn 區塊開頭檢查環境變數

const skipDashboard = process.env.OVERTONE_NO_DASHBOARD;
const port = process.env.OVERTONE_PORT || '7777';

// isRunning 現在接受 opts.port，整合 port probe
const shouldSpawnDashboard = sessionId && !skipDashboard && !dashboardPid.isRunning({ port: parseInt(port, 10) });

// 移除自動開瀏覽器的整個區塊（第 95-103 行）
// 移除 OVERTONE_NO_BROWSER 環境變數檢查
```

### 修改：server.js — Bun.serve() 錯誤處理

```javascript
// 用 try-catch 包住 Bun.serve()
let server;
try {
  server = Bun.serve({ port: PORT, ... });
} catch (err) {
  if (err.code === 'EADDRINUSE' || err.message?.includes('address already in use')) {
    console.error(`[overtone] Port ${PORT} 已被佔用，Dashboard 已有 instance 在執行中`);
    process.exit(0); // graceful exit，不算錯誤
  }
  throw err; // 其他錯誤正常拋出
}

// pid.write() 移到 try-catch 之後（只在成功 bind port 時才寫 PID）
```

### 錯誤處理

| 錯誤情況 | 處理方式 |
|---------|---------|
| probePort() curl 執行失敗（curl 不存在） | catch → 回傳 false（降級為純 PID 檢查） |
| probePort() curl timeout（server 沒回應） | catch → 回傳 false |
| probePort() 回應非 JSON 或非 Overtone | catch → 回傳 false |
| server.js port 衝突（EADDRINUSE） | stderr 提示 + process.exit(0) |
| OVERTONE_NO_DASHBOARD=1 | 跳過 Dashboard spawn + 瀏覽器，banner 正常輸出 |

## 資料模型

無新增資料模型。`dashboard.json` 格式不變：

```typescript
interface DashboardInfo {
  pid: number       // server 進程 PID
  port: number      // 監聽 port
  startedAt: string // ISO 8601 啟動時間
}
```

儲存位置：`~/.overtone/dashboard.json`（既有，不變）

## 檔案結構

```
修改的檔案：
  plugins/overtone/scripts/lib/dashboard/pid.js    ← 修改：isRunning() 增加 port probe fallback、新增 probePort()
  plugins/overtone/hooks/scripts/session/on-start.js ← 修改：OVERTONE_NO_DASHBOARD early return、移除自動開瀏覽器、isRunning() 傳入 port
  plugins/overtone/scripts/server.js               ← 修改：Bun.serve() try-catch + EADDRINUSE graceful exit
  tests/integration/dashboard-pid.test.js          ← 修改：擴充 isRunning + probePort 測試場景
  tests/integration/session-start.test.js          ← 修改：擴充 OVERTONE_NO_DASHBOARD 場景
  tests/helpers/hook-runner.js                     ← 修改：移除 OVERTONE_NO_BROWSER（已刪除該環境變數）

新增的檔案：
  （無新增檔案 — 所有改動在既有檔案中）
```

## 關鍵技術決策

### 決策 1：port probe 的同步實作方式 — 選擇 (a) `execSync` + `curl`

- **選項 A**（選擇）：`child_process.execSync('curl ...')` — 優點：(1) on-start.js 是 `#!/usr/bin/env node` 同步腳本，`execSync` 是唯一能在同步 context 中取得 HTTP 結果的方式 (2) curl 在 macOS 內建，無需安裝 (3) 可設定 `--connect-timeout 1 --max-time 1` 控制超時 (4) 解析 `/health` 端點的 JSON 回應可確認是 Overtone server（不只是任意佔 port 的程序） (5) 失敗時 catch 回傳 false，降級為純 PID 檢查，不影響既有行為
- **選項 B**（未選）：Node `net.connect` TCP probe — 原因：`net.connect` 是非同步的，需要 `new net.Socket()` + event listener，無法在同步函式中取得結果。即使用 `execSync('node -e "..."')` 包一層也比直接 curl 更複雜且不可靠
- **選項 C**（未選）：Node `http.request` 同步包裝 — 原因：Node 的 http 模組沒有同步 API。任何同步包裝方案（如 deasync）都引入額外依賴，違反專案最小依賴原則
- **選項 D**（未選）：將 on-start.js 改為非同步 — 原因：ECC hook 腳本要求同步執行（stdout JSON 輸出），改為 async 需要重構整個 hook 架構，超出本次範圍

### 決策 2：lock file 機制 — 不實作（刪除 T6）

- **理由**：port probe + OVERTONE_NO_DASHBOARD + server.js graceful exit 已形成三層防線。lock file 的價值僅在「spawn 後 server 尚未 bind port 前」的 ~200ms 窗口，但此窗口中 (1) 第二個 session 的 on-start.js 不太可能恰好在這 200ms 內執行 (2) 即使發生，server.js 的 EADDRINUSE graceful exit 會兜底。lock file 增加的複雜度（過期清理、race condition 自身的 lock）超過收益。
- **Planner 原始標記**：T6 為 should（軟引導），非 MUST

### 決策 3：server.js port 衝突的 exit code — 選擇 `process.exit(0)`

- **選項 A**（選擇）：`process.exit(0)` — 優點：port 衝突代表「已有 Dashboard 在跑」，這是正常情況而非錯誤。exit(0) 不會在 on-start.js 的 spawn 中產生告警。on-start.js 用 `detached: true, stdio: 'ignore'` spawn server，不讀取 child 的 exit code，但語意上 0 更正確
- **選項 B**（未選）：`process.exit(1)` — 原因：暗示錯誤發生，但實際上只是「已有 instance 在跑」的正常情況

### 決策 4：移除 OVERTONE_NO_BROWSER 環境變數 — 直接刪除

- **理由**：移除自動開瀏覽器後，OVERTONE_NO_BROWSER 不再有任何用途。搜尋 codebase 後確認只有 3 處使用：(1) on-start.js 第 97 行（將被刪除的開瀏覽器區塊）(2) session-start.test.js 第 52 行（設定環境變數）(3) proposal.md（文件描述）。按專案「不做向後相容」原則直接刪除
- **影響**：session-start.test.js 中的 `OVERTONE_NO_BROWSER: '1'` 行移除（該測試本身已設定 `OVERTONE_NO_DASHBOARD` 或其他方式阻止 spawn，不依賴此變數）

### 決策 5：probePort() 的偵測目標 — 選擇 /health 端點

- **理由**：GET /health 回傳 `{ ok: true, ... }`，可確認是 Overtone server 而非任意佔 port 的程序。如果用純 TCP connect，無法區分 Overtone 和其他 HTTP server

## 實作注意事項

### probePort() 的 execSync 指令

```javascript
// 實際 curl 指令（timeout 1 秒，silent mode）
const result = execSync(
  `curl -s --connect-timeout 1 --max-time 1 http://localhost:${port}/health`,
  { encoding: 'utf8', timeout: 2000 }
);
const data = JSON.parse(result);
return data.ok === true;
```

要點：
- `--connect-timeout 1`：TCP 連接超時 1 秒
- `--max-time 1`：整體請求超時 1 秒
- `-s`：silent mode，不輸出進度
- `encoding: 'utf8'`：直接取得字串結果
- `timeout: 2000`：Node execSync 的 overall timeout（比 curl 多 1 秒容錯）
- 整個 probePort() 用 try-catch 包裹，任何異常回傳 false

### isRunning() 的呼叫順序

```
1. 讀 PID 檔案 → 有 PID → process.kill(pid, 0) → 進程存在 → return true
2. PID 檔案不存在或進程不存在 → probePort(port) → port 有 Overtone → return true
3. probePort 也失敗 → return false（清理 stale PID 檔案）
```

### on-start.js 修改後的完整 Dashboard spawn 區塊

```javascript
// ── Dashboard spawn ──

const dashboardPid = require('../../../scripts/lib/dashboard/pid');
const port = process.env.OVERTONE_PORT || '7777';

// OVERTONE_NO_DASHBOARD=1 完全跳過 Dashboard spawn（測試環境使用）
const skipDashboard = process.env.OVERTONE_NO_DASHBOARD;
const shouldSpawnDashboard = sessionId
  && !skipDashboard
  && !dashboardPid.isRunning({ port: parseInt(port, 10) });

if (shouldSpawnDashboard) {
  try {
    const { spawn: spawnChild } = require('child_process');
    const serverPath = path.join(__dirname, '../../../scripts/server.js');
    const child = spawnChild('bun', ['run', serverPath], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, OVERTONE_PORT: port },
    });
    child.unref();
  } catch (err) {
    console.error(`[overtone] Dashboard 啟動失敗: ${err.message}`);
  }
}

// 自動開瀏覽器的區塊已移除（banner URL 提示已足夠）
```

### hook-runner.js 的影響

`tests/helpers/hook-runner.js` 的 `buildEnv()` 已設定 `OVERTONE_NO_DASHBOARD: '1'`。移除 OVERTONE_NO_BROWSER 後不影響其功能。`session-start.test.js` 的 `runHook()` 也設定了 `OVERTONE_NO_BROWSER`，移除後需同步清理（但因為 on-start.js 不再檢查該變數，殘留也無害 — 仍建議清理以維持程式碼衛生）。

### server.js 的 Bun.serve() 錯誤偵測

Bun.serve() 在 port 衝突時的行為：throw Error with `code: 'EADDRINUSE'` 或 message 含 `address already in use`。需要同時檢查兩者以確保可靠偵測。pid.write() 必須在 Bun.serve() 成功後才執行（既有程式碼已是此順序，但需確保 try-catch 不打斷此語意）。

### 現有 588 個測試不可 break

所有修改完成後必須執行 `bun test` 確認所有現有測試通過。本次修改均為行為增強（新增 fallback 偵測、新增 early return、新增 error handling），不改變正常路徑的行為。
