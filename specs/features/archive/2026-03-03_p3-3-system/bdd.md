---
feature: p3-3-system
stage: TEST:spec
created: 2026-03-04
workflow: standard
---

# P3.3 管得住（系統層）— BDD 行為規格

P3.3 提供 macOS 環境下的系統層控制能力，包含 Process 管理（process.js）、剪貼簿讀寫（clipboard.js）、系統資訊查詢（system-info.js）、macOS 通知推送（notification.js）、檔案系統監控（fswatch.js）。
所有腳本共同模式：依賴注入（`_deps` 最後參數）、不 throw（回傳 `{ ok, ... }`）、非 macOS 時回傳 `UNSUPPORTED_PLATFORM`。

---

## Feature: Process 列表（process.listProcesses）

### Scenario: 在 macOS 上成功列出所有執行中的 Process
  Given 執行平台為 macOS（darwin）
  And 注入的 execSync 回傳合法 `ps -axo pid,comm,cpu,mem,start` 輸出
  When 呼叫 `listProcesses()`
  Then 回傳 `{ ok: true, processes: [...] }`
  And `processes` 為非空陣列
  And 每個元素包含 `pid`（number）、`name`（string）、`cpu`（number）、`mem`（number）、`started`（string）

### Scenario: ps 指令執行失敗時回傳 COMMAND_FAILED
  Given 執行平台為 macOS（darwin）
  And 注入的 execSync 會拋出例外
  When 呼叫 `listProcesses()`
  Then 回傳 `{ ok: false, error: 'COMMAND_FAILED', message: <非空字串> }`
  And 不拋出例外

### Scenario: ps 輸出格式異常時回傳 PARSE_ERROR
  Given 執行平台為 macOS（darwin）
  And 注入的 execSync 回傳空字串或無法解析的格式（如只有 header 行無資料）
  When 呼叫 `listProcesses()`
  Then 回傳 `{ ok: false, error: 'PARSE_ERROR', message: <非空字串> }`
  And 不拋出例外

### Scenario: 非 macOS 平台時 listProcesses 回傳 UNSUPPORTED_PLATFORM
  Given 執行平台不是 darwin（如 linux 或 win32）
  When 呼叫 `listProcesses()`
  Then 回傳 `{ ok: false, error: 'UNSUPPORTED_PLATFORM', message: '此功能僅支援 macOS' }`
  And 不呼叫任何系統指令
  And 不拋出例外

---

## Feature: 啟動 Process（process.startProcess）

### Scenario: 使用有效指令成功啟動 Process
  Given 執行平台為 macOS（darwin）
  And 注入的 spawn 模擬成功啟動並回傳 `{ pid: 12345 }`
  When 呼叫 `startProcess('node', ['--version'])`
  Then 回傳 `{ ok: true, pid: 12345 }`
  And `pid` 為正整數

### Scenario: command 為空字串時回傳 INVALID_ARGUMENT
  Given 執行平台為 macOS（darwin）
  When 呼叫 `startProcess('')`
  Then 回傳 `{ ok: false, error: 'INVALID_ARGUMENT', message: <非空字串> }`
  And 不執行任何 spawn

### Scenario: command 為 null 或 undefined 時回傳 INVALID_ARGUMENT
  Given 執行平台為 macOS（darwin）
  When 呼叫 `startProcess(null)` 或 `startProcess(undefined)`
  Then 回傳 `{ ok: false, error: 'INVALID_ARGUMENT', message: <非空字串> }`
  And 不執行任何 spawn

### Scenario: spawn 執行失敗時回傳 COMMAND_FAILED
  Given 執行平台為 macOS（darwin）
  And 注入的 spawn 會拋出例外
  When 呼叫 `startProcess('nonexistent-command')`
  Then 回傳 `{ ok: false, error: 'COMMAND_FAILED', message: <非空字串> }`
  And 不拋出例外

### Scenario: 非 macOS 平台時 startProcess 回傳 UNSUPPORTED_PLATFORM
  Given 執行平台不是 darwin
  When 呼叫 `startProcess('ls')`
  Then 回傳 `{ ok: false, error: 'UNSUPPORTED_PLATFORM', message: '此功能僅支援 macOS' }`
  And 不拋出例外

