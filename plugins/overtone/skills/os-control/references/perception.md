# 感知層（P3.1）

Overtone 感知層提供 macOS 環境下的截圖擷取與視窗/進程管理能力。
Agent 可以透過這些 API「看見」螢幕狀態、查詢正在運行的應用程式，並將視覺資訊轉化為結構化決策。

---

## API Reference

### screenshot.js — 截圖模組

位置：`plugins/overtone/scripts/os/screenshot.js`

所有函式的最後一個參數 `_deps = { execSync }` 供測試注入使用，正常呼叫時可省略。

#### `captureFullScreen(opts?, _deps?)`

全螢幕截圖。

```javascript
const { captureFullScreen } = require('./plugins/overtone/scripts/os/screenshot');

// 使用預設路徑
const result = captureFullScreen();
// => { ok: true, path: '/tmp/overtone-screenshots/screenshot-full-20260303-221500-123.png', type: 'full', timestamp: '2026-03-03T14:15:00.123Z' }

// 使用自訂路徑
const result2 = captureFullScreen({ outputPath: '/tmp/my-screen.png' });
// => { ok: true, path: '/tmp/my-screen.png', type: 'full', timestamp: '...' }
```

**參數**：
- `opts.outputPath` (string, 選填)：自訂輸出路徑，省略時使用 `/tmp/overtone-screenshots/screenshot-full-YYYYMMDD-HHmmss-SSS.png`

**回傳**：
- 成功：`{ ok: true, path: string, type: 'full', timestamp: string }`
- 失敗：`{ ok: false, error: 'PERMISSION_DENIED'|'UNSUPPORTED_PLATFORM'|'COMMAND_FAILED', message: string }`

---

#### `captureRegion(region, opts?, _deps?)`

擷取指定螢幕區域。

```javascript
const { captureRegion } = require('./plugins/overtone/scripts/os/screenshot');

const result = captureRegion({ x: 100, y: 200, width: 800, height: 600 });
// => { ok: true, path: '...', type: 'region', timestamp: '...' }
```

**參數**：
- `region.x` (number, 必填)：左上角 X 座標（像素）
- `region.y` (number, 必填)：左上角 Y 座標（像素）
- `region.width` (number, 必填)：寬度（像素）
- `region.height` (number, 必填)：高度（像素）
- `opts.outputPath` (string, 選填)：自訂輸出路徑

**回傳**：
- 成功：`{ ok: true, path: string, type: 'region', timestamp: string }`
- 失敗：`{ ok: false, error: 'INVALID_ARGUMENT'|'PERMISSION_DENIED'|'COMMAND_FAILED'|'UNSUPPORTED_PLATFORM', message: string }`

---

#### `captureWindow(windowId, opts?, _deps?)`

擷取指定視窗（依 CGWindowID）。

```javascript
const { captureWindow } = require('./plugins/overtone/scripts/os/screenshot');

const result = captureWindow(12345);
// => { ok: true, path: '...', type: 'window', timestamp: '...' }
```

**參數**：
- `windowId` (number, 必填)：CGWindowID（整數）。可透過 `listWindows()` 後搭配其他工具取得
- `opts.outputPath` (string, 選填)：自訂輸出路徑

**回傳**：
- 成功：`{ ok: true, path: string, type: 'window', timestamp: string }`
- 失敗：`{ ok: false, error: 'INVALID_ARGUMENT'|'PERMISSION_DENIED'|'COMMAND_FAILED'|'UNSUPPORTED_PLATFORM', message: string }`

---

#### `checkPermission(_deps?)`

偵測 Screen Recording 權限狀態。

```javascript
const { checkPermission } = require('./plugins/overtone/scripts/os/screenshot');

const result = checkPermission();
// => { ok: true, hasPermission: true }  // 或 false
```

**回傳**：
- 成功：`{ ok: true, hasPermission: boolean }`
- 失敗：`{ ok: false, error: 'UNSUPPORTED_PLATFORM', message: string }`

> 注意：`checkPermission` 不回傳 `PERMISSION_DENIED` 錯誤 — 它本身就是用來偵測權限的工具。

---

### window.js — 視窗 / 進程管理模組

