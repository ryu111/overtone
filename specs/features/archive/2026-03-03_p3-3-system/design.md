---
feature: p3-3-system
stage: ARCH
created: 2026-03-04
workflow: standard
---

# P3.3 管得住（系統層）— 技術設計

## 技術方案總覽

延續 P3.1 已建立的模式：5 個 OS 系統層腳本置於 `plugins/overtone/scripts/os/`，每支腳本皆採依賴注入 + 不 throw 的 `{ ok, error, message }` 回傳契約。測試置於 `tests/unit/`，模式與 `screenshot.test.js` / `window.test.js` 一致。

### 關鍵技術決策（5 個 Open Questions）

**Q1：fswatch.js 實作策略**

決策：使用 `Bun.fs.watch()`（即 Node.js `fs.watch()` API，Bun 原生支援）。

理由：
- `fs.watch()` 在 Bun 環境已穩定且不需要額外安裝原生 addon
- `fs.watchFile()` 使用輪詢（polling），效能低、延遲高，不適合即時監控場景
- macOS `fsevents` 需要 native addon，增加部署複雜度，與 Bun 純 JS 生態不符
- Won't 範圍已排除深層遞迴監控，`fs.watch()` 的遞迴支援限制不影響本期

fswatch.js 需要管理 watcher 實例狀態，採用 module-level Map 儲存（`Map<watcherId, FSWatcher>`），提供 `watchPath` / `stopWatch` / `listWatchers` 三個函式。fswatch 是本次唯一有副作用（持久狀態）的腳本，設計上這是合理的。

**Q2：process.js `killProcess` 安全邊界**

決策：函式內部加 PID 白名單/黑名單保護，不完全依賴 pre-bash-guard。

理由：
- pre-bash-guard 保護的是 Bash tool 的直接命令列操作，`killProcess` 是 JavaScript API 呼叫，繞過了 guard 層
- 防禦深度原則：API 層自己守邊界，不假設呼叫者已被 guard 過濾
- 具體規則：拒絕 PID <= 1（init/kernel）；拒絕 PID 等於 `process.pid`（自殺）；signal 只允許 SIGTERM / SIGKILL / SIGINT（白名單）

**Q3：system-info.js `vm_stat` 解析策略**

決策：使用 regex 按關鍵詞抓取欄位，不依賴固定行號。

理由：
- `vm_stat` 輸出格式在不同 macOS 版本間行號可能不同（例如插入新欄位）
- regex 關鍵詞匹配（如 `Pages free:\s+(\d+)`）對版本遷移更穩健
- 每個欄位單獨解析，任一欄位解析失敗不影響其他欄位
- 回傳值統一為 MB（頁面數 × 4096 / 1048576），語義清晰

**Q4：notification.js 參數深度**

決策：支援 `title` + `message` + `subtitle`（選填）+ `sound`（選填，預設 `false`）四個參數。

理由：
- 只支援 title + message 會讓 agent 無法區分「類型」（警告、成功、資訊），subtitle 提供分類標籤
- sound 是 Boolean flag（`true` → 使用 `sound name "Default"`），不暴露 macOS 音效名稱細節，避免跨版本差異
- 不支援 action button：需要 NSUserNotification API，超出 osascript 能力範圍且涉及 app bundle

**Q5：process.js vs window.js `listProcesses` 重疊**

決策：共存，提供不同維度，不合併。

理由：
- `window.js.listProcesses`：使用 AppleScript System Events，回傳 `{ pid, name, visible }`，偏 GUI 導向（visible 欄位）
- `process.js.listProcesses`：使用 Unix `ps aux`，回傳 `{ pid, name, cpu, mem, started }`，偏系統資源導向
- 合併會讓兩個模組的職責邊界混淆（window.js 是視窗管理，process.js 是系統資源）
- perception.md 中的 `window.listProcesses` 在 Usage Guide 已有明確定位（確認 App 是否運行），不需要 CPU/MEM 資訊

---

## API 介面

### 型別定義

```typescript
// 共同基礎型別（延續 P3.1）
type OkResult<T> = { ok: true } & T
type FailResult = { ok: false; error: string; message: string }
type OsResult<T = {}> = OkResult<T> | FailResult

// 共同 Error Codes
type PlatformError = 'UNSUPPORTED_PLATFORM'
type InvalidArgError = 'INVALID_ARGUMENT'
type CommandError = 'COMMAND_FAILED'
type ParseError = 'PARSE_ERROR'
```

### process.js