---

## Feature: 終止 Process（process.killProcess）

### Scenario: 使用有效 PID 成功終止 Process
  Given 執行平台為 macOS（darwin）
  And 注入的 execSync 模擬 kill 指令成功執行
  When 呼叫 `killProcess(9999)`
  Then 回傳 `{ ok: true }`

### Scenario: 使用 SIGKILL signal 成功終止 Process
  Given 執行平台為 macOS（darwin）
  And 注入的 execSync 模擬 kill 指令成功執行
  When 呼叫 `killProcess(9999, 'SIGKILL')`
  Then 回傳 `{ ok: true }`

### Scenario: PID 為 0 時回傳 INVALID_ARGUMENT（拒絕 kernel）
  Given 執行平台為 macOS（darwin）
  When 呼叫 `killProcess(0)`
  Then 回傳 `{ ok: false, error: 'INVALID_ARGUMENT', message: <非空字串> }`
  And 不執行任何 kill 指令

### Scenario: PID 為 1 時回傳 INVALID_ARGUMENT（拒絕 init）
  Given 執行平台為 macOS（darwin）
  When 呼叫 `killProcess(1)`
  Then 回傳 `{ ok: false, error: 'INVALID_ARGUMENT', message: <非空字串> }`
  And 不執行任何 kill 指令

### Scenario: PID 等於自身 PID（process.pid）時回傳 INVALID_ARGUMENT（拒絕自殺）
  Given 執行平台為 macOS（darwin）
  When 呼叫 `killProcess(process.pid)`
  Then 回傳 `{ ok: false, error: 'INVALID_ARGUMENT', message: <非空字串> }`
  And 不執行任何 kill 指令

### Scenario: 使用非白名單 signal 時回傳 INVALID_ARGUMENT
  Given 執行平台為 macOS（darwin）
  When 呼叫 `killProcess(9999, 'SIGUSR1')`（非 SIGTERM/SIGKILL/SIGINT）
  Then 回傳 `{ ok: false, error: 'INVALID_ARGUMENT', message: <非空字串> }`
  And 不執行任何 kill 指令

### Scenario: kill 指令執行失敗時回傳 COMMAND_FAILED
  Given 執行平台為 macOS（darwin）
  And 注入的 execSync 會拋出例外
  When 呼叫 `killProcess(9999)`
  Then 回傳 `{ ok: false, error: 'COMMAND_FAILED', message: <非空字串> }`
  And 不拋出例外

### Scenario: 非 macOS 平台時 killProcess 回傳 UNSUPPORTED_PLATFORM
  Given 執行平台不是 darwin
  When 呼叫 `killProcess(9999)`
  Then 回傳 `{ ok: false, error: 'UNSUPPORTED_PLATFORM', message: '此功能僅支援 macOS' }`
  And 不拋出例外

---

## Feature: 讀取剪貼簿（clipboard.readClipboard）

### Scenario: 成功讀取剪貼簿內容
  Given 執行平台為 macOS（darwin）
  And 注入的 execSync 模擬 pbpaste 回傳 `"Hello, World!"`
  When 呼叫 `readClipboard()`
  Then 回傳 `{ ok: true, content: 'Hello, World!' }`
  And `content` 為字串

### Scenario: 剪貼簿為空時回傳空字串
  Given 執行平台為 macOS（darwin）
  And 注入的 execSync 模擬 pbpaste 回傳空字串
  When 呼叫 `readClipboard()`
  Then 回傳 `{ ok: true, content: '' }`

### Scenario: pbpaste 執行失敗時回傳 COMMAND_FAILED
  Given 執行平台為 macOS（darwin）
  And 注入的 execSync 會拋出例外
  When 呼叫 `readClipboard()`
  Then 回傳 `{ ok: false, error: 'COMMAND_FAILED', message: <非空字串> }`
  And 不拋出例外

