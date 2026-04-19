# OS 操控腳本（R3.3 — L3 感知操控）

## 動機（Why）

- **問題**：os-control skill 有完整的 5 個 reference 文件定義 API 規格，但 `~/.claude/scripts/os/` 目錄已在架構重設計時刪除，所有 OS 操控腳本不存在
- **目標**：重建 6 個 OS 腳本，恢復 macOS 桌面自動化能力（截圖 + 視窗 + Process + 剪貼簿 + 系統資訊 + TTS）
- **不做的代價**：L3 感知能力斷裂，心跳引擎 spawn 的 session 無法感知螢幕狀態和系統資源

## 範圍

### In-scope

- screenshot.js：captureFullScreen / captureRegion / captureWindow / checkPermission
- window.js：listWindows / focusApp / getFrontApp / listProcesses（GUI）/ checkAccessibility
- process.js：listProcesses（系統）/ startProcess / killProcess
- clipboard.js：readClipboard / writeClipboard
- system-info.js：getCpuUsage / getMemoryInfo / getDiskInfo / getNetworkInfo
- tts.js：speak / stop / listVoices

### Out-of-scope

- notification.js（已存在於 hooks/modules/notification.js）
- fswatch.js（延後，v1 用 Bun 原生 watch）
- websocket.js（延後，非核心 OS 能力）
- 操控層（keyboard/mouse/applescript/computer-use — 獨立模組 R3.4）

## 使用者故事

身為 Nova 系統（透過心跳引擎 spawn 的 session），我想要能截取螢幕、查詢視窗狀態、管理 Process、操作剪貼簿、了解系統資源，以便在自主模式下感知和回應環境。

身為開發者，我想要所有 OS 腳本遵循統一模式（平台守衛 + 依賴注入 + 結構化回傳），以便容易測試和維護。

## 行為規格

### 正常路徑

各腳本 API 的正常路徑已在 os-control skill 的 references 中完整定義（perception.md + system.md）。此處列出統一規範：

1. 所有函式先檢查 `process.platform === 'darwin'`，非 macOS → `{ ok: false, error: 'UNSUPPORTED_PLATFORM' }`
2. 執行 macOS 原生指令（screencapture / osascript / ps / pbcopy 等）
3. 解析輸出為結構化 JSON
4. 回傳 `{ ok: true, ...data }`

### 錯誤路徑

| 錯誤情境 | 預期行為 |
|---------|---------|
| 非 macOS 平台 | `{ ok: false, error: 'UNSUPPORTED_PLATFORM' }` |
| 權限不足（Screen Recording / Accessibility） | `{ ok: false, error: 'PERMISSION_DENIED' }` |
| 原生指令失敗 | `{ ok: false, error: 'COMMAND_FAILED', message }` |
| 輸出解析失敗 | `{ ok: false, error: 'PARSE_ERROR', message }` |
| 無效參數 | `{ ok: false, error: 'INVALID_ARGUMENT', message }` |

### 邊界條件

- screencapture 截取安全視窗 → 回傳黑圖（macOS 行為，不可繞過）
- process.killProcess(pid <= 1) → 拒絕（保護 init/kernel）
- process.killProcess(process.pid) → 拒絕（防止自殺）
- clipboard 內容為空 → `{ ok: true, content: '' }`
- tts.speak 空字串 → `{ ok: false, error: 'INVALID_ARGUMENT' }`

## 資料模型

### 統一回傳格式

```typescript
type OsResult<T> =
  | { ok: true } & T
  | { ok: false, error: ErrorCode, message: string }

type ErrorCode = 'UNSUPPORTED_PLATFORM' | 'PERMISSION_DENIED' | 'COMMAND_FAILED' | 'PARSE_ERROR' | 'INVALID_ARGUMENT'
```

### 儲存

- 截圖輸出：`/tmp/nova-brain-screenshots/screenshot-{type}-{YYYYMMDD}-{HHmmss}-{SSS}.png`
- 無持久化狀態（所有腳本是無狀態純函式）