```typescript
interface ProcessEntry {
  pid: number
  name: string     // process 名稱（comm 欄位）
  cpu: number      // CPU 使用率（百分比，浮點數）
  mem: number      // 記憶體使用率（百分比，浮點數）
  started: string  // 啟動時間（'HH:MM' 或 'MMM DD' 格式，來自 ps）
}

interface StartProcessResult {
  pid: number
}

// 函式簽名
function listProcesses(
  _deps?: { execSync?: Function }
): OsResult<{ processes: ProcessEntry[] }>

function startProcess(
  command: string,
  args?: string[],
  _deps?: { spawn?: Function }
): OsResult<StartProcessResult>

function killProcess(
  pid: number,
  signal?: 'SIGTERM' | 'SIGKILL' | 'SIGINT',
  _deps?: { execSync?: Function }
): OsResult<{}>

// 錯誤碼
// listProcesses: UNSUPPORTED_PLATFORM | COMMAND_FAILED | PARSE_ERROR
// startProcess:  UNSUPPORTED_PLATFORM | INVALID_ARGUMENT | COMMAND_FAILED
// killProcess:   UNSUPPORTED_PLATFORM | INVALID_ARGUMENT | COMMAND_FAILED
//   INVALID_ARGUMENT 適用：PID <= 1, PID === process.pid, 非白名單 signal
```

### clipboard.js

```typescript
// 函式簽名
function readClipboard(
  _deps?: { execSync?: Function }
): OsResult<{ content: string }>

function writeClipboard(
  text: string,
  _deps?: { execSync?: Function }
): OsResult<{}>

// 錯誤碼
// readClipboard:  UNSUPPORTED_PLATFORM | COMMAND_FAILED
// writeClipboard: UNSUPPORTED_PLATFORM | INVALID_ARGUMENT | COMMAND_FAILED
//   INVALID_ARGUMENT 適用：text 不是 string 型別
```

### system-info.js

```typescript
interface CpuInfo {
  user: number      // user mode CPU %（來自 top -l 1）
  sys: number       // system mode CPU %
  idle: number      // idle CPU %
}

interface MemoryInfo {
  totalMB: number   // 總實體記憶體（MB）
  freeMB: number    // 空閒記憶體（free pages × 4096）
  wiredMB: number   // wired down 記憶體
  activeMB: number  // active 記憶體
  inactiveMB: number // inactive 記憶體
}

interface DiskInfo {
  device: string    // 裝置名稱（如 '/dev/disk3s1s1'）
  mountPoint: string // 掛載點（如 '/'）
  totalGB: number   // 總容量（GB）
  usedGB: number    // 已用容量（GB）
  availableGB: number // 可用容量（GB）
  usedPercent: number // 使用率（百分比）
}

interface NetworkInterface {
  name: string      // 介面名稱（如 'en0', 'lo0'）
  status: 'active' | 'inactive' | 'unknown'
  ipv4?: string     // IPv4 地址
  ipv6?: string     // IPv6 地址
}

// 函式簽名
function getCpuUsage(
  _deps?: { execSync?: Function }
): OsResult<{ cpu: CpuInfo }>

function getMemoryInfo(
  _deps?: { execSync?: Function }
): OsResult<{ memory: MemoryInfo }>

function getDiskInfo(
  mountPoint?: string,  // 預設 '/'
  _deps?: { execSync?: Function }
): OsResult<{ disks: DiskInfo[] }>

function getNetworkInfo(
  _deps?: { execSync?: Function }
): OsResult<{ interfaces: NetworkInterface[] }>

// 錯誤碼（所有函式）：UNSUPPORTED_PLATFORM | COMMAND_FAILED | PARSE_ERROR
```

### notification.js

```typescript
interface NotificationOptions {
  title: string       // 通知標題（必填）
  message: string     // 通知內文（必填）
  subtitle?: string   // 副標題（選填，顯示在 title 下方）
  sound?: boolean     // 是否播放音效（預設 false）
}

// 函式簽名
function sendNotification(
  opts: NotificationOptions,
  _deps?: { execSync?: Function }
): OsResult<{}>

// 錯誤碼：UNSUPPORTED_PLATFORM | INVALID_ARGUMENT | COMMAND_FAILED
//   INVALID_ARGUMENT 適用：title 或 message 缺失或非 string
```

### fswatch.js

```typescript
type WatcherId = string  // 格式：'{timestamp}-{random}'

interface WatchEvent {
  watcherId: WatcherId
  path: string
  eventType: 'change' | 'rename'  // fs.watch 原生事件
  filename: string | null
  timestamp: string  // ISO 8601
}

interface WatcherEntry {
  id: WatcherId
  path: string
  startedAt: string  // ISO 8601
}

// 函式簽名
function watchPath(
  targetPath: string,
  callback: (event: WatchEvent) => void,
  _deps?: { watch?: Function }
): OsResult<{ watcherId: WatcherId }>

function stopWatch(
  watcherId: WatcherId
): OsResult<{}>

function listWatchers(): OsResult<{ watchers: WatcherEntry[] }>

// 錯誤碼
// watchPath:   UNSUPPORTED_PLATFORM | INVALID_ARGUMENT | PATH_NOT_FOUND | COMMAND_FAILED
// stopWatch:   WATCHER_NOT_FOUND
// listWatchers: （永遠成功）
```