### Scenario: 非 macOS 平台時 readClipboard 回傳 UNSUPPORTED_PLATFORM
  Given 執行平台不是 darwin
  When 呼叫 `readClipboard()`
  Then 回傳 `{ ok: false, error: 'UNSUPPORTED_PLATFORM', message: '此功能僅支援 macOS' }`
  And 不呼叫任何系統指令
  And 不拋出例外

---

## Feature: 寫入剪貼簿（clipboard.writeClipboard）

### Scenario: 成功寫入文字到剪貼簿
  Given 執行平台為 macOS（darwin）
  And 注入的 execSync 模擬 pbcopy 成功執行
  When 呼叫 `writeClipboard('測試文字')`
  Then 回傳 `{ ok: true }`

### Scenario: text 不是 string 型別時回傳 INVALID_ARGUMENT
  Given 執行平台為 macOS（darwin）
  When 呼叫 `writeClipboard(123)` 或 `writeClipboard(null)` 或 `writeClipboard(undefined)`
  Then 回傳 `{ ok: false, error: 'INVALID_ARGUMENT', message: <非空字串> }`
  And 不執行任何 pbcopy 指令

### Scenario: pbcopy 執行失敗時回傳 COMMAND_FAILED
  Given 執行平台為 macOS（darwin）
  And 注入的 execSync 會拋出例外
  When 呼叫 `writeClipboard('some text')`
  Then 回傳 `{ ok: false, error: 'COMMAND_FAILED', message: <非空字串> }`
  And 不拋出例外

### Scenario: 非 macOS 平台時 writeClipboard 回傳 UNSUPPORTED_PLATFORM
  Given 執行平台不是 darwin
  When 呼叫 `writeClipboard('text')`
  Then 回傳 `{ ok: false, error: 'UNSUPPORTED_PLATFORM', message: '此功能僅支援 macOS' }`
  And 不拋出例外

---

## Feature: CPU 使用率查詢（system-info.getCpuUsage）

### Scenario: 成功取得 CPU 使用率資訊
  Given 執行平台為 macOS（darwin）
  And 注入的 execSync 模擬 `top -l 1` 回傳包含 `CPU usage: 12.5% user, 5.3% sys, 82.2% idle` 的輸出
  When 呼叫 `getCpuUsage()`
  Then 回傳 `{ ok: true, cpu: { user, sys, idle } }`
  And `cpu.user` 為浮點數（12.5）
  And `cpu.sys` 為浮點數（5.3）
  And `cpu.idle` 為浮點數（82.2）

### Scenario: top 指令輸出格式異常時回傳 PARSE_ERROR
  Given 執行平台為 macOS（darwin）
  And 注入的 execSync 回傳不含 CPU usage 行的輸出（regex 無法匹配）
  When 呼叫 `getCpuUsage()`
  Then 回傳 `{ ok: false, error: 'PARSE_ERROR', message: <非空字串> }`
  And 不拋出例外

### Scenario: top 指令執行失敗時回傳 COMMAND_FAILED
  Given 執行平台為 macOS（darwin）
  And 注入的 execSync 會拋出例外
  When 呼叫 `getCpuUsage()`
  Then 回傳 `{ ok: false, error: 'COMMAND_FAILED', message: <非空字串> }`
  And 不拋出例外

### Scenario: 非 macOS 平台時 getCpuUsage 回傳 UNSUPPORTED_PLATFORM
  Given 執行平台不是 darwin
  When 呼叫 `getCpuUsage()`
  Then 回傳 `{ ok: false, error: 'UNSUPPORTED_PLATFORM', message: '此功能僅支援 macOS' }`
  And 不拋出例外

---

## Feature: 記憶體資訊查詢（system-info.getMemoryInfo）

### Scenario: 成功取得記憶體資訊
  Given 執行平台為 macOS（darwin）
  And 注入的 execSync 模擬 `vm_stat` 回傳包含 Pages free/wired down/active/inactive 欄位的輸出
  When 呼叫 `getMemoryInfo()`
  Then 回傳 `{ ok: true, memory: { totalMB, freeMB, wiredMB, activeMB, inactiveMB } }`
  And 所有欄位皆為非負數（number）
  And `freeMB` 等於 `Pages free` 欄位數值 × 4096 / 1048576（換算為 MB）