## 介面契約

### screenshot.js

```javascript
export function captureFullScreen(opts?, _deps?) → OsResult<{ path, type: 'full', timestamp }>
export function captureRegion(region, opts?, _deps?) → OsResult<{ path, type: 'region', timestamp }>
export function captureWindow(windowId, opts?, _deps?) → OsResult<{ path, type: 'window', timestamp }>
export function checkPermission(_deps?) → OsResult<{ hasPermission: boolean }>
```

### window.js

```javascript
export function listProcesses(_deps?) → OsResult<{ processes: {pid, name, visible}[] }>
export function listWindows(appName, _deps?) → OsResult<{ windows: {app, title}[] }>
export function focusApp(appName, _deps?) → OsResult<{}>
export function getFrontApp(_deps?) → OsResult<{ app, window }>
export function checkAccessibility(_deps?) → OsResult<{ hasPermission: boolean }>
```

### process.js

```javascript
export function listProcesses(_deps?) → OsResult<{ processes: {pid, name, cpu, mem, started}[] }>
export function startProcess(command, args?, _deps?) → OsResult<{ pid }>
export function killProcess(pid, signal?, _deps?) → OsResult<{}>
```

### clipboard.js

```javascript
export function readClipboard(_deps?) → OsResult<{ content: string }>
export function writeClipboard(text, _deps?) → OsResult<{}>
```

### system-info.js

```javascript
export function getCpuUsage(_deps?) → OsResult<{ cpu: {user, sys, idle} }>
export function getMemoryInfo(_deps?) → OsResult<{ memory: {totalMB, freeMB, wiredMB, activeMB, inactiveMB} }>
export function getDiskInfo(mountPoint?, _deps?) → OsResult<{ disks: {device, mountPoint, totalGB, usedGB, availableGB, usedPercent}[] }>
export function getNetworkInfo(_deps?) → OsResult<{ interfaces: {name, status, ipv4?, ipv6?}[] }>
```

### tts.js

```javascript
export function speak(text, opts?, _deps?) → OsResult<{}>
// opts: { voice?: string, rate?: number }
export function stop(_deps?) → OsResult<{}>
export function listVoices(_deps?) → OsResult<{ voices: {name, lang}[] }>
```

## 非功能需求

| 維度 | 要求 |
|------|------|
| 效能 | 每個函式 < 500ms（排除截圖大檔案） |
| 安全 | killProcess 拒絕 PID <= 1 和自身 PID |
| 可測試性 | 所有函式最後一個參數 `_deps` 供 DI 測試注入 |

## 依賴

| 方向 | 模組 | 說明 |
|------|------|------|
| 上游 | macOS 原生指令 | screencapture, osascript, ps, pbcopy, pbpaste, say |
| 上游 | os-control skill references | API 規格定義 |
| 下游 | 心跳引擎 spawn 的 session | 消費 OS 能力 |
| 下游 | computer-use.js（R3.4） | 截圖 → 理解 → 操作迴圈 |

## 驗收標準

- [ ] 6 個腳本檔案存在於 `~/.claude/scripts/os/`
- [ ] 所有函式遵循統一回傳格式 `{ ok, error?, message? }`
- [ ] 所有函式有 `_deps` 依賴注入參數
- [ ] 非 macOS 平台回傳 UNSUPPORTED_PLATFORM
- [ ] killProcess 拒絕 PID <= 1 和自身 PID
- [ ] `bun test` 所有 OS 腳本測試通過
- [ ] 截圖輸出到 /tmp/nova-brain-screenshots/

## 風險

| 風險 | 機率 | 影響 | 緩解策略 |
|------|:----:|:----:|---------|
| macOS 權限未授予 | 中 | 中 | checkPermission / checkAccessibility 前置檢查 |
| osascript 輸出格式隨 macOS 版本變化 | 低 | 中 | 解析容錯 + 統一 PARSE_ERROR |
| screencapture 安全視窗黑圖 | 低 | 低 | 已知限制，文件記載 |