---

## 資料模型

### fswatch.js 狀態（module-level）

```javascript
// module-level Map，不持久化到 disk
const _watchers = new Map()
// key: watcherId (string)
// value: { watcher: FSWatcher, path: string, startedAt: string }
```

### system-info.js 解析 Contracts

```
vm_stat 關鍵行（regex 匹配，不依賴行號）：
  /Pages free:\s+(\d+)/
  /Pages wired down:\s+(\d+)/
  /Pages active:\s+(\d+)/
  /Pages inactive:\s+(\d+)/
  頁面大小：固定 4096 bytes（macOS 常數）

top -l 1 CPU 行（regex 匹配）：
  /CPU usage:\s+([\d.]+)%\s+user,\s+([\d.]+)%\s+sys,\s+([\d.]+)%\s+idle/

df -H 欄位（空格分割，固定欄位順序）：
  Filesystem / Size / Used / Avail / Capacity / Mounted on
  容量單位：df -H 統一輸出人類可讀格式，再手動轉換為 GB
```

### process.js 解析 Contracts

```
ps -axo pid,comm,cpu,mem,start 輸出（tab/空格分割）：
  PID   COMM       %CPU  %MEM  STARTED
  每行 trim 後 split(/\s+/)，取前 5 欄
```

---

## 檔案結構

### 新增檔案（7 個核心 + 5 個測試）

```
plugins/overtone/scripts/os/
  process.js          — Process 管理（新增）
  clipboard.js        — 剪貼簿讀寫（新增）
  system-info.js      — 系統資訊查詢（新增）
  notification.js     — macOS 通知推送（新增）
  fswatch.js          — 檔案系統監控（新增）

plugins/overtone/skills/os-control/references/
  system.md           — P3.3 系統層 API Reference（新增）

tests/unit/
  process.test.js     — process.js 單元測試（新增）
  clipboard.test.js   — clipboard.js 單元測試（新增）
  system-info.test.js — system-info.js 單元測試（新增）
  notification.test.js — notification.js 單元測試（新增）
  fswatch.test.js     — fswatch.js 單元測試（新增）
```

### 修改檔案（3 個）

```
plugins/overtone/skills/os-control/SKILL.md
  — Reference 索引第 3 行：P3.3 → P3.3 ✅

plugins/overtone/hooks/scripts/tool/pre-bash-guard.js
  — 新增 3 條黑名單規則（Should 範圍）：
    kill -9 <非 1 的 PID>（大量 kill）、
    killall <process>（name-based 全殺）

plugins/overtone/scripts/health-check.js
  — 新增第 8 項偵測：pbcopy / pbpaste / osascript 可用性（Should 範圍）
```

---

## 腳本共同結構模板

每支腳本遵循 P3.1 已確立的 pattern：

```javascript
'use strict';
/**
 * {name}.js — {說明}
 *
 * 僅支援 macOS（darwin）。
 * 不 throw — 所有錯誤以 { ok: false, error, message } 回傳。
 * 依賴注入：最後一個參數 _deps 供測試替換。
 */

const { execSync: defaultExecSync } = require('child_process');

function ok(fields) { return { ok: true, ...fields }; }
function fail(error, message) { return { ok: false, error, message }; }

function someFunction(arg, _deps = {}) {
  if (process.platform !== 'darwin') {
    return fail('UNSUPPORTED_PLATFORM', '此功能僅支援 macOS');
  }
  const execSync = _deps.execSync || defaultExecSync;
  // ... 實作
}

module.exports = { someFunction };
```

fswatch.js 例外：`watchPath` 注入 `_deps.watch`（`fs.watch` 的替身），`stopWatch` 和 `listWatchers` 操作 module-level Map，不需要 execSync。

---

## 測試策略

延續 P3.1 測試模式：

```javascript
'use strict';
const { describe, it, expect, afterEach } = require('bun:test');

// 平台 mock
function mockPlatform(value) { ... }
function restorePlatform() { ... }

// deps mock
function makeExecSyncSuccess(output) { return () => output; }
function makeExecSyncFail(message) {
  return () => { throw new Error(message); };
}

// 每個函式獨立 describe 區塊
// 每個 scenario 對應一個 it
```

fswatch.test.js 額外需要 mock `fs.watch`：
```javascript
function makeFsWatchMock() {
  return (path, opts, callback) => ({
    close: () => {},
    // 可呼叫 callback 觸發事件
  });
}
```

---

## 向後相容性

- 所有新腳本為全新檔案，不修改現有 API
- `window.js.listProcesses` 維持不變（職責不同於 `process.js.listProcesses`）
- pre-bash-guard.js 只新增規則，不修改現有 11 條規則
- health-check.js 新增第 8 項偵測，不修改既有 7 項