### Scenario: vm_stat 輸出使用 regex 關鍵詞匹配，不依賴固定行號
  Given 執行平台為 macOS（darwin）
  And 注入的 execSync 回傳 Pages free 和 Pages wired down 順序對調的 vm_stat 輸出
  When 呼叫 `getMemoryInfo()`
  Then 仍能正確解析回傳 `{ ok: true, memory: { ... } }`

### Scenario: vm_stat 輸出格式異常時回傳 PARSE_ERROR
  Given 執行平台為 macOS（darwin）
  And 注入的 execSync 回傳完全無法匹配 Pages 欄位的輸出
  When 呼叫 `getMemoryInfo()`
  Then 回傳 `{ ok: false, error: 'PARSE_ERROR', message: <非空字串> }`
  And 不拋出例外

### Scenario: vm_stat 指令執行失敗時回傳 COMMAND_FAILED
  Given 執行平台為 macOS（darwin）
  And 注入的 execSync 會拋出例外
  When 呼叫 `getMemoryInfo()`
  Then 回傳 `{ ok: false, error: 'COMMAND_FAILED', message: <非空字串> }`
  And 不拋出例外

### Scenario: 非 macOS 平台時 getMemoryInfo 回傳 UNSUPPORTED_PLATFORM
  Given 執行平台不是 darwin
  When 呼叫 `getMemoryInfo()`
  Then 回傳 `{ ok: false, error: 'UNSUPPORTED_PLATFORM', message: '此功能僅支援 macOS' }`
  And 不拋出例外

---

## Feature: 磁碟資訊查詢（system-info.getDiskInfo）

### Scenario: 不傳 mountPoint 時查詢根目錄磁碟資訊
  Given 執行平台為 macOS（darwin）
  And 注入的 execSync 模擬 `df -H /` 回傳合法輸出
  When 呼叫 `getDiskInfo()`（不傳 mountPoint）
  Then 回傳 `{ ok: true, disks: [...] }`
  And `disks` 陣列至少包含一個元素
  And 每個元素包含 `device`（string）、`mountPoint`（string）、`totalGB`（number）、`usedGB`（number）、`availableGB`（number）、`usedPercent`（number）

### Scenario: 指定有效 mountPoint 查詢特定磁碟資訊
  Given 執行平台為 macOS（darwin）
  And 注入的 execSync 模擬 `df -H /System/Volumes/Data` 回傳合法輸出
  When 呼叫 `getDiskInfo('/System/Volumes/Data')`
  Then 回傳 `{ ok: true, disks: [...] }`
  And `disks[0].mountPoint` 為 `'/System/Volumes/Data'`

### Scenario: df 輸出格式異常時回傳 PARSE_ERROR
  Given 執行平台為 macOS（darwin）
  And 注入的 execSync 回傳只有 header 行、無資料行的 df 輸出
  When 呼叫 `getDiskInfo()`
  Then 回傳 `{ ok: false, error: 'PARSE_ERROR', message: <非空字串> }`
  And 不拋出例外

### Scenario: df 指令執行失敗時回傳 COMMAND_FAILED
  Given 執行平台為 macOS（darwin）
  And 注入的 execSync 會拋出例外
  When 呼叫 `getDiskInfo()`
  Then 回傳 `{ ok: false, error: 'COMMAND_FAILED', message: <非空字串> }`
  And 不拋出例外

### Scenario: 非 macOS 平台時 getDiskInfo 回傳 UNSUPPORTED_PLATFORM
  Given 執行平台不是 darwin
  When 呼叫 `getDiskInfo()`
  Then 回傳 `{ ok: false, error: 'UNSUPPORTED_PLATFORM', message: '此功能僅支援 macOS' }`
  And 不拋出例外

---

## Feature: 網路介面資訊查詢（system-info.getNetworkInfo）

