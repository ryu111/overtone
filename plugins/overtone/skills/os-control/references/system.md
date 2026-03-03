# 系統層（P3.3）

Overtone 系統層提供 macOS 環境下的 Process 管理、剪貼簿讀寫、系統資訊查詢、通知推送、檔案系統監控能力。
Agent 可以透過這些 API 管理系統資源、傳遞資料、監控環境變化，實現自主系統控制。

---

## API Reference

### process.js — Process 管理模組

位置：`plugins/overtone/scripts/os/process.js`

所有函式的最後一個參數 `_deps` 供測試注入使用，正常呼叫時可省略。

#### `listProcesses(_deps?)`

列出所有執行中的 Process（系統資源導向，提供 CPU/記憶體使用率）。

```javascript
const { listProcesses } = require('./plugins/overtone/scripts/os/process');

const result = listProcesses();
// => {
//   ok: true,
//   processes: [
//     { pid: 1234, name: 'node', cpu: 5.2, mem: 1.3, started: '14:30' },
//     { pid: 5678, name: 'Safari', cpu: 12.0, mem: 8.5, started: 'Mar 03' },
//   ]
// }
```

**回傳**：
- 成功：`{ ok: true, processes: Array<{ pid: number, name: string, cpu: number, mem: number, started: string }> }`
- 失敗：`{ ok: false, error: 'UNSUPPORTED_PLATFORM'|'COMMAND_FAILED'|'PARSE_ERROR', message: string }`

> 注意：此函式使用 Unix `ps` 指令（系統資源維度），與 `window.js` 的 `listProcesses`（GUI 維度，回傳 `visible` 欄位）不同。

---

#### `startProcess(command, args?, _deps?)`

啟動一個獨立的背景 Process（detached + unref）。

```javascript
const { startProcess } = require('./plugins/overtone/scripts/os/process');

const result = startProcess('node', ['--version']);
// => { ok: true, pid: 12345 }
```

**參數**：
- `command` (string, 必填)：要執行的指令
- `args` (string[], 選填)：指令參數，預設 `[]`

**回傳**：
- 成功：`{ ok: true, pid: number }`
- 失敗：`{ ok: false, error: 'UNSUPPORTED_PLATFORM'|'INVALID_ARGUMENT'|'COMMAND_FAILED', message: string }`

---

#### `killProcess(pid, signal?, _deps?)`

終止指定 PID 的 Process。**內建安全邊界**。

```javascript
const { killProcess } = require('./plugins/overtone/scripts/os/process');

const result = killProcess(9999);
// => { ok: true }

// 使用 SIGKILL 強制終止
const result2 = killProcess(9999, 'SIGKILL');
// => { ok: true }
```

**參數**：
- `pid` (number, 必填)：目標 Process ID
- `signal` (string, 選填)：發送的信號，預設 `'SIGTERM'`。允許值：`SIGTERM`、`SIGKILL`、`SIGINT`

**安全邊界**：
- 拒絕 PID <= 1（保護 init/kernel）
- 拒絕 PID === process.pid（防止自殺）
- Signal 白名單：僅允許 SIGTERM / SIGKILL / SIGINT

**回傳**：
- 成功：`{ ok: true }`
- 失敗：`{ ok: false, error: 'UNSUPPORTED_PLATFORM'|'INVALID_ARGUMENT'|'COMMAND_FAILED', message: string }`

---

### clipboard.js — 剪貼簿讀寫模組

位置：`plugins/overtone/scripts/os/clipboard.js`

#### `readClipboard(_deps?)`

讀取 macOS 剪貼簿內容。

```javascript
const { readClipboard } = require('./plugins/overtone/scripts/os/clipboard');

const result = readClipboard();
// => { ok: true, content: 'Hello, World!' }

// 剪貼簿為空時
const result2 = readClipboard();
// => { ok: true, content: '' }
```

**回傳**：
- 成功：`{ ok: true, content: string }`
- 失敗：`{ ok: false, error: 'UNSUPPORTED_PLATFORM'|'COMMAND_FAILED', message: string }`

---

#### `writeClipboard(text, _deps?)`

寫入文字到 macOS 剪貼簿。

```javascript
const { writeClipboard } = require('./plugins/overtone/scripts/os/clipboard');

const result = writeClipboard('要複製的文字');
// => { ok: true }
```

**參數**：
- `text` (string, 必填)：要寫入的文字

**回傳**：
- 成功：`{ ok: true }`
- 失敗：`{ ok: false, error: 'UNSUPPORTED_PLATFORM'|'INVALID_ARGUMENT'|'COMMAND_FAILED', message: string }`

---

### system-info.js — 系統資訊查詢模組

位置：`plugins/overtone/scripts/os/system-info.js`

#### `getCpuUsage(_deps?)`

取得即時 CPU 使用率。

```javascript
const { getCpuUsage } = require('./plugins/overtone/scripts/os/system-info');

const result = getCpuUsage();
// => { ok: true, cpu: { user: 12.5, sys: 5.3, idle: 82.2 } }
```

