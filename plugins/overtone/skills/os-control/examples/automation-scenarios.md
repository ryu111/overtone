# macOS 自動化場景範例集

> 四個實際場景，展示 Overtone 感知層（P3.1）和系統層（P3.3）API 的組合運用。

---

## 場景 1：截圖 + 視覺分析

### 需求

確認 Dashboard 是否正常運行，偵測螢幕上的錯誤訊息或異常狀態。

### 使用的 API

screenshot.js: `checkPermission()`, `captureFullScreen()`
window.js: `getFrontApp()`

### 程式碼片段

```javascript
const { checkPermission, captureFullScreen } = require('./plugins/overtone/scripts/os/screenshot');
const { getFrontApp } = require('./plugins/overtone/scripts/os/window');

// 步驟 1：權限檢查
const perm = checkPermission();
if (!perm.ok || !perm.hasPermission) {
  console.error('需要 Screen Recording 權限');
  process.exit(1);
}

// 步驟 2：確認前景 App + 截圖
const front = getFrontApp();
console.log(`前景: ${front.app} — ${front.window}`);

const shot = captureFullScreen();
// => { ok: true, path: '/tmp/overtone-screenshots/screenshot-full-20260304-...png', type: 'full' }

// 步驟 3：Agent 使用 Read tool 讀取圖片，輸出結構化分析
// 若偵測到錯誤（如 "Connection refused"），觸發修復流程
```

### 預期結果

- `captureFullScreen()` 產生 PNG 截圖到 `/tmp/overtone-screenshots/`
- Agent 視覺辨識 Dashboard 狀態，偵測異常時觸發修復

---

## 場景 2：視窗管理

### 需求

確認 Terminal 和瀏覽器是否運行，將 Terminal 帶到前景，列出視窗標題找到特定 session。

### 使用的 API

window.js: `checkAccessibility()`, `listProcesses()`, `listWindows()`, `focusApp()`, `getFrontApp()`

### 程式碼片段

```javascript
const { checkAccessibility, listProcesses, listWindows, focusApp, getFrontApp
} = require('./plugins/overtone/scripts/os/window');

// 步驟 1：確認 Accessibility 權限
const acc = checkAccessibility();
if (!acc.ok || !acc.hasPermission) {
  console.error('需要 Accessibility 權限');
  process.exit(1);
}

// 步驟 2：確認目標 App 是否運行
const procs = listProcesses();
const terminalRunning = procs.processes.some(p => p.name === 'Terminal');
// => true（pid, name, visible）

// 步驟 3：列出 Terminal 所有視窗
const wins = listWindows('Terminal');
wins.windows.forEach(w => console.log(`  - ${w.title}`));
// =>   - overtone — bun test
// =>   - overtone — bun scripts/server.js

// 步驟 4：聚焦 + 驗證
focusApp('Terminal');
const front = getFrontApp();
// => { ok: true, app: 'Terminal', window: 'overtone — bun test' }
```

### 注意事項

- `listWindows` 需要 Accessibility 權限；無權限時降級用 `listProcesses` 判斷 App 是否運行
- `window.listProcesses`（GUI 維度，回傳 visible）與 `process.listProcesses`（系統維度，回傳 cpu/mem）是不同函式

---

## 場景 3：系統資訊收集

### 需求

收集 CPU、記憶體、磁碟指標，超過閾值時發送 macOS 通知。

### 使用的 API

system-info.js: `getCpuUsage()`, `getMemoryInfo()`, `getDiskInfo()`, `getNetworkInfo()`
notification.js: `sendNotification()`
process.js: `listProcesses()`（找高 CPU Process）

### 程式碼片段