### Scenario: 成功取得網路介面資訊
  Given 執行平台為 macOS（darwin）
  And 注入的 execSync 模擬 `ifconfig` 回傳包含 en0 active 的輸出
  When 呼叫 `getNetworkInfo()`
  Then 回傳 `{ ok: true, interfaces: [...] }`
  And `interfaces` 為陣列
  And 每個元素包含 `name`（string）、`status`（'active' | 'inactive' | 'unknown'）
  And 有 IPv4 地址的介面包含 `ipv4`（string）

### Scenario: 網路介面輸出格式異常時回傳 PARSE_ERROR
  Given 執行平台為 macOS（darwin）
  And 注入的 execSync 回傳空字串或無法解析的輸出
  When 呼叫 `getNetworkInfo()`
  Then 回傳 `{ ok: false, error: 'PARSE_ERROR', message: <非空字串> }`
  And 不拋出例外

### Scenario: ifconfig 執行失敗時回傳 COMMAND_FAILED
  Given 執行平台為 macOS（darwin）
  And 注入的 execSync 會拋出例外
  When 呼叫 `getNetworkInfo()`
  Then 回傳 `{ ok: false, error: 'COMMAND_FAILED', message: <非空字串> }`
  And 不拋出例外

### Scenario: 非 macOS 平台時 getNetworkInfo 回傳 UNSUPPORTED_PLATFORM
  Given 執行平台不是 darwin
  When 呼叫 `getNetworkInfo()`
  Then 回傳 `{ ok: false, error: 'UNSUPPORTED_PLATFORM', message: '此功能僅支援 macOS' }`
  And 不拋出例外

---

## Feature: macOS 通知推送（notification.sendNotification）

### Scenario: 僅提供 title 和 message 時成功發送通知
  Given 執行平台為 macOS（darwin）
  And 注入的 execSync 模擬 osascript 成功執行
  When 呼叫 `sendNotification({ title: '任務完成', message: 'P3.3 已部署' })`
  Then 回傳 `{ ok: true }`
  And execSync 呼叫的指令包含 `display notification`

### Scenario: 提供 subtitle 和 sound 時成功發送通知
  Given 執行平台為 macOS（darwin）
  And 注入的 execSync 模擬 osascript 成功執行
  When 呼叫 `sendNotification({ title: '警告', message: '磁碟空間不足', subtitle: '系統通知', sound: true })`
  Then 回傳 `{ ok: true }`
  And execSync 呼叫的指令包含 `subtitle` 欄位和 `sound name "Default"`

### Scenario: 不提供 sound 時預設不播放音效
  Given 執行平台為 macOS（darwin）
  And 注入的 execSync 模擬 osascript 成功執行
  When 呼叫 `sendNotification({ title: '提示', message: '內容' })`（不傳 sound）
  Then 回傳 `{ ok: true }`
  And execSync 呼叫的指令不包含 `sound name`

### Scenario: title 缺失時回傳 INVALID_ARGUMENT
  Given 執行平台為 macOS（darwin）
  When 呼叫 `sendNotification({ message: '沒有標題' })`
  Then 回傳 `{ ok: false, error: 'INVALID_ARGUMENT', message: <非空字串> }`
  And 不執行任何 osascript 指令

### Scenario: message 缺失時回傳 INVALID_ARGUMENT
  Given 執行平台為 macOS（darwin）
  When 呼叫 `sendNotification({ title: '有標題' })`
  Then 回傳 `{ ok: false, error: 'INVALID_ARGUMENT', message: <非空字串> }`
  And 不執行任何 osascript 指令

### Scenario: title 或 message 為非 string 型別時回傳 INVALID_ARGUMENT
  Given 執行平台為 macOS（darwin）
  When 呼叫 `sendNotification({ title: 123, message: '內容' })` 或 `sendNotification({ title: '標題', message: null })`
  Then 回傳 `{ ok: false, error: 'INVALID_ARGUMENT', message: <非空字串> }`
  And 不執行任何 osascript 指令

### Scenario: osascript 執行失敗時回傳 COMMAND_FAILED
  Given 執行平台為 macOS（darwin）
  And 注入的 execSync 會拋出例外
  When 呼叫 `sendNotification({ title: '標題', message: '內容' })`
  Then 回傳 `{ ok: false, error: 'COMMAND_FAILED', message: <非空字串> }`
  And 不拋出例外