**回傳**：
- 成功：`{ ok: true, cpu: { user: number, sys: number, idle: number } }`（百分比，浮點數）
- 失敗：`{ ok: false, error: 'UNSUPPORTED_PLATFORM'|'COMMAND_FAILED'|'PARSE_ERROR', message: string }`

---

#### `getMemoryInfo(_deps?)`

取得記憶體使用資訊。

```javascript
const { getMemoryInfo } = require('./plugins/overtone/scripts/os/system-info');

const result = getMemoryInfo();
// => {
//   ok: true,
//   memory: {
//     totalMB: 16384,      // 16 GB
//     freeMB: 71.5,        // 空閒頁面
//     wiredMB: 1024,       // 系統核心佔用
//     activeMB: 2048,      // 使用中
//     inactiveMB: 512      // 閒置但快取
//   }
// }
```

**回傳**：
- 成功：`{ ok: true, memory: { totalMB, freeMB, wiredMB, activeMB, inactiveMB } }`（MB，數值型）
- 失敗：`{ ok: false, error: 'UNSUPPORTED_PLATFORM'|'COMMAND_FAILED'|'PARSE_ERROR', message: string }`

---

#### `getDiskInfo(mountPoint?, _deps?)`

取得磁碟使用資訊。

```javascript
const { getDiskInfo } = require('./plugins/overtone/scripts/os/system-info');

// 查詢根目錄
const result = getDiskInfo();
// => {
//   ok: true,
//   disks: [{
//     device: '/dev/disk3s1s1',
//     mountPoint: '/',
//     totalGB: 500,
//     usedGB: 250,
//     availableGB: 200,
//     usedPercent: 56
//   }]
// }

// 查詢特定掛載點
const result2 = getDiskInfo('/System/Volumes/Data');
```

**參數**：
- `mountPoint` (string, 選填)：掛載點，預設 `'/'`

**回傳**：
- 成功：`{ ok: true, disks: Array<{ device, mountPoint, totalGB, usedGB, availableGB, usedPercent }> }`
- 失敗：`{ ok: false, error: 'UNSUPPORTED_PLATFORM'|'COMMAND_FAILED'|'PARSE_ERROR', message: string }`

---

#### `getNetworkInfo(_deps?)`

取得網路介面資訊。

```javascript
const { getNetworkInfo } = require('./plugins/overtone/scripts/os/system-info');

const result = getNetworkInfo();
// => {
//   ok: true,
//   interfaces: [
//     { name: 'lo0', status: 'unknown', ipv4: '127.0.0.1', ipv6: '::1' },
//     { name: 'en0', status: 'active', ipv4: '192.168.1.100', ipv6: 'fe80::...' },
//     { name: 'en1', status: 'inactive' }
//   ]
// }
```

**回傳**：
- 成功：`{ ok: true, interfaces: Array<{ name, status: 'active'|'inactive'|'unknown', ipv4?, ipv6? }> }`
- 失敗：`{ ok: false, error: 'UNSUPPORTED_PLATFORM'|'COMMAND_FAILED'|'PARSE_ERROR', message: string }`

> 注意：loopback (lo0) 的 `status` 回傳 `'unknown'`，因為 `ifconfig` 不輸出 lo0 的 status 行。

---

### notification.js — macOS 通知模組

位置：`plugins/overtone/scripts/os/notification.js`

#### `sendNotification(opts, _deps?)`

發送 macOS 系統通知。

```javascript
const { sendNotification } = require('./plugins/overtone/scripts/os/notification');

// 基本通知
const result = sendNotification({ title: '任務完成', message: 'P3.3 已部署' });
// => { ok: true }

// 完整通知（含副標題和音效）
const result2 = sendNotification({
  title: '警告',
  message: '磁碟空間不足',
  subtitle: '系統通知',
  sound: true
});
// => { ok: true }
```

**參數**：
- `opts.title` (string, 必填)：通知標題
- `opts.message` (string, 必填)：通知內文
- `opts.subtitle` (string, 選填)：副標題，顯示在 title 下方
- `opts.sound` (boolean, 選填)：是否播放音效，預設 `false`

**回傳**：
- 成功：`{ ok: true }`
- 失敗：`{ ok: false, error: 'UNSUPPORTED_PLATFORM'|'INVALID_ARGUMENT'|'COMMAND_FAILED', message: string }`

---

### fswatch.js — 檔案系統監控模組

位置：`plugins/overtone/scripts/os/fswatch.js`

使用 `fs.watch()` 原生 API 監控檔案/目錄變更。module-level Map 管理 watcher 狀態。

#### `watchPath(targetPath, callback, _deps?)`

開始監控指定路徑。

```javascript
const { watchPath } = require('./plugins/overtone/scripts/os/fswatch');

const result = watchPath('/tmp/my-dir', (event) => {
  console.log(`${event.eventType}: ${event.filename} at ${event.timestamp}`);
});
// => { ok: true, watcherId: '1709500000000-abc123' }
```