```javascript
const { getCpuUsage, getMemoryInfo, getDiskInfo } = require('./plugins/overtone/scripts/os/system-info');
const { sendNotification } = require('./plugins/overtone/scripts/os/notification');

const cpu = getCpuUsage();   // => { ok: true, cpu: { user: 25.3, sys: 8.1, idle: 66.6 } }
const mem = getMemoryInfo();  // => { ok: true, memory: { totalMB: 16384, freeMB: 512, ... } }
const disk = getDiskInfo('/'); // => { ok: true, disks: [{ usedPercent: 72, ... }] }

// 閾值檢查
const warnings = [];
if (cpu.ok && cpu.cpu.idle < 15) warnings.push(`CPU idle: ${cpu.cpu.idle}%`);
if (mem.ok && mem.memory.freeMB < 256) warnings.push(`記憶體: ${mem.memory.freeMB} MB`);
if (disk.ok && disk.disks[0].usedPercent > 90) warnings.push(`磁碟: ${disk.disks[0].usedPercent}%`);

if (warnings.length > 0) {
  sendNotification({
    title: 'Overtone 系統警告',
    message: warnings.join('\n'),
    sound: true,
  });
}
```

### 找高 CPU Process（系統維度 API）

```javascript
const { listProcesses } = require('./plugins/overtone/scripts/os/process');

const procs = listProcesses();
const highCpu = procs.processes.filter(p => p.cpu > 50).sort((a, b) => b.cpu - a.cpu);
// => [{ pid: 1234, name: 'node', cpu: 85.2, mem: 3.1, started: '14:30' }]
```

---

## 場景 4：檔案監控

### 需求

監控 `tests/` 目錄變更，變更時發送通知，session 結束時清理監控器。

### 使用的 API

fswatch.js: `watchPath()`, `listWatchers()`, `stopWatch()`
notification.js: `sendNotification()`
clipboard.js: `writeClipboard()`

### 程式碼片段

```javascript
const { watchPath, listWatchers, stopWatch } = require('./plugins/overtone/scripts/os/fswatch');
const { sendNotification } = require('./plugins/overtone/scripts/os/notification');
const { writeClipboard } = require('./plugins/overtone/scripts/os/clipboard');

// 開始監控
const changeBuffer = [];
const watch = watchPath('/Users/sbu/projects/overtone/tests', (event) => {
  changeBuffer.push({ file: event.filename, type: event.eventType, time: event.timestamp });
  if (event.eventType === 'rename') {
    sendNotification({ title: '測試檔案變更', message: `${event.filename} 被重新命名或刪除` });
  }
});
// => { ok: true, watcherId: '1709500000000-abc123' }

// 查看活躍監控器
const active = listWatchers();
// => { ok: true, watchers: [{ id: '...', path: '.../tests', startedAt: '...' }] }

// 清理（session 結束時）
function cleanup() {
  if (changeBuffer.length > 0) {
    writeClipboard(changeBuffer.map(c => `${c.type}: ${c.file}`).join('\n'));
  }
  listWatchers().watchers.forEach(w => stopWatch(w.id));
}
```

### 注意事項

- `fs.watch` 在 macOS 使用 FSEvents，可能合併連續事件
- `filename` 在邊界情況下可能為 `null`，callback 中應防禦
- `stopWatch` 和 `listWatchers` 是純記憶體操作，不需要 platform guard

---

## API 選擇決策樹

```
需要什麼？
├── 螢幕狀態 → screenshot.js（captureFullScreen / captureRegion / captureWindow）
├── App / 視窗 → window.js
│   ├── App 是否運行 → listProcesses()（不需權限）
│   ├── 視窗標題 → listWindows(app)（需 Accessibility）
│   └── 前景切換 → focusApp() / getFrontApp()
├── 系統資源 → system-info.js（CPU/記憶體/磁碟/網路）
│   └── 高 CPU Process → process.listProcesses()
├── Process 管理 → process.js（startProcess / killProcess）
├── 資料傳遞 → clipboard.js（readClipboard / writeClipboard）
├── 通知 → notification.js（sendNotification）
└── 檔案監控 → fswatch.js（watchPath / listWatchers / stopWatch）
```