### Scenario: 非 macOS 平台時 sendNotification 回傳 UNSUPPORTED_PLATFORM
  Given 執行平台不是 darwin
  When 呼叫 `sendNotification({ title: '標題', message: '內容' })`
  Then 回傳 `{ ok: false, error: 'UNSUPPORTED_PLATFORM', message: '此功能僅支援 macOS' }`
  And 不拋出例外

---

## Feature: 開始監控檔案路徑（fswatch.watchPath）

### Scenario: 成功開始監控有效路徑
  Given 執行平台為 macOS（darwin）
  And 目標路徑存在（注入的 watch mock 成功）
  When 呼叫 `watchPath('/tmp/test-dir', callback)`
  Then 回傳 `{ ok: true, watcherId: <非空字串> }`
  And `watcherId` 格式符合 `{timestamp}-{random}`（如 `1709500000000-abc123`）
  And watcher 已記錄在 module-level Map 中

### Scenario: 檔案變更時 callback 被呼叫並帶入 WatchEvent
  Given 已成功呼叫 `watchPath('/tmp/test-dir', callback)` 並取得 watcherId
  And 注入的 watch mock 可觸發 change 事件
  When 觸發路徑的 change 事件
  Then callback 被呼叫一次
  And callback 收到的 event 包含 `watcherId`（string）、`path`（string）、`eventType`（'change'）、`filename`（string | null）、`timestamp`（ISO 8601 字串）

### Scenario: targetPath 為空字串時回傳 INVALID_ARGUMENT
  Given 執行平台為 macOS（darwin）
  When 呼叫 `watchPath('', callback)`
  Then 回傳 `{ ok: false, error: 'INVALID_ARGUMENT', message: <非空字串> }`
  And 不呼叫 watch

### Scenario: targetPath 為 null 或 undefined 時回傳 INVALID_ARGUMENT
  Given 執行平台為 macOS（darwin）
  When 呼叫 `watchPath(null, callback)` 或 `watchPath(undefined, callback)`
  Then 回傳 `{ ok: false, error: 'INVALID_ARGUMENT', message: <非空字串> }`
  And 不呼叫 watch

### Scenario: callback 不是 function 時回傳 INVALID_ARGUMENT
  Given 執行平台為 macOS（darwin）
  When 呼叫 `watchPath('/tmp/test-dir', 'not-a-function')`
  Then 回傳 `{ ok: false, error: 'INVALID_ARGUMENT', message: <非空字串> }`
  And 不呼叫 watch

### Scenario: watch 啟動失敗時回傳 COMMAND_FAILED
  Given 執行平台為 macOS（darwin）
  And 注入的 watch 會拋出例外（如路徑不存在）
  When 呼叫 `watchPath('/nonexistent/path', callback)`
  Then 回傳 `{ ok: false, error: 'COMMAND_FAILED', message: <非空字串> }`
  And 不拋出例外

### Scenario: 非 macOS 平台時 watchPath 回傳 UNSUPPORTED_PLATFORM
  Given 執行平台不是 darwin
  When 呼叫 `watchPath('/tmp/test-dir', callback)`
  Then 回傳 `{ ok: false, error: 'UNSUPPORTED_PLATFORM', message: '此功能僅支援 macOS' }`
  And 不拋出例外

---

## Feature: 停止檔案監控（fswatch.stopWatch）

### Scenario: 使用有效 watcherId 成功停止監控
  Given 已呼叫 `watchPath` 並取得 watcherId `'1709500000000-abc123'`
  And 該 watcherId 存在於 module-level Map 中
  When 呼叫 `stopWatch('1709500000000-abc123')`
  Then 回傳 `{ ok: true }`
  And watcher 已從 module-level Map 中移除
  And 底層 FSWatcher 的 `close()` 方法已被呼叫

### Scenario: 使用不存在的 watcherId 時回傳 WATCHER_NOT_FOUND
  Given module-level Map 中不存在 `'nonexistent-id'`
  When 呼叫 `stopWatch('nonexistent-id')`
  Then 回傳 `{ ok: false, error: 'WATCHER_NOT_FOUND', message: <非空字串> }`
  And 不拋出例外