**參數**：
- `targetPath` (string, 必填)：要監控的檔案或目錄路徑
- `callback` (function, 必填)：事件回呼，接收 WatchEvent 物件

**WatchEvent 結構**：
```javascript
{
  watcherId: string,     // 監控器 ID
  path: string,          // 監控的路徑
  eventType: 'change' | 'rename',  // fs.watch 原生事件類型
  filename: string|null, // 變更的檔案名稱
  timestamp: string      // ISO 8601 時間戳
}
```

**回傳**：
- 成功：`{ ok: true, watcherId: string }`
- 失敗：`{ ok: false, error: 'UNSUPPORTED_PLATFORM'|'INVALID_ARGUMENT'|'COMMAND_FAILED', message: string }`

---

#### `stopWatch(watcherId)`

停止指定的監控器。

```javascript
const { stopWatch } = require('./plugins/overtone/scripts/os/fswatch');

const result = stopWatch('1709500000000-abc123');
// => { ok: true }
```

**參數**：
- `watcherId` (string, 必填)：watchPath 回傳的 watcherId

**回傳**：
- 成功：`{ ok: true }`
- 失敗：`{ ok: false, error: 'WATCHER_NOT_FOUND', message: string }`

> 注意：stopWatch 不需要 platform guard — 它是純記憶體操作。

---

#### `listWatchers()`

列出所有活躍的監控器。

```javascript
const { listWatchers } = require('./plugins/overtone/scripts/os/fswatch');

const result = listWatchers();
// => {
//   ok: true,
//   watchers: [
//     { id: '1709500000000-abc123', path: '/tmp/dir-a', startedAt: '2026-03-04T00:00:00.000Z' },
//     { id: '1709500001000-def456', path: '/tmp/dir-b', startedAt: '2026-03-04T00:00:01.000Z' },
//   ]
// }
```

**回傳**：
- 永遠成功：`{ ok: true, watchers: Array<{ id, path, startedAt }> }`

> 注意：listWatchers 永遠成功，不需要 platform guard。

---

## process.listProcesses vs window.listProcesses

兩者共存，提供不同維度的資訊：

| 維度 | process.listProcesses | window.listProcesses |
|------|----------------------|---------------------|
| 來源指令 | Unix `ps -axo ...` | AppleScript System Events |
| 回傳欄位 | pid, name, cpu, mem, started | pid, name, visible |
| 適用場景 | 系統資源監控（CPU/記憶體使用率） | GUI 導向（確認 App 是否在運行、是否可見） |

### 選擇指南

| 情境 | 使用哪個 |
|------|---------|
| 確認某 App 是否在運行（GUI 層） | `window.listProcesses()` |
| 查看系統資源使用率（CPU/記憶體） | `process.listProcesses()` |
| 找出高 CPU 使用率的 Process | `process.listProcesses()` |
| 確認 App 是否在前景 | `window.getFrontApp()` |

---

## 完整工作流範例

### 系統監控 → 通知

```javascript
const { getCpuUsage, getMemoryInfo } = require('./system-info');
const { sendNotification } = require('./notification');

// 檢查系統狀態
const cpu = getCpuUsage();
const mem = getMemoryInfo();

if (cpu.ok && cpu.cpu.idle < 10) {
  sendNotification({
    title: '系統警告',
    message: `CPU 使用率過高（idle: ${cpu.cpu.idle}%）`,
    subtitle: '效能警告',
    sound: true
  });
}
```

### 剪貼簿資料傳遞

```javascript
const { readClipboard, writeClipboard } = require('./clipboard');

// 讀取 → 處理 → 寫回
const read = readClipboard();
if (read.ok) {
  const processed = read.content.toUpperCase();
  writeClipboard(processed);
}
```

### 檔案監控 → 事件處理

```javascript
const { watchPath, stopWatch, listWatchers } = require('./fswatch');
const { sendNotification } = require('./notification');

// 開始監控
const watch = watchPath('/tmp/important-dir', (event) => {
  sendNotification({
    title: '檔案變更',
    message: `${event.eventType}: ${event.filename}`,
    subtitle: event.path,
  });
});

// 查看活躍監控器
const list = listWatchers();
console.log(`目前有 ${list.watchers.length} 個監控器`);

// 停止監控
if (watch.ok) {
  stopWatch(watch.watcherId);
}
```

---

## 共同模式

所有 P3.3 腳本遵循統一的設計模式：

1. **平台守衛**：`process.platform !== 'darwin'` → `UNSUPPORTED_PLATFORM`
2. **依賴注入**：`_deps = { execSync }` 或 `_deps = { watch }`，供測試替換
3. **不 throw**：所有錯誤以 `{ ok: false, error, message }` 回傳
4. **Error Codes**：`UNSUPPORTED_PLATFORM`、`INVALID_ARGUMENT`、`COMMAND_FAILED`、`PARSE_ERROR`、`WATCHER_NOT_FOUND`