位置：`plugins/overtone/scripts/os/window.js`

#### `listProcesses(_deps?)`

列出所有正在運行的進程。

```javascript
const { listProcesses } = require('./plugins/overtone/scripts/os/window');

const result = listProcesses();
// => {
//   ok: true,
//   processes: [
//     { pid: 1234, name: 'Safari', visible: true },
//     { pid: 5678, name: 'Finder', visible: false },
//   ]
// }
```

**回傳**：
- 成功：`{ ok: true, processes: Array<{ pid: number, name: string, visible: boolean }> }`
- 失敗：`{ ok: false, error: 'OSASCRIPT_PARSE_ERROR'|'COMMAND_FAILED'|'UNSUPPORTED_PLATFORM', message: string }`

---

#### `listWindows(appName, _deps?)`

列出指定 App 的所有開啟視窗。**需要 Accessibility 權限。**

```javascript
const { listWindows } = require('./plugins/overtone/scripts/os/window');

const result = listWindows('Safari');
// => {
//   ok: true,
//   windows: [
//     { app: 'Safari', title: 'Google - 台灣' },
//     { app: 'Safari', title: 'GitHub' },
//   ]
// }
```

**參數**：
- `appName` (string, 必填)：App 名稱（如 `'Safari'`、`'Terminal'`）

**回傳**：
- 成功：`{ ok: true, windows: Array<{ app: string, title: string }> }`
- 失敗：`{ ok: false, error: 'PERMISSION_DENIED'|'OSASCRIPT_PARSE_ERROR'|'COMMAND_FAILED'|'UNSUPPORTED_PLATFORM', message: string }`

---

#### `focusApp(appName, _deps?)`

將指定 App 帶到前景（activate）。

```javascript
const { focusApp } = require('./plugins/overtone/scripts/os/window');

const result = focusApp('Safari');
// => { ok: true }
```

**參數**：
- `appName` (string, 必填)：App 名稱

**回傳**：
- 成功：`{ ok: true }`
- 失敗：`{ ok: false, error: 'COMMAND_FAILED'|'UNSUPPORTED_PLATFORM', message: string }`

---

#### `getFrontApp(_deps?)`

取得當前前景應用程式名稱和視窗標題。

```javascript
const { getFrontApp } = require('./plugins/overtone/scripts/os/window');

const result = getFrontApp();
// => { ok: true, app: 'Safari', window: '搜尋 - Google' }
// window 可能為 null（App 前景但無開啟視窗）
```

**回傳**：
- 成功：`{ ok: true, app: string, window: string|null }`
- 失敗：`{ ok: false, error: 'OSASCRIPT_PARSE_ERROR'|'COMMAND_FAILED'|'UNSUPPORTED_PLATFORM', message: string }`

---

#### `checkAccessibility(_deps?)`

偵測 Accessibility 權限狀態。

```javascript
const { checkAccessibility } = require('./plugins/overtone/scripts/os/window');

const result = checkAccessibility();
// => { ok: true, hasPermission: true }  // 或 false
```

**回傳**：
- 成功：`{ ok: true, hasPermission: boolean }`
- 失敗：`{ ok: false, error: 'UNSUPPORTED_PLATFORM', message: string }`

---

## 視覺分析結構化模板

Agent 截圖後應使用 `Read` tool 讀取圖片檔案，再依此模板輸出結構化分析：

```json
{
  "screenshot_analysis": {
    "timestamp": "2026-03-03T14:15:00.123Z",
    "resolution": "2560x1600",
    "dominant_colors": ["#1a1a2e", "#ffffff", "#4ade80"],
    "layout": "全螢幕 / 左右分割 / 上下分割 / 浮動視窗",
    "ui_elements": [
      { "type": "button", "label": "確認", "state": "enabled", "position": "右下角" },
      { "type": "input", "placeholder": "搜尋...", "value": "", "position": "頂部中央" },
      { "type": "modal", "title": "警告", "visible": true }
    ],
    "text_content": "頁面上可辨識的文字（標題、錯誤訊息、按鈕標籤等）",
    "application_context": "Chrome / Terminal / VS Code / 其他 App 名稱",
    "status_indicators": [
      { "type": "loading_spinner", "visible": false },
      { "type": "error_badge", "visible": true, "message": "連線失敗" },
      { "type": "progress_bar", "percent": 75 }
    ],
    "anomalies": [
      "右上角有系統通知彈窗未關閉",
      "頁面部分載入失敗（空白區塊）"
    ]
  }
}
```