### Scenario: watcherId 為空字串時回傳 WATCHER_NOT_FOUND
  When 呼叫 `stopWatch('')`
  Then 回傳 `{ ok: false, error: 'WATCHER_NOT_FOUND', message: <非空字串> }`

---

## Feature: 列出所有監控器（fswatch.listWatchers）

### Scenario: 有活躍監控器時回傳完整清單
  Given 已成功呼叫 `watchPath` 兩次，分別監控 `/tmp/dir-a` 和 `/tmp/dir-b`
  When 呼叫 `listWatchers()`
  Then 回傳 `{ ok: true, watchers: [...] }`
  And `watchers` 長度為 2
  And 每個元素包含 `id`（string）、`path`（string）、`startedAt`（ISO 8601 字串）

### Scenario: 沒有活躍監控器時回傳空陣列
  Given module-level Map 為空（未呼叫 watchPath 或所有 watcher 已 stop）
  When 呼叫 `listWatchers()`
  Then 回傳 `{ ok: true, watchers: [] }`

### Scenario: listWatchers 永遠成功（不回傳錯誤）
  Given 任意狀態
  When 呼叫 `listWatchers()`
  Then `ok` 永遠為 `true`
  And 不拋出例外

---

## Feature: fswatch 完整生命週期（整合場景）

### Scenario: 開始監控 → 觸發事件 → 停止監控 完整流程
  Given 執行平台為 macOS（darwin）
  And 注入的 watch mock 可觸發事件
  When 呼叫 `watchPath('/tmp/lifecycle-test', callback)` 取得 watcherId
  And `listWatchers()` 確認 watcherId 在清單中
  And 觸發一次 change 事件
  And 呼叫 `stopWatch(watcherId)`
  Then callback 在觸發期間被呼叫了一次
  And `stopWatch` 回傳 `{ ok: true }`
  And `listWatchers()` 的 watchers 清單不再包含該 watcherId

---

## Feature: os-control system.md Reference 文件

### Scenario: system.md 包含 process.js API 完整說明
  Given `plugins/overtone/skills/os-control/references/system.md` 已建立並填充
  When 讀取該文件
  Then 文件包含 `listProcesses`、`startProcess`、`killProcess` 的說明
  And 說明包含各函式的參數格式與回傳值格式
  And 說明包含安全邊界（PID 黑名單、signal 白名單）

### Scenario: system.md 包含 clipboard.js API 完整說明
  Given `plugins/overtone/skills/os-control/references/system.md` 已填充
  When 讀取該文件
  Then 文件包含 `readClipboard`、`writeClipboard` 的說明

### Scenario: system.md 包含 system-info.js API 完整說明
  Given `plugins/overtone/skills/os-control/references/system.md` 已填充
  When 讀取該文件
  Then 文件包含 `getCpuUsage`、`getMemoryInfo`、`getDiskInfo`、`getNetworkInfo` 的說明

### Scenario: system.md 包含 notification.js API 完整說明
  Given `plugins/overtone/skills/os-control/references/system.md` 已填充
  When 讀取該文件
  Then 文件包含 `sendNotification` 的說明
  And 說明包含 NotificationOptions 的四個參數（title, message, subtitle, sound）

### Scenario: system.md 包含 fswatch.js API 完整說明
  Given `plugins/overtone/skills/os-control/references/system.md` 已填充
  When 讀取該文件
  Then 文件包含 `watchPath`、`stopWatch`、`listWatchers` 的說明
  And 說明包含 WatchEvent 的欄位結構

### Scenario: os-control SKILL.md 的 Reference 索引 P3.3 項目已更新為完成狀態
  Given `plugins/overtone/skills/os-control/SKILL.md` 已更新
  When 讀取該文件的 Reference 索引表格
  Then 第 3 行（system.md）的 `對應階段` 欄位顯示 `P3.3 ✅`
  And 該項目不是佔位符狀態（不含「將在 P3.3 階段填充」文字）