**使用時機**：
- 執行操作前截圖，確認畫面狀態正確
- 執行操作後截圖，驗證結果符合預期
- 偵測到異常狀態（錯誤訊息、未預期彈窗）時記錄證據

---

## 視窗查詢使用指引

### `listProcesses` vs `listWindows`

| 情境 | 使用哪個 |
|------|---------|
| 確認某 App 是否在運行 | `listProcesses()` — 不需要 Accessibility 權限 |
| 取得某 App 的所有視窗標題 | `listWindows(appName)` — 需要 Accessibility 權限 |
| 取得目前前景 App | `getFrontApp()` — 不需要特殊權限 |
| 確認 Accessibility 權限 | `checkAccessibility()` — 偵測權限狀態 |

### 流程建議

```
1. 先呼叫 checkAccessibility() 確認權限
2. 若有權限 → 使用 listWindows(appName)
3. 若無權限 → 使用 listProcesses() 判斷 App 是否運行
4. 需要視覺確認 → 搭配 captureFullScreen() / captureRegion()
```

---

## Permission 處理模式

### Screen Recording（截圖權限）

```javascript
const { checkPermission, captureFullScreen } = require('./screenshot');

// 先檢查再截圖
const perm = checkPermission();
if (!perm.ok || !perm.hasPermission) {
  // 提示用戶前往 系統設定 > 隱私權 > 螢幕錄製 授予權限
  return { error: 'PERMISSION_DENIED', message: '請在系統設定中授予 Screen Recording 權限' };
}

const result = captureFullScreen();
```

### Accessibility（視窗管理權限）

```javascript
const { checkAccessibility, listWindows } = require('./window');

// 先確認 Accessibility 權限
const acc = checkAccessibility();
if (!acc.ok || !acc.hasPermission) {
  // 提示用戶前往 系統設定 > 隱私權 > 輔助使用 授予終端機/應用程式權限
  return { error: 'PERMISSION_DENIED', message: '請在系統設定中授予 Accessibility 權限' };
}

const windows = listWindows('Safari');
```

---

## 完整工作流範例：截圖 → Read → 分析 → 決策

典型使用場景：監控 Web App 狀態，偵測是否出現錯誤頁面。

```javascript
// 步驟 1：截取全螢幕
const { captureFullScreen } = require('./screenshot');
const shot = captureFullScreen();
if (!shot.ok) {
  console.error(`截圖失敗：${shot.error} — ${shot.message}`);
  process.exit(1);
}

// 步驟 2：Agent 使用 Read tool 讀取截圖
// Read tool 會回傳圖片內容，agent 可視覺理解

// 步驟 3：依據視覺分析模板輸出結構化分析
// {
//   "screenshot_analysis": {
//     "timestamp": "2026-03-03T14:15:00.123Z",
//     "application_context": "Chrome",
//     "anomalies": ["頁面顯示 500 Internal Server Error"],
//     "status_indicators": [{ "type": "error_badge", "visible": true }]
//   }
// }

// 步驟 4：依分析結果決策（發通知、觸發修復流程等）
```

### 視窗操作工作流

```javascript
const { checkAccessibility, listWindows, focusApp } = require('./window');
const { captureRegion } = require('./screenshot');

// 1. 確認權限
const acc = checkAccessibility();
if (!acc.hasPermission) {
  return { error: 'Accessibility 權限未授予' };
}

// 2. 找到目標視窗
const wins = listWindows('Terminal');
if (!wins.ok || wins.windows.length === 0) {
  return { error: 'Terminal 無開啟視窗' };
}

// 3. 聚焦目標 App
focusApp('Terminal');

// 4. 截取視窗區域並分析
const region = captureRegion({ x: 0, y: 0, width: 1200, height: 800 });
// => agent 讀取截圖，確認 Terminal 狀態
```
